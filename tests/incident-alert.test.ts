import assert from 'node:assert/strict'
import test from 'node:test'

import { formatIncidentAlert } from '../src/runtime/incident-alert.ts'
import type { IncidentDetected } from '../src/observer.ts'

function sampleDetection(): IncidentDetected {
  return {
    type: 'incident_detected',
    runId: 'run_alert',
    incident: {
      id: 'inc_alert_test',
      title: 'loop',
      status: 'open',
      createdAt: '2026-08-24T12:00:00.000Z',
      updatedAt: '2026-08-24T12:00:00.000Z',
      department: 'looping',
      disease: 'repeated-file-state',
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

  assert.match(alert, /Kitty noticed something/)
  assert.match(alert, /incident:\s+inc_alert_test/)
  assert.match(alert, /auth\.py/)
  assert.match(alert, /turns:\s+2 → 4/)
  assert.match(
    alert,
    /view:\s+http:\/\/127\.0\.0\.1:3000\/#\/incidents\/inc_alert_test/,
  )
  assert.match(alert, /policy:\s+observe/)
})

test('formatIncidentAlert notes terminate-on-critical policy', () => {
  const alert = formatIncidentAlert(
    sampleDetection(),
    'http://127.0.0.1:3000',
    'terminate-on-critical',
    { terminating: true },
  )

  assert.match(alert, /policy:\s+terminate-on-critical — stopping the wrapped process/)
})
