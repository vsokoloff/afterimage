import http from 'node:http'

import type { LucidObserver } from '../../observer.ts'
import type { LucidStore } from '../../store.ts'
import { createObserver } from '../../observer.ts'
import { decodeOtlpJsonTraceRequest } from './decode.ts'
import { otlpRequestToRecordableEvents } from './normalize.ts'

export type OtelGroupBy = 'trace' | 'conversation'

export type OtlpHttpServerOptions = {
  store: LucidStore
  host?: string
  port?: number
  /** Default: group spans by OTEL trace id into one afterimage run. */
  groupBy?: OtelGroupBy
  /** Finish a run after this many ms with no new spans (default 30_000). */
  idleFinishMs?: number
  createObserver?: (store: LucidStore) => LucidObserver
  onListen?: (info: { host: string; port: number; url: string }) => void
}

export type OtlpHttpServer = {
  host: string
  port: number
  url: string
  close: () => Promise<void>
}

type ActiveIngest = {
  key: string
  observer: LucidObserver
  runId: string
  idleTimer: ReturnType<typeof setTimeout> | null
  hadError: boolean
}

function correlationKey(
  groupBy: OtelGroupBy,
  traceId: string | undefined,
  conversationId: string | undefined,
): string {
  if (groupBy === 'conversation' && conversationId) {
    return `conversation:${conversationId}`
  }
  return `trace:${traceId || 'unknown'}`
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Local OTLP/HTTP traces receiver (JSON). Listens on 127.0.0.1:4318 by default.
 * Protobuf and gRPC are out of scope for v1 — forward via a Collector if needed.
 */
export async function startOtlpHttpServer(
  options: OtlpHttpServerOptions,
): Promise<OtlpHttpServer> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 4318
  const groupBy = options.groupBy ?? 'trace'
  const idleFinishMs = options.idleFinishMs ?? 30_000
  const makeObserver = options.createObserver ?? ((store) => createObserver({ store }))

  const active = new Map<string, ActiveIngest>()

  const finishIngest = async (ingest: ActiveIngest, status: 'completed' | 'failed') => {
    if (ingest.idleTimer) clearTimeout(ingest.idleTimer)
    active.delete(ingest.key)
    if (ingest.observer.run) {
      await ingest.observer.finishRun(status)
    }
  }

  const bumpIdle = (ingest: ActiveIngest) => {
    if (ingest.idleTimer) clearTimeout(ingest.idleTimer)
    ingest.idleTimer = setTimeout(() => {
      void finishIngest(ingest, ingest.hadError ? 'failed' : 'completed')
    }, idleFinishMs)
    ingest.idleTimer.unref?.()
  }

  const ingestRequest = async (body: unknown): Promise<{ events: number; runs: number }> => {
    const decoded = decodeOtlpJsonTraceRequest(body)
    const normalized = otlpRequestToRecordableEvents(decoded)
    if (normalized.events.length === 0 && !normalized.traceId) {
      return { events: 0, runs: 0 }
    }

    const key = correlationKey(groupBy, normalized.traceId, normalized.conversationId)
    let ingest = active.get(key)
    if (!ingest) {
      const observer = makeObserver(options.store)
      const run = await observer.startRun({
        agentId: normalized.agentId,
        status: 'running',
      })
      ingest = {
        key,
        observer,
        runId: run.id,
        idleTimer: null,
        hadError: false,
      }
      active.set(key, ingest)
    } else if (normalized.agentId && !ingest.observer.run?.agentId) {
      // agent id discovered mid-stream — store update happens on finish; keep on run via events
    }

    ingest.hadError = ingest.hadError || normalized.hadError

    let recorded = 0
    for (const event of normalized.events) {
      // Preserve provisional ids so causal.causedByEventIds resolve within the run.
      await ingest.observer.record(event)
      recorded += 1
    }

    if (normalized.rootAgentSpanEnded) {
      await finishIngest(ingest, ingest.hadError ? 'failed' : 'completed')
    } else {
      bumpIdle(ingest)
    }

    return { events: recorded, runs: 1 }
  }

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://${host}:${port}`)

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, service: 'lucid-otlp', activeRuns: active.size }))
        return
      }

      if (req.method === 'POST' && url.pathname === '/v1/traces') {
        try {
          const raw = await readBody(req)
          const contentType = String(req.headers['content-type'] ?? '')
          if (contentType.includes('protobuf') || contentType.includes('proto')) {
            res.writeHead(415, { 'content-type': 'application/json' })
            res.end(
              JSON.stringify({
                error:
                  'OTLP protobuf not supported in v1; use application/json or a Collector to convert',
              }),
            )
            return
          }

          let body: unknown = {}
          if (raw.length > 0) {
            body = JSON.parse(raw.toString('utf8')) as unknown
          }

          const result = await ingestRequest(body)
          res.writeHead(200, { 'content-type': 'application/json' })
          // OTLP ExportTraceServiceResponse is empty object for success
          res.end(JSON.stringify({ partialSuccess: {}, lucid: result }))
        } catch (error) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          )
        }
        return
      }

      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
    })()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  const boundPort =
    address && typeof address === 'object' ? address.port : port
  const url = `http://${host}:${boundPort}`
  options.onListen?.({ host, port: boundPort, url })

  return {
    host,
    port: boundPort,
    url,
    close: async () => {
      for (const ingest of [...active.values()]) {
        await finishIngest(ingest, ingest.hadError ? 'failed' : 'completed')
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}
