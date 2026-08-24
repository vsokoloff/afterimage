import assert from 'node:assert/strict'
import test from 'node:test'

import { startServer } from '../src/server.ts'
import { buildVisit } from '../src/visit.ts'

test('visit response keeps detector and case data separate', () => {
  const visit = buildVisit()
  assert.equal(visit.hospital.department, 'looping')
  assert.equal(visit.hospital.disease, 'repeated-file-state')
  assert.equal(visit.diagnosis.status, 'critical')
  assert.equal(visit.edits[0]?.shortHash, visit.edits[2]?.shortHash)
  assert.notEqual(visit.edits[0]?.shortHash, visit.edits[1]?.shortHash)
  assert.equal(visit.edits[2]?.evidenceRole, 'repeated')
  assert.equal(visit.rootCause.title, 'Conflicting instructions')
  assert.equal(visit.treatment.applied, false)
  assert.equal(visit.recheck.length, 2)
  assert.equal(new Set(visit.recheck.map((edit) => edit.shortHash)).size, 2)
  assert.equal(visit.verification.passed, true)
})

test('serves command center UI backed by real agent and incident APIs', async () => {
  const { url, server } = await startServer({ port: 0 })
  try {
    const page = await fetch(url)
    const html = await page.text()
    assert.equal(page.status, 200)
    assert.match(html, /Lucid — Agent Command Center/)
    assert.match(html, /#\/agents/)
    assert.match(html, /#\/activity/)
    assert.match(html, /#\/incidents/)
    assert.match(html, /#\/hospital/)
    assert.match(html, /#\/memory/)

    const appAsset = await fetch(`${url}/app.js`)
    assert.equal(appAsset.status, 200)
    const appSource = await appAsset.text()
    assert.match(appSource, /\/api\/agents/)
    assert.match(appSource, /\/api\/activity/)
    assert.match(appSource, /\/api\/incidents/)
    assert.match(appSource, /renderAgentsPage/)
    assert.match(appSource, /renderHospitalPage/)
    assert.match(appSource, /characters\.js/)
    assert.doesNotMatch(appSource, /healthScore/)
    assert.doesNotMatch(appSource, /\/api\/visit/)

    const characters = await fetch(`${url}/characters.js`)
    assert.equal(characters.status, 200)

    const agentsApi = await fetch(`${url}/api/agents`)
    assert.equal(agentsApi.status, 200)
    const agentsBody = await agentsApi.json()
    assert.ok(Array.isArray(agentsBody.agents))

    const activityApi = await fetch(`${url}/api/activity`)
    assert.equal(activityApi.status, 200)
    const activityBody = await activityApi.json()
    assert.ok(Array.isArray(activityBody.activity))

    const incidentsApi = await fetch(`${url}/api/incidents`)
    assert.equal(incidentsApi.status, 200)
    const incidentsBody = await incidentsApi.json()
    assert.ok(Array.isArray(incidentsBody.incidents))
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
})
