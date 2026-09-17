import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import {
  GOOGLE_CALENDAR_CHANNEL_SECRET_ENV,
  googleCalendarChannelToken,
} from '@/lib/triggers/trigger-signatures';
import { POST } from './route';

const CHANNEL_ID = '11111111-1111-4111-8111-111111111111';

function notification(headers: Record<string, string>) {
  return new NextRequest('https://agiworkforce.com/api/webhooks/google-calendar', {
    method: 'POST',
    headers,
  });
}

function signedHeaders(state = 'exists', channelId = CHANNEL_ID) {
  return {
    'x-goog-channel-id': channelId,
    'x-goog-channel-token': googleCalendarChannelToken(channelId) ?? '',
    'x-goog-resource-state': state,
    'x-goog-message-number': '7',
    'x-goog-resource-id': 'resource-1',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv(GOOGLE_CALENDAR_CHANNEL_SECRET_ENV, 'calendar-secret');
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.ingestTriggerEvent.mockResolvedValue([
    { triggerId: CHANNEL_ID, outcome: 'enqueued', detail: null },
  ]);
});

describe('POST /api/webhooks/google-calendar', () => {
  it('refuses notifications when the channel secret is unset', async () => {
    const headers = signedHeaders();
    vi.stubEnv(GOOGLE_CALENDAR_CHANNEL_SECRET_ENV, '');

    expect((await POST(notification(headers))).status).toBe(503);
    expect(mocks.ingestTriggerEvent).not.toHaveBeenCalled();
  });

  it('refuses a channel token that was not derived for that channel', async () => {
    const response = await POST(
      notification({ ...signedHeaders(), 'x-goog-channel-token': 'not-the-token' }),
    );

    expect(response.status).toBe(401);
    expect(mocks.ingestTriggerEvent).not.toHaveBeenCalled();
  });

  it('refuses a channel id that is not a trigger id', async () => {
    expect((await POST(notification(signedHeaders('exists', 'channel-1')))).status).toBe(400);
  });

  it('acknowledges the sync notice a new channel opens with', async () => {
    const response = await POST(notification(signedHeaders('sync')));

    await expect(response.json()).resolves.toEqual({ received: true, state: 'sync' });
    expect(mocks.ingestTriggerEvent).not.toHaveBeenCalled();
  });

  it('routes a change to the trigger the channel belongs to', async () => {
    const response = await POST(notification(signedHeaders('exists')));

    expect(response.status).toBe(200);
    expect(mocks.ingestTriggerEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: 'google_calendar',
        type: 'events.changed',
        triggerId: CHANNEL_ID,
        deliveryId: `${CHANNEL_ID}:7`,
      }),
    );
  });
});
