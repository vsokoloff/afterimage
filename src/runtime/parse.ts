import { parseRunIncidentPolicy, type RunIncidentPolicy } from './policy.ts'

export type ParsedRunArgv = {
  command: string[]
  policy?: RunIncidentPolicy
  webBaseUrl?: string
}

/**
 * Parse `lucid run [flags] -- <command...>` from process.argv.
 * Expects argv like: [node, cli.js, run, --policy observe, --, ...commandParts]
 */
export function parseRunArgv(argv: string[]): ParsedRunArgv | null {
  if (argv[2] !== 'run') return null
  const dash = argv.indexOf('--')
  if (dash === -1 || dash === argv.length - 1) return null

  const flags = argv.slice(3, dash)
  let policy: RunIncidentPolicy | undefined
  let webBaseUrl: string | undefined

  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index]
    if (flag === '--policy') {
      const value = flags[++index]
      if (!value) return null
      const parsed = parseRunIncidentPolicy(value)
      if (!parsed) return null
      policy = parsed
      continue
    }
    if (flag === '--web-url') {
      const value = flags[++index]
      if (!value) return null
      webBaseUrl = value.replace(/\/$/, '')
      continue
    }
    return null
  }

  const command = argv.slice(dash + 1)
  if (!command.length) return null

  const parsed: ParsedRunArgv = { command }
  if (policy) parsed.policy = policy
  if (webBaseUrl) parsed.webBaseUrl = webBaseUrl
  return parsed
}
