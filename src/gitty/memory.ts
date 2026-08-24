import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'

import type { LucidStore } from '../store.ts'

/** Remembered Gitty habits — `push` always means commit + explain + push + PR care. */
export type GittyHabits = {
  push: {
    commit: true
    explain: true
    push: true
    pr: true
    rememberedAt: string
    note: string
  }
}

const DEFAULT_PUSH_NOTE =
  'When the user says "gitty push", always: commit pending work, explain the commit, push, and take care of any PRs.'

export function defaultGittyHabits(now = new Date()): GittyHabits {
  return {
    push: {
      commit: true,
      explain: true,
      push: true,
      pr: true,
      rememberedAt: now.toISOString(),
      note: DEFAULT_PUSH_NOTE,
    },
  }
}

function gittyPath(store: Pick<LucidStore, 'root'>): string {
  return path.join(store.root, 'gitty.json')
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function loadGittyHabits(store: LucidStore): Promise<GittyHabits> {
  const filePath = gittyPath(store)
  if (!(await exists(filePath))) return defaultGittyHabits()
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<GittyHabits>
    if (!parsed.push) return defaultGittyHabits()
    return {
      push: {
        commit: true,
        explain: true,
        push: true,
        pr: true,
        rememberedAt: parsed.push.rememberedAt ?? new Date().toISOString(),
        note: parsed.push.note ?? DEFAULT_PUSH_NOTE,
      },
    }
  } catch {
    return defaultGittyHabits()
  }
}

/** Persist that `gitty push` = commit + explain + push + PR care. */
export async function rememberGittyPush(store: LucidStore): Promise<GittyHabits> {
  const habits = defaultGittyHabits()
  await mkdir(store.root, { recursive: true })
  await writeFile(gittyPath(store), `${JSON.stringify(habits, null, 2)}\n`, 'utf8')
  return habits
}
