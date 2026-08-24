import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { openStore } from '../src/store.ts'
import {
  parseUmaArgv,
  rememberUmaPreference,
  loadUmaMemory,
  forgetUmaPreference,
  renderUmaMemoryMarkdown,
  umaCursorRulePath,
} from '../src/uma/index.ts'

describe('uma argv', () => {
  it('parses remember with --about and --', () => {
    assert.deepEqual(
      parseUmaArgv([
        'node',
        'cli',
        'uma',
        'remember',
        '--about',
        'hero',
        '--',
        'Full-bleed',
        'photo',
      ]),
      {
        action: 'remember',
        about: 'hero',
        text: 'Full-bleed photo',
      },
    )
  })

  it('parses show and forget', () => {
    assert.deepEqual(parseUmaArgv(['node', 'cli', 'uma', 'show', '--about', 'nav']), {
      action: 'show',
      about: 'nav',
    })
    assert.deepEqual(parseUmaArgv(['node', 'cli', 'uma', 'forget', '--id', 'uma_hero_1']), {
      action: 'forget',
      about: null,
      id: 'uma_hero_1',
    })
  })
})

describe('uma memory', () => {
  it('remembers preferences and mirrors Cursor rule', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lucid-uma-'))
    try {
      const store = await openStore({ projectRoot: root, storeRoot: path.join(root, '.lucid') })
      const { entry } = await rememberUmaPreference(store, {
        about: 'hero',
        text: 'Brand first, one headline, full-bleed image',
        now: new Date('2026-08-24T12:00:00.000Z'),
      })
      assert.equal(entry.about, 'hero')
      assert.match(entry.text, /Brand first/)

      const memory = await loadUmaMemory(store)
      assert.equal(memory.entries.length, 1)

      const rule = await readFile(umaCursorRulePath(root), 'utf8')
      assert.match(rule, /## hero/)
      assert.match(rule, /Brand first/)
      assert.match(renderUmaMemoryMarkdown(memory), /Uma — UI design memory/)

      const forgot = await forgetUmaPreference(store, { about: 'hero' })
      assert.equal(forgot.removed, 1)
      assert.equal(forgot.memory.entries.length, 0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
