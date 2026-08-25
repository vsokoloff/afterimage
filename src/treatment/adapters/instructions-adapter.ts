import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'

import type { AgentEvent } from '../../events.ts'
import { newId } from '../../ids.ts'
import type { LucidStore } from '../../store.ts'
import type {
  TreatmentAdapter,
  TreatmentAdapterContext,
  TreatmentApplyResult,
  TreatmentPreview,
  TreatmentRollbackContext,
} from './types.ts'

type InstructionOverlay = {
  version: 1
  derivedFromIncident: string
  evidenceEventIds: string[]
  authoritativeGoal: string
  conflictPolicy: string
  subordinatedInstructions: Array<{ eventId: string; role: string; text: string }>
  appliedAt: string
}

function instructionsDir(store: LucidStore): string {
  return path.join(store.root, 'agent')
}

function activeInstructionsPath(store: LucidStore): string {
  return path.join(instructionsDir(store), 'instructions.json')
}

function backupsDir(store: LucidStore): string {
  return path.join(store.root, 'treatments', 'backups')
}

function backupPath(store: LucidStore, applicationId: string): string {
  return path.join(backupsDir(store), `${applicationId}.json`)
}

async function readOptionalJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

function formatInstructionBlock(label: string, body: string): string {
  return `${label}\n${body.split('\n').map((line) => `  ${line}`).join('\n')}`
}

function promptEvents(context: TreatmentAdapterContext) {
  const byId = new Map(
    (context.run?.events ?? context.evidenceEvents).map((event) => [event.id, event]),
  )
  return context.treatment.evidenceEventIds
    .map((id) => byId.get(id))
    .filter((event): event is Extract<AgentEvent, { type: 'prompt' }> => event?.type === 'prompt')
}

function buildAfterOverlay(context: TreatmentAdapterContext): InstructionOverlay {
  const subordinated = promptEvents(context).map((event) => ({
    eventId: event.id,
    role: event.role ?? 'unknown',
    text: event.text,
  }))

  return {
    version: 1,
    derivedFromIncident: context.incident.id,
    evidenceEventIds: [...context.treatment.evidenceEventIds],
    authoritativeGoal: context.treatment.proposedChange,
    conflictPolicy:
      'If test or tool feedback conflicts with the authoritative goal, report the conflict instead of reverting file edits.',
    subordinatedInstructions: subordinated,
    appliedAt: new Date().toISOString(),
  }
}

function overlayToText(overlay: InstructionOverlay): string {
  const lines = [
    formatInstructionBlock('Authoritative goal', overlay.authoritativeGoal),
    formatInstructionBlock('Conflict policy', overlay.conflictPolicy),
    'Subordinated instructions:',
  ]
  for (const item of overlay.subordinatedInstructions) {
    lines.push(formatInstructionBlock(`${item.role} (${item.eventId})`, item.text))
  }
  return lines.join('\n\n')
}

function beforeText(context: TreatmentAdapterContext): string {
  const prompts = promptEvents(context)
  if (!prompts.length) {
    return 'No instruction prompt events were found for the cited evidence IDs.'
  }
  return prompts
    .map((event) => formatInstructionBlock(`${event.role ?? 'prompt'} (${event.id})`, event.text))
    .join('\n\n')
}

/**
 * Applies instruction-hierarchy treatment to Afterimage agent config only —
 * never edits application source files.
 */
export const instructionsTreatmentAdapter: TreatmentAdapter = {
  target: 'instructions',

  supports(treatment) {
    return treatment.target === 'instructions' && treatment.rootCauseType === 'conflicting_instructions'
  },

  preview(context): TreatmentPreview {
    const afterOverlay = buildAfterOverlay(context)
    return {
      summary: 'Instruction hierarchy overlay (.lucid/agent/instructions.json)',
      before: beforeText(context),
      after: overlayToText(afterOverlay),
    }
  },

  async apply(context): Promise<TreatmentApplyResult> {
    const applicationId = newId('txapp')
    await mkdir(instructionsDir(context.store), { recursive: true })
    await mkdir(backupsDir(context.store), { recursive: true })

    const activePath = activeInstructionsPath(context.store)
    const existing = await readFile(activePath, 'utf8').catch(() => null)
    const backupFile = backupPath(context.store, applicationId)

    await writeFile(
      backupFile,
      JSON.stringify(
        {
          hadPrevious: existing !== null,
          previousContents: existing,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )

    const overlay = buildAfterOverlay(context)
    await writeFile(activePath, `${JSON.stringify(overlay, null, 2)}\n`, 'utf8')

    return {
      applicationId,
      artifactPath: activePath,
      backupPath: backupFile,
    }
  },

  async rollback(context: TreatmentRollbackContext): Promise<void> {
    const backup = await readOptionalJson<{
      hadPrevious: boolean
      previousContents: string | null
    }>(context.application.backupPath)
    if (!backup) {
      throw new Error(`Missing treatment backup: ${context.application.backupPath}`)
    }

    const activePath = activeInstructionsPath(context.store)
    if (!backup.hadPrevious || backup.previousContents == null) {
      await rm(activePath, { force: true })
      return
    }

    await writeFile(activePath, backup.previousContents, 'utf8')
  },
}
