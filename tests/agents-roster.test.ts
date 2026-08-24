import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { fetchActivity, fetchAgentProfile, fetchAgents } from '../src/agents/index.ts'
import { createFileWriteEvent } from '../src/events.ts'
import { createObserver } from '../src/observer.ts'
import { listIncidents, openStore, updateIncident } from '../src/store.ts'

async function seedAuthLoop(storeRoot: string) {
  const store = await openStore({ projectRoot: storeRoot })
  const observer = createObserver({ store })
  await observer.startRun({ agentId: 'auth', id: 'run_roster_auth' })
  for (const [index, content] of ['state-A', 'state-B', 'state-A'].entries()) {
    await observer.record(
      createFileWriteEvent({
        id: `w-${index}`,
        runId: 'run_roster_auth',
        timestamp: `2026-08-23T21:00:0${index}.000Z`,
        sequence: index + 1,
        path: 'auth.py',
        content,
      }),
    )
  }
  await observer.finishRun('failed')
  return store
}

test('fetchAgents derives working, unhealthy, and idle from real runs', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-agents-roster-'))
  try {
    const store = await seedAuthLoop(storeRoot)

    const idleOnly = await fetchAgents(store)
    assert.equal(idleOnly.agents.length, 1)
    assert.equal(idleOnly.agents[0]?.id, 'auth')
    assert.equal(idleOnly.agents[0]?.name, 'Auth Agent')
    assert.equal(idleOnly.agents[0]?.characterId, 'auth')
    assert.equal(idleOnly.agents[0]?.status, 'unhealthy')
    assert.equal(idleOnly.agents[0]?.openIncidentCount, 1)
    assert.ok(idleOnly.agents[0]?.primaryOpenIncidentId)

    const observer = createObserver({ store })
    await observer.startRun({ agentId: 'auth', id: 'run_active' })
    await observer.record({
      type: 'prompt',
      role: 'user',
      text: 'Fix auth.py compatibility.',
    })

    const working = await fetchAgents(store)
    const auth = working.agents.find((agent) => agent.id === 'auth')
    assert.ok(auth)
    assert.equal(auth.status, 'unhealthy')
    assert.equal(auth.currentRunId, 'run_active')
    assert.match(auth.currentActivity ?? '', /Fix auth\.py/)
    assert.ok(auth.currentRunDurationMs != null)

    await observer.finishRun('completed')
    const all = await listIncidents(store)
    for (const incident of all) {
      await updateIncident(store, incident.id, { status: 'cleared' })
    }

    const idle = await fetchAgents(store)
    const authIdle = idle.agents.find((agent) => agent.id === 'auth')
    assert.ok(authIdle)
    assert.equal(authIdle.status, 'idle')
    assert.equal(authIdle.openIncidentCount, 0)
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})

test('fetchAgentProfile returns runs, events, and incidents without invented fields', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-agents-profile-'))
  try {
    const store = await seedAuthLoop(storeRoot)
    const profile = await fetchAgentProfile(store, 'auth')
    assert.ok(profile)
    assert.equal(profile.agent.runtime, 'Local')
    assert.ok(profile.recentRuns.length >= 1)
    assert.ok(profile.openIncidents.length >= 1)
    assert.ok(profile.recentEvents.some((event) => event.type === 'file_write'))
    assert.equal(
      Object.prototype.hasOwnProperty.call(profile.agent, 'healthScore'),
      false,
    )
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})

test('fetchActivity lists persisted events newest first', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-agents-activity-'))
  try {
    const store = await seedAuthLoop(storeRoot)
    const { activity } = await fetchActivity(store, 10)
    assert.ok(activity.length >= 3)
    assert.ok(activity.every((item) => item.agentId === 'auth'))
    for (let index = 1; index < activity.length; index += 1) {
      assert.ok(activity[index - 1]!.at >= activity[index]!.at)
    }
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})
