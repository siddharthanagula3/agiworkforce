import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  notify: vi.fn(),
  compromiseNotice: vi.fn(),
  observe: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  getClientIp: vi.fn(() => undefined),
  recordAuditEvent: (...args: unknown[]) => mocks.audit(...args),
}));
vi.mock('@/lib/server/risk-signals', () => ({
  recordIdentityObservation: (...args: unknown[]) => mocks.observe(...args),
}));
vi.mock('@/lib/server/session-revocation', () => ({
  revokeEveryOtherSession: (...args: unknown[]) => mocks.revoke(...args),
}));
vi.mock('@/lib/services/account-activity-notifications', () => ({
  notifyIdentitySecurityEvent: (...args: unknown[]) => mocks.notify(...args),
  notifyAccountCompromiseContained: (...args: unknown[]) => mocks.compromiseNotice(...args),
}));

import {
  ACCOUNT_COMPROMISE_SUPPORT_PATH,
  emitIdentitySecurityEvent,
  handleIdentitySecurityEvent,
  IDENTITY_SECURITY_EVENT_KEYS,
  readOpenCompromiseResponse,
  resolveCompromiseResponse,
  respondToAccountCompromise,
} from '../index';

const query = vi.fn();
const execute = vi.fn();
const db = { query, execute } as never;
const identity = {} as never;

function auditTypes(): string[] {
  return mocks.audit.mock.calls.map(([event]) => event.eventType);
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  query.mockReset().mockResolvedValue([{ id: 'resp-1' }]);
  execute.mockReset().mockResolvedValue(undefined);
  mocks.observe.mockResolvedValue({ level: 'none', signals: [] });
  mocks.audit.mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue(undefined);
  mocks.compromiseNotice.mockResolvedValue(undefined);
  mocks.revoke.mockResolvedValue({
    ended: ['s1', 's2'],
    alreadyGone: [],
    failed: [],
    currentSession: undefined,
    incomplete: false,
    targetCount: 2,
  });
});

describe('emitIdentitySecurityEvent', () => {
  it('notifies, audits and observes every catalogue event', async () => {
    for (const event of IDENTITY_SECURITY_EVENT_KEYS) {
      await emitIdentitySecurityEvent(db, { userId: 'user-1', event });
    }

    expect(mocks.notify).toHaveBeenCalledTimes(IDENTITY_SECURITY_EVENT_KEYS.length);
    expect(mocks.observe).toHaveBeenCalledTimes(IDENTITY_SECURITY_EVENT_KEYS.length);
    expect(mocks.audit).toHaveBeenCalledTimes(IDENTITY_SECURITY_EVENT_KEYS.length);
  });

  it('records the trail even when the notification path fails', async () => {
    mocks.notify.mockRejectedValueOnce(new Error('notifications down'));

    await emitIdentitySecurityEvent(db, { userId: 'user-1', event: 'password_changed' });

    expect(auditTypes()).toEqual(['password_changed']);
  });

  it('adds a risk-signal event when the engine fires', async () => {
    mocks.observe.mockResolvedValueOnce({ level: 'elevated', signals: ['new_device'] });

    await emitIdentitySecurityEvent(db, { userId: 'user-1', event: 'new_sign_in' });

    expect(auditTypes()).toEqual(['login', 'risk_signal_detected']);
    expect(mocks.audit.mock.calls[1]![0].detail).toMatchObject({
      status: 'elevated',
      changedKeys: ['new_device'],
    });
  });
});

describe('respondToAccountCompromise', () => {
  it('ends every session, including the one that asked', async () => {
    const response = await respondToAccountCompromise(db, identity, {
      userId: 'user-1',
      trigger: 'reported',
    });

    expect(mocks.revoke).toHaveBeenCalledWith(identity, 'user-1', null);
    expect(response).toMatchObject({
      responseId: 'resp-1',
      sessionsRevoked: 2,
      passwordResetRequired: true,
      supportPath: ACCOUNT_COMPROMISE_SUPPORT_PATH,
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('update public.account_compromise_responses'),
      ['resp-1', 'user-1', 2, 0],
    );
  });

  it('revokes the device credentials the provider sweep leaves behind', async () => {
    query
      .mockResolvedValueOnce([{ id: 'resp-1' }])
      .mockResolvedValueOnce([{ id: 'tok-1' }, { id: 'tok-2' }]);

    const response = await respondToAccountCompromise(db, identity, {
      userId: 'user-1',
      trigger: 'reported',
    });

    const revocation = query.mock.calls.find(([sql]) =>
      String(sql).includes('update device_refresh_tokens'),
    );
    expect(revocation, 'nothing revoked the device refresh tokens').toBeDefined();
    expect(String(revocation?.[0])).toContain('revoked_at is null');
    expect(revocation?.[1]).toEqual(['user-1']);
    expect(response.deviceCredentialsRevoked).toBe(2);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'account_compromise_contained',
        detail: expect.objectContaining({ deleted: 2 }),
      }),
    );
  });

  it('records the report and the containment separately', async () => {
    await respondToAccountCompromise(db, identity, { userId: 'user-1', trigger: 'reported' });

    expect(auditTypes()).toEqual(['account_compromise_reported', 'account_compromise_contained']);
    expect(mocks.compromiseNotice).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      responseId: 'resp-1',
      sessionsRevoked: 2,
    });
  });

  it('reports a failure when the provider left sessions alive', async () => {
    mocks.revoke.mockResolvedValueOnce({
      ended: [],
      alreadyGone: [],
      failed: ['s1'],
      currentSession: undefined,
      incomplete: true,
      targetCount: 1,
    });

    await respondToAccountCompromise(db, identity, {
      userId: 'user-1',
      trigger: 'impossible_travel',
    });

    const contained = mocks.audit.mock.calls.find(
      ([event]) => event.eventType === 'account_compromise_contained',
    )![0];
    expect(contained.outcome).toBe('failure');
    expect(contained.detail).toMatchObject({ status: 'incomplete', reason: 'impossible_travel' });
  });
});

describe('handleIdentitySecurityEvent', () => {
  it('runs the guided response itself on a compromise signal', async () => {
    mocks.observe.mockResolvedValueOnce({ level: 'compromise', signals: ['impossible_travel'] });

    const result = await handleIdentitySecurityEvent(db, identity, {
      userId: 'user-1',
      event: 'new_sign_in',
    });

    expect(mocks.revoke).toHaveBeenCalledWith(identity, 'user-1', null);
    expect(result.response).toMatchObject({ passwordResetRequired: true });
    expect(auditTypes()).toContain('account_compromise_contained');
  });

  it('leaves an elevated signal alone', async () => {
    mocks.observe.mockResolvedValueOnce({ level: 'elevated', signals: ['new_location'] });

    const result = await handleIdentitySecurityEvent(db, identity, {
      userId: 'user-1',
      event: 'new_sign_in',
    });

    expect(result.response).toBeNull();
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
});

describe('readOpenCompromiseResponse', () => {
  it('gives the support path with the open response', async () => {
    query.mockResolvedValueOnce([
      {
        id: 'resp-1',
        trigger: 'impossible_travel',
        password_reset_required: true,
        opened_at: '2026-09-18T12:00:00.000Z',
      },
    ]);

    await expect(readOpenCompromiseResponse(db, 'user-1')).resolves.toEqual({
      responseId: 'resp-1',
      trigger: 'impossible_travel',
      openedAt: '2026-09-18T12:00:00.000Z',
      passwordResetRequired: true,
      supportPath: ACCOUNT_COMPROMISE_SUPPORT_PATH,
    });
  });

  it('answers null when nothing is open', async () => {
    query.mockResolvedValueOnce([]);
    await expect(readOpenCompromiseResponse(db, 'user-1')).resolves.toBeNull();
  });
});

describe('resolveCompromiseResponse', () => {
  const OPENED_AT = '2026-09-18T12:00:00.000Z';
  const OPENED_MS = Date.parse(OPENED_AT);

  function openRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'resp-1',
      trigger: 'impossible_travel',
      opened_at: OPENED_AT,
      resolved_at: null,
      ...overrides,
    };
  }

  function provider(session: Record<string, unknown> | null) {
    return {
      getSession: vi.fn(async () => session),
      listUserSessions: vi.fn(),
      revokeSession: vi.fn(),
    } as never;
  }

  function resolve(identityStub: never, overrides: Record<string, unknown> = {}) {
    return resolveCompromiseResponse(db, identityStub, {
      userId: 'user-1',
      responseId: 'resp-1',
      currentSessionId: 'sess-new',
      secondFactorVerified: true,
      ...overrides,
    });
  }

  it('closes the response once the account has signed in again and nothing else survives', async () => {
    query.mockResolvedValueOnce([openRow()]).mockResolvedValueOnce([{ id: 'resp-1' }]);
    mocks.revoke.mockResolvedValue({
      ended: ['sess-old'],
      alreadyGone: [],
      failed: [],
      currentSession: undefined,
      incomplete: false,
      targetCount: 1,
    });

    const result = await resolve(
      provider({ id: 'sess-new', userId: 'user-1', createdAt: OPENED_MS + 60_000 }),
    );

    expect(result).toEqual({
      status: 'resolved',
      responseId: 'resp-1',
      outstanding: [],
      sessionsEnded: 1,
      supportPath: ACCOUNT_COMPROMISE_SUPPORT_PATH,
    });
    expect(query.mock.calls[1]?.[0]).toContain('password_reset_required = false');
    expect(query.mock.calls[1]?.[1]).toEqual(['resp-1', 'user-1']);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'account_compromise_resolved',
        outcome: 'success',
        detail: expect.objectContaining({ status: 'resolved', resourceId: 'resp-1' }),
      }),
    );
  });

  it('refuses a session that predates the response, so a surviving intruder cannot lift the lockdown', async () => {
    query.mockResolvedValueOnce([openRow()]);

    const result = await resolve(
      provider({ id: 'sess-old', userId: 'user-1', createdAt: OPENED_MS - 60_000 }),
      { currentSessionId: 'sess-old' },
    );

    expect(result.status).toBe('outstanding');
    expect(result.outstanding).toEqual(['fresh_authentication']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'account_compromise_resolved',
        outcome: 'denied',
        detail: expect.objectContaining({
          status: 'outstanding',
          changedKeys: ['fresh_authentication'],
        }),
      }),
    );
    expect(auditTypes()).not.toContain('account_compromise_contained');
  });

  it('refuses while a session the sweep could not end is still signed in', async () => {
    query.mockResolvedValueOnce([openRow()]);
    mocks.revoke.mockResolvedValue({
      ended: ['sess-a'],
      alreadyGone: [],
      failed: ['sess-b'],
      currentSession: undefined,
      incomplete: false,
      targetCount: 2,
    });

    const result = await resolve(
      provider({ id: 'sess-new', userId: 'user-1', createdAt: OPENED_MS + 1000 }),
    );

    expect(result.status).toBe('outstanding');
    expect(result.outstanding).toEqual(['other_sessions_ended']);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('cannot close a response that belongs to another account', async () => {
    query.mockResolvedValueOnce([]);

    const result = await resolve(
      provider({ id: 'sess-new', userId: 'user-1', createdAt: OPENED_MS + 1000 }),
      { responseId: 'someone-elses' },
    );

    expect(result.status).toBe('not_found');
    expect(query.mock.calls[0]?.[1]).toEqual(['someone-elses', 'user-1']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('refuses when the current session belongs to a different account', async () => {
    query.mockResolvedValueOnce([openRow()]);

    const result = await resolve(
      provider({ id: 'sess-new', userId: 'user-2', createdAt: OPENED_MS + 1000 }),
    );

    expect(result.outstanding).toEqual(['fresh_authentication']);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it('is a no-op on a response that is already closed', async () => {
    query.mockResolvedValueOnce([openRow({ resolved_at: '2026-09-18T13:00:00.000Z' })]);
    const identityStub = provider({
      id: 'sess-new',
      userId: 'user-1',
      createdAt: OPENED_MS + 1000,
    });

    const result = await resolve(identityStub);

    expect(result).toMatchObject({ status: 'already_resolved', outstanding: [] });
    expect(query).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('refuses a caller with no session at all', async () => {
    query.mockResolvedValueOnce([openRow()]);

    const result = await resolve(provider(null), { currentSessionId: null });

    expect(result.outstanding).toEqual(['fresh_authentication']);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
});
