import { afterEach, describe, expect, it, vi } from 'vitest';

import { putActiveLeafMessageId } from './activeLeafSelection';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': CSRF_TOKEN,
  }),
}));

const CSRF_TOKEN = 'csrf-token';
const CONVERSATION_ID = '4e0a1f2c-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const LEAF_ID = '9f8e7d6c-5b4a-4938-8271-6a5b4c3d2e1f';
const AUTH_TOKEN = 'auth-token';
const OK_STATUS = 200;
const NOT_FOUND_STATUS = 404;
const SERVER_MESSAGE = 'Message not found';

function okResponse(): Response {
  return new Response(null, { status: OK_STATUS });
}

function fetchSpy(response: Response) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
}

function initOf(spy: ReturnType<typeof fetchSpy>): RequestInit {
  return (spy.mock.calls[0]?.[1] ?? {}) as RequestInit;
}

describe('putActiveLeafMessageId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the selected leaf to the conversation route', async () => {
    const spy = fetchSpy(okResponse());

    await putActiveLeafMessageId({
      conversationId: CONVERSATION_ID,
      activeLeafMessageId: LEAF_ID,
      authToken: AUTH_TOKEN,
    });

    expect(spy.mock.calls[0]?.[0]).toContain(CONVERSATION_ID);
    const init = initOf(spy);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ activeLeafMessageId: LEAF_ID });
  });

  /**
   * The defect this guards: paging to a variant and then reloading came back on
   * the newest one, because the browser cancelled this write with the document.
   * A cancelled write leaves the server on the leaf the reader moved away from,
   * and `keepalive` is the only thing that lets it land.
   */
  it('marks the write to outlive the document that started it', async () => {
    const spy = fetchSpy(okResponse());

    await putActiveLeafMessageId({
      conversationId: CONVERSATION_ID,
      activeLeafMessageId: LEAF_ID,
      authToken: AUTH_TOKEN,
    });

    expect(initOf(spy).keepalive).toBe(true);
  });

  it('carries the reset to a linear reading as a null leaf', async () => {
    const spy = fetchSpy(okResponse());

    await putActiveLeafMessageId({
      conversationId: CONVERSATION_ID,
      activeLeafMessageId: null,
      authToken: AUTH_TOKEN,
    });

    expect(JSON.parse(String(initOf(spy).body))).toEqual({ activeLeafMessageId: null });
  });

  it('reports the route message when the write is refused', async () => {
    fetchSpy(
      new Response(JSON.stringify({ error: { message: SERVER_MESSAGE } }), {
        status: NOT_FOUND_STATUS,
      }),
    );

    await expect(
      putActiveLeafMessageId({
        conversationId: CONVERSATION_ID,
        activeLeafMessageId: LEAF_ID,
        authToken: AUTH_TOKEN,
      }),
    ).rejects.toThrow(SERVER_MESSAGE);
  });
});
