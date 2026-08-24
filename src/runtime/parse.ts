/**
 * Parse `lucid run -- <command...>` from process.argv.
 * Expects argv like: [node, cli.js, run, --, ...commandParts]
 */
export function parseRunArgv(argv: string[]): { command: string[] } | null {
  if (argv[2] !== 'run') return null
  const dash = argv.indexOf('--')
  if (dash === -1 || dash === argv.length - 1) return null
  const command = argv.slice(dash + 1)
  if (!command.length) return null
  return { command }
}
