import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { sendBulkTransactionalEmail } from '../resend-client';

const fetchMock = vi.fn();

function ok(id: string) {
  return { ok: true, status: 200, json: async () => ({ id }), text: async () => '' };
}

function rejected(status: number, body: string) {
  return { ok: false, status, json: async () => ({}), text: async () => body };
}

function campaign(recipients: string[]) {
  return {
    from: 'security@agiworkforce.com',
    recipients,
    subject: 'Important: a security incident affected your AGI account',
    text: 'notice',
    html: '<p>notice</p>',
    campaignId: 'breach-2026-08-15',
    maxPerSecond: 1000,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('sendBulkTransactionalEmail', () => {
  it('mails every address in an arbitrary list and reports the count notified', async () => {
    fetchMock.mockImplementation(async () => ok('msg'));

    const result = await sendBulkTransactionalEmail(
      campaign(['a@example.com', 'b@example.com', 'c@example.com']),
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ attempted: 3, delivered: 3, failed: 0 });
    expect(result.outcomes.map((outcome) => outcome.to)).toEqual([
      'a@example.com',
      'b@example.com',
      'c@example.com',
    ]);
    const recipients = fetchMock.mock.calls.map(
      (call) => JSON.parse(String((call[1] as { body: string }).body)).to[0] as string,
    );
    expect(recipients).toEqual(['a@example.com', 'b@example.com', 'c@example.com']);
  });

  it('keeps going after a recipient fails and names who was not reached', async () => {
    fetchMock
      .mockResolvedValueOnce(ok('msg-1'))
      .mockResolvedValueOnce(rejected(422, 'invalid recipient'))
      .mockResolvedValueOnce(ok('msg-3'));

    const result = await sendBulkTransactionalEmail(
      campaign(['a@example.com', 'b@example.com', 'c@example.com']),
    );

    expect(result).toMatchObject({ attempted: 3, delivered: 2, failed: 1 });
    const unreached = result.outcomes.filter((outcome) => !outcome.delivered);
    expect(unreached).toHaveLength(1);
    expect(unreached[0]!.to).toBe('b@example.com');
    expect(unreached[0]).toMatchObject({ delivered: false, reason: 'rejected' });
  });

  it('records an unmailable address instead of silently dropping it', async () => {
    fetchMock.mockImplementation(async () => ok('msg'));

    const result = await sendBulkTransactionalEmail(campaign(['a@example.com', 'garbage']));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ attempted: 2, delivered: 1, failed: 1 });
    expect(result.outcomes[1]).toMatchObject({
      to: 'garbage',
      delivered: false,
      reason: 'invalid_recipient',
    });
  });

  it('deduplicates addresses case-insensitively so nobody is mailed twice', async () => {
    fetchMock.mockImplementation(async () => ok('msg'));

    const result = await sendBulkTransactionalEmail(
      campaign(['A@Example.com', 'a@example.com', ' a@example.com ', 'b@example.com']),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.attempted).toBe(2);
  });

  it('gives each recipient a stable per-campaign idempotency key so a re-run cannot double-send', async () => {
    fetchMock.mockImplementation(async () => ok('msg'));

    await sendBulkTransactionalEmail(campaign(['a@example.com', 'b@example.com']));
    const first = fetchMock.mock.calls.map(
      (call) => (call[1] as { headers: Record<string, string> }).headers['idempotency-key']!,
    );

    fetchMock.mockClear();
    await sendBulkTransactionalEmail(campaign(['a@example.com', 'b@example.com']));
    const second = fetchMock.mock.calls.map(
      (call) => (call[1] as { headers: Record<string, string> }).headers['idempotency-key']!,
    );

    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(2);
    for (const key of first) {
      expect(key.startsWith('breach-2026-08-15:')).toBe(true);
      expect(key.length).toBeLessThanOrEqual(256);
    }
  });

  it('refuses the whole run without touching the network when the sender is unusable', async () => {
    const result = await sendBulkTransactionalEmail({
      ...campaign(['a@example.com', 'b@example.com']),
      from: 'not-an-address',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ attempted: 2, delivered: 0, failed: 2 });
    for (const outcome of result.outcomes) {
      expect(outcome).toMatchObject({ delivered: false, reason: 'not_configured' });
    }
  });

  it('reports every recipient as unreached when the key is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    const result = await sendBulkTransactionalEmail(campaign(['a@example.com', 'b@example.com']));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ attempted: 2, delivered: 0, failed: 2 });
  });

  it('throttles sends so the provider rate limit does not drop notices', async () => {
    fetchMock.mockImplementation(async () => ok('msg'));

    const started = Date.now();
    await sendBulkTransactionalEmail({
      ...campaign(['a@example.com', 'b@example.com', 'c@example.com']),
      maxPerSecond: 20,
    });

    expect(Date.now() - started).toBeGreaterThanOrEqual(90);
  });

  it('streams each outcome to the caller for incident evidence', async () => {
    fetchMock.mockImplementation(async () => ok('msg'));
    const seen: string[] = [];

    await sendBulkTransactionalEmail({
      ...campaign(['a@example.com', 'b@example.com']),
      onOutcome: (outcome) => {
        seen.push(outcome.to);
      },
    });

    expect(seen).toEqual(['a@example.com', 'b@example.com']);
  });
});
