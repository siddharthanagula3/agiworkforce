import { createManagedToolInventoryMessage } from './request-processor';
import { beforeEach, describe, it, expect, vi } from 'vitest';
type ScanModule0 = typeof import('undici');

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    fetch: (...args: unknown[]) =>
      (globalThis.fetch as unknown as (...a: unknown[]) => unknown)(...args),
  };
});

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

const factoryMocks = vi.hoisted(() => ({ streamRequest: vi.fn() }));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: factoryMocks.streamRequest,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

const e2bMocks = vi.hoisted(() => ({
  cause: 'no-capacity' as 'not-configured' | 'no-capacity' | 'policy',
  cutover: true,
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: async (
    _scope: unknown,
    onUnavailable?: (cause: 'not-configured' | 'no-capacity' | 'policy') => void,
  ) => {
    onUnavailable?.(e2bMocks.cause);
    return null;
  },
  pauseE2BSession: async () => undefined,
}));
vi.mock('@/lib/e2b/gate', () => ({
  e2bCutoverEnabled: () => e2bMocks.cutover,
  e2bExecutionEnabled: () => e2bMocks.cutover,
  e2bProvisioningReady: () => e2bMocks.cutover,
}));
vi.mock('@/lib/server/code-execution-policy', () => ({
  resolveCloudCodeExecutionPolicy: async () => ({ allowed: true }),
}));

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';
import { webSearchToolDef, WEB_SEARCH_TOOL } from '@/lib/web-search/web-search-tool';
import {
  e2bExecutionToolDefs,
  EXECUTE_CODE_TOOL,
  WRITE_FILE_TOOL,
} from '@/lib/e2b/execution-tools';
import { functionToolName } from './tool-loop-routing';
import { nativeSearchToolName } from '@/lib/web-search/required-search';
import { resolveNativeSearchMaxUses } from './request-processor';
import { MANAGED_TOOL_INVENTORY_MESSAGE_NAME } from './managed-tool-inventory';
import {
  CHAT_SYSTEM_PROMPT_PINNED_VERSION,
  chatSystemPromptSections,
} from '@/lib/prompts/chat-system-prompt';

const REPEATED_QUERY = 'best crm 2026';
const NEAR_IDENTICAL_QUERY = 'Best CRM, 2026?';

function sseStream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

function toolCallStream(
  toolName: string,
  args: Record<string, unknown>,
  callId: string,
): ReadableStream<Uint8Array> {
  return sseStream([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: callId,
                type: 'function',
                function: { name: toolName, arguments: JSON.stringify(args) },
              },
            ],
          },
          index: 0,
        },
      ],
      model: 'test-model',
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }], model: 'test-model' },
  ]);
}

function finalAnswerStream(text: string): ReadableStream<Uint8Array> {
  return sseStream([
    { choices: [{ delta: { content: text }, index: 0 }], model: 'test-model' },
    { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: 'test-model' },
  ]);
}

function makeProcessed(tools: unknown[]): ProcessedRequest {
  return {
    provider: 'xai',
    requestedModel: 'test-model',
    chatRequest: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Compare the options.' }],
      stream: true,
      web_search: true,
      code_execution: true,
    },
    llmRequest: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Compare the options.' }],
      max_tokens: 256,
      stream: true,
      tools,
    },
  } as unknown as ProcessedRequest;
}

async function collect(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const chunk of gen) out += decoder.decode(chunk);
  return out;
}

function searchResponse(): Response {
  return new Response(
    JSON.stringify({
      results: [{ title: 'A comparison', url: 'https://example.com/a', snippet: 'Some detail.' }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function requestAt(callIndex: number): { tools?: unknown[]; tool_choice?: unknown } | undefined {
  return factoryMocks.streamRequest.mock.calls[callIndex]?.[2] as
    { tools?: unknown[]; tool_choice?: unknown } | undefined;
}

function offeredToolNames(callIndex: number): string[] {
  const request = factoryMocks.streamRequest.mock.calls[callIndex]?.[2] as
    { tools?: unknown[] } | undefined;
  return (request?.tools ?? [])
    .map((tool) => functionToolName(tool) || nativeSearchToolName(tool))
    .filter(Boolean);
}

const NATIVE_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 3 };

/** One provider step that grounds `count` times before it answers. */
function groundedStream(count: number): ReadableStream<Uint8Array> {
  const events: unknown[] = [];
  for (let i = 0; i < count; i += 1) {
    events.push({
      choices: [
        {
          delta: {
            x_tool_status: {
              type: 'server_tool_use',
              name: 'web_search',
              status: 'searching',
              tool_use_id: `srv_${i}`,
            },
          },
          index: 0,
        },
      ],
      model: 'test-model',
    });
  }
  events.push({ choices: [{ delta: { content: 'Done.' }, index: 0 }], model: 'test-model' });
  events.push({ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: 'test-model' });
  return sseStream(events);
}

beforeEach(() => {
  factoryMocks.streamRequest.mockReset();
  dnsMocks.lookup.mockReset();
  dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  e2bMocks.cause = 'no-capacity';
  e2bMocks.cutover = true;
});

describe('tool loop · repeated query breaker', () => {
  it('runs a query once and refuses the repeat while the tool list stays the same', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(toolCallStream(WEB_SEARCH_TOOL, { query: REPEATED_QUERY }, 'call_1'))
      .mockResolvedValueOnce(
        toolCallStream(WEB_SEARCH_TOOL, { query: NEAR_IDENTICAL_QUERY }, 'call_2'),
      )
      .mockResolvedValueOnce(finalAnswerStream('Here is the comparison.'));

    const fetchMock = vi.fn(async () => searchResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key');

    try {
      const output = await collect(
        runToolLoop(makeProcessed([webSearchToolDef()]), { approvalMode: 'auto' }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(output).toContain('already ran this turn');
      expect(offeredToolNames(0)).toContain(WEB_SEARCH_TOOL);
      expect(offeredToolNames(1)).toEqual(offeredToolNames(0));
      expect(offeredToolNames(2)).toEqual(offeredToolNames(0));
      expect(output).toContain('Here is the comparison.');
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe('tool loop · unavailable tool withdrawal', () => {
  it('names the cause once and keeps the tool list for the cached prefix', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(
        toolCallStream(EXECUTE_CODE_TOOL, { language: 'python', code: 'print(1)' }, 'call_x1'),
      )
      .mockResolvedValueOnce(finalAnswerStream('Answered without running code.'));

    const output = await collect(
      runToolLoop(makeProcessed(e2bExecutionToolDefs()), { approvalMode: 'auto' }),
    );

    expect(output).toContain(
      'this account already has as many sandboxes running as its plan allows',
    );
    expect(offeredToolNames(0)).toContain(EXECUTE_CODE_TOOL);
    expect(offeredToolNames(1)).toEqual(offeredToolNames(0));
    expect(output).toContain('Answered without running code.');
  });

  it('names a deployment configuration cause when the sandbox is not configured', async () => {
    e2bMocks.cause = 'not-configured';
    factoryMocks.streamRequest
      .mockResolvedValueOnce(
        toolCallStream(EXECUTE_CODE_TOOL, { language: 'python', code: 'print(1)' }, 'call_x2'),
      )
      .mockResolvedValueOnce(finalAnswerStream('Answered without running code.'));

    const output = await collect(
      runToolLoop(makeProcessed(e2bExecutionToolDefs()), { approvalMode: 'auto' }),
    );

    expect(output).toContain('code execution is not configured on this deployment');
  });

  it('refuses every execution tool once one proves unavailable', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(
        toolCallStream(EXECUTE_CODE_TOOL, { language: 'python', code: 'print(1)' }, 'call_x4'),
      )
      .mockResolvedValueOnce(finalAnswerStream('Answered without running code.'));

    const output = await collect(
      runToolLoop(makeProcessed(e2bExecutionToolDefs()), { approvalMode: 'auto' }),
    );

    const offeredFirst = offeredToolNames(0);
    expect(offeredFirst.length).toBeGreaterThan(1);
    expect(offeredToolNames(1)).toEqual(offeredFirst);
    expect(offeredToolNames(2)).toEqual(offeredFirst);
    expect(output).toContain('is closed for this turn and was not run');
  });

  it('keeps a forced tool choice off later steps without dropping the tools', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(
        toolCallStream(EXECUTE_CODE_TOOL, { language: 'python', code: 'print(1)' }, 'call_x3'),
      )
      .mockResolvedValueOnce(finalAnswerStream('Answered without running code.'));

    const processed = makeProcessed(e2bExecutionToolDefs());
    processed.llmRequest.tool_choice = 'required';
    processed.chatSurface = 'web';
    processed.managedToolInventoryVersion = CHAT_SYSTEM_PROMPT_PINNED_VERSION;
    processed.llmRequest.messages.unshift(
      createManagedToolInventoryMessage(processed.llmRequest.tools),
    );
    const source = structuredClone(processed.llmRequest.messages);

    await collect(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(offeredToolNames(1)).toHaveLength(0);
    expect(requestAt(1)?.tool_choice).toBeUndefined();
    const request = factoryMocks.streamRequest.mock.calls[1]?.[2] as ProcessedRequest['llmRequest'];
    expect(
      request.messages.find((message) => message.name === MANAGED_TOOL_INVENTORY_MESSAGE_NAME)
        ?.content,
    ).toBe(chatSystemPromptSections(CHAT_SYSTEM_PROMPT_PINNED_VERSION)['no_tools']);
    expect(processed.llmRequest.messages).toEqual(source);
  });
});

describe('tool loop · native search cap', () => {
  it('reports the limit once the turn has grounded its allowance', async () => {
    const cap = resolveNativeSearchMaxUses(false);
    factoryMocks.streamRequest.mockResolvedValueOnce(groundedStream(cap));

    const output = await collect(
      runToolLoop(makeProcessed([NATIVE_SEARCH_TOOL]), { approvalMode: 'auto' }),
    );

    expect(offeredToolNames(0)).toContain('anthropic-server');
    expect(output).toContain('Search limit reached');
    // Reported once for the turn, however many groundings tripped it.
    expect(output.match(/native-search-cap:/g)).toHaveLength(1);
  });

  it('says nothing while the turn is still inside its allowance', async () => {
    const cap = resolveNativeSearchMaxUses(false);
    factoryMocks.streamRequest.mockResolvedValueOnce(groundedStream(cap - 1));

    const output = await collect(
      runToolLoop(makeProcessed([NATIVE_SEARCH_TOOL]), { approvalMode: 'auto' }),
    );

    expect(output).not.toContain('Search limit reached');
  });

  it('leaves grounding on offer for a turn that never grounded', async () => {
    factoryMocks.streamRequest.mockResolvedValue(finalAnswerStream('Answered from memory.'));

    await collect(runToolLoop(makeProcessed([NATIVE_SEARCH_TOOL]), { approvalMode: 'auto' }));

    expect(offeredToolNames(0)).toContain('anthropic-server');
  });
});

describe('tool loop · a tool the turn did not offer', () => {
  it('refuses it without asking for approval, as a CLI turn in plan mode needs', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(
        toolCallStream(
          'edit_file',
          { path: 'README.md', old_string: 'a', new_string: 'b' },
          'call_unoffered',
        ),
      )
      .mockResolvedValueOnce(finalAnswerStream('Here is the plan instead.'));

    const processed = makeProcessed([webSearchToolDef()]);
    processed.chatSurface = 'cli';

    const output = await collect(runToolLoop(processed, { approvalMode: 'manual' }));

    expect(output).not.toContain('x_tool_approval_request');
    expect(output).not.toContain('approval-requested');
    expect(output).toContain('is not available on this turn and was not run');
    expect(output).toContain('Here is the plan instead.');
  });
});
