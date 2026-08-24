import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createFileWriteEvent } from '../src/events.ts'
import {
  appendEvent,
  createIncident,
  createRun,
  getIncident,
  getRun,
  listRuns,
  openStore,
  updateIncident,
} from '../src/store.ts'

async function withTempStore<T>(fn: (storeRoot: string) => Promise<T>): Promise<T> {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-store-'))
  try {
    return await fn(storeRoot)
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
}

test('createRun + appendEvent + getRun reloads events from disk', async () => {
  await withTempStore(async (storeRoot) => {
    const store = await openStore({ storeRoot })
    const run = await createRun(store, { agentId: 'auth', status: 'running' })

    assert.ok(run.id.startsWith('run_'))
    assert.equal(run.events.length, 0)

    const prompt = await appendEvent(store, {
      type: 'prompt',
      id: '',
      runId: run.id,
      timestamp: '',
      sequence: 1,
      role: 'user',
      text: 'Fix auth loop',
    })
    assert.ok(prompt.id)
    assert.ok(prompt.timestamp)

    const write = await appendEvent(
      store,
      createFileWriteEvent({
        id: 'fw-1',
        runId: run.id,
        timestamp: '2026-08-23T20:00:00.000Z',
        sequence: 2,
        path: 'auth.py',
        content: 'def get_user(id): return None',
      }),
    )
    assert.equal(write.type, 'file_write')

    const reloaded = await getRun(store, run.id)
    assert.ok(reloaded)
    assert.equal(reloaded.agentId, 'auth')
    assert.equal(reloaded.events.length, 2)
    assert.equal(reloaded.events[0]?.type, 'prompt')
    assert.equal(reloaded.events[1]?.type, 'file_write')
    if (reloaded.events[1]?.type === 'file_write') {
      assert.equal(reloaded.events[1].path, 'auth.py')
      assert.equal(reloaded.events[1].content, 'def get_user(id): return None')
    }

    const eventsOnDisk = await readFile(
      path.join(storeRoot, 'runs', `${run.id}.events.jsonl`),
      'utf8',
    )
    const lines = eventsOnDisk.trim().split('\n')
    assert.equal(lines.length, 2)
    assert.match(lines[1]!, /"type":"file_write"/)

    const listed = await listRuns(store)
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.id, run.id)
    assert.equal(listed[0]?.events.length, 2)
  })
})

test('createIncident + updateIncident persist under incidents/', async () => {
  await withTempStore(async (storeRoot) => {
    const store = await openStore({ storeRoot })
    const run = await createRun(store, { agentId: 'auth' })

    const incident = await createIncident(store, {
      runId: run.id,
      agentId: 'auth',
      title: 'Auth Agent: repeated file-state loop',
      symptom: 'A→B→A on auth.py',
      department: 'looping',
      disease: 'repeated-file-state',
    })

    assert.ok(incident.id.startsWith('inc_'))
    assert.equal(incident.status, 'open')

    const updated = await updateIncident(store, incident.id, {
      status: 'in_hospital',
    })
    assert.equal(updated.status, 'in_hospital')
    assert.equal(updated.id, incident.id)
    assert.ok(updated.updatedAt)

    const reloaded = await getIncident(store, incident.id)
    assert.ok(reloaded)
    assert.equal(reloaded.status, 'in_hospital')
    assert.equal(reloaded.runId, run.id)

    const raw = await readFile(
      path.join(storeRoot, 'incidents', `${incident.id}.json`),
      'utf8',
    )
    assert.match(raw, /"status": "in_hospital"/)
  })
})

test('appendEvent fails for unknown runs', async () => {
  await withTempStore(async (storeRoot) => {
    const store = await openStore({ storeRoot })
    await assert.rejects(
      () =>
        appendEvent(store, {
          type: 'error',
          id: 'e1',
          runId: 'missing-run',
          timestamp: '2026-08-23T20:00:00.000Z',
          sequence: 1,
          message: 'boom',
        }),
      /unknown run/,
    )
  })
})
