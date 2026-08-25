import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'

import type { ProjectInstruction } from '../departments/types.ts'
import type { AfterimageStore } from '../store.ts'

export type InstructionStoreFile = {
  version: 1
  instructions: ProjectInstruction[]
}

function emptyStore(): InstructionStoreFile {
  return { version: 1, instructions: [] }
}

function instructionsPath(store: Pick<AfterimageStore, 'root'>): string {
  return path.join(store.root, 'instructions.json')
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function loadProjectInstructions(
  store: Pick<AfterimageStore, 'root'>,
): Promise<ProjectInstruction[]> {
  const filePath = instructionsPath(store)
  if (!(await exists(filePath))) return []
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as InstructionStoreFile
    if (!Array.isArray(parsed.instructions)) return []
    return parsed.instructions.filter(
      (item) => typeof item?.id === 'string' && typeof item?.text === 'string',
    )
  } catch {
    return []
  }
}

export async function saveProjectInstructions(
  store: Pick<AfterimageStore, 'root'>,
  instructions: ProjectInstruction[],
): Promise<InstructionStoreFile> {
  const payload: InstructionStoreFile = {
    version: 1,
    instructions,
  }
  await mkdir(store.root, { recursive: true })
  await writeFile(instructionsPath(store), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}

export async function upsertProjectInstruction(
  store: Pick<AfterimageStore, 'root'>,
  instruction: ProjectInstruction,
): Promise<ProjectInstruction[]> {
  const existing = await loadProjectInstructions(store)
  const without = existing.filter((item) => item.id !== instruction.id)
  const next = [...without, instruction]
  await saveProjectInstructions(store, next)
  return next
}
