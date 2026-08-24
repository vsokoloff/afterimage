import type {
  AgentTrace,
  DiagnosisResult,
  IncidentContext,
  RedundantRewriteAbnormality,
} from '../../types.ts'
import { detectRedundantRewrite, formatRedundantRewriteEvidence } from './detect.ts'

const DISEASE = 'redundant-rewrite'
const DEPARTMENT = 'cost'

function evidenceFor(abnormality: RedundantRewriteAbnormality | null): string {
  if (!abnormality) return 'No cross-file duplicate rewrite detected.'
  return formatRedundantRewriteEvidence(abnormality.signal)
}

export function diagnose(
  trace: AgentTrace,
  context: IncidentContext = {},
): DiagnosisResult {
  const abnormality = detectRedundantRewrite(trace)
  return {
    department: DEPARTMENT,
    disease: DISEASE,
    status: abnormality ? 'critical' : 'clear',
    abnormality,
    evidence: evidenceFor(abnormality),
    symptom: abnormality
      ? (context.symptom ??
        `Redundant rewrite: ${abnormality.signal.duplicatePath} duplicates ${abnormality.signal.firstPath}`)
      : 'No redundant rewrite detected',
    rootCause: abnormality ? (context.rootCause ?? null) : null,
  }
}
