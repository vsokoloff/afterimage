import type { LucidStore } from '../store.ts'
import {
  ensureUmaMemorySeed,
  forgetUmaPreference,
  loadUmaMemory,
  rememberUmaPreference,
} from './memory.ts'
import type { ParsedUmaArgv } from './parse-uma-argv.ts'
import type { UmaMemoryFile } from './types.ts'

export type RunUmaCommandResult = {
  exitCode: number
  memory: UmaMemoryFile
  message: string
}

export async function runUmaCommand(
  store: LucidStore,
  parsed: ParsedUmaArgv,
): Promise<RunUmaCommandResult> {
  if (parsed.action === 'help') {
    await ensureUmaMemorySeed(store)
    return {
      exitCode: 0,
      memory: await loadUmaMemory(store),
      message: [
        'Uma — UI design memory',
        '',
        '  npm run lucid -- uma remember --about <part> -- <preference>',
        '  npm run lucid -- uma show',
        '  npm run lucid -- uma show --about <part>',
        '  npm run lucid -- uma forget --about <part>',
        '  npm run lucid -- uma forget --id <entry-id>',
        '',
        'Tell Uma how each part of the UI should feel; she keeps it in memory.',
      ].join('\n'),
    }
  }

  if (parsed.action === 'show') {
    const memory = await loadUmaMemory(store)
    const entries = parsed.about
      ? memory.entries.filter(
          (e) => e.about.toLowerCase() === parsed.about!.toLowerCase(),
        )
      : memory.entries

    if (entries.length === 0) {
      return {
        exitCode: 0,
        memory,
        message: parsed.about
          ? `Uma has no memories about "${parsed.about}" yet.`
          : 'Uma\'s memory is empty. Tell her how you want a UI part to feel.',
      }
    }

    const lines = ['Uma remembers:', '']
    for (const entry of entries) {
      lines.push(`[${entry.about}] ${entry.text}`)
      lines.push(`  id: ${entry.id}`)
    }
    return { exitCode: 0, memory, message: lines.join('\n') }
  }

  if (parsed.action === 'remember') {
    const { memory, entry } = await rememberUmaPreference(store, {
      about: parsed.about,
      text: parsed.text,
    })
    return {
      exitCode: 0,
      memory,
      message: `Uma remembered (${entry.about}): ${entry.text}`,
    }
  }

  const { memory, removed } = await forgetUmaPreference(store, {
    about: parsed.about ?? undefined,
    id: parsed.id ?? undefined,
  })
  return {
    exitCode: removed > 0 ? 0 : 1,
    memory,
    message:
      removed > 0
        ? `Uma forgot ${removed} preference${removed === 1 ? '' : 's'}.`
        : 'Uma found nothing matching that to forget.',
  }
}
