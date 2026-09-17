import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  ingestTriggerEvent: vi.fn(),
  getNeonDb: vi.fn(() => ({})),
  verifyIdentity: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mocks.getNeonDb }));
vi.mock('@/lib/triggers/trigger-ingest', () => ({ ingestTriggerEvent: mocks.ingestTriggerEvent }));
vi.mock('@/lib/server/google-pubsub-push-identity', () => ({
  verifyGooglePubSubPushIdentity: mocks.verifyIdentity,
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

function push(notification: Record<string, unknown>) {
  return new NextRequest('https://agiworkforce.com/api/webhooks/gmail', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
    body: JSON.stringify({
      message: {
        data: Buffer.from(JSON.stringify(notification)).toString('base64'),
        messageId: 'msg-1',
        publishTime: '2026-09-17T00:00:00.000Z',
      },
      subscription: 'projects/p/subscriptions/s',
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.verifyIdentity.mockResolvedValue({
    ok: true,
    email: 'pubsub@example.iam.gserviceaccount.com',
  });
  mocks.ingestTriggerEvent.mockResolvedValue([
    { triggerId: 't1', outcome: 'enqueued', detail: null },
  ]);
});

describe('POST /api/webhooks/gmail', () => {
  it('refuses the push when the audience or service account is unset', async () => {
    mocks.verifyIdentity.mockResolvedValue({ ok: false, reason: 'not_configured' });

    const response = await POST(push({ emailAddress: 'me@example.com', historyId: 1 }));

    expect(response.status).toBe(503);
    expect(mocks.ingestTriggerEvent).not.toHaveBeenCalled();
  });

  it('refuses a token Google did not sign for this deployment', async () => {
    mocks.verifyIdentity.mockResolvedValue({ ok: false, reason: 'invalid_token' });

    expect((await POST(push({ emailAddress: 'me@example.com', historyId: 1 }))).status).toBe(401);
  });

  it('refuses a notification that is not a Gmail mailbox notice', async () => {
    const response = await POST(push({ nothing: true }));

    expect(response.status).toBe(400);
    expect(mocks.ingestTriggerEvent).not.toHaveBeenCalled();
  });

  it('routes a verified notice to the mailbox that changed', async () => {
    const response = await POST(push({ emailAddress: 'Me@Example.com', historyId: 987 }));

    expect(response.status).toBe(200);
    expect(mocks.ingestTriggerEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: 'gmail',
        type: 'mailbox.changed',
        account: 'me@example.com',
        deliveryId: 'msg-1',
        data: { emailAddress: 'me@example.com', historyId: '987' },
      }),
    );
  });
});
