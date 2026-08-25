import { createObserver, type IncidentDetected, type AfterimageObserver } from '../../observer.ts'
import { retainFileContentFromEnv } from '../../privacy.ts'
import { getRun, openStore, type AfterimageStore } from '../../store.ts'
import {
  notifyPetDesktop,
  persistPetAlert,
  printIncidentAlert,
  type AlertWriter,
} from '../incident-alert.ts'
import { formatPetIncidentAlert, formatPetWatchingIntro } from '../pet-alert.ts'
import {
  resolveRunIncidentPolicy,
  resolveWebBaseUrl,
  type RunIncidentPolicy,
} from '../policy.ts'
import { cursorHookToRecordableEvents, resolveWorkspaceRoot } from './normalize.ts'
import { clearCursorSession, loadCursorSession, saveCursorSession } from './session.ts'
import type { CursorHookPayload, CursorSessionState } from './types.ts'

export type CursorHookHandleResult = {
  /** JSON object to print on stdout (Cursor hook response). */
  response: Record<string, unknown> | null
  detections: IncidentDetected[]
  petAlert: string | null
  runId: string | null
}

function conversationIdOf(payload: CursorHookPayload): string {
  if (typeof payload.conversation_id === 'string' && payload.conversation_id.length > 0) {
    return payload.conversation_id
  }
  if (typeof payload.generation_id === 'string' && payload.generation_id.length > 0) {
    return `gen:${payload.generation_id}`
  }
  return 'cursor-default'
}

async function bindObserver(
  store: AfterimageStore,
  conversationId: string,
  createObserverFn: (store: AfterimageStore) => AfterimageObserver,
): Promise<{ observer: AfterimageObserver; session: CursorSessionState; fresh: boolean }> {
  const observer = createObserverFn(store)
  const existing = await loadCursorSession(store)

  if (existing && existing.conversationId === conversationId) {
    const run = await getRun(store, existing.runId)
    if (run && run.status === 'running') {
      await observer.resumeRun(run)
      return { observer, session: existing, fresh: false }
    }
  }

  if (existing && existing.conversationId !== conversationId) {
    const prior = await getRun(store, existing.runId)
    if (prior?.status === 'running') {
      const finisher = createObserverFn(store)
      await finisher.resumeRun(prior)
      await finisher.finishRun('completed')
    }
  }

  const run = await observer.startRun({
    agentId: `cursor:${conversationId.slice(0, 24)}`,
  })
  const session: CursorSessionState = {
    conversationId,
    runId: run.id,
    startedAt: run.startedAt,
    agentId: run.agentId ?? `cursor:${conversationId.slice(0, 24)}`,
  }
  await saveCursorSession(store, session)
  return { observer, session, fresh: true }
}

export type HandleCursorHookOptions = {
  payload: CursorHookPayload
  cwd?: string
  store?: AfterimageStore
  incidentPolicy?: RunIncidentPolicy
  webBaseUrl?: string
  alertWriter?: AlertWriter
  retainFileContent?: boolean
  createObserver?: (store: AfterimageStore) => AfterimageObserver
  /** Skip desktop notifications (tests). */
  desktopNotify?: boolean
}

/**
 * Handle one Cursor hook invocation end-to-end.
 */
export async function handleCursorHook(
  options: HandleCursorHookOptions,
): Promise<CursorHookHandleResult> {
  const workspaceRoot = resolveWorkspaceRoot(options.payload, options.cwd ?? process.cwd())
  const store =
    options.store ??
    (await openStore({
      projectRoot: workspaceRoot,
      retainFileContent: options.retainFileContent,
    }))
  if (options.retainFileContent === true) {
    store.retainFileContent = true
  }

  const createObserverFn =
    options.createObserver ?? ((s: AfterimageStore) => createObserver({ store: s }))
  const policy = resolveRunIncidentPolicy(options.incidentPolicy)
  const webBaseUrl = resolveWebBaseUrl(options.webBaseUrl)
  const eventName = options.payload.hook_event_name ?? 'unknown'
  const conversationId = conversationIdOf(options.payload)
  const detections: IncidentDetected[] = []
  let petAlert: string | null = null

  if (eventName === 'sessionStart') {
    const { session, fresh } = await bindObserver(store, conversationId, createObserverFn)
    const intro = formatPetWatchingIntro()
    return {
      response: {
        additional_context: fresh
          ? intro
          : 'Kitty is still watching this conversation.',
      },
      detections: [],
      petAlert: intro,
      runId: session.runId,
    }
  }

  const { observer, session } = await bindObserver(store, conversationId, createObserverFn)

  if (eventName === 'sessionEnd' || eventName === 'stop') {
    try {
      const status =
        options.payload.status === 'error'
          ? 'failed'
          : options.payload.status === 'aborted'
            ? 'cancelled'
            : 'completed'
      await observer.finishRun(status)
    } catch {
      // already finished / no active run
    }
    await clearCursorSession(store)
    return {
      response: null,
      detections: [],
      petAlert: null,
      runId: session.runId,
    }
  }

  const retain =
    options.retainFileContent ?? store.retainFileContent ?? retainFileContentFromEnv()
  const events = await cursorHookToRecordableEvents(options.payload, {
    workspaceRoot,
    retainFileContent: retain,
  })

  for (const event of events) {
    const result = await observer.record(event)
    for (const detection of result.detections) {
      detections.push(detection)
      petAlert = formatPetIncidentAlert(detection, webBaseUrl)
      printIncidentAlert(detection, webBaseUrl, policy, options.alertWriter, {
        terminating: false,
      })
      const { toast } = await persistPetAlert(store, detection, webBaseUrl)
      if (options.desktopNotify !== false) {
        notifyPetDesktop(toast)
      }
    }
  }

  let response: Record<string, unknown> | null = null
  if (eventName === 'beforeSubmitPrompt') {
    response = { continue: true }
  } else if (eventName === 'postToolUse' && petAlert) {
    response = { additional_context: petAlert }
  } else if (eventName === 'preToolUse') {
    response = { permission: 'allow' }
  }

  return {
    response,
    detections,
    petAlert,
    runId: observer.run?.id ?? session.runId,
  }
}
