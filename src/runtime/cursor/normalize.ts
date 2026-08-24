import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { sha256Hex } from '../../events.ts'
import type { RecordableEvent } from '../../observer.ts'
import { shouldIgnoreWorkspacePath } from '../filesystem-watcher.ts'
import type { CursorHookPayload } from './types.ts'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function toolNameFromPayload(payload: CursorHookPayload): string | undefined {
  return (
    stringField(payload.tool_name) ??
    stringField(payload.toolName) ??
    stringField(asRecord(payload.tool)?.name)
  )
}

function toolInputFromPayload(payload: CursorHookPayload): unknown {
  return payload.tool_input ?? payload.toolInput ?? asRecord(payload.tool)?.input
}

function toolOutputFromPayload(payload: CursorHookPayload): unknown {
  return payload.tool_output ?? payload.toolOutput ?? payload.output
}

function pathFromToolInput(input: unknown): string | undefined {
  const record = asRecord(input)
  if (!record) return undefined
  return (
    stringField(record.path) ??
    stringField(record.file_path) ??
    stringField(record.filePath) ??
    stringField(record.target_file) ??
    stringField(record.targetFile)
  )
}

function contentFromToolInput(input: unknown): string | undefined {
  const record = asRecord(input)
  if (!record) return undefined
  return (
    stringField(record.contents) ??
    stringField(record.content) ??
    stringField(record.new_string) ??
    stringField(record.newString)
  )
}

function toRelativePath(workspaceRoot: string, filePath: string): string {
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath)
  const relative = path.relative(workspaceRoot, absolute)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return filePath
  return relative.split(path.sep).join('/')
}

async function fileWriteFromPath(
  workspaceRoot: string,
  filePath: string,
  retainFileContent: boolean,
): Promise<RecordableEvent | null> {
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath)
  const relative = toRelativePath(workspaceRoot, filePath)
  if (shouldIgnoreWorkspacePath(relative)) return null

  try {
    const content = await readFile(absolute, 'utf8')
    return {
      type: 'file_write',
      path: relative,
      hash: sha256Hex(content),
      byteLength: Buffer.byteLength(content, 'utf8'),
      ...(retainFileContent ? { content } : {}),
      ok: true,
    }
  } catch {
    return null
  }
}

/**
 * Normalize one Cursor hook payload into Lucid RecordableEvents.
 * Reads the on-disk file after edits so hashing matches the real post-edit state.
 */
export async function cursorHookToRecordableEvents(
  payload: CursorHookPayload,
  options: {
    workspaceRoot: string
    retainFileContent?: boolean
  },
): Promise<RecordableEvent[]> {
  const eventName = payload.hook_event_name ?? 'unknown'
  const retain = options.retainFileContent === true
  const events: RecordableEvent[] = []

  if (eventName === 'beforeSubmitPrompt' && typeof payload.prompt === 'string') {
    events.push({
      type: 'prompt',
      role: 'user',
      text: payload.prompt,
    })
    return events
  }

  if (eventName === 'afterFileEdit' && typeof payload.file_path === 'string') {
    const write = await fileWriteFromPath(options.workspaceRoot, payload.file_path, retain)
    if (write) events.push(write)
    return events
  }

  if (eventName === 'postToolUse' || eventName === 'preToolUse') {
    const name = toolNameFromPayload(payload) ?? 'unknown_tool'
    const input = toolInputFromPayload(payload)
    events.push({
      type: 'tool_call',
      toolName: name,
      arguments: input,
    })

    if (eventName === 'postToolUse') {
      events.push({
        type: 'tool_result',
        toolName: name,
        ok: true,
        output: toolOutputFromPayload(payload),
      })

      const toolPath = pathFromToolInput(input)
      const inlineContent = contentFromToolInput(input)
      if (toolPath) {
        if (inlineContent !== undefined) {
          const relative = toRelativePath(options.workspaceRoot, toolPath)
          if (!shouldIgnoreWorkspacePath(relative)) {
            events.push({
              type: 'file_write',
              path: relative,
              hash: sha256Hex(inlineContent),
              byteLength: Buffer.byteLength(inlineContent, 'utf8'),
              ...(retain ? { content: inlineContent } : {}),
              ok: true,
            })
          }
        } else {
          const write = await fileWriteFromPath(options.workspaceRoot, toolPath, retain)
          if (write) events.push(write)
        }
      }
    }
    return events
  }

  if (eventName === 'postToolUseFailure') {
    const name = toolNameFromPayload(payload) ?? 'unknown_tool'
    events.push({
      type: 'tool_call',
      toolName: name,
      arguments: toolInputFromPayload(payload),
    })
    events.push({
      type: 'tool_result',
      toolName: name,
      ok: false,
      output: toolOutputFromPayload(payload),
    })
    return events
  }

  if (eventName === 'beforeShellExecution' && typeof payload.command === 'string') {
    events.push({
      type: 'tool_call',
      toolName: 'Shell',
      arguments: { command: payload.command, cwd: payload.cwd },
    })
    return events
  }

  return events
}

export function resolveWorkspaceRoot(payload: CursorHookPayload, fallbackCwd: string): string {
  const roots = payload.workspace_roots
  if (Array.isArray(roots) && typeof roots[0] === 'string' && roots[0].length > 0) {
    return roots[0]
  }
  return fallbackCwd
}
