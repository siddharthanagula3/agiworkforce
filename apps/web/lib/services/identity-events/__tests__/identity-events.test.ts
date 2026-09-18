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
