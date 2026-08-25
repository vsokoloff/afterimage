import { createObserver, type IncidentDetected, type AfterimageObserver } from '../../observer.ts'
import type { FinishRunStatus } from '../../observer.ts'
import { retainFileContentFromEnv } from '../../privacy.ts'
import type { AfterimageStore } from '../../store.ts'
import { handleIncidentDetection } from '../incident-handling.ts'
import {
  resolveRunIncidentPolicy,
  resolveWebBaseUrl,
} from '../policy.ts'
import type { AgentRuntimeObserveResult } from '../agent-types.ts'
import {
  codexMessageToRecordableEvents,
  codexRunResultToRecordableEvents,
  recordNormalizedEvents,
  type CodexNormalizeContext,
} from './normalize.ts'
import type { CodexRunResult, CodexSDKMessage } from './types.ts'

export type ObserveCodexRunOptions = {
  store: AfterimageStore
  task: string
  messages: Iterable<CodexSDKMessage> | AsyncIterable<CodexSDKMessage>
  result?: CodexRunResult
  cwd?: string
  model?: string
  afterimageAgentId?: string
  /** @deprecated Use afterimageAgentId */
  lucidAgentId?: string
  codexAgentId?: string
  codexRunId?: string
  /**
   * Persist full file bodies on `file_write` events.
   * Defaults to `AFTERIMAGE_STORE_FILE_CONTENT` / legacy `LUCID_STORE_FILE_CONTENT`.
   */
  retainFileContent?: boolean
  incidentPolicy?: import('../policy.ts').RunIncidentPolicy
  webBaseUrl?: string
  onIncidentDetected?: (detection: IncidentDetected) => void
  alertWriter?: import('../incident-alert.ts').AlertWriter
  createObserver?: (store: AfterimageStore) => AfterimageObserver
}

async function* iterateMessages(
  source: Iterable<CodexSDKMessage> | AsyncIterable<CodexSDKMessage>,
): AsyncGenerator<CodexSDKMessage> {
  if (Symbol.asyncIterator in Object(source)) {
    yield* source as AsyncIterable<CodexSDKMessage>
  } else {
    yield* source as Iterable<CodexSDKMessage>
  }
}

function finishStatusFromCodex(status: string | undefined): FinishRunStatus {
  switch (status) {
    case 'finished':
      return 'completed'
    case 'cancelled':
      return 'cancelled'
    case 'error':
      return 'failed'
    default:
      return 'completed'
  }
}

/**
 * Observe one Codex SDK agent run: normalize stream events → AgentEvent, persist via AfterimageObserver.
 */
export async function observeCodexRun(
  options: ObserveCodexRunOptions,
): Promise<AgentRuntimeObserveResult> {
  const observer =
    options.createObserver?.(options.store) ?? createObserver({ store: options.store })
  const incidentPolicy = resolveRunIncidentPolicy(options.incidentPolicy)
  const webBaseUrl = resolveWebBaseUrl(options.webBaseUrl)
  if (options.retainFileContent === true) {
    options.store.retainFileContent = true
  }
  const retainFileContent =
    options.retainFileContent ?? options.store.retainFileContent ?? retainFileContentFromEnv()

  let incidentsOpened = 0
  const detections: IncidentDetected[] = []
  let normalizeContext: CodexNormalizeContext = {
    taskText: options.task,
    model: options.model,
    cwd: options.cwd,
    toolCallEventIds: new Map(),
  }

  const recordWithIncidents = async (
    events: Parameters<typeof recordNormalizedEvents>[1],
  ): Promise<void> => {
    const { results, context } = await recordNormalizedEvents(
      observer,
      events,
      normalizeContext,
      retainFileContent,
    )
    normalizeContext = context

    for (const result of results) {
      for (const detection of result.detections) {
        incidentsOpened += 1
        detections.push(detection)
        handleIncidentDetection(detection, {
          policy: incidentPolicy,
          webBaseUrl,
          alertWriter: options.alertWriter,
          onIncidentDetected: options.onIncidentDetected,
        })
      }
    }
  }

  const codexAgentId = options.codexAgentId ?? 'codex-local'
  const afterimageAgentId =
    options.afterimageAgentId ?? options.lucidAgentId ?? `codex:${codexAgentId}`

  await observer.startRun({ agentId: afterimageAgentId })

  if (options.task.trim().length > 0) {
    await recordWithIncidents([
      {
        type: 'prompt',
        role: 'user',
        text: options.task,
      },
    ])
  }

  for await (const message of iterateMessages(options.messages)) {
    const normalized = codexMessageToRecordableEvents(message, normalizeContext)
    normalizeContext = normalized.context
    if (normalized.events.length > 0) {
      await recordWithIncidents(normalized.events)
    }
  }

  if (options.result) {
    await recordWithIncidents(codexRunResultToRecordableEvents(options.result))
  }

  const run = await observer.finishRun(finishStatusFromCodex(options.result?.status))

  return {
    run,
    incidentsOpened,
    detections,
    runtimeRunId: options.codexRunId ?? options.result?.id,
    runtimeStatus: options.result?.status,
  }
}

/** Codex SDK adapter entry — host-specific options include `messages` stream. */
export const codexRuntimeAdapter = {
  name: 'codex',
  observe: observeCodexRun,
}
