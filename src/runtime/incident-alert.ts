import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

import type { IncidentDetected } from '../observer.ts'
import type { LucidStore } from '../store.ts'
import {
  formatPetIncidentAlert,
  formatPetIncidentToast,
} from './pet-alert.ts'
import type { RunIncidentPolicy } from './policy.ts'
import { shortDigest } from '../departments/looping/repeated-file-state/detect.ts'
import { incidentDetailUrl } from './urls.ts'

export type AlertWriter = {
  write(chunk: string): void
}

const defaultWriter: AlertWriter = process.stderr

function policyLine(policy: RunIncidentPolicy, terminating: boolean): string {
  if (policy === 'observe') {
    return '  policy:   observe — keep going; Kitty is just watching'
  }
  if (terminating) {
    return '  policy:   terminate-on-critical — stopping the wrapped process'
  }
  return '  policy:   terminate-on-critical — process already stopping'
}

/**
 * Format a prominent mid-run incident alert (pet-style by default).
 */
export function formatIncidentAlert(
  detection: IncidentDetected,
  webBaseUrl: string,
  policy: RunIncidentPolicy,
  options: { terminating?: boolean } = {},
): string {
  const pet = formatPetIncidentAlert(detection, webBaseUrl)
  return `${pet}${policyLine(policy, options.terminating ?? false)}\n\n`
}

export function printIncidentAlert(
  detection: IncidentDetected,
  webBaseUrl: string,
  policy: RunIncidentPolicy,
  writer: AlertWriter = defaultWriter,
  options: { terminating?: boolean } = {},
): void {
  writer.write(formatIncidentAlert(detection, webBaseUrl, policy, options))
}

/** Persist the latest pet alert under `.lucid/alerts/` for UIs / hooks. */
export async function persistPetAlert(
  store: Pick<LucidStore, 'root'>,
  detection: IncidentDetected,
  webBaseUrl: string,
): Promise<{ alertPath: string; toast: string }> {
  const dir = path.join(store.root, 'alerts')
  await mkdir(dir, { recursive: true })
  const toast = formatPetIncidentToast(detection)
  const body = formatPetIncidentAlert(detection, webBaseUrl)
  const alertPath = path.join(dir, 'latest.txt')
  await writeFile(alertPath, `${body}\ntoast: ${toast}\n`, 'utf8')
  await writeFile(
    path.join(dir, 'latest.json'),
    `${JSON.stringify(
      {
        incidentId: detection.incident.id,
        disease: detection.disease,
        department: detection.department,
        toast,
        evidence: detection.evidence,
        view: incidentDetailUrl(webBaseUrl, detection.incident.id),
        hashPreview:
          detection.abnormality.kind === 'repeated-file-state'
            ? shortDigest(detection.abnormality.signal.hash)
            : undefined,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  return { alertPath, toast }
}

/** Best-effort macOS notification; never throws. */
export function notifyPetDesktop(toast: string): void {
  if (process.platform !== 'darwin') return
  try {
    const child = spawn(
      'osascript',
      ['-e', `display notification ${JSON.stringify(toast)} with title "Lucid Kitty"`],
      { stdio: 'ignore', detached: true },
    )
    child.unref()
  } catch {
    // ignore — notifications are optional
  }
}
