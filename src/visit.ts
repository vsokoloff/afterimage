import { authWriterCase } from './case.ts'
import { getPrimaryDisease, shortHash } from './departments/index.ts'
import { agentTraceFromAttempts } from './events.ts'
import type { Attempt, LoopSignal, VisitCase } from './types.ts'

export type EvidenceRole = 'first-seen' | 'repeated' | 'new'

export type ObservedAttempt = Attempt & {
  shortHash: string
  evidenceRole: EvidenceRole
}

export type VisitResponse = {
  /** Medical-record metadata for this incident */
  hospital: {
    department: string
    disease: string
    pipeline: string
  }
  patient: VisitCase['patient']
  symptom: string
  edits: ObservedAttempt[]
  diagnosis: {
    status: 'critical' | 'clear'
    file: string | null
    firstSeenTurn: number | null
    repeatedAtTurn: number | null
    hash: string | null
    firstSeenEventId: string | null
    repeatedEventId: string | null
    evidence: string
  }
  rootCause: VisitCase['rootCause']
  treatment: VisitCase['treatment']
  recheck: ObservedAttempt[]
  verification: {
    passed: boolean
    evidence: string
  }
}

function roleFor(edit: Attempt, signal: LoopSignal | null): EvidenceRole {
  if (!signal || edit.file !== signal.file) return 'new'
  if (edit.turn === signal.firstSeenTurn) return 'first-seen'
  if (edit.turn === signal.repeatedAtTurn) return 'repeated'
  return 'new'
}

function observe(attempts: Attempt[], signal: LoopSignal | null): ObservedAttempt[] {
  return [...attempts]
    .sort((left, right) => left.turn - right.turn)
    .map((attempt) => ({
      ...attempt,
      shortHash: shortHash(attempt.content),
      evidenceRole: roleFor(attempt, signal),
    }))
}

/**
 * Build the medical-record view for one incident.
 * Detector decides the abnormality from file_write events;
 * case notes supply root cause + treatment.
 */
export function buildVisit(visit: VisitCase = authWriterCase): VisitResponse {
  const disease = getPrimaryDisease()
  const before = agentTraceFromAttempts('visit-before', visit.attempts, {
    idPrefix: 'before',
  })
  const after = agentTraceFromAttempts('visit-after', visit.recheck, {
    idPrefix: 'after',
  })
  const context = {
    symptom: visit.symptom,
    rootCause: visit.rootCause,
    treatment: visit.treatment,
  }

  const diagnosis = disease.diagnose(before, context)
  const treatment = disease.recommendFix(diagnosis, context)
  const verification = disease.verify(before, after)
  const signal = diagnosis.abnormality?.signal ?? null
  const recheckSignal =
    verification.abnormality?.kind === 'repeated-file-state'
      ? verification.abnormality.signal
      : null

  return {
    hospital: {
      department: disease.department,
      disease: disease.id,
      pipeline: 'OBSERVE → TEST → ABNORMALITY → EVIDENCE → DIAGNOSIS → TREATMENT → RECHECK',
    },
    patient: visit.patient,
    symptom: diagnosis.symptom,
    edits: observe(visit.attempts, signal),
    diagnosis: signal
      ? {
          status: 'critical',
          file: signal.file,
          firstSeenTurn: signal.firstSeenTurn,
          repeatedAtTurn: signal.repeatedAtTurn,
          hash: signal.hash,
          firstSeenEventId: signal.firstSeenEventId,
          repeatedEventId: signal.repeatedEventId,
          evidence: diagnosis.evidence,
        }
      : {
          status: 'clear',
          file: null,
          firstSeenTurn: null,
          repeatedAtTurn: null,
          hash: null,
          firstSeenEventId: null,
          repeatedEventId: null,
          evidence: diagnosis.evidence,
        },
    rootCause: diagnosis.rootCause ?? visit.rootCause,
    treatment: treatment
      ? {
          target: treatment.target,
          recommendedChange: treatment.recommendedChange,
          currentBehavior: treatment.currentBehavior,
          recommendedInstruction: treatment.recommendedInstruction,
          why: treatment.why,
          applied: treatment.applied,
          summaryChange: treatment.summaryChange,
        }
      : visit.treatment,
    recheck: observe(visit.recheck, recheckSignal),
    verification: {
      passed: verification.passed,
      evidence: verification.evidence,
    },
  }
}
