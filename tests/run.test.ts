import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { parseRunArgv } from '../src/runtime/parse.ts'
import { runCommand } from '../src/runtime/index.ts'
import { getRun, listIncidents, openStore } from '../src/store.ts'

test('parseRunArgv extracts command after --', () => {
  assert.deepEqual(parseRunArgv(['node', 'cli.js', 'run', '--', 'echo', 'hi']), {
    command: ['echo', 'hi'],
  })
  assert.equal(parseRunArgv(['node', 'cli.js', 'status']), null)
  assert.equal(parseRunArgv(['node', 'cli.js', 'run']), null)
  assert.equal(parseRunArgv(['node', 'cli.js', 'run', '--']), null)
})

test('runCommand persists process lifecycle events', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-run-'))
  try {
    const store = await openStore({ projectRoot: storeRoot })
    const script = "console.log('lucid-run-hello'); console.error('lucid-run-warn');"
    const result = await runCommand({
      store,
      command: [process.execPath, '-e', script],
      cwd: storeRoot,
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.run.status, 'completed')
    assert.ok(result.run.id.startsWith('run_'))

    const reloaded = await getRun(store, result.run.id)
    assert.ok(reloaded)
    assert.equal(reloaded.events.filter((e) => e.type !== 'file_write').length, 4)

    const start = reloaded.events.find((e) => e.type === 'process_start')
    assert.ok(start && start.type === 'process_start')
    assert.deepEqual(start.command, [process.execPath, '-e', script])
    assert.equal(start.cwd, storeRoot)
    assert.equal(typeof start.pid, 'number')

    const stdout = reloaded.events.find(
      (e) => e.type === 'process_output' && e.stream === 'stdout',
    )
    assert.ok(stdout && stdout.type === 'process_output')
    assert.match(stdout.text, /lucid-run-hello/)

    const stderr = reloaded.events.find(
      (e) => e.type === 'process_output' && e.stream === 'stderr',
    )
    assert.ok(stderr && stderr.type === 'process_output')
    assert.match(stderr.text, /lucid-run-warn/)

    const end = reloaded.events.find((e) => e.type === 'process_end')
    assert.ok(end && end.type === 'process_end')
    assert.equal(end.exitCode, 0)
    assert.equal(end.signal, null)
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})

test('runCommand records non-zero exit as failed run', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-run-fail-'))
  try {
    const store = await openStore({ projectRoot: storeRoot })
    const result = await runCommand({
      store,
      command: [process.execPath, '-e', 'process.exit(2)'],
    })

    assert.equal(result.exitCode, 2)
    assert.equal(result.run.status, 'failed')

    const end = result.run.events.find((e) => e.type === 'process_end')
    assert.ok(end && end.type === 'process_end')
    assert.equal(end.exitCode, 2)
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})

test('runCommand observes A → B → A file writes and opens an incident', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-run-loop-'))
  try {
    const store = await openStore({ projectRoot: storeRoot })
    const script = [
      "const fs = require('fs/promises');",
      "const target = 'loop-target.txt';",
      '(async () => {',
      "  await fs.writeFile(target, 'state-A');",
      '  await new Promise((r) => setTimeout(r, 150));',
      "  await fs.writeFile(target, 'state-B');",
      '  await new Promise((r) => setTimeout(r, 150));',
      "  await fs.writeFile(target, 'state-A');",
      '})();',
    ].join(' ')

    const result = await runCommand({
      store,
      command: [process.execPath, '-e', script],
      cwd: storeRoot,
      filesystemDebounceMs: 60,
    })

    assert.equal(result.exitCode, 0)
    assert.ok(result.incidentsOpened >= 1)

    const reloaded = await getRun(store, result.run.id)
    assert.ok(reloaded)

    const fileWrites = reloaded.events.filter((e) => e.type === 'file_write')
    assert.ok(fileWrites.length >= 3)

    const loopWrites = fileWrites.filter(
      (e) => e.type === 'file_write' && e.path === 'loop-target.txt',
    )
    assert.ok(loopWrites.length >= 3)

    const contents = loopWrites.map((e) => (e.type === 'file_write' ? e.content : ''))
    assert.ok(contents.includes('state-A'))
    assert.ok(contents.includes('state-B'))

    const incidents = await listIncidents(store)
    const loopIncident = incidents.find(
      (incident) =>
        incident.runId === result.run.id && incident.disease === 'repeated-file-state',
    )
    assert.ok(loopIncident)
    assert.equal(loopIncident.status, 'open')
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})
