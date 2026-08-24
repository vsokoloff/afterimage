import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { LucidStore } from '../../store.ts'
import type { CursorSessionState } from './types.ts'

function sessionPath(store: Pick<LucidStore, 'root'>): string {
  return path.join(store.root, 'cursor-session.json')
}

export async function loadCursorSession(
  store: Pick<LucidStore, 'root'>,
): Promise<CursorSessionState | null> {
  try {
    const raw = await readFile(sessionPath(store), 'utf8')
    if (!raw.trim()) return null
    const parsed = JSON.parse(raw) as CursorSessionState
    if (
      typeof parsed.conversationId !== 'string' ||
      typeof parsed.runId !== 'string' ||
      typeof parsed.startedAt !== 'string'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function saveCursorSession(
  store: Pick<LucidStore, 'root'>,
  session: CursorSessionState,
): Promise<void> {
  await mkdir(store.root, { recursive: true })
  await writeFile(sessionPath(store), `${JSON.stringify(session, null, 2)}\n`, 'utf8')
}

export async function clearCursorSession(store: Pick<LucidStore, 'root'>): Promise<void> {
  try {
    await unlink(sessionPath(store))
  } catch {
    // ignore missing
  }
}
