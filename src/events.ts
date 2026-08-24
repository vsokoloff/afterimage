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

/** Fields shared by every event on a run. */
export type AgentEventBase = {
  id: string
  runId: string
  /** ISO-8601 timestamp */
  timestamp: string
  /** Monotonic sequence / turn number within the run */
  sequence: number
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
 */
export type FileWriteEvent = AgentEventBase & {
  type: 'file_write'
  path: string
  /**
   * Complete file contents after the write, when retained.
   * Prefer this for debugging and for building legacy `FileEdit` traces.
   */
  content?: string
  /**
   * Exact UTF-8 string that was hashed when full `content` is not stored.
   * Must produce `hash` when passed through SHA-256.
   */
  contentHashInput?: string
  /** SHA-256 hex digest of `content` or `contentHashInput`. */
  hash: string
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

export type AgentEvent =
  | PromptEvent
  | ModelResponseEvent
  | ToolCallEvent
  | ToolResultEvent
  | FileWriteEvent
  | TestResultEvent
  | ErrorEvent

export type AgentEventType = AgentEvent['type']

/** Bytes that must hash to `event.hash` (content preferred over contentHashInput). */
export function fileWriteHashInput(event: FileWriteEvent): string {
  if (event.content !== undefined) return event.content
  if (event.contentHashInput !== undefined) return event.contentHashInput
  throw new Error(`file_write ${event.id} missing content and contentHashInput`)
}

export function assertFileWriteHash(event: FileWriteEvent): void {
  const input = fileWriteHashInput(event)
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
  /** Provide at least one of content or contentHashInput. */
  content?: string
  contentHashInput?: string
}

/**
 * Build a file_write event and compute SHA-256 from content or contentHashInput.
 */
export function createFileWriteEvent(input: CreateFileWriteInput): FileWriteEvent {
  const hashSource = input.content ?? input.contentHashInput
  if (hashSource === undefined) {
    throw new Error('createFileWriteEvent requires content or contentHashInput')
  }
  if (
    input.content !== undefined &&
    input.contentHashInput !== undefined &&
    input.content !== input.contentHashInput
  ) {
    throw new Error('content and contentHashInput must match when both are set')
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
    hash: sha256Hex(hashSource),
  }
}

export function isFileWriteEvent(event: AgentEvent): event is FileWriteEvent {
  return event.type === 'file_write'
}

/** File-write events from a run, sorted by sequence. */
export function fileWriteEventsFromRun(run: AgentRun): FileWriteEvent[] {
  return run.events.filter(isFileWriteEvent).sort((a, b) => a.sequence - b.sequence)
}

export function fileWriteEventsFromEvents(events: AgentEvent[]): FileWriteEvent[] {
  return events.filter(isFileWriteEvent).sort((a, b) => a.sequence - b.sequence)
}

/**
 * Map file-write events → legacy `FileEdit` rows for the existing loop detector.
 * `sequence` becomes `turn`; hash input becomes `content`.
 */
export function fileWritesToEdits(writes: FileWriteEvent[]): FileEdit[] {
  return [...writes]
    .sort((a, b) => a.sequence - b.sequence)
    .map((write) => ({
      turn: write.sequence,
      file: write.path,
      content: fileWriteHashInput(write),
    }))
}

export function editsFromAgentRun(run: AgentRun): FileEdit[] {
  return fileWritesToEdits(fileWriteEventsFromRun(run))
}

export function editsFromAgentEvents(events: AgentEvent[]): FileEdit[] {
  return fileWritesToEdits(fileWriteEventsFromEvents(events))
}
