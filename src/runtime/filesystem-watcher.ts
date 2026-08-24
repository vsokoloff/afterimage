import { watch, type FSWatcher } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
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

type ContentPayload = {
  content: string
  hash: string
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

async function listTextualRelativePaths(workspaceRoot: string): Promise<string[]> {
  const found: string[] = []
  let entries: string[]
  try {
    entries = await readdir(workspaceRoot, { recursive: true })
  } catch {
    return found
  }

  for (const entry of entries) {
    const relativePath = String(entry).replaceAll('\\', '/')
    if (!relativePath || shouldIgnoreWorkspacePath(relativePath)) continue
    const absPath = path.join(workspaceRoot, relativePath)
    try {
      const info = await stat(absPath)
      if (!info.isFile()) continue
    } catch {
      continue
    }
    found.push(relativePath)
  }
  return found
}

export function createFilesystemWatcher(options: FilesystemWatcherOptions) {
  const debounceMs = options.debounceMs ?? 100
  const watchImpl = options.watchFn ?? watch
  const workspaceRoot = path.resolve(options.workspaceRoot)

  /** Baseline hashes taken at run start — not emitted until a path changes. */
  const seedHashByPath = new Map<string, string>()
  const seedContentByPath = new Map<string, string>()
  const seedEmitted = new Set<string>()

  /** Last hash actually delivered to onWrite. */
  const lastEmittedHashByPath = new Map<string, string>()

  /** Latest read waiting for trailing debounce flush. */
  const pendingPayload = new Map<string, ContentPayload>()
  const pendingTimers = new Map<string, NodeJS.Timeout>()

  /** Serialize emits per path so baseline + intermediates stay ordered. */
  const pathQueues = new Map<string, Promise<void>>()

  let watcher: FSWatcher | null = null

  const toRelative = (filename: string): string => {
    const abs = path.isAbsolute(filename)
      ? path.resolve(filename)
      : path.resolve(workspaceRoot, filename)
    return path.relative(workspaceRoot, abs).replaceAll('\\', '/')
  }

  const enqueue = (relativePath: string, task: () => Promise<void>): Promise<void> => {
    const previous = pathQueues.get(relativePath) ?? Promise.resolve()
    const next = previous.then(task, task)
    pathQueues.set(
      relativePath,
      next.catch(() => {
        /* keep queue alive */
      }),
    )
    return next
  }

  const emitWrite = async (
    relativePath: string,
    content: string,
    hash: string,
  ): Promise<void> => {
    const seedHash = seedHashByPath.get(relativePath)
    const seedContent = seedContentByPath.get(relativePath)

    if (seedHash && seedContent !== undefined && !seedEmitted.has(relativePath)) {
      if (hash !== seedHash) {
        await options.onWrite({
          path: relativePath,
          content: seedContent,
          hash: seedHash,
        })
        lastEmittedHashByPath.set(relativePath, seedHash)
      }
      seedEmitted.add(relativePath)
    }

    if (lastEmittedHashByPath.get(relativePath) === hash) return

    await options.onWrite({ path: relativePath, content, hash })
    lastEmittedHashByPath.set(relativePath, hash)
  }

  const readPayload = async (relativePath: string): Promise<ContentPayload | null> => {
    if (shouldIgnoreWorkspacePath(relativePath)) return null
    const absPath = path.join(workspaceRoot, relativePath)
    const content = await readTextualContent(absPath)
    if (content === null) return null
    return { content, hash: sha256Hex(content) }
  }

  const flushPending = async (relativePath: string): Promise<void> => {
    pendingTimers.delete(relativePath)
    const pending = pendingPayload.get(relativePath)
    pendingPayload.delete(relativePath)

    const payload = pending ?? (await readPayload(relativePath))
    if (!payload) return

    await emitWrite(relativePath, payload.content, payload.hash)
  }

  /**
   * Read promptly; emit any prior distinct pending hash; keep trailing debounce
   * for the latest payload so settle/stop still work.
   */
  const ingest = async (relativePath: string): Promise<void> => {
    if (shouldIgnoreWorkspacePath(relativePath)) return

    const payload = await readPayload(relativePath)
    if (!payload) return

    await enqueue(relativePath, async () => {
      const previous = pendingPayload.get(relativePath)
      if (
        previous &&
        previous.hash !== payload.hash &&
        previous.hash !== lastEmittedHashByPath.get(relativePath)
      ) {
        await emitWrite(relativePath, previous.content, previous.hash)
      }
      pendingPayload.set(relativePath, payload)

      const existing = pendingTimers.get(relativePath)
      if (existing) clearTimeout(existing)

      pendingTimers.set(
        relativePath,
        setTimeout(() => {
          void enqueue(relativePath, () => flushPending(relativePath))
        }, debounceMs),
      )
    })
  }

  const schedule = (relativePath: string): void => {
    void ingest(relativePath)
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

    /**
     * Walk the workspace and seed content hashes without emitting file_write
     * events (baseline is emitted later on first real change).
     */
    async snapshot(): Promise<void> {
      const paths = await listTextualRelativePaths(workspaceRoot)
      for (const relativePath of paths) {
        const payload = await readPayload(relativePath)
        if (!payload) continue
        seedHashByPath.set(relativePath, payload.hash)
        seedContentByPath.set(relativePath, payload.content)
      }
    },

    async stop(): Promise<void> {
      if (watcher) {
        watcher.close()
        watcher = null
      }

      const timers = [...pendingTimers.entries()]
      for (const [, timer] of timers) clearTimeout(timer)
      pendingTimers.clear()

      const paths = new Set<string>([
        ...timers.map(([relativePath]) => relativePath),
        ...pendingPayload.keys(),
      ])
      await Promise.all(
        [...paths].map((relativePath) =>
          enqueue(relativePath, () => flushPending(relativePath)),
        ),
      )
    },

    /**
     * Test/helper: ingest a path change immediately (same path as fs.watch),
     * awaiting intermediate emit logic without waiting for trailing debounce.
     */
    async noticeChange(relativePath: string): Promise<void> {
      await ingest(relativePath)
    },

    /** Test helper — read path now and emit through the same baseline/dedupe path. */
    async observePath(relativePath: string): Promise<void> {
      const existing = pendingTimers.get(relativePath)
      if (existing) {
        clearTimeout(existing)
        pendingTimers.delete(relativePath)
      }
      await enqueue(relativePath, async () => {
        const payload = await readPayload(relativePath)
        if (!payload) return
        const previous = pendingPayload.get(relativePath)
        if (
          previous &&
          previous.hash !== payload.hash &&
          previous.hash !== lastEmittedHashByPath.get(relativePath)
        ) {
          await emitWrite(relativePath, previous.content, previous.hash)
        }
        pendingPayload.delete(relativePath)
        await emitWrite(relativePath, payload.content, payload.hash)
      })
    },
  }
}

export type FilesystemWatcher = ReturnType<typeof createFilesystemWatcher>
