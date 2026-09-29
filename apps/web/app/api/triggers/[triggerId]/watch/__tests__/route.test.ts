import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class TriggerNotFoundError extends Error {}
  class TriggerValidationError extends Error {}
  class TriggerLimitError extends Error {}
  return {
    TriggerNotFoundError,
    TriggerValidationError,
    TriggerLimitError,
    withRateLimit: vi.fn(),
    requireCsrfToken: vi.fn(),
    getUserScopedDb: vi.fn(),
    getTrigger: vi.fn(),
    registerGmailWatch: vi.fn(),
    recordAuditEvent: vi.fn(),
    neonDb: { query: vi.fn() },
  };
});

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.neonDb }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('@/lib/triggers/gmail-watch', () => ({ registerGmailWatch: mocks.registerGmailWatch }));
vi.mock('@/lib/triggers/trigger-service', () => ({
  TriggerNotFoundError: mocks.TriggerNotFoundError,
  TriggerValidationError: mocks.TriggerValidationError,
  TriggerLimitError: mocks.TriggerLimitError,
  getTrigger: mocks.getTrigger,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const TRIGGER_ID = '66666666-6666-4666-8666-666666666666';
const db = { query: vi.fn() };
const GMAIL_TRIGGER = { id: TRIGGER_ID, name: 'Inbox', source: 'gmail', isEnabled: true };

function request(triggerId = TRIGGER_ID): [NextRequest, never] {
  return [
    new NextRequest(`http://localhost/api/triggers/${triggerId}/watch`, { method: 'POST' }),
    { params: Promise.resolve({ triggerId }) } as never,
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user_1', organizationId: 'org_1' });
  mocks.getTrigger.mockResolvedValue(GMAIL_TRIGGER);
  mocks.registerGmailWatch.mockResolvedValue({ ...GMAIL_TRIGGER, watchExpiresAt: 'later' });
});

describe('POST /api/triggers/[triggerId]/watch', () => {
  it('answers 401 when there is no session', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await POST(...request());

    expect(response.status).toBe(401);
    expect(mocks.registerGmailWatch).not.toHaveBeenCalled();
  });

  it('stops at the CSRF check bound to the user', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(...request());

    expect(response.status).toBe(403);
    expect(mocks.requireCsrfToken).toHaveBeenCalledWith(expect.anything(), 'user_1');
    expect(mocks.getTrigger).not.toHaveBeenCalled();
  });

  it('rejects a trigger id that is not a uuid', async () => {
    const response = await POST(...request('nope'));

    expect(response.status).toBe(400);
    expect(mocks.getTrigger).not.toHaveBeenCalled();
  });

  it('answers 404 for a trigger the caller does not own', async () => {
    mocks.getTrigger.mockRejectedValue(new mocks.TriggerNotFoundError());

    const response = await POST(...request());

    expect(response.status).toBe(404);
    expect(mocks.registerGmailWatch).not.toHaveBeenCalled();
  });

  it('refuses a trigger that is not Gmail', async () => {
    mocks.getTrigger.mockResolvedValue({ ...GMAIL_TRIGGER, source: 'webhook' });

    const response = await POST(...request());

    expect(response.status).toBe(400);
    expect(mocks.registerGmailWatch).not.toHaveBeenCalled();
  });

  it('refuses a disabled trigger', async () => {
    mocks.getTrigger.mockResolvedValue({ ...GMAIL_TRIGGER, isEnabled: false });

    const response = await POST(...request());

    expect(response.status).toBe(400);
    expect(mocks.registerGmailWatch).not.toHaveBeenCalled();
  });

  it('restarts the watch for the owner and audits it', async () => {
    const response = await POST(...request());

    expect(response.status).toBe(200);
    expect(mocks.getTrigger).toHaveBeenCalledWith(db, 'user_1', TRIGGER_ID);
    expect(mocks.registerGmailWatch).toHaveBeenCalledWith(mocks.neonDb, GMAIL_TRIGGER, {
      restart: true,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        organizationId: 'org_1',
        eventType: 'event_trigger_updated',
        detail: expect.objectContaining({ resourceId: TRIGGER_ID, changedKeys: ['watch'] }),
      }),
    );
    expect(await response.json()).toEqual({
      trigger: { ...GMAIL_TRIGGER, watchExpiresAt: 'later' },
    });
  });
});
