import type {
  AgentTrace,
  DiagnosisResult,
  IncidentContext,
  ScopeExplosionAbnormality,
} from '../../types.ts'
import { detectScopeExplosion, formatScopeExplosionEvidence } from './detect.ts'

const DISEASE = 'scope-explosion'
const DEPARTMENT = 'scope'

function evidenceFor(abnormality: ScopeExplosionAbnormality | null): string {
  if (!abnormality) return 'Change set stayed within expected scope.'
  return formatScopeExplosionEvidence(abnormality.signal)
}

export function diagnose(
  trace: AgentTrace,
  context: IncidentContext = {},
): DiagnosisResult {
  const abnormality = detectScopeExplosion(trace)
  return {
    department: DEPARTMENT,
    disease: DISEASE,
    status: abnormality ? 'critical' : 'clear',
    abnormality,
    evidence: evidenceFor(abnormality),
    symptom: abnormality
      ? (context.symptom ?? 'Scope explosion — changes spanned far beyond the task')
      : 'No scope explosion detected',
    rootCause: abnormality ? (context.rootCause ?? null) : null,
  }
}
