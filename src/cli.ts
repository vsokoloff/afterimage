#!/usr/bin/env node
/**
 * Thin local CLI for the Afterimage hospital.
 * Not a published global package yet — use `npm run lucid -- <cmd>`.
 *
 * Real today: status, doctor, inspect, fix, recheck, departments (fixture case).
 * Stubbed: init, attach.
 */
import { authWriterCase } from './case.ts'
import {
  getPrimaryDisease,
  listDepartments,
  shortHash,
} from './departments/index.ts'
import { printTrace } from './display.ts'

const USAGE = `Afterimage hospital (local)

Usage:
  npm run lucid -- <command>

Commands:
  init          Stub — create a local Afterimage config
  attach        Stub — attach Afterimage to an agent runtime
  status        Show fixture incident status
  doctor        Run Looping → repeated-file-state on the fixture
  inspect       Show evidence + diagnosis for the fixture
  fix           Show prescribed treatment (review required)
  recheck       Verify the post-treatment fixture trace
  departments   List departments and disease status

Today only Looping → repeated-file-state is shipped.
Treatment means applying the change associated with the diagnosis
(instructions, memory policy, tools, …) — not “ask AI to fix code.”
`

function contextFromCase() {
  return {
    symptom: authWriterCase.symptom,
    rootCause: authWriterCase.rootCause,
    treatment: authWriterCase.treatment,
  }
}

function cmdStatus(): void {
  const disease = getPrimaryDisease()
  console.log('Afterimage status')
  console.log(`  mode:          local fixture (Auth Agent)`)
  console.log(`  attached:      no (use attach — stub)`)
  console.log(`  department:    ${disease.department}`)
  console.log(`  disease:       ${disease.id} [${disease.status}]`)
  console.log(`  patient:       ${authWriterCase.patient.name}`)
  console.log(`  complaint:     ${authWriterCase.patient.complaint}`)
}

function cmdDoctor(): void {
  const disease = getPrimaryDisease()
  const before = { edits: authWriterCase.attempts }
  const abnormality = disease.detect(before)
  printTrace(authWriterCase.attempts, abnormality?.signal ?? null)
  console.log()
  console.log(
    abnormality
      ? `doctor: ABNORMAL — ${disease.department}/${disease.id}`
      : `doctor: clear — ${disease.department}/${disease.id}`,
  )
}

function cmdInspect(): void {
  const disease = getPrimaryDisease()
  const diagnosis = disease.diagnose({ edits: authWriterCase.attempts }, contextFromCase())
  console.log('inspect')
  console.log(`  department:  ${diagnosis.department}`)
  console.log(`  disease:     ${diagnosis.disease}`)
  console.log(`  status:      ${diagnosis.status}`)
  console.log(`  symptom:     ${diagnosis.symptom}`)
  console.log(`  evidence:    ${diagnosis.evidence}`)
  if (diagnosis.abnormality) {
    const { signal } = diagnosis.abnormality
    console.log(`  file:        ${signal.file}`)
    console.log(`  first seen:  turn ${signal.firstSeenTurn}`)
    console.log(`  repeated:    turn ${signal.repeatedAtTurn}`)
    console.log(`  hash:        ${signal.hash.slice(0, 12)}…`)
  }
  if (diagnosis.rootCause) {
    console.log(`  root cause:  ${diagnosis.rootCause.title}`)
    console.log(`  summary:     ${diagnosis.rootCause.summary}`)
  }
}

function cmdFix(): void {
  const disease = getPrimaryDisease()
  const diagnosis = disease.diagnose({ edits: authWriterCase.attempts }, contextFromCase())
  const plan = disease.recommendFix(diagnosis, contextFromCase())
  if (!plan) {
    console.log('fix: nothing to prescribe (no abnormality).')
    return
  }
  console.log('fix — prescribed treatment')
  console.log(`  target:      ${plan.target}`)
  console.log(`  change:      ${plan.recommendedChange}`)
  console.log(`  instruction: ${plan.recommendedInstruction}`)
  console.log(`  why:         ${plan.why}`)
  console.log(`  review:      ${plan.requiresReview ? 'required' : 'optional'}`)
  console.log(`  auto-apply:  ${plan.safeToAutoApply ? 'allowed' : 'blocked (unsafe without review)'}`)
  console.log()
  console.log('Not applied. Unsafe / instruction changes require explicit review.')
  console.log('(Future: lucid fix --apply after confirmation.)')
}

function cmdRecheck(): void {
  const disease = getPrimaryDisease()
  const result = disease.verify(
    { edits: authWriterCase.attempts },
    { edits: authWriterCase.recheck },
  )
  console.log('recheck')
  console.log(`  passed:   ${result.passed ? 'yes' : 'no'}`)
  console.log(`  evidence: ${result.evidence}`)
  for (const edit of authWriterCase.recheck) {
    console.log(`  turn ${edit.turn}  ${edit.file}  ${shortHash(edit.content)}`)
  }
}

function cmdDepartments(): void {
  console.log('Departments')
  for (const dept of listDepartments()) {
    console.log()
    console.log(`${dept.name} (${dept.id})`)
    console.log(`  ${dept.description}`)
    for (const disease of dept.diseases) {
      const mark = disease.status === 'shipped' ? '✓' : '·'
      console.log(`  ${mark} ${disease.id}  [${disease.status}]`)
    }
  }
  console.log()
  console.log('Shipped today: looping / repeated-file-state only.')
}

function cmdStub(name: string): void {
  console.log(`${name}: not implemented yet.`)
  console.log('Afterimage is local-first; init/attach will write a config and')
  console.log('hook an agent runtime so the hospital can observe quietly.')
  console.log('Until then, use the Auth Agent fixture via doctor / inspect / fix / recheck.')
}

const command = process.argv[2] ?? 'help'

switch (command) {
  case 'help':
  case '--help':
  case '-h':
    console.log(USAGE)
    break
  case 'init':
    cmdStub('init')
    break
  case 'attach':
    cmdStub('attach')
    break
  case 'status':
    cmdStatus()
    break
  case 'doctor':
    cmdDoctor()
    break
  case 'inspect':
    cmdInspect()
    break
  case 'fix':
    cmdFix()
    break
  case 'recheck':
    cmdRecheck()
    break
  case 'departments':
    cmdDepartments()
    break
  default:
    console.error(`Unknown command: ${command}`)
    console.log(USAGE)
    process.exitCode = 1
}
