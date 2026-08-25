import { execFile } from 'node:child_process'
import { platform } from 'node:os'

import { authWriterCase } from './case.ts'
import { getPrimaryDisease } from './departments/index.ts'
import { printTrace } from './display.ts'
import { agentTraceFromAttempts, fileWritesFromAttempts } from './events.ts'
import { startServer } from './server.ts'

const disease = getPrimaryDisease()
const before = agentTraceFromAttempts('demo', authWriterCase.attempts, { idPrefix: 'demo' })
const abnormality = disease.detect(before)
printTrace(
  fileWritesFromAttempts('demo', authWriterCase.attempts, { idPrefix: 'demo' }),
  abnormality?.kind === 'repeated-file-state' ? abnormality.signal : null,
)

function openBrowser(url: string): void {
  const command = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform() === 'win32' ? ['/c', 'start', '', url] : [url]
  execFile(command, args, (error) => {
    if (error) console.error(`Open ${url} in a browser.`)
  })
}

function isBusy(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE'
}

try {
  const { url } = await startServer()
  console.log()
  console.log(`Afterimage: ${url}`)
  console.log('Demo path: Incidents → Auth Agent → Run diagnostics → lucid fix → recheck')
  console.log('Press Ctrl+C to stop.')
  openBrowser(url)
} catch (error) {
  if (!isBusy(error)) throw error
  const url = `http://127.0.0.1:${process.env.PORT ?? '3000'}`
  console.log()
  console.log(`Already running: ${url}`)
  openBrowser(url)
}
