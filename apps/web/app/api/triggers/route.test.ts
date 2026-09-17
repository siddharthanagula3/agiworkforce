import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  getUserScopedDb: vi.fn(),
  createTrigger: vi.fn(),
  listTriggers: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/triggers/trigger-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/triggers/trigger-service')>();
  return { ...actual, createTrigger: mocks.createTrigger, listTriggers: mocks.listTriggers };
});

import { NextRequest } from 'next/server';
import { TriggerValidationError } from '@/lib/triggers/trigger-service';
import { GET, POST } from './route';

const TASK_ID = '22222222-2222-4222-8222-222222222222';
const TRIGGER_ID = '11111111-1111-4111-8111-111111111111';

const trigger = {
  id: TRIGGER_ID,
  userId: 'user-1',
  organizationId: null,
  taskId: TASK_ID,
  name: 'CI failed',
  source: 'connector' as const,
  eventTypes: ['*'],
  sourceAccount: null,
  conditions: [],
  debounceSeconds: 0,
  maxAttempts: 5,
  isEnabled: true,
  verificationStatus: 'verified' as const,
  verifiedAt: null,
  lastFiredAt: null,
  createdAt: '2026-09-17T00:00:00.000Z',
  updatedAt: '2026-09-17T00:00:00.000Z',
};

function request(body?: unknown, search = '') {
  return new NextRequest(`https://agiworkforce.com/api/triggers${search}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
  mocks.listTriggers.mockResolvedValue([trigger]);
  mocks.createTrigger.mockResolvedValue({
    trigger,
    verificationCode: null,
    signingSecret: 'derived-secret',
  });
});

describe('GET /api/triggers', () => {
  it('lists the triggers of the signed-in account, optionally for one schedule', async () => {
    const response = await GET(request(undefined, `?taskId=${TASK_ID}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ triggers: [{ id: TRIGGER_ID }] });
    expect(mocks.listTriggers).toHaveBeenCalledWith(
      {},
      'user-1',
      expect.objectContaining({ taskId: TASK_ID }),
    );
  });
});

describe('POST /api/triggers', () => {
  it('requires a CSRF token before creating anything', async () => {
    mocks.requireCsrfToken.mockResolvedValue(
      new Response(JSON.stringify({ error: 'csrf' }), { status: 403 }),
    );

    const response = await POST(
      request({ taskId: TASK_ID, name: 'x', source: 'connector', eventTypes: ['*'] }),
    );

    expect(response.status).toBe(403);
    expect(mocks.createTrigger).not.toHaveBeenCalled();
  });

  it('creates the trigger, audits it, and returns its endpoint and one-time secret', async () => {
    const response = await POST(
      request({ taskId: TASK_ID, name: 'CI failed', source: 'connector', eventTypes: ['*'] }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      trigger: { id: TRIGGER_ID },
      signingSecret: 'derived-secret',
      webhookPath: `/api/webhooks/connectors/${TRIGGER_ID}`,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'event_trigger_created', userId: 'user-1' }),
    );
  });

  it('answers a rejected trigger as a validation error, not a server error', async () => {
    mocks.createTrigger.mockRejectedValue(new TriggerValidationError('source is invalid'));

    const response = await POST(
      request({ taskId: TASK_ID, name: 'x', source: 'nope', eventTypes: ['*'] }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining('source is invalid') },
    });
  });
});
