import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));

import { GUEST_CHAT_ERROR_CODES } from '@/lib/guest-chat/contract';
import { GUEST_BLOCKING_CODES, GuestChatRefusal, sendGuestTurn } from './guest-chat-stream';

const MESSAGES = [{ role: 'user', content: 'Hi' }] as const;
const CHECKED_AGAINST = 18;

function openStream(frames: string[]) {
  const encoder = new TextEncoder();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { body, wasCancelled: () => cancelled };
}

describe('sendGuestTurn', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('finishes at the end marker even when the server keeps the body open', async () => {
    const { body, wasCancelled } = openStream([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"x_stream_error":{"message":"Too slow."}}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { headers: { 'x-guest-messages-remaining': '3' } })),
    );

    const turn = await sendGuestTurn(
      MESSAGES,
      CHECKED_AGAINST,
      new AbortController().signal,
      () => undefined,
    );

    expect(turn).toEqual({ content: 'Hello', failure: 'Too slow.', remaining: 3 });
    await vi.waitFor(() => expect(wasCancelled()).toBe(true));
  });

  it('carries the minimum age it was checked against and nothing else about age', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(openStream(['data: [DONE]\n\n']).body),
    );
    vi.stubGlobal('fetch', fetchMock);

    await sendGuestTurn(MESSAGES, CHECKED_AGAINST, new AbortController().signal, () => undefined);

    const init = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      messages: MESSAGES,
      ageCheckedAgainst: CHECKED_AGAINST,
    });
  });

  it('reads the server’s age refusal as its own code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: GUEST_CHAT_ERROR_CODES.ageConfirmationRequired, message: 'Adults.' } },
          { status: 403 },
        ),
      ),
    );

    const error = await sendGuestTurn(
      MESSAGES,
      CHECKED_AGAINST,
      new AbortController().signal,
      () => undefined,
    ).catch((caught: unknown) => caught);

    expect((error as GuestChatRefusal).code).toBe('age_confirmation_required');
    expect(GUEST_BLOCKING_CODES.has(GUEST_CHAT_ERROR_CODES.ageConfirmationRequired)).toBe(false);
  });

  it('keeps the composer for an admission outage and blocks it for a spent day', async () => {
    const refusal = (code: string) =>
      Response.json({ error: { code, message: 'Refused.' } }, { status: 503 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => refusal(GUEST_CHAT_ERROR_CODES.admissionUnavailable)),
    );

    const error = await sendGuestTurn(
      MESSAGES,
      CHECKED_AGAINST,
      new AbortController().signal,
      () => undefined,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GuestChatRefusal);
    expect((error as GuestChatRefusal).code).toBe(GUEST_CHAT_ERROR_CODES.admissionUnavailable);
    expect(GUEST_BLOCKING_CODES.has(GUEST_CHAT_ERROR_CODES.admissionUnavailable)).toBe(false);
    expect(GUEST_BLOCKING_CODES.has(GUEST_CHAT_ERROR_CODES.capacityReached)).toBe(true);
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
