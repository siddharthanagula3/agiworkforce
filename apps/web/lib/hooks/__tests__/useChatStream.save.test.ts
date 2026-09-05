import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
  getCsrfToken: async () => 'fixture-csrf-token',
}));
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ getToken: async () => 'tok' }) }));

import { saveMessageToDb, notifyPersistenceFailure } from '../useChatStream';

const MSG = { id: 'client-id-1', role: 'assistant', content: 'hi', model: 'm' };
const FAST = { retryDelayMs: 0 };
const TOK = async () => 'tok';

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

    const saved = await saveMessageToDb('conv-1', MSG, TOK, FAST);

    expect(saved).toEqual({ id: 'server-id-9' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the SENT id (not a random uuid) on a 200 with no body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {})));

    const saved = await saveMessageToDb('conv-1', MSG, TOK, FAST);
    const sent = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    ) as { id: string };

    expect(saved).toEqual({ id: sent.id });
  });

  it('surfaces a 429 (rate-limited persist = turn not saved) by throwing, without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, { error: 'rate limited' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveMessageToDb('conv-1', MSG, TOK, FAST)).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 500 and recovers when a later attempt succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }))
      .mockResolvedValueOnce(jsonResponse(200, { message: { id: 'server-id-2' } }));
    vi.stubGlobal('fetch', fetchMock);

    const saved = await saveMessageToDb('conv-1', MSG, TOK, FAST);

    expect(saved).toEqual({ id: 'server-id-2' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('THROWS after exhausting retries on a persistent 500 (no silent loss)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveMessageToDb('conv-1', MSG, TOK, FAST)).rejects.toThrow(/save message to DB/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('THROWS immediately on a non-retryable 4xx (e.g. 404), no retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { error: 'not found' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveMessageToDb('conv-1', MSG, TOK, FAST)).rejects.toThrow(/save message to DB/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a network error and recovers', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { message: { id: 'server-id-3' } }));
    vi.stubGlobal('fetch', fetchMock);

    const saved = await saveMessageToDb('conv-1', MSG, TOK, FAST);

    expect(saved).toEqual({ id: 'server-id-3' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('THROWS after exhausting retries on a persistent network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveMessageToDb('conv-1', MSG, TOK, FAST)).rejects.toThrow();
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
