import type { DiagnosisResult, IncidentContext, TreatmentPlan } from '../../types.ts'

export function recommendFix(
  diagnosis: DiagnosisResult,
  context: IncidentContext = {},
): TreatmentPlan | null {
  if (diagnosis.status !== 'critical') return null

  const treatment = context.treatment
  if (!treatment) {
    const detail =
      diagnosis.abnormality?.kind === 'redundant-rewrite'
        ? `Reuse ${diagnosis.abnormality.signal.firstPath} instead of rewriting ${diagnosis.abnormality.signal.duplicatePath}.`
        : 'Reuse the existing module instead of rewriting it.'

    return {
      target: 'Agent instructions / reuse policy',
      recommendedChange: detail,
      currentBehavior: 'Agent created code that already exists elsewhere.',
      recommendedInstruction:
        'Before writing a new file, search for an existing module with the same behavior and import or share it.',
      why: 'Exact or structural duplication wastes tokens and creates drift.',
      applied: false,
      summaryChange: 'Prefer reuse over duplicate rewrites.',
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
