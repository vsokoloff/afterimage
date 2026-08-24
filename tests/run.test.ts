import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  assert.deepEqual(
    parseRunArgv([
      'node',
      'cli.js',
      'run',
      '--policy',
      'observe',
      '--web-url',
      'http://localhost:4000',
      '--',
      'echo',
      'hi',
    ]),
    {
      command: ['echo', 'hi'],
      policy: 'observe',
      webBaseUrl: 'http://localhost:4000',
    },
  )
  assert.equal(parseRunArgv(['node', 'cli.js', 'run', '--policy', 'nope', '--', 'echo']), null)
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
    // Gaps are under debounceMs so capture must not last-write-wins coalesce.
    const script = [
      "const fs = require('fs/promises');",
      "const target = 'loop-target.txt';",
      '(async () => {',
      "  await fs.writeFile(target, 'state-A');",
      '  await new Promise((r) => setTimeout(r, 50));',
      "  await fs.writeFile(target, 'state-B');",
      '  await new Promise((r) => setTimeout(r, 50));',
      "  await fs.writeFile(target, 'state-A');",
      '})();',
    ].join(' ')

    const result = await runCommand({
      store,
      command: [process.execPath, '-e', script],
      cwd: storeRoot,
      filesystemDebounceMs: 100,
      alertWriter: { write: () => {} },
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

test('runCommand detects loop when file already had A and process only writes B→A', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-run-seed-loop-'))
  try {
    const store = await openStore({ projectRoot: storeRoot })
    await writeFile(path.join(storeRoot, 'auth.py'), 'state-A', 'utf8')

    const script = [
      "const fs = require('fs/promises');",
      "const target = 'auth.py';",
      '(async () => {',
      "  await fs.writeFile(target, 'state-B');",
      '  await new Promise((r) => setTimeout(r, 50));',
      "  await fs.writeFile(target, 'state-A');",
      '})();',
    ].join(' ')

    const result = await runCommand({
      store,
      command: [process.execPath, '-e', script],
      cwd: storeRoot,
      filesystemDebounceMs: 100,
      alertWriter: { write: () => {} },
    })

    assert.equal(result.exitCode, 0)
    assert.ok(result.incidentsOpened >= 1)

    const reloaded = await getRun(store, result.run.id)
    assert.ok(reloaded)
    const authWrites = reloaded.events.filter(
      (e) => e.type === 'file_write' && e.path === 'auth.py',
    )
    assert.ok(authWrites.length >= 3)
    const contents = authWrites.map((e) => (e.type === 'file_write' ? e.content : ''))
    assert.deepEqual(contents.slice(0, 3), ['state-A', 'state-B', 'state-A'])

    const incidents = await listIncidents(store)
    assert.ok(
      incidents.some(
        (incident) =>
          incident.runId === result.run.id && incident.disease === 'repeated-file-state',
      ),
    )
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})

test('runCommand prints mid-run incident alert via callback', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-run-alert-'))
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

    const alerts: string[] = []
    const result = await runCommand({
      store,
      command: [process.execPath, '-e', script],
      cwd: storeRoot,
      filesystemDebounceMs: 60,
      webBaseUrl: 'http://127.0.0.1:3000',
      alertWriter: { write: (chunk) => alerts.push(chunk) },
    })

    assert.equal(result.detections.length, 1)
    assert.match(alerts.join(''), /🚨 Lucid detected a repeated file-state loop/)
    assert.match(alerts.join(''), /incident:\s+inc_/)
    assert.match(alerts.join(''), /file:\s+loop-target\.txt/)
    assert.match(alerts.join(''), /first:\s+turn 2/)
    assert.match(alerts.join(''), /repeated:\s+turn 4/)
    assert.match(alerts.join(''), /view:\s+http:\/\/127\.0\.0\.1:3000\/#\/incidents\/inc_/)
    assert.match(alerts.join(''), /policy:\s+observe — wrapped process continues running/)
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})

test('runCommand observe policy does not terminate wrapped process on incident', async () => {
  const storeRoot = await mkdtemp(path.join(os.tmpdir(), 'lucid-run-observe-'))
  try {
    const store = await openStore({ projectRoot: storeRoot })
    const script = [
      "const fs = require('fs/promises');",
      '(async () => {',
      "  await fs.writeFile('loop-target.txt', 'state-A');",
      '  await new Promise((r) => setTimeout(r, 120));',
      "  await fs.writeFile('loop-target.txt', 'state-B');",
      '  await new Promise((r) => setTimeout(r, 120));',
      "  await fs.writeFile('loop-target.txt', 'state-A');",
      '  await new Promise((r) => setTimeout(r, 120));',
      "  console.log('finished-after-loop');",
      '})();',
    ].join(' ')

    const result = await runCommand({
      store,
      command: [process.execPath, '-e', script],
      cwd: storeRoot,
      filesystemDebounceMs: 60,
      incidentPolicy: 'observe',
      alertWriter: { write: () => {} },
    })

    assert.equal(result.exitCode, 0)
    assert.match(
      result.run.events
        .filter((event) => event.type === 'process_output')
        .map((event) => (event.type === 'process_output' ? event.text : ''))
        .join(''),
      /finished-after-loop/,
    )
  } finally {
    await rm(storeRoot, { recursive: true, force: true })
  }
})
