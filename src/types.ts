export type FileEdit = {
  turn: number
  file: string
  content: string
}

export type LoopSignal = {
  detected: true
  file: string
  hash: string
  /** Sequence number of the first-seen successful file_write. */
  firstSeenTurn: number
  /** Sequence number of the repeating successful file_write. */
  repeatedAtTurn: number
  firstSeenEventId: string
  repeatedEventId: string
}

export type Feedback = {
  kind: string
  text: string
}

export type Attempt = FileEdit & {
  intent: string
  feedback: Feedback | null
}

export type Instruction = {
  label: string
  text: string
}

export type RootCause = {
  title: string
  summary: string
  instructions: Instruction[]
}

export type Treatment = {
  target: string
  recommendedChange: string
  currentBehavior: string
  recommendedInstruction: string
  why: string
  applied: boolean
  summaryChange: string
}

export type Patient = {
  name: string
  role: string
  file: string
  complaint: string
}

export type VisitCase = {
  patient: Patient
  symptom: string
  attempts: Attempt[]
  rootCause: RootCause
  treatment: Treatment
  recheck: Attempt[]
}
