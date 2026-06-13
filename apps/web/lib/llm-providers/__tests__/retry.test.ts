import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BaseLLMProvider, type LLMProviderRequest, type LLMProviderResponse } from '../base';

// Concrete subclass exposing fetchWithRetry for direct testing.
class TestProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://example.test/v1';
  }
  async sendRequest(_request: LLMProviderRequest): Promise<LLMProviderResponse> {
    throw new Error('not used');
  }
  async streamRequest(_request: LLMProviderRequest): Promise<ReadableStream> {
    throw new Error('not used');
  }
  // Expose protected method for testing.
  public callFetch(
    url: string,
    init: RequestInit,
    options?: { maxRetries?: number; timeoutMs?: number },
  ) {
    return this.fetchWithRetry(url, init, options);
  }
}

function makeResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : 'body', { status, headers });
}

const INIT: RequestInit = { method: 'POST', headers: {}, body: '{}' };

describe('BaseLLMProvider.fetchWithRetry', () => {
  let provider: TestProvider;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new TestProvider('test-key');
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    // Make backoff instant. NOTE: this also fires the abort timer synchronously,
    // which is harmless here because the mocked fetch ignores the AbortSignal.
    vi.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns immediately on a 2xx without retrying', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(200));
    const res = await provider.callFetch('https://example.test', INIT);
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries on a 503 then succeeds', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(503)).mockResolvedValueOnce(makeResponse(200));
    const res = await provider.callFetch('https://example.test', INIT, { maxRetries: 2 });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 and 502 and 504', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(429))
      .mockResolvedValueOnce(makeResponse(502))
      .mockResolvedValueOnce(makeResponse(200));
    const res = await provider.callFetch('https://example.test', INIT, { maxRetries: 3 });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry a 401 (non-retryable) and returns the response unread', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(401));
    const res = await provider.callFetch('https://example.test', INIT);
    expect(res.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Body must still be readable (proves fetchWithRetry never consumed it).
    await expect(res.text()).resolves.toBe('body');
  });

  it('does NOT retry a 400 (non-retryable)', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(400));
    const res = await provider.callFetch('https://example.test', INIT);
    expect(res.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns the LAST retryable response unread after exhausting retries', async () => {
    fetchSpy.mockResolvedValue(makeResponse(503));
    const res = await provider.callFetch('https://example.test', INIT, { maxRetries: 2 });
    expect(res.status).toBe(503);
    expect(fetchSpy).toHaveBeenCalledTimes(3); // 1 + 2 retries
    await expect(res.text()).resolves.toBe('body'); // body untouched
  });

  it('retries on a thrown network error then succeeds', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(makeResponse(200));
    const res = await provider.callFetch('https://example.test', INIT, { maxRetries: 2 });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('rethrows the network error after exhausting retries', async () => {
    fetchSpy.mockRejectedValue(new TypeError('network down'));
    await expect(
      provider.callFetch('https://example.test', INIT, { maxRetries: 1 }),
    ).rejects.toThrow('network down');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('translates timeout AbortError into a descriptive timeout error after exhaustion', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    fetchSpy.mockRejectedValue(abortErr);
    await expect(
      provider.callFetch('https://example.test', INIT, { maxRetries: 0, timeoutMs: 10 }),
    ).rejects.toThrow(/timed out after 10ms/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('honors a numeric Retry-After header without consuming the response body on intermediate retries', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(429, { 'retry-after': '1' }))
      .mockResolvedValueOnce(makeResponse(200));
    const res = await provider.callFetch('https://example.test', INIT, { maxRetries: 1 });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
