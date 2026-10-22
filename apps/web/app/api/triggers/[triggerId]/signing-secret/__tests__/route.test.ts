import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  getUserScopedDb: vi.fn(),
  recordAuditEvent: vi.fn(),
  userDb: { query: vi.fn() },
  serviceDb: { query: vi.fn() },
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/rls-db')>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/neon-db')>()),
  getNeonDb: () => mocks.serviceDb,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));

import {
  EVENT_TRIGGER_SIGNING_SECRET_ENV,
  connectorTriggerSecret,
} from '@/lib/triggers/trigger-signatures';
import { POST } from '../route';

const TRIGGER_ID = '77777777-7777-4777-8777-777777777777';

function row(patch: Record<string, unknown> = {}) {
  return {
    id: TRIGGER_ID,
    user_id: 'user_1',
    organization_id: null,
    task_id: '22222222-2222-4222-8222-222222222222',
    name: 'Invoices',
    source: 'connector',
    event_types: ['*'],
    source_account: null,
    conditions: [],
    debounce_seconds: 0,
    max_attempts: 3,
    is_enabled: true,
    verification_status: 'verified',
    verified_at: null,
    last_fired_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    signing_salt: null,
    ...patch,
  };
}

function request(triggerId = TRIGGER_ID): [NextRequest, never] {
  return [
    new NextRequest(`http://localhost/api/triggers/${triggerId}/signing-secret`, {
      method: 'POST',
    }),
    { params: Promise.resolve({ triggerId }) } as never,
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv(EVENT_TRIGGER_SIGNING_SECRET_ENV, 'deployment-secret');
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({
    db: mocks.userDb,
    userId: 'user_1',
    organizationId: null,
  });
  mocks.userDb.query.mockResolvedValue([row()]);
  mocks.serviceDb.query.mockImplementation(async (_sql: string, values: unknown[]) => [
    row({ signing_salt: values[2] }),
  ]);
});

describe('POST /api/triggers/[triggerId]/signing-secret', () => {
  it('stops at the CSRF check bound to the user before touching the trigger', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(...request());

    expect(response.status).toBe(403);
    expect(mocks.requireCsrfToken).toHaveBeenCalledWith(expect.anything(), 'user_1');
    expect(mocks.userDb.query).not.toHaveBeenCalled();
    expect(mocks.serviceDb.query).not.toHaveBeenCalled();
  });

  it('refuses a trigger the caller does not own and rotates nothing', async () => {
    mocks.userDb.query.mockResolvedValue([]);

    const response = await POST(...request());

    expect(response.status).toBe(404);
    expect(mocks.serviceDb.query).not.toHaveBeenCalled();
  });

  it('refuses a trigger that has no signing secret', async () => {
    mocks.userDb.query.mockResolvedValue([row({ source: 'github', source_account: 'a/b' })]);

    const response = await POST(...request());

    expect(response.status).toBe(400);
    expect(mocks.serviceDb.query).not.toHaveBeenCalled();
  });

  it('writes a new salt for the owner and returns the secret it now verifies', async () => {
    const response = await POST(...request());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [sql, values] = mocks.serviceDb.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("where id = $1 and user_id = $2 and source = 'connector'");
    expect(values[0]).toBe(TRIGGER_ID);
    expect(values[1]).toBe('user_1');
    const salt = values[2] as string;
    expect(salt).toMatch(/^[0-9a-f]{64}$/);

    const body = (await response.json()) as { signingSecret: string; webhookPath: string };
    expect(body.signingSecret).toBe(connectorTriggerSecret(TRIGGER_ID, salt));
    expect(body.signingSecret).not.toBe(connectorTriggerSecret(TRIGGER_ID));
    expect(body.webhookPath).toBe(`/api/webhooks/connectors/${TRIGGER_ID}`);
    expect(JSON.stringify(body)).not.toContain(salt);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'event_trigger_updated',
        detail: expect.objectContaining({ changedKeys: ['signingSecret'] }),
      }),
    );
  });

  it('gives a different secret on every regeneration', async () => {
    const first = (await (await POST(...request())).json()) as { signingSecret: string };
    const second = (await (await POST(...request())).json()) as { signingSecret: string };

    expect(first.signingSecret).not.toBe(second.signingSecret);
  });
});
