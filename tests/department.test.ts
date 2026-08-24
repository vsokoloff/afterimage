import assert from 'node:assert/strict'
import test from 'node:test'

import { authWriterCase } from '../src/case.ts'
import {
  getPrimaryDisease,
  listDepartments,
} from '../src/departments/index.ts'

test('primary disease is looping / repeated-file-state', () => {
  const disease = getPrimaryDisease()
  assert.equal(disease.department, 'looping')
  assert.equal(disease.id, 'repeated-file-state')
  assert.equal(disease.status, 'shipped')
})

test('department pipeline: detect → diagnose → recommend → verify', () => {
  const disease = getPrimaryDisease()
  const before = { edits: authWriterCase.attempts }
  const after = { edits: authWriterCase.recheck }
  const context = {
    symptom: authWriterCase.symptom,
    rootCause: authWriterCase.rootCause,
    treatment: authWriterCase.treatment,
  }

  const abnormality = disease.detect(before)
  assert.ok(abnormality)
  assert.equal(abnormality.kind, 'repeated-file-state')

  const diagnosis = disease.diagnose(before, context)
  assert.equal(diagnosis.status, 'critical')
  assert.equal(diagnosis.rootCause?.title, 'Conflicting instructions')

  const plan = disease.recommendFix(diagnosis, context)
  assert.ok(plan)
  assert.equal(plan.requiresReview, true)
  assert.equal(plan.safeToAutoApply, false)
  assert.equal(plan.target, 'Agent instructions')

  const verification = disease.verify(before, after)
  assert.equal(verification.passed, true)
})

test('registry lists five departments with only one shipped disease', () => {
  const departments = listDepartments()
  assert.equal(departments.length, 5)
  const shipped = departments.flatMap((dept) =>
    dept.diseases.filter((disease) => disease.status === 'shipped'),
  )
  assert.equal(shipped.length, 1)
  assert.equal(shipped[0]?.id, 'repeated-file-state')
})
