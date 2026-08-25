import { getDisease } from '../departments/index.ts'
import type { VerificationResult } from '../departments/types.ts'
import { successfulFileWriteEvents } from '../events.ts'
import { createObserver } from '../observer.ts'
import { runCommand } from '../runtime/index.ts'
import type { RuntimeObserveResult } from '../runtime/types.ts'
import type { RecheckRecord } from '../incident.ts'
import { getIncident, getRun, updateIncident, type AfterimageStore } from '../store.ts'
import { extractReproductionFromRun, type ReproductionSpec } from './reproduction.ts'

export type RecheckLogger = {
  log: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export type RunRecheckCommandOptions = {
  incidentId: string
  store: AfterimageStore
  /** Override reproduction when the linked run has no process_start (tests / manual). */
  reproduction?: ReproductionSpec
  runCommandFn?: (options: Parameters<typeof runCommand>[0]) => Promise<RuntimeObserveResult>
  logger?: RecheckLogger
  alertWriter?: { write: (chunk: string) => void }
  filesystemDebounceMs?: number
}

export type RunRecheckCommandResult = {
  exitCode: number
  verification: VerificationResult
  recheckRunId: string
  cleared: boolean
  incidentStatus: string
}

const defaultLogger: RecheckLogger = {
  log: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
}

function resolveReproduction(
  originalRun: Awaited<ReturnType<typeof getRun>>,
  override?: ReproductionSpec,
): ReproductionSpec | null {
  if (override) return override
  return extractReproductionFromRun(originalRun)
}

async function createSkippedRecheckRun(
  store: AfterimageStore,
  incidentId: string,
): Promise<Awaited<ReturnType<typeof getRun>>> {
  const observer = createObserver({ store })
  await observer.startRun({ agentId: `recheck:${incidentId}` })
  await observer.record({
    type: 'prompt',
    role: 'system',
    text: 'Recheck could not run: no reproduction command on the linked run.',
  })
  const run = await observer.finishRun('completed')
  return run
}

export async function runRecheckCommand(
  options: RunRecheckCommandOptions,
): Promise<RunRecheckCommandResult> {
  const logger = options.logger ?? defaultLogger
  const executeRun = options.runCommandFn ?? runCommand

  const incident = await getIncident(options.store, options.incidentId)
  if (!incident) {
    throw new Error(`Unknown incident: ${options.incidentId}`)
  }

  if (!incident.runId) {
    throw new Error(`Incident ${options.incidentId} has no linked run.`)
  }

  if (!incident.department || !incident.disease) {
    throw new Error(`Incident ${options.incidentId} has no department/disease metadata.`)
  }

  const disease = getDisease(incident.department, incident.disease)
  if (!disease) {
    throw new Error(`Unknown disease ${incident.department}/${incident.disease}.`)
  }

  const originalRun = await getRun(options.store, incident.runId)
  if (!originalRun) {
    throw new Error(`Linked run not found: ${incident.runId}`)
  }

  const reproduction = resolveReproduction(originalRun, options.reproduction)

  logger.log('Afterimage recheck')
  logger.log(`  incident:  ${incident.id}`)
  logger.log(`  disease:   ${incident.department}/${incident.disease}`)
  logger.log(`  linked:    ${incident.runId}`)

  let recheckRun: Awaited<ReturnType<typeof getRun>>
  let verification: VerificationResult

  if (!reproduction) {
    logger.log('  reproduce: (none — process_start missing on linked run)')
    recheckRun = await createSkippedRecheckRun(options.store, incident.id)
    verification = {
      passed: false,
      evidence:
        'Recheck requires a reproduction command from the original run (process_start). None recorded.',
      abnormality: null,
    }
  } else {
    logger.log(`  reproduce: ${reproduction.command.join(' ')}`)
    logger.log(`  cwd:       ${reproduction.cwd}`)

    const observed = await executeRun({
      store: options.store,
      command: reproduction.command,
      cwd: reproduction.cwd,
      agentId: `recheck:${incident.id}`,
      alertWriter: options.alertWriter ?? { write: (chunk) => logger.error(chunk) },
      filesystemDebounceMs: options.filesystemDebounceMs,
    })

    recheckRun = observed.run

    if (
      incident.disease === 'repeated-file-state' &&
      successfulFileWriteEvents(recheckRun.events).length === 0
    ) {
      verification = {
        passed: false,
        evidence:
          'Recheck inconclusive: reproduction completed with no observed file writes to verify.',
        abnormality: null,
      }
    } else {
      verification = disease.verify({ run: originalRun }, { run: recheckRun })
    }
  }

  const record: RecheckRecord = {
    runId: recheckRun!.id,
    passed: verification.passed,
    evidence: verification.evidence,
    verifiedAt: new Date().toISOString(),
    reproductionCommand: reproduction?.command,
    reproductionCwd: reproduction?.cwd,
  }

  const recheckHistory = [...(incident.recheckHistory ?? []), record]
  const patch = {
    lastRecheck: record,
    recheckHistory,
    ...(verification.passed ? { status: 'cleared' as const } : {}),
  }

  const updated = await updateIncident(options.store, incident.id, patch)

  logger.log('')
  logger.log('recheck result')
  logger.log(`  run id:    ${record.runId}`)
  logger.log(`  passed:    ${verification.passed ? 'yes' : 'no'}`)
  logger.log(`  evidence:  ${verification.evidence}`)
  logger.log(`  status:    ${updated.status}`)

  return {
    exitCode: verification.passed ? 0 : 1,
    verification,
    recheckRunId: record.runId,
    cleared: verification.passed,
    incidentStatus: updated.status,
  }
}
