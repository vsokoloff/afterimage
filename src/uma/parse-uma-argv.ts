/** Parse `lucid uma remember|show|forget …`. */
export type ParsedUmaArgv =
  | { action: 'help' }
  | { action: 'show'; about: string | null }
  | { action: 'remember'; about: string; text: string }
  | { action: 'forget'; about: string | null; id: string | null }

function takeFlagValue(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag)
  if (idx < 0) return null
  const value = args[idx + 1]
  if (!value || value.startsWith('-')) return null
  return value
}

function stripFlags(args: string[], flagsWithValue: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!
    if (flagsWithValue.includes(token)) {
      i++
      continue
    }
    if (token.startsWith('-')) continue
    out.push(token)
  }
  return out
}

export function parseUmaArgv(argv: string[]): ParsedUmaArgv | null {
  if (argv[2] !== 'uma') return null
  const sub = argv[3]
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
    return { action: 'help' }
  }

  const rest = argv.slice(4)

  if (sub === 'show') {
    const about = takeFlagValue(rest, '--about') ?? rest.find((t) => !t.startsWith('-')) ?? null
    return { action: 'show', about }
  }

  if (sub === 'forget') {
    const about = takeFlagValue(rest, '--about')
    const id = takeFlagValue(rest, '--id')
    if (!about && !id) return null
    return { action: 'forget', about, id }
  }

  if (sub === 'remember') {
    const about = takeFlagValue(rest, '--about')
    if (!about) return null

    const dd = rest.indexOf('--')
    let text: string
    if (dd >= 0) {
      text = rest.slice(dd + 1).join(' ').trim()
    } else {
      const positional = stripFlags(rest, ['--about'])
      text = positional.join(' ').trim()
    }
    if (!text) return null
    return { action: 'remember', about, text }
  }

  return null
}
