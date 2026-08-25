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

test('serves kid-friendly agent UI backed by real agent and incident APIs', async () => {
  const { url, server } = await startServer({ port: 0 })
  try {
    const page = await fetch(url)
    const html = await page.text()
    assert.equal(page.status, 200)
    assert.match(html, /Afterimage — Your agents/)
    assert.match(html, /Your agents/)
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
    assert.match(appSource, /\/api\/workspace/)
    assert.match(appSource, /\/api\/memory/)
    assert.match(appSource, /workspace-label/)
    assert.match(appSource, /renderAgentsPage/)
    assert.match(appSource, /renderHospitalPage/)
    assert.match(appSource, /To do today/)
    assert.match(appSource, /Messages/)
    assert.match(appSource, /profile-hello/)
    assert.match(appSource, /Uma keeps UI design/)
    assert.match(appSource, /Afterimage Hospital staff/)
    assert.match(appSource, /\/api\/hospital\/staff/)
    assert.match(appSource, /renderPatientCarePanel/)
    assert.match(appSource, /plain-english\.js/)
    assert.match(appSource, /speechBubble/)
    assert.match(appSource, /Technical details/)
    assert.doesNotMatch(appSource, /healthScore/)
    assert.doesNotMatch(appSource, /\/api\/visit/)

    const plainEnglish = await fetch(`${url}/plain-english.js`)
    assert.equal(plainEnglish.status, 200)

    const characters = await fetch(`${url}/characters.js`)
    assert.equal(characters.status, 200)

    const agentsApi = await fetch(`${url}/api/agents`)
    assert.equal(agentsApi.status, 200)
    const agentsBody = await agentsApi.json()
    assert.ok(Array.isArray(agentsBody.agents))

    const memoryApi = await fetch(`${url}/api/memory`)
    assert.equal(memoryApi.status, 200)
    const memoryBody = await memoryApi.json()
    assert.ok(Array.isArray(memoryBody.agents))
    assert.ok(
      memoryBody.agents.some(
        (a: { agentId?: string; name?: string }) => a.agentId === 'uma' || a.name === 'Uma',
      ),
    )

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
