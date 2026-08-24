import assert from 'node:assert/strict'
import test from 'node:test'

import { detectRepeatedFileState } from '../src/departments/looping/repeated-file-state/detect.ts'
import {
  collectCausalEventIds,
  createCausalContext,
  diagnosticWindowForIncident,
  extractDiagnosticWindow,
} from '../src/diagnostic-window.ts'
import {
  createFileWriteEvent,
  mergeCausalContext,
  hasCausalContext,
  type AgentRun,
  type ErrorEvent,
  type ModelResponseEvent,
  type PromptEvent,
  type TestResultEvent,
  type ToolResultEvent,
} from '../src/events.ts'

function loopRun(): AgentRun {
  const runId = 'run-window'
  const startedAt = '2026-08-23T12:00:00.000Z'

  const systemPrompt: PromptEvent = {
    type: 'prompt',
    id: 'evt-system',
    runId,
    timestamp: startedAt,
    sequence: 1,
    role: 'system',
    text: 'You are a coding agent.',
  }

  const userPrompt: PromptEvent = {
    type: 'prompt',
    id: 'evt-user',
    runId,
    timestamp: startedAt,
    sequence: 2,
    role: 'user',
    text: 'Fix auth.py and keep tests green.',
  }

  const modelDecision: ModelResponseEvent = {
    type: 'model_response',
    id: 'evt-model',
    runId,
    timestamp: startedAt,
    sequence: 3,
    model: 'fixture',
    text: 'I will edit auth.py based on failing tests.',
    reasonSummary: 'Tests failed; revert conflicting change.',
  }

  const toolResult: ToolResultEvent = {
    type: 'tool_result',
    id: 'evt-tool-result',
    runId,
    timestamp: startedAt,
    sequence: 4,
    toolName: 'write_file',
    callId: 'call-1',
    ok: true,
    output: 'wrote auth.py',
  }

  const testFeedback: TestResultEvent = {
    type: 'test_result',
    id: 'evt-test',
    runId,
    timestamp: startedAt,
    sequence: 5,
    name: 'test_auth',
    passed: false,
    output: 'Maintain backwards compatibility',
  }

  const writeA = createFileWriteEvent({
    id: 'fw-a',
    runId,
    timestamp: startedAt,
    sequence: 6,
    path: 'auth.py',
    content: 'state-A',
    ok: true,
  })
  writeA.causal = createCausalContext({
    userInstructionEventId: 'evt-user',
    systemInstructionEventId: 'evt-system',
    modelDecisionEventId: 'evt-model',
    modelReasonSummary: 'Tests failed; revert conflicting change.',
    toolResultEventId: 'evt-tool-result',
    testFeedbackEventId: 'evt-test',
    causedByEventIds: ['evt-test', 'evt-model'],
  })

  const writeB = createFileWriteEvent({
    id: 'fw-b',
    runId,
    timestamp: startedAt,
    sequence: 8,
    path: 'auth.py',
    content: 'state-B',
    ok: true,
  })

  const error: ErrorEvent = {
    type: 'error',
    id: 'evt-error',
    runId,
    timestamp: startedAt,
    sequence: 7,
    message: 'Loop detected manually',
    code: 'loop',
  }

  const writeRepeatA = createFileWriteEvent({
    id: 'fw-a2',
    runId,
    timestamp: startedAt,
    sequence: 9,
    path: 'auth.py',
    content: 'state-A',
    ok: true,
  })

  writeRepeatA.causal = createCausalContext({
    userInstructionEventId: 'evt-user',
    modelDecisionEventId: 'evt-model',
    causedByEventIds: ['evt-model'],
  })

  const noisePrompt: PromptEvent = {
    type: 'prompt',
    id: 'evt-noise',
    runId,
    timestamp: startedAt,
    sequence: 10,
    role: 'user',
    text: 'Unrelated later instruction',
  }

  return {
    id: runId,
    startedAt,
    status: 'failed',
    events: [
      systemPrompt,
      userPrompt,
      modelDecision,
      toolResult,
      testFeedback,
      writeA,
      writeB,
      writeRepeatA,
      error,
      noisePrompt,
    ],
  }
}

test('mergeCausalContext merges references without requiring every field', () => {
  const merged = mergeCausalContext(
    { userInstructionEventId: 'evt-user', causedByEventIds: ['evt-model'] },
    { toolResultEventId: 'evt-tool-result', causedByEventIds: ['evt-test'] },
  )

  assert.deepEqual(merged, {
    userInstructionEventId: 'evt-user',
    toolResultEventId: 'evt-tool-result',
    causedByEventIds: ['evt-model', 'evt-test'],
  })
})

test('collectCausalEventIds returns deterministic reference order', () => {
  const run = loopRun()
  const trigger = run.events.find((event) => event.id === 'fw-a2')
  assert.ok(trigger)

  assert.deepEqual(collectCausalEventIds(trigger), ['evt-user', 'evt-model'])
})

test('extractDiagnosticWindow includes loop file writes and preceding context', () => {
  const run = loopRun()
  const abnormality = detectRepeatedFileState({ run })
  assert.ok(abnormality)

  const window = extractDiagnosticWindow({
    run,
    triggeringEventId: 'fw-a2',
    abnormality,
    maxPrecedingContext: 4,
    maxErrors: 2,
  })

  assert.equal(window.triggeringEventId, 'fw-a2')
  assert.equal(window.triggeringSequence, 9)
  assert.deepEqual(
    window.fileWrites.map((write) => write.id),
    ['fw-a', 'fw-b', 'fw-a2'],
  )
  assert.deepEqual(
    window.precedingContext.map((event) => event.id),
    ['evt-user', 'evt-model', 'evt-tool-result', 'evt-test'],
  )
  assert.deepEqual(
    window.errors.map((event) => event.id),
    ['evt-error'],
  )
})

test('extractDiagnosticWindow pulls causally linked instruction events', () => {
  const run = loopRun()
  const abnormality = detectRepeatedFileState({ run })
  assert.ok(abnormality)

  const window = diagnosticWindowForIncident(run, 'fw-a2', abnormality, {
    maxPrecedingContext: 2,
  })

  const eventIds = window.events.map((event) => event.id)
  assert.ok(eventIds.includes('evt-system'))
  assert.ok(eventIds.includes('evt-user'))
  assert.ok(eventIds.includes('evt-model'))
  assert.ok(eventIds.includes('evt-tool-result'))
  assert.ok(eventIds.includes('evt-test'))
  assert.ok(!eventIds.includes('evt-noise'))
})

test('extractDiagnosticWindow is bounded and deterministic', () => {
  const run = loopRun()
  const abnormality = detectRepeatedFileState({ run })
  assert.ok(abnormality)

  const first = extractDiagnosticWindow({
    run,
    triggeringEventId: 'fw-a2',
    abnormality,
    maxPrecedingContext: 2,
    maxErrors: 1,
    lookbackSequences: 6,
  })
  const second = extractDiagnosticWindow({
    run,
    triggeringEventId: 'fw-a2',
    abnormality,
    maxPrecedingContext: 2,
    maxErrors: 1,
    lookbackSequences: 6,
  })

  assert.deepEqual(first, second)
  assert.equal(first.precedingContext.length, 2)
  assert.equal(first.errors.length, 1)
  assert.deepEqual(
    first.precedingContext.map((event) => event.id),
    ['evt-tool-result', 'evt-test'],
  )
})

test('hasCausalContext is false for events without causal metadata', () => {
  const run = loopRun()
  const bare = run.events.find((event) => event.id === 'fw-b')
  assert.ok(bare)
  assert.equal(hasCausalContext(bare), false)
})

test('createCausalContext omits empty patches', () => {
  assert.equal(createCausalContext({}), undefined)
  assert.deepEqual(createCausalContext({ userInstructionEventId: 'evt-user' }), {
    userInstructionEventId: 'evt-user',
  })
})
