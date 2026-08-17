import { describe, expect, it, vi } from 'vitest';
import { executeUrlFetch } from '@/lib/url-fetch/url-fetch-tool';
import { executeWebSearch } from '@/lib/web-search/web-search-tool';

describe('url_fetch cancellation', () => {
  it('never opens a connection once the caller has already stopped the turn', async () => {
    const fetchImpl = vi.fn();
    const controller = new AbortController();
    controller.abort();

    const outcome = await executeUrlFetch(
      { url: 'https://example.com/doc' },
      { fetchImpl: fetchImpl as unknown as typeof fetch, signal: controller.signal },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      ok: false,
      errorCode: 'cancelled',
      error: 'The request was cancelled.',
    });
  });

  it("aborts an in-flight fetch when the caller's signal fires", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          controller.abort();
        }),
    );

    const outcome = await executeUrlFetch(
      { url: 'https://example.com/doc' },
      { fetchImpl: fetchImpl as unknown as typeof fetch, signal: controller.signal },
    );

    expect(outcome).toEqual({
      ok: false,
      errorCode: 'cancelled',
      error: 'The request was cancelled.',
    });
  });
});

describe('web_search cancellation', () => {
  it('never calls the search provider once the caller has already stopped the turn', async () => {
    const fetchImpl = vi.fn();
    const controller = new AbortController();
    controller.abort();

    const outcome = await executeWebSearch(
      { query: 'anything' },
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: 'test-key',
        signal: controller.signal,
      },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      ok: false,
      errorCode: 'cancelled',
      error: 'The request was cancelled.',
    });
  });

  it("aborts an in-flight search when the caller's signal fires", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          controller.abort();
        }),
    );

    const outcome = await executeWebSearch(
      { query: 'anything' },
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: 'test-key',
        signal: controller.signal,
      },
    );

    expect(outcome).toEqual({
      ok: false,
      errorCode: 'cancelled',
      error: 'The request was cancelled.',
    });
  });
});
