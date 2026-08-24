import { randomUUID } from 'node:crypto'

/** Stable unique ID for runs, events, and incidents. */
export function newId(prefix?: string): string {
  const id = randomUUID()
  return prefix ? `${prefix}_${id}` : id
}
