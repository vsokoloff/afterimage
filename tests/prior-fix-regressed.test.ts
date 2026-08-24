import assert from 'node:assert/strict'
import test from 'node:test'

import {
  detectPriorFixRegressed,
  formatPriorFixRegressedEvidence,
  priorFixRegressed,
} from '../src/departments/memory/prior-fix-regressed/index.ts'
import type { AgentEvent, AgentRun, TestResultEvent } from '../src/events.ts'

function runFromEvents(events: AgentEvent[]): AgentRun {
  return {
    id: 'run-regress',
    startedAt: '2026-08-24T12:00:00.000Z',
    status: 'completed',
    events,
  }
}

function testResult(
  sequence: number,
  name: string,
  passed: boolean,
): TestResultEvent {
  return {
    type: 'test_result',
    id: `test-${sequence}`,
    runId: 'run-regress',
    timestamp: `2026-08-24T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    sequence,
    name,
    passed,
  }
}

test('prior-fix-regressed: pass then fail is critical', () => {
  const events = [
    testResult(1, 'test_auth', true),
    testResult(2, 'test_auth', false),
  ]
  const abnormality = detectPriorFixRegressed({ run: runFromEvents(events) })
  assert.ok(abnormality)
  assert.equal(abnormality.kind, 'prior-fix-regressed')
  assert.equal(abnormality.signal.testName, 'test_auth')
  assert.match(
    formatPriorFixRegressedEvidence(abnormality.signal),
    /^prior-fix-regressed test=test_auth/,
  )
})

test('prior-fix-regressed: fail then pass is clear', () => {
  const events = [
    testResult(1, 'test_auth', false),
    testResult(2, 'test_auth', true),
  ]
  assert.equal(detectPriorFixRegressed({ run: runFromEvents(events) }), null)
})

test('prior-fix-regressed: different test names do not cross-match', () => {
  const events = [
    testResult(1, 'test_auth', true),
    testResult(2, 'test_users', false),
  ]
  assert.equal(detectPriorFixRegressed({ run: runFromEvents(events) }), null)
})

test('prior-fix-regressed: interleaved unrelated tests still catch regression', () => {
  const events = [
    testResult(1, 'test_auth', true),
    testResult(2, 'test_users', true),
    testResult(3, 'test_users', true),
    testResult(4, 'test_auth', false),
  ]
  const abnormality = detectPriorFixRegressed({ run: runFromEvents(events) })
  assert.ok(abnormality)
  assert.equal(abnormality.signal.testName, 'test_auth')
  assert.equal(abnormality.signal.firstPassEventId, 'test-1')
  assert.equal(abnormality.signal.laterFailEventId, 'test-4')
})

test('prior-fix-regressed: pipeline detect → diagnose → recommend → verify', () => {
  const before = {
    run: runFromEvents([
      testResult(1, 'test_auth', true),
      testResult(2, 'test_auth', false),
    ]),
  }
  const after = {
    run: runFromEvents([
      testResult(1, 'test_auth', true),
      testResult(2, 'test_auth', true),
    ]),
  }

  assert.ok(priorFixRegressed.detect(before))
  const diagnosis = priorFixRegressed.diagnose(before)
  assert.equal(diagnosis.status, 'critical')
  assert.ok(priorFixRegressed.recommendFix(diagnosis))
  assert.equal(priorFixRegressed.verify(before, after).passed, true)
})
