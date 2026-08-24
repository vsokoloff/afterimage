import type { AgentTrace, VerificationResult } from '../../types.ts'
import { detectScopeExplosion } from './detect.ts'

/**
 * Recheck: after treatment, the after-trace must not reintroduce scope explosion.
 */
export function verify(before: AgentTrace, after: AgentTrace): VerificationResult {
  const beforeAbnormality = detectScopeExplosion(before)
  const afterAbnormality = detectScopeExplosion(after)

  if (!beforeAbnormality) {
    return {
      passed: afterAbnormality === null,
      evidence: afterAbnormality
        ? `New scope explosion after treatment: files=${afterAbnormality.signal.fileCount}`
        : 'No scope explosion before or after.',
      abnormality: afterAbnormality,
    }
  }

  if (afterAbnormality) {
    return {
      passed: false,
      evidence: `Scope explosion still present: files=${afterAbnormality.signal.fileCount} dirs=${afterAbnormality.signal.topLevelDirs.length}.`,
      abnormality: afterAbnormality,
    }
  }

  return {
    passed: true,
    evidence: 'Recheck clear: change set no longer exceeds scope thresholds.',
    abnormality: null,
  }
}
