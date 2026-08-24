import type { DiagnosisResult, IncidentContext, TreatmentPlan } from '../../types.ts'

/**
 * Prescribe the treatment associated with the diagnosis.
 * For the Auth Writer fixture, that is an instruction-hierarchy change —
 * not a request to rewrite application code.
 */
export function recommendFix(
  diagnosis: DiagnosisResult,
  context: IncidentContext = {},
): TreatmentPlan | null {
  if (diagnosis.status !== 'critical') return null

  const treatment = context.treatment
  if (!treatment) {
    return {
      target: 'Agent instructions or feedback policy',
      recommendedChange:
        'Resolve the conflicting goals that cause the agent to undo its own file writes.',
      currentBehavior: 'Agent alternates between incompatible requirements.',
      recommendedInstruction:
        'Give one authoritative goal. If secondary feedback conflicts, report the conflict instead of reverting.',
      why: 'Repeated file-state loops of this shape usually come from equal-priority opposing instructions.',
      applied: false,
      summaryChange: 'Resolve conflicting instruction priorities.',
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
