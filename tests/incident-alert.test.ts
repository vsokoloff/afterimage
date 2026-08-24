import assert from 'node:assert/strict'
import test from 'node:test'

import { formatIncidentAlert } from '../src/runtime/incident-alert.ts'
import type { IncidentDetected } from '../src/observer.ts'

function sampleDetection(): IncidentDetected {
  return {
    type: 'incident_detected',
    runId: 'run_test',
    incident: {
      id: 'inc_alert_test',
      runId: 'run_test',
      title: 'Repeated file state: auth.py returned to a prior content hash',
      status: 'open',
      department: 'looping',
      disease: 'repeated-file-state',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    department: 'looping',
    disease: 'repeated-file-state',
    abnormality: {
      kind: 'repeated-file-state',
      signal: {
        detected: true,
        file: 'auth.py',
        hash: '5a01052272d925b2ab6c3fb46c1df7cf46ab53886e137d8ef116b5a21d85ab70',
        firstSeenTurn: 2,
        repeatedAtTurn: 4,
        firstSeenEventId: 'evt_first',
        repeatedEventId: 'evt_repeat',
      },
    },
    evidence:
      'repeated-file-state file=auth.py hash=5a01052272d925b2ab6c3fb46c1df7cf46ab53886e137d8ef116b5a21d85ab70 firstSeenEvent=evt_first@seq=2 repeatedEvent=evt_repeat@seq=4',
    triggeringEventId: 'evt_repeat',
  }
}

test('formatIncidentAlert includes incident id, file, turns, url, and observe policy', () => {
  const alert = formatIncidentAlert(sampleDetection(), 'http://127.0.0.1:3000', 'observe')

  assert.match(alert, /🚨 Lucid detected a repeated file-state loop/)
  assert.match(alert, /incident:\s+inc_alert_test/)
  assert.match(alert, /file:\s+auth\.py/)
  assert.match(alert, /first:\s+turn 2/)
  assert.match(alert, /repeated:\s+turn 4/)
  assert.match(
    alert,
    /view:\s+http:\/\/127\.0\.0\.1:3000\/#\/incidents\/inc_alert_test/,
  )
  assert.match(alert, /policy:\s+observe — wrapped process continues running/)
})

test('formatIncidentAlert notes terminate-on-critical policy', () => {
  const alert = formatIncidentAlert(
    sampleDetection(),
    'http://127.0.0.1:3000',
    'terminate-on-critical',
    { terminating: true },
  )

  assert.match(alert, /policy:\s+terminate-on-critical — sending SIGTERM to wrapped process/)
})
