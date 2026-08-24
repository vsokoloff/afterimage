import type { DiagnosisResult, IncidentContext, TreatmentPlan } from '../../types.ts'

export function recommendFix(
  diagnosis: DiagnosisResult,
  context: IncidentContext = {},
): TreatmentPlan | null {
  if (diagnosis.status !== 'critical') return null

  const treatment = context.treatment
  if (!treatment) {
    return {
      target: 'Memory / regression checklist',
      recommendedChange:
        'Restore the last known-good change set and re-run the failing test before further edits.',
      currentBehavior: 'A test that previously passed is failing again after later changes.',
      recommendedInstruction:
        'When a previously passing test fails, stop and recover the last green state before continuing.',
      why: 'Agents often overwrite a working fix while chasing a secondary symptom.',
      applied: false,
      summaryChange: 'Recover last green state and re-verify the regressed test.',
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
