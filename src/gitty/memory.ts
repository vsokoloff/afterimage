import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'

import type { AfterimageStore } from '../store.ts'

/** Remembered Gitty habits — save the workspace whenever code changes. */
export type GittyHabits = {
  push: {
    commit: true
    explain: true
    push: true
    pr: true
    /** After meaningful code changes, commit + push without waiting to be asked. */
    autosaveOnChange: true
    rememberedAt: string
    note: string
  }
}

const DEFAULT_PUSH_NOTE =
  'Whenever the codebase changes, Gitty commits and pushes (and takes care of PRs) so work is saved. Saying "gitty push" does the same full habit immediately.'

export function defaultGittyHabits(now = new Date()): GittyHabits {
  return {
    push: {
      commit: true,
      explain: true,
      push: true,
      pr: true,
      autosaveOnChange: true,
      rememberedAt: now.toISOString(),
      note: DEFAULT_PUSH_NOTE,
    },
  }
}

function gittyPath(store: Pick<AfterimageStore, 'root'>): string {
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

export async function loadGittyHabits(store: AfterimageStore): Promise<GittyHabits> {
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
        autosaveOnChange: true,
        rememberedAt: parsed.push.rememberedAt ?? new Date().toISOString(),
        note: parsed.push.note ?? DEFAULT_PUSH_NOTE,
      },
    }
  } catch {
    return defaultGittyHabits()
  }
}

/** Persist Gitty’s save habit under `.afterimage/gitty.json`. */
export async function rememberGittyPush(store: AfterimageStore): Promise<GittyHabits> {
  const habits = defaultGittyHabits()
  await mkdir(store.root, { recursive: true })
  await writeFile(gittyPath(store), `${JSON.stringify(habits, null, 2)}\n`, 'utf8')
  return habits
}
