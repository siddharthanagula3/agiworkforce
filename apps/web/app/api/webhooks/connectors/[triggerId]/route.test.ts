import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  ingestTriggerEvent: vi.fn(),
  saltQuery: vi.fn(),
  getNeonDb: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: mocks.getNeonDb,
}));
vi.mock('@/lib/triggers/trigger-ingest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/triggers/trigger-ingest')>()),
  ingestTriggerEvent: mocks.ingestTriggerEvent,
}));

import { NextRequest } from 'next/server';
import {
  EVENT_TRIGGER_SIGNING_SECRET_ENV,
  connectorTriggerSecret,
} from '@/lib/triggers/trigger-signatures';
import { POST } from './route';

const TRIGGER_ID = '11111111-1111-4111-8111-111111111111';

function request(
  body: string,
  options: { signature?: string; timestamp?: number; salt?: string | null } = {},
) {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const secret = connectorTriggerSecret(TRIGGER_ID, options.salt ?? null) ?? 'unset';
  const signature =
    options.signature ??
    `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
  return new NextRequest(`https://agiworkforce.com/api/webhooks/connectors/${TRIGGER_ID}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-agi-timestamp': String(timestamp),
      'x-agi-signature': signature,
    },
    body,
  });
}

function params(triggerId = TRIGGER_ID) {
  return { params: Promise.resolve({ triggerId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv(EVENT_TRIGGER_SIGNING_SECRET_ENV, 'deployment-secret');
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getNeonDb.mockReturnValue({ query: mocks.saltQuery });
  mocks.saltQuery.mockResolvedValue([{ signing_salt: null }]);
  mocks.ingestTriggerEvent.mockResolvedValue([
    { triggerId: TRIGGER_ID, outcome: 'enqueued', detail: null },
  ]);
});

describe('POST /api/webhooks/connectors/[triggerId]', () => {
  it('refuses every event when the deployment signing key is unset', async () => {
    const signed = request(JSON.stringify({ id: 'e1', type: 'invoice.paid' }));
    vi.stubEnv(EVENT_TRIGGER_SIGNING_SECRET_ENV, '');

    expect((await POST(signed, params())).status).toBe(503);
    expect(mocks.ingestTriggerEvent).not.toHaveBeenCalled();
  });

  it('refuses a signature made for another trigger', async () => {
    const body = JSON.stringify({ id: 'e1', type: 'invoice.paid' });
    const timestamp = Math.floor(Date.now() / 1000);
    const otherSecret = createHmac('sha256', 'deployment-secret')
      .update('connector-trigger:22222222-2222-4222-8222-222222222222')
      .digest('hex');
    const signature = `sha256=${createHmac('sha256', otherSecret)
      .update(`${timestamp}.${body}`)
      .digest('hex')}`;

    const response = await POST(request(body, { signature, timestamp }), params());

    expect(response.status).toBe(401);
    expect(mocks.ingestTriggerEvent).not.toHaveBeenCalled();
  });

  it('refuses a body without an id and a type', async () => {
    const response = await POST(request(JSON.stringify({ type: 'invoice.paid' })), params());

    expect(response.status).toBe(400);
  });

  it('refuses a trigger id that is not a uuid before reading anything', async () => {
    const response = await POST(request('{}'), params('not-a-uuid'));

    expect(response.status).toBe(400);
  });

  it('routes a signed event to the trigger that owns the secret', async () => {
    const body = JSON.stringify({ id: 'e1', type: 'invoice.paid', data: { amount: 10 } });

    const response = await POST(request(body), params());

    expect(response.status).toBe(200);
    expect(mocks.ingestTriggerEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: 'connector',
        type: 'invoice.paid',
        deliveryId: 'e1',
        triggerId: TRIGGER_ID,
        data: { amount: 10 },
      }),
    );
  });

  it('accepts a trigger that was never rotated with its original secret', async () => {
    const body = JSON.stringify({ id: 'e2', type: 'invoice.paid' });

    const response = await POST(request(body), params());

    expect(response.status).toBe(200);
    expect(mocks.saltQuery).toHaveBeenCalledWith(expect.stringContaining('signing_salt'), [
      TRIGGER_ID,
    ]);
  });

  it('rejects the previous secret as soon as the trigger is rotated, and accepts the new one', async () => {
    const salt = 'a'.repeat(64);
    mocks.saltQuery.mockResolvedValue([{ signing_salt: salt }]);
    const body = JSON.stringify({ id: 'e3', type: 'invoice.paid' });

    const withOld = await POST(request(body), params());
    expect(withOld.status).toBe(401);
    expect(mocks.ingestTriggerEvent).not.toHaveBeenCalled();

    const withNew = await POST(request(body, { salt }), params());
    expect(withNew.status).toBe(200);
    expect(mocks.ingestTriggerEvent).toHaveBeenCalledTimes(1);
  });

  it('refuses every event when the salt cannot be read', async () => {
    mocks.saltQuery.mockRejectedValue(new Error('connection reset'));

    const response = await POST(request(JSON.stringify({ id: 'e4', type: 'x' })), params());

    expect(response.status).toBe(503);
    expect(mocks.ingestTriggerEvent).not.toHaveBeenCalled();
  });

  it('refuses a trigger id that names no connector trigger', async () => {
    mocks.saltQuery.mockResolvedValue([]);

    const response = await POST(request(JSON.stringify({ id: 'e5', type: 'x' })), params());

    expect(response.status).toBe(401);
    expect(mocks.ingestTriggerEvent).not.toHaveBeenCalled();
  });
});
