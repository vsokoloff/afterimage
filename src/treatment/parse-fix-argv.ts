/** Parse `lucid fix <incident-id> [--apply] [--yes] [--rollback]`. */
export type ParsedFixArgv = {
  incidentId: string
  apply: boolean
  yes: boolean
  rollback: boolean
}

export function parseFixArgv(argv: string[]): ParsedFixArgv | null {
  if (argv[2] !== 'fix') return null
  const incidentId = argv[3]
  if (!incidentId || incidentId.startsWith('-')) return null

  let apply = false
  let yes = false
  let rollback = false

  for (const flag of argv.slice(4)) {
    if (flag === '--apply') apply = true
    else if (flag === '--yes') yes = true
    else if (flag === '--rollback') rollback = true
    else return null
  }

  return { incidentId, apply, yes, rollback }
}
