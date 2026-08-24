import type { AgentEvent, AgentRun } from '../events.ts'
import { editsFromAgentEvents, editsFromAgentRun } from '../events.ts'
import type { FileEdit, LoopSignal, RootCause, Treatment } from '../types.ts'

/**
 * Detector-facing observation of an agent.
 *
 * Prefer `edits` for fixtures and unit tests.
 * Prefer `run` / `events` when wiring a real AgentRun — looping uses file_write events.
 * At least one of `edits`, `events`, or `run` must be present.
 */
export type AgentTrace = {
  edits?: FileEdit[]
  events?: AgentEvent[]
  run?: AgentRun
}

/** Normalize any AgentTrace into legacy FileEdit rows for shipped detectors. */
export function resolveTraceEdits(trace: AgentTrace): FileEdit[] {
  if (trace.edits && trace.edits.length > 0) {
    return trace.edits
  }
  if (trace.run) {
    return editsFromAgentRun(trace.run)
  }
  if (trace.events && trace.events.length > 0) {
    return editsFromAgentEvents(trace.events)
  }
  return trace.edits ?? []
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

export type RepeatedFileStateAbnormality = {
  kind: 'repeated-file-state'
  signal: LoopSignal
}

export type Abnormality = RepeatedFileStateAbnormality

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
