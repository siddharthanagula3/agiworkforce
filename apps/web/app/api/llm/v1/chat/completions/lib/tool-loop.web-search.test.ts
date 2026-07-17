/**
 * Integration test: web_search (WP4 generic tool) through the REAL tool-loop
 * dispatch. Mirrors tool-loop.url-fetch.test.ts's pattern exactly.
 *
 * Proves the full agentic path with mocked HTTP + provider:
 *   model emits a web_search tool_call → the loop executes the real
 *   executeWebSearch (fetch mocked, hitting Perplexity's Search API shape) →
 *   the tool result returns to the model on the next step → a cumulative
 *   x_search_results source event is emitted in the web_search shape (NO
 *   `tool` field, snippet mapped to encrypted_content — matching
 *   research-loop.ts's SourceAggregator, NOT fetchSourcesEvent's
 *   tool:'url_fetch' shape) → the final answer streams and terminates with
 *   [DONE].
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

// DNS mock for the third test's url_fetch call — its SSRF guard
// (assertResolvedPublicHostname) does a real node:dns/promises.lookup;
// mirrors tool-loop.url-fetch.test.ts's setup exactly.
const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

// Mock the table-driven adapter dispatch seam the loop calls per step:
// buildToolLoopStream(provider, processed, stepRequest, responseModel, sink)
// — the same seam tool-loop.url-fetch.test.ts mocks.
const factoryMocks = vi.hoisted(() => ({ streamRequest: vi.fn() }));
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: factoryMocks.streamRequest,
}));

import { runToolLoop, searchResultsEvent } from './tool-loop';
import type { ProcessedRequest } from './request-processor';
import { webSearchToolDef } from '@/lib/web-search/web-search-tool';

/** Build a provider SSE ReadableStream from data lines. */
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

function makeProcessed(tools: unknown[]): ProcessedRequest {
  return {
    provider: 'xai',
    requestedModel: 'test-model',
    llmRequest: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'What happened in the news today?' }],
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
      const output = await collect(
        runToolLoop(makeProcessed([webSearchToolDef()]), { approvalMode: 'auto' }),
      );

      // 1. Timeline: running with the "Searching the web" phrase, then completed.
      expect(output).toContain('"x_tool_status"');
      expect(output).toContain('"name":"web_search"');
      expect(output).toContain('"status_phrase":"Searching the web"');
      expect(output).toContain('"status":"completed"');

      // 2. Tool result event with the formatted search results.
      expect(output).toContain('"x_tool_result"');
      expect(output).toContain('Today in the news');
      expect(output).toContain('news.example/today');

      // 3. Source joined the WEB_SEARCH citations flow — NOT url_fetch's shape:
      //    no `tool` field, snippet mapped to encrypted_content.
      expect(output).toContain('"x_search_results"');
      expect(output).not.toContain('"tool":"url_fetch"');
      expect(output).toContain('"type":"web_search_result"');
      expect(output).toContain('"url":"https://news.example/today"');
      expect(output).toContain('"title":"Today in the news"');
      expect(output).toContain('"encrypted_content":"A summary of the top stories."');
      expect(output).toContain('"position":1');

      // 4. Final answer streamed and the stream terminated — NOT via x_stream_error
      //    (that path is turn-terminating and reserved for whole-provider-call
      //    failures, not a single tool's result).
      expect(output).not.toContain('"x_stream_error"');
      expect(output).toContain("Here's what happened today. [1]");
      expect(output).toContain('data: [DONE]');

      // 5. The real Perplexity Search API call was made exactly once, with the
      //    model's query and the configured key.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, init] = fetchMock.mock.calls[0]!;
      expect(calledUrl).toBe('https://api.perplexity.ai/search');
      expect(JSON.parse(init!.body as string)).toEqual({ query: 'today news', max_results: 8 });
      expect((init!.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer pplx-test-key',
      );

      // 6. The second model call received the tool result message so the model
      //    could ground its answer.
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

  it('returns an honest tool-result error (not x_stream_error) when the search backend is not configured — the turn continues, not terminates', async () => {
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

      // Loop continued to a second model call with the error fed back — proves
      // this is the recoverable tool-result path, not the turn-terminating
      // provider-error path.
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
        runToolLoop(makeProcessed([webSearchToolDef()]), { approvalMode: 'auto' }),
      );

      // Two independent x_search_results events: one tagged url_fetch, one untagged.
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
