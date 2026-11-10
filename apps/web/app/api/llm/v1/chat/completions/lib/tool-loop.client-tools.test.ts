import { createManagedToolInventoryMessage } from './request-processor';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOM_SUMMARY_HEADING,
  PAGE_CONTENT_FENCE_BEGIN,
} from '@agiworkforce/client-runtime/observation-history';

import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';
import { webSearchToolDef } from '@/lib/web-search/web-search-tool';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  DEVICE_SCREENSHOT_MESSAGE_PREFIX,
  DEFAULT_CALLER_TOOL_MAX_STEPS,
} from '@agiworkforce/cloud-contracts';

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

import {
  runToolLoop,
  type ToolLoopCallerCheckpoint,
  type ToolLoopApprovalCheckpoint,
} from './tool-loop';
import type { ProcessedRequest } from './request-processor';
import { MANAGED_TOOL_INVENTORY_MESSAGE_NAME } from './managed-tool-inventory';
import { CHAT_SYSTEM_PROMPT_PINNED_VERSION } from '@/lib/prompts/chat-system-prompt';

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

  it.each(['cli', 'api'] as const)(
    'preserves the %s caller ownership boundary in its provider inventory',
    async (surface) => {
      provider.stream.mockResolvedValueOnce(
        stream([
          {
            choices: [{ index: 0, delta: { content: 'Done.' }, finish_reason: 'stop' }],
            model: 'fixture-model',
          },
        ]),
      );
      const readFile = {
        ...CALLER_WRITE_FILE,
        function: { ...CALLER_WRITE_FILE.function, name: 'read_file' },
      };
      const processed = makeProcessed([CALLER_WRITE_FILE, readFile]);
      processed.chatSurface = surface;
      processed.managedToolInventoryVersion = CHAT_SYSTEM_PROMPT_PINNED_VERSION;
      processed.llmRequest.messages.unshift(
        createManagedToolInventoryMessage(processed.llmRequest.tools),
      );
      const source = structuredClone(processed.llmRequest.messages);

      await collect(runToolLoop(processed, { approvalMode: 'auto' }));

      const request = provider.stream.mock.calls[0]?.[2] as ProcessedRequest['llmRequest'];
      const inventory = request.messages.find(
        (message) => message.name === MANAGED_TOOL_INVENTORY_MESSAGE_NAME,
      );
      if (surface === 'cli') {
        expect(inventory?.content).toContain('\n- write_file\n- read_file\n');
        expect(inventory?.content).not.toContain('write a file into that sandbox');
        expect(inventory?.content).toContain('- web_search,');
      } else {
        expect(request.messages).toEqual(source);
      }
      expect(processed.llmRequest.messages).toEqual(source);
      expect(e2b.getE2BExecutor).not.toHaveBeenCalled();
    },
  );

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

  it.each(['manual', 'auto'] as const)(
    'returns an API caller-defined platform name through the caller handoff in %s mode',
    async (approvalMode) => {
      const readFile = {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a UTF-8 file in the calling application.',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path'],
          },
        },
      };
      const appStatus = {
        type: 'function',
        function: { name: 'app_status', parameters: { type: 'object', properties: {} } },
      };
      const processed = makeProcessed([readFile, appStatus]);
      processed.chatSurface = 'api';
      processed.chatRequest = {
        ...processed.chatRequest!,
        code_execution: false,
        connector_tools_enabled: false,
        web_search: false,
        web_fetch: false,
      };
      provider.stream.mockResolvedValueOnce(toolCallStream('read_file', { path: 'notes.txt' }));

      const output = await collect(runToolLoop(processed, { approvalMode }));

      const chunk = handoffChunk(output);
      expect(chunk.choices[0]?.finish_reason).toBe('tool_calls');
      expect(chunk.choices[0]?.delta.tool_calls).toEqual([
        {
          index: 0,
          id: 'call-caller-1',
          type: 'function',
          function: { name: 'read_file', arguments: JSON.stringify({ path: 'notes.txt' }) },
        },
      ]);
      expect(output).not.toContain('x_tool_approval_request');
      expect(output).not.toContain('x_tool_result');
      expect(provider.stream).toHaveBeenCalledTimes(1);
      expect(e2b.getE2BExecutor).not.toHaveBeenCalled();
    },
  );

  it('offers only the caller schema when an API function also appears in the hosted catalog', async () => {
    const name = 'mcp__fixture__lookup';
    const caller = {
      type: 'function',
      function: {
        name,
        description: 'Look up data in the calling application.',
        parameters: { type: 'object', properties: { key: { type: 'string' } } },
      },
    };
    const processed = makeProcessed([caller]);
    processed.chatSurface = 'api';
    processed.llmRequest.tools?.push({
      ...caller,
      function: { ...caller.function, description: 'A resolved hosted definition.' },
    });
    provider.stream.mockResolvedValueOnce(toolCallStream(name, { key: 'example' }));
    const executor = vi.fn();

    const output = await collect(
      runToolLoop(processed, {
        approvalMode: 'manual',
        connectorExecutor: executor,
        mcpTools: [
          {
            qualifiedName: name,
            serverId: 'fixture',
            toolName: 'lookup',
            origin: 'operator',
            description: 'A different hosted lookup.',
            inputSchema: { type: 'object', properties: { other: { type: 'number' } } },
          },
        ],
      }),
    );
    const request = provider.stream.mock.calls[0]?.[2] as ProcessedRequest['llmRequest'];
    const matching = request.tools?.filter(
      (tool) => (tool as typeof caller).function?.name === name,
    );
    expect(matching).toEqual([caller]);
    expect(handoffChunk(output).choices[0]?.finish_reason).toBe('tool_calls');
    expect(executor).not.toHaveBeenCalled();
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

  it.each(['web', 'chrome', 'desktop', 'mobile', 'vscode'] as const)(
    'keeps a platform tool a %s app declares on the hosted path',
    async (surface) => {
      provider.stream.mockResolvedValueOnce(
        toolCallStream('web_search', { query: 'austin coffee' }),
      );
      const processed = { ...makeProcessed([webSearchToolDef()]), chatSurface: surface };

      const output = await collect(runToolLoop(processed, { approvalMode: 'manual' }));

      expect(output).not.toContain('x_tool_handoff');
      expect(output).toContain('x_tool_approval_request');
    },
  );

  it.each(['cli', 'api'] as const)(
    'keeps a platform tool the %s caller never declared on the hosted path',
    async (surface) => {
      provider.stream.mockResolvedValueOnce(
        toolCallStream('web_search', { query: 'austin coffee' }),
      );
      const processed = { ...makeProcessed([]), chatSurface: surface };

      const output = await collect(runToolLoop(processed, { approvalMode: 'manual' }));

      expect(output).not.toContain('x_tool_handoff');
      expect(output).toContain('x_tool_approval_request');
    },
  );
});

describe('caller continuation · server-owned mixed batches', () => {
  const local = {
    type: 'function',
    function: { name: 'read_dom', parameters: { type: 'object', properties: {} } },
  };
  const batch = [
    { id: 'local-1', type: 'function', function: { name: 'read_dom', arguments: '{}' } },
    {
      id: 'hosted-1',
      type: 'function',
      function: { name: 'web_search', arguments: '{"query":"fixture"}' },
    },
  ];

  function processed(messages?: ProcessedRequest['llmRequest']['messages']): ProcessedRequest {
    const request = makeProcessed([local]);
    request.chatSurface = 'chrome';
    request.chatRequest!.caller_tool_handoff_version = AGENT_EVENT_SCHEMA_VERSION;
    if (messages) request.llmRequest.messages = structuredClone(messages);
    return request;
  }

  function mixedStream() {
    return stream([
      {
        choices: [
          { delta: { tool_calls: batch.map((call, index) => ({ ...call, index })) }, index: 0 },
        ],
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }] },
    ]);
  }

  function saveCaller() {
    return vi.fn(async (checkpoint: ToolLoopCallerCheckpoint) => ({ events: checkpoint.events }));
  }

  beforeEach(() => {
    provider.stream.mockReset();
    e2b.getE2BExecutor.mockClear();
  });

  it('fails before provider execution when persistence was not installed', async () => {
    await expect(collect(runToolLoop(processed()))).rejects.toThrow('persistence is not available');
    expect(provider.stream).not.toHaveBeenCalled();
  });

  it('pauses for hosted approval without handing the hosted sibling to Chrome', async () => {
    provider.stream.mockResolvedValueOnce(mixedStream());
    const approval = vi.fn(async (_checkpoint: ToolLoopApprovalCheckpoint) => undefined);
    const caller = saveCaller();
    const execute = vi.fn();
    const output = await collect(
      runToolLoop(processed(), {
        approvalMode: 'manual',
        onApprovalCheckpoint: approval,
        onCallerToolCheckpoint: caller,
        toolExecutor: execute,
      }),
    );
    expect(approval).toHaveBeenCalledTimes(1);
    const saved = approval.mock.calls[0]![0];
    expect(saved.pendingToolCalls.map((call) => call.id)).toEqual(['hosted-1']);
    expect(saved.messages.at(-1)?.tool_calls).toEqual(batch);
    expect(caller).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(output).toContain('x_tool_approval_request');
    expect(output).not.toContain('x_tool_handoff');
    expect(output).not.toContain('caller-tools-requested');
    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it.each(['approved', 'rejected'] as const)(
    'settles the %s hosted sibling before checkpointing only the browser obligation',
    async (decision) => {
      const messages: ProcessedRequest['llmRequest']['messages'] = [
        { role: 'user', content: 'Inspect this tab and search.' },
        {
          role: 'assistant',
          content: '',
          tool_calls: batch,
          __canonicalThinking: [
            {
              type: 'thinking',
              thinking: 'private provider state',
              signature: 'private-signature',
            },
          ],
        },
      ];
      const caller = saveCaller();
      const execute = vi
        .fn()
        .mockResolvedValue({ content: 'hosted fixture result', isError: false });
      const output = await collect(
        runToolLoop(processed(messages), {
          approvalMode: 'manual',
          onCallerToolCheckpoint: caller,
          resume: {
            approvals: [{ toolCallId: 'hosted-1', decision }],
            guidance: 'Keep this guidance.',
          },
          eventSessionId: 'fixture-session',
          eventTurnId: 'fixture-turn',
          initialEventSequence: 20,
          initialCompletedSteps: 4,
          toolExecutor: execute,
        }),
      );
      expect(caller).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledTimes(decision === 'approved' ? 1 : 0);
      const saved = caller.mock.calls[0]![0];
      expect(saved.completedSteps).toBe(4);
      expect(saved.pendingToolCalls.map((call) => call.id)).toEqual(['local-1']);
      expect(saved.messages[1]).toEqual(messages[1]);
      expect(saved.messages.filter((message) => message.role === 'tool')).toEqual([
        expect.objectContaining({ tool_call_id: 'hosted-1' }),
      ]);
      expect(saved.events.map((entry) => entry.event.type)).toEqual([
        'caller-tools-requested',
        'task-state-changed',
        'lifecycle',
      ]);
      expect(saved.events[0]?.event).toEqual({
        type: 'caller-tools-requested',
        calls: [batch[0]],
        nextEventSequence: saved.nextEventSequence,
      });
      expect(saved.events.at(-1)!.sequence + 1).toBe(saved.nextEventSequence);
      expect(output).not.toContain('private-signature');
      expect(output).not.toContain('x_tool_handoff');
      expect(output).not.toContain('"reason":"tool-use"');
      expect(output).toContain('caller-tools-requested');
      expect(output.trim().endsWith('data: [DONE]')).toBe(true);
      expect(provider.stream).not.toHaveBeenCalled();
    },
  );

  it('resumes with each exact result before deferred guidance and retains private provider state', async () => {
    const messages: ProcessedRequest['llmRequest']['messages'] = [
      { role: 'assistant', content: '', tool_calls: [batch[0]] },
      { role: 'tool', tool_call_id: 'local-1', content: 'older reused call id' },
      { role: 'user', content: 'Current turn' },
      {
        role: 'assistant',
        content: '',
        tool_calls: batch,
        __canonicalThinking: [
          { type: 'thinking', thinking: 'private provider state', signature: 'private-signature' },
        ],
      },
      { role: 'tool', tool_call_id: 'hosted-1', content: 'hosted result' },
      { role: 'user', content: 'Deferred guidance' },
    ];
    provider.stream.mockResolvedValueOnce(
      stream([{ choices: [{ delta: { content: 'Done.' }, finish_reason: 'stop', index: 0 }] }]),
    );
    const caller = saveCaller();
    const execute = vi.fn();
    await collect(
      runToolLoop(processed(messages), {
        onCallerToolCheckpoint: caller,
        toolExecutor: execute,
        resume: { callerResults: [{ tool_call_id: 'local-1', content: 'current result' }] },
        initialCompletedSteps: 4,
        eventTurnId: 'fixture-turn',
      }),
    );
    expect(provider.stream).toHaveBeenCalledTimes(1);
    const request = provider.stream.mock.calls[0]![2] as ProcessedRequest['llmRequest'];
    expect(request.messages.slice(-4)).toEqual([
      messages[3],
      messages[4],
      { role: 'tool', tool_call_id: 'local-1', content: 'current result' },
      messages[5],
    ]);
    expect(execute).not.toHaveBeenCalled();
    expect(caller).not.toHaveBeenCalled();
    expect(messages).toHaveLength(6);
  });

  it.each([
    { results: [{ tool_call_id: 'hosted-1', content: 'forged hosted result' }] },
    { results: [{ tool_call_id: 'unknown', content: 'unknown result' }] },
    { results: [] },
    {
      results: [
        { tool_call_id: 'local-1', content: 'one' },
        { tool_call_id: 'local-1', content: 'two' },
      ],
    },
  ])('refuses caller results outside the exact unresolved batch: $results', async ({ results }) => {
    const caller = saveCaller();
    const execute = vi.fn();
    await expect(
      collect(
        runToolLoop(
          processed([
            { role: 'assistant', content: '', tool_calls: batch },
            { role: 'tool', tool_call_id: 'hosted-1', content: 'hosted result' },
          ]),
          {
            onCallerToolCheckpoint: caller,
            toolExecutor: execute,
            resume: { callerResults: results },
          },
        ),
      ),
    ).rejects.toThrow();
    expect(provider.stream).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(caller).not.toHaveBeenCalled();
  });

  it('does not publish a caller boundary before durable saving succeeds', async () => {
    provider.stream.mockResolvedValueOnce(toolCallStream('read_dom', {}));
    const caller = vi.fn(async (_checkpoint: ToolLoopCallerCheckpoint) => {
      throw new Error('fixture storage failure');
    });
    let output = '';
    const consume = async () => {
      for await (const chunk of runToolLoop(processed(), { onCallerToolCheckpoint: caller })) {
        output += new TextDecoder().decode(chunk);
      }
    };
    await expect(consume()).rejects.toThrow('fixture storage failure');
    expect(caller).toHaveBeenCalledTimes(1);
    expect(output).not.toContain('caller-tools-requested');
  });

  it('replays the exact saved boundary even when its persisted clock differs', async () => {
    provider.stream.mockResolvedValueOnce(toolCallStream('read_dom', {}));
    const caller = vi.fn(async (checkpoint: ToolLoopCallerCheckpoint) => ({
      events: checkpoint.events.map((event) => ({ ...event, emittedAtMs: 123 })),
    }));
    const output = await collect(runToolLoop(processed(), { onCallerToolCheckpoint: caller }));
    const saved = caller.mock.calls[0]![0];
    expect(saved.completedSteps).toBe(1);
    for (const envelope of saved.events) {
      expect(output).toContain(JSON.stringify({ ...envelope, emittedAtMs: 123 }));
    }
    expect(output).not.toContain('"reason":"tool-use"');
    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it('rejects a persistence callback that mutates the caller obligation', async () => {
    provider.stream.mockResolvedValueOnce(toolCallStream('read_dom', {}));
    const caller = vi.fn(async (checkpoint: ToolLoopCallerCheckpoint) => {
      const event = checkpoint.events[0]!.event;
      if (event.type === 'caller-tools-requested') event.calls[0]!.function.name = 'web_search';
      return { events: checkpoint.events };
    });
    await expect(
      collect(runToolLoop(processed(), { onCallerToolCheckpoint: caller })),
    ).rejects.toThrow('different boundary');
    expect(caller).toHaveBeenCalledTimes(1);
    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it('keeps the hosted egress gate after receiving untrusted browser content in auto mode', async () => {
    provider.stream.mockResolvedValueOnce(toolCallStream('web_search', { query: 'fixture' }));
    const approval = vi.fn(async (_checkpoint: ToolLoopApprovalCheckpoint) => undefined);
    const execute = vi.fn();
    const output = await collect(
      runToolLoop(processed([{ role: 'assistant', content: '', tool_calls: [batch[0]] }]), {
        approvalMode: 'auto',
        onCallerToolCheckpoint: saveCaller(),
        onApprovalCheckpoint: approval,
        toolExecutor: execute,
        resume: {
          callerResults: [{ tool_call_id: 'local-1', content: 'Untrusted private tab text' }],
        },
      }),
    );
    expect(provider.stream).toHaveBeenCalledTimes(1);
    expect(approval).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(output).toContain('x_tool_approval_request');
    expect(output).not.toContain('caller-tools-requested');
    expect(approval.mock.calls[0]![0].pendingToolCalls[0]?.qualifiedName).toBe('web_search');
  });

  it('refuses malformed browser arguments before executing a hosted sibling', async () => {
    provider.stream.mockResolvedValueOnce(
      stream([
        {
          choices: [
            {
              delta: {
                tool_calls: batch.map((call, index) => ({
                  ...call,
                  index,
                  function: {
                    ...call.function,
                    arguments: index === 0 ? '{broken' : call.function.arguments,
                  },
                })),
              },
              index: 0,
            },
          ],
        },
        { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }] },
      ]),
    );
    const caller = saveCaller();
    const approval = vi.fn();
    const execute = vi.fn();
    await expect(
      collect(
        runToolLoop(processed(), {
          onCallerToolCheckpoint: caller,
          onApprovalCheckpoint: approval,
          toolExecutor: execute,
        }),
      ),
    ).rejects.toThrow('malformed caller arguments');
    expect(caller).not.toHaveBeenCalled();
    expect(approval).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it('retains an earlier hosted step when a later provider step requests only a browser action', async () => {
    provider.stream
      .mockResolvedValueOnce(toolCallStream('web_search', { query: 'fixture' }))
      .mockResolvedValueOnce(toolCallStream('read_dom', {}));
    const caller = saveCaller();
    const execute = vi.fn().mockResolvedValue({ content: 'earlier hosted result', isError: false });
    await collect(
      runToolLoop(processed(), {
        approvalMode: 'auto',
        onCallerToolCheckpoint: caller,
        toolExecutor: execute,
      }),
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(provider.stream).toHaveBeenCalledTimes(2);
    expect(caller).toHaveBeenCalledTimes(1);
    const saved = caller.mock.calls[0]![0];
    expect(saved.completedSteps).toBe(2);
    expect(saved.pendingToolCalls.map((call) => call.qualifiedName)).toEqual(['read_dom']);
    expect(saved.messages.filter((message) => message.role === 'tool')).toEqual([
      expect.objectContaining({ content: 'earlier hosted result' }),
    ]);
    expect(saved.messages.filter((message) => message.role === 'assistant')).toHaveLength(2);
  });

  it('places caller screenshots after results and retains the previous screenshot for comparison', async () => {
    provider.stream.mockResolvedValueOnce(
      stream([{ choices: [{ delta: { content: 'Done.' }, finish_reason: 'stop', index: 0 }] }]),
    );
    await collect(
      runToolLoop(
        processed([
          {
            role: 'user',
            content: `${DEVICE_SCREENSHOT_MESSAGE_PREFIX}. Old image`,
            multimodal_content: [
              { type: 'image_url', image_url: { url: 'data:image/png;base64,old' } },
            ],
          },
          { role: 'assistant', content: '', tool_calls: batch },
          { role: 'tool', tool_call_id: 'hosted-1', content: 'hosted result' },
          { role: 'user', content: 'Deferred guidance' },
        ]),
        {
          onCallerToolCheckpoint: saveCaller(),
          resume: {
            callerResults: [{ tool_call_id: 'local-1', content: 'caller result' }],
            callerObservations: [
              { text: 'Current page', images: [{ base64: 'current', mime_type: 'image/png' }] },
              { text: 'Use the second tab next.' },
            ],
          },
        },
      ),
    );
    const request = provider.stream.mock.calls[0]![2] as ProcessedRequest['llmRequest'];
    expect(request.messages[0]?.multimodal_content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,old' } },
    ]);
    expect(request.messages.slice(2)).toEqual([
      { role: 'tool', tool_call_id: 'hosted-1', content: 'hosted result' },
      { role: 'tool', tool_call_id: 'local-1', content: 'caller result' },
      {
        role: 'user',
        content: `${DEVICE_SCREENSHOT_MESSAGE_PREFIX}. Current page`,
        multimodal_content: [
          { type: 'text', text: `${DEVICE_SCREENSHOT_MESSAGE_PREFIX}. Current page` },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,current' } },
        ],
      },
      { role: 'user', content: 'Use the second tab next.' },
      { role: 'user', content: 'Deferred guidance' },
    ]);
    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it('bounds caller DOM and pixel history while preserving receipts, private context and current comparisons', async () => {
    provider.stream.mockResolvedValueOnce(
      stream([{ choices: [{ delta: { content: 'Done.' }, finish_reason: 'stop', index: 0 }] }]),
    );
    const messages: ProcessedRequest['llmRequest']['messages'] = [
      {
        role: 'user',
        content: `Original browser goal\n\n${DOM_SUMMARY_HEADING}:\n${PAGE_CONTENT_FENCE_BEGIN}\nUSER_ATTACHED_PAGE_DATA`,
        multimodal_content: [
          { type: 'text', text: 'Original browser goal' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,USER_UPLOADED_REFERENCE' },
          },
        ],
      },
    ];
    for (let step = 1; step <= 3; step++) {
      messages.push(
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: `earlier-${step}`,
              type: 'function',
              function: { name: 'read_dom', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: `earlier-${step}`,
          content: `Receipt ${step}\n\n${DOM_SUMMARY_HEADING}:\n${PAGE_CONTENT_FENCE_BEGIN}\nDOM_PAYLOAD_${step}`,
        },
        {
          role: 'user',
          content: `${DEVICE_SCREENSHOT_MESSAGE_PREFIX}. View ${step}`,
          multimodal_content: [
            { type: 'text', text: `${DEVICE_SCREENSHOT_MESSAGE_PREFIX}. View ${step}` },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,PIXEL_PAYLOAD_${step}` },
            },
          ],
        },
      );
    }
    messages.push(
      {
        role: 'assistant',
        content: '',
        tool_calls: batch,
        __canonicalThinking: [
          { type: 'thinking', thinking: 'Private fixture context', signature: 'fixture-signature' },
        ],
      },
      { role: 'tool', tool_call_id: 'hosted-1', content: 'Hosted result' },
      { role: 'user', content: 'Deferred guidance' },
    );
    const source = structuredClone(messages);
    await collect(
      runToolLoop(processed(messages), {
        onCallerToolCheckpoint: saveCaller(),
        initialCompletedSteps: 4,
        resume: {
          callerResults: [
            {
              tool_call_id: 'local-1',
              content: `Caller receipt\n\n${DOM_SUMMARY_HEADING}:\n${PAGE_CONTENT_FENCE_BEGIN}\nDOM_PAYLOAD_4`,
            },
          ],
          callerObservations: [
            {
              text: 'Current view',
              images: [{ mime_type: 'image/png', base64: 'PIXEL_PAYLOAD_4' }],
            },
          ],
        },
      }),
    );
    const request = provider.stream.mock.calls[0]![2] as ProcessedRequest['llmRequest'];
    const serialized = JSON.stringify(request.messages);
    for (const step of [1, 2]) {
      expect(serialized).not.toContain(`DOM_PAYLOAD_${step}`);
      expect(serialized).not.toContain(`PIXEL_PAYLOAD_${step}`);
    }
    for (const step of [3, 4]) {
      expect(serialized).toContain(`DOM_PAYLOAD_${step}`);
      expect(serialized).toContain(`PIXEL_PAYLOAD_${step}`);
    }
    for (const step of [1, 2, 3]) expect(serialized).toContain(`Receipt ${step}`);
    expect(
      request.messages
        .filter((message) => message.role === 'tool')
        .map((message) => message.tool_call_id),
    ).toEqual(['earlier-1', 'earlier-2', 'earlier-3', 'hosted-1', 'local-1']);
    expect(request.messages[0]).toEqual(source[0]);
    expect(serialized).toContain('USER_UPLOADED_REFERENCE');
    expect(request.messages.at(-1)?.content).toBe('Deferred guidance');
    expect(
      request.messages.find((message) => message.__canonicalThinking)?.__canonicalThinking,
    ).toEqual(source.find((message) => message.__canonicalThinking)?.__canonicalThinking);
    expect(messages).toEqual(source);
    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it('refuses caller observations without their matching result receipt', async () => {
    await expect(
      collect(
        runToolLoop(processed([{ role: 'assistant', content: '', tool_calls: [batch[0]] }]), {
          onCallerToolCheckpoint: saveCaller(),
          resume: { callerObservations: [{ text: 'Unbound observation' }] },
        }),
      ),
    ).rejects.toThrow('require the outstanding caller results');
    expect(provider.stream).not.toHaveBeenCalled();
  });

  it('does not reset the cumulative provider budget when caller results resume', async () => {
    provider.stream.mockResolvedValueOnce(toolCallStream('read_dom', {}));
    const caller = saveCaller();
    await collect(
      runToolLoop(processed(), {
        onCallerToolCheckpoint: caller,
        initialCompletedSteps: DEFAULT_CALLER_TOOL_MAX_STEPS - 1,
      }),
    );
    const saved = caller.mock.calls[0]![0];
    expect(saved.completedSteps).toBe(DEFAULT_CALLER_TOOL_MAX_STEPS);
    const output = await collect(
      runToolLoop(processed(saved.messages), {
        onCallerToolCheckpoint: caller,
        initialCompletedSteps: saved.completedSteps,
        resume: { callerResults: [{ tool_call_id: 'call-caller-1', content: 'local result' }] },
      }),
    );
    expect(provider.stream).toHaveBeenCalledTimes(1);
    expect(caller).toHaveBeenCalledTimes(1);
    expect(output).toContain('max_agent_steps_reached');
  });
});
