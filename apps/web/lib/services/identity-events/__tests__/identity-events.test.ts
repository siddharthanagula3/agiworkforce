import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/server/session-revocation');

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  notify: vi.fn(),
  compromiseNotice: vi.fn(),
  observe: vi.fn(),
  revoke: vi.fn(),
  finishIntent: vi.fn(),
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
vi.mock('@/lib/server/session-revocation', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  revokeEveryOtherSession: (...args: unknown[]) => mocks.revoke(...args),
  finishIntentRevocation: (...args: unknown[]) => mocks.finishIntent(...args),
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
  mocks.finishIntent.mockResolvedValue(true);
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
  it.each([
    [], null, undefined, {}, [null], [{}], [{ id: null }], [{ id: 1 }],
    [{ id: '' }], [{ id: '   ' }], [{ id: 'resp-1' }, { id: 'resp-2' }],
  ].map((receipt) => ({ receipt })))('stops before subsequent effects without one opener receipt $receipt', async ({ receipt }) => {
    query.mockResolvedValueOnce(receipt);

    await expect(respondToAccountCompromise(db, identity, {
      userId: 'user-1', trigger: 'reported',
    })).rejects.toMatchObject({
      statusCode: 503,
      userSafe: true,
      message: 'Could not confirm that the compromise response was recorded.',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.finishIntent).not.toHaveBeenCalled();
    expect(mocks.compromiseNotice).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.observe).not.toHaveBeenCalled();
  });

  it('requests a sweep without excluding the session that asked', async () => {
    const response = await respondToAccountCompromise(db, identity, {
      userId: 'user-1',
      trigger: 'reported',
    });

    expect(mocks.revoke).toHaveBeenCalledWith(identity, 'user-1', null, undefined);
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
      cleanupIncomplete: false,
    });
  });

  it.each([
    {
      source: 'no observed cleanup failure',
      failed: [],
      incomplete: false,
      intentRevoked: true,
      cleanupIncomplete: false,
    },
    {
      source: 'failed session revocation only',
      failed: ['s3'],
      incomplete: false,
      intentRevoked: true,
      cleanupIncomplete: true,
    },
    {
      source: 'incomplete sweep only',
      failed: [],
      incomplete: true,
      intentRevoked: true,
      cleanupIncomplete: true,
    },
    {
      source: 'unconfirmed intent revocation only',
      failed: [],
      incomplete: false,
      intentRevoked: false,
      cleanupIncomplete: true,
    },
  ])('shares the observed cleanup state for $source without changing sweep status semantics', async ({
    failed, incomplete, intentRevoked, cleanupIncomplete,
  }) => {
    mocks.revoke.mockResolvedValueOnce({
      ended: ['s1', 's2'],
      alreadyGone: ['s0'],
      failed,
      currentSession: undefined,
      incomplete,
      targetCount: 3 + failed.length,
    });
    mocks.finishIntent.mockResolvedValueOnce(intentRevoked);
    query.mockResolvedValueOnce([{ id: 'resp-1' }]).mockResolvedValueOnce([]);

    const response = await respondToAccountCompromise(db, identity, {
      userId: 'product-account',
      identitySubject: 'native-subject',
      trigger: 'reported',
    });

    expect(mocks.revoke).toHaveBeenCalledWith(identity, 'product-account', null, 'native-subject');
    expect(mocks.compromiseNotice).toHaveBeenCalledExactlyOnceWith(db, {
      userId: 'product-account',
      responseId: 'resp-1',
      sessionsRevoked: 2,
      cleanupIncomplete,
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'product-account',
      eventType: 'account_compromise_contained',
      outcome: cleanupIncomplete ? 'failure' : 'success',
      detail: expect.objectContaining({
        resourceId: 'resp-1',
        count: 2,
        status: incomplete ? 'incomplete' : 'complete',
      }),
    }));
    expect(response).toEqual({
      responseId: 'resp-1',
      sessionsRevoked: 2,
      sessionsFailed: failed.length,
      deviceCredentialsRevoked: 0,
      passwordResetRequired: true,
      supportPath: ACCOUNT_COMPROMISE_SUPPORT_PATH,
    });
  });

  it.each([true, false])('keeps the response and audit when the compromise notice fails (intent revoked: %s)', async (intentRevoked) => {
    mocks.finishIntent.mockResolvedValueOnce(intentRevoked);
    mocks.compromiseNotice.mockRejectedValueOnce(new Error('notifications down'));

    await expect(respondToAccountCompromise(db, identity, {
      userId: 'user-1', trigger: 'reported',
    })).resolves.toMatchObject({ responseId: 'resp-1', sessionsRevoked: 2 });

    expect(mocks.compromiseNotice).toHaveBeenCalledExactlyOnceWith(db, {
      userId: 'user-1', responseId: 'resp-1', sessionsRevoked: 2,
      cleanupIncomplete: !intentRevoked,
    });
    expect(auditTypes()).toEqual(['account_compromise_reported', 'account_compromise_contained']);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'account_compromise_contained',
      outcome: intentRevoked ? 'success' : 'failure',
      detail: expect.objectContaining({ status: 'complete' }),
    }));
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
  it('carries the native subject only to the provider sweep during conditional containment', async () => {
    mocks.observe.mockResolvedValueOnce({ level: 'compromise', signals: ['impossible_travel'] });

    await handleIdentitySecurityEvent(db, identity, {
      userId: 'product-account',
      identitySubject: 'native-subject',
      event: 'email_changed',
    });

    expect(mocks.revoke).toHaveBeenCalledExactlyOnceWith(
      identity, 'product-account', null, 'native-subject',
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.account_compromise_responses'),
      ['product-account', 'impossible_travel'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('update device_refresh_tokens'),
      ['product-account'],
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('update public.account_compromise_responses'),
      ['resp-1', 'product-account', 2, 0],
    );
    expect(mocks.observe).toHaveBeenCalledWith(
      db, expect.objectContaining({ userId: 'product-account' }),
    );
    expect(mocks.notify).toHaveBeenCalledWith(
      db, expect.objectContaining({ userId: 'product-account' }),
    );
    expect(mocks.compromiseNotice).toHaveBeenCalledWith(
      db, expect.objectContaining({ userId: 'product-account' }),
    );
    for (const [event] of mocks.audit.mock.calls) expect(event.userId).toBe('product-account');
  });

  it('runs the guided response itself on a compromise signal', async () => {
    mocks.observe.mockResolvedValueOnce({ level: 'compromise', signals: ['impossible_travel'] });

    const result = await handleIdentitySecurityEvent(db, identity, {
      userId: 'user-1',
      event: 'new_sign_in',
    });

    expect(mocks.revoke).toHaveBeenCalledWith(identity, 'user-1', null, undefined);
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
      password_reset_required: true,
      ...overrides,
    };
  }

  function closedRow(overrides: Record<string, unknown> = {}) {
    return openRow({
      resolved_at: '2026-09-18T13:00:00.000Z',
      password_reset_required: false,
      ...overrides,
    });
  }

  function provider(session: Record<string, unknown> | null) {
    return {
      getSession: vi.fn(async () => (session === null ? null : { status: 'active', ...session })),
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
    query.mockResolvedValueOnce([openRow()]).mockResolvedValueOnce([closedRow()]);
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

  it('refuses a session that predates the response', async () => {
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

  it.each(['2026-09-18T13:00:00.000Z', new Date('2026-09-18T13:00:00.000Z')])(
    'is a no-op on a response that is already closed at %s', async (resolvedAt) => {
    query.mockResolvedValueOnce([closedRow({ resolved_at: resolvedAt })]);
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

  it.each([OPENED_AT, new Date(OPENED_MS)])('accepts matching active session at hold opening %s', async (openedAt) => {
    query
      .mockResolvedValueOnce([openRow({ opened_at: openedAt })])
      .mockResolvedValueOnce([closedRow()]);
    const identityStub = provider({
      id: 'sess-new', userId: 'user-1', createdAt: OPENED_MS,
    });

    const result = await resolve(identityStub);

    expect(result.status).toBe('resolved');
    expect(mocks.revoke).toHaveBeenCalledWith(identityStub, 'user-1', 'sess-new');
    expect(query.mock.calls[1]?.[1]).toEqual(['resp-1', 'user-1']);
  });

  it.each([
    { id: 'different-session' },
    { id: undefined },
    { status: 'revoked' },
    { status: 'ended' },
    { status: undefined },
    { createdAt: null },
    { createdAt: undefined },
    { createdAt: Number.NaN },
    { createdAt: Number.POSITIVE_INFINITY },
    { createdAt: Number.NEGATIVE_INFINITY },
    { createdAt: String(OPENED_MS + 1000) },
  ])('refuses mismatched, inactive or malformed provider session %j', async (overrides) => {
    query.mockResolvedValueOnce([openRow()]);

    const result = await resolve(provider({
      id: 'sess-new', userId: 'user-1', status: 'active', createdAt: OPENED_MS + 1000,
      ...overrides,
    }));

    expect(result.outstanding).toEqual(['fresh_authentication']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', outcome: 'denied',
    }));
  });

  it.each(['invalid-date', new Date(Number.NaN), null, undefined, 0])('refuses an invalid hold timestamp %s', async (openedAt) => {
    query.mockResolvedValueOnce([openRow({ opened_at: openedAt })]);

    const result = await resolve(provider({
      id: 'sess-new', userId: 'user-1', createdAt: OPENED_MS + 1000,
    }));

    expect(result.outstanding).toEqual(['fresh_authentication']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it.each([
    { password_reset_required: true },
    { password_reset_required: undefined },
    { password_reset_required: 'false' },
    { resolved_at: undefined },
    { resolved_at: 'invalid-date' },
    { resolved_at: new Date(Number.NaN) },
    { resolved_at: 0 },
  ])('does not report initial inconsistent completion %j', async (overrides) => {
    query.mockResolvedValueOnce([closedRow(overrides)]);

    await expect(resolve(provider(null))).rejects.toMatchObject({
      statusCode: 503, userSafe: true,
      message: 'Could not confirm that this response was resolved.',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  const unconfirmedReceipts = [
    [], null, undefined, {}, [null], [{}],
    [closedRow({ id: 'another-response' })],
    [closedRow({ id: '' })],
    [closedRow({ password_reset_required: true })],
    [closedRow({ password_reset_required: undefined })],
    [closedRow({ password_reset_required: 'false' })],
    [closedRow({ resolved_at: null })],
    [closedRow({ resolved_at: undefined })],
    [closedRow({ resolved_at: 'invalid-date' })],
    [closedRow({ resolved_at: new Date(Number.NaN) })],
    [closedRow({ resolved_at: 0 })],
    [closedRow(), closedRow()],
  ];

  it.each(unconfirmedReceipts.map((receipt) => ({ receipt })))(
    'does not treat an empty update as completion without stored evidence $receipt',
    async ({ receipt }) => {
      query.mockResolvedValueOnce([openRow()]).mockResolvedValueOnce([])
        .mockResolvedValueOnce(receipt);

      await expect(resolve(provider({
        id: 'sess-new', userId: 'user-1', createdAt: OPENED_MS + 1000,
      }))).rejects.toMatchObject({
        statusCode: 503, userSafe: true,
        message: 'Could not confirm that this response was resolved. Some sessions may already have been signed out.',
      });

      expect(query).toHaveBeenCalledTimes(3);
      expect(query.mock.calls[2]?.[0]).toContain('where id = $1 and user_id = $2');
      expect(query.mock.calls[2]?.[1]).toEqual(['resp-1', 'user-1']);
      expect(mocks.revoke).toHaveBeenCalledTimes(1);
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );

  it.each(unconfirmedReceipts.filter((receipt) => !Array.isArray(receipt) || receipt.length > 0)
    .map((receipt) => ({ receipt })))(
    'rejects a malformed update receipt without a success audit or retry $receipt',
    async ({ receipt }) => {
      query.mockResolvedValueOnce([openRow()]).mockResolvedValueOnce(receipt);

      await expect(resolve(provider({
        id: 'sess-new', userId: 'user-1', createdAt: OPENED_MS + 1000,
      }))).rejects.toMatchObject({ statusCode: 503, userSafe: true });

      expect(query).toHaveBeenCalledTimes(2);
      expect(mocks.revoke).toHaveBeenCalledTimes(1);
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );

  it.each(['update', 'read'])('propagates a database %s failure without success audit', async (stage) => {
    const failure = new Error('database unavailable');
    query.mockResolvedValueOnce([openRow()]);
    if (stage === 'read') query.mockResolvedValueOnce([]);
    query.mockRejectedValueOnce(failure);

    await expect(resolve(provider({
      id: 'sess-new', userId: 'user-1', createdAt: OPENED_MS + 1000,
    }))).rejects.toBe(failure);

    expect(query).toHaveBeenCalledTimes(stage === 'read' ? 3 : 2);
    expect(mocks.revoke).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(['update', 'concurrent read'])('preserves the sweep count with confirmed %s evidence', async (stage) => {
    query.mockResolvedValueOnce([openRow()]);
    if (stage === 'concurrent read') query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([closedRow({ resolved_at: new Date(OPENED_MS + 60_000) })]);
    mocks.revoke.mockResolvedValueOnce({
      ended: ['ended-1', 'ended-2'], alreadyGone: ['gone-1'], failed: [],
      currentSession: undefined, incomplete: false, targetCount: 3,
    });

    const result = await resolve(provider({
      id: 'sess-new', userId: 'user-1', createdAt: OPENED_MS + 1000,
    }));

    expect(result).toMatchObject({
      status: stage === 'update' ? 'resolved' : 'already_resolved',
      responseId: 'resp-1', outstanding: [], sessionsEnded: 3,
    });
    expect(query).toHaveBeenCalledTimes(stage === 'update' ? 2 : 3);
    expect(query.mock.calls[1]?.[0]).toContain('returning id, resolved_at, password_reset_required');
    if (stage === 'update') {
      expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        outcome: 'success', detail: expect.objectContaining({ count: 3 }),
      }));
    } else {
      expect(query.mock.calls[2]?.[1]).toEqual(['resp-1', 'user-1']);
      expect(mocks.audit).not.toHaveBeenCalled();
    }
  });

  it.each([
    'ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB',
    'abcdefabcdefabcdefabcdefabcdefab',
    '{ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB}',
    'abcd-efab-cdef-abcd-efab-cdef-abcd-efab',
  ])('matches PostgreSQL UUID identity without changing account identity: %s', async (responseId) => {
    const id = 'abcdefab-cdef-abcd-efab-cdefabcdefab';
    for (const stage of ['initial', 'update', 'concurrent read']) {
      query.mockReset();
      mocks.audit.mockClear();
      query.mockResolvedValueOnce([stage === 'initial' ? closedRow({ id }) : openRow({ id })]);
      if (stage === 'concurrent read') query.mockResolvedValueOnce([]);
      if (stage !== 'initial') query.mockResolvedValueOnce([closedRow({ id })]);

      const result = await resolve(provider({
        id: 'sess-new', userId: 'user-1', createdAt: OPENED_MS + 1000,
      }), { responseId });

      expect(result.status).toBe(stage === 'update' ? 'resolved' : 'already_resolved');
      expect(query.mock.calls[0]?.[1]).toEqual([responseId, 'user-1']);
      if (stage !== 'initial') expect(query.mock.calls[1]?.[1]).toEqual([responseId, 'user-1']);
    }
  });

  it.each([
    null, undefined, {}, [null], [{}], [openRow({ id: 'another-response' })],
    [openRow(), openRow()],
  ].map((receipt) => ({ receipt })))(
    'refuses malformed initial receipt before any sweep $receipt', async ({ receipt }) => {
      query.mockResolvedValueOnce(receipt);

      await expect(resolve(provider(null))).rejects.toMatchObject({
        statusCode: 503, userSafe: true,
        message: 'Could not confirm the state of this compromise response.',
      });

      expect(query).toHaveBeenCalledTimes(1);
      expect(mocks.revoke).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );

});
