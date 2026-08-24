import type { AgentTrace, VerificationResult } from '../../types.ts'
import { detectRedundantRewrite } from './detect.ts'

export function verify(before: AgentTrace, after: AgentTrace): VerificationResult {
  const beforeAbnormality = detectRedundantRewrite(before)
  const afterAbnormality = detectRedundantRewrite(after)

  if (!beforeAbnormality) {
    return {
      passed: afterAbnormality === null,
      evidence: afterAbnormality
        ? `New redundant rewrite after treatment: ${afterAbnormality.signal.duplicatePath}`
        : 'No redundant rewrite before or after.',
      abnormality: afterAbnormality,
    }
  }

  if (afterAbnormality) {
    return {
      passed: false,
      evidence: `Redundant rewrite still present: ${afterAbnormality.signal.duplicatePath}.`,
      abnormality: afterAbnormality,
    }
  }

  return {
    passed: true,
    evidence: 'Recheck clear: no cross-file duplicate rewrite detected.',
    abnormality: null,
  }
}
