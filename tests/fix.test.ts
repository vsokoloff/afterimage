import assert from 'node:assert/strict'
import { mkdtemp, readFile, access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { fetchIncident } from '../src/api.ts'
import { createFileWriteEvent } from '../src/events.ts'
import { createObserver } from '../src/observer.ts'
import { openStore, getIncident } from '../src/store.ts'
import { instructionsTreatmentAdapter } from '../src/treatment/adapters/instructions-adapter.ts'
import { parseFixArgv, runFixCommand } from '../src/treatment/index.ts'
import type { StructuredTreatment } from '../src/treatment/types.ts'

async function seedRichIncident(storeRoot: string) {
  const store = await openStore({ projectRoot: storeRoot })
  const observer = createObserver({ store })
  const run = await observer.startRun({ agentId: 'auth', id: 'run_fix_test' })

  await observer.record({
    type: 'prompt',
    role: 'user',
    text: 'Remove deprecated authentication fallback from auth.py.',
    id: 'evt-inst-a',
    sequence: 1,
  })
  await observer.record({
    type: 'prompt',
    role: 'developer',
    text: 'Preserve backwards compatibility for legacy authentication paths.',
    id: 'evt-inst-b',
    sequence: 2,
  })
  await observer.record(
    createFileWriteEvent({
      id: 'w-a1',
      runId: run.id,
      timestamp: '2026-08-23T21:00:00.000Z',
      sequence: 3,
      path: 'auth.py',
      content: 'state-A',
    }),
  )
  await observer.record(
    createFileWriteEvent({
      id: 'w-b',
      runId: run.id,
      timestamp: '2026-08-23T21:00:01.000Z',
      sequence: 4,
      path: 'auth.py',
      content: 'state-B',
    }),
  )
  const third = await observer.record(
    createFileWriteEvent({
      id: 'w-a2',
      runId: run.id,
      timestamp: '2026-08-23T21:00:02.000Z',
      sequence: 5,
      path: 'auth.py',
      content: 'state-A',
    }),
  )
  await observer.finishRun('failed')

  const incidentId = third.detections[0]!.incident.id
  const detail = await fetchIncident(store, incidentId)
  assert.ok(detail?.treatment)
  return { store, storeRoot, incidentId, detail }
}

function captureLogger() {
  const lines: string[] = []
  return {
    lines,
    logger: {
      log: (...args: unknown[]) => lines.push(args.map(String).join(' ')),
      error: (...args: unknown[]) => lines.push(args.map(String).join(' ')),
    },
  }
}

test('parseFixArgv parses incident id and flags', () => {
  assert.deepEqual(parseFixArgv(['node', 'cli.js', 'fix', 'inc_test']), {
    incidentId: 'inc_test',
    apply: false,
    yes: false,
    rollback: false,
  })
  assert.deepEqual(parseFixArgv(['node', 'cli.js', 'fix', 'inc_test', '--apply', '--yes']), {
    incidentId: 'inc_test',
    apply: true,
    yes: true,
    rollback: false,
  })
  assert.deepEqual(parseFixArgv(['node', 'cli.js', 'fix', 'inc_test', '--rollback']), {
    incidentId: 'inc_test',
    apply: false,
    yes: false,
    rollback: true,
  })
  assert.equal(parseFixArgv(['node', 'cli.js', 'fix']), null)
})

test('instructions adapter preview shows before/after instruction hierarchy', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-fix-preview-'))
  const { store, detail } = await seedRichIncident(storeRoot)
  assert.ok(detail.treatment)
  assert.ok(detail.rootCauseDiagnosis)

  const preview = instructionsTreatmentAdapter.preview({
    store,
    incident: detail.incident,
    treatment: detail.treatment,
    rootCauseDiagnosis: detail.rootCauseDiagnosis,
    run: detail.run,
    evidenceEvents: detail.rootCauseEvidenceEvents,
  })

  assert.match(preview.before, /evt-inst-a/)
  assert.match(preview.before, /evt-inst-b/)
  assert.match(preview.after, /Authoritative goal/)
  assert.match(preview.after, /Conflict policy/)
  assert.doesNotMatch(preview.summary, /auth\.py/)
})

test('runFixCommand dry run shows diagnosis and treatment without writing artifacts', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-fix-dry-'))
  const { store, incidentId } = await seedRichIncident(storeRoot)
  const { lines, logger } = captureLogger()

  const result = await runFixCommand({
    incidentId,
    store,
    logger,
  })

  assert.equal(result.exitCode, 0)
  assert.equal(result.applied, undefined)
  assert.ok(lines.some((line) => line.includes('Diagnosis')))
  assert.ok(lines.some((line) => line.includes('Treatment')))
  assert.ok(lines.some((line) => line.includes('Preview — before')))
  assert.ok(lines.some((line) => line.includes('Dry run only')))

  await assert.rejects(
    () => access(path.join(store.root, 'agent', 'instructions.json')),
    /ENOENT/,
  )
})

test('runFixCommand requires confirmation before apply', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-fix-no-confirm-'))
  const { store, incidentId } = await seedRichIncident(storeRoot)

  const denied = await runFixCommand({
    incidentId,
    store,
    apply: true,
    confirm: async () => false,
    logger: captureLogger().logger,
  })
  assert.equal(denied.exitCode, 1)

  await assert.rejects(
    () => access(path.join(store.root, 'agent', 'instructions.json')),
    /ENOENT/,
  )
})

test('runFixCommand apply and rollback restore prior Afterimage instruction overlay', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-fix-rollback-'))
  const { store, incidentId } = await seedRichIncident(storeRoot)
  const activePath = path.join(store.root, 'agent', 'instructions.json')

  const applied = await runFixCommand({
    incidentId,
    store,
    apply: true,
    yes: true,
    logger: captureLogger().logger,
  })
  assert.equal(applied.exitCode, 0)
  assert.equal(applied.applied, true)

  const afterApply = await readFile(activePath, 'utf8')
  assert.match(afterApply, /authoritativeGoal/)

  let incident = await getIncident(store, incidentId)
  assert.ok(incident?.treatmentApplication)
  assert.ok(!incident.treatmentApplication.rolledBackAt)

  const rolledBack = await runFixCommand({
    incidentId,
    store,
    rollback: true,
    yes: true,
    logger: captureLogger().logger,
  })
  assert.equal(rolledBack.exitCode, 0)
  assert.equal(rolledBack.rolledBack, true)

  await assert.rejects(() => access(activePath), /ENOENT/)

  incident = await getIncident(store, incidentId)
  assert.ok(incident?.treatmentApplication?.rolledBackAt)
})

test('runFixCommand apply with existing overlay rolls back to previous contents', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-fix-restore-'))
  const { store, incidentId, detail } = await seedRichIncident(storeRoot)
  const activePath = path.join(store.root, 'agent', 'instructions.json')
  const previous = `${JSON.stringify({ version: 1, authoritativeGoal: 'Keep legacy behavior' }, null, 2)}\n`
  await import('node:fs/promises').then((fs) =>
    fs.mkdir(path.dirname(activePath), { recursive: true }).then(() =>
      fs.writeFile(activePath, previous, 'utf8'),
    ),
  )

  await runFixCommand({
    incidentId,
    store,
    apply: true,
    yes: true,
    logger: captureLogger().logger,
  })

  const changed = await readFile(activePath, 'utf8')
  assert.notEqual(changed, previous)
  assert.match(changed, /Establish one authoritative/)

  await runFixCommand({
    incidentId,
    store,
    rollback: true,
    yes: true,
    logger: captureLogger().logger,
  })

  const restored = await readFile(activePath, 'utf8')
  assert.equal(restored, previous)
})

test('runFixCommand rejects unsupported treatment targets', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-fix-unsupported-'))
  const store = await openStore({ projectRoot: storeRoot })
  const treatment: StructuredTreatment = {
    target: 'retry_policy',
    targetComponent: 'auth.py',
    currentProblematicState: 'Retries loop',
    proposedChange: 'Cap retries',
    rationale: 'Evidence events: evt-a.',
    riskLevel: 'medium',
    requiresReview: true,
    safeToAutoApply: false,
    rollbackStrategy: 'Restore retry policy',
    evidenceEventIds: ['evt-a'],
    rootCauseType: 'retry_strategy_failure',
  }

  const observer = createObserver({ store })
  const run = await observer.startRun({ id: 'run_unsupported' })
  await observer.record(
    createFileWriteEvent({
      id: 'w-a1',
      runId: run.id,
      timestamp: '2026-08-23T21:00:00.000Z',
      sequence: 1,
      path: 'auth.py',
      content: 'A',
    }),
  )
  await observer.record(
    createFileWriteEvent({
      id: 'w-b',
      runId: run.id,
      timestamp: '2026-08-23T21:00:01.000Z',
      sequence: 2,
      path: 'auth.py',
      content: 'B',
    }),
  )
  const third = await observer.record(
    createFileWriteEvent({
      id: 'w-a2',
      runId: run.id,
      timestamp: '2026-08-23T21:00:02.000Z',
      sequence: 3,
      path: 'auth.py',
      content: 'A',
    }),
  )
  await observer.finishRun('failed')
  const incidentId = third.detections[0]!.incident.id
  const { updateIncident } = await import('../src/store.ts')
  await updateIncident(store, incidentId, { treatment })

  const { lines, logger } = captureLogger()
  const result = await runFixCommand({ incidentId, store, logger })
  assert.equal(result.exitCode, 1)
  assert.ok(lines.some((line) => line.includes('No treatment adapter')))
})
