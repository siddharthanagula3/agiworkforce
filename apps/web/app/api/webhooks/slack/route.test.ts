import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  ingestTriggerEvent: vi.fn(),
  getNeonDb: vi.fn(() => ({})),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mocks.getNeonDb }));
vi.mock('@/lib/triggers/trigger-ingest', () => ({ ingestTriggerEvent: mocks.ingestTriggerEvent }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const SECRET = 'slack-signing-secret';

function signed(body: string, timestampSeconds = Math.floor(Date.now() / 1000)) {
  const signature = `v0=${createHmac('sha256', SECRET)
    .update(`v0:${timestampSeconds}:${body}`)
    .digest('hex')}`;
  return new NextRequest('https://agiworkforce.com/api/webhooks/slack', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-slack-request-timestamp': String(timestampSeconds),
      'x-slack-signature': signature,
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('SLACK_SIGNING_SECRET', SECRET);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.ingestTriggerEvent.mockResolvedValue([
    { triggerId: 't1', outcome: 'enqueued', detail: null },
  ]);
});

describe('POST /api/webhooks/slack', () => {
  it('refuses every event when the signing secret is unset', async () => {
    vi.stubEnv('SLACK_SIGNING_SECRET', '');

    const response = await POST(signed('{"type":"event_callback"}'));

    expect(response.status).toBe(503);
    expect(mocks.ingestTriggerEvent).not.toHaveBeenCalled();
  });

  it('refuses a body whose signature does not match', async () => {
    const request = new NextRequest('https://agiworkforce.com/api/webhooks/slack', {
      method: 'POST',
      headers: {
        'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-slack-signature': 'v0=deadbeef',
      },
      body: '{"type":"event_callback"}',
    });

    expect((await POST(request)).status).toBe(401);
    expect(mocks.ingestTriggerEvent).not.toHaveBeenCalled();
  });

  it('refuses a replayed request signed outside the five minute window', async () => {
    const response = await POST(signed('{"type":"event_callback"}', 1_000));

    expect(response.status).toBe(401);
  });

  it('answers the url_verification handshake without ingesting anything', async () => {
    const response = await POST(
      signed(JSON.stringify({ type: 'url_verification', challenge: 'abc123' })),
    );

    await expect(response.json()).resolves.toEqual({ challenge: 'abc123' });
    expect(mocks.ingestTriggerEvent).not.toHaveBeenCalled();
  });

  it('hands a verified event to the trigger ingest with the workspace it came from', async () => {
    const body = JSON.stringify({
      type: 'event_callback',
      team_id: 't0123abcd',
      event_id: 'Ev123',
      event_time: 1_789_000_000,
      event: { type: 'app_mention', channel: 'C1', user: 'U1', text: 'hello' },
    });

    const response = await POST(signed(body));

    expect(response.status).toBe(200);
    expect(mocks.ingestTriggerEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: 'slack',
        type: 'app_mention',
        account: 'T0123ABCD',
        deliveryId: 'Ev123',
        data: expect.objectContaining({ text: 'hello' }),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({ received: true, queued: 1 });
  });

  it('never runs an agent inline: it only records what it queued', async () => {
    const body = JSON.stringify({
      type: 'event_callback',
      team_id: 'T0123ABCD',
      event_id: 'Ev124',
      event: { type: 'message', text: 'hi' },
    });

    await expect((await POST(signed(body))).json()).resolves.toEqual({
      received: true,
      matched: 1,
      queued: 1,
    });
  });
});
