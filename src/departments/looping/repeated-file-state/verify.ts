import type { AgentTrace, VerificationResult } from '../../types.ts'
import { detectRepeatedFileState } from './detect.ts'

/**
 * Recheck: after treatment, the after-trace must not reintroduce the abnormality.
 */
export function verify(before: AgentTrace, after: AgentTrace): VerificationResult {
  const beforeAbnormality = detectRepeatedFileState(before)
  const afterAbnormality = detectRepeatedFileState(after)

  if (!beforeAbnormality) {
    return {
      passed: afterAbnormality === null,
      evidence: afterAbnormality
        ? `New loop appeared after treatment: ${afterAbnormality.signal.file}`
        : 'No loop before or after.',
      abnormality: afterAbnormality,
    }
  }

  if (afterAbnormality) {
    const { signal } = afterAbnormality
    return {
      passed: false,
      evidence: `Loop still present: ${signal.file} turn ${signal.firstSeenTurn} ↔ turn ${signal.repeatedAtTurn}.`,
      abnormality: afterAbnormality,
    }
  }

  return {
    passed: true,
    evidence: 'Recheck clear: no file returned to a previous state after treatment.',
    abnormality: null,
  }
}
