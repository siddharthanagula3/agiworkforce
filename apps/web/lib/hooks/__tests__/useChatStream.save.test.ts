import { describe, it, expect, beforeEach, vi } from 'vitest';

// saveMessageToDb / notifyPersistenceFailure live in useChatStream.ts. We only
// exercise those two helpers, so stub the heavy sibling imports the module
// pulls in at load time (Clerk, zustand stores) and the two deps the helpers
// actually use (csrf header builder, sonner toast).
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
}));
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ getToken: async () => 'tok' }) }));

import { saveMessageToDb, notifyPersistenceFailure } from '../useChatStream';

const MSG = { id: 'client-id-1', role: 'assistant', content: 'hi', model: 'm' };
const FAST = { retryDelayMs: 0 }; // no real backoff in tests

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('saveMessageToDb durability (P1 silent-data-loss regression)', () => {
  beforeEach(() => {
    toastError.mockReset();
    vi.restoreAllMocks();
  });

  it('returns the saved row id on a 200 with a message body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: { id: 'server-id-9' } }));
    vi.stubGlobal('fetch', fetchMock);

    const saved = await saveMessageToDb('conv-1', MSG, 'tok', FAST);

    expect(saved).toEqual({ id: 'server-id-9' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the SENT id (not a random uuid) on a 200 with no body', async () => {
    // The route is idempotent on the sent id; on a bodyless 200 the row was
    // still saved, so the store id must stay in sync — never invent a uuid.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {})));

    const saved = await saveMessageToDb('conv-1', MSG, 'tok', FAST);

    expect(saved).toEqual({ id: 'client-id-1' });
  });

  it('surfaces a 429 (rate-limited persist = turn not saved) by throwing, without retrying', async () => {
    // A 429 means the persist was rate-limited and the turn was NOT saved.
    // Retrying in-request is futile (the window outlasts it), so it throws once
    // so the caller surfaces it rather than silently dropping the turn.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, { error: 'rate limited' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveMessageToDb('conv-1', MSG, 'tok', FAST)).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 500 and recovers when a later attempt succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }))
      .mockResolvedValueOnce(jsonResponse(200, { message: { id: 'server-id-2' } }));
    vi.stubGlobal('fetch', fetchMock);

    const saved = await saveMessageToDb('conv-1', MSG, 'tok', FAST);

    expect(saved).toEqual({ id: 'server-id-2' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('THROWS after exhausting retries on a persistent 500 (no silent loss)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveMessageToDb('conv-1', MSG, 'tok', FAST)).rejects.toThrow(
      /save message to DB/i,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3); // default maxAttempts = 3
  });

  it('THROWS immediately on a non-retryable 4xx (e.g. 404) — no retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { error: 'not found' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveMessageToDb('conv-1', MSG, 'tok', FAST)).rejects.toThrow(
      /save message to DB/i,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a network error and recovers', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { message: { id: 'server-id-3' } }));
    vi.stubGlobal('fetch', fetchMock);

    const saved = await saveMessageToDb('conv-1', MSG, 'tok', FAST);

    expect(saved).toEqual({ id: 'server-id-3' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('THROWS after exhausting retries on a persistent network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveMessageToDb('conv-1', MSG, 'tok', FAST)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('notifyPersistenceFailure surfaces loss to the user', () => {
  beforeEach(() => toastError.mockReset());

  it('shows an assistant-specific toast', () => {
    notifyPersistenceFailure('assistant', new Error('x'));
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0]?.[0])).toMatch(/save this response/i);
  });

  it('shows a user-specific toast', () => {
    notifyPersistenceFailure('user', new Error('x'));
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0]?.[0])).toMatch(/save your message/i);
  });
});
