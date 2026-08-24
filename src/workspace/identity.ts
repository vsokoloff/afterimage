import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { access, stat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { constants as fsConstants } from 'node:fs'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type Workspace = {
  id: string
  /** Absolute path to the repository / project root (parent of `.lucid/`). */
  root: string
  /** Human label, e.g. `owner/repo` or folder name. */
  label: string
  remoteUrl?: string
  createdAt: string
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function runGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 5_000,
    })
    return stdout.trim()
  } catch {
    return null
  }
}

/** Walk upward until a `.git` directory or file is found. */
async function findGitRoot(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir)
  const { root } = path.parse(current)

  while (true) {
    const gitPath = path.join(current, '.git')
    if (await pathExists(gitPath)) {
      const gitStat = await stat(gitPath)
      if (gitStat.isDirectory()) return current
      return current
    }
    if (current === root) break
    current = path.dirname(current)
  }

  return null
}

/** Resolve the project root from cwd — prefers git root, else cwd. */
export async function resolveProjectRoot(cwd = process.cwd()): Promise<string> {
  const resolved = path.resolve(cwd)
  const fromGit = await runGit(resolved, ['rev-parse', '--show-toplevel'])
  if (fromGit) {
    try {
      return await realpath(fromGit)
    } catch {
      return path.resolve(fromGit)
    }
  }

  const walked = await findGitRoot(resolved)
  if (walked) {
    try {
      return await realpath(walked)
    } catch {
      return walked
    }
  }

  try {
    return await realpath(resolved)
  } catch {
    return resolved
  }
}

/** Parse `owner/repo` from common git remote URLs. */
export function parseRemoteLabel(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim()
  const scp = /^[^@]+@[^:]+:([^/]+\/[^/.]+)(?:\.git)?$/.exec(trimmed)
  if (scp) return scp[1]!

  try {
    const normalized = trimmed.replace(/^git\+https:\/\//, 'https://').replace(/^git:\/\//, 'https://')
    const url = new URL(normalized.includes('://') ? normalized : `https://${normalized}`)
    const parts = url.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/').filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
    }
  } catch {
    return null
  }

  return null
}

function workspaceId(projectRoot: string, remoteUrl?: string): string {
  const source = remoteUrl ?? projectRoot
  return `ws_${createHash('sha256').update(source).digest('hex').slice(0, 16)}`
}

function fallbackLabel(projectRoot: string): string {
  return path.basename(projectRoot) || 'local-workspace'
}

/** Build a stable workspace identity for a repository root. */
export async function resolveWorkspace(projectRoot: string): Promise<Workspace> {
  const root = path.resolve(projectRoot)
  const remoteUrl =
    (await runGit(root, ['remote', 'get-url', 'origin'])) ??
    (await runGit(root, ['remote', 'get-url', 'upstream'])) ??
    undefined

  const remoteLabel = remoteUrl ? parseRemoteLabel(remoteUrl) : null
  const label = remoteLabel ?? fallbackLabel(root)

  return {
    id: workspaceId(root, remoteUrl),
    root,
    label,
    remoteUrl,
    createdAt: new Date().toISOString(),
  }
}
