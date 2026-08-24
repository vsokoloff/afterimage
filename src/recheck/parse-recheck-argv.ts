/** Parse `lucid recheck <incident-id>`. */
export type ParsedRecheckArgv = {
  incidentId: string
}

export function parseRecheckArgv(argv: string[]): ParsedRecheckArgv | null {
  if (argv[2] !== 'recheck') return null
  const incidentId = argv[3]
  if (!incidentId || incidentId.startsWith('-')) return null
  if (argv.length > 4) return null
  return { incidentId }
}
