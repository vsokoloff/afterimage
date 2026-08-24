import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { parseRunArgv } from '../src/runtime/parse.ts'
import { runCommand } from '../src/runtime/index.ts'
import { getRun, openStore } from '../src/store.ts'

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
    const store = await openStore({ storeRoot })
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
    assert.equal(reloaded.events.length, 4)

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
    const store = await openStore({ storeRoot })
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
