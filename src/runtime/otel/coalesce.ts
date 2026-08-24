import type { OtelAttributeValue, OtelAttributes } from './types.ts'

/**
 * Coalesce GenAI attribute renames.
 * Prefer current names; never sum duplicate token fields.
 */

export function attrString(
  attrs: OtelAttributes | undefined,
  ...keys: string[]
): string | undefined {
  if (!attrs) return undefined
  for (const key of keys) {
    const value = attrs[key]
    if (typeof value === 'string' && value.length > 0) return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  }
  return undefined
}

export function attrNumber(
  attrs: OtelAttributes | undefined,
  ...keys: string[]
): number | undefined {
  if (!attrs) return undefined
  for (const key of keys) {
    const value = attrs[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

export function attrStringArray(
  attrs: OtelAttributes | undefined,
  ...keys: string[]
): string[] | undefined {
  if (!attrs) return undefined
  for (const key of keys) {
    const value = attrs[key]
    if (Array.isArray(value)) {
      const strings = value.map(String).filter((item) => item.length > 0)
      if (strings.length > 0) return strings
    }
    if (typeof value === 'string' && value.length > 0) return [value]
  }
  return undefined
}

export function coalesceProvider(attrs: OtelAttributes | undefined): string | undefined {
  return attrString(attrs, 'gen_ai.provider.name', 'gen_ai.system')
}

export function coalesceInputTokens(attrs: OtelAttributes | undefined): number | undefined {
  return attrNumber(attrs, 'gen_ai.usage.input_tokens', 'gen_ai.usage.prompt_tokens')
}

export function coalesceOutputTokens(attrs: OtelAttributes | undefined): number | undefined {
  return attrNumber(attrs, 'gen_ai.usage.output_tokens', 'gen_ai.usage.completion_tokens')
}

export function coalesceOperationName(attrs: OtelAttributes | undefined): string | undefined {
  return attrString(attrs, 'gen_ai.operation.name')
}

export function coalesceAgentId(attrs: OtelAttributes | undefined): string | undefined {
  return attrString(attrs, 'gen_ai.agent.id', 'gen_ai.agent.name')
}

export function coalesceConversationId(attrs: OtelAttributes | undefined): string | undefined {
  return attrString(attrs, 'gen_ai.conversation.id')
}

export function coalesceModel(attrs: OtelAttributes | undefined): string | undefined {
  return attrString(attrs, 'gen_ai.response.model', 'gen_ai.request.model')
}

export function coalesceToolName(attrs: OtelAttributes | undefined): string | undefined {
  return attrString(attrs, 'gen_ai.tool.name')
}

export function coalesceToolCallId(attrs: OtelAttributes | undefined): string | undefined {
  return attrString(attrs, 'gen_ai.tool.call.id')
}

export function coalesceErrorType(attrs: OtelAttributes | undefined): string | undefined {
  return attrString(attrs, 'error.type', 'exception.type')
}

/** Parse JSON-ish attribute values (messages, tool args) when exporters stringify them. */
export function parseJsonAttr(value: OtelAttributeValue): unknown {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      return value
    }
  }
  return value
}
