import {
  MIN_ROOT_CAUSE_CONFIDENCE,
  ROOT_CAUSE_TYPES,
  UNKNOWN_ROOT_CAUSE,
  type RootCauseDiagnosis,
  type RootCauseModelOutput,
  type RootCauseType,
} from './types.ts'

function isRootCauseType(value: string): value is RootCauseType {
  return (ROOT_CAUSE_TYPES as readonly string[]).includes(value)
}

function unknownWithReason(explanation: string): RootCauseDiagnosis {
  return {
    ...UNKNOWN_ROOT_CAUSE,
    explanation,
  }
}

/**
 * Validate and normalize model output against the bounded diagnostic window.
 * Returns unknown when confidence or evidence is weak.
 */
export function validateRootCauseDiagnosis(
  raw: RootCauseModelOutput,
  allowedEventIds: Set<string>,
): RootCauseDiagnosis {
  const rootCauseType = isRootCauseType(raw.rootCauseType) ? raw.rootCauseType : 'unknown'
  const evidenceEventIds = [...new Set(raw.evidenceEventIds ?? [])].filter((id) =>
    allowedEventIds.has(id),
  )

  const confidence =
    typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
      ? Math.min(1, Math.max(0, raw.confidence))
      : 0

  if (rootCauseType === 'unknown') {
    return {
      rootCauseType: 'unknown',
      title: raw.title?.trim() || UNKNOWN_ROOT_CAUSE.title,
      explanation: raw.explanation?.trim() || UNKNOWN_ROOT_CAUSE.explanation,
      confidence: 0,
      affectedComponent: raw.affectedComponent?.trim() || 'unknown',
      evidenceEventIds: [],
    }
  }

  if (evidenceEventIds.length === 0) {
    return unknownWithReason(
      'Model diagnosis lacked verifiable evidence event IDs from the diagnostic window.',
    )
  }

  if (confidence < MIN_ROOT_CAUSE_CONFIDENCE) {
    return unknownWithReason(
      `Model confidence (${confidence.toFixed(2)}) is below the required threshold.`,
    )
  }

  const invalidIds = (raw.evidenceEventIds ?? []).filter((id) => !allowedEventIds.has(id))
  if (invalidIds.length > 0) {
    return unknownWithReason(
      `Model cited event IDs outside the diagnostic window: ${invalidIds.join(', ')}`,
    )
  }

  return {
    rootCauseType,
    title: raw.title.trim() || rootCauseType,
    explanation: raw.explanation.trim() || UNKNOWN_ROOT_CAUSE.explanation,
    confidence,
    affectedComponent: raw.affectedComponent.trim() || 'unknown',
    evidenceEventIds,
  }
}
