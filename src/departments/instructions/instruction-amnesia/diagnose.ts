import type {
  AgentTrace,
  DiagnosisResult,
  IncidentContext,
  InstructionAmnesiaAbnormality,
} from '../../types.ts'
import { detectInstructionAmnesia, formatInstructionAmnesiaEvidence } from './detect.ts'

const DISEASE = 'instruction-amnesia'
const DEPARTMENT = 'instructions'

function evidenceFor(abnormality: InstructionAmnesiaAbnormality | null): string {
  if (!abnormality) return 'No established instruction was contradicted.'
  return formatInstructionAmnesiaEvidence(abnormality.signal)
}

export function diagnose(
  trace: AgentTrace,
  context: IncidentContext = {},
): DiagnosisResult {
  const abnormality = detectInstructionAmnesia(trace)
  return {
    department: DEPARTMENT,
    disease: DISEASE,
    status: abnormality ? 'critical' : 'clear',
    abnormality,
    evidence: evidenceFor(abnormality),
    symptom: abnormality
      ? (context.symptom ?? `Instruction amnesia: ${abnormality.signal.constraintText}`)
      : 'No instruction amnesia detected',
    // Optional LLM interpretation can be layered later; keep rootCause from context only.
    rootCause: abnormality ? (context.rootCause ?? null) : null,
  }
}
