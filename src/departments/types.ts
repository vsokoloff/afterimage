import type { AgentEvent, AgentRun } from '../events.ts'
import {
  editsFromAgentEvents,
  editsFromAgentRun,
  successfulFileWriteEvents,
  type FileWriteEvent,
} from '../events.ts'
import type { FileEdit, LoopSignal, RootCause, Treatment } from '../types.ts'

/**
 * Project-level instructions loaded from `.afterimage/instructions.json`
 * and attached to a trace for instruction-amnesia detection.
 */
export type ProjectInstruction = {
  id: string
  text: string
  onlyPaths?: string[]
  forbidPaths?: string[]
  forbidTools?: string[]
  sourceEventId?: string
}

/**
 * Detector-facing observation of an agent.
 * Shipped diseases read events from `run` or `events` — not legacy FileEdit fixtures.
 */
export type AgentTrace = {
  events?: AgentEvent[]
  run?: AgentRun
  /** Optional durable constraints from local instruction store. */
  projectInstructions?: ProjectInstruction[]
}

/** Successful file_write events from a trace (deterministic order). */
export function resolveTraceFileWrites(trace: AgentTrace): FileWriteEvent[] {
  if (trace.run) return successfulFileWriteEvents(trace.run.events)
  if (trace.events) return successfulFileWriteEvents(trace.events)
  return []
}

/** Events from a trace in a stable order. */
export function resolveTraceEvents(trace: AgentTrace): AgentEvent[] {
  const events = trace.run?.events ?? trace.events ?? []
  return [...events].sort((left, right) => {
    if (left.sequence !== right.sequence) return left.sequence - right.sequence
    return left.id.localeCompare(right.id)
  })
}

/** @deprecated Prefer resolveTraceFileWrites — kept for display/adapters. */
export function resolveTraceEdits(trace: AgentTrace): FileEdit[] {
  if (trace.run) return editsFromAgentRun(trace.run)
  if (trace.events) return editsFromAgentEvents(trace.events)
  return []
}

/**
 * Optional notes for a known incident (fixture or attached run).
 * Root cause / treatment may be supplied when the hospital maps a pattern
 * to a documented case — not invented by the UI.
 */
export type IncidentContext = {
  symptom?: string
  rootCause?: RootCause
  treatment?: Treatment
}

export type ScopeExplosionSignal = {
  fileCount: number
  topLevelDirs: string[]
  totalBytes: number
  paths: string[]
  reason: 'multi-dir-blast' | 'high-file-count' | 'prompt-scope-violation'
  promptPaths?: string[]
  outsidePaths?: string[]
  triggeringEventId: string
}

export type PriorFixRegressedSignal = {
  testName: string
  firstPassEventId: string
  firstPassSequence: number
  laterFailEventId: string
  laterFailSequence: number
}

export type InstructionAmnesiaSignal = {
  constraintId: string
  constraintText: string
  constraintKind: 'only-edit' | 'forbid-path' | 'forbid-tool'
  violatingEventId: string
  violatingSequence: number
  violatingDetail: string
}

export type RedundantRewriteSignal = {
  matchKind: 'exact' | 'structural'
  hash: string
  firstPath: string
  firstEventId: string
  firstSequence: number
  duplicatePath: string
  duplicateEventId: string
  duplicateSequence: number
}

export type RepeatedFileStateAbnormality = {
  kind: 'repeated-file-state'
  signal: LoopSignal
}

export type ScopeExplosionAbnormality = {
  kind: 'scope-explosion'
  signal: ScopeExplosionSignal
}

export type PriorFixRegressedAbnormality = {
  kind: 'prior-fix-regressed'
  signal: PriorFixRegressedSignal
}

export type InstructionAmnesiaAbnormality = {
  kind: 'instruction-amnesia'
  signal: InstructionAmnesiaSignal
}

export type RedundantRewriteAbnormality = {
  kind: 'redundant-rewrite'
  signal: RedundantRewriteSignal
}

export type Abnormality =
  | RepeatedFileStateAbnormality
  | ScopeExplosionAbnormality
  | PriorFixRegressedAbnormality
  | InstructionAmnesiaAbnormality
  | RedundantRewriteAbnormality

export type DiagnosisResult = {
  department: string
  disease: string
  status: 'critical' | 'clear'
  abnormality: Abnormality | null
  evidence: string
  symptom: string
  rootCause: RootCause | null
}

/**
 * Treatment = apply the change associated with the diagnosis
 * (instructions, memory policy, retry strategy, tools, etc.).
 * Not "ask AI to rewrite the user's codebase."
 */
export type TreatmentPlan = Treatment & {
  requiresReview: boolean
  safeToAutoApply: boolean
}

export type VerificationResult = {
  passed: boolean
  evidence: string
  abnormality: Abnormality | null
}

/**
 * Contributor shape for a disease inside a department.
 *
 * Pipeline: OBSERVE → TEST → ABNORMALITY → EVIDENCE → DIAGNOSIS → TREATMENT → RECHECK
 */
export type DiseasePlugin = {
  id: string
  department: string
  name: string
  description: string
  /** `shipped` = end-to-end; `stub` = documented, not implemented yet */
  status: 'shipped' | 'stub'
  detect(trace: AgentTrace): Abnormality | null
  diagnose(trace: AgentTrace, context?: IncidentContext): DiagnosisResult
  recommendFix(diagnosis: DiagnosisResult, context?: IncidentContext): TreatmentPlan | null
  verify(before: AgentTrace, after: AgentTrace): VerificationResult
}

export type DepartmentInfo = {
  id: string
  name: string
  description: string
  diseases: Array<{
    id: string
    name: string
    status: 'shipped' | 'stub'
    description: string
  }>
}
