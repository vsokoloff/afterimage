import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createFilesystemWatcher,
  shouldIgnoreWorkspacePath,
} from '../src/runtime/filesystem-watcher.ts'

test('shouldIgnoreWorkspacePath skips git, node_modules, lucid, binary', () => {
  assert.equal(shouldIgnoreWorkspacePath('.git/config'), true)
  assert.equal(shouldIgnoreWorkspacePath('node_modules/pkg/index.js'), true)
  assert.equal(shouldIgnoreWorkspacePath('.lucid/runs/x.json'), true)
  assert.equal(shouldIgnoreWorkspacePath('dist/out.js'), true)
  assert.equal(shouldIgnoreWorkspacePath('photo.png'), true)
  assert.equal(shouldIgnoreWorkspacePath('src/auth.py'), false)
})

test('filesystem watcher debounces duplicate events for one logical write', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lucid-fs-'))
  try {
    const target = path.join(root, 'auth.py')
    await writeFile(target, 'state-A', 'utf8')

    const writes: string[] = []
    const watcher = createFilesystemWatcher({
      workspaceRoot: root,
      debounceMs: 40,
      onWrite: async ({ content }) => {
        writes.push(content)
      },
    })

    watcher.start()
    await watcher.observePath('auth.py')
    await writeFile(target, 'state-A', 'utf8')
    await watcher.observePath('auth.py')
    await watcher.stop()

    assert.equal(writes.length, 1)
    assert.equal(writes[0], 'state-A')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('filesystem watcher emits again when content hash changes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lucid-fs-change-'))
  try {
    const target = path.join(root, 'auth.py')
    await writeFile(target, 'state-A', 'utf8')

    const writes: string[] = []
    const watcher = createFilesystemWatcher({
      workspaceRoot: root,
      debounceMs: 20,
      onWrite: async ({ content }) => {
        writes.push(content)
      },
    })

    watcher.start()
    await watcher.observePath('auth.py')
    await writeFile(target, 'state-B', 'utf8')
    await watcher.observePath('auth.py')
    await watcher.stop()

    assert.deepEqual(writes, ['state-A', 'state-B'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('snapshot seeds baseline so pre-existing A then B→A yields A→B→A', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lucid-fs-seed-'))
  try {
    const target = path.join(root, 'auth.py')
    await writeFile(target, 'state-A', 'utf8')

    const writes: string[] = []
    const watcher = createFilesystemWatcher({
      workspaceRoot: root,
      debounceMs: 30,
      onWrite: async ({ content }) => {
        writes.push(content)
      },
    })

    watcher.start()
    await watcher.snapshot()
    assert.deepEqual(writes, [])

    await writeFile(target, 'state-B', 'utf8')
    await watcher.observePath('auth.py')
    await writeFile(target, 'state-A', 'utf8')
    await watcher.observePath('auth.py')
    await watcher.stop()

    assert.deepEqual(writes, ['state-A', 'state-B', 'state-A'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('distinct hashes inside a debounce window are not collapsed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lucid-fs-fast-'))
  try {
    const target = path.join(root, 'auth.py')
    await writeFile(target, 'state-A', 'utf8')

    const writes: string[] = []
    const watcher = createFilesystemWatcher({
      workspaceRoot: root,
      debounceMs: 80,
      onWrite: async ({ content }) => {
        writes.push(content)
      },
    })

    watcher.start()
    await watcher.noticeChange('auth.py')
    await writeFile(target, 'state-B', 'utf8')
    await watcher.noticeChange('auth.py')
    await writeFile(target, 'state-A', 'utf8')
    await watcher.noticeChange('auth.py')
    await watcher.stop()

    assert.deepEqual(writes, ['state-A', 'state-B', 'state-A'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
