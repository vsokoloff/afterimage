import { shortDigest } from '../departments/looping/repeated-file-state/detect.ts'
import type { IncidentDetected } from '../observer.ts'
import { incidentDetailUrl } from './urls.ts'

export type PetMood = 'cheerful' | 'worried'

/** Tiny clinic kitty — cheerful. */
export const KITTY_CHEERFUL = [
  '  /\\_/\\',
  ' ( ^.^ )  Kitty',
  '  > ^ <   all clear for now',
].join('\n')

/** Tiny clinic kitty — worried (incident). */
export const KITTY_WORRIED = [
  '  /\\_/\\',
  ' ( o.o )  Kitty noticed something',
  '  > ^ <',
].join('\n')

export function kittyFace(mood: PetMood): string {
  return mood === 'worried' ? KITTY_WORRIED : KITTY_CHEERFUL
}

function diseaseBlurb(detection: IncidentDetected): string {
  switch (detection.abnormality.kind) {
    case 'repeated-file-state':
      return `${detection.abnormality.signal.file} looped back to an old state`
    case 'scope-explosion':
      return `edits exploded across ${detection.abnormality.signal.fileCount} files`
    case 'prior-fix-regressed':
      return `${detection.abnormality.signal.testName} was green, then broke again`
    case 'instruction-amnesia':
      return `forgot “${detection.abnormality.signal.constraintText}”`
    case 'redundant-rewrite':
      return `${detection.abnormality.signal.duplicatePath} duplicates ${detection.abnormality.signal.firstPath}`
    default:
      return detection.disease
  }
}

function detailLines(detection: IncidentDetected, webBaseUrl: string): string[] {
  const lines: string[] = []
  lines.push(`  meow:     ${diseaseBlurb(detection)}`)
  lines.push(`  disease:  ${detection.disease}`)
  lines.push(`  incident: ${detection.incident.id}`)

  if (detection.abnormality.kind === 'repeated-file-state') {
    const { signal } = detection.abnormality
    lines.push(
      `  turns:    ${signal.firstSeenTurn} → ${signal.repeatedAtTurn}  (hash ${shortDigest(signal.hash)})`,
    )
  } else {
    lines.push(`  evidence: ${detection.evidence}`)
  }

  lines.push(`  view:     ${incidentDetailUrl(webBaseUrl, detection.incident.id)}`)
  return lines
}

/**
 * Fun pet-style incident alert for terminals, Cursor hooks, and notifications.
 */
export function formatPetIncidentAlert(
  detection: IncidentDetected,
  webBaseUrl: string,
): string {
  return [
    '',
    '══════════════════════════════════════════════════════════════',
    kittyFace('worried'),
    '',
    ...detailLines(detection, webBaseUrl),
    '══════════════════════════════════════════════════════════════',
    '',
  ].join('\n')
}

/** Short one-liner for OS notifications / chat chips. */
export function formatPetIncidentToast(detection: IncidentDetected): string {
  return `Afterimage: ${diseaseBlurb(detection)}`
}

/** Intro pet line when Afterimage starts watching a Cursor session. */
export function formatPetWatchingIntro(): string {
  return [
    kittyFace('cheerful'),
    '',
    '  Afterimage is watching this Cursor session in the background.',
    '  Keep prompting normally — Kitty will meow if something looks sick.',
  ].join('\n')
}
