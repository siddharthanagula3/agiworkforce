import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

const mockGetE2BExecutor = vi.fn();
const mockPauseE2BSession = vi.fn();
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: (...args: unknown[]) => mockGetE2BExecutor(...args),
  pauseE2BSession: (...args: unknown[]) => mockPauseE2BSession(...args),
}));

const mockExecuteWebMcpTool = vi.fn();
vi.mock('@/lib/mcp-tool-executor', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/mcp-tool-executor')>('@/lib/mcp-tool-executor');
  return {
    ...actual,
    executeWebMcpTool: (...args: unknown[]) => mockExecuteWebMcpTool(...args),
    getWebMcpCatalog: vi.fn(),
  };
});

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

function sseStreamFrom(lines: string[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    model: 'test-model',
  })}\n\n`;
}

const DECLARATION = {
  deviceId: 'device-abc',
  deviceName: 'Work MacBook',
  platform: 'darwin',
  appVersion: '1.2.3',
  capabilities: ['filesystem.read' as const],
  roots: [{ id: 'root-1', name: 'Documents', path: '/Users/qa/Documents' }],
};

function makeProcessed(withHost: boolean): ProcessedRequest {
  return {
    chatSurface: withHost ? ('desktop' as const) : ('web' as const),
    requestId: 'req-1',
    chatRequest: { model: 'gpt-test', messages: [], stream: true } as never,
    conversationId: undefined,
    requestedModel: 'gpt-test',
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'gpt-test',
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    ...(withHost ? { deviceHost: DECLARATION } : {}),
    llmRequest: {
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'read notes.md in Documents' }],
      max_tokens: 1000,
      stream: true,
      tools: [
        {
          type: 'function',
          function: {
            name: 'device_read_file',
            description: 'read a file on the device',
            parameters: { type: 'object' },
          },
        },
      ],
    },
  } as unknown as ProcessedRequest;
}

function deviceCallStream(args: Record<string, unknown>): ReadableStream {
  return sseStreamFrom([
    chunk({
      tool_calls: [
        { index: 0, id: 'call_1', function: { name: 'device_read_file', arguments: '' } },
      ],
    }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] }),
    chunk({}, 'tool_calls'),
  ]);
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
  return out;
}

function agentEvents(output: string): AgentEventEnvelope[] {
  return output
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .flatMap((line) => {
      const payload = JSON.parse(line.slice('data: '.length)) as {
        choices?: Array<{ delta?: { x_agent_event?: unknown } }>;
      };
      const event = parseAgentEventDelta(payload.choices?.[0]?.delta?.x_agent_event);
      return event ? [event] : [];
    });
}

describe('runToolLoop, device step boundary', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockExecuteWebMcpTool.mockReset();
  });

  it('pauses on a device call, checkpoints the binding, and runs nothing in the cloud', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(
      deviceCallStream({ rootId: 'root-1', path: 'notes.md' }),
    );
    const onDeviceCheckpoint = vi.fn(async () => undefined);
    const toolExecutor = vi.fn();

    const output = await drain(
      runToolLoop(makeProcessed(true), {
        onDeviceCheckpoint,
        toolExecutor,
        eventSessionId: 'session-1',
        eventTurnId: 'turn-1',
      }),
    );

    expect(toolExecutor).not.toHaveBeenCalled();
    expect(output).toContain('x_device_step_request');
    expect(onDeviceCheckpoint).toHaveBeenCalledOnce();

    const checkpoint = (onDeviceCheckpoint.mock.calls as unknown as unknown[][])[0]![0] as {
      deviceStep: { deviceId: string; steps: Array<{ toolCallId: string; summary: string }> };
      pendingToolCalls: Array<{ id: string }>;
    };
    expect(checkpoint.deviceStep.deviceId).toBe('device-abc');
    expect(checkpoint.deviceStep.steps).toEqual([
      { toolCallId: 'call_1', summary: 'Read notes.md in Documents' },
    ]);
    expect(checkpoint.pendingToolCalls.map((call) => call.id)).toEqual(['call_1']);

    const types = agentEvents(output).map((envelope) => envelope.event.type);
    expect(types).toContain('device-step-requested');
    expect(types.at(-1)).toBe('lifecycle');
  });

  it('refuses a folder the declaration never granted, without pausing', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(
      deviceCallStream({ rootId: 'root-elsewhere', path: 'notes.md' }),
    );
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([chunk({ content: 'I cannot reach that folder.' }, 'stop')]),
    );
    const onDeviceCheckpoint = vi.fn(async () => undefined);

    const output = await drain(
      runToolLoop(makeProcessed(true), {
        onDeviceCheckpoint,
        eventSessionId: 'session-1',
        eventTurnId: 'turn-1',
      }),
    );

    expect(onDeviceCheckpoint).not.toHaveBeenCalled();
    expect(output).toContain('not one the user granted');
  });

  it('never pauses for a caller that declared no desktop host', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(
      deviceCallStream({ rootId: 'root-1', path: 'notes.md' }),
    );
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([chunk({ content: 'done' }, 'stop')]),
    );
    const onDeviceCheckpoint = vi.fn(async () => undefined);

    await drain(
      runToolLoop(makeProcessed(false), {
        onDeviceCheckpoint,
        eventSessionId: 'session-1',
        eventTurnId: 'turn-1',
      }),
    );

    expect(onDeviceCheckpoint).not.toHaveBeenCalled();
  });

  it('folds a returned device result into the thread and carries on', async () => {
    const processed = makeProcessed(true);
    processed.llmRequest.messages = [
      { role: 'user', content: 'read notes.md in Documents' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'device_read_file',
              arguments: JSON.stringify({ rootId: 'root-1', path: 'notes.md' }),
            },
          },
        ],
      },
    ];
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([chunk({ content: 'Your notes say: buy milk.' }, 'stop')]),
    );

    const output = await drain(
      runToolLoop(processed, {
        resume: {
          deviceResults: [{ toolCallId: 'call_1', content: 'buy milk', isError: false }],
        },
        eventSessionId: 'session-1',
        eventTurnId: 'turn-1',
        initialEventSequence: 6,
      }),
    );

    expect(output).toContain('buy milk');
    const resolved = agentEvents(output).find(
      (envelope) => envelope.event.type === 'device-step-resolved',
    );
    expect(resolved?.event).toMatchObject({ toolCallId: 'call_1', outcome: 'completed' });

    const sent = mockBuildToolLoopStream.mock.calls[0]?.[2] as {
      messages: Array<{ role: string; content: string; tool_call_id?: string }>;
    };
    expect(sent.messages.find((message) => message.role === 'tool')).toMatchObject({
      tool_call_id: 'call_1',
      content: 'buy milk',
    });
  });
});
