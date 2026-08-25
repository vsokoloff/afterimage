import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import path from 'node:path'
import { constants as fsConstants } from 'node:fs'

import type { AfterimageStore } from '../store.ts'
import { resolveWorkspace, type Workspace } from './identity.ts'

export type RepoAgentEntry = {
  name?: string
  characterId?: string
  role?: string
}

export type RepoAgentsFile = {
  agents: Record<string, RepoAgentEntry>
}

const EMPTY_AGENTS: RepoAgentsFile = { agents: {} }

function workspacePath(store: Pick<AfterimageStore, 'root'>): string {
  return path.join(store.root, 'workspace.json')
}

function agentsPath(store: Pick<AfterimageStore, 'root'>): string {
  return path.join(store.root, 'agents.json')
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

/** Persist workspace identity under `.afterimage/workspace.json` (idempotent). */
export async function ensureWorkspace(
  store: Pick<AfterimageStore, 'root' | 'projectRoot'>,
): Promise<Workspace> {
  const filePath = workspacePath(store)
  if (await exists(filePath)) {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as Workspace
  }

  const workspace = await resolveWorkspace(store.projectRoot)
  await mkdir(store.root, { recursive: true })
  await writeFile(filePath, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8')
  return workspace
}

export async function loadWorkspace(store: AfterimageStore): Promise<Workspace> {
  const filePath = workspacePath(store)
  if (!(await exists(filePath))) {
    return ensureWorkspace(store)
  }
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw) as Workspace
}

/** Optional per-repo agent display config (`.afterimage/agents.json`). */
export async function loadRepoAgents(store: AfterimageStore): Promise<RepoAgentsFile> {
  const filePath = agentsPath(store)
  if (!(await exists(filePath))) return EMPTY_AGENTS
  const raw = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw) as RepoAgentsFile
  if (!parsed.agents || typeof parsed.agents !== 'object') return EMPTY_AGENTS
  return parsed
}

export async function writeRepoAgents(store: AfterimageStore, config: RepoAgentsFile): Promise<void> {
  await mkdir(store.root, { recursive: true })
  await writeFile(agentsPath(store), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

/** Initialize `.afterimage/` for the current repository. */
export async function initWorkspaceStore(store: AfterimageStore): Promise<{
  workspace: Workspace
  agents: RepoAgentsFile
}> {
  await mkdir(store.root, { recursive: true })
  await mkdir(path.join(store.root, 'runs'), { recursive: true })
  await mkdir(path.join(store.root, 'incidents'), { recursive: true })

  const workspace = await ensureWorkspace(store)
  const agents = await loadRepoAgents(store)
  if (!(await exists(agentsPath(store)))) {
    await writeRepoAgents(store, EMPTY_AGENTS)
  }

  return { workspace, agents }
}
