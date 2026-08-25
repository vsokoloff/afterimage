import assert from 'node:assert/strict'
import test from 'node:test'

import { retainFileContentFromEnv, stripFileWriteBodies } from '../src/privacy.ts'

test('retainFileContentFromEnv is off by default', () => {
  assert.equal(retainFileContentFromEnv({}), false)
  assert.equal(retainFileContentFromEnv({ LUCID_STORE_FILE_CONTENT: '' }), false)
  assert.equal(retainFileContentFromEnv({ LUCID_STORE_FILE_CONTENT: '0' }), false)
})

test('retainFileContentFromEnv accepts truthy opt-in values', () => {
  assert.equal(retainFileContentFromEnv({ LUCID_STORE_FILE_CONTENT: '1' }), true)
  assert.equal(retainFileContentFromEnv({ LUCID_STORE_FILE_CONTENT: 'true' }), true)
  assert.equal(retainFileContentFromEnv({ LUCID_STORE_FILE_CONTENT: 'YES' }), true)
  assert.equal(retainFileContentFromEnv({ LUCID_STORE_FILE_CONTENT: 'on' }), true)
  assert.equal(retainFileContentFromEnv({ AFTERIMAGE_STORE_FILE_CONTENT: '1' }), true)
})

test('stripFileWriteBodies removes content fields unless retained', () => {
  const event = {
    type: 'file_write' as const,
    path: 'auth.py',
    content: 'secret',
    contentHashInput: 'secret',
    hash: 'abc',
    byteLength: 6,
    ok: true,
  }

  const stripped = stripFileWriteBodies(event, false)
  assert.equal('content' in stripped, false)
  assert.equal('contentHashInput' in stripped, false)
  assert.equal(stripped.hash, 'abc')
  assert.equal(stripped.byteLength, 6)

  const kept = stripFileWriteBodies(event, true)
  assert.equal(kept.content, 'secret')
  assert.equal(kept.contentHashInput, 'secret')
})
