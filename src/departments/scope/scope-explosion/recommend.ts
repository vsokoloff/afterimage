import type { DiagnosisResult, IncidentContext, TreatmentPlan } from '../../types.ts'

/**
 * Prescribe a narrower change policy — not an automatic rewrite of the repo.
 */
export function recommendFix(
  diagnosis: DiagnosisResult,
  context: IncidentContext = {},
): TreatmentPlan | null {
  if (diagnosis.status !== 'critical') return null

  const treatment = context.treatment
  if (!treatment) {
    return {
      target: 'Agent instructions or change policy',
      recommendedChange:
        'Constrain the agent to the files and directories required by the task before editing further.',
      currentBehavior: 'Agent expanded edits across many unrelated paths.',
      recommendedInstruction:
        'Only edit paths required by the task. If you need a new directory, ask first and explain why.',
      why: 'Broad multi-directory edits usually mean the agent lost the localized goal.',
      applied: false,
      summaryChange: 'Narrow edit scope to task-relevant paths.',
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
