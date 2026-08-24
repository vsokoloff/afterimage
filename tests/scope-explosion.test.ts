import assert from 'node:assert/strict'
import test from 'node:test'

import {
  detectScopeExplosion,
  formatScopeExplosionEvidence,
  HIGH_FILE_COUNT,
  MULTI_DIR_MIN_DIRS,
  MULTI_DIR_MIN_FILES,
  scopeExplosion,
} from '../src/departments/scope/scope-explosion/index.ts'
import {
  createFileWriteEvent,
  type AgentEvent,
  type AgentRun,
  type PromptEvent,
} from '../src/events.ts'

function runFromEvents(events: AgentEvent[]): AgentRun {
  return {
    id: 'run-scope',
    startedAt: '2026-08-24T12:00:00.000Z',
    status: 'completed',
    events,
  }
}

function write(
  sequence: number,
  path: string,
  content = `body-${path}-${sequence}`,
  ok = true,
) {
  return createFileWriteEvent({
    id: `fw-${sequence}`,
    runId: 'run-scope',
    timestamp: `2026-08-24T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    sequence,
    path,
    content,
    byteLength: Buffer.byteLength(content, 'utf8'),
    ok,
  })
}

test('scope-explosion: under-threshold multi-file stay clear', () => {
  const events = [
    write(1, 'src/a.ts'),
    write(2, 'src/b.ts'),
    write(3, 'src/c.ts'),
  ]
  assert.equal(detectScopeExplosion({ run: runFromEvents(events) }), null)
})

test('scope-explosion: multi-dir blast is critical', () => {
  const paths = [
    'src/a.ts',
    'src/b.ts',
    'tests/a.test.ts',
    'tests/b.test.ts',
    'docs/readme.md',
    'scripts/seed.ts',
  ]
  assert.ok(paths.length >= MULTI_DIR_MIN_FILES)
  const events = paths.map((path, index) => write(index + 1, path))
  const abnormality = detectScopeExplosion({ run: runFromEvents(events) })
  assert.ok(abnormality)
  assert.equal(abnormality.kind, 'scope-explosion')
  assert.equal(abnormality.signal.reason, 'multi-dir-blast')
  assert.ok(abnormality.signal.topLevelDirs.length >= MULTI_DIR_MIN_DIRS)
  assert.match(formatScopeExplosionEvidence(abnormality.signal), /^scope-explosion files=6/)
})

test('scope-explosion: high file count alone is critical', () => {
  const events = Array.from({ length: HIGH_FILE_COUNT }, (_, index) =>
    write(index + 1, `src/file-${index}.ts`),
  )
  const abnormality = detectScopeExplosion({ run: runFromEvents(events) })
  assert.ok(abnormality)
  assert.equal(abnormality.signal.reason, 'high-file-count')
})

test('scope-explosion: prompt-scoped violation is critical', () => {
  const prompt: PromptEvent = {
    type: 'prompt',
    id: 'prompt-1',
    runId: 'run-scope',
    timestamp: '2026-08-24T12:00:00.000Z',
    sequence: 0,
    role: 'user',
    text: 'Please only change auth.py for now.',
  }
  const events: AgentEvent[] = [
    prompt,
    write(1, 'auth.py'),
    write(2, 'src/users.ts'),
    write(3, 'src/session.ts'),
    write(4, 'tests/auth.test.ts'),
    write(5, 'docs/notes.md'),
  ]
  const abnormality = detectScopeExplosion({ run: runFromEvents(events) })
  assert.ok(abnormality)
  assert.equal(abnormality.signal.reason, 'prompt-scope-violation')
  assert.ok(abnormality.signal.outsidePaths?.includes('src/users.ts'))
})

test('scope-explosion: failed writes are ignored', () => {
  const events = [
    write(1, 'src/a.ts'),
    write(2, 'tests/a.ts'),
    write(3, 'docs/a.md'),
    write(4, 'scripts/a.ts'),
    write(5, 'web/a.ts'),
    write(6, 'pkg/a.ts', 'x', false),
  ]
  // 5 successful paths across 5 dirs — under MULTI_DIR_MIN_FILES
  assert.equal(detectScopeExplosion({ run: runFromEvents(events) }), null)
})

test('scope-explosion: pipeline detect → diagnose → recommend → verify', () => {
  const beforePaths = [
    'src/a.ts',
    'src/b.ts',
    'tests/a.ts',
    'tests/b.ts',
    'docs/a.md',
    'scripts/a.ts',
  ]
  const before = {
    run: runFromEvents(beforePaths.map((path, index) => write(index + 1, path))),
  }
  const after = {
    run: runFromEvents([write(1, 'src/a.ts'), write(2, 'src/b.ts')]),
  }

  const abnormality = scopeExplosion.detect(before)
  assert.ok(abnormality)
  const diagnosis = scopeExplosion.diagnose(before)
  assert.equal(diagnosis.status, 'critical')
  const plan = scopeExplosion.recommendFix(diagnosis)
  assert.ok(plan)
  assert.equal(plan.safeToAutoApply, false)
  const verification = scopeExplosion.verify(before, after)
  assert.equal(verification.passed, true)
})
