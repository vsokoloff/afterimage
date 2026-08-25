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

/** Resolve display metadata from repo-local `.afterimage/agents.json` only. */
export function resolveAgentCatalog(
  agentId: string,
  repoAgents: RepoAgentsFile,
): {
  name: string
  characterId: string | null
  role: string | null
} {
  const key = configKeyFromAgentId(agentId)
  const configured =
    repoAgents.agents[key] ??
    repoAgents.agents[agentId] ??
    (agentId === 'subprocess' ? repoAgents.agents.gitty : undefined) ??
    (agentId === 'gitty' ? repoAgents.agents.subprocess : undefined)

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

  if (agentId === 'uma') {
    return {
      name: configured?.name ?? 'Uma',
      characterId: configured?.characterId ?? 'uma',
      role:
        configured?.role ??
        'UI design — remembers how you want each part of the interface to feel',
    }
  }

  if (agentId === 'gitty' || agentId === 'subprocess') {
    return {
      name: configured?.name ?? 'Gitty',
      characterId: configured?.characterId ?? 'kitty',
      role: configured?.role ?? 'Takes care of all your git work and PRs',
    }
  }

  // Repo config may set character/role without a custom name.
  if (configured) {
    return {
      name: configured.name ?? formatAgentLabel(agentId),
      characterId: configured.characterId ?? null,
      role: configured.role ?? null,
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
  if (agentId === 'subprocess' || agentId === 'gitty') return 'Process'
  if (agentId === 'uma') return 'Design'

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
