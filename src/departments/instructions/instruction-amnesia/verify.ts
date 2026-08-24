import type { AgentTrace, VerificationResult } from '../../types.ts'
import { detectInstructionAmnesia } from './detect.ts'

export function verify(before: AgentTrace, after: AgentTrace): VerificationResult {
  const beforeAbnormality = detectInstructionAmnesia(before)
  const afterAbnormality = detectInstructionAmnesia(after)

  if (!beforeAbnormality) {
    return {
      passed: afterAbnormality === null,
      evidence: afterAbnormality
        ? `New instruction violation after treatment: ${afterAbnormality.signal.constraintText}`
        : 'No instruction amnesia before or after.',
      abnormality: afterAbnormality,
    }
  }

  if (afterAbnormality) {
    return {
      passed: false,
      evidence: `Instruction still violated: ${afterAbnormality.signal.constraintText}.`,
      abnormality: afterAbnormality,
    }
  }

  return {
    passed: true,
    evidence: 'Recheck clear: no established instruction was contradicted.',
    abnormality: null,
  }
}
