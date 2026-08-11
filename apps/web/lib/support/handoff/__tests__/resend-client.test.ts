/**
 * The transport. It must never throw into a request handler, and it must never
 * report success it did not get.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { sendSupportEmail } from '../resend-client';

const fetchMock = vi.fn();

function input() {
  return {
    to: 'support@agiworkforce.com',
    subject: '[AGI Support] AGI-20260805-ABCDEFGH',
    text: 'body',
    html: '<p>body</p>',
    replyTo: 'customer@example.com',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
  vi.stubEnv('AGI_SUPPORT_FROM_EMAIL', 'support@agiworkforce.com');
  vi.stubEnv('AGI_SUPPORT_FALLBACK_EMAIL', 'support@agiworkforce.com');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('sendSupportEmail', () => {
  it('refuses without a key and does NOT touch the network', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    const result = await sendSupportEmail(input());

    expect(result).toEqual({
      delivered: false,
      reason: 'not_configured',
      detail: expect.stringContaining('RESEND_API_KEY'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the constant Resend endpoint with reply_to set', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'msg-1' }),
      text: async () => '',
    });

    const result = await sendSupportEmail(input());

    expect(result).toEqual({ delivered: true, providerMessageId: 'msg-1' });
    const [url, init] = fetchMock.mock.calls[0]!;
    // Constant URL: no part of it is request-derived, so there is no SSRF surface.
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(String((init as { body: string }).body));
    expect(body.to).toEqual(['support@agiworkforce.com']);
    // Without reply_to the "channel that gets read" is only half-built.
    expect(body.reply_to).toEqual(['customer@example.com']);
    expect(body.from).toBe('support@agiworkforce.com');
  });

  it('sends the same stable idempotency header on the built-in retry', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
        text: async () => 'upstream unavailable',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'msg-1' }),
        text: async () => '',
      });

    await expect(
      sendSupportEmail({ ...input(), idempotencyKey: 'video-billing:job-1' }),
    ).resolves.toEqual({ delivered: true, providerMessageId: 'msg-1' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect((call[1] as { headers: Record<string, string> }).headers['idempotency-key']).toBe(
        'video-billing:job-1',
      );
    }
  });

  it('omits reply_to rather than sending a junk address', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'msg-1' }),
      text: async () => '',
    });

    await sendSupportEmail({ ...input(), replyTo: 'not-an-address' });

    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as { body: string }).body));
    expect(body.reply_to).toBeUndefined();
  });

  it('retries ONCE on a 5xx, then reports rejection instead of throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
      text: async () => 'upstream unavailable',
    });

    const result = await sendSupportEmail(input());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.delivered).toBe(false);
    if (result.delivered) throw new Error('unreachable');
    expect(result.reason).toBe('rejected');
  });

  it('does NOT retry a 4xx that will never succeed', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => 'domain not verified',
    });

    const result = await sendSupportEmail(input());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.delivered).toBe(false);
  });

  it('returns a typed failure — never throws — when the network blows up', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    const result = await sendSupportEmail(input());

    expect(result.delivered).toBe(false);
    if (result.delivered) throw new Error('unreachable');
    expect(result.reason).toBe('network');
  });

  it('rejects an invalid recipient before dialling out', async () => {
    const result = await sendSupportEmail({ ...input(), to: 'garbage' });
    expect(result).toMatchObject({ delivered: false, reason: 'invalid_recipient' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
