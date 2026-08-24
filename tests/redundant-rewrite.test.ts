import assert from 'node:assert/strict'
import test from 'node:test'

import {
  detectRedundantRewrite,
  formatRedundantRewriteEvidence,
  redundantRewrite,
  structuralHash,
} from '../src/departments/cost/redundant-rewrite/index.ts'
import { createFileWriteEvent, sha256Hex, type AgentEvent, type AgentRun } from '../src/events.ts'

function runFromEvents(events: AgentEvent[]): AgentRun {
  return {
    id: 'run-dup',
    startedAt: '2026-08-24T12:00:00.000Z',
    status: 'completed',
    events,
  }
}

function write(
  sequence: number,
  path: string,
  content: string,
  options: { retainContent?: boolean } = {},
) {
  if (options.retainContent === false) {
    return createFileWriteEvent({
      id: `fw-${sequence}`,
      runId: 'run-dup',
      timestamp: `2026-08-24T12:00:${String(sequence).padStart(2, '0')}.000Z`,
      sequence,
      path,
      hash: sha256Hex(content),
      byteLength: Buffer.byteLength(content, 'utf8'),
    })
  }
  return createFileWriteEvent({
    id: `fw-${sequence}`,
    runId: 'run-dup',
    timestamp: `2026-08-24T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    sequence,
    path,
    content,
  })
}

test('redundant-rewrite: cross-file exact duplicate is critical', () => {
  const body = 'export function add(a, b) { return a + b }'
  const events = [write(1, 'src/math.ts', body), write(2, 'src/utils/add.ts', body)]
  const abnormality = detectRedundantRewrite({ run: runFromEvents(events) })
  assert.ok(abnormality)
  assert.equal(abnormality.kind, 'redundant-rewrite')
  assert.equal(abnormality.signal.matchKind, 'exact')
  assert.equal(abnormality.signal.firstPath, 'src/math.ts')
  assert.equal(abnormality.signal.duplicatePath, 'src/utils/add.ts')
  assert.match(formatRedundantRewriteEvidence(abnormality.signal), /^redundant-rewrite/)
})

test('redundant-rewrite: same-path A→B→A is not this disease', () => {
  const events = [
    write(1, 'auth.py', 'state-A'),
    write(2, 'auth.py', 'state-B'),
    write(3, 'auth.py', 'state-A'),
  ]
  assert.equal(detectRedundantRewrite({ run: runFromEvents(events) }), null)
})

test('redundant-rewrite: structural match when content retained', () => {
  const first = 'export function add(a, b) {\n  return a + b\n}\n'
  const second = 'export function add(a, b) { return a + b }'
  assert.notEqual(sha256Hex(first), sha256Hex(second))
  assert.equal(structuralHash(first), structuralHash(second))

  const events = [write(1, 'src/a.ts', first), write(2, 'src/b.ts', second)]
  const abnormality = detectRedundantRewrite({ run: runFromEvents(events) })
  assert.ok(abnormality)
  assert.equal(abnormality.signal.matchKind, 'structural')
})

test('redundant-rewrite: hash-only mode still catches exact duplicates', () => {
  const body = 'duplicate body'
  const events = [
    write(1, 'a.ts', body, { retainContent: false }),
    write(2, 'b.ts', body, { retainContent: false }),
  ]
  const abnormality = detectRedundantRewrite({ run: runFromEvents(events) })
  assert.ok(abnormality)
  assert.equal(abnormality.signal.matchKind, 'exact')
})

test('redundant-rewrite: pipeline detect → diagnose → recommend → verify', () => {
  const body = 'shared'
  const before = {
    run: runFromEvents([write(1, 'a.ts', body), write(2, 'b.ts', body)]),
  }
  const after = {
    run: runFromEvents([write(1, 'a.ts', body), write(2, 'b.ts', 'different')]),
  }
  assert.ok(redundantRewrite.detect(before))
  const diagnosis = redundantRewrite.diagnose(before)
  assert.equal(diagnosis.status, 'critical')
  assert.ok(redundantRewrite.recommendFix(diagnosis))
  assert.equal(redundantRewrite.verify(before, after).passed, true)
})
