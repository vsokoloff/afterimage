import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { buildVisit } from './visit.ts'

const staticFiles = new Map([
  ['/', { file: resolve(process.cwd(), 'web/index.html'), type: 'text/html; charset=utf-8' }],
  ['/styles.css', { file: resolve(process.cwd(), 'web/styles.css'), type: 'text/css; charset=utf-8' }],
  ['/app.js', { file: resolve(process.cwd(), 'web/app.js'), type: 'text/javascript; charset=utf-8' }],
])

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
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

export async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')

  const url = new URL(request.url ?? '/', 'http://localhost')

  try {
    if (url.pathname === '/api/visit') {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET')
        sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET.' } })
        return
      }
      sendJson(response, 200, buildVisit())
      return
    }

    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET')
      sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET.' } })
      return
    }

    if (await sendFile(response, url.pathname)) return

    sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Not found.' } })
  } catch (error) {
    console.error(error)
    sendJson(response, 500, { error: { code: 'SERVER_ERROR', message: 'Visit could not load.' } })
  }
}

export function createServerInstance() {
  return createServer((request, response) => {
    void handleRequest(request, response)
  })
}

export async function startServer(
  options: { port?: number; host?: string } = {},
): Promise<{ url: string; server: Server }> {
  const requested = options.port ?? Number.parseInt(process.env.PORT ?? '3000', 10)
  const host = options.host ?? '127.0.0.1'
  const server = createServerInstance()

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

  return { url: `http://${host}:${address.port}`, server }
}

function isDirectRun(): boolean {
  return process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
}

if (isDirectRun()) {
  const { url } = await startServer()
  console.log(`Afterimage medical record: ${url}`)
}
