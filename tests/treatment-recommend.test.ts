import assert from 'node:assert/strict'
import test from 'node:test'

import {
  recommendTreatmentFromDiagnosis,
  rootCauseToTreatmentTarget,
} from '../src/treatment/index.ts'
import type { RootCauseDiagnosis } from '../src/root-cause/types.ts'

function diagnosis(
  overrides: Partial<RootCauseDiagnosis> & Pick<RootCauseDiagnosis, 'rootCauseType'>,
): RootCauseDiagnosis {
  return {
    title: 'Test diagnosis',
    explanation: 'Test explanation',
    confidence: 0.9,
    affectedComponent: 'auth.py',
    evidenceEventIds: ['evt-a', 'evt-b'],
    ...overrides,
  }
}

test('rootCauseToTreatmentTarget maps initial treatment surfaces', () => {
  assert.equal(rootCauseToTreatmentTarget('conflicting_instructions'), 'instructions')
  assert.equal(rootCauseToTreatmentTarget('test_feedback_oscillation'), 'evaluator_test')
  assert.equal(rootCauseToTreatmentTarget('repeated_tool_failure'), 'tool_configuration')
  assert.equal(rootCauseToTreatmentTarget('retry_strategy_failure'), 'retry_policy')
  assert.equal(rootCauseToTreatmentTarget('lost_context'), 'memory_policy')
  assert.equal(rootCauseToTreatmentTarget('unknown'), null)
})

test('recommendTreatmentFromDiagnosis references diagnosis evidence event IDs', () => {
  const treatment = recommendTreatmentFromDiagnosis(
    diagnosis({ rootCauseType: 'conflicting_instructions' }),
    'auth.py',
  )

  assert.ok(treatment)
  assert.equal(treatment.target, 'instructions')
  assert.equal(treatment.targetComponent, 'auth.py')
  assert.deepEqual(treatment.evidenceEventIds, ['evt-a', 'evt-b'])
  assert.match(treatment.rationale, /evt-a/)
  assert.match(treatment.rationale, /evt-b/)
  assert.equal(treatment.requiresReview, true)
  assert.equal(treatment.safeToAutoApply, false)
  assert.ok(treatment.rollbackStrategy.length > 0)
})

test('recommendTreatmentFromDiagnosis returns null for unknown root cause', () => {
  assert.equal(
    recommendTreatmentFromDiagnosis(
      diagnosis({ rootCauseType: 'unknown', evidenceEventIds: [] }),
      'auth.py',
    ),
    null,
  )
})

test('recommendTreatmentFromDiagnosis returns null without evidence IDs', () => {
  assert.equal(
    recommendTreatmentFromDiagnosis(
      diagnosis({ rootCauseType: 'conflicting_instructions', evidenceEventIds: [] }),
      'auth.py',
    ),
    null,
  )
})

test('each non-unknown root cause maps to a structured treatment template', () => {
  const types = [
    'conflicting_instructions',
    'test_feedback_oscillation',
    'repeated_tool_failure',
    'retry_strategy_failure',
    'lost_context',
  ] as const

  for (const rootCauseType of types) {
    const treatment = recommendTreatmentFromDiagnosis(
      diagnosis({ rootCauseType }),
      'auth.py',
    )
    assert.ok(treatment, rootCauseType)
    assert.equal(treatment.rootCauseType, rootCauseType)
    assert.ok(treatment.proposedChange.length > 0)
    assert.ok(treatment.currentProblematicState.length > 0)
  }
})
