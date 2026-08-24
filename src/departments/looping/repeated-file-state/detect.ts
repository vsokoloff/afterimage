import { createHash } from 'node:crypto'

import type { FileEdit, LoopSignal } from '../../../types.ts'
import type { Abnormality, AgentTrace } from '../../types.ts'

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function shortHash(content: string): string {
  return hashContent(content).slice(0, 6)
}

/**
 * First time one file returns to a complete content state it already had.
 */
export function detectLoop(edits: FileEdit[]): LoopSignal | null {
  const seenByFile = new Map<string, Map<string, number>>()
  const ordered = [...edits].sort((left, right) => left.turn - right.turn)

  for (const edit of ordered) {
    const hash = hashContent(edit.content)
    let seen = seenByFile.get(edit.file)
    if (!seen) {
      seen = new Map()
      seenByFile.set(edit.file, seen)
    }

    const firstSeenTurn = seen.get(hash)
    if (firstSeenTurn !== undefined) {
      return {
        detected: true,
        file: edit.file,
        firstSeenTurn,
        repeatedAtTurn: edit.turn,
        hash,
      }
    }

    seen.set(hash, edit.turn)
  }

  return null
}

export function detectRepeatedFileState(trace: AgentTrace): Abnormality | null {
  const signal = detectLoop(trace.edits)
  if (!signal) return null
  return { kind: 'repeated-file-state', signal }
}
