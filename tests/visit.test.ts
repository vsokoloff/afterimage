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

test('serves incidents UI shell backed by /api/incidents', async () => {
  const { url, server } = await startServer({ port: 0 })
  try {
    const page = await fetch(url)
    const html = await page.text()
    assert.equal(page.status, 200)
    assert.match(html, /Lucid — Incidents/)
    assert.match(html, /#\/incidents/)
    assert.doesNotMatch(html, /Agents/)
    assert.doesNotMatch(html, /Memory/)

    const appAsset = await fetch(`${url}/app.js`)
    assert.equal(appAsset.status, 200)
    const appSource = await appAsset.text()
    assert.match(appSource, /\/api\/incidents/)
    assert.match(appSource, /renderIncidentsPage/)
    assert.match(appSource, /renderIncidentDetail/)
    assert.doesNotMatch(appSource, /\/api\/visit/)
    assert.doesNotMatch(appSource, /agents\.js/)
    assert.doesNotMatch(appSource, /command center/)

    const incidentsApi = await fetch(`${url}/api/incidents`)
    assert.equal(incidentsApi.status, 200)
    const body = await incidentsApi.json()
    assert.ok(Array.isArray(body.incidents))
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
})
