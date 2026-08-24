import { createHash } from 'node:crypto'

import type { FileWriteEvent } from '../../../events.ts'
import { fileWriteHashInput, successfulFileWriteEvents } from '../../../events.ts'
import type {
  AgentTrace,
  RedundantRewriteAbnormality,
  RedundantRewriteSignal,
} from '../../types.ts'
import { resolveTraceEvents } from '../../types.ts'

export function normalizeWhitespace(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
}

export function structuralHash(content: string): string {
  return createHash('sha256').update(normalizeWhitespace(content)).digest('hex')
}

export function formatRedundantRewriteEvidence(signal: RedundantRewriteSignal): string {
  return [
    'redundant-rewrite',
    `match=${signal.matchKind}`,
    `hash=${signal.hash}`,
    `first=${signal.firstPath}@${signal.firstEventId}@seq=${signal.firstSequence}`,
    `duplicate=${signal.duplicatePath}@${signal.duplicateEventId}@seq=${signal.duplicateSequence}`,
  ].join(' ')
}

type HashSighting = {
  path: string
  eventId: string
  sequence: number
  hash: string
}

/**
 * Detect when an agent writes content that already exists at a different path.
 * Exact hash first; structural (whitespace-normalized) only when content is retained.
 * Same-path A→B→A is repeated-file-state, not this disease.
 */
export function detectRedundantRewriteFromWrites(
  writes: FileWriteEvent[],
): RedundantRewriteSignal | null {
  const ordered = successfulFileWriteEvents(writes)
  const exactByHash = new Map<string, HashSighting>()
  const structuralByHash = new Map<string, HashSighting>()

  for (const write of ordered) {
    const path = write.path.replace(/\\/g, '/')

    const priorExact = exactByHash.get(write.hash)
    if (priorExact && priorExact.path !== path) {
      return {
        matchKind: 'exact',
        hash: write.hash,
        firstPath: priorExact.path,
        firstEventId: priorExact.eventId,
        firstSequence: priorExact.sequence,
        duplicatePath: path,
        duplicateEventId: write.id,
        duplicateSequence: write.sequence,
      }
    }

    if (!exactByHash.has(write.hash)) {
      exactByHash.set(write.hash, {
        path,
        eventId: write.id,
        sequence: write.sequence,
        hash: write.hash,
      })
    }

    const body = fileWriteHashInput(write)
    if (body !== undefined) {
      const structHash = structuralHash(body)
      const priorStruct = structuralByHash.get(structHash)
      if (priorStruct && priorStruct.path !== path && priorStruct.hash !== write.hash) {
        // Structural-only match (exact already handled above when hashes equal).
        return {
          matchKind: 'structural',
          hash: structHash,
          firstPath: priorStruct.path,
          firstEventId: priorStruct.eventId,
          firstSequence: priorStruct.sequence,
          duplicatePath: path,
          duplicateEventId: write.id,
          duplicateSequence: write.sequence,
        }
      }
      if (!structuralByHash.has(structHash)) {
        structuralByHash.set(structHash, {
          path,
          eventId: write.id,
          sequence: write.sequence,
          hash: write.hash,
        })
      }
    }
  }

  return null
}

export function detectRedundantRewrite(
  trace: AgentTrace,
): RedundantRewriteAbnormality | null {
  const writes = successfulFileWriteEvents(resolveTraceEvents(trace))
  const signal = detectRedundantRewriteFromWrites(writes)
  if (!signal) return null
  return { kind: 'redundant-rewrite', signal }
}
