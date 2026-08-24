import type { Abnormality, AgentTrace, DiagnosisResult, IncidentContext } from '../../types.ts'
import {
  detectRepeatedFileState,
  formatRepeatedFileStateEvidence,
} from './detect.ts'

const DISEASE = 'repeated-file-state'
const DEPARTMENT = 'looping'

function evidenceFor(abnormality: Abnormality | null): string {
  if (!abnormality) return 'No file returned to a previous content hash.'
  return formatRepeatedFileStateEvidence(abnormality.signal)
}

export function diagnose(
  trace: AgentTrace,
  context: IncidentContext = {},
): DiagnosisResult {
  const abnormality = detectRepeatedFileState(trace)
  return {
    department: DEPARTMENT,
    disease: DISEASE,
    status: abnormality ? 'critical' : 'clear',
    abnormality,
    evidence: evidenceFor(abnormality),
    symptom: abnormality
      ? (context.symptom ?? 'Repeated file-state loop')
      : 'No loop detected',
    rootCause: abnormality ? (context.rootCause ?? null) : null,
  }
}
