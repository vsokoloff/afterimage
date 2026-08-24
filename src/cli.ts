#!/usr/bin/env node
/**
 * Thin local CLI for the Afterimage hospital.
 * Not a published global package yet — use `npm run lucid -- <cmd>`.
 */
import { authWriterCase } from './case.ts'
import {
  getPrimaryDisease,
  listDepartments,
  shortHash,
} from './departments/index.ts'
import { printTrace } from './display.ts'
import { agentTraceFromAttempts, fileWritesFromAttempts } from './events.ts'
import { parseRunArgv } from './runtime/parse.ts'
import { runCommand } from './runtime/index.ts'
import {
  resolveRunIncidentPolicy,
  resolveWebBaseUrl,
} from './runtime/policy.ts'
import { openStore } from './store.ts'
import { parseFixArgv, runFixCommand } from './treatment/index.ts'

const USAGE = `Lucid hospital (local)

Usage:
  npm run lucid -- <command>

Commands:
  run [options] -- <cmd...>
                   Run a command under Lucid observation (persists a run)
  init             Stub — create a local Lucid config
  attach           Stub — attach Lucid to an agent runtime
  status           Show fixture incident status
  doctor           Run Looping → repeated-file-state on the fixture
  inspect          Show evidence + diagnosis for the fixture
  fix <incident-id>  Review and optionally apply treatment for a real incident
  recheck          Verify the post-treatment fixture trace
  departments      List departments and disease status

Run options:
  --policy observe|terminate-on-critical
                   Default: observe (alert only; wrapped process keeps running)
  --web-url URL    Local UI base for incident links (default: http://127.0.0.1:3000)

  npm run lucid -- run -- node -e "console.log('hi')"
  npm run lucid -- run --policy observe -- node ./agent.mjs
  npm run lucid -- fix inc_abc123
  npm run lucid -- fix inc_abc123 --apply --yes
  npm run lucid -- fix inc_abc123 --rollback --yes

Today only Looping → repeated-file-state is shipped.
Lucid run observes the subprocess only — not agent tool/model internals yet.
`

function contextFromCase() {
  return {
    symptom: authWriterCase.symptom,
    rootCause: authWriterCase.rootCause,
    treatment: authWriterCase.treatment,
  }
}

function fixtureBefore() {
  return agentTraceFromAttempts('fixture-before', authWriterCase.attempts, {
    idPrefix: 'before',
  })
}

function fixtureAfter() {
  return agentTraceFromAttempts('fixture-after', authWriterCase.recheck, {
    idPrefix: 'after',
  })
}

async function cmdRun(): Promise<number> {
  const parsed = parseRunArgv(process.argv)
  if (!parsed) {
    console.error('Usage: npm run lucid -- run -- <command...>')
    return 1
  }

  const store = await openStore()
  const result = await runCommand({
    store,
    command: parsed.command,
    cwd: process.cwd(),
    incidentPolicy: resolveRunIncidentPolicy(parsed.policy),
    webBaseUrl: resolveWebBaseUrl(parsed.webBaseUrl),
  })

  console.log('Lucid run complete')
  console.log(`  run id:    ${result.run.id}`)
  console.log(`  status:    ${result.run.status}`)
  console.log(`  events:    ${result.run.events.length}`)
  console.log(`  cwd:       ${process.cwd()}`)
  console.log(`  exit code: ${result.exitCode ?? '—'}`)
  if (result.signal) console.log(`  signal:    ${result.signal}`)
  if (result.incidentsOpened > 0) {
    console.log(`  incidents: ${result.incidentsOpened} opened`)
  }
  console.log()
  console.log('Agent internals (tool calls, model turns) are not observed in v1.')

  return result.exitCode ?? 1
}

function cmdStatus(): void {
  const disease = getPrimaryDisease()
  console.log('Lucid status')
  console.log(`  mode:          local`)
  console.log(`  attached:      no (use attach — stub)`)
  console.log(`  department:    ${disease.department}`)
  console.log(`  disease:       ${disease.id} [${disease.status}]`)
  console.log(`  patient:       ${authWriterCase.patient.name}`)
  console.log(`  complaint:     ${authWriterCase.patient.complaint}`)
}

function cmdDoctor(): void {
  const disease = getPrimaryDisease()
  const before = fixtureBefore()
  const abnormality = disease.detect(before)
  printTrace(
    fileWritesFromAttempts('fixture-before', authWriterCase.attempts, {
      idPrefix: 'before',
    }),
    abnormality?.signal ?? null,
  )
  console.log()
  console.log(
    abnormality
      ? `doctor: ABNORMAL — ${disease.department}/${disease.id}`
      : `doctor: clear — ${disease.department}/${disease.id}`,
  )
}

function cmdInspect(): void {
  const disease = getPrimaryDisease()
  const diagnosis = disease.diagnose(fixtureBefore(), contextFromCase())
  console.log('inspect')
  console.log(`  department:  ${diagnosis.department}`)
  console.log(`  disease:     ${diagnosis.disease}`)
  console.log(`  status:      ${diagnosis.status}`)
  console.log(`  symptom:     ${diagnosis.symptom}`)
  console.log(`  evidence:    ${diagnosis.evidence}`)
  if (diagnosis.abnormality) {
    const { signal } = diagnosis.abnormality
    console.log(`  file:        ${signal.file}`)
    console.log(`  first seen:  seq ${signal.firstSeenTurn} (${signal.firstSeenEventId})`)
    console.log(`  repeated:    seq ${signal.repeatedAtTurn} (${signal.repeatedEventId})`)
    console.log(`  hash:        ${signal.hash.slice(0, 12)}…`)
  }
  if (diagnosis.rootCause) {
    console.log(`  root cause:  ${diagnosis.rootCause.title}`)
    console.log(`  summary:     ${diagnosis.rootCause.summary}`)
  }
}

async function cmdFix(): Promise<number> {
  const parsed = parseFixArgv(process.argv)
  if (!parsed) {
    console.error('Usage: npm run lucid -- fix <incident-id> [--apply] [--yes] [--rollback]')
    return 1
  }

  const store = await openStore()
  const result = await runFixCommand({
    incidentId: parsed.incidentId,
    store,
    apply: parsed.apply,
    yes: parsed.yes,
    rollback: parsed.rollback,
    confirm: parsed.yes
      ? undefined
      : async (message) => {
          console.error(message)
          console.error('Re-run with --yes to confirm.')
          return false
        },
  })
  return result.exitCode
}

function cmdRecheck(): void {
  const disease = getPrimaryDisease()
  const result = disease.verify(fixtureBefore(), fixtureAfter())
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
  console.log('Lucid is local-first; init/attach will write a config and')
  console.log('hook an agent runtime so the hospital can observe quietly.')
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'help'

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      console.log(USAGE)
      break
    case 'run':
      process.exitCode = await cmdRun()
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
      process.exitCode = await cmdFix()
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
}

void main()
