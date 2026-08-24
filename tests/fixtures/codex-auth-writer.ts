import type { CodexSDKMessage } from '../../src/runtime/codex/types.ts'

const AGENT = 'agent_codex_test'
const RUN = 'run_codex_loop'

/** Synthetic Codex SDK stream: Write auth.py A → B → A (loop). */
export function authWriterLoopMessages(): CodexSDKMessage[] {
  const write = (
    callId: string,
    contents: string,
    status: 'running' | 'completed',
  ): CodexSDKMessage[] => {
    const args = { path: 'auth.py', contents }
    if (status === 'running') {
      return [
        {
          type: 'tool_call',
          agent_id: AGENT,
          run_id: RUN,
          call_id: callId,
          name: 'Write',
          status: 'running',
          args,
        },
      ]
    }
    return [
      {
        type: 'tool_call',
        agent_id: AGENT,
        run_id: RUN,
        call_id: callId,
        name: 'Write',
        status: 'completed',
        args,
        result: { ok: true },
      },
    ]
  }

  return [
    {
      type: 'system',
      subtype: 'init',
      agent_id: AGENT,
      run_id: RUN,
      model: { id: 'composer-2.5' },
      tools: ['Write', 'Shell', 'Read'],
    },
    {
      type: 'user',
      agent_id: AGENT,
      run_id: RUN,
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Update auth.py and keep compatibility.' }],
      },
    },
    {
      type: 'assistant',
      agent_id: AGENT,
      run_id: RUN,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Updating auth.py…' }],
      },
    },
    ...write('call-a1', 'state-A', 'running'),
    ...write('call-a1', 'state-A', 'completed'),
    ...write('call-b', 'state-B', 'running'),
    ...write('call-b', 'state-B', 'completed'),
    ...write('call-a2', 'state-A', 'running'),
    ...write('call-a2', 'state-A', 'completed'),
  ]
}

/** Healthy recheck stream: A → B → C (no loop). */
export function authWriterHealthyMessages(): CodexSDKMessage[] {
  const base = authWriterLoopMessages().slice(0, -2)
  const writeC: CodexSDKMessage[] = [
    {
      type: 'tool_call',
      agent_id: AGENT,
      run_id: RUN,
      call_id: 'call-c',
      name: 'Write',
      status: 'running',
      args: { path: 'auth.py', contents: 'state-C' },
    },
    {
      type: 'tool_call',
      agent_id: AGENT,
      run_id: RUN,
      call_id: 'call-c',
      name: 'Write',
      status: 'completed',
      args: { path: 'auth.py', contents: 'state-C' },
      result: { ok: true },
    },
  ]
  return [...base, ...writeC]
}

export function shellTestMessages(): CodexSDKMessage[] {
  return [
    {
      type: 'tool_call',
      agent_id: AGENT,
      run_id: RUN,
      call_id: 'shell-1',
      name: 'Shell',
      status: 'running',
      args: { command: 'npm test' },
    },
    {
      type: 'tool_call',
      agent_id: AGENT,
      run_id: RUN,
      call_id: 'shell-1',
      name: 'Shell',
      status: 'completed',
      args: { command: 'npm test' },
      result: { exitCode: 1, stderr: '1 failing test' },
    },
  ]
}
