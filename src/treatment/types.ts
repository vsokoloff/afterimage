import type { RootCauseDiagnosis, RootCauseType } from '../root-cause/types.ts'

/** Initial treatment surfaces the hospital can recommend changes on. */
export type TreatmentTarget =
  | 'instructions'
  | 'memory_policy'
  | 'retry_policy'
  | 'tool_configuration'
  | 'evaluator_test'

export const TREATMENT_TARGETS: readonly TreatmentTarget[] = [
  'instructions',
  'memory_policy',
  'retry_policy',
  'tool_configuration',
  'evaluator_test',
] as const

export type TreatmentRiskLevel = 'low' | 'medium' | 'high'

export type StructuredTreatment = {
  target: TreatmentTarget
  targetComponent: string
  currentProblematicState: string
  proposedChange: string
  rationale: string
  riskLevel: TreatmentRiskLevel
  requiresReview: boolean
  safeToAutoApply: boolean
  rollbackStrategy: string
  /** Event IDs from the root-cause diagnosis supporting this treatment. */
  evidenceEventIds: string[]
  rootCauseType: RootCauseType
}

export function rootCauseToTreatmentTarget(rootCauseType: RootCauseType): TreatmentTarget | null {
  switch (rootCauseType) {
    case 'conflicting_instructions':
      return 'instructions'
    case 'test_feedback_oscillation':
      return 'evaluator_test'
    case 'repeated_tool_failure':
      return 'tool_configuration'
    case 'retry_strategy_failure':
      return 'retry_policy'
    case 'lost_context':
      return 'memory_policy'
    default:
      return null
  }
}
