/**
 * Privacy defaults for persisted Afterimage events.
 *
 * By default `.afterimage/` stores file hashes + metadata only.
 * Set `AFTERIMAGE_STORE_FILE_CONTENT=1` (or legacy `LUCID_STORE_FILE_CONTENT=1`)
 * — or pass `retainFileContent: true` — to keep full source / hash-input bodies.
 */

const TRUTHY = new Set(['1', 'true', 'yes', 'on'])

function envFlag(env: NodeJS.ProcessEnv, ...keys: string[]): boolean {
  for (const key of keys) {
    const raw = env[key]
    if (typeof raw === 'string' && TRUTHY.has(raw.trim().toLowerCase())) {
      return true
    }
  }
  return false
}

/** True when env opts in to retaining file bodies in stored events. */
export function retainFileContentFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return envFlag(env, 'AFTERIMAGE_STORE_FILE_CONTENT', 'LUCID_STORE_FILE_CONTENT')
}

/**
 * Strip `content` / `contentHashInput` from a file_write unless retention is on.
 * Hash and metadata are kept. Non-file_write events pass through unchanged.
 */
export function stripFileWriteBodies<T extends { type: string }>(
  event: T,
  retainFileContent: boolean,
): T {
  if (retainFileContent || event.type !== 'file_write') return event

  const {
    content: _content,
    contentHashInput: _contentHashInput,
    ...rest
  } = event as T & {
    content?: string
    contentHashInput?: string
  }

  return rest as T
}
