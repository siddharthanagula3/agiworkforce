import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';
import { webSearchToolDef } from '@/lib/web-search/web-search-tool';

const provider = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: provider.stream,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));
const e2b = vi.hoisted(() => ({ getE2BExecutor: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: e2b.getE2BExecutor,
  pauseE2BSession: vi.fn().mockResolvedValue(undefined),
}));

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

const CALLER_WRITE_FILE = {
  type: 'function',
  function: {
    name: 'write_file',
    description: 'Write a UTF-8 text file at a path relative to the project root.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
};

function stream(events: unknown[], prefix = ''): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          prefix + events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
        ),
      );
      controller.close();
    },
  });
}

function toolCallStream(name: string, args: Record<string, unknown>) {
  return stream([
    { choices: [{ delta: { content: 'On it.' }, index: 0 }], model: 'fixture-model' },
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call-caller-1',
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
          index: 0,
        },
      ],
      model: 'fixture-model',
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }], model: 'fixture-model' },
  ]);
}

function makeProcessed(callerTools: unknown[]): ProcessedRequest {
  const messages = [{ role: 'user', content: 'Create hello.txt containing hello.' }];
  return {
    chatSurface: 'cli' as const,
    requestId: 'fixture-client-tools-request',
    chatRequest: { model: 'fixture-model', messages, stream: true, tools: callerTools },
    conversationId: undefined,
    requestedModel: 'fixture-model',
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 512,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'fixture-model',
    resolvedTaskType: 'general',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat',
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: 'fixture-model',
      messages,
      max_tokens: 512,
      stream: true,
      tools: [...callerTools, webSearchToolDef()],
    },
  } as ProcessedRequest;
}

async function collect(generator: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let output = '';
  for await (const chunk of generator) output += decoder.decode(chunk);
  return output;
}

function handoffChunk(output: string): {
  choices: Array<{
    delta: { tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
    finish_reason?: string;
  }>;
} {
  const line = output
    .split('\n')
    .find((entry) => entry.startsWith('data: ') && entry.includes('x_tool_handoff'));
  expect(line, 'a tool hand-off chunk is on the stream').toBeDefined();
  return JSON.parse((line as string).slice('data: '.length));
}

/**
 * The CLI, and VS Code and the desktop shell through it, run their own agent
 * loop and declare their own tools. The hosted loop used to treat those as its
 * own: it gated write_file behind an approval no OpenAI-compatible client can
 * answer and paused the run, so the caller saw an empty reply and no tool.
 */
describe('tool loop · tools the caller declared', () => {
  beforeEach(() => {
    provider.stream.mockReset();
    e2b.getE2BExecutor.mockClear();
  });

  it('returns the call in OpenAI form with a tool_calls finish instead of gating it', async () => {
    provider.stream.mockResolvedValueOnce(
      toolCallStream('write_file', { path: 'hello.txt', content: 'hello' }),
    );

    const usage = createObservedProviderUsage();
    usage.providerCalls = 1;
    usage.inputTokens = 598;
    usage.outputTokens = 23;
    const output = await collect(
      runToolLoop(makeProcessed([CALLER_WRITE_FILE]), { approvalMode: 'manual', usage }),
    );

    const toolCallFrames = output.split('\n').filter((line) => {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') return false;
      const event = JSON.parse(line.slice('data: '.length));
      return event.choices?.some(
        (choice: { delta?: { tool_calls?: unknown[] } }) => choice.delta?.tool_calls?.length,
      );
    });
    expect(toolCallFrames, 'only the authoritative handoff is executable').toHaveLength(1);
    const chunk = handoffChunk(output);
    expect(chunk.choices[0]?.finish_reason).toBe('tool_calls');
    expect(chunk.choices[0]?.delta.tool_calls).toEqual([
      expect.objectContaining({
        id: 'call-caller-1',
        function: {
          name: 'write_file',
          arguments: JSON.stringify({ path: 'hello.txt', content: 'hello' }),
        },
      }),
    ]);
    expect(output).not.toContain('x_tool_approval_request');
    expect(output).toContain('"reason":"tool-use"');
    expect(output.trim().endsWith('data: [DONE]')).toBe(true);
    expect(output).toContain(
      '"usage":{"prompt_tokens":598,"completion_tokens":23,"total_tokens":621}',
    );
    const journaledToolUse = output
      .split('\n')
      .filter((line) => line.startsWith('data: ') && line.includes('x_agent_event'))
      .map((line) => JSON.parse(line.slice('data: '.length)).choices[0].delta.x_agent_event.event)
      .filter((event: { type: string }) => event.type.startsWith('tool-use-'));
    expect(journaledToolUse, 'a durable replay can rebuild the handoff').toEqual([
      { type: 'tool-use-start', toolUseId: 'call-caller-1', name: 'write_file' },
      {
        type: 'tool-use-delta',
        toolUseId: 'call-caller-1',
        deltaJson: JSON.stringify({ path: 'hello.txt', content: 'hello' }),
      },
      { type: 'tool-use-end', toolUseId: 'call-caller-1' },
    ]);
    expect(provider.stream).toHaveBeenCalledTimes(1);
    expect(e2b.getE2BExecutor).not.toHaveBeenCalled();
  });

  it('keeps mixed-frame text while handing off fragmented calls only once', async () => {
    provider.stream.mockResolvedValueOnce(
      stream(
        [
          null,
          {
            choices: [
              {
                delta: {
                  content: 'I will read. ',
                  tool_calls: [
                    {
                      index: 2,
                      id: 'call-caller-1',
                      type: 'function',
                      function: { name: 'write_file', arguments: '{"path":"hello.txt",' },
                    },
                  ],
                },
                index: 0,
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  content: 'Done choosing.',
                  tool_calls: [{ index: 2, function: { arguments: '"content":"hello"}' } }],
                },
                index: 0,
              },
            ],
          },
          { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }] },
        ],
        'data: not-json\n\n',
      ),
    );
    const output = await collect(
      runToolLoop(makeProcessed([CALLER_WRITE_FILE]), { approvalMode: 'manual' }),
    );
    expect(output).toContain('data: null');
    expect(output).toContain('data: not-json');
    const frames = output
      .split('\n')
      .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
      .flatMap((line) => {
        try {
          return [JSON.parse(line.slice('data: '.length))];
        } catch {
          return [];
        }
      });
    const choices = frames.flatMap((frame) => frame?.choices ?? []);
    expect(choices.map((choice) => choice.delta?.content ?? '').join('')).toBe(
      'I will read. Done choosing.',
    );
    const calls = choices.flatMap((choice) => choice.delta?.tool_calls ?? []);
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe('call-caller-1');
    expect(JSON.parse(calls[0].function.arguments)).toEqual({
      path: 'hello.txt',
      content: 'hello',
    });
    expect(choices.filter((choice) => choice.finish_reason === 'tool_calls')).toHaveLength(1);
  });

  it('keeps a platform tool a web caller declares on the hosted path', async () => {
    provider.stream.mockResolvedValueOnce(toolCallStream('web_search', { query: 'austin coffee' }));
    const processed = { ...makeProcessed([webSearchToolDef()]), chatSurface: 'web' as const };

    const output = await collect(runToolLoop(processed, { approvalMode: 'manual' }));

    expect(output).not.toContain('x_tool_handoff');
    expect(output).toContain('x_tool_approval_request');
  });

  it('keeps a platform tool the caller never declared on the hosted path', async () => {
    provider.stream.mockResolvedValueOnce(toolCallStream('web_search', { query: 'austin coffee' }));

    const output = await collect(runToolLoop(makeProcessed([]), { approvalMode: 'manual' }));

    expect(output).not.toContain('x_tool_handoff');
    expect(output).toContain('x_tool_approval_request');
  });
});
