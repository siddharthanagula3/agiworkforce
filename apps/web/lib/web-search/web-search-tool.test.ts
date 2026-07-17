/**
 * Unit tests for the platform web_search tool.
 *
 * Covers tool identity/definition, missing-config handling, input validation,
 * the happy path against Perplexity's Search API response shape, malformed
 * upstream entries (salvage-not-fail), HTTP error passthrough, timeout, and
 * the model-facing formatter / FetchedSource mapping. All HTTP is mocked —
 * mirrors url-fetch-tool.test.ts's conventions.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  executeWebSearch,
  webSearchToolDef,
  isWebSearchTool,
  webSearchBackendConfigured,
  formatWebSearchResultForModel,
  webSearchResultsToFetchedSources,
  WEB_SEARCH_TOOL,
  type WebSearchOutcome,
} from './web-search-tool';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function fetchReturning(response: Response): typeof fetch {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

describe('tool identity and definition', () => {
  it('webSearchToolDef exposes a function tool named web_search requiring query', () => {
    const def = webSearchToolDef();
    expect(def.type).toBe('function');
    expect(def.function.name).toBe(WEB_SEARCH_TOOL);
    expect((def.function.parameters['required'] as string[]).includes('query')).toBe(true);
  });

  it('isWebSearchTool matches only the exact tool name', () => {
    expect(isWebSearchTool('web_search')).toBe(true);
    expect(isWebSearchTool('search_web')).toBe(false);
    expect(isWebSearchTool('web_search_preview')).toBe(false);
  });
});

describe('webSearchBackendConfigured', () => {
  it('is false with no key available', () => {
    expect(webSearchBackendConfigured({ apiKey: undefined })).toBe(false);
  });

  it('is true when an api key is provided', () => {
    expect(webSearchBackendConfigured({ apiKey: 'pplx-test-key' })).toBe(true);
  });
});

describe('executeWebSearch — configuration and input validation', () => {
  const neverFetch = vi.fn(async () => {
    throw new Error('fetch must not be called');
  }) as unknown as typeof fetch;

  it('rejects a missing query without issuing a request', async () => {
    const outcome = await executeWebSearch({}, { fetchImpl: neverFetch, apiKey: 'k' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe('invalid_tool_input');
    expect(neverFetch).not.toHaveBeenCalled();
  });

  it('rejects an empty/whitespace-only query without issuing a request', async () => {
    const outcome = await executeWebSearch(
      { query: '   ' },
      { fetchImpl: neverFetch, apiKey: 'k' },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe('invalid_tool_input');
  });

  it('reports not_configured (never fetches) when no API key is available anywhere', async () => {
    const outcome = await executeWebSearch(
      { query: 'test' },
      { fetchImpl: neverFetch, apiKey: undefined },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.errorCode).toBe('not_configured');
      expect(outcome.error).toMatch(/PERPLEXITY_API_KEY/);
    }
    expect(neverFetch).not.toHaveBeenCalled();
  });
});

describe('executeWebSearch — happy path', () => {
  it('parses Perplexity Search API results into WebSearchResultItem[]', async () => {
    const fetchImpl = fetchReturning(
      jsonResponse({
        id: 'abc-123',
        results: [
          {
            title: 'Example result',
            url: 'https://example.com/a',
            snippet: 'A short snippet.',
            date: '2026-07-01',
            last_updated: '2026-07-10',
          },
          {
            title: 'Second result',
            url: 'https://example.com/b',
            snippet: 'Another snippet.',
            date: null,
          },
        ],
        server_time: '2026-07-11T00:00:00Z',
      }),
    );

    const outcome = await executeWebSearch(
      { query: 'agi workforce' },
      { fetchImpl, apiKey: 'pplx-test-key' },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.query).toBe('agi workforce');
    expect(outcome.results).toHaveLength(2);
    expect(outcome.results[0]).toEqual({
      url: 'https://example.com/a',
      title: 'Example result',
      snippet: 'A short snippet.',
      date: '2026-07-01',
    });
    // null date on the second entry must not survive as a `date` key.
    expect(outcome.results[1]?.date).toBeUndefined();

    // Auth + body shape sent to the real Perplexity Search endpoint.
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.perplexity.ai/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer pplx-test-key' }),
      }),
    );
    const call = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as
      | [string, RequestInit]
      | undefined;
    expect(call).toBeDefined();
    const body = JSON.parse(call![1].body as string);
    expect(body).toEqual({ query: 'agi workforce', max_results: 8 });
  });

  it('salvages valid entries and drops malformed ones (missing url)', async () => {
    const fetchImpl = fetchReturning(
      jsonResponse({
        results: [
          { title: 'Good', url: 'https://example.com/good', snippet: 's' },
          { title: 'No URL' }, // malformed — dropped, not fatal
          { url: 'https://example.com/no-title' }, // falls back title=url
        ],
      }),
    );

    const outcome = await executeWebSearch({ query: 'x' }, { fetchImpl, apiKey: 'k' });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.results).toHaveLength(2);
    expect(outcome.results[1]).toEqual({
      url: 'https://example.com/no-title',
      title: 'https://example.com/no-title',
      snippet: '',
    });
  });

  it('returns an empty (still ok:true) result set when Perplexity finds nothing', async () => {
    const fetchImpl = fetchReturning(jsonResponse({ results: [] }));
    const outcome = await executeWebSearch({ query: 'x' }, { fetchImpl, apiKey: 'k' });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.results).toEqual([]);
  });
});

describe('executeWebSearch — failure modes', () => {
  it('reports upstream_error on a non-2xx HTTP response', async () => {
    const fetchImpl = fetchReturning(
      new Response('unauthorized', { status: 401, headers: { 'content-type': 'text/plain' } }),
    );
    const outcome = await executeWebSearch({ query: 'x' }, { fetchImpl, apiKey: 'bad-key' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.errorCode).toBe('upstream_error');
      expect(outcome.error).toMatch(/401/);
    }
  });

  it('reports upstream_error on malformed JSON', async () => {
    const fetchImpl = fetchReturning(
      new Response('not json{{{', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const outcome = await executeWebSearch({ query: 'x' }, { fetchImpl, apiKey: 'k' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe('upstream_error');
  });

  it('reports timeout when the request is aborted', async () => {
    const hangingFetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;

    const outcome = await executeWebSearch(
      { query: 'x' },
      { fetchImpl: hangingFetch, apiKey: 'k', timeoutMs: 5 },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe('timeout');
  });
});

describe('formatWebSearchResultForModel', () => {
  it('formats a successful outcome as a numbered list with snippets', () => {
    const outcome: WebSearchOutcome = {
      ok: true,
      query: 'test query',
      results: [
        { url: 'https://example.com/a', title: 'A', snippet: 'snip a', date: '2026-07-01' },
        { url: 'https://example.com/b', title: 'B', snippet: '' },
      ],
    };
    const text = formatWebSearchResultForModel(outcome);
    expect(text).toContain('Search results for "test query"');
    expect(text).toContain('1. A (2026-07-01)');
    expect(text).toContain('https://example.com/a');
    expect(text).toContain('snip a');
    expect(text).toContain('2. B');
  });

  it('formats a no-results outcome honestly', () => {
    const outcome: WebSearchOutcome = { ok: true, query: 'nothing here', results: [] };
    expect(formatWebSearchResultForModel(outcome)).toBe('No results found for "nothing here".');
  });

  it('formats a failure outcome with the error code', () => {
    const outcome: WebSearchOutcome = {
      ok: false,
      errorCode: 'not_configured',
      error: 'missing key',
    };
    const text = formatWebSearchResultForModel(outcome);
    expect(text).toContain('not_configured');
    expect(text).toContain('missing key');
  });
});

describe('webSearchResultsToFetchedSources', () => {
  it('maps results to {url,title,snippet} — snippet carried through for the encrypted_content mapping tool-loop.ts applies', () => {
    const outcome: WebSearchOutcome = {
      ok: true,
      query: 'q',
      results: [
        { url: 'https://example.com/a', title: 'A', snippet: 's' },
        { url: 'https://example.com/b', title: 'B', snippet: '' },
      ],
    };
    expect(webSearchResultsToFetchedSources(outcome)).toEqual([
      { url: 'https://example.com/a', title: 'A', snippet: 's' },
      { url: 'https://example.com/b', title: 'B' },
    ]);
  });

  it('returns an empty array for a failed outcome', () => {
    const outcome: WebSearchOutcome = { ok: false, errorCode: 'timeout', error: 'x' };
    expect(webSearchResultsToFetchedSources(outcome)).toEqual([]);
  });
});
