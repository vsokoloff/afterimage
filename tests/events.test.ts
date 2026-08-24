import assert from 'node:assert/strict'
import test from 'node:test'

import {
  detectLoopFromFileWrites,
  detectRepeatedFileState,
  hashContent,
} from '../src/departments/looping/repeated-file-state/detect.ts'
import { resolveTraceEdits, resolveTraceFileWrites } from '../src/departments/types.ts'
import {
  assertFileWriteHash,
  createFileWriteEvent,
  editsFromAgentRun,
  fileWritesToEdits,
  sha256Hex,
  type AgentRun,
  type FileWriteEvent,
  type PromptEvent,
  type ModelResponseEvent,
  type ToolCallEvent,
  type ToolResultEvent,
  type TestResultEvent,
  type ErrorEvent,
} from '../src/events.ts'

function sampleRun(): AgentRun {
  const runId = 'run-sample'
  const startedAt = '2026-08-23T12:00:00.000Z'
  const contents = ['state-A', 'state-B', 'state-A']
  const writes = contents.map((content, index) =>
    createFileWriteEvent({
      id: `fw-${index + 1}`,
      runId,
      timestamp: new Date(Date.parse(startedAt) + index * 1000).toISOString(),
      sequence: index + 1,
      path: 'auth.py',
      content,
    }),
  )

  const prompt: PromptEvent = {
    type: 'prompt',
    id: 'ev-prompt',
    runId,
    timestamp: startedAt,
    sequence: 0,
    role: 'user',
    text: 'Fix authentication',
  }

  const response: ModelResponseEvent = {
    type: 'model_response',
    id: 'ev-response',
    runId,
    timestamp: startedAt,
    sequence: 0,
    model: 'fixture',
    text: 'Editing auth.py',
  }

  const toolCall: ToolCallEvent = {
    type: 'tool_call',
    id: 'ev-tool-call',
    runId,
    timestamp: startedAt,
    sequence: 0,
    toolName: 'write_file',
    callId: 'call-1',
    arguments: { path: 'auth.py' },
  }

  const toolResult: ToolResultEvent = {
    type: 'tool_result',
    id: 'ev-tool-result',
    runId,
    timestamp: startedAt,
    sequence: 0,
    toolName: 'write_file',
    callId: 'call-1',
    ok: true,
  }

  const testResult: TestResultEvent = {
    type: 'test_result',
    id: 'ev-test',
    runId,
    timestamp: startedAt,
    sequence: 4,
    name: 'test_auth',
    passed: false,
    output: 'Maintain backwards compatibility',
  }

  const error: ErrorEvent = {
    type: 'error',
    id: 'ev-error',
    runId,
    timestamp: startedAt,
    sequence: 5,
    message: 'Conflicting instructions',
    code: 'instruction_conflict',
  }

  return {
    id: runId,
    agentId: 'auth',
    startedAt,
    status: 'failed',
    events: [prompt, response, toolCall, toolResult, ...writes, testResult, error],
  }
}

test('createFileWriteEvent computes SHA-256 and requires content or hash input', () => {
  const event = createFileWriteEvent({
    id: 'fw-1',
    runId: 'run-1',
    timestamp: '2026-08-23T12:00:00.000Z',
    sequence: 1,
    path: 'auth.py',
    content: 'hello',
  })
  assert.equal(event.type, 'file_write')
  assert.equal(event.hash, sha256Hex('hello'))
  assert.equal(event.hash, hashContent('hello'))
  assertFileWriteHash(event)

  assert.throws(() =>
    createFileWriteEvent({
      id: 'fw-bad',
      runId: 'run-1',
      timestamp: '2026-08-23T12:00:00.000Z',
      sequence: 1,
      path: 'auth.py',
    }),
  )
})

test('file write with contentHashInput only still maps to FileEdit', () => {
  const event = createFileWriteEvent({
    id: 'fw-2',
    runId: 'run-1',
    timestamp: '2026-08-23T12:00:00.000Z',
    sequence: 2,
    path: 'auth.py',
    contentHashInput: 'payload-only',
  })
  assert.equal(event.content, undefined)
  assert.equal(event.contentHashInput, 'payload-only')
  assert.deepEqual(fileWritesToEdits([event]), [
    { turn: 2, file: 'auth.py', content: 'payload-only' },
  ])
})

test('AgentRun file_write events feed the loop detector', () => {
  const run = sampleRun()
  const writes = run.events.filter((e): e is FileWriteEvent => e.type === 'file_write')
  const fromWrites = detectLoopFromFileWrites(writes)
  const fromTrace = detectRepeatedFileState({ run })

  assert.ok(fromWrites)
  assert.equal(fromWrites.file, 'auth.py')
  assert.equal(fromWrites.firstSeenEventId, 'fw-1')
  assert.equal(fromWrites.repeatedEventId, 'fw-3')
  assert.ok(fromTrace)
  assert.deepEqual(fromTrace.signal, fromWrites)
  assert.equal(editsFromAgentRun(run).length, 3)
})

test('resolveTraceFileWrites reads run/events; resolveTraceEdits adapts for display', () => {
  const run = sampleRun()
  assert.equal(resolveTraceFileWrites({ run }).length, 3)
  assert.equal(resolveTraceFileWrites({ events: run.events }).length, 3)
  assert.deepEqual(resolveTraceFileWrites({}), [])
  assert.deepEqual(resolveTraceEdits({ run }), editsFromAgentRun(run))
  assert.deepEqual(resolveTraceEdits({}), [])
})

test('every event type carries id, runId, timestamp, and sequence', () => {
  const run = sampleRun()
  for (const event of run.events) {
    assert.equal(typeof event.id, 'string')
    assert.ok(event.id.length > 0)
    assert.equal(event.runId, run.id)
    assert.equal(typeof event.timestamp, 'string')
    assert.equal(typeof event.sequence, 'number')
    assert.ok(
      [
        'prompt',
        'model_response',
        'tool_call',
        'tool_result',
        'file_write',
        'test_result',
        'error',
        'process_start',
        'process_output',
        'process_end',
      ].includes(event.type),
    )
  }
})
