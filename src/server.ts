import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { fetchIncident, fetchIncidents, fetchRun, fetchRuns } from './api.ts'
import { openStore, type LucidStore } from './store.ts'
import { buildVisit } from './visit.ts'

const staticFiles = new Map([
  ['/', { file: resolve(process.cwd(), 'web/index.html'), type: 'text/html; charset=utf-8' }],
  ['/styles.css', { file: resolve(process.cwd(), 'web/styles.css'), type: 'text/css; charset=utf-8' }],
  ['/app.js', { file: resolve(process.cwd(), 'web/app.js'), type: 'text/javascript; charset=utf-8' }],
])

export type ServerContext = {
  store: LucidStore
}

export type StartServerOptions = {
  port?: number
  host?: string
  /** Override `.lucid` location (tests). */
  storeRoot?: string
  projectRoot?: string
  /** Pre-opened store; overrides storeRoot/projectRoot. */
  store?: LucidStore
}

function sendJson(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  })
  response.end(payload)
}

async function sendFile(response: ServerResponse, route: string): Promise<boolean> {
  const asset = staticFiles.get(route)
  if (!asset) return false
  const contents = await readFile(asset.file)
  response.writeHead(200, {
    'Content-Type': asset.type,
    'Content-Length': contents.byteLength,
  })
  response.end(contents)
  return true
}

function methodNotAllowed(response: ServerResponse): void {
  response.setHeader('Allow', 'GET')
  sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET.' } })
}

function notFound(response: ServerResponse, message = 'Not found.'): void {
  sendJson(response, 404, { error: { code: 'NOT_FOUND', message } })
}

export async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: ServerContext,
): Promise<void> {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')

  const url = new URL(request.url ?? '/', 'http://localhost')

  try {
    if (request.method !== 'GET') {
      methodNotAllowed(response)
      return
    }

    if (url.pathname === '/api/runs') {
      sendJson(response, 200, await fetchRuns(context.store))
      return
    }

    const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/)
    if (runMatch) {
      const detail = await fetchRun(context.store, decodeURIComponent(runMatch[1]!))
      if (!detail) {
        notFound(response, `Run not found: ${runMatch[1]}`)
        return
      }
      sendJson(response, 200, detail)
      return
    }

    if (url.pathname === '/api/incidents') {
      sendJson(response, 200, await fetchIncidents(context.store))
      return
    }

    const incidentMatch = url.pathname.match(/^\/api\/incidents\/([^/]+)$/)
    if (incidentMatch) {
      const detail = await fetchIncident(context.store, decodeURIComponent(incidentMatch[1]!))
      if (!detail) {
        notFound(response, `Incident not found: ${incidentMatch[1]}`)
        return
      }
      sendJson(response, 200, detail)
      return
    }

    if (url.pathname === '/api/visit') {
      sendJson(response, 200, buildVisit(), {
        Deprecation: 'true',
        Warning: '299 - "/api/visit" is deprecated. Use /api/incidents and /api/runs.',
        Link: '</api/incidents>; rel="successor-version"',
      })
      return
    }

    if (await sendFile(response, url.pathname)) return

    notFound(response)
  } catch (error) {
    console.error(error)
    sendJson(response, 500, { error: { code: 'SERVER_ERROR', message: 'Request failed.' } })
  }
}

export function createServerInstance(context: ServerContext) {
  return createServer((request, response) => {
    void handleRequest(request, response, context)
  })
}

export async function startServer(
  options: StartServerOptions = {},
): Promise<{ url: string; server: Server; store: LucidStore }> {
  const store =
    options.store ??
    (await openStore({
      storeRoot: options.storeRoot,
      projectRoot: options.projectRoot,
    }))
  const context: ServerContext = { store }

  const requested = options.port ?? Number.parseInt(process.env.PORT ?? '3000', 10)
  const host = options.host ?? '127.0.0.1'
  const server = createServerInstance(context)

  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => {
      server.off('listening', ok)
      reject(error)
    }
    const ok = () => {
      server.off('error', fail)
      resolve()
    }
    server.once('error', fail)
    server.listen(requested, host, ok)
  })

  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('Server did not bind a TCP port.')
  }

  return { url: `http://${host}:${address.port}`, server, store }
}

function isDirectRun(): boolean {
  return process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
}

if (isDirectRun()) {
  const { url } = await startServer()
  console.log(`Lucid: ${url}`)
}
