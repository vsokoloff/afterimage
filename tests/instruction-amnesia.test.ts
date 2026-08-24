import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  detectInstructionAmnesia,
  extractConstraintsFromText,
  formatInstructionAmnesiaEvidence,
  instructionAmnesia,
} from '../src/departments/instructions/instruction-amnesia/index.ts'
import {
  loadProjectInstructions,
  saveProjectInstructions,
  upsertProjectInstruction,
} from '../src/instructions/store.ts'
import {
  createFileWriteEvent,
  type AgentEvent,
  type AgentRun,
  type PromptEvent,
  type ToolCallEvent,
} from '../src/events.ts'
import { openStore } from '../src/store.ts'

function runFromEvents(events: AgentEvent[]): AgentRun {
  return {
    id: 'run-amnesia',
    startedAt: '2026-08-24T12:00:00.000Z',
    status: 'completed',
    events,
  }
}

function prompt(sequence: number, text: string, role: PromptEvent['role'] = 'user'): PromptEvent {
  return {
    type: 'prompt',
    id: `prompt-${sequence}`,
    runId: 'run-amnesia',
    timestamp: `2026-08-24T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    sequence,
    role,
    text,
  }
}

function write(sequence: number, filePath: string) {
  return createFileWriteEvent({
    id: `fw-${sequence}`,
    runId: 'run-amnesia',
    timestamp: `2026-08-24T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    sequence,
    path: filePath,
    content: `content-${filePath}`,
  })
}

function toolCall(sequence: number, toolName: string): ToolCallEvent {
  return {
    type: 'tool_call',
    id: `tool-${sequence}`,
    runId: 'run-amnesia',
    timestamp: `2026-08-24T12:00:${String(sequence).padStart(2, '0')}.000Z`,
    sequence,
    toolName,
  }
}

test('instruction-amnesia: extracts only-edit / do-not-touch / do-not-use', () => {
  const constraints = extractConstraintsFromText(
    'Only edit auth.py. Do not touch users.py. Do not use shell.',
  )
  assert.equal(constraints.length, 3)
  assert.ok(constraints.some((item) => item.kind === 'only-edit'))
  assert.ok(constraints.some((item) => item.kind === 'forbid-path'))
  assert.ok(constraints.some((item) => item.kind === 'forbid-tool'))
})

test('instruction-amnesia: only-edit violation is critical', () => {
  const events = [
    prompt(1, 'Only edit auth.py'),
    write(2, 'auth.py'),
    write(3, 'users.py'),
  ]
  const abnormality = detectInstructionAmnesia({ run: runFromEvents(events) })
  assert.ok(abnormality)
  assert.equal(abnormality.kind, 'instruction-amnesia')
  assert.equal(abnormality.signal.constraintKind, 'only-edit')
  assert.match(abnormality.signal.violatingDetail, /users\.py/)
  assert.match(formatInstructionAmnesiaEvidence(abnormality.signal), /^instruction-amnesia/)
})

test('instruction-amnesia: do-not-touch violation is critical', () => {
  const events = [
    prompt(1, 'Do not modify legacy.py'),
    write(2, 'auth.py'),
    write(3, 'legacy.py'),
  ]
  const abnormality = detectInstructionAmnesia({ run: runFromEvents(events) })
  assert.ok(abnormality)
  assert.equal(abnormality.signal.constraintKind, 'forbid-path')
})

test('instruction-amnesia: compliant multi-file under only-edit is clear when all match', () => {
  const events = [
    prompt(1, 'Only edit auth.py'),
    write(2, 'auth.py'),
    write(3, 'auth.py'),
  ]
  assert.equal(detectInstructionAmnesia({ run: runFromEvents(events) }), null)
})

test('instruction-amnesia: do-not-use tool violation', () => {
  const events = [
    prompt(1, 'Do not use shell'),
    toolCall(2, 'shell'),
  ]
  const abnormality = detectInstructionAmnesia({ run: runFromEvents(events) })
  assert.ok(abnormality)
  assert.equal(abnormality.signal.constraintKind, 'forbid-tool')
})

test('instruction-amnesia: project instructions store round-trip (no API key)', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-instructions-'))
  try {
    const store = await openStore({ projectRoot })
    await upsertProjectInstruction(store, {
      id: 'inst-1',
      text: 'only edit auth.py',
      onlyPaths: ['auth.py'],
    })
    const loaded = await loadProjectInstructions(store)
    assert.equal(loaded.length, 1)
    assert.deepEqual(loaded[0]?.onlyPaths, ['auth.py'])

    const events = [write(1, 'users.py')]
    const abnormality = detectInstructionAmnesia({
      run: runFromEvents(events),
      projectInstructions: loaded,
    })
    assert.ok(abnormality)
    assert.equal(abnormality.signal.constraintKind, 'only-edit')

    await saveProjectInstructions(store, [])
    assert.deepEqual(await loadProjectInstructions(store), [])
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test('instruction-amnesia: pipeline detect → diagnose → recommend → verify', () => {
  const before = {
    run: runFromEvents([prompt(1, 'Only edit auth.py'), write(2, 'users.py')]),
  }
  const after = {
    run: runFromEvents([prompt(1, 'Only edit auth.py'), write(2, 'auth.py')]),
  }
  assert.ok(instructionAmnesia.detect(before))
  const diagnosis = instructionAmnesia.diagnose(before)
  assert.equal(diagnosis.status, 'critical')
  assert.ok(instructionAmnesia.recommendFix(diagnosis))
  assert.equal(instructionAmnesia.verify(before, after).passed, true)
})
