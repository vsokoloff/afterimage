import assert from 'node:assert/strict'
import test from 'node:test'

import {
  detectLoopFromFileWrites,
  detectRepeatedFileState,
  formatRepeatedFileStateEvidence,
  hashContent,
  shortHash,
} from '../src/detect-loop.ts'
import {
  createFileWriteEvent,
  type AgentEvent,
  type AgentRun,
  type FileWriteEvent,
} from '../src/events.ts'

const RUN = 'run-detect'
const TS = '2026-08-23T12:00:00.000Z'

function write(
  sequence: number,
  path: string,
  content: string,
  extras: { id?: string; ok?: boolean } = {},
): FileWriteEvent {
  return createFileWriteEvent({
    id: extras.id ?? `w-${sequence}-${path}`,
    runId: RUN,
    timestamp: TS,
    sequence,
    path,
    content,
    ok: extras.ok,
  })
}

function runWith(...events: AgentEvent[]): AgentRun {
  return {
    id: RUN,
    startedAt: TS,
    status: 'failed',
    events,
  }
}

test('A → B → A = incident', () => {
  const a = write(1, 'auth.py', 'state-A', { id: 'evt-a1' })
  const b = write(2, 'auth.py', 'state-B', { id: 'evt-b' })
  const a2 = write(3, 'auth.py', 'state-A', { id: 'evt-a2' })

  const signal = detectLoopFromFileWrites([a, b, a2])
  assert.ok(signal)
  assert.equal(signal.file, 'auth.py')
  assert.equal(signal.hash, hashContent('state-A'))
  assert.equal(signal.firstSeenTurn, 1)
  assert.equal(signal.repeatedAtTurn, 3)
  assert.equal(signal.firstSeenEventId, 'evt-a1')
  assert.equal(signal.repeatedEventId, 'evt-a2')

  const abnormality = detectRepeatedFileState({ run: runWith(a, b, a2) })
  assert.ok(abnormality)
  assert.equal(abnormality.kind, 'repeated-file-state')
  assert.deepEqual(abnormality.signal, signal)

  assert.equal(
    formatRepeatedFileStateEvidence(signal),
    `repeated-file-state file=auth.py hash=${signal.hash} firstSeenEvent=evt-a1@seq=1 repeatedEvent=evt-a2@seq=3`,
  )
})

test('A → B → C = no incident', () => {
  const signal = detectLoopFromFileWrites([
    write(1, 'auth.py', 'A'),
    write(2, 'auth.py', 'B'),
    write(3, 'auth.py', 'C'),
  ])
  assert.equal(signal, null)
  assert.equal(
    detectRepeatedFileState({
      events: [write(1, 'auth.py', 'A'), write(2, 'auth.py', 'B'), write(3, 'auth.py', 'C')],
    }),
    null,
  )
})

test('same hash in different files = no cross-file incident', () => {
  const signal = detectLoopFromFileWrites([
    write(1, 'auth.py', 'same'),
    write(2, 'users.py', 'same'),
  ])
  assert.equal(signal, null)
})

test('multiple files interleaved still detects per-file A → B → A', () => {
  const events = [
    write(1, 'auth.py', 'A', { id: 'auth-1' }),
    write(2, 'users.py', 'X', { id: 'users-1' }),
    write(3, 'auth.py', 'B', { id: 'auth-2' }),
    write(4, 'users.py', 'Y', { id: 'users-2' }),
    write(5, 'auth.py', 'A', { id: 'auth-3' }),
  ]
  const signal = detectLoopFromFileWrites(events)
  assert.ok(signal)
  assert.equal(signal.file, 'auth.py')
  assert.equal(signal.firstSeenEventId, 'auth-1')
  assert.equal(signal.repeatedEventId, 'auth-3')
  assert.equal(signal.firstSeenTurn, 1)
  assert.equal(signal.repeatedAtTurn, 5)
  assert.equal(signal.hash, hashContent('A'))
})

test('failed file_write events are ignored', () => {
  const signal = detectLoopFromFileWrites([
    write(1, 'auth.py', 'A', { ok: true }),
    write(2, 'auth.py', 'B', { ok: true }),
    write(3, 'auth.py', 'A', { ok: false }),
  ])
  assert.equal(signal, null)
})

test('non file_write events are ignored', () => {
  const prompt: AgentEvent = {
    type: 'prompt',
    id: 'p1',
    runId: RUN,
    timestamp: TS,
    sequence: 0,
    text: 'fix auth',
  }
  const signal = detectRepeatedFileState({
    run: runWith(
      prompt,
      write(1, 'auth.py', 'A'),
      write(2, 'auth.py', 'B'),
      write(3, 'auth.py', 'A'),
    ),
  })
  assert.ok(signal)
  assert.equal(signal.signal.file, 'auth.py')
})

test('short hash is the first six hex characters', () => {
  assert.equal(shortHash('hello'), hashContent('hello').slice(0, 6))
})
