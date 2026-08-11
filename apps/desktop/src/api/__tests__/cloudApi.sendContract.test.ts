import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudAccountAuth } from '../../services/cloudAccountAuth';
import { CloudApiError, sendCloudMessage } from '../cloudApi';

/**
 * Desktop Cloud send-body contract.
 *
 * The accepted field names are pinned against
 * `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`:
 *   - `assistant_message_id: z.string().uuid().optional()` (DES-C24) — without
 *     it the route takes the `assistant_turn_not_server_persisted` skip branch
 *     and a crash after generation loses the already-billed turn.
 *   - `client_timezone` (DES-C25) — absent, `buildCapabilityPreamble` drops the
 *     local-calendar-date clause and the model answers date questions in the
 *     server's day.
 */
const IDEMPOTENCY_KEY = 'agi.chat.desktop.send.0190a000-0000-7000-8000-0000000000aa';
const ASSISTANT_MESSAGE_ID = '0199c1f2-0000-7000-8000-0000000000ab';
const FIXTURE_MODEL_ID = 'fixture-cloud-contract-model';

function emptyStreamResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe('sendCloudMessage — outbound body contract', () => {
  beforeEach(() => {
    vi.spyOn(cloudAccountAuth, 'getValidSession').mockResolvedValue({
      access_token: 'token',
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('carries assistant_message_id and an IANA client_timezone', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyStreamResponse());
    vi.stubGlobal('fetch', fetchMock);

    await sendCloudMessage(
      'conv_contract',
      'What day is it?',
      FIXTURE_MODEL_ID,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      IDEMPOTENCY_KEY,
      { assistantMessageId: ASSISTANT_MESSAGE_ID },
    );

    const body = sentBody(fetchMock);
    expect(body['assistant_message_id']).toBe(ASSISTANT_MESSAGE_ID);
    const zone = body['client_timezone'];
    expect(typeof zone).toBe('string');
    // The route validates with `isValidIanaTimeZone` and caps at 64 chars.
    expect(String(zone).length).toBeLessThanOrEqual(64);
    expect(() => new Intl.DateTimeFormat(undefined, { timeZone: String(zone) })).not.toThrow();
  });

  it('omits thinking_mode entirely when the caller passes no thinking preference', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyStreamResponse());
    vi.stubGlobal('fetch', fetchMock);

    await sendCloudMessage(
      'conv_contract',
      'Hello',
      FIXTURE_MODEL_ID,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      IDEMPOTENCY_KEY,
    );

    expect(sentBody(fetchMock)).not.toHaveProperty('thinking_mode');
  });

  it('still serialises an explicit thinking_mode when one is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyStreamResponse());
    vi.stubGlobal('fetch', fetchMock);

    await sendCloudMessage(
      'conv_contract',
      'Hello',
      FIXTURE_MODEL_ID,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      undefined,
      undefined,
      undefined,
      undefined,
      true,
      undefined,
      IDEMPOTENCY_KEY,
    );

    expect(sentBody(fetchMock)['thinking_mode']).toBe(true);
  });
});

describe('sendCloudMessage — refusal classification (DES-C22)', () => {
  beforeEach(() => {
    vi.spyOn(cloudAccountAuth, 'getValidSession').mockResolvedValue({
      access_token: 'token',
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('preserves the server error code and reset instant on a quota refusal', async () => {
    const resetAt = '2026-08-01T12:00:00.000Z';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'You have used your weekly capacity.',
              code: 'weekly_limit_exceeded',
              reset_at: resetAt,
            },
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const onError = vi.fn();
    await sendCloudMessage(
      'conv_quota',
      'Hello',
      FIXTURE_MODEL_ID,
      vi.fn(),
      vi.fn(),
      onError,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      IDEMPOTENCY_KEY,
    );

    expect(onError).toHaveBeenCalledOnce();
    const error = onError.mock.calls[0]?.[0] as CloudApiError;
    expect(error).toBeInstanceOf(CloudApiError);
    expect(error.code).toBe('weekly_limit_exceeded');
    expect(error.status).toBe(429);
    expect(error.resetAt).toBe(resetAt);
    expect(error.message).toBe('You have used your weekly capacity.');
  });

  it('derives the reset instant from Retry-After when the body carries none', async () => {
    const before = Date.now();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        }),
      ),
    );

    const onError = vi.fn();
    await sendCloudMessage(
      'conv_quota',
      'Hello',
      FIXTURE_MODEL_ID,
      vi.fn(),
      vi.fn(),
      onError,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      IDEMPOTENCY_KEY,
    );

    const error = onError.mock.calls[0]?.[0] as CloudApiError;
    expect(error.code).toBe('rate_limit_exceeded');
    expect(Date.parse(String(error.resetAt))).toBeGreaterThanOrEqual(before + 59_000);
  });

  it('reports no reset time when the server supplied none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Boom' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const onError = vi.fn();
    await sendCloudMessage(
      'conv_quota',
      'Hello',
      FIXTURE_MODEL_ID,
      vi.fn(),
      vi.fn(),
      onError,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      IDEMPOTENCY_KEY,
    );

    const error = onError.mock.calls[0]?.[0] as CloudApiError;
    expect(error.resetAt).toBeUndefined();
    expect(error.code).toBeUndefined();
  });
});
