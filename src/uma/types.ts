/** Structured UI preference remembered by Uma. */
export type UmaMemoryEntry = {
  id: string
  /** UI area this preference applies to, e.g. hero, cards, color, typography. */
  about: string
  text: string
  rememberedAt: string
}

export type UmaMemoryFile = {
  agentId: 'uma'
  name: 'Uma'
  role: string
  updatedAt: string
  entries: UmaMemoryEntry[]
}

export function emptyUmaMemory(now = new Date()): UmaMemoryFile {
  return {
    agentId: 'uma',
    name: 'Uma',
    role: 'UI design — remembers how you want each part of the interface to feel',
    updatedAt: now.toISOString(),
    entries: [],
  }
}

export function slugAbout(about: string): string {
  return about
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'general'
}

export function makeEntryId(about: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return `uma_${slugAbout(about)}_${stamp}`
}

/** Render Cursor-facing markdown from Uma's memory entries. */
export function renderUmaMemoryMarkdown(memory: UmaMemoryFile): string {
  const lines = [
    '---',
    'description: Uma\'s UI design memory — follow these preferences for interface work.',
    'alwaysApply: true',
    '---',
    '',
    '# Uma — UI design memory',
    '',
    'Uma owns UI design in this repo. Prefer these remembered preferences when changing the interface.',
    '',
  ]

  if (memory.entries.length === 0) {
    lines.push('_No preferences yet. When the user tells Uma how a part of the UI should be, add it with `npm run lucid -- uma remember --about <part> -- <preference>`._')
    lines.push('')
    return `${lines.join('\n')}\n`
  }

  const byAbout = new Map<string, UmaMemoryEntry[]>()
  for (const entry of memory.entries) {
    const key = entry.about
    const list = byAbout.get(key) ?? []
    list.push(entry)
    byAbout.set(key, list)
  }

  const aboutKeys = [...byAbout.keys()].sort((a, b) => a.localeCompare(b))
  for (const about of aboutKeys) {
    lines.push(`## ${about}`)
    lines.push('')
    for (const entry of byAbout.get(about) ?? []) {
      lines.push(`- ${entry.text}`)
    }
    lines.push('')
  }

  lines.push(`_Updated ${memory.updatedAt}_`)
  lines.push('')
  return `${lines.join('\n')}\n`
}
