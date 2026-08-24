import type { AgentEvent, FileWriteEvent, PromptEvent } from '../../../events.ts'
import { successfulFileWriteEvents } from '../../../events.ts'
import type {
  AgentTrace,
  ScopeExplosionAbnormality,
  ScopeExplosionSignal,
} from '../../types.ts'
import { resolveTraceEvents } from '../../types.ts'

/** Fire when files ≥ this and top-level dirs ≥ MULTI_DIR_MIN_DIRS. */
export const MULTI_DIR_MIN_FILES = 6
export const MULTI_DIR_MIN_DIRS = 3
/** Fire when unique successful write paths reach this count alone. */
export const HIGH_FILE_COUNT = 10
/** Prompt mentions ≤ this many path tokens and writes spill outside them. */
export const PROMPT_SCOPE_MAX_MENTIONED = 2
export const PROMPT_SCOPE_MIN_FILES = 5

const PATH_TOKEN =
  /(?:^|[\s"'`(])((?:[\w.-]+\/)+[\w.-]+\.[\w.-]+|[\w.-]+\.(?:py|ts|tsx|js|jsx|go|rs|md|json|yml|yaml|toml|css|html))\b/g

export function fileWritesFromTrace(trace: AgentTrace): FileWriteEvent[] {
  return successfulFileWriteEvents(resolveTraceEvents(trace))
}

export function topLevelDir(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '')
  const slash = normalized.indexOf('/')
  if (slash === -1) return '.'
  return normalized.slice(0, slash)
}

export function extractPromptPaths(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(PATH_TOKEN)) {
    const token = match[1]
    if (token) found.add(token.replace(/\\/g, '/'))
  }
  return [...found].sort()
}

function latestUserPrompt(events: AgentEvent[]): PromptEvent | null {
  const prompts = events.filter(
    (event): event is PromptEvent =>
      event.type === 'prompt' && (event.role === 'user' || event.role === undefined),
  )
  return prompts.at(-1) ?? null
}

function pathMatchesMention(path: string, mentioned: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  const mention = mentioned.replace(/\\/g, '/')
  return normalized === mention || normalized.endsWith(`/${mention}`) || normalized.startsWith(`${mention}/`)
}

function isInsideMentioned(path: string, mentioned: string[]): boolean {
  return mentioned.some((mention) => pathMatchesMention(path, mention))
}

/**
 * Deterministic evidence string for scope-explosion.
 * Stable across machines — no locale, no LLM.
 */
export function formatScopeExplosionEvidence(signal: ScopeExplosionSignal): string {
  const parts = [
    'scope-explosion',
    `files=${signal.fileCount}`,
    `dirs=${signal.topLevelDirs.length}`,
    `bytes=${signal.totalBytes}`,
    `reason=${signal.reason}`,
    `paths=${signal.paths.join(',')}`,
  ]
  if (signal.promptPaths?.length) {
    parts.push(`promptPaths=${signal.promptPaths.join(',')}`)
  }
  if (signal.outsidePaths?.length) {
    parts.push(`outside=${signal.outsidePaths.join(',')}`)
  }
  return parts.join(' ')
}

function uniquePaths(writes: FileWriteEvent[]): string[] {
  return [...new Set(writes.map((write) => write.path.replace(/\\/g, '/')))].sort()
}

function buildSignal(
  writes: FileWriteEvent[],
  paths: string[],
  dirs: string[],
  totalBytes: number,
  reason: ScopeExplosionSignal['reason'],
  extra: Partial<Pick<ScopeExplosionSignal, 'promptPaths' | 'outsidePaths'>> = {},
): ScopeExplosionSignal {
  const last = writes[writes.length - 1]!
  return {
    fileCount: paths.length,
    topLevelDirs: dirs,
    totalBytes,
    paths,
    reason,
    triggeringEventId: last.id,
    ...extra,
  }
}

/**
 * Detect unusually broad change sets from successful file_write events.
 */
export function detectScopeExplosionFromWrites(
  writes: FileWriteEvent[],
  promptText?: string | null,
): ScopeExplosionSignal | null {
  const ordered = successfulFileWriteEvents(writes)
  if (ordered.length === 0) return null

  const paths = uniquePaths(ordered)
  const dirs = [...new Set(paths.map(topLevelDir))].sort()
  const totalBytes = ordered.reduce((sum, write) => sum + (write.byteLength ?? 0), 0)

  if (paths.length >= MULTI_DIR_MIN_FILES && dirs.length >= MULTI_DIR_MIN_DIRS) {
    return buildSignal(ordered, paths, dirs, totalBytes, 'multi-dir-blast')
  }

  if (paths.length >= HIGH_FILE_COUNT) {
    return buildSignal(ordered, paths, dirs, totalBytes, 'high-file-count')
  }

  if (promptText) {
    const promptPaths = extractPromptPaths(promptText)
    if (
      promptPaths.length > 0 &&
      promptPaths.length <= PROMPT_SCOPE_MAX_MENTIONED &&
      paths.length >= PROMPT_SCOPE_MIN_FILES
    ) {
      const outsidePaths = paths.filter((path) => !isInsideMentioned(path, promptPaths))
      if (outsidePaths.length > 0) {
        return buildSignal(ordered, paths, dirs, totalBytes, 'prompt-scope-violation', {
          promptPaths,
          outsidePaths,
        })
      }
    }
  }

  return null
}

export function detectScopeExplosion(trace: AgentTrace): ScopeExplosionAbnormality | null {
  const events = resolveTraceEvents(trace)
  const writes = fileWritesFromTrace(trace)
  const prompt = latestUserPrompt(events)
  const signal = detectScopeExplosionFromWrites(writes, prompt?.text)
  if (!signal) return null
  return { kind: 'scope-explosion', signal }
}
