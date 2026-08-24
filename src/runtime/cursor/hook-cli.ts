/**
 * Cursor hook CLI entry — reads one JSON payload from stdin, writes JSON to stdout.
 */
import { pathToFileURL } from 'node:url'

import { handleCursorHook } from './observe.ts'
import type { CursorHookPayload } from './types.ts'

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function runCursorHookCli(): Promise<void> {
  try {
    const raw = await readStdin()
    if (!raw.trim()) {
      process.stdout.write('{}\n')
      return
    }

    let payload: CursorHookPayload
    try {
      payload = JSON.parse(raw) as CursorHookPayload
    } catch (error) {
      process.stderr.write(
        `Lucid Cursor hook: invalid JSON stdin: ${error instanceof Error ? error.message : String(error)}\n`,
      )
      process.stdout.write('{}\n')
      return
    }

    const result = await handleCursorHook({
      payload,
      cwd: process.cwd(),
    })

    if (result.response) {
      process.stdout.write(`${JSON.stringify(result.response)}\n`)
    } else {
      process.stdout.write('{}\n')
    }
  } catch (error) {
    process.stderr.write(
      `Lucid Cursor hook failed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    // Fail open — never block the agent on Lucid errors.
    process.stdout.write('{}\n')
    process.exitCode = 0
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  void runCursorHookCli()
}
