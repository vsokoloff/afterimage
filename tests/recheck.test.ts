import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { fetchIncident } from '../src/api.ts'
import { createFileWriteEvent } from '../src/events.ts'
import { createObserver } from '../src/observer.ts'
import { runCommand } from '../src/runtime/index.ts'
import { parseRecheckArgv, runRecheckCommand } from '../src/recheck/index.ts'
import { getIncident, getRun, openStore } from '../src/store.ts'

const LOOP_SCRIPT = [
  "const fs = require('fs/promises');",
  "const target = 'loop-target.txt';",
  '(async () => {',
  "  await fs.writeFile(target, 'state-A');",
  '  await new Promise((r) => setTimeout(r, 150));',
  "  await fs.writeFile(target, 'state-B');",
  '  await new Promise((r) => setTimeout(r, 150));',
  "  await fs.writeFile(target, 'state-A');",
  '})();',
].join(' ')

const HEALTHY_SCRIPT = [
  "const fs = require('fs/promises');",
  "const target = 'loop-target.txt';",
  '(async () => {',
  "  await fs.writeFile(target, 'state-A');",
  '  await new Promise((r) => setTimeout(r, 150));',
  "  await fs.writeFile(target, 'state-B');",
  '  await new Promise((r) => setTimeout(r, 150));',
  "  await fs.writeFile(target, 'state-C');",
  '})();',
].join(' ')

async function seedLoopIncident(storeRoot: string) {
  const store = await openStore({ projectRoot: storeRoot })
  const result = await runCommand({
    store,
    command: [process.execPath, '-e', LOOP_SCRIPT],
    cwd: storeRoot,
    filesystemDebounceMs: 60,
    alertWriter: { write: () => {} },
  })

  assert.ok(result.incidentsOpened >= 1)
  const incidentId = result.detections[0]!.incident.id
  return { store, storeRoot, incidentId, originalRunId: result.run.id }
}

test('parseRecheckArgv requires incident id', () => {
  assert.deepEqual(parseRecheckArgv(['node', 'cli.js', 'recheck', 'inc_abc']), {
    incidentId: 'inc_abc',
  })
  assert.equal(parseRecheckArgv(['node', 'cli.js', 'recheck']), null)
  assert.equal(parseRecheckArgv(['node', 'cli.js', 'recheck', 'inc_abc', '--extra']), null)
  assert.equal(parseRecheckArgv(['node', 'cli.js', 'fix', 'inc_abc']), null)
})

test('recheck re-runs reproduction and leaves incident open when loop persists', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-recheck-fail-'))
  try {
    const { store, incidentId } = await seedLoopIncident(storeRoot)

    const before = await getIncident(store, incidentId)
    assert.equal(before?.status, 'open')
    assert.equal(before?.lastRecheck, undefined)

    const result = await runRecheckCommand({
      incidentId,
      store,
      alertWriter: { write: () => {} },
      filesystemDebounceMs: 60,
      logger: { log: () => {}, error: () => {} },
    })

    assert.equal(result.exitCode, 1)
    assert.equal(result.cleared, false)
    assert.equal(result.verification.passed, false)
    assert.match(result.verification.evidence, /Loop still present|still present/i)

    const after = await getIncident(store, incidentId)
    assert.equal(after?.status, 'open')
    assert.ok(after?.lastRecheck)
    assert.equal(after.lastRecheck.passed, false)
    assert.equal(after.lastRecheck.runId, result.recheckRunId)
    assert.equal(after.recheckHistory?.length, 1)

    const recheckRun = await getRun(store, result.recheckRunId)
    assert.ok(recheckRun)
    assert.equal(recheckRun.agentId, `recheck:${incidentId}`)
    assert.ok(recheckRun.events.some((event) => event.type === 'process_start'))
    assert.ok(recheckRun.events.filter((event) => event.type === 'file_write').length >= 3)

    const detail = await fetchIncident(store, incidentId)
    assert.ok(detail)
    assert.equal(detail.recheck.passed, false)
    assert.equal(detail.recheck.runId, result.recheckRunId)
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})

test('recheck clears incident when verify passes on healthy reproduction', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-recheck-pass-'))
  try {
    const { store, incidentId } = await seedLoopIncident(storeRoot)

    const result = await runRecheckCommand({
      incidentId,
      store,
      reproduction: {
        command: [process.execPath, '-e', HEALTHY_SCRIPT],
        cwd: storeRoot,
      },
      alertWriter: { write: () => {} },
      filesystemDebounceMs: 60,
      logger: { log: () => {}, error: () => {} },
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.cleared, true)
    assert.equal(result.verification.passed, true)
    assert.match(result.verification.evidence, /Recheck clear|no file returned/i)

    const after = await getIncident(store, incidentId)
    assert.equal(after?.status, 'cleared')
    assert.equal(after?.lastRecheck?.passed, true)

    const detail = await fetchIncident(store, incidentId)
    assert.ok(detail)
    assert.equal(detail.recheck.passed, true)
    assert.equal(detail.incident.status, 'cleared')
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})

test('recheck without reproduction does not clear observer-only incidents', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-recheck-norepro-'))
  try {
    const store = await openStore({ projectRoot: storeRoot })
    const observer = createObserver({ store })
    const run = await observer.startRun({ agentId: 'auth', id: 'run_observer_only' })
    await observer.record(
      createFileWriteEvent({
        id: 'w-a1',
        runId: run.id,
        timestamp: '2026-08-23T21:00:00.000Z',
        sequence: 1,
        path: 'auth.py',
        content: 'state-A',
      }),
    )
    await observer.record(
      createFileWriteEvent({
        id: 'w-b',
        runId: run.id,
        timestamp: '2026-08-23T21:00:01.000Z',
        sequence: 2,
        path: 'auth.py',
        content: 'state-B',
      }),
    )
    const third = await observer.record(
      createFileWriteEvent({
        id: 'w-a2',
        runId: run.id,
        timestamp: '2026-08-23T21:00:02.000Z',
        sequence: 3,
        path: 'auth.py',
        content: 'state-A',
      }),
    )
    await observer.finishRun('failed')

    assert.ok(third.detections[0], 'expected loop incident on third write')
    const incidentId = third.detections[0]!.incident.id

    const result = await runRecheckCommand({
      incidentId,
      store,
      logger: { log: () => {}, error: () => {} },
    })

    assert.equal(result.exitCode, 1)
    assert.equal(result.cleared, false)
    assert.match(result.verification.evidence, /reproduction command/i)

    const after = await getIncident(store, incidentId)
    assert.equal(after?.status, 'open')
    assert.equal(after?.lastRecheck?.passed, false)
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})

test('recheck does not clear when reproduction produces no file writes', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-recheck-no-writes-'))
  try {
    const { store, incidentId } = await seedLoopIncident(storeRoot)

    const noopScript = "console.log('no file writes');"
    const result = await runRecheckCommand({
      incidentId,
      store,
      reproduction: {
        command: [process.execPath, '-e', noopScript],
        cwd: storeRoot,
      },
      alertWriter: { write: () => {} },
      logger: { log: () => {}, error: () => {} },
    })

    assert.equal(result.exitCode, 1)
    assert.equal(result.cleared, false)
    assert.equal(result.verification.passed, false)
    assert.match(result.verification.evidence, /inconclusive|no observed file writes/i)

    const after = await getIncident(store, incidentId)
    assert.equal(after?.status, 'open')
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})
