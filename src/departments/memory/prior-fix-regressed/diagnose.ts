import type {
  AgentTrace,
  DiagnosisResult,
  IncidentContext,
  PriorFixRegressedAbnormality,
} from '../../types.ts'
import { detectPriorFixRegressed, formatPriorFixRegressedEvidence } from './detect.ts'

const DISEASE = 'prior-fix-regressed'
const DEPARTMENT = 'memory'

function evidenceFor(abnormality: PriorFixRegressedAbnormality | null): string {
  if (!abnormality) return 'No previously passing test later failed in this run.'
  return formatPriorFixRegressedEvidence(abnormality.signal)
}

export function diagnose(
  trace: AgentTrace,
  context: IncidentContext = {},
): DiagnosisResult {
  const abnormality = detectPriorFixRegressed(trace)
  return {
    department: DEPARTMENT,
    disease: DISEASE,
    status: abnormality ? 'critical' : 'clear',
    abnormality,
    evidence: evidenceFor(abnormality),
    symptom: abnormality
      ? (context.symptom ?? `Prior fix regressed: ${abnormality.signal.testName}`)
      : 'No prior-fix regression detected',
    rootCause: abnormality ? (context.rootCause ?? null) : null,
  }
}
