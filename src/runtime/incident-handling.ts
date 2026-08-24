import type { IncidentDetected } from '../observer.ts'
import { printIncidentAlert } from './incident-alert.ts'
import type { AlertWriter } from './incident-alert.ts'
import type { RunIncidentPolicy } from './policy.ts'

/** Shared mid-run incident handling for process and agent-runtime adapters. */
export function handleIncidentDetection(
  detection: IncidentDetected,
  options: {
    policy: RunIncidentPolicy
    webBaseUrl: string
    alertWriter?: AlertWriter
    onIncidentDetected?: (detection: IncidentDetected) => void
  },
): void {
  options.onIncidentDetected?.(detection)
  printIncidentAlert(detection, options.webBaseUrl, options.policy, options.alertWriter, {
    terminating: false,
  })
}
