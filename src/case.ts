import type { VisitCase } from './types.ts'

const stateA = 'def get_user(id): return None'
const stateB = 'def get_user(id): return Result.ok(None)'
const stateC = 'def get_user(id): return cache.get(id)'
const stateD = 'def get_user(id): return db.find(id)'

export const authWriterCase: VisitCase = {
  patient: {
    name: 'Auth Writer',
    role: 'Coding agent',
    file: 'auth.py',
    complaint: 'Unable to complete authentication fix',
  },
  symptom: 'Repeated file-state loop',
  attempts: [
    {
      turn: 1,
      file: 'auth.py',
      content: stateA,
      intent: 'Removed legacy auth fallback',
      feedback: {
        kind: 'Test feedback',
        text: 'Maintain backwards compatibility',
      },
    },
    {
      turn: 2,
      file: 'auth.py',
      content: stateB,
      intent: 'Restored legacy auth fallback',
      feedback: {
        kind: 'Task instruction',
        text: 'Remove deprecated auth fallback',
      },
    },
    {
      turn: 3,
      file: 'auth.py',
      content: stateA,
      intent: 'Removed legacy auth fallback',
      feedback: null,
    },
  ],
  rootCause: {
    title: 'Conflicting instructions',
    summary:
      'The agent is alternating between satisfying backwards compatibility and removing the deprecated authentication path. Each piece of feedback causes it to undo the previous solution.',
    instructions: [
      { label: 'Instruction A', text: 'Preserve backwards compatibility.' },
      { label: 'Instruction B', text: 'Remove deprecated authentication path.' },
    ],
  },
  treatment: {
    target: 'Agent instructions',
    recommendedChange: 'Resolve the conflict in the agent’s instruction hierarchy.',
    currentBehavior:
      'The agent treats both instructions as equally authoritative and alternates between them.',
    recommendedInstruction:
      'Remove the deprecated authentication path. Backwards compatibility is not required for this task. If a test conflicts with this requirement, report the conflict instead of reverting the implementation.',
    why: 'This gives the agent one authoritative goal instead of two conflicting goals.',
    applied: false,
    summaryChange: 'Remove conflicting backwards-compatibility requirement.',
  },
  recheck: [
    {
      turn: 1,
      file: 'auth.py',
      content: stateC,
      intent: 'Removed legacy auth fallback',
      feedback: {
        kind: 'Test feedback',
        text: 'Missing backwards-compatible fallback',
      },
    },
    {
      turn: 2,
      file: 'auth.py',
      content: stateD,
      intent: 'Reported the test conflict and kept the new auth path',
      feedback: null,
    },
  ],
}
