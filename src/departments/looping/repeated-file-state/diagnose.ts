import type { Abnormality, AgentTrace, DiagnosisResult, IncidentContext } from '../../types.ts'
import { detectRepeatedFileState } from './detect.ts'

const DISEASE = 'repeated-file-state'
const DEPARTMENT = 'looping'

function evidenceFor(abnormality: Abnormality | null): string {
  if (!abnormality) return 'No file returned to a previous state.'
  const { signal } = abnormality
  return `${signal.file} at Turn ${signal.repeatedAtTurn} exactly matches Turn ${signal.firstSeenTurn}.`
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
