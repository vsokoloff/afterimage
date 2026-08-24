export type ParsedOtelArgv = {
  host: string
  port: number
  groupBy: 'trace' | 'conversation'
  idleFinishMs: number
}

/**
 * Parse `lucid otel [--host H] [--port N] [--group-by trace|conversation] [--idle-ms N]`.
 */
export function parseOtelArgv(argv: string[]): ParsedOtelArgv | null {
  // argv: node cli.js otel ...
  const args = argv.slice(3)
  let host = process.env.LUCID_OTEL_HOST ?? '127.0.0.1'
  let port = Number.parseInt(process.env.LUCID_OTEL_PORT ?? '4318', 10)
  let groupBy: 'trace' | 'conversation' = 'trace'
  let idleFinishMs = Number.parseInt(process.env.LUCID_OTEL_IDLE_MS ?? '30000', 10)

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--host' && args[i + 1]) {
      host = args[++i]!
      continue
    }
    if (arg === '--port' && args[i + 1]) {
      port = Number.parseInt(args[++i]!, 10)
      continue
    }
    if (arg === '--group-by' && args[i + 1]) {
      const value = args[++i]!
      if (value !== 'trace' && value !== 'conversation') return null
      groupBy = value
      continue
    }
    if (arg === '--idle-ms' && args[i + 1]) {
      idleFinishMs = Number.parseInt(args[++i]!, 10)
      continue
    }
    if (arg === '--help' || arg === '-h') return null
    if (arg?.startsWith('-')) return null
  }

  if (!Number.isFinite(port) || port <= 0) return null
  if (!Number.isFinite(idleFinishMs) || idleFinishMs < 0) return null

  return { host, port, groupBy, idleFinishMs }
}
