import type { RepoAgentsFile } from '../workspace/store.ts'

export function formatAgentLabel(raw: string): string {
  const cleaned = raw.replace(/[_-]+/g, ' ').trim()
  if (!cleaned) return 'Unknown agent'
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase())
}

function configKeyFromAgentId(agentId: string): string {
  if (agentId.startsWith('codex:')) return agentId.slice('codex:'.length)
  return agentId
}

/** Resolve display metadata from repo-local `.lucid/agents.json` only. */
export function resolveAgentCatalog(
  agentId: string,
  repoAgents: RepoAgentsFile,
): {
  name: string
  characterId: string | null
  role: string | null
} {
  const key = configKeyFromAgentId(agentId)
  const configured = repoAgents.agents[key] ?? repoAgents.agents[agentId]

  if (configured?.name) {
    return {
      name: configured.name,
      characterId: configured.characterId ?? null,
      role: configured.role ?? null,
    }
  }

  if (agentId.startsWith('codex:')) {
    const suffix = agentId.slice('codex:'.length)
    return {
      name: configured?.name ?? formatAgentLabel(suffix),
      characterId: configured?.characterId ?? null,
      role: configured?.role ?? 'Codex SDK agent',
    }
  }

  if (agentId.startsWith('recheck:')) {
    return {
      name: configured?.name ?? 'Recheck run',
      characterId: configured?.characterId ?? null,
      role: configured?.role ?? 'Incident verification reproduction',
    }
  }

  if (agentId === 'subprocess') {
    return {
      name: configured?.name ?? 'Subprocess',
      characterId: configured?.characterId ?? null,
      role: configured?.role ?? 'Commands observed via lucid run',
    }
  }

  return {
    name: formatAgentLabel(agentId),
    characterId: configured?.characterId ?? null,
    role: configured?.role ?? null,
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
