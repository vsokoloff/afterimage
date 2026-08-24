/** Structured root-cause categories for repeated-file-state incidents. */
export type RootCauseType =
  | 'conflicting_instructions'
  | 'repeated_tool_failure'
  | 'test_feedback_oscillation'
  | 'lost_context'
  | 'retry_strategy_failure'
  | 'unknown'

export const ROOT_CAUSE_TYPES: readonly RootCauseType[] = [
  'conflicting_instructions',
  'repeated_tool_failure',
  'test_feedback_oscillation',
  'lost_context',
  'retry_strategy_failure',
  'unknown',
] as const

export type RootCauseDiagnosis = {
  rootCauseType: RootCauseType
  title: string
  explanation: string
  /** 0–1 model-estimated confidence after validation. */
  confidence: number
  affectedComponent: string
  evidenceEventIds: string[]
}

/** Raw model output before validation against the diagnostic window. */
export type RootCauseModelOutput = {
  rootCauseType: string
  title: string
  explanation: string
  confidence: number
  affectedComponent: string
  evidenceEventIds: string[]
}

export const UNKNOWN_ROOT_CAUSE: RootCauseDiagnosis = {
  rootCauseType: 'unknown',
  title: 'Unknown root cause',
  explanation:
    'Insufficient evidence in the diagnostic window to identify a specific root cause.',
  confidence: 0,
  affectedComponent: 'unknown',
  evidenceEventIds: [],
}

export const MIN_ROOT_CAUSE_CONFIDENCE = 0.65
