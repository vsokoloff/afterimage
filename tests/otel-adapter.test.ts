import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { getPrimaryDisease } from '../src/departments/index.ts'
import { sha256Hex } from '../src/events.ts'
import { createObserver } from '../src/observer.ts'
import {
  coalesceInputTokens,
  coalesceOutputTokens,
  coalesceProvider,
  decodeOtlpJsonTraceRequest,
  otelSpansToRecordableEvents,
  otlpRequestToRecordableEvents,
  parseOtelArgv,
  startOtlpHttpServer,
} from '../src/runtime/otel/index.ts'
import type { LucidOtelSpan } from '../src/runtime/otel/types.ts'
import { getRun, listRuns, openStore } from '../src/store.ts'

const T0 = '1700000000000000000'
const T1 = '1700000001000000000'
const T2 = '1700000002000000000'
const T3 = '1700000003000000000'

function span(partial: Partial<LucidOtelSpan> & Pick<LucidOtelSpan, 'spanId' | 'name'>): LucidOtelSpan {
  return {
    traceId: 'trace-auth-loop',
    startTimeUnixNano: T0,
    endTimeUnixNano: T1,
    attributes: {},
    ...partial,
  }
}

function agentChatToolTree(): LucidOtelSpan[] {
  return [
    span({
      spanId: 'root',
      name: 'invoke_agent ResearchAgent',
      startTimeUnixNano: T0,
      endTimeUnixNano: T3,
      attributes: {
        'gen_ai.operation.name': 'invoke_agent',
        'gen_ai.agent.name': 'ResearchAgent',
        'gen_ai.agent.id': 'agent-research',
        'gen_ai.conversation.id': 'conv-1',
        'gen_ai.input.messages': JSON.stringify([
          { role: 'user', content: 'Fix auth.py without looping' },
        ]),
      },
    }),
    span({
      spanId: 'chat1',
      parentSpanId: 'root',
      name: 'chat gpt-4o',
      startTimeUnixNano: T1,
      endTimeUnixNano: T1,
      attributes: {
        'gen_ai.operation.name': 'chat',
        'gen_ai.provider.name': 'openai',
        'gen_ai.request.model': 'gpt-4o',
        'gen_ai.response.model': 'gpt-4o-2024-08-06',
        'gen_ai.response.id': 'chatcmpl-1',
        'gen_ai.response.finish_reasons': ['tool_calls'],
        'gen_ai.usage.input_tokens': 100,
        'gen_ai.usage.output_tokens': 20,
        'gen_ai.output.messages': JSON.stringify([
          { role: 'assistant', content: 'I will write auth.py' },
        ]),
      },
    }),
    span({
      spanId: 'tool1',
      parentSpanId: 'root',
      name: 'execute_tool Write',
      startTimeUnixNano: T2,
      endTimeUnixNano: T2,
      attributes: {
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.tool.name': 'Write',
        'gen_ai.tool.call.id': 'call_1',
        'gen_ai.tool.call.arguments': JSON.stringify({
          path: 'auth.py',
          contents: 'state-A',
        }),
        'gen_ai.tool.call.result': JSON.stringify({ ok: true }),
      },
    }),
  ]
}

test('coalesce prefers current GenAI attribute names over legacy', () => {
  assert.equal(
    coalesceProvider({
      'gen_ai.provider.name': 'openai',
      'gen_ai.system': 'anthropic',
    }),
    'openai',
  )
  assert.equal(coalesceProvider({ 'gen_ai.system': 'anthropic' }), 'anthropic')
  assert.equal(
    coalesceInputTokens({
      'gen_ai.usage.input_tokens': 10,
      'gen_ai.usage.prompt_tokens': 99,
    }),
    10,
  )
  assert.equal(coalesceInputTokens({ 'gen_ai.usage.prompt_tokens': 99 }), 99)
  assert.equal(
    coalesceOutputTokens({ 'gen_ai.usage.completion_tokens': 7 }),
    7,
  )
})

test('otel normalize maps invoke_agent, chat, and execute_tool Write to AgentEvents', () => {
  const result = otelSpansToRecordableEvents(agentChatToolTree())
  assert.equal(result.agentId, 'agent-research')
  assert.equal(result.conversationId, 'conv-1')
  assert.equal(result.traceId, 'trace-auth-loop')
  assert.equal(result.rootAgentSpanEnded, true)

  const types = result.events.map((event) => event.type)
  assert.deepEqual(types, [
    'prompt',
    'model_response',
    'tool_call',
    'tool_result',
    'file_write',
  ])

  const model = result.events.find((event) => event.type === 'model_response')
  assert.ok(model && model.type === 'model_response')
  assert.equal(model.provider, 'openai')
  assert.equal(model.model, 'gpt-4o-2024-08-06')
  assert.equal(model.inputTokens, 100)
  assert.equal(model.outputTokens, 20)
  assert.equal(model.responseId, 'chatcmpl-1')
  assert.deepEqual(model.finishReasons, ['tool_calls'])
  assert.equal(model.text, 'I will write auth.py')

  const write = result.events.find((event) => event.type === 'file_write')
  assert.ok(write && write.type === 'file_write')
  assert.equal(write.path, 'auth.py')
  assert.equal(write.content, 'state-A')
  assert.equal(write.hash, sha256Hex('state-A'))
})

test('otel normalize ignores embeddings and maps ERROR spans', () => {
  const result = otelSpansToRecordableEvents([
    span({
      spanId: 'emb',
      name: 'embeddings text-embedding-3',
      attributes: {
        'gen_ai.operation.name': 'embeddings',
        'gen_ai.request.model': 'text-embedding-3-small',
      },
    }),
    span({
      spanId: 'bad',
      name: 'chat gpt-4o',
      status: { code: 'ERROR', message: 'rate limited' },
      attributes: {
        'gen_ai.operation.name': 'chat',
        'gen_ai.system': 'openai',
        'gen_ai.usage.prompt_tokens': 5,
        'gen_ai.usage.completion_tokens': 0,
        'error.type': 'RateLimitError',
      },
    }),
  ])

  assert.equal(result.events.filter((e) => e.type === 'model_response').length, 1)
  assert.equal(result.events.filter((e) => e.type === 'error').length, 1)
  assert.equal(result.hadError, true)
  const model = result.events.find((e) => e.type === 'model_response')
  assert.ok(model && model.type === 'model_response')
  assert.equal(model.provider, 'openai')
  assert.equal(model.inputTokens, 5)
})

test('decodeOtlpJsonTraceRequest unwraps OTLP KeyValue attributes', () => {
  const decoded = decodeOtlpJsonTraceRequest({
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'agent-app' } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId: 'abc',
                spanId: 's1',
                name: 'chat gpt-4o',
                startTimeUnixNano: T0,
                endTimeUnixNano: T1,
                attributes: [
                  {
                    key: 'gen_ai.operation.name',
                    value: { stringValue: 'chat' },
                  },
                  {
                    key: 'gen_ai.usage.input_tokens',
                    value: { intValue: '42' },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })

  const result = otlpRequestToRecordableEvents(decoded)
  assert.equal(result.events[0]?.type, 'model_response')
  const model = result.events[0]
  assert.ok(model && model.type === 'model_response')
  assert.equal(model.inputTokens, 42)
})

test('parseOtelArgv reads host port group-by idle-ms', () => {
  const parsed = parseOtelArgv([
    'node',
    'cli.js',
    'otel',
    '--host',
    '127.0.0.1',
    '--port',
    '14318',
    '--group-by',
    'conversation',
    '--idle-ms',
    '1000',
  ])
  assert.deepEqual(parsed, {
    host: '127.0.0.1',
    port: 14318,
    groupBy: 'conversation',
    idleFinishMs: 1000,
  })
  assert.equal(parseOtelArgv(['node', 'cli.js', 'otel', '--group-by', 'nope']), null)
})

test('OTLP/HTTP ingest records events and can open a loop incident', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lucid-otel-'))
  try {
    const store = await openStore({ storeRoot: dir, retainFileContent: true })
    const server = await startOtlpHttpServer({
      store,
      host: '127.0.0.1',
      port: 0,
      idleFinishMs: 50,
    })

    const write = (content: string, spanId: string, start: string) =>
      span({
        spanId,
        parentSpanId: 'root',
        name: `execute_tool Write`,
        startTimeUnixNano: start,
        endTimeUnixNano: start,
        attributes: {
          'gen_ai.operation.name': 'execute_tool',
          'gen_ai.tool.name': 'Write',
          'gen_ai.tool.call.id': spanId,
          'gen_ai.tool.call.arguments': JSON.stringify({
            path: 'auth.py',
            contents: content,
          }),
        },
      })

    const body = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                span({
                  spanId: 'root',
                  name: 'invoke_agent Auth',
                  startTimeUnixNano: T0,
                  endTimeUnixNano: '1700000004000000000',
                  attributes: {
                    'gen_ai.operation.name': 'invoke_agent',
                    'gen_ai.agent.id': 'auth-agent',
                  },
                }),
                write('state-A', 'w1', T1),
                write('state-B', 'w2', T2),
                write('state-A', 'w3', T3),
              ],
            },
          ],
        },
      ],
    }

    const response = await fetch(`${server.url}/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    assert.equal(response.status, 200)

    const runs = await listRuns(store)
    assert.equal(runs.length, 1)
    const run = await getRun(store, runs[0]!.id)
    assert.ok(run)
    assert.equal(run.status, 'completed')
    assert.equal(run.agentId, 'auth-agent')

    const writes = run.events.filter((event) => event.type === 'file_write')
    assert.equal(writes.length, 3)

    const disease = getPrimaryDisease()
    const abnormality = disease.detect({ run })
    assert.ok(abnormality)
    assert.equal(abnormality.kind, 'repeated-file-state')

    await server.close()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('observer records OTEL-normalized events without importing otel in detectors', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lucid-otel-obs-'))
  try {
    const store = await openStore({ storeRoot: dir, retainFileContent: true })
    const observer = createObserver({ store })
    const normalized = otelSpansToRecordableEvents(agentChatToolTree())
    await observer.startRun({ agentId: normalized.agentId })
    for (const event of normalized.events) {
      await observer.record(event)
    }
    const run = await observer.finishRun('completed')
    assert.ok(run.events.some((event) => event.type === 'file_write'))
    assert.ok(run.events.some((event) => event.type === 'model_response'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
