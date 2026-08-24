/**
 * Privacy defaults for persisted Lucid events.
 *
 * By default `.lucid/` stores file hashes + metadata only.
 * Set `LUCID_STORE_FILE_CONTENT=1` (or pass `retainFileContent: true`) to keep
 * full source / hash-input bodies for debugging.
 */

const TRUTHY = new Set(['1', 'true', 'yes', 'on'])

/** True when env opts in to retaining file bodies in stored events. */
export function retainFileContentFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.LUCID_STORE_FILE_CONTENT
  if (typeof raw !== 'string') return false
  return TRUTHY.has(raw.trim().toLowerCase())
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
