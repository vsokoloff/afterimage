import { createHash } from 'node:crypto'

import type { FileWriteEvent } from '../../../events.ts'
import {
  successfulFileWriteEvents,
} from '../../../events.ts'
import type { LoopSignal } from '../../../types.ts'
import type { AgentTrace, RepeatedFileStateAbnormality } from '../../types.ts'

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function shortHash(content: string): string {
  return hashContent(content).slice(0, 6)
}

/** Short prefix of a stored SHA-256 hex digest (for display). */
export function shortDigest(hash: string): string {
  return hash.slice(0, 6)
}

/**
 * Collect successful file_write events from an AgentRun / AgentEvent trace.
 * Ignores prompts, tool calls, failed writes (`ok: false`), and other event types.
 */
export function fileWritesFromTrace(trace: AgentTrace): FileWriteEvent[] {
  if (trace.run) return successfulFileWriteEvents(trace.run.events)
  if (trace.events) return successfulFileWriteEvents(trace.events)
  return []
}

/**
 * Deterministic evidence string for a repeated-file-state signal.
 * Stable across machines — no locale, no LLM.
 */
export function formatRepeatedFileStateEvidence(signal: LoopSignal): string {
  return [
    'repeated-file-state',
    `file=${signal.file}`,
    `hash=${signal.hash}`,
    `firstSeenEvent=${signal.firstSeenEventId}@seq=${signal.firstSeenTurn}`,
    `repeatedEvent=${signal.repeatedEventId}@seq=${signal.repeatedAtTurn}`,
  ].join(' ')
}

/**
 * Detect A→B→A on successful file_write events only.
 * Hashes are tracked per path; the same hash in different files is not a loop.
 * Returns the earliest sequence where a file returns to a prior content hash.
 */
export function detectLoopFromFileWrites(writes: FileWriteEvent[]): LoopSignal | null {
  const ordered = successfulFileWriteEvents(writes)
  /** path → (hash → first-seen event) */
  const seenByFile = new Map<string, Map<string, FileWriteEvent>>()

  for (const write of ordered) {
    let seen = seenByFile.get(write.path)
    if (!seen) {
      seen = new Map()
      seenByFile.set(write.path, seen)
    }

    const first = seen.get(write.hash)
    if (first) {
      return {
        detected: true,
        file: write.path,
        hash: write.hash,
        firstSeenTurn: first.sequence,
        repeatedAtTurn: write.sequence,
        firstSeenEventId: first.id,
        repeatedEventId: write.id,
      }
    }

    seen.set(write.hash, write)
  }

  return null
}

export function detectRepeatedFileState(trace: AgentTrace): RepeatedFileStateAbnormality | null {
  const signal = detectLoopFromFileWrites(fileWritesFromTrace(trace))
  if (!signal) return null
  return { kind: 'repeated-file-state', signal }
}
