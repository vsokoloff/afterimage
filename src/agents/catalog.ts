/**
 * Known agent display metadata — character art ids and friendly names only.
 * Operational status always comes from persisted runs/incidents, never from here.
 */
export type AgentCatalogEntry = {
  name: string
  characterId: string
  role: string
}

/** Maps raw agent id suffixes and legacy ids to mascot + copy. */
export const agentCatalog: Record<string, AgentCatalogEntry> = {
  auth: {
    name: 'Auth Agent',
    characterId: 'auth',
    role: 'Authentication & session coding',
  },
  appy: {
    name: 'Appy',
    characterId: 'appy',
    role: 'Application scaffold & wiring',
  },
  test: {
    name: 'Test Agent',
    characterId: 'test',
    role: 'Test authoring & regression',
  },
  research: {
    name: 'Research Agent',
    characterId: 'research',
    role: 'Docs & prior-art scout',
  },
  frontend: {
    name: 'Frontend Agent',
    characterId: 'frontend',
    role: 'UI / dashboard builder',
  },
  data: {
    name: 'Data Agent',
    characterId: 'data',
    role: 'Schemas, fixtures, traces',
  },
  ops: {
    name: 'Ops Agent',
    characterId: 'ops',
    role: 'Local runtime & process health',
  },
  subprocess: {
    name: 'Subprocess',
    characterId: 'ops',
    role: 'Commands observed via lucid run',
  },
}

export function formatAgentLabel(raw: string): string {
  const cleaned = raw.replace(/[_-]+/g, ' ').trim()
  if (!cleaned) return 'Unknown agent'
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase())
}

export function catalogKeyFromAgentId(agentId: string): string {
  if (agentId.startsWith('codex:')) return agentId.slice('codex:'.length)
  if (agentId.startsWith('recheck:')) return 'ops'
  return agentId
}

export function resolveAgentCatalog(agentId: string): {
  name: string
  characterId: string | null
  role: string | null
} {
  const key = catalogKeyFromAgentId(agentId)
  const entry = agentCatalog[key]
  if (entry) {
    return { name: entry.name, characterId: entry.characterId, role: entry.role }
  }

  if (agentId.startsWith('codex:')) {
    const suffix = agentId.slice('codex:'.length)
    return {
      name: formatAgentLabel(suffix),
      characterId: null,
      role: 'Codex SDK agent',
    }
  }

  if (agentId.startsWith('recheck:')) {
    return {
      name: 'Recheck run',
      characterId: 'ops',
      role: 'Incident verification reproduction',
    }
  }

  return {
    name: formatAgentLabel(agentId),
    characterId: null,
    role: null,
  }
}

export function resolveAgentRuntime(agentId: string, runEvents?: { type: string }[]): string {
  if (agentId.startsWith('codex:') || agentId.startsWith('recheck:')) return 'Codex'
  if (agentId === 'subprocess') return 'Process'

  const hasProcess = runEvents?.some(
    (event) => event.type === 'process_start' || event.type === 'process_end',
  )
  const hasAgentEvents = runEvents?.some(
    (event) =>
      event.type === 'model_response' ||
      event.type === 'tool_call' ||
      event.type === 'prompt',
  )

  if (hasAgentEvents && !hasProcess) return 'Codex'
  if (hasProcess) return 'Process'
  return 'Local'
}
