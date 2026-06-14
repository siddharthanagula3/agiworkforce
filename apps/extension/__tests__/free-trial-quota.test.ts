/**
 * Tests for apps/extension/src/features/cloud-bridge/freeTrialClient.ts
 *
 * Covers:
 *   - Constants: FREE_TRIAL_PROMPT_LIMIT, FREE_TRIAL_MODEL, FREE_TRIAL_ENDPOINT
 *   - Auth: getAuthToken (session → local fallback → null), storeSessionToken, clearAuthToken
 *   - Quota helpers: getFreePromptsUsed, getRemainingFreePrompts
 *   - streamFreeChat: happy-path SSE streaming, quota_exceeded (403), auth_required (401),
 *     server_error (5xx), network failure, abort, input truncation, [DONE] sentinel,
 *     inline stream error, post-stream done without [DONE]
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Chrome storage shim — hoisted before module imports
// ---------------------------------------------------------------------------

const chromeMock = vi.hoisted(() => {
  const localStore: Record<string, unknown> = {};
  const sessionStore: Record<string, unknown> = {};

  const mock = {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]): Promise<Record<string, unknown>> => {
          const result: Record<string, unknown> = {};
          const keyList = Array.isArray(keys) ? keys : [keys];
          for (const k of keyList) {
            if (k in localStore) result[k] = localStore[k];
          }
          return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>): Promise<void> => {
          Object.assign(localStore, items);
        }),
        remove: vi.fn(async (keys: string[]): Promise<void> => {
          for (const k of keys) delete localStore[k];
        }),
      },
      session: {
        get: vi.fn(async (keys: string[]): Promise<Record<string, unknown>> => {
          const result: Record<string, unknown> = {};
          for (const k of keys) {
            if (k in sessionStore) result[k] = sessionStore[k];
          }
          return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>): Promise<void> => {
          Object.assign(sessionStore, items);
        }),
        remove: vi.fn(async (keys: string[]): Promise<void> => {
          for (const k of keys) delete sessionStore[k];
        }),
      },
    },
    _localStore: localStore,
    _sessionStore: sessionStore,
  };

  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
});

// ---------------------------------------------------------------------------
// fetch stub — hoisted
// ---------------------------------------------------------------------------

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// ---------------------------------------------------------------------------
// Imports — after mock hoisting
// ---------------------------------------------------------------------------

import {
  FREE_TRIAL_PROMPT_LIMIT,
  FREE_TRIAL_MODEL,
  FREE_TRIAL_ENDPOINT,
  FREE_PROMPTS_USED_KEY,
  getAuthToken,
  storeSessionToken,
  clearAuthToken,
  getFreePromptsUsed,
  getRemainingFreePrompts,
  streamFreeChat,
  type FreeTrialMessage,
  type FreeTrialChunk,
} from '../src/features/cloud-bridge/freeTrialClient';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Collect all chunks from the async generator. */
async function collectChunks(gen: AsyncGenerator<FreeTrialChunk>): Promise<FreeTrialChunk[]> {
  const chunks: FreeTrialChunk[] = [];
  for await (const chunk of gen) {
    chunks.push(chunk);
  }
  return chunks;
}

/** Build a fake SSE ReadableStream from a list of data payloads. */
function makeSseStream(dataLines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = dataLines.map((d) => `data: ${d}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
}

/** Construct a fake Response with a body stream. */
function makeStreamResponse(dataLines: string[], status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: makeSseStream(dataLines),
    text: vi.fn().mockResolvedValue(''),
  } as unknown as Response;
}

/** Construct a fake error Response (no body stream). */
function makeErrorResponse(status: number, bodyText: string): Response {
  return {
    ok: false,
    status,
    body: null,
    text: vi.fn().mockResolvedValue(bodyText),
  } as unknown as Response;
}

const SAMPLE_MESSAGES: FreeTrialMessage[] = [{ role: 'user', content: 'Hello!' }];

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Clear all storage
  for (const k of Object.keys(chromeMock._localStore)) delete chromeMock._localStore[k];
  for (const k of Object.keys(chromeMock._sessionStore)) delete chromeMock._sessionStore[k];
  vi.clearAllMocks();
  // Re-install chrome global after clearAllMocks resets mocks
  (globalThis as Record<string, unknown>).chrome = chromeMock;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('FREE_TRIAL_PROMPT_LIMIT is 3', () => {
    expect(FREE_TRIAL_PROMPT_LIMIT).toBe(3);
  });

  it('FREE_TRIAL_MODEL is a non-empty string read from models.json', () => {
    expect(typeof FREE_TRIAL_MODEL).toBe('string');
    expect(FREE_TRIAL_MODEL.length).toBeGreaterThan(0);
    // Must not be a hardcoded sentinel — should contain known economy model name fragments
    // (gemini, gpt-mini, flash, etc.)
    expect(FREE_TRIAL_MODEL).toMatch(/flash|mini|lite|haiku|turbo|economy/i);
  });

  it('FREE_TRIAL_ENDPOINT points at agiworkforce.com web app (not api.agiworkforce.com)', () => {
    expect(FREE_TRIAL_ENDPOINT).toContain('agiworkforce.com/api/llm/v1/chat/completions');
    expect(FREE_TRIAL_ENDPOINT).not.toContain('api.agiworkforce.com');
  });
});

// ---------------------------------------------------------------------------
// Auth: getAuthToken
// ---------------------------------------------------------------------------

describe('getAuthToken', () => {
  it('returns null when both stores are empty', async () => {
    expect(await getAuthToken()).toBeNull();
  });

  it('returns session token when agi_clerk_session_token is set', async () => {
    chromeMock._sessionStore['agi_clerk_session_token'] = 'sess-token-abc';
    expect(await getAuthToken()).toBe('sess-token-abc');
  });

  it('falls back to local dev token when session is empty', async () => {
    chromeMock._localStore['agi_dev_bearer_token'] = 'dev-token-xyz';
    expect(await getAuthToken()).toBe('dev-token-xyz');
  });

  it('prefers session token over local dev token', async () => {
    chromeMock._sessionStore['agi_clerk_session_token'] = 'sess-token';
    chromeMock._localStore['agi_dev_bearer_token'] = 'dev-token';
    expect(await getAuthToken()).toBe('sess-token');
  });

  it('ignores empty string tokens', async () => {
    chromeMock._sessionStore['agi_clerk_session_token'] = '';
    chromeMock._localStore['agi_dev_bearer_token'] = '';
    expect(await getAuthToken()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Auth: storeSessionToken
// ---------------------------------------------------------------------------

describe('storeSessionToken', () => {
  it('writes to session storage when available', async () => {
    await storeSessionToken('my-token');
    expect(chromeMock._sessionStore['agi_clerk_session_token']).toBe('my-token');
  });
});

// ---------------------------------------------------------------------------
// Auth: clearAuthToken
// ---------------------------------------------------------------------------

describe('clearAuthToken', () => {
  it('removes both session and local tokens', async () => {
    chromeMock._sessionStore['agi_clerk_session_token'] = 'sess';
    chromeMock._localStore['agi_dev_bearer_token'] = 'dev';
    await clearAuthToken();
    expect(chromeMock._sessionStore['agi_clerk_session_token']).toBeUndefined();
    expect(chromeMock._localStore['agi_dev_bearer_token']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Quota: getFreePromptsUsed / getRemainingFreePrompts
// ---------------------------------------------------------------------------

describe('getFreePromptsUsed', () => {
  it('returns 0 when counter is unset', async () => {
    expect(await getFreePromptsUsed()).toBe(0);
  });

  it('returns the stored count', async () => {
    chromeMock._localStore[FREE_PROMPTS_USED_KEY] = 2;
    expect(await getFreePromptsUsed()).toBe(2);
  });

  it('clamps stored value to FREE_TRIAL_PROMPT_LIMIT', async () => {
    chromeMock._localStore[FREE_PROMPTS_USED_KEY] = 99;
    expect(await getFreePromptsUsed()).toBe(FREE_TRIAL_PROMPT_LIMIT);
  });

  it('ignores non-numeric stored values and returns 0', async () => {
    chromeMock._localStore[FREE_PROMPTS_USED_KEY] = 'bad';
    expect(await getFreePromptsUsed()).toBe(0);
  });
});

describe('getRemainingFreePrompts', () => {
  it('returns FREE_TRIAL_PROMPT_LIMIT when no prompts used', async () => {
    expect(await getRemainingFreePrompts()).toBe(FREE_TRIAL_PROMPT_LIMIT);
  });

  it('returns correct remaining count', async () => {
    chromeMock._localStore[FREE_PROMPTS_USED_KEY] = 1;
    expect(await getRemainingFreePrompts()).toBe(2);
  });

  it('returns 0 when limit reached', async () => {
    chromeMock._localStore[FREE_PROMPTS_USED_KEY] = FREE_TRIAL_PROMPT_LIMIT;
    expect(await getRemainingFreePrompts()).toBe(0);
  });

  it('never returns negative remaining count', async () => {
    chromeMock._localStore[FREE_PROMPTS_USED_KEY] = FREE_TRIAL_PROMPT_LIMIT + 5;
    expect(await getRemainingFreePrompts()).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// streamFreeChat — network failure
// ---------------------------------------------------------------------------

describe('streamFreeChat — network failure', () => {
  it('yields server_error on network exception', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'server_error' });
  });

  it('does not increment local prompt counter on network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    const used = await getFreePromptsUsed();
    expect(used).toBe(0);
  });

  it('yields error with code server_error on AbortError', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'server_error' });
  });
});

// ---------------------------------------------------------------------------
// streamFreeChat — 401 / 403 responses
// ---------------------------------------------------------------------------

describe('streamFreeChat — auth and quota errors', () => {
  it('yields auth_required on 401', async () => {
    fetchMock.mockResolvedValueOnce(makeErrorResponse(401, 'Unauthorized'));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'bad-token'));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'auth_required' });
  });

  it('yields quota_exceeded on 403 with limit_reached body', async () => {
    fetchMock.mockResolvedValueOnce(
      makeErrorResponse(403, JSON.stringify({ error: 'limit_reached', message: 'Quota hit' })),
    );
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'quota_exceeded' });
  });

  it('snaps local counter to limit on 403 quota_exceeded', async () => {
    fetchMock.mockResolvedValueOnce(makeErrorResponse(403, 'free_trial limit_reached'));
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chromeMock._localStore[FREE_PROMPTS_USED_KEY]).toBe(FREE_TRIAL_PROMPT_LIMIT);
  });

  it('yields auth_required on 403 without quota keywords', async () => {
    fetchMock.mockResolvedValueOnce(makeErrorResponse(403, 'plan gated'));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'auth_required' });
  });

  it('yields quota_exceeded when body contains "Upgrade" (capital U)', async () => {
    fetchMock.mockResolvedValueOnce(makeErrorResponse(403, 'Upgrade your plan'));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'quota_exceeded' });
  });

  it('yields quota_exceeded when body contains prompt_limit', async () => {
    fetchMock.mockResolvedValueOnce(makeErrorResponse(403, '{"error":"prompt_limit"}'));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'quota_exceeded' });
  });
});

// ---------------------------------------------------------------------------
// streamFreeChat — 5xx / non-OK
// ---------------------------------------------------------------------------

describe('streamFreeChat — 5xx server error', () => {
  it('yields server_error on 500 response', async () => {
    fetchMock.mockResolvedValueOnce(makeErrorResponse(500, 'Internal Server Error'));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'server_error' });
  });

  it('does not snap counter to limit on 5xx', async () => {
    fetchMock.mockResolvedValueOnce(makeErrorResponse(502, 'Bad Gateway'));
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chromeMock._localStore[FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// streamFreeChat — happy path SSE streaming
// ---------------------------------------------------------------------------

describe('streamFreeChat — SSE happy path', () => {
  it('yields text chunks and a done chunk on successful stream', async () => {
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'Hello' }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: { content: ' world' }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: { content: '' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));

    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));
    const textChunks = chunks.filter((c) => c.type === 'text');
    const doneChunks = chunks.filter((c) => c.type === 'done');

    expect(textChunks).toHaveLength(2);
    expect((textChunks[0] as { type: 'text'; text: string }).text).toBe('Hello');
    expect((textChunks[1] as { type: 'text'; text: string }).text).toBe(' world');
    expect(doneChunks).toHaveLength(1);
  });

  it('increments local prompt counter on successful stream', async () => {
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));

    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));
    expect(chromeMock._localStore[FREE_PROMPTS_USED_KEY]).toBe(1);
  });

  it('increments counter cumulatively across calls', async () => {
    chromeMock._localStore[FREE_PROMPTS_USED_KEY] = 1;
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));
    expect(chromeMock._localStore[FREE_PROMPTS_USED_KEY]).toBe(2);
  });

  it('caps counter at FREE_TRIAL_PROMPT_LIMIT even if called beyond limit', async () => {
    chromeMock._localStore[FREE_PROMPTS_USED_KEY] = FREE_TRIAL_PROMPT_LIMIT;
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'x' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));
    expect(chromeMock._localStore[FREE_PROMPTS_USED_KEY]).toBe(FREE_TRIAL_PROMPT_LIMIT);
  });

  it('handles [DONE] sentinel without an explicit finish_reason', async () => {
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'hi' }, finish_reason: null }] }),
      '[DONE]',
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
  });

  it('accepts alternative done format: parsed.done = true', async () => {
    const sseLines = [
      JSON.stringify({ content: 'hello', done: false }),
      JSON.stringify({ content: '', done: true }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
    const textChunks = chunks.filter((c) => c.type === 'text');
    expect((textChunks[0] as { type: 'text'; text: string }).text).toBe('hello');
  });

  it('sends Authorization: Bearer header with the token', async () => {
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'my-clerk-token'));

    const [, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = fetchOpts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-clerk-token');
  });

  it('sends X-Requested-With: XMLHttpRequest header', async () => {
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));

    const [, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = fetchOpts.headers as Record<string, string>;
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest');
  });

  it('posts to FREE_TRIAL_ENDPOINT', async () => {
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(FREE_TRIAL_ENDPOINT);
  });
});

// ---------------------------------------------------------------------------
// streamFreeChat — input truncation
// ---------------------------------------------------------------------------

describe('streamFreeChat — input truncation', () => {
  it('truncates message content exceeding FREE_TRIAL_MAX_INPUT_CHARS', async () => {
    const longContent = 'x'.repeat(40_000);
    const messages: FreeTrialMessage[] = [{ role: 'user', content: longContent }];

    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    await collectChunks(streamFreeChat(messages, 'token'));

    const [, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchOpts.body as string) as {
      messages: FreeTrialMessage[];
    };
    expect(body.messages[0]!.content.length).toBe(32_000);
  });

  it('does not truncate messages within the char limit', async () => {
    const shortContent = 'Hello!';
    const messages: FreeTrialMessage[] = [{ role: 'user', content: shortContent }];

    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    await collectChunks(streamFreeChat(messages, 'token'));

    const [, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchOpts.body as string) as {
      messages: FreeTrialMessage[];
    };
    expect(body.messages[0]!.content).toBe(shortContent);
  });
});

// ---------------------------------------------------------------------------
// streamFreeChat — inline stream error
// ---------------------------------------------------------------------------

describe('streamFreeChat — inline stream error', () => {
  it('yields quota_exceeded on inline stream error with limit_reached code', async () => {
    const sseLines = [
      JSON.stringify({
        error: { message: 'Trial limit reached', code: 'free_trial_limit_reached' },
      }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'quota_exceeded' });
  });

  it('yields server_error on inline stream error with other code', async () => {
    const sseLines = [
      JSON.stringify({
        error: { message: 'Temporary outage', code: 'service_unavailable' },
      }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'server_error' });
  });

  it('snaps counter on inline quota error', async () => {
    const sseLines = [
      JSON.stringify({
        error: { message: 'Quota hit', code: 'free_trial_limit_reached' },
      }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chromeMock._localStore[FREE_PROMPTS_USED_KEY]).toBe(FREE_TRIAL_PROMPT_LIMIT);
  });
});

// ---------------------------------------------------------------------------
// streamFreeChat — abort signal
// ---------------------------------------------------------------------------

describe('streamFreeChat — abort signal', () => {
  it('yields server_error when signal is already aborted before fetch', async () => {
    const controller = new AbortController();
    controller.abort();

    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' }),
    );

    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token', controller.signal));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'server_error' });
  });
});

// ---------------------------------------------------------------------------
// streamFreeChat — stream ends without explicit finish
// ---------------------------------------------------------------------------

describe('streamFreeChat — stream ends without finish_reason', () => {
  it('emits done and increments counter when stream closes after text', async () => {
    // Send text but no finish_reason — stream just closes
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'hello' }, finish_reason: null }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
    expect(chromeMock._localStore[FREE_PROMPTS_USED_KEY]).toBe(1);
  });

  it('emits done but does NOT increment counter when no text was received', async () => {
    // Stream closes without any content
    fetchMock.mockResolvedValueOnce(makeStreamResponse([]));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks.some((c) => c.type === 'done')).toBe(true);
    expect(chromeMock._localStore[FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// streamFreeChat — body contains the model from models.json
// ---------------------------------------------------------------------------

describe('streamFreeChat — model routing', () => {
  it('sends FREE_TRIAL_MODEL (from models.json) in the request body', async () => {
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));

    const [, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchOpts.body as string) as { model: string };
    expect(body.model).toBe(FREE_TRIAL_MODEL);
  });

  it('requests stream=true', async () => {
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));

    const [, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchOpts.body as string) as { stream: boolean };
    expect(body.stream).toBe(true);
  });
});
