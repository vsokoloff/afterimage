import type { AgentRun } from '../events.ts'

export type ReproductionSpec = {
  command: string[]
  cwd: string
}

/** Read reproduction argv from the linked run's process_start event, when present. */
export function extractReproductionFromRun(run: AgentRun | null): ReproductionSpec | null {
  if (!run) return null

  const start = run.events.find((event) => event.type === 'process_start')
  if (!start || start.type !== 'process_start') return null
  if (!start.command.length) return null

  return {
    command: start.command,
    cwd: start.cwd,
  }
}
