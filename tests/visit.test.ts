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

test('serves the incidents-first shell and visit API', async () => {
  const { url, server } = await startServer({ port: 0 })
  try {
    const page = await fetch(url)
    const html = await page.text()
    assert.equal(page.status, 200)
    assert.match(html, /Lucid — Incidents/)
    assert.match(html, /Lucid/)
    assert.match(html, /Incidents/)
    assert.match(html, /#\/incidents/)
    assert.doesNotMatch(html, /Admit agent/)
    assert.doesNotMatch(html, /diagnosis-chat/)

    const agentsAsset = await fetch(`${url}/data/agents.js`)
    assert.equal(agentsAsset.status, 200)
    assert.match(await agentsAsset.text(), /Auth Agent/)

    const appAsset = await fetch(`${url}/app.js`)
    assert.equal(appAsset.status, 200)
    const appSource = await appAsset.text()
    assert.match(appSource, /#\/incidents/)
    assert.match(appSource, /renderIncidentsPage/)
    assert.doesNotMatch(appSource, /Local command center/)

    const charactersAsset = await fetch(`${url}/characters.js`)
    assert.equal(charactersAsset.status, 200)
    const charactersSource = await charactersAsset.text()
    assert.match(charactersSource, /agentCharacter/)
    assert.match(charactersSource, /Auth — shield|shield \+ key/)

    const api = await fetch(`${url}/api/visit`)
    const body = await api.json()
    assert.equal(api.status, 200)
    assert.equal(body.patient.name, 'Auth Agent')
    assert.equal(body.treatment.applied, false)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
})
