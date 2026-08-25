import type { AfterimageStore } from '../store.ts'
import type { Workspace } from './identity.ts'
import { loadWorkspace } from './store.ts'

export { resolveProjectRoot, resolveWorkspace, parseRemoteLabel, type Workspace } from './identity.ts'
export {
  ensureWorkspace,
  initWorkspaceStore,
  loadRepoAgents,
  loadWorkspace,
  writeRepoAgents,
  type RepoAgentEntry,
  type RepoAgentsFile,
} from './store.ts'

export type WorkspaceResponse = {
  workspace: Workspace
}

export async function fetchWorkspace(store: AfterimageStore): Promise<WorkspaceResponse> {
  return { workspace: await loadWorkspace(store) }
}
