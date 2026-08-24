import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'

import type { LucidStore } from '../store.ts'
import {
  emptyUmaMemory,
  makeEntryId,
  renderUmaMemoryMarkdown,
  slugAbout,
  type UmaMemoryEntry,
  type UmaMemoryFile,
} from './types.ts'

function umaDir(store: Pick<LucidStore, 'root'>): string {
  return path.join(store.root, 'uma')
}

function memoryPath(store: Pick<LucidStore, 'root'>): string {
  return path.join(umaDir(store), 'memory.json')
}

/** Cursor-facing mirror so chat sessions always see Uma's preferences. */
export function umaCursorRulePath(projectRoot: string): string {
  return path.join(projectRoot, '.cursor', 'rules', 'uma-memory.mdc')
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function loadUmaMemory(store: LucidStore): Promise<UmaMemoryFile> {
  const filePath = memoryPath(store)
  if (!(await exists(filePath))) return emptyUmaMemory()
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as UmaMemoryFile
    if (!Array.isArray(parsed.entries)) return emptyUmaMemory()
    return {
      ...emptyUmaMemory(),
      ...parsed,
      agentId: 'uma',
      name: 'Uma',
      entries: parsed.entries,
    }
  } catch {
    return emptyUmaMemory()
  }
}

async function writeUmaMemory(store: LucidStore, memory: UmaMemoryFile): Promise<void> {
  await mkdir(umaDir(store), { recursive: true })
  await writeFile(memoryPath(store), `${JSON.stringify(memory, null, 2)}\n`, 'utf8')

  const rulePath = umaCursorRulePath(store.projectRoot)
  await mkdir(path.dirname(rulePath), { recursive: true })
  await writeFile(rulePath, renderUmaMemoryMarkdown(memory), 'utf8')
}

export async function rememberUmaPreference(
  store: LucidStore,
  input: { about: string; text: string; now?: Date },
): Promise<{ memory: UmaMemoryFile; entry: UmaMemoryEntry }> {
  const now = input.now ?? new Date()
  const about = input.about.trim() || 'general'
  const text = input.text.trim()
  if (!text) throw new Error('Uma needs something to remember.')

  const memory = await loadUmaMemory(store)
  const entry: UmaMemoryEntry = {
    id: makeEntryId(about, now),
    about: about.trim(),
    text,
    rememberedAt: now.toISOString(),
  }

  memory.entries.push(entry)
  memory.updatedAt = now.toISOString()
  await writeUmaMemory(store, memory)
  return { memory, entry }
}

export async function forgetUmaPreference(
  store: LucidStore,
  input: { about?: string; id?: string },
): Promise<{ memory: UmaMemoryFile; removed: number }> {
  const memory = await loadUmaMemory(store)
  const before = memory.entries.length

  memory.entries = memory.entries.filter((entry) => {
    if (input.id) return entry.id !== input.id
    if (input.about) {
      return slugAbout(entry.about) !== slugAbout(input.about)
    }
    return true
  })

  const removed = before - memory.entries.length
  if (removed > 0) {
    memory.updatedAt = new Date().toISOString()
    await writeUmaMemory(store, memory)
  }
  return { memory, removed }
}

export async function ensureUmaMemorySeed(store: LucidStore): Promise<UmaMemoryFile> {
  const memory = await loadUmaMemory(store)
  if (!(await exists(memoryPath(store)))) {
    await writeUmaMemory(store, memory)
  } else if (!(await exists(umaCursorRulePath(store.projectRoot)))) {
    await writeUmaMemory(store, memory)
  }
  return memory
}
