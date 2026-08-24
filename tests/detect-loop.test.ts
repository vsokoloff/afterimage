import assert from 'node:assert/strict'
import test from 'node:test'

import { authWriterCase } from '../src/case.ts'
import { detectLoop, hashContent, shortHash } from '../src/detect-loop.ts'
import type { FileEdit } from '../src/types.ts'

test('detects A → B → A for auth.py', () => {
  const signal = detectLoop(authWriterCase.attempts)
  assert.ok(signal)
  assert.equal(signal.file, 'auth.py')
  assert.equal(signal.firstSeenTurn, 1)
  assert.equal(signal.repeatedAtTurn, 3)
  assert.equal(signal.hash, hashContent(authWriterCase.attempts[0]!.content))
})

test('does not detect A → B → C', () => {
  const edits: FileEdit[] = [
    { turn: 1, file: 'auth.py', content: 'A' },
    { turn: 2, file: 'auth.py', content: 'B' },
    { turn: 3, file: 'auth.py', content: 'C' },
  ]
  assert.equal(detectLoop(edits), null)
})

test('does not confuse equal content in different files', () => {
  const edits: FileEdit[] = [
    { turn: 1, file: 'auth.py', content: 'same' },
    { turn: 2, file: 'users.py', content: 'same' },
  ]
  assert.equal(detectLoop(edits), null)
})

test('recheck run has no loop', () => {
  assert.equal(detectLoop(authWriterCase.recheck), null)
})

test('short hash is the first six hex characters', () => {
  assert.equal(shortHash('hello'), hashContent('hello').slice(0, 6))
})
