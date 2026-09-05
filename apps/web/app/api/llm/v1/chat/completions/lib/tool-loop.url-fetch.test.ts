import { beforeEach, describe, it, expect, vi } from 'vitest';

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

import { runToolLoop, fetchSourcesEvent } from './tool-loop';
import type { ProcessedRequest } from './request-processor';
import { urlFetchToolDef, URL_FETCH_MAX_CALLS_PER_TURN } from '@/lib/url-fetch/url-fetch-tool';

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

function toolCallStream(url: string): ReadableStream<Uint8Array> {
  return sseStream([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_url_fetch_1',
                type: 'function',
                function: { name: 'url_fetch', arguments: JSON.stringify({ url }) },
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

function makeProcessed(): ProcessedRequest {
  return {
    provider: 'openai',
    requestedModel: 'test-model',
    llmRequest: {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Summarize https://example.com/' }],
      max_tokens: 256,
      stream: true,
      tools: [urlFetchToolDef()],
    },
  } as unknown as ProcessedRequest;
}

async function collect(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const chunk of gen) out += decoder.decode(chunk);
  return out;
}

const PAGE_HTML =
  '<html><head><title>Example Domain</title></head><body><main>' +
  '<h1>Example Domain</h1><p>This domain is for use in illustrative examples in documents. ' +
  'You may use this domain in literature without prior coordination or asking for permission.</p>' +
  '</main></body></html>';

beforeEach(() => {
  dnsMocks.lookup.mockReset();
  factoryMocks.streamRequest.mockReset();
  dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

describe('tool-loop url_fetch integration', () => {
  it('executes a model-emitted url_fetch call end-to-end and emits sources', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(toolCallStream('https://example.com/'))
      .mockResolvedValueOnce(finalAnswerStream('The page describes the example domain. [1]'));

    const fetchMock = vi.fn(
      async () =>
        new Response(PAGE_HTML, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const output = await collect(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

      expect(output).toContain('"x_tool_status"');
      expect(output).toContain('"name":"url_fetch"');
      expect(output).toContain('"status_phrase":"Fetching example.com"');
      expect(output).toContain('"status":"completed"');

      expect(output).toContain('"x_tool_result"');
      expect(output).toContain('illustrative examples');
      expect(output).not.toContain('<html>');

      expect(output).toContain('"x_search_results"');
      expect(output).toContain('"tool":"url_fetch"');
      expect(output).toContain('"type":"web_search_result"');
      expect(output).toContain('"url":"https://example.com/"');
      expect(output).toContain('"title":"Example Domain"');
      expect(output).toContain('"position":1');

      expect(output).toContain('The page describes the example domain. [1]');
      expect(output).toContain('data: [DONE]');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe('https://example.com/');

      expect(factoryMocks.streamRequest).toHaveBeenCalledTimes(2);
      const secondRequest = factoryMocks.streamRequest.mock.calls[1]?.[2] as {
        messages: Array<{ role: string; content: string; tool_call_id?: string }>;
      };
      const toolMsg = secondRequest.messages.find((m) => m.role === 'tool');
      expect(toolMsg?.tool_call_id).toBe('call_url_fetch_1');
      expect(toolMsg?.content).toContain('Example Domain');
      expect(toolMsg?.content).toContain('illustrative examples');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns an honest error result to the model for a blocked (SSRF) URL', async () => {
    factoryMocks.streamRequest
      .mockResolvedValueOnce(toolCallStream('http://169.254.169.254/latest/meta-data/'))
      .mockResolvedValueOnce(finalAnswerStream('I could not fetch that URL, it is not allowed.'));

    const fetchMock = vi.fn(async () => new Response('should never run', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      const output = await collect(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

      expect(output).toContain('"status":"failed"');
      expect(output).toContain('Fetch failed (url_not_allowed)');
      expect(output).not.toContain('"x_search_results"');
      expect(fetchMock).not.toHaveBeenCalled();

      const secondRequest = factoryMocks.streamRequest.mock.calls[1]?.[2] as {
        messages: Array<{ role: string; content: string }>;
      };
      const toolMsg = secondRequest.messages.find((m) => m.role === 'tool');
      expect(toolMsg?.content).toContain('url_not_allowed');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('emits cumulative sources with stable positions across multiple fetches', () => {
    const line = fetchSourcesEvent(
      [
        { url: 'https://a.example/', title: 'A' },
        { url: 'https://b.example/', title: 'B' },
      ],
      'test-model',
    );
    const parsed = JSON.parse(line.replace(/^data: /, '').trim()) as {
      choices: Array<{
        delta: {
          x_search_results: {
            tool: string;
            content: Array<{ type: string; url: string; title: string; position: number }>;
          };
        };
      }>;
    };
    const block = parsed.choices[0]!.delta.x_search_results;
    expect(block.tool).toBe('url_fetch');
    expect(block.content).toEqual([
      { type: 'web_search_result', url: 'https://a.example/', title: 'A', position: 1 },
      { type: 'web_search_result', url: 'https://b.example/', title: 'B', position: 2 },
    ]);
  });
  it(`stops fetching after ${URL_FETCH_MAX_CALLS_PER_TURN} pages so one turn cannot amass an unbounded source list`, async () => {
    const attempts = URL_FETCH_MAX_CALLS_PER_TURN + 8;
    for (let i = 0; i < attempts; i++) {
      factoryMocks.streamRequest.mockResolvedValueOnce(
        sseStream([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: `call_url_fetch_budget_${i}`,
                      type: 'function',
                      function: {
                        name: 'url_fetch',
                        arguments: JSON.stringify({ url: `https://site${i}.example/` }),
                      },
                    },
                  ],
                },
                index: 0,
              },
            ],
            model: 'test-model',
          },
          { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }], model: 'test-model' },
        ]),
      );
    }
    factoryMocks.streamRequest.mockResolvedValueOnce(
      finalAnswerStream('Answering from what I read.'),
    );

    const fetchMock = vi.fn(
      async () =>
        new Response(PAGE_HTML, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const output = await collect(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

      expect(fetchMock).toHaveBeenCalledTimes(URL_FETCH_MAX_CALLS_PER_TURN);
      expect(output).toContain('Fetch budget reached');

      const emitted = output
        .split('\n')
        .filter((line) => line.startsWith('data: {'))
        .flatMap((line) => {
          const payload = JSON.parse(line.slice('data: '.length)) as {
            choices?: Array<{ delta?: { x_search_results?: { content?: unknown[] } } }>;
          };
          const content = payload.choices?.[0]?.delta?.x_search_results?.content;
          return Array.isArray(content) ? [content.length] : [];
        });
      expect(emitted.length).toBeGreaterThan(0);
      expect(Math.max(...emitted)).toBeLessThanOrEqual(URL_FETCH_MAX_CALLS_PER_TURN);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
