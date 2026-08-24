import type { Abnormality } from './departments/types.ts'
import type { AgentEvent, AgentRun, CausalContext, FileWriteEvent } from './events.ts'
import { isFileWriteEvent, successfulFileWriteEvents } from './events.ts'

/** Bounds for deterministic diagnostic window extraction. */
export type DiagnosticWindowBounds = {
  /** Max instruction/tool/test context events before the trigger. */
  maxPrecedingContext?: number
  /** Max error events in the lookback window. */
  maxErrors?: number
  /** Max file-write events when no abnormality scopes the file. */
  maxFileWrites?: number
  /** How many sequence steps before the trigger to search. */
  lookbackSequences?: number
}

export const DEFAULT_DIAGNOSTIC_WINDOW_BOUNDS: Required<DiagnosticWindowBounds> = {
  maxPrecedingContext: 8,
  maxErrors: 5,
  maxFileWrites: 12,
  lookbackSequences: 25,
}

const CONTEXT_EVENT_TYPES = new Set<AgentEvent['type']>([
  'prompt',
  'model_response',
  'tool_call',
  'tool_result',
  'test_result',
])

export type DiagnosticWindow = {
  triggeringEventId: string
  triggeringSequence: number
  fileWrites: FileWriteEvent[]
  precedingContext: AgentEvent[]
  errors: AgentEvent[]
  /** All included events, sorted by sequence then id. */
  events: AgentEvent[]
}

export type DiagnosticWindowInput = DiagnosticWindowBounds & {
  run: AgentRun
  triggeringEventId: string
  abnormality?: Abnormality
}

function sortEvents(events: AgentEvent[]): AgentEvent[] {
  return [...events].sort((left, right) => {
    if (left.sequence !== right.sequence) return left.sequence - right.sequence
    return left.id.localeCompare(right.id)
  })
}

function isContextEvent(event: AgentEvent): boolean {
  return CONTEXT_EVENT_TYPES.has(event.type)
}

function isErrorLikeEvent(event: AgentEvent): boolean {
  if (event.type === 'error') return true
  if (event.type === 'process_output' && event.stream === 'stderr') return true
  return false
}

function resolveBounds(input: DiagnosticWindowBounds): Required<DiagnosticWindowBounds> {
  return {
    maxPrecedingContext:
      input.maxPrecedingContext ?? DEFAULT_DIAGNOSTIC_WINDOW_BOUNDS.maxPrecedingContext,
    maxErrors: input.maxErrors ?? DEFAULT_DIAGNOSTIC_WINDOW_BOUNDS.maxErrors,
    maxFileWrites: input.maxFileWrites ?? DEFAULT_DIAGNOSTIC_WINDOW_BOUNDS.maxFileWrites,
    lookbackSequences:
      input.lookbackSequences ?? DEFAULT_DIAGNOSTIC_WINDOW_BOUNDS.lookbackSequences,
  }
}

function fileWritesForAbnormality(
  run: AgentRun,
  abnormality: Abnormality,
): FileWriteEvent[] {
  if (abnormality.kind !== 'repeated-file-state') return []

  const { signal } = abnormality
  return successfulFileWriteEvents(run.events).filter(
    (write) =>
      write.path === signal.file &&
      write.sequence >= signal.firstSeenTurn &&
      write.sequence <= signal.repeatedAtTurn,
  )
}

function fileWritesBeforeTrigger(
  run: AgentRun,
  triggeringSequence: number,
  maxFileWrites: number,
): FileWriteEvent[] {
  return successfulFileWriteEvents(run.events)
    .filter((write) => write.sequence <= triggeringSequence)
    .slice(-maxFileWrites)
}

function precedingContextEvents(
  ordered: AgentEvent[],
  triggeringSequence: number,
  bounds: Required<DiagnosticWindowBounds>,
): AgentEvent[] {
  const minSequence = Math.max(0, triggeringSequence - bounds.lookbackSequences)
  return ordered
    .filter(
      (event) =>
        isContextEvent(event) &&
        event.sequence < triggeringSequence &&
        event.sequence >= minSequence,
    )
    .slice(-bounds.maxPrecedingContext)
}

function errorEventsInWindow(
  ordered: AgentEvent[],
  triggeringSequence: number,
  bounds: Required<DiagnosticWindowBounds>,
): AgentEvent[] {
  const minSequence = Math.max(0, triggeringSequence - bounds.lookbackSequences)
  return ordered
    .filter(
      (event) =>
        isErrorLikeEvent(event) &&
        event.sequence <= triggeringSequence &&
        event.sequence >= minSequence,
    )
    .slice(-bounds.maxErrors)
}

function eventsById(run: AgentRun): Map<string, AgentEvent> {
  return new Map(run.events.map((event) => [event.id, event]))
}

/** Collect referenced event ids from optional causal context (deterministic order). */
export function collectCausalEventIds(event: AgentEvent): string[] {
  const causal = event.causal
  if (!causal) return []

  const ids: string[] = []
  const push = (id: string | undefined) => {
    if (id && !ids.includes(id)) ids.push(id)
  }

  push(causal.userInstructionEventId)
  push(causal.systemInstructionEventId)
  push(causal.developerInstructionEventId)
  push(causal.modelDecisionEventId)
  push(causal.toolResultEventId)
  push(causal.testFeedbackEventId)
  push(causal.errorEventId)

  for (const parentId of causal.causedByEventIds ?? []) {
    push(parentId)
  }

  return ids
}

function expandCausalReferences(seedIds: Iterable<string>, byId: Map<string, AgentEvent>): AgentEvent[] {
  const seen = new Set<string>()
  const resolved: AgentEvent[] = []

  for (const seedId of seedIds) {
    let currentId: string | undefined = seedId
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId)
      const event = byId.get(currentId)
      if (!event) break
      resolved.push(event)
      currentId = event.causal?.causedByEventIds?.[0]
    }
  }

  return sortEvents(resolved)
}

/**
 * Extract a bounded, deterministic diagnostic window around an incident trigger.
 * Includes relevant file writes, preceding instructions/tool/test feedback,
 * related errors, and causally linked events when adapters attached context.
 */
export function extractDiagnosticWindow(input: DiagnosticWindowInput): DiagnosticWindow {
  const bounds = resolveBounds(input)
  const byId = eventsById(input.run)
  const trigger = byId.get(input.triggeringEventId)
  if (!trigger) {
    throw new Error(`Triggering event not found: ${input.triggeringEventId}`)
  }

  const ordered = sortEvents(input.run.events)
  const fileWrites = input.abnormality
    ? fileWritesForAbnormality(input.run, input.abnormality)
    : fileWritesBeforeTrigger(input.run, trigger.sequence, bounds.maxFileWrites)

  const precedingContext = precedingContextEvents(ordered, trigger.sequence, bounds)
  const errors = errorEventsInWindow(ordered, trigger.sequence, bounds)

  const seedIds = new Set<string>([trigger.id])
  for (const event of [...fileWrites, trigger]) {
    for (const id of collectCausalEventIds(event)) seedIds.add(id)
  }

  const causalEvents = expandCausalReferences(seedIds, byId)
  const merged = sortEvents([
    ...fileWrites,
    ...precedingContext,
    ...errors,
    ...causalEvents,
    trigger,
  ])

  const unique = sortEvents([...new Map(merged.map((event) => [event.id, event])).values()])

  return {
    triggeringEventId: trigger.id,
    triggeringSequence: trigger.sequence,
    fileWrites: sortEvents(fileWrites).filter(isFileWriteEvent),
    precedingContext,
    errors,
    events: unique,
  }
}

/** Build causal context for adapters — only includes provided fields. */
export function createCausalContext(input: CausalContext): CausalContext | undefined {
  const causal: CausalContext = {}
  if (input.userInstructionEventId) causal.userInstructionEventId = input.userInstructionEventId
  if (input.userInstruction) causal.userInstruction = input.userInstruction
  if (input.systemInstructionEventId) {
    causal.systemInstructionEventId = input.systemInstructionEventId
  }
  if (input.systemInstruction) causal.systemInstruction = input.systemInstruction
  if (input.developerInstructionEventId) {
    causal.developerInstructionEventId = input.developerInstructionEventId
  }
  if (input.developerInstruction) causal.developerInstruction = input.developerInstruction
  if (input.modelDecisionEventId) causal.modelDecisionEventId = input.modelDecisionEventId
  if (input.modelReasonSummary) causal.modelReasonSummary = input.modelReasonSummary
  if (input.toolResultEventId) causal.toolResultEventId = input.toolResultEventId
  if (input.testFeedbackEventId) causal.testFeedbackEventId = input.testFeedbackEventId
  if (input.errorEventId) causal.errorEventId = input.errorEventId
  if (input.causedByEventIds?.length) causal.causedByEventIds = [...input.causedByEventIds]
  return Object.keys(causal).length > 0 ? causal : undefined
}

export function diagnosticWindowForIncident(
  run: AgentRun,
  triggeringEventId: string,
  abnormality: Abnormality | undefined,
  bounds?: DiagnosticWindowBounds,
): DiagnosticWindow {
  return extractDiagnosticWindow({
    run,
    triggeringEventId,
    abnormality,
    ...bounds,
  })
}
