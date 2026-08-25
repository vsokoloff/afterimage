import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { formatIncidentAlert } from '../src/runtime/incident-alert.ts'
import { formatPetIncidentAlert, formatPetWatchingIntro } from '../src/runtime/pet-alert.ts'
import {
  cursorHookToRecordableEvents,
  handleCursorHook,
  installCursorHooks,
} from '../src/runtime/cursor/index.ts'
import { openStore, listIncidents, getRun } from '../src/store.ts'
import type { IncidentDetected } from '../src/observer.ts'

function sampleLoopDetection(): IncidentDetected {
  return {
    type: 'incident_detected',
    runId: 'run_1',
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

test('pet alert shows Kitty face and disease blurb', () => {
  const alert = formatPetIncidentAlert(sampleLoopDetection(), 'http://127.0.0.1:3000')
  assert.match(alert, /\/\\_\/\\/)
  assert.match(alert, /Kitty noticed something/)
  assert.match(alert, /auth\.py looped back to an old state/)
  assert.match(alert, /inc_alert_test/)
})

test('formatIncidentAlert is pet-styled', () => {
  const alert = formatIncidentAlert(sampleLoopDetection(), 'http://127.0.0.1:3000', 'observe')
  assert.match(alert, /Kitty noticed something/)
  assert.match(alert, /meow:/)
  assert.match(alert, /policy:\s+observe/)
})

test('watching intro is cheerful', () => {
  assert.match(formatPetWatchingIntro(), /\^\.\^/)
  assert.match(formatPetWatchingIntro(), /watching this Cursor session/)
})

test('cursor afterFileEdit normalizes to file_write from disk', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'afterimage-cursor-norm-'))
  try {
    await writeFile(path.join(root, 'auth.py'), 'state-A\n', 'utf8')
    const events = await cursorHookToRecordableEvents(
      {
        hook_event_name: 'afterFileEdit',
        file_path: 'auth.py',
        workspace_roots: [root],
        conversation_id: 'conv-1',
      },
      { workspaceRoot: root, retainFileContent: true },
    )
    assert.equal(events.length, 1)
    assert.equal(events[0]?.type, 'file_write')
    if (events[0]?.type === 'file_write') {
      assert.equal(events[0].path, 'auth.py')
      assert.equal(events[0].content, 'state-A\n')
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('cursor hooks detect A→B→A across afterFileEdit invocations', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'afterimage-cursor-loop-'))
  try {
    const store = await openStore({ projectRoot: root })
    const filePath = path.join(root, 'auth.py')
    const conversationId = 'conv-loop'
    const alerts: string[] = []

    await writeFile(filePath, 'A', 'utf8')
    await handleCursorHook({
      store,
      desktopNotify: false,
      alertWriter: { write: (chunk) => alerts.push(chunk) },
      payload: {
        hook_event_name: 'afterFileEdit',
        conversation_id: conversationId,
        workspace_roots: [root],
        file_path: 'auth.py',
      },
    })

    await writeFile(filePath, 'B', 'utf8')
    await handleCursorHook({
      store,
      desktopNotify: false,
      alertWriter: { write: (chunk) => alerts.push(chunk) },
      payload: {
        hook_event_name: 'afterFileEdit',
        conversation_id: conversationId,
        workspace_roots: [root],
        file_path: 'auth.py',
      },
    })

    await writeFile(filePath, 'A', 'utf8')
    const third = await handleCursorHook({
      store,
      desktopNotify: false,
      alertWriter: { write: (chunk) => alerts.push(chunk) },
      payload: {
        hook_event_name: 'afterFileEdit',
        conversation_id: conversationId,
        workspace_roots: [root],
        file_path: 'auth.py',
      },
    })

    assert.equal(third.detections.length, 1)
    assert.equal(third.detections[0]?.disease, 'repeated-file-state')
    assert.match(alerts.join(''), /Kitty noticed something/)
    assert.match(third.petAlert ?? '', /auth\.py/)

    const incidents = await listIncidents(store)
    assert.equal(incidents.length, 1)
    assert.ok(third.runId)
    const run = await getRun(store, third.runId!)
    assert.equal(run?.events.filter((e) => e.type === 'file_write').length, 3)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('installCursorHooks writes hooks.json and observe script', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'afterimage-cursor-install-'))
  // This test file compiles to dist/tests/cursor-hooks.test.js → package root is ../..
  const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  try {
    const result = await installCursorHooks({
      projectRoot: project,
      packageRoot: pkg,
    })
    const hooks = JSON.parse(await readFile(result.hooksJsonPath, 'utf8')) as {
      hooks: Record<string, Array<{ command: string }>>
    }
    assert.ok(hooks.hooks.afterFileEdit?.some((h) => h.command.includes('afterimage-observe')))
    assert.ok(result.observeScriptPath.endsWith('afterimage-observe.mjs'))
    assert.ok(hooks.hooks.sessionStart?.length)
    const script = await readFile(result.observeScriptPath, 'utf8')
    assert.match(script, /runCursorHookCli/)
    const legacy = await readFile(
      path.join(project, '.cursor', 'hooks', 'afterimage-observe.mjs'),
      'utf8',
    )
    assert.match(legacy, /runCursorHookCli/)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test('sessionStart returns kitty watching intro', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'afterimage-cursor-session-'))
  try {
    const store = await openStore({ projectRoot: root })
    const result = await handleCursorHook({
      store,
      desktopNotify: false,
      payload: {
        hook_event_name: 'sessionStart',
        conversation_id: 'conv-start',
        workspace_roots: [root],
      },
    })
    assert.ok(result.response)
    assert.match(String(result.response.additional_context), /Kitty|watching/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
