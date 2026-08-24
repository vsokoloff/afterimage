import { watch, type FSWatcher } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { sha256Hex } from '../events.ts'

export type WatchFn = typeof watch

const IGNORED_DIR_NAMES = new Set(['.git', 'node_modules', '.lucid', 'dist', 'build', 'coverage'])
const IGNORED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.zip',
  '.gz',
  '.pdf',
  '.wasm',
  '.node',
  '.o',
  '.so',
  '.dylib',
  '.exe',
  '.dll',
  '.class',
  '.jar',
  '.pyc',
  '.pyo',
  '.bin',
  '.dat',
])

const MAX_TEXT_BYTES = 512 * 1024

export type FilesystemWritePayload = {
  path: string
  content: string
  hash: string
}

export type FilesystemWatcherOptions = {
  workspaceRoot: string
  debounceMs?: number
  onWrite: (payload: FilesystemWritePayload) => Promise<void> | void
  /** Inject fs.watch (tests). */
  watchFn?: WatchFn
}

/** True when a workspace-relative path should not be observed. */
export function shouldIgnoreWorkspacePath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll('\\', '/')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.some((segment) => IGNORED_DIR_NAMES.has(segment))) return true

  const base = segments.at(-1) ?? normalized
  if (base.startsWith('.')) return true

  const ext = path.extname(base).toLowerCase()
  if (IGNORED_EXTENSIONS.has(ext)) return true

  return false
}

async function readTextualContent(absPath: string): Promise<string | null> {
  try {
    const info = await stat(absPath)
    if (!info.isFile() || info.size > MAX_TEXT_BYTES) return null

    const buffer = await readFile(absPath)
    if (buffer.includes(0)) return null

    return buffer.toString('utf8')
  } catch {
    return null
  }
}

export function createFilesystemWatcher(options: FilesystemWatcherOptions) {
  const debounceMs = options.debounceMs ?? 100
  const watchImpl = options.watchFn ?? watch
  const workspaceRoot = path.resolve(options.workspaceRoot)

  const lastHashByPath = new Map<string, string>()
  const pending = new Map<string, NodeJS.Timeout>()
  let watcher: FSWatcher | null = null

  const toRelative = (filename: string): string => {
    const abs = path.isAbsolute(filename)
      ? path.resolve(filename)
      : path.resolve(workspaceRoot, filename)
    return path.relative(workspaceRoot, abs).replaceAll('\\', '/')
  }

  const flush = async (relativePath: string): Promise<void> => {
    pending.delete(relativePath)
    if (shouldIgnoreWorkspacePath(relativePath)) return

    const absPath = path.join(workspaceRoot, relativePath)
    const content = await readTextualContent(absPath)
    if (content === null) return

    const hash = sha256Hex(content)
    if (lastHashByPath.get(relativePath) === hash) return

    lastHashByPath.set(relativePath, hash)
    await options.onWrite({ path: relativePath, content, hash })
  }

  const schedule = (relativePath: string): void => {
    if (shouldIgnoreWorkspacePath(relativePath)) return

    const existing = pending.get(relativePath)
    if (existing) clearTimeout(existing)

    pending.set(
      relativePath,
      setTimeout(() => {
        void flush(relativePath)
      }, debounceMs),
    )
  }

  return {
    start(): void {
      if (watcher) return
      watcher = watchImpl(workspaceRoot, { recursive: true }, (_eventType, filename) => {
        if (filename == null) return
        const name = Buffer.isBuffer(filename)
          ? filename.toString('utf8')
          : String(filename)
        const rel = toRelative(name)
        if (!rel || rel.startsWith('..')) return
        schedule(rel)
      })
    },

    async stop(): Promise<void> {
      if (watcher) {
        watcher.close()
        watcher = null
      }

      const scheduled = [...pending.entries()]
      for (const [, timer] of scheduled) clearTimeout(timer)
      pending.clear()

      await Promise.all(scheduled.map(([relativePath]) => flush(relativePath)))
    },

    /** Test helper — simulate a debounced write without fs.watch. */
    async observePath(relativePath: string): Promise<void> {
      await flush(relativePath)
    },
  }
}

export type FilesystemWatcher = ReturnType<typeof createFilesystemWatcher>
