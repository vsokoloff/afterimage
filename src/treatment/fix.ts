import { fetchIncident } from '../api.ts'
import type { IncidentDetailResponse } from '../api.ts'
import { getIncident, openStore, updateIncident, type LucidStore } from '../store.ts'
import { getTreatmentAdapter } from './adapters/registry.ts'
import type { TreatmentApplicationRecord } from './adapters/types.ts'
import type { StructuredTreatment } from './types.ts'

export type FixLogger = {
  log: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export type RunFixCommandOptions = {
  incidentId: string
  store?: LucidStore
  apply?: boolean
  yes?: boolean
  rollback?: boolean
  confirm?: (message: string) => Promise<boolean>
  logger?: FixLogger
}

export type RunFixCommandResult = {
  exitCode: number
  applied?: boolean
  rolledBack?: boolean
}

const defaultLogger: FixLogger = {
  log: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
}

function printSection(title: string, body: string, logger: FixLogger): void {
  logger.log('')
  logger.log(title)
  logger.log('─'.repeat(Math.min(title.length, 60)))
  logger.log(body)
}

function printIncidentSummary(detail: IncidentDetailResponse, logger: FixLogger): void {
  logger.log('Afterimage fix')
  logger.log(`  incident:  ${detail.incident.id}`)
  logger.log(`  title:     ${detail.incident.title}`)
  logger.log(`  status:    ${detail.incident.status}`)
  logger.log(`  severity:  ${detail.severity}`)
}

function printDiagnosis(detail: IncidentDetailResponse, logger: FixLogger): void {
  if (!detail.diagnosis) {
    printSection('Diagnosis', 'No deterministic diagnosis available.', logger)
    return
  }

  const lines = [
    `Department: ${detail.diagnosis.department}`,
    `Disease:    ${detail.diagnosis.disease}`,
    `Status:     ${detail.diagnosis.status}`,
    `Symptom:    ${detail.diagnosis.symptom}`,
    `Evidence:   ${detail.diagnosis.evidence}`,
  ]

  if (detail.rootCauseDiagnosis) {
    lines.push(
      '',
      `Root cause: ${detail.rootCauseDiagnosis.rootCauseType}`,
      `Title:      ${detail.rootCauseDiagnosis.title}`,
      `Confidence: ${Math.round(detail.rootCauseDiagnosis.confidence * 100)}%`,
      `Explanation:${detail.rootCauseDiagnosis.explanation}`,
    )
    if (detail.rootCauseDiagnosis.evidenceEventIds.length) {
      lines.push(`Evidence:   ${detail.rootCauseDiagnosis.evidenceEventIds.join(', ')}`)
    }
  }

  printSection('Diagnosis', lines.join('\n'), logger)
}

function printTreatment(treatment: StructuredTreatment, logger: FixLogger): void {
  const lines = [
    `Target:            ${treatment.target}`,
    `Target component:  ${treatment.targetComponent}`,
    `Risk level:        ${treatment.riskLevel}`,
    `Review required:   ${treatment.requiresReview ? 'yes' : 'no'}`,
    `Safe to auto-apply:${treatment.safeToAutoApply ? ' yes' : ' no'}`,
    `Rollback strategy: ${treatment.rollbackStrategy}`,
    '',
    `Current state: ${treatment.currentProblematicState}`,
    '',
    `Proposed change: ${treatment.proposedChange}`,
    '',
    `Rationale: ${treatment.rationale}`,
  ]
  printSection('Treatment', lines.join('\n'), logger)
}

async function requireConfirmation(
  treatment: StructuredTreatment,
  options: RunFixCommandOptions,
): Promise<boolean> {
  if (treatment.safeToAutoApply) return true
  if (options.yes) return true
  const confirm = options.confirm
  if (!confirm) return false
  return confirm(
    `Treatment is not marked safe to auto-apply (risk: ${treatment.riskLevel}). Type yes to continue.`,
  )
}

export async function runFixCommand(options: RunFixCommandOptions): Promise<RunFixCommandResult> {
  const logger = options.logger ?? defaultLogger
  const store = options.store ?? (await openStore())

  const detail = await fetchIncident(store, options.incidentId)
  if (!detail) {
    logger.error(`Incident not found: ${options.incidentId}`)
    return { exitCode: 1 }
  }

  printIncidentSummary(detail, logger)
  printDiagnosis(detail, logger)

  if (options.rollback) {
    const application = detail.incident.treatmentApplication
    if (!application || application.rolledBackAt) {
      logger.error('No applied treatment is available to roll back on this incident.')
      return { exitCode: 1 }
    }
    if (!detail.treatment || !detail.rootCauseDiagnosis) {
      logger.error('Incident is missing treatment or root-cause diagnosis metadata.')
      return { exitCode: 1 }
    }

    const adapter = getTreatmentAdapter(detail.treatment)
    if (!adapter) {
      logger.error(`No treatment adapter supports target ${detail.treatment.target}.`)
      return { exitCode: 1 }
    }

    const confirmed = options.yes || (options.confirm ? await options.confirm('Roll back the applied treatment?') : false)
    if (!confirmed) {
      logger.log('Rollback cancelled.')
      return { exitCode: 1 }
    }

    await adapter.rollback({
      store,
      incident: detail.incident,
      treatment: detail.treatment,
      rootCauseDiagnosis: detail.rootCauseDiagnosis,
      run: detail.run,
      evidenceEvents: detail.rootCauseEvidenceEvents,
      application,
    })

    await updateIncident(store, detail.incident.id, {
      treatmentApplication: {
        ...application,
        rolledBackAt: new Date().toISOString(),
      },
    })

    logger.log('Treatment rolled back.')
    return { exitCode: 0, rolledBack: true }
  }

  if (!detail.treatment) {
    logger.error('No structured treatment is available for this incident.')
    return { exitCode: 1 }
  }
  if (!detail.rootCauseDiagnosis) {
    logger.error('Root-cause diagnosis is required before applying treatment.')
    return { exitCode: 1 }
  }

  printTreatment(detail.treatment, logger)

  const adapter = getTreatmentAdapter(detail.treatment)
  if (!adapter) {
    logger.error(
      `No treatment adapter is implemented for target=${detail.treatment.target} rootCause=${detail.treatment.rootCauseType}.`,
    )
    logger.error('Afterimage fix never edits application source files directly.')
    return { exitCode: 1 }
  }

  const preview = adapter.preview({
    store,
    incident: detail.incident,
    treatment: detail.treatment,
    rootCauseDiagnosis: detail.rootCauseDiagnosis,
    run: detail.run,
    evidenceEvents: detail.rootCauseEvidenceEvents,
  })

  printSection('Preview — before', preview.before, logger)
  printSection('Preview — after', preview.after, logger)
  logger.log('')
  logger.log(`Preview summary: ${preview.summary}`)

  if (!options.apply) {
    logger.log('')
    logger.log('Dry run only. Re-run with --apply to change Afterimage agent configuration after confirmation.')
    return { exitCode: 0 }
  }

  if (detail.incident.treatmentApplication && !detail.incident.treatmentApplication.rolledBackAt) {
    logger.error('Treatment already applied. Roll back first with `afterimage fix <incident-id> --rollback --yes`.')
    return { exitCode: 1 }
  }

  const confirmed = await requireConfirmation(detail.treatment, options)
  if (!confirmed) {
    logger.log('Apply cancelled — explicit confirmation is required for non-safe treatments.')
    return { exitCode: 1 }
  }

  const applied = await adapter.apply({
    store,
    incident: detail.incident,
    treatment: detail.treatment,
    rootCauseDiagnosis: detail.rootCauseDiagnosis,
    run: detail.run,
    evidenceEvents: detail.rootCauseEvidenceEvents,
  })

  const application: TreatmentApplicationRecord = {
    id: applied.applicationId,
    target: detail.treatment.target,
    appliedAt: new Date().toISOString(),
    artifactPath: applied.artifactPath,
    backupPath: applied.backupPath,
  }

  await updateIncident(store, detail.incident.id, { treatmentApplication: application })

  logger.log('')
  logger.log('Treatment applied to Afterimage agent configuration (not application code).')
  logger.log(`  artifact: ${applied.artifactPath}`)
  logger.log(`  backup:   ${applied.backupPath}`)
  logger.log(`  rollback: npm run afterimage -- fix ${detail.incident.id} --rollback --yes`)

  return { exitCode: 0, applied: true }
}

export async function loadIncidentForFix(store: LucidStore, incidentId: string) {
  return getIncident(store, incidentId)
}
