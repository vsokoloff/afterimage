import { shortDigest } from '../departments/looping/repeated-file-state/detect.ts'
import type { IncidentDetected } from '../observer.ts'
import type { RunIncidentPolicy } from './policy.ts'
import { incidentDetailUrl } from './urls.ts'

export type AlertWriter = {
  write(chunk: string): void
}

const defaultWriter: AlertWriter = process.stderr

function policyLine(policy: RunIncidentPolicy, terminating: boolean): string {
  if (policy === 'observe') {
    return '  policy:    observe — wrapped process continues running'
  }
  if (terminating) {
    return '  policy:    terminate-on-critical — sending SIGTERM to wrapped process'
  }
  return '  policy:    terminate-on-critical — process already stopping'
}

/**
 * Format a prominent terminal alert for a mid-run incident.
 */
export function formatIncidentAlert(
  detection: IncidentDetected,
  webBaseUrl: string,
  policy: RunIncidentPolicy,
  options: { terminating?: boolean } = {},
): string {
  const lines: string[] = ['']
  lines.push('══════════════════════════════════════════════════════════════')
  lines.push('🚨 Lucid detected a repeated file-state loop')
  lines.push('')

  if (detection.abnormality.kind === 'repeated-file-state') {
    const { signal } = detection.abnormality
    lines.push(`  incident:  ${detection.incident.id}`)
    lines.push(`  file:      ${signal.file}`)
    lines.push(
      `  first:     turn ${signal.firstSeenTurn}  (hash ${shortDigest(signal.hash)})`,
    )
    lines.push(
      `  repeated:  turn ${signal.repeatedAtTurn}  (hash ${shortDigest(signal.hash)})`,
    )
    lines.push(`  view:      ${incidentDetailUrl(webBaseUrl, detection.incident.id)}`)
    lines.push('')
    lines.push(policyLine(policy, options.terminating ?? false))
  } else {
    lines.push(`  incident:  ${detection.incident.id}`)
    lines.push(`  disease:   ${detection.disease}`)
    lines.push(`  evidence:  ${detection.evidence}`)
    lines.push(`  view:      ${incidentDetailUrl(webBaseUrl, detection.incident.id)}`)
    lines.push('')
    lines.push(policyLine(policy, options.terminating ?? false))
  }

  lines.push('══════════════════════════════════════════════════════════════')
  lines.push('')
  return lines.join('\n')
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
