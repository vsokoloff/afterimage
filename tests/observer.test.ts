import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createFileWriteEvent } from '../src/events.ts'
import { createObserver } from '../src/observer.ts'
import { getIncident, getRun, listIncidents, openStore } from '../src/store.ts'

async function withTempStore<T>(fn: (storeRoot: string) => Promise<T>): Promise<T> {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-observer-'))
  try {
    return await fn(storeRoot)
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
}

test('observer A → B → A persists an incident at the third file write', async () => {
  await withTempStore(async (storeRoot) => {
    const store = await openStore({ storeRoot })
    const observer = createObserver({ store })

    const run = await observer.startRun({ agentId: 'auth' })
    assert.equal(run.status, 'running')
    assert.equal(run.events.length, 0)

    const writeA1 = await observer.record(
      createFileWriteEvent({
        id: 'w-a1',
        runId: run.id,
        timestamp: '2026-08-23T21:00:00.000Z',
        sequence: 1,
        path: 'auth.py',
        content: 'state-A',
      }),
    )
    assert.equal(writeA1.detections.length, 0)
    assert.equal((await listIncidents(store)).length, 0)

    const writeB = await observer.record(
      createFileWriteEvent({
        id: 'w-b',
        runId: run.id,
        timestamp: '2026-08-23T21:00:01.000Z',
        sequence: 2,
        path: 'auth.py',
        content: 'state-B',
      }),
    )
    assert.equal(writeB.detections.length, 0)
    assert.equal((await listIncidents(store)).length, 0)

    const writeA2 = await observer.record(
      createFileWriteEvent({
        id: 'w-a2',
        runId: run.id,
        timestamp: '2026-08-23T21:00:02.000Z',
        sequence: 3,
        path: 'auth.py',
        content: 'state-A',
      }),
    )

    assert.equal(writeA2.detections.length, 1)
    const detection = writeA2.detections[0]!
    assert.equal(detection.type, 'incident_detected')
    assert.equal(detection.runId, run.id)
    assert.equal(detection.department, 'looping')
    assert.equal(detection.disease, 'repeated-file-state')
    assert.equal(detection.triggeringEventId, 'w-a2')
    assert.equal(detection.abnormality.kind, 'repeated-file-state')
    assert.equal(detection.abnormality.signal.firstSeenEventId, 'w-a1')
    assert.equal(detection.abnormality.signal.repeatedEventId, 'w-a2')
    assert.match(detection.evidence, /^repeated-file-state file=auth\.py/)

    const incidents = await listIncidents(store)
    assert.equal(incidents.length, 1)
    assert.equal(incidents[0]?.id, detection.incident.id)
    assert.equal(incidents[0]?.runId, run.id)
    assert.equal(incidents[0]?.status, 'open')
    assert.equal(incidents[0]?.department, 'looping')
    assert.equal(incidents[0]?.disease, 'repeated-file-state')

    const fromDisk = await getIncident(store, detection.incident.id)
    assert.ok(fromDisk)
    assert.equal(fromDisk.title.includes('auth.py'), true)

    const incidentFiles = await readdir(path.join(storeRoot, 'incidents'))
    assert.equal(incidentFiles.length, 1)
    const raw = await readFile(
      path.join(storeRoot, 'incidents', incidentFiles[0]!),
      'utf8',
    )
    assert.match(raw, /"disease": "repeated-file-state"/)

    // Same loop must not open a duplicate incident on a later event.
    const extra = await observer.record({
      type: 'prompt',
      text: 'still looping?',
    })
    assert.equal(extra.detections.length, 0)
    assert.equal((await listIncidents(store)).length, 1)

    const finished = await observer.finishRun('completed')
    assert.equal(finished.status, 'completed')
    assert.ok(finished.endedAt)
    assert.equal(finished.events.length, 4)

    const reloaded = await getRun(store, run.id)
    assert.ok(reloaded)
    assert.equal(reloaded.status, 'completed')
    assert.equal(reloaded.events.length, 4)
  })
})

test('observer requires startRun before record', async () => {
  await withTempStore(async (storeRoot) => {
    const observer = createObserver({ store: await openStore({ storeRoot }) })
    await assert.rejects(
      () =>
        observer.record({
          type: 'prompt',
          text: 'nope',
        }),
      /No active run/,
    )
  })
})
