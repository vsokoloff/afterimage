import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { getPrimaryDisease } from '../src/departments/index.ts'
import { createFileWriteEvent, sha256Hex } from '../src/events.ts'
import { createObserver } from '../src/observer.ts'
import {
  codexMessageToRecordableEvents,
  codexRunResultToRecordableEvents,
  observeCodexRun,
} from '../src/runtime/codex/index.ts'
import { openStore } from '../src/store.ts'
import {
  authWriterHealthyMessages,
  authWriterLoopMessages,
  shellTestMessages,
} from './fixtures/codex-auth-writer.ts'

test('codex normalize maps prompts, model output, tools, and write file edits', () => {
  const messages = authWriterLoopMessages()
  let context = { taskText: 'Update auth.py and keep compatibility.' }

  const init = codexMessageToRecordableEvents(messages[0]!, context)
  assert.equal(init.events[0]?.type, 'prompt')
  assert.match((init.events[0] as { text: string }).text, /composer-2\.5/)

  const userEcho = codexMessageToRecordableEvents(messages[1]!, init.context)
  assert.equal(userEcho.events.length, 0)

  const assistant = codexMessageToRecordableEvents(messages[2]!, userEcho.context)
  assert.equal(assistant.events[0]?.type, 'model_response')

  const writeCompleted = messages.find(
    (message) =>
      message.type === 'tool_call' &&
      message.status === 'completed' &&
      message.name === 'Write',
  )!
  const normalized = codexMessageToRecordableEvents(writeCompleted, assistant.context)
  assert.deepEqual(
    normalized.events.map((event) => event.type),
    ['tool_result', 'file_write'],
  )
  const fileWrite = normalized.events.find((event) => event.type === 'file_write')
  assert.ok(fileWrite && fileWrite.type === 'file_write')
  assert.equal(fileWrite.path, 'auth.py')
  assert.equal(fileWrite.content, 'state-A')
})

test('codex normalize maps shell commands to process and test_result events', () => {
  const [running, completed] = shellTestMessages()
  const afterStart = codexMessageToRecordableEvents(running, {})
  assert.equal(afterStart.events[0]?.type, 'tool_call')

  const afterEnd = codexMessageToRecordableEvents(completed, afterStart.context)
  assert.deepEqual(
    afterEnd.events.map((event) => event.type),
    ['tool_result', 'process_start', 'process_end', 'test_result'],
  )
  const testResult = afterEnd.events.find((event) => event.type === 'test_result')
  assert.ok(testResult && testResult.type === 'test_result')
  assert.equal(testResult.passed, false)
})

test('codex run result errors map to error events', () => {
  const events = codexRunResultToRecordableEvents({
    id: 'run_err',
    status: 'error',
    error: { message: 'agent crashed', code: 'E_AGENT' },
  })
  assert.equal(events[0]?.type, 'error')
  assert.match((events[0] as { message: string }).message, /crashed/)
})

test('observeCodexRun opens repeated-file-state incident from recorded stream', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-codex-loop-'))
  try {
    const store = await openStore({ projectRoot: storeRoot })
    const result = await observeCodexRun({
      store,
      task: 'Update auth.py and keep compatibility.',
      cwd: storeRoot,
      codexAgentId: 'agent_codex_test',
      codexRunId: 'run_codex_loop',
      messages: authWriterLoopMessages(),
      result: { id: 'run_codex_loop', status: 'finished' },
      alertWriter: { write: () => {} },
    })

    assert.ok(result.incidentsOpened >= 1)
    assert.equal(result.detections[0]?.disease, 'repeated-file-state')
    assert.equal(result.run.agentId, 'codex:agent_codex_test')

    const writes = result.run.events.filter((event) => event.type === 'file_write')
    assert.equal(writes.length, 3)
    assert.deepEqual(
      writes.map((event) => (event.type === 'file_write' ? event.content : '')),
      [undefined, undefined, undefined],
    )
    assert.deepEqual(
      writes.map((event) => (event.type === 'file_write' ? event.hash : '')),
      [sha256Hex('state-A'), sha256Hex('state-B'), sha256Hex('state-A')],
    )
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})

test('observeCodexRun retains file bodies when retainFileContent is enabled', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-codex-retain-'))
  try {
    const store = await openStore({ projectRoot: storeRoot })
    const result = await observeCodexRun({
      store,
      task: 'Update auth.py and keep compatibility.',
      cwd: storeRoot,
      retainFileContent: true,
      messages: authWriterLoopMessages(),
      result: { id: 'run_codex_retain', status: 'finished' },
      alertWriter: { write: () => {} },
    })

    const writes = result.run.events.filter((event) => event.type === 'file_write')
    assert.deepEqual(
      writes.map((event) => (event.type === 'file_write' ? event.content : '')),
      ['state-A', 'state-B', 'state-A'],
    )
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})

test('observeCodexRun healthy stream does not open a loop incident', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-codex-healthy-'))
  try {
    const store = await openStore({ projectRoot: storeRoot })
    const result = await observeCodexRun({
      store,
      task: 'Update auth.py and keep compatibility.',
      messages: authWriterHealthyMessages(),
      result: { id: 'run_healthy', status: 'finished' },
      alertWriter: { write: () => {} },
    })

    assert.equal(result.incidentsOpened, 0)
    assert.equal(result.detections.length, 0)
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})

test('observeCodexRun detects incidents before stream ends', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-codex-stream-'))
  try {
    const store = await openStore({ projectRoot: storeRoot })
    let streamFinished = false
    let detectedBeforeEnd = false

    async function* streamingMessages() {
      for (const message of authWriterLoopMessages()) {
        yield message
      }
      streamFinished = true
    }

    const result = await observeCodexRun({
      store,
      task: 'Update auth.py and keep compatibility.',
      cwd: storeRoot,
      messages: streamingMessages(),
      result: { id: 'run_codex_stream', status: 'finished' },
      alertWriter: { write: () => {} },
      onIncidentDetected: () => {
        if (!streamFinished) {
          detectedBeforeEnd = true
        }
      },
    })

    assert.ok(result.incidentsOpened >= 1)
    assert.equal(detectedBeforeEnd, true)
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})

test('detector sees identical abnormality from codex adapter and manual harness', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-codex-detector-parity-'))
  try {
    const store = await openStore({ projectRoot: storeRoot })
    const disease = getPrimaryDisease()

    const codex = await observeCodexRun({
      store,
      task: 'Update auth.py',
      messages: authWriterLoopMessages(),
      result: { id: 'run_parity', status: 'finished' },
      alertWriter: { write: () => {} },
    })

    const harness = createObserver({ store })
    await harness.startRun({ agentId: 'harness', id: 'run_harness' })
    const contents = ['state-A', 'state-B', 'state-A']
    for (const [index, content] of contents.entries()) {
      await harness.record(
        createFileWriteEvent({
          id: `w-${index}`,
          runId: 'run_harness',
          timestamp: `2026-08-23T21:00:0${index}.000Z`,
          sequence: index + 1,
          path: 'auth.py',
          content,
        }),
      )
    }
    const harnessRun = await harness.finishRun('completed')

    const codexAbnormality = disease.detect({ run: codex.run })
    const harnessAbnormality = disease.detect({ run: harnessRun })

    assert.ok(codexAbnormality)
    assert.ok(harnessAbnormality)
    assert.equal(codexAbnormality.kind, 'repeated-file-state')
    assert.equal(harnessAbnormality.kind, 'repeated-file-state')
    assert.equal(codexAbnormality.signal.file, harnessAbnormality.signal.file)
    assert.equal(codexAbnormality.signal.hash, harnessAbnormality.signal.hash)
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})
