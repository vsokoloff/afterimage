import type { RootCauseDiagnosis } from '../root-cause/types.ts'
import {
  rootCauseToTreatmentTarget,
  type StructuredTreatment,
  type TreatmentRiskLevel,
} from './types.ts'

type TreatmentTemplate = Pick<
  StructuredTreatment,
  | 'currentProblematicState'
  | 'proposedChange'
  | 'rationale'
  | 'riskLevel'
  | 'requiresReview'
  | 'rollbackStrategy'
>

const TEMPLATES: Record<
  Exclude<RootCauseDiagnosis['rootCauseType'], 'unknown'>,
  TreatmentTemplate
> = {
  conflicting_instructions: {
    currentProblematicState:
      'The agent treats opposing user, developer, or system instructions as equally authoritative and alternates between them.',
    proposedChange:
      'Establish one authoritative instruction hierarchy. Remove, defer, or explicitly subordinate conflicting guidance before the next edit cycle.',
    rationale:
      'Cited instruction events show incompatible goals that explain why the agent undid its own file writes.',
    riskLevel: 'medium',
    requiresReview: true,
    rollbackStrategy:
      'Restore the previous instruction bundle from agent config, prompt template version control, or run metadata.',
  },
  test_feedback_oscillation: {
    currentProblematicState:
      'Failing test feedback pushes the agent between incompatible file states without resolving the underlying requirement conflict.',
    proposedChange:
      'Stabilize evaluator expectations or require the agent to report a test/instruction conflict instead of reverting code.',
    rationale:
      'Cited test feedback events oscillate while the file returns to a prior hash, indicating feedback-driven thrashing.',
    riskLevel: 'medium',
    requiresReview: true,
    rollbackStrategy:
      'Revert evaluator prompt/policy changes and re-run the suite against the last known-good instruction set.',
  },
  repeated_tool_failure: {
    currentProblematicState:
      'Tool executions fail repeatedly while the agent keeps attempting edits that do not durably resolve the failure.',
    proposedChange:
      'Fix tool permissions, arguments, or environment configuration and block further file edits until tool success is confirmed.',
    rationale:
      'Cited tool result events show repeated failures preceding the repeated file state.',
    riskLevel: 'high',
    requiresReview: true,
    rollbackStrategy:
      'Restore prior tool configuration and undo any automatic retries or wrapper flags introduced during the incident window.',
  },
  retry_strategy_failure: {
    currentProblematicState:
      'The retry policy re-invokes the same tool path multiple times without making durable progress.',
    proposedChange:
      'Cap retries, add backoff, and require a different strategy after N failures instead of rewriting the same file state.',
    rationale:
      'Cited tool call events show repeated invocations aligned with the looped file path.',
    riskLevel: 'medium',
    requiresReview: true,
    rollbackStrategy:
      'Restore the previous retry/backoff policy from agent runtime settings.',
  },
  lost_context: {
    currentProblematicState:
      'The agent lost task context before the repeat write, so it reverted toward an earlier state instead of continuing from the latest decision.',
    proposedChange:
      'Increase retained context for user goals and recent decisions, or inject a summary checkpoint before each edit cycle.',
    rationale:
      'A user instruction was present but the repeat write was not preceded by a model decision in the bounded window.',
    riskLevel: 'medium',
    requiresReview: true,
    rollbackStrategy:
      'Restore the prior memory/window policy and replay the run with the previous context limits.',
  },
}

function evidenceSummary(evidenceEventIds: string[]): string {
  if (!evidenceEventIds.length) return 'No cited evidence events.'
  return `Evidence events: ${evidenceEventIds.join(', ')}.`
}

/**
 * Recommend a structured treatment from a validated root-cause diagnosis.
 * Returns null for unknown root causes or diagnoses without evidence.
 */
export function recommendTreatmentFromDiagnosis(
  diagnosis: RootCauseDiagnosis,
  loopFile: string,
): StructuredTreatment | null {
  if (diagnosis.rootCauseType === 'unknown') return null
  if (!diagnosis.evidenceEventIds.length) return null

  const target = rootCauseToTreatmentTarget(diagnosis.rootCauseType)
  if (!target) return null

  const template = TEMPLATES[diagnosis.rootCauseType]
  const targetComponent = diagnosis.affectedComponent === 'unknown' ? loopFile : diagnosis.affectedComponent

  return {
    target,
    targetComponent,
    currentProblematicState: template.currentProblematicState,
    proposedChange: template.proposedChange,
    rationale: `${template.rationale} ${evidenceSummary(diagnosis.evidenceEventIds)}`,
    riskLevel: template.riskLevel,
    requiresReview: template.requiresReview,
    safeToAutoApply: false,
    rollbackStrategy: template.rollbackStrategy,
    evidenceEventIds: [...diagnosis.evidenceEventIds],
    rootCauseType: diagnosis.rootCauseType,
  }
}

/** @internal test helper */
export function treatmentRiskForRootCause(
  rootCauseType: Exclude<RootCauseDiagnosis['rootCauseType'], 'unknown'>,
): TreatmentRiskLevel {
  return TEMPLATES[rootCauseType].riskLevel
}
