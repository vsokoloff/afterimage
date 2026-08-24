import assert from 'node:assert/strict'
import test from 'node:test'

import { detectRepeatedFileState } from '../src/departments/looping/repeated-file-state/detect.ts'
import { createCausalContext } from '../src/diagnostic-window.ts'
import {
  createFileWriteEvent,
  type AgentRun,
  type PromptEvent,
  type TestResultEvent,
} from '../src/events.ts'
import {
  createMockRootCauseProvider,
  createUnknownRootCauseProvider,
  diagnoseRepeatedFileStateRootCause,
  serializeDiagnosticWindowForModel,
  validateRootCauseDiagnosis,
  type RootCauseModelOutput,
  type RootCauseModelProvider,
} from '../src/root-cause/index.ts'

function conflictingInstructionsRun(): AgentRun {
  const runId = 'run-root-cause'
  const startedAt = '2026-08-23T12:00:00.000Z'

  const instructionA: PromptEvent = {
    type: 'prompt',
    id: 'evt-inst-a',
    runId,
    timestamp: startedAt,
    sequence: 1,
    role: 'user',
    text: 'Remove deprecated authentication fallback from auth.py.',
  }

  const instructionB: PromptEvent = {
    type: 'prompt',
    id: 'evt-inst-b',
    runId,
    timestamp: startedAt,
    sequence: 2,
    role: 'developer',
    text: 'Preserve backwards compatibility for legacy authentication paths.',
  }

  const writeA = createFileWriteEvent({
    id: 'fw-a',
    runId,
    timestamp: startedAt,
    sequence: 3,
    path: 'auth.py',
    content: 'state-A',
  })

  const writeB = createFileWriteEvent({
    id: 'fw-b',
    runId,
    timestamp: startedAt,
    sequence: 4,
    path: 'auth.py',
    content: 'state-B',
  })

  const writeRepeatA = createFileWriteEvent({
    id: 'fw-a2',
    runId,
    timestamp: startedAt,
    sequence: 5,
    path: 'auth.py',
    content: 'state-A',
  })
  writeRepeatA.causal = createCausalContext({
    userInstructionEventId: 'evt-inst-a',
    causedByEventIds: ['evt-inst-b'],
  })

  return {
    id: runId,
    startedAt,
    status: 'failed',
    events: [instructionA, instructionB, writeA, writeB, writeRepeatA],
  }
}

function testOscillationRun(): AgentRun {
  const runId = 'run-test-oscillation'
  const startedAt = '2026-08-23T12:00:00.000Z'

  const testOne: TestResultEvent = {
    type: 'test_result',
    id: 'evt-test-1',
    runId,
    timestamp: startedAt,
    sequence: 1,
    name: 'test_auth',
    passed: false,
    output: 'Maintain backwards compatibility',
  }

  const testTwo: TestResultEvent = {
    type: 'test_result',
    id: 'evt-test-2',
    runId,
    timestamp: startedAt,
    sequence: 2,
    name: 'test_auth',
    passed: false,
    output: 'Remove deprecated fallback',
  }

  const writes = ['state-A', 'state-B', 'state-A'].map((content, index) =>
    createFileWriteEvent({
      id: `fw-${index + 1}`,
      runId,
      timestamp: startedAt,
      sequence: index + 3,
      path: 'auth.py',
      content,
    }),
  )

  return {
    id: runId,
    startedAt,
    status: 'failed',
    events: [testOne, testTwo, ...writes],
  }
}

test('validateRootCauseDiagnosis rejects weak confidence and unknown evidence', () => {
  const allowed = new Set(['evt-a', 'evt-b'])
  const weak = validateRootCauseDiagnosis(
    {
      rootCauseType: 'conflicting_instructions',
      title: 'Conflicting instructions',
      explanation: 'Two opposing instructions.',
      confidence: 0.4,
      affectedComponent: 'auth.py',
      evidenceEventIds: ['evt-a'],
    },
    allowed,
  )
  assert.equal(weak.rootCauseType, 'unknown')

  const missingEvidence = validateRootCauseDiagnosis(
    {
      rootCauseType: 'conflicting_instructions',
      title: 'Conflicting instructions',
      explanation: 'No evidence ids provided.',
      confidence: 0.95,
      affectedComponent: 'auth.py',
      evidenceEventIds: [],
    },
    allowed,
  )
  assert.equal(missingEvidence.rootCauseType, 'unknown')
})

test('validateRootCauseDiagnosis requires cited event IDs to exist in the window', () => {
  const allowed = new Set(['evt-a'])
  const invalid = validateRootCauseDiagnosis(
    {
      rootCauseType: 'test_feedback_oscillation',
      title: 'Test feedback oscillation',
      explanation: 'Cited an out-of-window event.',
      confidence: 0.9,
      affectedComponent: 'auth.py',
      evidenceEventIds: ['evt-a', 'evt-outside'],
    },
    allowed,
  )
  assert.equal(invalid.rootCauseType, 'unknown')
  assert.match(invalid.explanation, /outside the diagnostic window/)
})

test('mock provider diagnoses conflicting instructions with cited event IDs', async () => {
  const run = conflictingInstructionsRun()
  const abnormality = detectRepeatedFileState({ run })
  assert.ok(abnormality)

  const result = await diagnoseRepeatedFileStateRootCause({
    run,
    abnormality,
    triggeringEventId: abnormality.signal.repeatedEventId,
    deterministicEvidence: 'repeated-file-state file=auth.py',
    provider: createMockRootCauseProvider(),
  })

  assert.equal(result.diagnosis.rootCauseType, 'conflicting_instructions')
  assert.ok(result.diagnosis.confidence >= 0.65)
  assert.deepEqual(result.diagnosis.evidenceEventIds.sort(), ['evt-inst-a', 'evt-inst-b'])
  assert.equal(result.evidenceEvents.length, 2)
  for (const eventId of result.diagnosis.evidenceEventIds) {
    assert.ok(result.diagnosticWindow.events.some((event) => event.id === eventId))
  }
})

test('mock provider diagnoses test feedback oscillation deterministically', async () => {
  const run = testOscillationRun()
  const abnormality = detectRepeatedFileState({ run })
  assert.ok(abnormality)

  const result = await diagnoseRepeatedFileStateRootCause({
    run,
    abnormality,
    triggeringEventId: abnormality.signal.repeatedEventId,
    deterministicEvidence: 'repeated-file-state file=auth.py',
    provider: createMockRootCauseProvider(),
  })

  assert.equal(result.diagnosis.rootCauseType, 'test_feedback_oscillation')
  assert.deepEqual(result.diagnosis.evidenceEventIds, ['evt-test-1', 'evt-test-2'])
})

test('serializeDiagnosticWindowForModel only includes bounded window events', async () => {
  const run = conflictingInstructionsRun()
  run.events.push({
    type: 'prompt',
    id: 'evt-outside-window',
    runId: run.id,
    timestamp: run.startedAt,
    sequence: 99,
    role: 'user',
    text: 'This event is far outside the incident window.',
  })

  const abnormality = detectRepeatedFileState({ run })
  assert.ok(abnormality)

  const result = await diagnoseRepeatedFileStateRootCause({
    run,
    abnormality,
    triggeringEventId: abnormality.signal.repeatedEventId,
    deterministicEvidence: 'repeated-file-state file=auth.py',
    provider: createMockRootCauseProvider(),
  })

  const serialized = serializeDiagnosticWindowForModel({
    window: result.diagnosticWindow,
    loopFile: 'auth.py',
    deterministicEvidence: 'repeated-file-state file=auth.py',
  })

  assert.match(serialized, /evt-inst-a/)
  assert.match(serialized, /fw-a2/)
  assert.doesNotMatch(serialized, /evt-outside-window/)
})

test('custom provider interface receives only diagnostic window material', async () => {
  const run = conflictingInstructionsRun()
  run.events.push({
    type: 'prompt',
    id: 'evt-outside-window',
    runId: run.id,
    timestamp: run.startedAt,
    sequence: 99,
    role: 'user',
    text: 'Outside the bounded diagnostic window.',
  })
  const abnormality = detectRepeatedFileState({ run })
  assert.ok(abnormality)

  let seenEventIds: string[] = []
  const provider: RootCauseModelProvider = {
    name: 'recording-provider',
    async analyze(input) {
      seenEventIds = input.window.events.map((event) => event.id)
      return {
        rootCauseType: 'unknown',
        title: 'Unknown root cause',
        explanation: 'Recorded window only.',
        confidence: 0,
        affectedComponent: input.loopFile,
        evidenceEventIds: [],
      }
    },
  }

  await diagnoseRepeatedFileStateRootCause({
    run,
    abnormality,
    triggeringEventId: abnormality.signal.repeatedEventId,
    deterministicEvidence: 'repeated-file-state file=auth.py',
    provider,
  })

  assert.ok(seenEventIds.length > 0)
  assert.ok(!seenEventIds.includes('evt-outside-window'))
  assert.ok(seenEventIds.length < run.events.length)
})

test('unknown provider returns unknown diagnosis', async () => {
  const run = conflictingInstructionsRun()
  const abnormality = detectRepeatedFileState({ run })
  assert.ok(abnormality)

  const result = await diagnoseRepeatedFileStateRootCause({
    run,
    abnormality,
    triggeringEventId: abnormality.signal.repeatedEventId,
    deterministicEvidence: 'repeated-file-state file=auth.py',
    provider: createUnknownRootCauseProvider(),
  })

  assert.equal(result.diagnosis.rootCauseType, 'unknown')
  assert.deepEqual(result.diagnosis.evidenceEventIds, [])
})

test('validated non-unknown diagnoses always retain cited evidence IDs', () => {
  const allowed = new Set(['evt-a', 'evt-b'])
  const raw: RootCauseModelOutput = {
    rootCauseType: 'conflicting_instructions',
    title: 'Conflicting instructions',
    explanation: 'Opposing instructions caused the loop.',
    confidence: 0.91,
    affectedComponent: 'auth.py',
    evidenceEventIds: ['evt-a', 'evt-b'],
  }

  const validated = validateRootCauseDiagnosis(raw, allowed)
  assert.notEqual(validated.rootCauseType, 'unknown')
  assert.deepEqual(validated.evidenceEventIds, ['evt-a', 'evt-b'])
})
