import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  audit: vi.fn(),
  provider: { name: 'clerk' as string },
}));

vi.mock('next/server', () => ({
  after: (work: Promise<unknown>) => {
    void work;
  },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: mocks.query, execute: mocks.execute }),
}));
vi.mock('@/lib/server/identity', () => ({ getIdentityProvider: () => mocks.provider }));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: () => null }));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mocks.audit(...args),
}));

import { resolveAuthenticatedAccount } from './identity-account';

const SUBJECT = 'user_2abc';
const OTHER_PROVIDER_SUBJECT = 'okta|00u123';

function resolvedRow(overrides: Record<string, unknown> = {}) {
  return [{ identity_id: 'ident-1', account_id: SUBJECT, erased: false, ...overrides }];
}

beforeEach(() => {
  mocks.provider.name = 'clerk';
  mocks.query.mockReset().mockResolvedValue(resolvedRow());
  mocks.execute.mockReset().mockResolvedValue(undefined);
  mocks.audit.mockReset().mockResolvedValue(undefined);
});

describe('resolving an authenticated subject to an account', () => {
  it('asks by the subject the provider issued, never by an address', async () => {
    await resolveAuthenticatedAccount(SUBJECT);

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/email/i);
    expect(params).toEqual(['clerk', SUBJECT, SUBJECT]);
  });

  it('returns the account id the row names, which no email change can move', async () => {
    mocks.query.mockResolvedValue(resolvedRow({ account_id: 'account-kept' }));

    const resolution = await resolveAuthenticatedAccount(SUBJECT);

    expect(resolution).toEqual({
      outcome: 'resolved',
      account: {
        accountId: 'account-kept',
        identityId: 'ident-1',
        provider: 'clerk',
        subject: SUBJECT,
      },
    });
  });

  it('leaves a second provider with no mapping unresolved rather than guessing an account', async () => {
    mocks.provider.name = 'okta';
    mocks.query.mockResolvedValue([{ identity_id: null, account_id: null, erased: false }]);

    const resolution = await resolveAuthenticatedAccount(OTHER_PROVIDER_SUBJECT);
    const [, params] = mocks.query.mock.calls[0] as [string, unknown[]];

    expect(params).toEqual(['okta', OTHER_PROVIDER_SUBJECT, null]);
    expect(resolution).toEqual({ outcome: 'unknown' });
  });

  it('refuses an erased account however valid the callback that carried the subject', async () => {
    mocks.query.mockResolvedValue(resolvedRow({ erased: true }));

    expect(await resolveAuthenticatedAccount(SUBJECT)).toEqual({
      outcome: 'erased',
      accountId: SUBJECT,
    });
  });

  it('records a link the first time an identity authenticates, and says which one', async () => {
    mocks.query
      .mockResolvedValueOnce(resolvedRow({ identity_id: null }))
      .mockResolvedValueOnce([{ identity_id: 'ident-new' }]);

    const resolution = await resolveAuthenticatedAccount(SUBJECT);

    expect(resolution).toMatchObject({ account: { identityId: 'ident-new' } });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: SUBJECT,
        eventType: 'identity_linked',
        detail: expect.objectContaining({
          resourceType: 'identity',
          resourceId: 'ident-new',
          provider: 'clerk',
          source: 'sign_in',
        }),
      }),
    );
  });

  it('records the last use of an identity that already exists', async () => {
    await resolveAuthenticatedAccount(SUBJECT);

    const [sql, params] = mocks.execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/set\s+last_authenticated_at\s*=\s*now\(\)/i);
    expect(params).toEqual(['clerk', SUBJECT]);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('never links an identity to an account that does not exist', async () => {
    mocks.query.mockResolvedValueOnce(resolvedRow({ identity_id: null })).mockResolvedValueOnce([]);

    await resolveAuthenticatedAccount(SUBJECT);

    const [sql] = mocks.query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/where exists \(select 1 from public\.profiles where id = \$3\)/i);
  });

  it('answers who the caller is and nothing about what they may do', async () => {
    const resolution = await resolveAuthenticatedAccount(SUBJECT);

    expect(resolution.outcome).toBe('resolved');
    const account = resolution.outcome === 'resolved' ? resolution.account : {};
    expect(Object.keys(account).sort()).toEqual(['accountId', 'identityId', 'provider', 'subject']);
  });

  it('refuses to authenticate through a database it cannot read', async () => {
    mocks.query.mockRejectedValue(
      Object.assign(new Error('connection refused'), { code: '08006' }),
    );

    await expect(resolveAuthenticatedAccount(SUBJECT)).rejects.toThrow('connection refused');
  });
});
