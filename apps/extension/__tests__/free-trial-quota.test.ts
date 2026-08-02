/**
 * Tests for apps/extension/src/features/cloud-bridge/freeTrialClient.ts
 *
 * Covers:
 *   - Constants: FREE_TRIAL_MODEL, FREE_TRIAL_ENDPOINT
 *   - Auth: getAuthToken (session → local fallback → null), storeSessionToken, clearAuthToken
 *   - streamFreeChat: happy-path SSE streaming, quota_exceeded (403), auth_required (401),
 *     server_error (5xx), network failure, abort, input truncation, [DONE] sentinel,
 *     inline stream error, explicit terminal enforcement, and routing options
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
    runtime: {
      sendMessage: vi.fn(async (): Promise<{ success: boolean }> => ({ success: true })),
    },
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

const clerkAuthMock = vi.hoisted(() => ({
  getFreshClerkAuthContext: vi.fn(
    async (): Promise<{
      token: string;
      owner: { accountId: string; authIncarnation: string };
    } | null> => null,
  ),
  getFreshClerkToken: vi.fn(async (): Promise<string | null> => null),
  signOutClerk: vi.fn(async (): Promise<void> => undefined),
  signOutClerkIfCurrent: vi.fn(async (): Promise<boolean> => false),
}));

vi.mock('../src/features/cloud-bridge/clerkAuth', () => clerkAuthMock);

// ---------------------------------------------------------------------------
// Imports — after mock hoisting
// ---------------------------------------------------------------------------

import {
  FREE_TRIAL_MODEL,
  FREE_TRIAL_GATEWAY,
  FREE_TRIAL_ENDPOINT,
  MANAGED_APPROVAL_ENDPOINT,
  MANAGED_MODELS_ENDPOINT,
  MANAGED_USAGE_ENDPOINT,
  MANAGED_CHAT_MAX_INPUT_CHARS,
  MANAGED_CHAT_MAX_ATTACHMENTS,
  MANAGED_CHAT_MAX_SSE_FRAME_CHARS,
  MANAGED_CHAT_MAX_STREAMED_TEXT_CHARS,
  getAuthToken,
  clearAuthToken,
  getManagedModelAccess,
  streamFreeChat,
  streamManagedChatApproval,
  createMultimodalUserContent,
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
function makeStreamResponse(
  dataLines: string[],
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    body: makeSseStream(dataLines),
    text: vi.fn().mockResolvedValue(''),
  } as unknown as Response;
}

function makeRawStreamResponse(payload: string, status = 200): Response {
  const encoder = new TextEncoder();
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    }),
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
const LEGACY_FREE_PROMPTS_USED_KEY = 'agi_free_prompts_used';

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Clear all storage
  for (const k of Object.keys(chromeMock._localStore)) delete chromeMock._localStore[k];
  for (const k of Object.keys(chromeMock._sessionStore)) delete chromeMock._sessionStore[k];
  vi.clearAllMocks();
  fetchMock.mockReset();
  clerkAuthMock.getFreshClerkAuthContext.mockResolvedValue(null);
  clerkAuthMock.getFreshClerkToken.mockResolvedValue(null);
  clerkAuthMock.signOutClerk.mockResolvedValue(undefined);
  clerkAuthMock.signOutClerkIfCurrent.mockResolvedValue(false);
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

describe('getManagedModelAccess', () => {
  function accessResponse(body: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: vi.fn().mockResolvedValue(body),
    } as unknown as Response;
  }

  function activeUsageResponse(
    overrides: Partial<{
      plan_tier: string;
      subscription_status: string;
      usage_percentage: number;
      has_usage_remaining: boolean;
    }> = {},
  ): Response {
    return accessResponse({
      plan_tier: 'pro',
      usage_percentage: 0,
      usage_reset_at: '2026-08-01T00:00:00.000Z',
      has_usage_remaining: true,
      period_start: '2026-07-01T00:00:00.000Z',
      period_end: '2026-08-01T00:00:00.000Z',
      subscription_status: 'active',
      session_usage_percentage: 0,
      session_reset_at: null,
      weekly_usage_percentage: 0,
      weekly_reset_at: null,
      flagship_weekly_usage_percentage: 0,
      flagship_weekly_reset_at: null,
      ...overrides,
    });
  }

  it('uses the bearer credential and forwards cancellation to the model owner', async () => {
    const controller = new AbortController();
    fetchMock
      .mockResolvedValueOnce(
        accessResponse({
          data: [{ id: 'model-a' }],
          x_agi_workforce: { user_tier: 'pro', allowed_auto_modes: ['auto'] },
        }),
      )
      .mockResolvedValueOnce(activeUsageResponse());

    await expect(getManagedModelAccess('session-token', controller.signal)).resolves.toMatchObject({
      subscriptionTier: 'pro',
      modelIds: ['model-a'],
      allowedAutoModes: ['auto'],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      MANAGED_MODELS_ENDPOINT,
      expect.objectContaining({
        method: 'GET',
        signal: controller.signal,
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
      }),
    );
  });

  it('hydrates the canonical Team plan and active status from the usage owner', async () => {
    fetchMock
      .mockResolvedValueOnce(
        accessResponse({
          data: [{ id: 'model-a' }],
          x_agi_workforce: { user_tier: 'pro', allowed_auto_modes: ['auto'] },
        }),
      )
      .mockResolvedValueOnce(
        accessResponse({
          plan_tier: 'team',
          usage_percentage: 37,
          usage_reset_at: '2026-08-01T00:00:00.000Z',
          has_usage_remaining: true,
          period_start: '2026-07-01T00:00:00.000Z',
          period_end: '2026-08-01T00:00:00.000Z',
          subscription_status: 'active',
          session_usage_percentage: 12,
          session_reset_at: '2026-07-26T20:00:00.000Z',
          weekly_usage_percentage: 21,
          weekly_reset_at: '2026-07-31T20:00:00.000Z',
          flagship_weekly_usage_percentage: 5,
          flagship_weekly_reset_at: '2026-07-31T20:00:00.000Z',
        }),
      );

    await expect(getManagedModelAccess('session-token')).resolves.toMatchObject({
      subscriptionTier: 'team',
      subscriptionStatus: 'active',
      usagePercentage: 37,
      usageResetAt: '2026-08-01T00:00:00.000Z',
      hasUsageRemaining: true,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      MANAGED_USAGE_ENDPOINT,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
      }),
    );
  });

  it('fails closed to Free when a retained paid plan is no longer entitled', async () => {
    fetchMock
      .mockResolvedValueOnce(
        accessResponse({
          data: [{ id: 'model-a' }],
          x_agi_workforce: { user_tier: 'pro', allowed_auto_modes: ['auto'] },
        }),
      )
      .mockResolvedValueOnce(
        accessResponse({
          plan_tier: 'pro',
          usage_percentage: 100,
          usage_reset_at: null,
          has_usage_remaining: false,
          period_start: null,
          period_end: null,
          subscription_status: 'canceled',
          session_usage_percentage: 100,
          session_reset_at: null,
          weekly_usage_percentage: 100,
          weekly_reset_at: null,
          flagship_weekly_usage_percentage: 100,
          flagship_weekly_reset_at: null,
        }),
      );

    await expect(getManagedModelAccess('session-token')).resolves.toMatchObject({
      subscriptionTier: 'free',
      accountPlanTier: 'pro',
      subscriptionStatus: 'canceled',
    });
  });

  it('normalizes duplicates and caps untrusted server arrays', async () => {
    fetchMock
      .mockResolvedValueOnce(
        accessResponse({
          data: [
            { id: ' model-a ' },
            { id: 'model-a' },
            ...Array.from({ length: 250 }, (_, index) => ({ id: `model-${index}` })),
          ],
          x_agi_workforce: {
            user_tier: 'pro',
            allowed_auto_modes: [
              ' auto ',
              'auto',
              ...Array.from({ length: 100 }, (_, index) => `mode-${index}`),
            ],
          },
        }),
      )
      .mockResolvedValueOnce(activeUsageResponse());

    const access = await getManagedModelAccess('session-token');
    expect(access.modelIds).toHaveLength(200);
    expect(access.modelIds[0]).toBe('model-a');
    expect(access.allowedAutoModes).toHaveLength(50);
    expect(access.allowedAutoModes[0]).toBe('auto');
  });

  it('fails closed on empty auth, rejected auth, and malformed payloads', async () => {
    await expect(getManagedModelAccess('   ')).rejects.toThrow('Authentication is required');
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock
      .mockResolvedValueOnce(accessResponse({}, 401))
      .mockResolvedValueOnce(accessResponse({}, 401));
    await expect(getManagedModelAccess('expired')).rejects.toThrow('Authentication is required');

    fetchMock
      .mockResolvedValueOnce(
        accessResponse({
          data: [{ id: '' }],
          x_agi_workforce: { user_tier: '', allowed_auto_modes: [] },
        }),
      )
      .mockResolvedValueOnce(activeUsageResponse());
    await expect(getManagedModelAccess('token')).rejects.toThrow('Invalid model-access response');
  });

  it('propagates an abort without retrying or converting it into admission', async () => {
    const controller = new AbortController();
    const abort = new DOMException('Aborted', 'AbortError');
    fetchMock.mockRejectedValue(abort);
    controller.abort();

    await expect(getManagedModelAccess('token', controller.signal)).rejects.toBe(abort);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Auth: getAuthToken
// ---------------------------------------------------------------------------

describe('getAuthToken', () => {
  it('returns null when both stores are empty', async () => {
    expect(await getAuthToken()).toBeNull();
  });

  it('returns a fresh Clerk Native API session token', async () => {
    clerkAuthMock.getFreshClerkToken.mockResolvedValueOnce('sess-token-abc');
    expect(await getAuthToken()).toBe('sess-token-abc');
  });

  it('falls back to local dev token when session is empty', async () => {
    chromeMock._localStore['agi_dev_bearer_token'] = 'dev-token-xyz';
    expect(await getAuthToken()).toBe('dev-token-xyz');
  });

  it('prefers the Clerk session over a local dev token', async () => {
    clerkAuthMock.getFreshClerkToken.mockResolvedValueOnce('sess-token');
    chromeMock._localStore['agi_dev_bearer_token'] = 'dev-token';
    expect(await getAuthToken()).toBe('sess-token');
  });

  it('ignores empty string tokens', async () => {
    clerkAuthMock.getFreshClerkToken.mockResolvedValueOnce('');
    chromeMock._localStore['agi_dev_bearer_token'] = '';
    expect(await getAuthToken()).toBeNull();
  });

  it('surfaces Clerk failures when the user explicitly checks sign-in', async () => {
    clerkAuthMock.getFreshClerkToken.mockRejectedValueOnce(
      new Error('Extension origin is not allowed by Clerk'),
    );

    await expect(getAuthToken(true)).rejects.toThrow('Extension origin is not allowed by Clerk');
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
    expect(clerkAuthMock.signOutClerk).toHaveBeenCalledTimes(1);
    expect(chromeMock._sessionStore['agi_clerk_session_token']).toBeUndefined();
    expect(chromeMock._localStore['agi_dev_bearer_token']).toBeUndefined();
  });

  it('tears down the exact Managed Cloud owner before options-page sign-out', async () => {
    clerkAuthMock.getFreshClerkAuthContext.mockResolvedValueOnce({
      token: 'token-a',
      owner: { accountId: 'account-a', authIncarnation: 'session-a' },
    });

    await clearAuthToken();

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'MANAGED_CLOUD_AUTH_CHANGED',
      previousOwner: { accountId: 'account-a', authIncarnation: 'session-a' },
    });
    expect(chromeMock.runtime.sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
      clerkAuthMock.signOutClerk.mock.invocationCallOrder[0]!,
    );
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

  it('does not create the retired local prompt counter on network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
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
  it('yields auth_required on 401 without clearing ambient auth in the transport', async () => {
    chromeMock._sessionStore['agi_clerk_session_token'] = 'bad-token';
    fetchMock.mockResolvedValueOnce(makeErrorResponse(401, 'Unauthorized'));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'bad-token'));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'auth_required' });
    expect(chromeMock._sessionStore['agi_clerk_session_token']).toBe('bad-token');
    expect(clerkAuthMock.signOutClerk).not.toHaveBeenCalled();
  });

  it('yields quota_exceeded on 403 with the server usage-budget code', async () => {
    fetchMock.mockResolvedValueOnce(
      makeErrorResponse(
        403,
        JSON.stringify({ error: { code: 'free_trial_token_budget_reached' } }),
      ),
    );
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'quota_exceeded' });
  });

  it('does not publish a local counter on 403 quota_exceeded', async () => {
    fetchMock.mockResolvedValueOnce(
      makeErrorResponse(403, '{"error":{"code":"free_trial_token_budget_reached"}}'),
    );
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });

  it('yields plan_required on 403 without quota keywords', async () => {
    fetchMock.mockResolvedValueOnce(makeErrorResponse(403, 'plan gated'));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'plan_required' });
  });

  it('treats a generic 429 as rate limiting without corrupting the free quota cache', async () => {
    fetchMock.mockResolvedValueOnce(makeErrorResponse(429, '{"error":"rate_limited"}'));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));

    expect(chunks[0]).toMatchObject({ type: 'error', code: 'rate_limited' });
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });

  it('treats an upgrade-required 403 as a plan gate, not a usage counter', async () => {
    fetchMock.mockResolvedValueOnce(makeErrorResponse(403, 'Upgrade your plan'));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'plan_required' });
  });

  it('treats the free-surface restriction as a plan gate', async () => {
    fetchMock.mockResolvedValueOnce(
      makeErrorResponse(403, '{"error":{"code":"free_trial_surface_unavailable"}}'),
    );
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'plan_required' });
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
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
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

  it('does not publish a local prompt counter on successful stream', async () => {
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));

    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });

  it('does not mutate the free-tier display cache for a paid account', async () => {
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));

    await collectChunks(
      streamFreeChat(SAMPLE_MESSAGES, 'valid-token', { model: FREE_TRIAL_MODEL }),
    );

    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });

  it('handles [DONE] sentinel without an explicit finish_reason', async () => {
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'hi' }, finish_reason: null }] }),
      '[DONE]',
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));
    expect(chunks.filter((c) => c.type === 'done')).toHaveLength(1);
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
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

  it('fails closed when the server reports success without any visible text', async () => {
    fetchMock.mockResolvedValueOnce(makeStreamResponse(['[DONE]']));

    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));

    expect(chunks).toEqual([expect.objectContaining({ type: 'error', code: 'protocol_error' })]);
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });

  it('decodes CR-only SSE framing', async () => {
    fetchMock.mockResolvedValueOnce(
      makeRawStreamResponse(
        `data: ${JSON.stringify({ content: 'hello', done: false })}\r\rdata: [DONE]\r\r`,
      ),
    );

    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));

    expect(chunks).toEqual([{ type: 'text', text: 'hello' }, { type: 'done' }]);
  });

  it('joins multiple data lines into one standards-compliant SSE event', async () => {
    fetchMock.mockResolvedValueOnce(
      makeRawStreamResponse(
        'data: {"content":\n' + 'data: "hello","done":false}\n\n' + 'data: [DONE]\n\n',
      ),
    );

    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));

    expect(chunks).toEqual([{ type: 'text', text: 'hello' }, { type: 'done' }]);
  });

  it('rejects unknown JSON events instead of silently drifting to a later terminal', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse([JSON.stringify({ unexpected: true }), '[DONE]']),
    );

    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));

    expect(chunks).toEqual([expect.objectContaining({ type: 'error', code: 'protocol_error' })]);
  });

  it('rejects an oversized unterminated SSE frame', async () => {
    fetchMock.mockResolvedValueOnce(
      makeRawStreamResponse(`data: ${'x'.repeat(MANAGED_CHAT_MAX_SSE_FRAME_CHARS + 1)}`),
    );

    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));

    expect(chunks).toEqual([expect.objectContaining({ type: 'error', code: 'protocol_error' })]);
  });

  it('bounds total visible streamed output', async () => {
    const oversized = 'x'.repeat(MANAGED_CHAT_MAX_STREAMED_TEXT_CHARS + 1);
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse([JSON.stringify({ content: oversized, done: false }), '[DONE]']),
    );

    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'valid-token'));

    expect(chunks).toEqual([expect.objectContaining({ type: 'error', code: 'protocol_error' })]);
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

  it('sends the caller-owned retry-stable idempotency key', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse([
        JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
      ]),
    );
    await collectChunks(
      streamFreeChat(SAMPLE_MESSAGES, 'token', {
        idempotencyKey: 'agi.chrome.task.request-1',
      }),
    );

    const [, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = fetchOpts.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('agi.chrome.task.request-1');
  });

  it('generates a valid identity for direct transport callers', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse([
        JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
      ]),
    );
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));

    const [, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = fetchOpts.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toMatch(/^agi\.chrome\.chat\.[A-Za-z0-9-]{36}$/);
  });

  it('rejects a malformed request identity without touching the network', async () => {
    const chunks = await collectChunks(
      streamFreeChat(SAMPLE_MESSAGES, 'token', { idempotencyKey: 'bad key' }),
    );

    expect(chunks).toEqual([expect.objectContaining({ type: 'error', code: 'protocol_error' })]);
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(headers['X-AGI-Surface']).toBe('chrome');
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
  it('truncates message content exceeding MANAGED_CHAT_MAX_INPUT_CHARS', async () => {
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
    expect(body.messages[0]!.content.length).toBe(MANAGED_CHAT_MAX_INPUT_CHARS);
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

  it('applies the character cap across the entire request, not once per message', async () => {
    const messages: FreeTrialMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: String(index).repeat(10_000),
    }));
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse([
        JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
      ]),
    );

    await collectChunks(streamFreeChat(messages, 'token'));

    const [, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchOpts.body as string) as { messages: FreeTrialMessage[] };
    const totalText = body.messages.reduce(
      (sum, message) => sum + (typeof message.content === 'string' ? message.content.length : 0),
      0,
    );
    expect(totalText).toBe(32_000);
    expect(body.messages.at(-1)?.content).toBe(messages.at(-1)?.content);
  });
});

describe('managed-cloud attachment payloads', () => {
  it('preserves image data as OpenAI-compatible multimodal content', () => {
    const image = 'data:image/png;base64,aGVsbG8=';

    expect(createMultimodalUserContent('Describe this image', [image])).toEqual([
      { type: 'text', text: 'Describe this image' },
      { type: 'image_url', image_url: { url: image, detail: 'auto' } },
    ]);
  });

  it('rejects malformed or non-image data URLs instead of silently summarizing them', () => {
    expect(() =>
      createMultimodalUserContent('Read this', ['data:text/plain;base64,aGVsbG8=']),
    ).toThrow('Unsupported attachment');
  });

  it('rejects an attachment-count overflow before constructing a request', () => {
    const image = 'data:image/png;base64,aGVsbG8=';
    expect(() =>
      createMultimodalUserContent(
        'Describe these',
        Array.from({ length: MANAGED_CHAT_MAX_ATTACHMENTS + 1 }, () => image),
      ),
    ).toThrow('Too many attachments');
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

  it('does not publish a counter on inline quota error', async () => {
    const sseLines = [
      JSON.stringify({
        error: { message: 'Quota hit', code: 'free_trial_limit_reached' },
      }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });

  it('honors the gateway x_stream_error delta instead of counting finish_reason error as success', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse([
        JSON.stringify({ choices: [{ delta: { content: 'partial' }, finish_reason: null }] }),
        JSON.stringify({
          choices: [
            {
              delta: {
                x_stream_error: {
                  message: 'Provider failed mid-stream',
                  code: 'provider_unavailable',
                  retryable: true,
                },
              },
              finish_reason: 'error',
            },
          ],
        }),
      ]),
    );

    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));

    expect(chunks).toEqual([
      { type: 'text', text: 'partial' },
      expect.objectContaining({ type: 'error', code: 'server_error' }),
    ]);
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });

  it('fails closed on finish_reason error even when a malformed server omits x_stream_error', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse([
        JSON.stringify({ choices: [{ delta: { content: 'partial' }, finish_reason: null }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'error' }] }),
      ]),
    );

    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));

    expect(chunks.at(-1)).toMatchObject({ type: 'error', code: 'server_error' });
    expect(chunks.some((chunk) => chunk.type === 'done')).toBe(false);
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// streamFreeChat — abort signal
// ---------------------------------------------------------------------------

describe('streamFreeChat — abort signal', () => {
  it('yields cancelled without issuing a fetch when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token', controller.signal));
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'cancelled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('distinguishes the gateway deadline from user cancellation', async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            'abort',
            () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            { once: true },
          );
        }),
    );

    const chunks = await collectChunks(
      streamFreeChat(SAMPLE_MESSAGES, 'token', {
        model: FREE_TRIAL_MODEL,
        timeoutMs: 5,
      }),
    );
    expect(chunks).toEqual([expect.objectContaining({ type: 'error', code: 'timeout' })]);
  });

  it('treats the timeout as an inactivity watchdog for long-running agent streams', async () => {
    const encoder = new TextEncoder();
    const frames = [
      JSON.stringify({ choices: [{ delta: { content: 'one ' }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: { content: 'two ' }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: { content: 'three' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          frames.forEach((frame, index) => {
            setTimeout(
              () => {
                controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
                if (index === frames.length - 1) controller.close();
              },
              12 * (index + 1),
            );
          });
        },
      }),
    } as Response);

    const chunks = await collectChunks(
      streamFreeChat(SAMPLE_MESSAGES, 'token', {
        model: FREE_TRIAL_MODEL,
        workMode: 'agiwork',
        timeoutMs: 20,
      }),
    );

    expect(chunks).toEqual([
      { type: 'text', text: 'one ' },
      { type: 'text', text: 'two ' },
      { type: 'text', text: 'three' },
      { type: 'done' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// streamFreeChat — stream ends without explicit finish
// ---------------------------------------------------------------------------

describe('streamFreeChat — stream ends without finish_reason', () => {
  it('fails closed and does not increment when a stream closes after partial text', async () => {
    // Send text but no finish_reason — stream just closes
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'hello' }, finish_reason: null }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks.at(-1)).toMatchObject({ type: 'error', code: 'protocol_error' });
    expect(chunks.some((c) => c.type === 'done')).toBe(false);
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });

  it('fails closed when the response body closes without any terminal event', async () => {
    // Stream closes without any content
    fetchMock.mockResolvedValueOnce(makeStreamResponse([]));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks).toEqual([expect.objectContaining({ type: 'error', code: 'protocol_error' })]);
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });

  it('fails closed on a malformed data frame instead of silently skipping it', async () => {
    fetchMock.mockResolvedValueOnce(makeStreamResponse(['{not-json}', '[DONE]']));
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks).toEqual([expect.objectContaining({ type: 'error', code: 'protocol_error' })]);
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// streamFreeChat — body contains the model from models.json
// ---------------------------------------------------------------------------

describe('streamFreeChat — model routing', () => {
  it('sends the concrete routed model supplied by the caller', async () => {
    const sseLines = [
      JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
    ];
    fetchMock.mockResolvedValueOnce(makeStreamResponse(sseLines));
    await collectChunks(
      streamFreeChat(SAMPLE_MESSAGES, 'token', { model: 'routed-model-from-registry' }),
    );

    const [, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchOpts.body as string) as { model: string };
    expect(body.model).toBe('routed-model-from-registry');
  });

  it('forwards the documented thinking_mode request flag', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse([
        JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
      ]),
    );
    await collectChunks(
      streamFreeChat(SAMPLE_MESSAGES, 'token', {
        model: FREE_TRIAL_MODEL,
        extendedThinking: true,
      }),
    );

    const [, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchOpts.body as string) as { thinking_mode?: boolean };
    expect(body.thinking_mode).toBe(true);
  });

  it('forwards the catalog-reconciled reasoning effort', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse([
        JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
      ]),
    );
    await collectChunks(
      streamFreeChat(SAMPLE_MESSAGES, 'token', {
        model: FREE_TRIAL_MODEL,
        effort: 'high',
      }),
    );

    const [, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchOpts.body as string) as { effort?: string };
    expect(body.effort).toBe('high');
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

  it('requests the paid Chrome agent loop instead of a thin chat completion', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse([
        JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
      ]),
    );

    await collectChunks(
      streamFreeChat(SAMPLE_MESSAGES, 'token', {
        model: FREE_TRIAL_MODEL,
        workMode: 'agiwork',
      }),
    );

    const [, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchOpts.body as string) as { work_mode?: string };
    expect(body.work_mode).toBe('agiwork');
  });

  it('emits the validated run handle and canonical activity event', async () => {
    const runId = '11111111-1111-4111-8111-111111111111';
    const envelope = {
      schemaVersion: 3,
      sessionId: 'conversation-1',
      turnId: 'turn-1',
      sequence: 0,
      emittedAtMs: 1_752_000_000_123,
      event: {
        type: 'progress-update',
        progressId: 'research-plan',
        summary: 'Searching official sources',
        status: 'running',
      },
    } as const;
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse(
        [
          JSON.stringify({
            choices: [{ delta: { x_agent_event: envelope }, finish_reason: null }],
          }),
          JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
        ],
        200,
        {
          'X-AGI-Agent-Run-Id': runId,
          'X-AGI-Agent-Run-URL': `/api/llm/v1/chat/completions/runs/${runId}`,
        },
      ),
    );

    const chunks = await collectChunks(
      streamFreeChat(SAMPLE_MESSAGES, 'token', {
        model: FREE_TRIAL_MODEL,
        workMode: 'agiwork',
      }),
    );

    expect(chunks).toContainEqual({
      type: 'run',
      run: {
        runId,
        runPath: `/api/llm/v1/chat/completions/runs/${runId}`,
        lastSequence: -1,
      },
    });
    expect(chunks).toContainEqual({ type: 'agent-event', envelope });
  });

  it('continues the exact durable run after the live response disconnects', async () => {
    const runId = '11111111-1111-4111-8111-111111111111';
    const runPath = `/api/llm/v1/chat/completions/runs/${runId}`;
    fetchMock
      .mockResolvedValueOnce(
        makeStreamResponse(
          [JSON.stringify({ choices: [{ delta: { content: 'Hello ' }, finish_reason: null }] })],
          200,
          {
            'X-AGI-Agent-Run-Id': runId,
            'X-AGI-Agent-Run-URL': runPath,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            run: {
              id: runId,
              userId: 'user-1',
              requestId: 'request-1',
              conversationId: 'conversation-1',
              originSurface: 'chrome',
              workMode: 'agiwork',
              state: 'completed',
              provider: 'openai',
              model: FREE_TRIAL_MODEL,
              lastEventSequence: 1,
              cancellationRequestedAt: null,
              completedAt: '2026-07-17T20:00:00.000Z',
              createdAt: '2026-07-17T19:00:00.000Z',
              updatedAt: '2026-07-17T20:00:00.000Z',
            },
            events: [
              {
                schemaVersion: 3,
                sessionId: 'conversation-1',
                turnId: 'turn-1',
                sequence: 0,
                emittedAtMs: 1_752_000_000_123,
                event: { type: 'text-delta', delta: 'Hello world' },
              },
              {
                schemaVersion: 3,
                sessionId: 'conversation-1',
                turnId: 'turn-1',
                sequence: 1,
                emittedAtMs: 1_752_000_000_124,
                event: { type: 'stop', reason: 'end-turn' },
              },
            ],
            nextAfterSequence: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const chunks = await collectChunks(
      streamFreeChat(SAMPLE_MESSAGES, 'token', {
        model: FREE_TRIAL_MODEL,
        workMode: 'agiwork',
      }),
    );

    expect(chunks.filter((chunk) => chunk.type === 'text')).toEqual([
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'world' },
    ]);
    expect(chunks.filter((chunk) => chunk.type === 'agent-event')).toHaveLength(2);
    expect(chunks.at(-1)).toEqual({ type: 'done' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${FREE_TRIAL_GATEWAY}${runPath}?after=-1&limit=100`);
  });

  it('rejects a runtime-invalid role without calling the gateway', async () => {
    const chunks = await collectChunks(
      streamFreeChat([{ role: 'tool' as 'user', content: 'untrusted' }], 'token', {
        model: FREE_TRIAL_MODEL,
      }),
    );
    expect(chunks).toEqual([expect.objectContaining({ type: 'error', code: 'protocol_error' })]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('emits one terminal for each of two concurrent explicit-success streams', async () => {
    const success = () =>
      makeStreamResponse([
        JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
      ]);
    fetchMock.mockResolvedValueOnce(success()).mockResolvedValueOnce(success());

    const results = await Promise.all([
      collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token')),
      collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token')),
    ]);

    expect(results.map((chunks) => chunks.filter((chunk) => chunk.type === 'done').length)).toEqual(
      [1, 1],
    );
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });

  it('emits exactly one terminal when the server sends duplicate terminals', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse([
        JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }),
        '[DONE]',
      ]),
    );
    const chunks = await collectChunks(streamFreeChat(SAMPLE_MESSAGES, 'token'));
    expect(chunks.filter((chunk) => chunk.type === 'done')).toHaveLength(1);
    expect(chromeMock._localStore[LEGACY_FREE_PROMPTS_USED_KEY]).toBeUndefined();
  });
});

describe('streamManagedChatApproval', () => {
  const runId = '11111111-1111-4111-8111-111111111111';

  it('posts only the durable run id and explicit decisions to the approval endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      makeStreamResponse([
        JSON.stringify({ choices: [{ delta: { content: 'continued' }, finish_reason: 'stop' }] }),
      ]),
    );

    const chunks = await collectChunks(
      streamManagedChatApproval(
        runId,
        [{ tool_call_id: 'call-1', decision: 'approved' }],
        'token',
        { idempotencyKey: 'agi.chrome.approval.request-1' },
      ),
    );

    const [url, fetchOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(MANAGED_APPROVAL_ENDPOINT);
    expect(JSON.parse(fetchOpts.body as string)).toEqual({
      run_id: runId,
      tool_approvals: [{ tool_call_id: 'call-1', decision: 'approved' }],
    });
    expect((fetchOpts.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'agi.chrome.approval.request-1',
    );
    expect(chunks).toContainEqual({ type: 'text', text: 'continued' });
    expect(chunks.at(-1)).toEqual({ type: 'done' });
  });

  it('rejects malformed decisions before network access', async () => {
    const chunks = await collectChunks(
      streamManagedChatApproval(runId, [{ tool_call_id: '', decision: 'approved' }], 'token'),
    );

    expect(chunks[0]).toMatchObject({ type: 'error', code: 'protocol_error' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the bounded server-owned approval error', async () => {
    fetchMock.mockResolvedValueOnce(
      makeErrorResponse(
        409,
        JSON.stringify({
          error: {
            message: 'This approval is already being resumed.',
            type: 'invalid_request_error',
            code: 'tool_approval_invalid',
          },
        }),
      ),
    );

    const chunks = await collectChunks(
      streamManagedChatApproval(runId, [{ tool_call_id: 'call-1', decision: 'rejected' }], 'token'),
    );

    expect(chunks[0]).toMatchObject({
      type: 'error',
      code: 'server_error',
      message: 'This approval is already being resumed.',
    });
  });
});
