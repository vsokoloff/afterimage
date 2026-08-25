import type { AfterimageStore } from '../store.ts'
import { withObservedAgentWork } from '../agents/observe-work.ts'
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
  store: AfterimageStore,
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
        '  npm run afterimage -- uma remember --about <part> -- <preference>',
        '  npm run afterimage -- uma show',
        '  npm run afterimage -- uma show --about <part>',
        '  npm run afterimage -- uma forget --about <part>',
        '  npm run afterimage -- uma forget --id <entry-id>',
        '',
        'Tell Uma how each part of the UI should feel; she keeps it in memory.',
      ].join('\n'),
    }
  }

  const job =
    parsed.action === 'show'
      ? parsed.about
        ? `uma show --about ${parsed.about}`
        : 'uma show'
      : parsed.action === 'remember'
        ? `uma remember --about ${parsed.about}`
        : parsed.id
          ? `uma forget --id ${parsed.id}`
          : `uma forget --about ${parsed.about}`

  const { result } = await withObservedAgentWork({
    store,
    agentId: 'uma',
    job,
    finishStatus: (outcome: RunUmaCommandResult) =>
      outcome.exitCode === 0 ? 'completed' : 'failed',
    work: async ({ record }) => {
      if (parsed.action === 'show') {
        const memory = await loadUmaMemory(store)
        const entries = parsed.about
          ? memory.entries.filter(
              (e) => e.about.toLowerCase() === parsed.about!.toLowerCase(),
            )
          : memory.entries

        if (entries.length === 0) {
          const message = parsed.about
            ? `Uma has no memories about "${parsed.about}" yet.`
            : "Uma's memory is empty. Tell her how you want a UI part to feel."
          await record({
            type: 'model_response',
            text: message,
            reasonSummary: 'Empty memory',
          })
          return { exitCode: 0, memory, message }
        }

        const lines = ['Uma remembers:', '']
        for (const entry of entries) {
          lines.push(`[${entry.about}] ${entry.text}`)
          lines.push(`  id: ${entry.id}`)
        }
        const message = lines.join('\n')
        await record({
          type: 'model_response',
          text: message,
          reasonSummary: `${entries.length} memories`,
        })
        return { exitCode: 0, memory, message }
      }

      if (parsed.action === 'remember') {
        await record({
          type: 'tool_call',
          toolName: 'uma.remember',
          arguments: { about: parsed.about, text: parsed.text },
        })
        const { memory, entry } = await rememberUmaPreference(store, {
          about: parsed.about,
          text: parsed.text,
        })
        const message = `Uma remembered (${entry.about}): ${entry.text}`
        await record({
          type: 'tool_result',
          toolName: 'uma.remember',
          ok: true,
          output: entry.id,
        })
        await record({
          type: 'model_response',
          text: message,
          reasonSummary: entry.about,
        })
        return { exitCode: 0, memory, message }
      }

      await record({
        type: 'tool_call',
        toolName: 'uma.forget',
        arguments: { about: parsed.about, id: parsed.id },
      })
      const { memory, removed } = await forgetUmaPreference(store, {
        about: parsed.about ?? undefined,
        id: parsed.id ?? undefined,
      })
      const message =
        removed > 0
          ? `Uma forgot ${removed} preference${removed === 1 ? '' : 's'}.`
          : 'Uma found nothing matching that to forget.'
      await record({
        type: 'tool_result',
        toolName: 'uma.forget',
        ok: removed > 0,
        output: { removed },
      })
      await record({
        type: 'model_response',
        text: message,
        reasonSummary: removed > 0 ? 'Forgot' : 'Nothing to forget',
      })
      return {
        exitCode: removed > 0 ? 0 : 1,
        memory,
        message,
      }
    },
  })

  return result
}
