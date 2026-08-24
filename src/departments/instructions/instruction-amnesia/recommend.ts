import type { DiagnosisResult, IncidentContext, TreatmentPlan } from '../../types.ts'

export function recommendFix(
  diagnosis: DiagnosisResult,
  context: IncidentContext = {},
): TreatmentPlan | null {
  if (diagnosis.status !== 'critical') return null

  const treatment = context.treatment
  if (!treatment) {
    const detail =
      diagnosis.abnormality?.kind === 'instruction-amnesia'
        ? diagnosis.abnormality.signal.constraintText
        : 'the forgotten constraint'

    return {
      target: 'Agent instructions',
      recommendedChange: `Re-assert and prioritize: ${detail}.`,
      currentBehavior: 'Agent acted against a previously established instruction.',
      recommendedInstruction: `Always obey: ${detail}. If a later request conflicts, report the conflict instead of violating it.`,
      why: 'Deterministic evidence shows a later action contradicted a stored or stated constraint.',
      applied: false,
      summaryChange: 'Re-assert the forgotten instruction with higher priority.',
      requiresReview: true,
      safeToAutoApply: false,
    }
  }

  return {
    ...treatment,
    requiresReview: !treatment.applied,
    safeToAutoApply: false,
  }
}
