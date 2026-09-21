import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoogleEmbeddingError, embedTextsWithGoogle } from '@/lib/server/google-embeddings';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/server/provider-endpoints', () => ({
  providerApiUrl: (provider: string, suffix: string) =>
    `https://example.invalid/${provider}/${suffix}`,
}));

function abortError(name: 'TimeoutError' | 'AbortError'): Error {
  const error = new Error('The operation was aborted');
  error.name = name;
  return error;
}

const embed = () =>
  embedTextsWithGoogle({ apiKey: 'test-key', providerModelId: 'embedding-model', inputs: ['one'] });

describe('the embedding client bounds its wait and types the failure', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('carries a deadline, which is what stops a provider holding the request path', async () => {
    const calls: RequestInit[] = [];
    globalThis.fetch = vi.fn((_input: unknown, init: RequestInit) => {
      calls.push(init);
      return Promise.reject(abortError('TimeoutError'));
    }) as unknown as typeof fetch;

    await expect(embed()).rejects.toBeInstanceOf(GoogleEmbeddingError);
    expect(calls[0]?.signal, 'the embedding call must carry a deadline').toBeInstanceOf(
      AbortSignal,
    );
  });

  it.each(['TimeoutError', 'AbortError'] as const)(
    'reports a %s as the typed error both callers already branch on',
    async (name) => {
      globalThis.fetch = vi.fn(() => Promise.reject(abortError(name))) as unknown as typeof fetch;

      await expect(embed()).rejects.toMatchObject({
        name: 'GoogleEmbeddingError',
        status: 504,
      });
    },
  );

  it('lets a failure that is not a deadline through unchanged, so nothing is mislabelled', async () => {
    const network = new TypeError('fetch failed');
    globalThis.fetch = vi.fn(() => Promise.reject(network)) as unknown as typeof fetch;

    await expect(embed()).rejects.toBe(network);
  });
});

/**
 * These two read the source rather than driving the call: each site sits behind
 * an installation token exchange or a tool loop, and what is being proved is
 * that no site was left out, which is a property of the set and not of one call.
 */
describe('every provider client site carries a deadline', () => {
  const read = (relative: string) =>
    readFileSync(path.join(process.cwd(), 'lib', relative), 'utf8');

  const fetchInits = (source: string): string[] => {
    const inits: string[] = [];
    const call = /\bfetch\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = call.exec(source)) !== null) {
      let index = call.lastIndex;
      let depth = 1;
      while (index < source.length && depth > 0) {
        if (source[index] === '(') depth += 1;
        else if (source[index] === ')') depth -= 1;
        index += 1;
      }
      inits.push(source.slice(call.lastIndex, index - 1));
      call.lastIndex = index;
    }
    return inits;
  };

  it('github-app calls GitHub sixteen times and none of them waits without a ceiling', () => {
    const inits = fetchInits(read('github-app.ts'));
    expect(inits.length).toBeGreaterThanOrEqual(16);
    for (const init of inits) {
      expect(init, init.slice(0, 80)).toContain(
        'signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS)',
      );
    }
  });

  it('container-files downloads three provider files and each one is bounded', () => {
    const inits = fetchInits(read('server/container-files.ts'));
    expect(inits).toHaveLength(3);
    for (const init of inits) {
      expect(init, init.slice(0, 80)).toContain(
        'signal: AbortSignal.timeout(CONTAINER_FILE_TIMEOUT_MS)',
      );
    }
  });
});
