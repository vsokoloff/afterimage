import type { AgentEvent, FileWriteEvent, PromptEvent, ToolCallEvent } from '../../../events.ts'
import type {
  AgentTrace,
  InstructionAmnesiaAbnormality,
  InstructionAmnesiaSignal,
  ProjectInstruction,
} from '../../types.ts'
import { resolveTraceEvents } from '../../types.ts'

export type ExtractedConstraint = {
  id: string
  text: string
  kind: InstructionAmnesiaSignal['constraintKind']
  onlyPaths?: string[]
  forbidPaths?: string[]
  forbidTools?: string[]
  sourceEventId?: string
}

const ONLY_EDIT =
  /\bonly\s+edit\s+([`'" ]*)([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)\1/gi
const DO_NOT_TOUCH =
  /\bdo\s+not\s+(?:touch|modify|edit|change)\s+([`'" ]*)([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)\1/gi
const DO_NOT_USE =
  /\bdo\s+not\s+use\s+([`'" ]*)([A-Za-z0-9_-]+)\1/gi

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '')
}

function pathMatches(pathValue: string, pattern: string): boolean {
  const pathNorm = normalizePath(pathValue)
  const patternNorm = normalizePath(pattern)
  return (
    pathNorm === patternNorm ||
    pathNorm.endsWith(`/${patternNorm}`) ||
    pathNorm.startsWith(`${patternNorm}/`)
  )
}

function slugId(prefix: string, value: string, index: number): string {
  const slug = value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 48)
  return `${prefix}:${slug}:${index}`
}

/** Pull deterministic constraints from free-text instructions. */
export function extractConstraintsFromText(
  text: string,
  options: { idPrefix?: string; sourceEventId?: string } = {},
): ExtractedConstraint[] {
  const prefix = options.idPrefix ?? 'prompt'
  const constraints: ExtractedConstraint[] = []
  let index = 0

  for (const match of text.matchAll(ONLY_EDIT)) {
    const filePath = match[2]
    if (!filePath) continue
    constraints.push({
      id: slugId(`${prefix}:only-edit`, filePath, index),
      text: `only edit ${filePath}`,
      kind: 'only-edit',
      onlyPaths: [normalizePath(filePath)],
      sourceEventId: options.sourceEventId,
    })
    index += 1
  }

  for (const match of text.matchAll(DO_NOT_TOUCH)) {
    const filePath = match[2]
    if (!filePath) continue
    constraints.push({
      id: slugId(`${prefix}:forbid-path`, filePath, index),
      text: `do not touch ${filePath}`,
      kind: 'forbid-path',
      forbidPaths: [normalizePath(filePath)],
      sourceEventId: options.sourceEventId,
    })
    index += 1
  }

  for (const match of text.matchAll(DO_NOT_USE)) {
    const tool = match[2]
    if (!tool) continue
    constraints.push({
      id: slugId(`${prefix}:forbid-tool`, tool, index),
      text: `do not use ${tool}`,
      kind: 'forbid-tool',
      forbidTools: [tool.toLowerCase()],
      sourceEventId: options.sourceEventId,
    })
    index += 1
  }

  return constraints
}

function constraintsFromProjectInstructions(
  instructions: ProjectInstruction[],
): ExtractedConstraint[] {
  const fromFields: ExtractedConstraint[] = []
  for (const instruction of instructions) {
    if (instruction.onlyPaths?.length) {
      fromFields.push({
        id: `${instruction.id}:only-edit`,
        text: instruction.text,
        kind: 'only-edit',
        onlyPaths: instruction.onlyPaths.map(normalizePath),
        sourceEventId: instruction.sourceEventId,
      })
    }
    if (instruction.forbidPaths?.length) {
      fromFields.push({
        id: `${instruction.id}:forbid-path`,
        text: instruction.text,
        kind: 'forbid-path',
        forbidPaths: instruction.forbidPaths.map(normalizePath),
        sourceEventId: instruction.sourceEventId,
      })
    }
    if (instruction.forbidTools?.length) {
      fromFields.push({
        id: `${instruction.id}:forbid-tool`,
        text: instruction.text,
        kind: 'forbid-tool',
        forbidTools: instruction.forbidTools.map((tool) => tool.toLowerCase()),
        sourceEventId: instruction.sourceEventId,
      })
    }
    if (
      !instruction.onlyPaths?.length &&
      !instruction.forbidPaths?.length &&
      !instruction.forbidTools?.length
    ) {
      fromFields.push(
        ...extractConstraintsFromText(instruction.text, {
          idPrefix: instruction.id,
          sourceEventId: instruction.sourceEventId,
        }),
      )
    }
  }
  return fromFields
}

export function formatInstructionAmnesiaEvidence(signal: InstructionAmnesiaSignal): string {
  return [
    'instruction-amnesia',
    `constraint=${signal.constraintId}`,
    `kind=${signal.constraintKind}`,
    `violatingEvent=${signal.violatingEventId}@seq=${signal.violatingSequence}`,
    `detail=${signal.violatingDetail}`,
  ].join(' ')
}

function checkWriteAgainstConstraint(
  write: FileWriteEvent,
  constraint: ExtractedConstraint,
): InstructionAmnesiaSignal | null {
  const pathValue = normalizePath(write.path)

  if (constraint.kind === 'only-edit' && constraint.onlyPaths?.length) {
    const allowed = constraint.onlyPaths.some((pattern) => pathMatches(pathValue, pattern))
    if (!allowed) {
      return {
        constraintId: constraint.id,
        constraintText: constraint.text,
        constraintKind: 'only-edit',
        violatingEventId: write.id,
        violatingSequence: write.sequence,
        violatingDetail: `wrote ${pathValue}`,
      }
    }
  }

  if (constraint.kind === 'forbid-path' && constraint.forbidPaths?.length) {
    const forbidden = constraint.forbidPaths.some((pattern) => pathMatches(pathValue, pattern))
    if (forbidden) {
      return {
        constraintId: constraint.id,
        constraintText: constraint.text,
        constraintKind: 'forbid-path',
        violatingEventId: write.id,
        violatingSequence: write.sequence,
        violatingDetail: `wrote ${pathValue}`,
      }
    }
  }

  return null
}

function checkToolAgainstConstraint(
  call: ToolCallEvent,
  constraint: ExtractedConstraint,
): InstructionAmnesiaSignal | null {
  if (constraint.kind !== 'forbid-tool' || !constraint.forbidTools?.length) return null
  const tool = call.toolName.toLowerCase()
  if (!constraint.forbidTools.includes(tool)) return null
  return {
    constraintId: constraint.id,
    constraintText: constraint.text,
    constraintKind: 'forbid-tool',
    violatingEventId: call.id,
    violatingSequence: call.sequence,
    violatingDetail: `used tool ${call.toolName}`,
  }
}

function isConstraintPrompt(event: AgentEvent): event is PromptEvent {
  return (
    event.type === 'prompt' &&
    (event.role === 'user' || event.role === 'developer' || event.role === undefined)
  )
}

/**
 * Detect when a later action contradicts a previously established instruction.
 * Deterministic evidence only — optional LLM narrative is out of scope for v1.
 */
export function detectInstructionAmnesiaFromEvents(
  events: AgentEvent[],
  projectInstructions: ProjectInstruction[] = [],
): InstructionAmnesiaSignal | null {
  const ordered = [...events].sort((left, right) => {
    if (left.sequence !== right.sequence) return left.sequence - right.sequence
    return left.id.localeCompare(right.id)
  })

  /** Constraints already established (project store + prompts seen so far). */
  const active = new Map<string, ExtractedConstraint>()
  for (const constraint of constraintsFromProjectInstructions(projectInstructions)) {
    active.set(constraint.id, constraint)
  }

  for (const event of ordered) {
    if (isConstraintPrompt(event)) {
      for (const constraint of extractConstraintsFromText(event.text, {
        idPrefix: event.id,
        sourceEventId: event.id,
      })) {
        active.set(constraint.id, constraint)
      }
      continue
    }

    if (event.type === 'file_write' && event.ok !== false) {
      for (const constraint of active.values()) {
        const hit = checkWriteAgainstConstraint(event, constraint)
        if (hit) return hit
      }
    }

    if (event.type === 'tool_call') {
      for (const constraint of active.values()) {
        const hit = checkToolAgainstConstraint(event, constraint)
        if (hit) return hit
      }
    }
  }

  return null
}

export function detectInstructionAmnesia(
  trace: AgentTrace,
): InstructionAmnesiaAbnormality | null {
  const signal = detectInstructionAmnesiaFromEvents(
    resolveTraceEvents(trace),
    trace.projectInstructions ?? [],
  )
  if (!signal) return null
  return { kind: 'instruction-amnesia', signal }
}
