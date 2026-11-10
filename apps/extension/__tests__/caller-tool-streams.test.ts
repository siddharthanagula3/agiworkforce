import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  CALLER_TOOL_RESUME_PATH,
  createCallerToolHandoffDelta,
  DEFAULT_CALLER_TOOL_MAX_STEPS,
  MAX_CALLER_TOOL_STEPS,
  type CallerToolResumeRequest,
} from '@agiworkforce/cloud-contracts';
import type { AgentEvent, AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { callCloud, DEFAULT_GATEWAY_BASE } from '../src/features/computer-use/cloudAgentClient';
import { getBrowserToolDefinitions } from '../src/features/computer-use/browserToolDefinitions';
import {
  FREE_TRIAL_MODEL,
  streamFreeChat,
  streamManagedCallerReceipt,
  streamManagedChatApproval,
  streamManagedChatToolInput,
  type FreeTrialChunk,
} from '../src/features/cloud-bridge/freeTrialClient';

const runId = '11111111-1111-4111-8111-111111111111';
const runPath = `/api/llm/v1/chat/completions/runs/${runId}`;
const calls = [
  { id: 'local-1', type: 'function' as const, function: { name: 'read_dom', arguments: '{}' } },
];
const tools = getBrowserToolDefinitions(false);
function envelope(sequence: number, event: AgentEvent): AgentEventEnvelope {
  return {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    sessionId: 'session',
    turnId: 'turn',
    sequence,
    emittedAtMs: sequence,
    event,
  };
}
function events() {
  return [
    envelope(5, {
      type: 'caller-tools-requested',
      calls: structuredClone(calls),
      nextEventSequence: 8,
    }),
    envelope(6, {
      type: 'task-state-changed',
      taskId: 'turn',
      state: 'awaiting_input',
      summary: 'Browser work',
    }),
    envelope(7, { type: 'lifecycle', phase: 'paused' }),
  ];
}
function response(items: AgentEventEnvelope[], done = true, withRun = true, finalText?: string) {
  const body =
    items
      .map(
        (item) =>
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { x_agent_event: item } }] })}\n\n`,
      )
      .join('') +
    (finalText
      ? `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: finalText }, finish_reason: 'stop' }] })}\n\n`
      : '') +
    (done ? 'data: [DONE]\n\n' : '');
  const bytes = new TextEncoder().encode(body);
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < bytes.length; index += 7)
          controller.enqueue(bytes.slice(index, index + 7));
        controller.close();
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        ...(withRun
          ? {
              'X-AGI-Agent-Run-Id': runId,
              'X-AGI-Agent-Run-URL': runPath,
              'X-AGI-Tool-Loop': 'durable',
            }
          : {}),
      },
    },
  );
}
async function collect(stream: AsyncGenerator<FreeTrialChunk>) {
  const chunks: FreeTrialChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}
function receipt(): CallerToolResumeRequest {
  return {
    schema_version: AGENT_EVENT_SCHEMA_VERSION,
    run_id: runId,
    turn_id: 'turn',
    next_event_sequence: 8,
    tool_results: [{ tool_call_id: 'local-1', content: 'Result text' }],
    observations: [
      { text: 'User guidance', images: [{ base64: 'fixture', mime_type: 'image/png' }] },
    ],
  };
}
function snapshot(items: AgentEventEnvelope[], state: 'awaiting_input' | 'completed') {
  const lastSequence = items.at(-1)!.sequence;
  return new Response(
    JSON.stringify({
      run: {
        id: runId,
        userId: 'fixture-user',
        requestId: 'fixture-request',
        conversationId: 'session',
        originSurface: 'chrome',
        workMode: 'chat',
        state,
        provider: 'openai',
        model: FREE_TRIAL_MODEL,
        lastEventSequence: lastSequence,
        cancellationRequestedAt: null,
        completedAt: state === 'completed' ? '2026-11-09T12:00:00.000Z' : null,
        createdAt: '2026-11-09T11:00:00.000Z',
        updatedAt: '2026-11-09T12:00:00.000Z',
      },
      events: items,
      nextAfterSequence: lastSequence,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('canonical caller handoff through the mounted Chrome streams', () => {
  it.each(['negotiated', 'receipt'] as const)(
    'refuses legacy handoff after %s protocol selection',
    async (kind) => {
      const fetchImpl = vi.fn<typeof fetch>(
        async () =>
          new Response(
            `data: ${JSON.stringify({ choices: [{ index: 0, finish_reason: 'tool_calls', delta: createCallerToolHandoffDelta(calls) }] })}\n\ndata: [DONE]\n\n`,
            { headers: response([]).headers },
          ),
      );
      const chunks = await collect(
        streamFreeChat([{ role: 'user', content: 'Inspect' }], 'fixture-token', {
          tools,
          fetchImpl,
          ...(kind === 'receipt' ? { callerResume: receipt() } : { callerToolContinuation: true }),
        }),
      );
      expect(chunks.some((chunk) => chunk.type === 'tool-handoff')).toBe(false);
      expect(chunks.at(-1)).toMatchObject({ type: 'error', code: 'protocol_error' });
    },
  );
  it('returns only the authoritative local batch and its resume cursor in the browser-task client', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(events())),
    );
    const result = await callCloud([], 'fixture-token', DEFAULT_GATEWAY_BASE);
    expect(result.message.tool_calls).toEqual(calls);
    expect(result.continuation).toEqual({
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: runId,
      turn_id: 'turn',
      next_event_sequence: 8,
      calls,
    });
  });

  it('publishes the same checkpoint from the chat stream after the full boundary', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response(events()));
    const chunks = await collect(
      streamFreeChat([{ role: 'user', content: 'Inspect this tab' }], 'fixture-token', {
        tools,
        fetchImpl,
      }),
    );
    const handoffs = chunks.filter((chunk) => chunk.type === 'tool-handoff');
    expect(handoffs).toEqual([
      {
        type: 'tool-handoff',
        calls,
        continuation: {
          schema_version: AGENT_EVENT_SCHEMA_VERSION,
          run_id: runId,
          turn_id: 'turn',
          next_event_sequence: 8,
          calls,
        },
      },
    ]);
    expect(chunks.at(-1)?.type).toBe('done');
  });

  it.each([
    { label: 'partial boundary', items: events().slice(0, 2), withRun: true },
    { label: 'missing run', items: events(), withRun: false },
    {
      label: 'malformed caller arguments',
      items: [
        envelope(5, {
          type: 'caller-tools-requested',
          nextEventSequence: 8,
          calls: [{ ...calls[0]!, function: { name: 'read_dom', arguments: 'null' } }],
        }),
        ...events().slice(1),
      ],
      withRun: true,
    },
    {
      label: 'hosted function',
      items: [
        envelope(5, {
          type: 'caller-tools-requested',
          nextEventSequence: 8,
          calls: [{ ...calls[0]!, function: { name: 'web_search', arguments: '{}' } }],
        }),
        ...events().slice(1),
      ],
      withRun: true,
    },
  ])(
    'refuses $label in both consumers before returning an executable batch',
    async ({ items, withRun }) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response(items, true, withRun)),
      );
      await expect(callCloud([], 'fixture-token', DEFAULT_GATEWAY_BASE)).rejects.toMatchObject({
        code: 'protocol_error',
      });
      const chunks = await collect(
        streamFreeChat([{ role: 'user', content: 'Inspect' }], 'fixture-token', {
          tools,
          fetchImpl: vi.fn(async () => response(items, true, withRun)),
        }),
      );
      expect(chunks.some((chunk) => chunk.type === 'tool-handoff')).toBe(false);
      expect(chunks.at(-1)).toMatchObject({ type: 'error', code: 'protocol_error' });
    },
  );

  it('posts the exact result receipt to the scoped endpoint without replacing private context', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response([], true, true, 'Finished.'));
    const chunks = await collect(
      streamFreeChat([], 'fixture-token', {
        tools,
        callerResume: receipt(),
        fetchImpl,
        idempotencyKey: 'caller-receipt-fixture',
      }),
    );
    expect(chunks.at(-1)?.type).toBe('done');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url).endsWith(CALLER_TOOL_RESUME_PATH)).toBe(true);
    expect(JSON.parse(String(init?.body))).toEqual(receipt());
    expect(init?.headers).toMatchObject({ 'Idempotency-Key': 'caller-receipt-fixture' });
  });

  it('negotiates the version only when the client explicitly enables the owned continuation', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response([], true, true, 'Finished.'));
    const chunks = await collect(
      streamFreeChat([{ role: 'user', content: 'Inspect' }], 'fixture-token', {
        tools,
        callerToolContinuation: true,
        fetchImpl,
      }),
    );
    expect(chunks.at(-1)?.type).toBe('done');
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(JSON.parse(String(init?.body)).caller_tool_handoff_version).toBe(
      AGENT_EVENT_SCHEMA_VERSION,
    );
    expect(JSON.parse(String(init?.body)).caller_tool_max_steps).toBe(
      DEFAULT_CALLER_TOOL_MAX_STEPS,
    );
  });

  it('rejects an unsupported caller budget before fetching', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const chunks = await collect(
      streamFreeChat([{ role: 'user', content: 'Inspect' }], 'fixture-token', {
        tools,
        callerToolContinuation: true,
        callerToolMaxSteps: MAX_CALLER_TOOL_STEPS + 1,
        fetchImpl,
      }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(chunks).toEqual([
      {
        type: 'error',
        code: 'protocol_error',
        message: 'The caller-action step budget is invalid.',
      },
    ]);
  });

  it('refuses a caller resume response that changes run identity', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response([], true, false));
    const chunks = await collect(
      streamFreeChat([], 'fixture-token', { tools, callerResume: receipt(), fetchImpl }),
    );
    expect(chunks.at(-1)).toMatchObject({ type: 'error', code: 'protocol_error' });
  });

  it('joins a partial live boundary to its durable tail without executing twice', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(events().slice(0, 2), false))
      .mockResolvedValueOnce(snapshot(events().slice(2), 'awaiting_input'));
    const chunks = await collect(
      streamFreeChat([{ role: 'user', content: 'Inspect' }], 'fixture-token', { tools, fetchImpl }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]![0])).toContain('after=6');
    expect(chunks.filter((chunk) => chunk.type === 'tool-handoff')).toHaveLength(1);
    expect(chunks.at(-1)?.type).toBe('done');
  });

  it('does not hand out an old caller checkpoint when replay proves the run advanced', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(events(), false))
      .mockResolvedValueOnce(
        snapshot(
          [
            envelope(8, {
              type: 'task-state-changed',
              taskId: 'turn',
              state: 'completed',
              summary: 'Already completed',
            }),
          ],
          'completed',
        ),
      );
    const chunks = await collect(
      streamFreeChat([{ role: 'user', content: 'Inspect' }], 'fixture-token', { tools, fetchImpl }),
    );
    expect(chunks.some((chunk) => chunk.type === 'tool-handoff')).toBe(false);
    expect(chunks.at(-1)?.type).toBe('done');
  });
});

describe('saved receipt transport without schema reconstruction', () => {
  it('posts only the exact receipt and decodes the next owned boundary using saved names', async () => {
    const next = events().map((event) => structuredClone(event));
    for (const event of next) {
      event.sequence += 3;
      if (event.event.type === 'caller-tools-requested') {
        event.event.nextEventSequence += 3;
        event.event.calls[0]!.id = 'next-local-call';
      }
    }
    const fetchImpl = vi.fn(async (_input: unknown, _init?: RequestInit) => response(next));
    const chunks = await collect(
      streamManagedCallerReceipt(receipt(), ['read_dom'], 'fixture-token', { fetchImpl }),
    );
    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(false);
    expect(chunks.find((chunk) => chunk.type === 'tool-handoff')).toMatchObject({
      continuation: { run_id: runId, next_event_sequence: 11 },
    });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    if (typeof url !== 'string' || !init) throw new Error('Expected a serialized caller request');
    expect(url.endsWith(CALLER_TOOL_RESUME_PATH)).toBe(true);
    expect(JSON.parse(String(init.body))).toEqual(receipt());
    expect(JSON.parse(String(init.body))).not.toHaveProperty('tools');
    const firstKey = new Headers(init.headers).get('idempotency-key');
    await collect(
      streamManagedCallerReceipt(receipt(), ['read_dom'], 'fixture-token', { fetchImpl }),
    );
    const nextInit = fetchImpl.mock.calls[1]![1];
    expect(firstKey).toBeTruthy();
    expect(new Headers(nextInit?.headers).get('idempotency-key')).toBe(firstKey);
  });
});

describe('saved offering across hosted checkpoints', () => {
  it.each(['approval', 'input'] as const)(
    'decodes caller work after %s without sending replacement tools',
    async (kind) => {
      const fetchImpl = vi.fn(async (_input: unknown, _init?: RequestInit) => response(events()));
      const options = { originalCallerToolNames: ['read_dom'], fetchImpl };
      const chunks = await collect(
        kind === 'approval'
          ? streamManagedChatApproval(
              runId,
              [{ tool_call_id: 'hosted-call', decision: 'approved' }],
              'fixture-token',
              options,
            )
          : streamManagedChatToolInput(
              runId,
              [{ tool_call_id: 'hosted-call', input_responses: { answer: 'fixture' } }],
              'fixture-token',
              options,
            ),
      );
      expect(chunks.some((chunk) => chunk.type === 'error')).toBe(false);
      expect(chunks.find((chunk) => chunk.type === 'tool-handoff')).toMatchObject({
        continuation: { run_id: runId, next_event_sequence: 8 },
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body));
      expect(body).toEqual(
        kind === 'approval'
          ? {
              run_id: runId,
              tool_approvals: [{ tool_call_id: 'hosted-call', decision: 'approved' }],
            }
          : {
              run_id: runId,
              tool_inputs: [
                { tool_call_id: 'hosted-call', input_responses: { answer: 'fixture' } },
              ],
            },
      );
      expect(body).not.toHaveProperty('tools');
    },
  );
  it('refuses original names on an initial request before transport', async () => {
    const fetchImpl = vi.fn();
    const chunks = await collect(
      streamFreeChat([{ role: 'user', content: 'Inspect' }], 'fixture-token', {
        originalCallerToolNames: ['read_dom'],
        fetchImpl,
      }),
    );
    expect(chunks).toMatchObject([{ type: 'error', code: 'protocol_error' }]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
