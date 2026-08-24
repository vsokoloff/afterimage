import { createHash } from 'node:crypto'

import type { FileEdit } from './types.ts'

/** SHA-256 hex digest of UTF-8 content (same algorithm as the loop detector). */
export function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export type AgentRunStatus = 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * One observed agent execution. Events are ordered by `sequence`
 * (and should match wall-clock order via `timestamp` when available).
 */
export type AgentRun = {
  id: string
  agentId?: string
  startedAt: string
  endedAt?: string
  status: AgentRunStatus
  events: AgentEvent[]
}

/** Optional causal links adapters may attach to any event. All fields optional. */
export type CausalContext = {
  userInstructionEventId?: string
  userInstruction?: string
  systemInstructionEventId?: string
  systemInstruction?: string
  developerInstructionEventId?: string
  developerInstruction?: string
  modelDecisionEventId?: string
  modelReasonSummary?: string
  toolResultEventId?: string
  testFeedbackEventId?: string
  errorEventId?: string
  /** Immediate cause first, then ancestors. */
  causedByEventIds?: string[]
}

/** Fields shared by every event on a run. */
export type AgentEventBase = {
  id: string
  runId: string
  /** ISO-8601 timestamp */
  timestamp: string
  /** Monotonic sequence / turn number within the run */
  sequence: number
  /** Optional causal context — adapters populate what they know. */
  causal?: CausalContext
}

export type PromptEvent = AgentEventBase & {
  type: 'prompt'
  role?: 'system' | 'user' | 'developer'
  text: string
}

export type ModelResponseEvent = AgentEventBase & {
  type: 'model_response'
  model?: string
  text: string
  /** Short decision/reason summary when the adapter has one. */
  reasonSummary?: string
  /** Provider discriminator (e.g. OpenTelemetry `gen_ai.provider.name`). */
  provider?: string
  /** Prompt / input token count when known. */
  inputTokens?: number
  /** Completion / output token count when known. */
  outputTokens?: number
  /** Provider response id when known. */
  responseId?: string
  /** Finish / stop reasons when known. */
  finishReasons?: string[]
}

export type ToolCallEvent = AgentEventBase & {
  type: 'tool_call'
  toolName: string
  callId?: string
  arguments?: unknown
}

export type ToolResultEvent = AgentEventBase & {
  type: 'tool_result'
  toolName: string
  callId?: string
  ok: boolean
  output?: unknown
}

/**
 * Successful (or attempted) write of a complete file state.
 * Detector input: `path` + content-or-hash-input + resulting SHA-256.
 * Set `ok: false` for failed writes — the loop detector ignores those.
 */
export type FileWriteEvent = AgentEventBase & {
  type: 'file_write'
  path: string
  /**
   * Complete file contents after the write, when retained.
   * Prefer this for debugging and for building legacy `FileEdit` traces.
   * Omitted by default (privacy-first); set LUCID_STORE_FILE_CONTENT=1 to keep.
   */
  content?: string
  /**
   * Exact UTF-8 string that was hashed when full `content` is not stored.
   * Must produce `hash` when passed through SHA-256.
   * Also stripped by default unless file-content retention is enabled.
   */
  contentHashInput?: string
  /** SHA-256 hex digest of `content`, `contentHashInput`, or a trusted precomputed hash. */
  hash: string
  /** UTF-8 byte length of the observed file state (metadata; safe to retain). */
  byteLength?: number
  /** Defaults to true when omitted. Failed writes are ignored by looping detect. */
  ok?: boolean
}

export type TestResultEvent = AgentEventBase & {
  type: 'test_result'
  name?: string
  passed: boolean
  output?: string
}

export type ErrorEvent = AgentEventBase & {
  type: 'error'
  message: string
  code?: string
}

/** Subprocess wrapper observation (lucid run --). No agent internals claimed. */
export type ProcessStartEvent = AgentEventBase & {
  type: 'process_start'
  command: string[]
  cwd: string
  pid?: number
}

export type ProcessOutputEvent = AgentEventBase & {
  type: 'process_output'
  stream: 'stdout' | 'stderr'
  text: string
}

export type ProcessEndEvent = AgentEventBase & {
  type: 'process_end'
  exitCode: number | null
  signal?: string | null
}

export type AgentEvent =
  | PromptEvent
  | ModelResponseEvent
  | ToolCallEvent
  | ToolResultEvent
  | FileWriteEvent
  | TestResultEvent
  | ErrorEvent
  | ProcessStartEvent
  | ProcessOutputEvent
  | ProcessEndEvent

export type AgentEventType = AgentEvent['type']

/**
 * Bytes that must hash to `event.hash` when a body was retained.
 * Returns undefined for hash-only (privacy-default) events.
 */
export function fileWriteHashInput(event: FileWriteEvent): string | undefined {
  if (event.content !== undefined) return event.content
  if (event.contentHashInput !== undefined) return event.contentHashInput
  return undefined
}

export function assertFileWriteHash(event: FileWriteEvent): void {
  const input = fileWriteHashInput(event)
  if (input === undefined) return

  const expected = sha256Hex(input)
  if (expected !== event.hash) {
    throw new Error(
      `file_write ${event.id} hash mismatch: expected ${expected}, got ${event.hash}`,
    )
  }
}

export type CreateFileWriteInput = {
  id: string
  runId: string
  timestamp: string
  sequence: number
  path: string
  /** Provide content, contentHashInput, and/or a precomputed hash. */
  content?: string
  contentHashInput?: string
  /** Precomputed SHA-256 when the body is not retained. */
  hash?: string
  byteLength?: number
  /** Defaults to true (successful write). */
  ok?: boolean
}

/**
 * Build a file_write event.
 * Hash is computed from content/contentHashInput when present; otherwise `hash` is required.
 */
export function createFileWriteEvent(input: CreateFileWriteInput): FileWriteEvent {
  const hashSource = input.content ?? input.contentHashInput
  if (hashSource === undefined && input.hash === undefined) {
    throw new Error('createFileWriteEvent requires content, contentHashInput, or hash')
  }
  if (
    input.content !== undefined &&
    input.contentHashInput !== undefined &&
    input.content !== input.contentHashInput
  ) {
    throw new Error('content and contentHashInput must match when both are set')
  }

  const computedHash = hashSource !== undefined ? sha256Hex(hashSource) : undefined
  if (
    computedHash !== undefined &&
    input.hash !== undefined &&
    input.hash !== computedHash
  ) {
    throw new Error('hash does not match content or contentHashInput')
  }

  return {
    type: 'file_write',
    id: input.id,
    runId: input.runId,
    timestamp: input.timestamp,
    sequence: input.sequence,
    path: input.path,
    content: input.content,
    contentHashInput: input.contentHashInput,
    hash: computedHash ?? input.hash!,
    byteLength: input.byteLength,
    ok: input.ok,
  }
}

export function isFileWriteEvent(event: AgentEvent): event is FileWriteEvent {
  return event.type === 'file_write'
}

/** Successful file writes only (`ok !== false`), sorted by sequence then id. */
export function successfulFileWriteEvents(events: AgentEvent[]): FileWriteEvent[] {
  return events
    .filter(isFileWriteEvent)
    .filter((event) => event.ok !== false)
    .sort((left, right) => {
      if (left.sequence !== right.sequence) return left.sequence - right.sequence
      return left.id.localeCompare(right.id)
    })
}

/** File-write events from a run, sorted by sequence. */
export function fileWriteEventsFromRun(run: AgentRun): FileWriteEvent[] {
  return successfulFileWriteEvents(run.events)
}

export function fileWriteEventsFromEvents(events: AgentEvent[]): FileWriteEvent[] {
  return successfulFileWriteEvents(events)
}

/**
 * Map file-write events → legacy `FileEdit` rows (CLI / visit display).
 * `sequence` becomes `turn`; retained hash input becomes `content`.
 * Hash-only events use an empty content string (source is not reconstructed).
 */
export function fileWritesToEdits(writes: FileWriteEvent[]): FileEdit[] {
  return successfulFileWriteEvents(writes).map((write) => ({
    turn: write.sequence,
    file: write.path,
    content: fileWriteHashInput(write) ?? '',
  }))
}

export function editsFromAgentRun(run: AgentRun): FileEdit[] {
  return fileWritesToEdits(fileWriteEventsFromRun(run))
}

export function editsFromAgentEvents(events: AgentEvent[]): FileEdit[] {
  return fileWritesToEdits(fileWriteEventsFromEvents(events))
}

/**
 * Build detector-facing file_write events from legacy attempt/edit rows
 * (VisitCase fixtures, CLI demos). Not used inside the detector itself.
 */
export function fileWritesFromAttempts(
  runId: string,
  attempts: Array<{ turn: number; file: string; content: string }>,
  options: { idPrefix?: string; timestamp?: string } = {},
): FileWriteEvent[] {
  const idPrefix = options.idPrefix ?? 'write'
  const timestamp = options.timestamp ?? '1970-01-01T00:00:00.000Z'
  return attempts.map((attempt) =>
    createFileWriteEvent({
      id: `${idPrefix}-${attempt.turn}-${attempt.file.replace(/[^\w.-]+/g, '_')}`,
      runId,
      timestamp,
      sequence: attempt.turn,
      path: attempt.file,
      content: attempt.content,
      ok: true,
    }),
  )
}

export function agentTraceFromAttempts(
  runId: string,
  attempts: Array<{ turn: number; file: string; content: string }>,
  options?: { idPrefix?: string; timestamp?: string },
): { events: FileWriteEvent[] } {
  return { events: fileWritesFromAttempts(runId, attempts, options) }
}

/** Merge optional causal patches — later values win; causedBy chains append uniquely. */
export function mergeCausalContext(
  base: CausalContext | undefined,
  patch: CausalContext | undefined,
): CausalContext | undefined {
  if (!base && !patch) return undefined

  const merged: CausalContext = { ...(base ?? {}), ...(patch ?? {}) }
  const causedBy = [
    ...(base?.causedByEventIds ?? []),
    ...(patch?.causedByEventIds ?? []),
  ].filter((id, index, all) => all.indexOf(id) === index)

  if (causedBy.length > 0) merged.causedByEventIds = causedBy
  else delete merged.causedByEventIds

  return Object.keys(merged).length > 0 ? merged : undefined
}

export function hasCausalContext(event: AgentEvent): boolean {
  return event.causal !== undefined && Object.keys(event.causal).length > 0
}
