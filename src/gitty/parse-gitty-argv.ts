/** Parse `lucid gitty push [--message <msg>] [--dry-run]`. */
export type ParsedGittyArgv =
  | { action: 'push'; message: string | null; dryRun: boolean }
  | { action: 'help' }

export function parseGittyArgv(argv: string[]): ParsedGittyArgv | null {
  if (argv[2] !== 'gitty') return null
  const sub = argv[3]
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
    return { action: 'help' }
  }
  if (sub !== 'push') return null

  let message: string | null = null
  let dryRun = false
  const rest = argv.slice(4)
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]
    if (flag === '--dry-run') {
      dryRun = true
      continue
    }
    if (flag === '--message' || flag === '-m') {
      const next = rest[i + 1]
      if (!next || next.startsWith('-')) return null
      message = next
      i++
      continue
    }
    return null
  }

  return { action: 'push', message, dryRun }
}
