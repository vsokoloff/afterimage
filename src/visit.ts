import { authWriterCase } from './case.ts'
import { detectLoop, shortHash } from './detect-loop.ts'
import type { Attempt, LoopSignal, VisitCase } from './types.ts'

export type EvidenceRole = 'first-seen' | 'repeated' | 'new'

export type ObservedAttempt = Attempt & {
  shortHash: string
  evidenceRole: EvidenceRole
}

export type VisitResponse = {
  patient: VisitCase['patient']
  symptom: string
  edits: ObservedAttempt[]
  diagnosis: {
    status: 'critical' | 'clear'
    file: string | null
    firstSeenTurn: number | null
    repeatedAtTurn: number | null
    hash: string | null
    evidence: string
  }
  rootCause: VisitCase['rootCause']
  treatment: VisitCase['treatment']
  recheck: ObservedAttempt[]
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

export function buildVisit(visit: VisitCase = authWriterCase): VisitResponse {
  const signal = detectLoop(visit.attempts)
  const recheckSignal = detectLoop(visit.recheck)
  const edits = observe(visit.attempts, signal)

  return {
    patient: visit.patient,
    symptom: visit.symptom,
    edits,
    diagnosis: signal
      ? {
          status: 'critical',
          file: signal.file,
          firstSeenTurn: signal.firstSeenTurn,
          repeatedAtTurn: signal.repeatedAtTurn,
          hash: signal.hash,
          evidence: `${signal.file} at Turn ${signal.repeatedAtTurn} exactly matches Turn ${signal.firstSeenTurn}.`,
        }
      : {
          status: 'clear',
          file: null,
          firstSeenTurn: null,
          repeatedAtTurn: null,
          hash: null,
          evidence: 'No file returned to a previous state.',
        },
    rootCause: visit.rootCause,
    treatment: visit.treatment,
    recheck: observe(visit.recheck, recheckSignal),
  }
}
