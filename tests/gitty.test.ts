import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { draftCommitMessage, parseGittyArgv, defaultGittyHabits } from '../src/gitty/index.ts'

describe('gitty argv', () => {
  it('parses gitty push', () => {
    assert.deepEqual(parseGittyArgv(['node', 'cli', 'gitty', 'push']), {
      action: 'push',
      message: null,
      dryRun: false,
    })
  })

  it('parses message and dry-run', () => {
    assert.deepEqual(
      parseGittyArgv(['node', 'cli', 'gitty', 'push', '--message', 'Ship it', '--dry-run']),
      {
        action: 'push',
        message: 'Ship it',
        dryRun: true,
      },
    )
  })

  it('rejects unknown flags', () => {
    assert.equal(parseGittyArgv(['node', 'cli', 'gitty', 'push', '--force']), null)
  })
})

describe('gitty habits', () => {
  it('remembers push = commit + explain + push + pr + autosave', () => {
    const habits = defaultGittyHabits(new Date('2026-08-24T00:00:00.000Z'))
    assert.equal(habits.push.commit, true)
    assert.equal(habits.push.explain, true)
    assert.equal(habits.push.push, true)
    assert.equal(habits.push.pr, true)
    assert.equal(habits.push.autosaveOnChange, true)
    assert.match(habits.push.note, /codebase changes/i)
  })
})

describe('draftCommitMessage', () => {
  it('describes gitty + kitty branding together', () => {
    const msg = draftCommitMessage({
      status: ' M web/characters.js\n M src/cli.ts\n A src/gitty/push.ts',
      diffStat: '',
      recentLog: '',
    })
    assert.match(msg, /Gitty/i)
  })
})
