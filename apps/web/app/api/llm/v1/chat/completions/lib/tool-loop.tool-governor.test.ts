import { beforeEach, describe, it, expect, vi } from 'vitest';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
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
}));
vi.mock('@/lib/server/code-execution-policy', () => ({
  isCloudCodeExecutionEnabled: async () => true,
}));

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';
import { webSearchToolDef, WEB_SEARCH_TOOL } from '@/lib/web-search/web-search-tool';
import { e2bExecutionToolDefs, EXECUTE_CODE_TOOL } from '@/lib/e2b/execution-tools';
import { functionToolName } from './tool-loop-routing';

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

function offeredToolNames(callIndex: number): string[] {
  const request = factoryMocks.streamRequest.mock.calls[callIndex]?.[2] as
    | { tools?: unknown[] }
    | undefined;
  return (request?.tools ?? []).map(functionToolName).filter(Boolean);
}

beforeEach(() => {
  factoryMocks.streamRequest.mockReset();
  dnsMocks.lookup.mockReset();
  dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  e2bMocks.cause = 'no-capacity';
  e2bMocks.cutover = true;
});

describe('tool loop · repeated query breaker', () => {
  it('runs a query once, refuses the repeat, and stops offering search', async () => {
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
      expect(offeredToolNames(1)).toContain(WEB_SEARCH_TOOL);
      expect(offeredToolNames(2)).not.toContain(WEB_SEARCH_TOOL);
      expect(output).toContain('Here is the comparison.');
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe('tool loop · unavailable tool withdrawal', () => {
  it('names the cause once and stops offering the execution tool', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(toolCallStream(EXECUTE_CODE_TOOL, { code: 'print(1)' }, 'call_x1'))
      .mockResolvedValueOnce(finalAnswerStream('Answered without running code.'));

    const output = await collect(
      runToolLoop(makeProcessed(e2bExecutionToolDefs()), { approvalMode: 'auto' }),
    );

    expect(output).toContain('no sandbox was available for this account right now');
    expect(offeredToolNames(0)).toContain(EXECUTE_CODE_TOOL);
    expect(offeredToolNames(1)).not.toContain(EXECUTE_CODE_TOOL);
    expect(output).toContain('Answered without running code.');
  });

  it('names a deployment configuration cause when the sandbox is not configured', async () => {
    e2bMocks.cause = 'not-configured';
    factoryMocks.streamRequest
      .mockResolvedValueOnce(toolCallStream(EXECUTE_CODE_TOOL, { code: 'print(1)' }, 'call_x2'))
      .mockResolvedValueOnce(finalAnswerStream('Answered without running code.'));

    const output = await collect(
      runToolLoop(makeProcessed(e2bExecutionToolDefs()), { approvalMode: 'auto' }),
    );

    expect(output).toContain('code execution is not configured on this deployment');
  });
});
