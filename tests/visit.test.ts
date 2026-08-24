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

test('serves the visit page and API', async () => {
  const { url, server } = await startServer({ port: 0 })
  try {
    const page = await fetch(url)
    const html = await page.text()
    assert.equal(page.status, 200)
    assert.match(html, /Admit agent/)
    assert.match(html, /Afterimage/)
    assert.doesNotMatch(html, /diagnosis-chat/)

    const api = await fetch(`${url}/api/visit`)
    const body = await api.json()
    assert.equal(api.status, 200)
    assert.equal(body.patient.name, 'Auth Writer')
    assert.equal(body.treatment.applied, false)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
})
