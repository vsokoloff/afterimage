import type { AgentTrace, VerificationResult } from '../../types.ts'
import { detectPriorFixRegressed } from './detect.ts'

export function verify(before: AgentTrace, after: AgentTrace): VerificationResult {
  const beforeAbnormality = detectPriorFixRegressed(before)
  const afterAbnormality = detectPriorFixRegressed(after)

  if (!beforeAbnormality) {
    return {
      passed: afterAbnormality === null,
      evidence: afterAbnormality
        ? `New regression after treatment: ${afterAbnormality.signal.testName}`
        : 'No prior-fix regression before or after.',
      abnormality: afterAbnormality,
    }
  }

  if (afterAbnormality) {
    return {
      passed: false,
      evidence: `Regression still present: ${afterAbnormality.signal.testName}.`,
      abnormality: afterAbnormality,
    }
  }

  return {
    passed: true,
    evidence: 'Recheck clear: no previously passing test later failed.',
    abnormality: null,
  }
}
