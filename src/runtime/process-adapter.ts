import { spawn as nodeSpawn } from 'node:child_process'

import { createObserver, type RecordableEvent } from '../observer.ts'
import { createFilesystemWatcher } from './filesystem-watcher.ts'
import type {
  ProcessRuntimeOptions,
  ProcessSpawnFn,
  RuntimeAdapter,
  RuntimeObserveOptions,
  RuntimeObserveResult,
} from './types.ts'

const defaultSpawn: ProcessSpawnFn = (command, options) =>
  nodeSpawn(command[0]!, command.slice(1), {
    cwd: options.cwd,
    env: options.env,
    shell: options.shell,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

function finishStatus(
  exitCode: number | null,
  signal: NodeJS.Signals | null,
): 'completed' | 'failed' | 'cancelled' {
  if (signal) return 'cancelled'
  if (exitCode === 0) return 'completed'
  return 'failed'
}

function collectStream(
  stream: NodeJS.ReadableStream | null | undefined,
  onChunk: (text: string) => void,
): Promise<void> {
  if (!stream) return Promise.resolve()
  return new Promise((resolve) => {
    stream.on('data', (chunk: Buffer | string) => {
      onChunk(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
    })
    stream.on('end', resolve)
    stream.on('close', resolve)
  })
}

/**
 * Subprocess runtime adapter — v1 observation surface.
 * Records process start/end, cwd, stdout/stderr, exit code, timestamps,
 * and workspace file writes via filesystem observation.
 */
export async function observeProcess(
  options: ProcessRuntimeOptions,
): Promise<RuntimeObserveResult> {
  const spawn = options.spawn ?? defaultSpawn
  const observer = options.createObserver?.(options.store) ?? createObserver({ store: options.store })

  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const command = options.command
  const watchFilesystem = options.watchFilesystem ?? true

  if (!command.length) {
    throw new Error('observeProcess requires a non-empty command')
  }

  let incidentsOpened = 0
  const record = async (event: RecordableEvent) => {
    const result = await observer.record(event)
    incidentsOpened += result.detections.length
    return result
  }

  await observer.startRun({ agentId: options.agentId ?? 'subprocess' })

  const fsWatcher = watchFilesystem
    ? createFilesystemWatcher({
        workspaceRoot: cwd,
        debounceMs: options.filesystemDebounceMs,
        watchFn: options.watchFn,
        onWrite: async ({ path: filePath, content, hash }) => {
          await record({
            type: 'file_write',
            path: filePath,
            content,
            hash,
            ok: true,
          })
        },
      })
    : null

  fsWatcher?.start()

  const child = spawn(command, { cwd, env, shell: false })

  await record({
    type: 'process_start',
    command,
    cwd,
    pid: child.pid,
  })

  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []

  const stdoutDone = collectStream(child.stdout, (text) => {
    stdoutChunks.push(text)
  })
  const stderrDone = collectStream(child.stderr, (text) => {
    stderrChunks.push(text)
  })

  const exit = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once('error', reject)
      child.once('close', (exitCode, signal) => resolve({ exitCode, signal }))
    },
  )

  await Promise.all([stdoutDone, stderrDone])

  if (fsWatcher) {
    const debounceMs = options.filesystemDebounceMs ?? 100
    await new Promise((resolve) => setTimeout(resolve, debounceMs + 75))
    await fsWatcher.stop()
  }

  const stdout = stdoutChunks.join('')
  const stderr = stderrChunks.join('')

  if (stdout.length > 0) {
    await record({
      type: 'process_output',
      stream: 'stdout',
      text: stdout,
    })
  }

  if (stderr.length > 0) {
    await record({
      type: 'process_output',
      stream: 'stderr',
      text: stderr,
    })
  }

  await record({
    type: 'process_end',
    exitCode: exit.exitCode,
    signal: exit.signal,
  })

  const run = await observer.finishRun(finishStatus(exit.exitCode, exit.signal))

  return {
    run,
    exitCode: exit.exitCode,
    signal: exit.signal,
    incidentsOpened,
  }
}

export const processRuntimeAdapter: RuntimeAdapter = {
  name: 'process',
  observe: observeProcess,
}

export async function runCommand(options: RuntimeObserveOptions): Promise<RuntimeObserveResult> {
  return processRuntimeAdapter.observe(options)
}
