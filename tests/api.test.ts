import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createFileWriteEvent } from '../src/events.ts'
import { createObserver } from '../src/observer.ts'
import { startServer } from '../src/server.ts'
import { openStore } from '../src/store.ts'

async function seedLoopIncident(storeRoot: string) {
  const store = await openStore({ storeRoot })
  const observer = createObserver({ store })
  const run = await observer.startRun({ agentId: 'auth', id: 'run_api_test' })

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

  return {
    runId: run.id,
    incidentId: third.detections[0]!.incident.id,
  }
}

async function withServer<T>(
  fn: (url: string, storeRoot: string) => Promise<T>,
): Promise<T> {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-api-'))
  try {
    await seedLoopIncident(storeRoot)
    const { url, server } = await startServer({ port: 0, storeRoot })
    try {
      return await fn(url, storeRoot)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
}

test('GET /api/runs lists persisted runs from .lucid', async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/api/runs`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.ok(Array.isArray(body.runs))
    assert.equal(body.runs.length, 1)
    assert.equal(body.runs[0]?.id, 'run_api_test')
    assert.equal(body.runs[0]?.events.length, 3)
  })
})

test('GET /api/runs/:runId returns one run with events', async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/api/runs/run_api_test`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.run.id, 'run_api_test')
    assert.equal(body.run.status, 'failed')
    assert.equal(body.run.events.length, 3)
    assert.equal(body.run.events[2]?.type, 'file_write')
  })
})

test('GET /api/runs/:runId returns 404 for unknown run', async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/api/runs/missing`)
    assert.equal(response.status, 404)
    const body = await response.json()
    assert.equal(body.error.code, 'NOT_FOUND')
  })
})

test('GET /api/incidents lists incidents with severity', async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/api/incidents`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.incidents.length, 1)
    assert.equal(body.incidents[0]?.severity, 'critical')
    assert.equal(body.incidents[0]?.department, 'looping')
    assert.equal(body.incidents[0]?.disease, 'repeated-file-state')
    assert.equal(body.incidents[0]?.runId, 'run_api_test')
  })
})

test('GET /api/incidents/:id returns enriched incident detail', async () => {
  await withServer(async (url, _storeRoot) => {
    const list = await (await fetch(`${url}/api/incidents`)).json()
    const incidentId = list.incidents[0]?.id as string

    const response = await fetch(`${url}/api/incidents/${incidentId}`)
    assert.equal(response.status, 200)
    const body = await response.json()

    assert.equal(body.incident.id, incidentId)
    assert.equal(body.status, 'open')
    assert.equal(body.severity, 'critical')
    assert.equal(body.detector.department, 'looping')
    assert.equal(body.detector.disease, 'repeated-file-state')
    assert.equal(body.run.id, 'run_api_test')
    assert.match(body.evidence, /^repeated-file-state file=auth\.py/)

    assert.equal(body.evidenceEvents.length, 2)
    const eventIds = body.evidenceEvents.map((e: { id: string }) => e.id).sort()
    assert.deepEqual(eventIds, ['w-a1', 'w-a2'])

    assert.ok(body.fileStates)
    assert.equal(body.fileStates.file, 'auth.py')
    assert.equal(body.fileStates.firstSeen.eventId, 'w-a1')
    assert.equal(body.fileStates.repeated.eventId, 'w-a2')
    assert.equal(body.fileStates.firstSeen.content, 'state-A')
    assert.equal(body.fileStates.repeated.content, 'state-A')

    assert.ok(Array.isArray(body.hashChain))
    assert.equal(body.hashChain.length, 3)
    assert.equal(body.hashChain[0]?.role, 'first-seen')
    assert.equal(body.hashChain[2]?.role, 'repeated')

    assert.ok(body.diagnosis)
    assert.equal(body.diagnosis.status, 'critical')
    assert.match(body.diagnosis.evidence, /^repeated-file-state/)

    assert.ok(body.treatment)
    assert.equal(body.treatment.requiresReview, true)

    assert.equal(body.rootCause, null)

    assert.ok(body.recheck)
    assert.equal(typeof body.recheck.available, 'boolean')
  })
})

test('GET /api/incidents/:id returns 404 for unknown incident', async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/api/incidents/inc_missing`)
    assert.equal(response.status, 404)
  })
})

test('GET /api/visit remains available but is deprecated', async () => {
  await withServer(async (url) => {
    const response = await fetch(`${url}/api/visit`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Deprecation'), 'true')
    assert.match(response.headers.get('Warning') ?? '', /deprecated/i)
    const body = await response.json()
    assert.equal(body.patient.name, 'Auth Agent')
  })
})
