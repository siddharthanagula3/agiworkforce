import type { IdentitySession } from '@agiworkforce/identity';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MobileIntentTokens = typeof import('@/lib/server/mobile-intent-tokens');
const { revokeIntents } = vi.hoisted(() => ({ revokeIntents: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: vi.fn() }));
vi.mock('@/lib/server/mobile-intent-tokens', async (importOriginal) => ({
  ...(await importOriginal<MobileIntentTokens>()),
  revokeEveryMobileIntentToken: revokeIntents,
}));

import {
  listActiveIdentitySessions,
  revokeEveryOtherSession,
  type IdentitySessionOperations,
} from '../session-revocation';

function session(id: string, overrides: Partial<IdentitySession> = {}): IdentitySession {
  return {
    id,
    userId: 'native-subject',
    status: 'active',
    createdAt: 1,
    lastActiveAt: 2,
    expireAt: 3,
    latestActivity: null,
    ...overrides,
  };
}

function operations(sessions: unknown) {
  return {
    listUserSessions: vi.fn<IdentitySessionOperations['listUserSessions']>().mockResolvedValue({
      sessions: sessions as IdentitySession[],
      totalCount: 250,
    }),
    revokeSession: vi.fn<IdentitySessionOperations['revokeSession']>().mockResolvedValue(undefined),
  };
}

const invalidPages: [string, unknown][] = [
  ['non-array', { 0: session('sess_other'), length: 1 }],
  ['missing array', undefined],
  ['null array', null],
  ['sparse array', new Array(1)],
  ['null row', [null]],
  ['missing row', [undefined]],
  ['primitive row', ['sess_other']],
  ['missing owner', [session('sess_other', { userId: undefined as never })]],
  ['empty owner', [session('sess_other', { userId: '' })]],
  ['non-string owner', [session('sess_other', { userId: 123 as never })]],
  ['foreign owner', [session('sess_other', { userId: 'foreign-subject' })]],
  [
    'product ID instead of provider subject',
    [session('sess_other', { userId: 'product-account' })],
  ],
  ['padded owner', [session('sess_other', { userId: ' native-subject ' })]],
  ['inactive status', [session('sess_other', { status: 'revoked' })]],
  ['missing status', [session('sess_other', { status: undefined as never })]],
  ['wrong-case status', [session('sess_other', { status: 'Active' })]],
  ['missing ID', [session(undefined as never)]],
  ['non-string ID', [session(123 as never)]],
  ['empty ID', [session('')]],
  ['blank ID', [session('   ')]],
  ['padded ID', [session(' sess_other ')]],
  ['duplicate other ID', [session('sess_other'), session('sess_other')]],
  ['duplicate current ID', [session('sess_current'), session('sess_current')]],
  [
    'valid row before foreign row',
    [session('sess_valid'), session('sess_foreign', { userId: 'foreign-subject' })],
  ],
  ['foreign current session', [session('sess_current', { userId: 'foreign-subject' })]],
];

beforeEach(() => {
  vi.clearAllMocks();
  revokeIntents.mockResolvedValue(undefined);
});

describe('provider session enumeration ownership', () => {
  it.each(invalidPages)(
    'rejects %s before listing or revoking any row on that page',
    async (_name, rows) => {
      const identity = operations(rows);

      await expect(listActiveIdentitySessions(identity, 'native-subject')).rejects.toThrow(
        'Identity provider returned an invalid active session page',
      );
      await expect(
        revokeEveryOtherSession(identity, 'product-account', 'sess_current', 'native-subject'),
      ).rejects.toThrow('Identity provider returned an invalid active session page');

      expect(identity.revokeSession).not.toHaveBeenCalled();
      expect(revokeIntents).toHaveBeenCalledExactlyOnceWith('product-account');
    },
  );

  it.each(['', ' native-subject '])(
    'rejects a malformed owner even if it matches the requested subject %j',
    async (subject) => {
      const identity = operations([session('sess_other', { userId: subject })]);
      await expect(listActiveIdentitySessions(identity, subject)).rejects.toThrow(
        'Identity provider returned an invalid active session page',
      );
      expect(identity.revokeSession).not.toHaveBeenCalled();
    },
  );

  it('preserves the provider identifiers, active query, and count/truncation policy', async () => {
    const rows = [session('opaque-provider-id')];
    const identity = operations(rows);

    await expect(listActiveIdentitySessions(identity, 'native-subject')).resolves.toEqual({
      sessions: rows,
      totalCount: 250,
      truncated: true,
    });
    expect(identity.listUserSessions).toHaveBeenCalledExactlyOnceWith('native-subject', {
      status: 'active',
      limit: 100,
      offset: 0,
    });
    expect(identity.revokeSession).not.toHaveBeenCalled();
  });

  it('accepts an empty page and an owned current session without revoking it', async () => {
    const identity = operations([]);
    identity.listUserSessions.mockResolvedValueOnce({ sessions: [], totalCount: 0 });
    await expect(listActiveIdentitySessions(identity, 'native-subject')).resolves.toEqual({
      sessions: [],
      totalCount: 0,
      truncated: false,
    });
    const current = session('sess_current');
    identity.listUserSessions.mockResolvedValueOnce({ sessions: [current], totalCount: 1 });

    await expect(
      revokeEveryOtherSession(identity, 'product-account', 'sess_current', 'native-subject'),
    ).resolves.toMatchObject({ currentSession: current, ended: [], incomplete: false });
    expect(identity.revokeSession).not.toHaveBeenCalled();
  });

  it('rejects a later bad page without undoing prior-page revocations or skipping intent cleanup', async () => {
    const identity = operations([]);
    identity.listUserSessions
      .mockResolvedValueOnce({ sessions: [session('sess_first')], totalCount: 3 })
      .mockResolvedValueOnce({
        sessions: [session('sess_second'), session('sess_foreign', { userId: 'foreign-subject' })],
        totalCount: 2,
      });

    await expect(
      revokeEveryOtherSession(identity, 'product-account', null, 'native-subject'),
    ).rejects.toThrow('Identity provider returned an invalid active session page');

    expect(identity.listUserSessions).toHaveBeenCalledTimes(2);
    expect(identity.revokeSession).toHaveBeenCalledExactlyOnceWith('sess_first');
    expect(revokeIntents).toHaveBeenCalledExactlyOnceWith('product-account');
  });
});

const invalidCounts: unknown[] = [
  undefined,
  null,
  '2',
  '',
  true,
  NaN,
  Infinity,
  -Infinity,
  -1,
  0.5,
  Number.MAX_SAFE_INTEGER + 1,
];

describe('provider session completion evidence', () => {
  it.each(invalidCounts)('rejects invalid count %j before listing or revoking', async (count) => {
    const identity = operations([session('sess_other')]);
    identity.listUserSessions.mockResolvedValue({
      sessions: [session('sess_other')],
      totalCount: count as number,
    });
    await expect(listActiveIdentitySessions(identity, 'native-subject')).rejects.toThrow(
      'Identity provider returned an invalid active session count',
    );
    await expect(
      revokeEveryOtherSession(identity, 'product-account', null, 'native-subject'),
    ).rejects.toThrow('Identity provider returned an invalid active session count');
    expect(identity.revokeSession).not.toHaveBeenCalled();
    expect(revokeIntents).toHaveBeenCalledExactlyOnceWith('product-account');
  });

  it.each(invalidCounts)(
    'validates later-page count %j before another revocation',
    async (count) => {
      const identity = operations([]);
      identity.listUserSessions
        .mockResolvedValueOnce({ sessions: [session('sess_first')], totalCount: 2 })
        .mockResolvedValueOnce({ sessions: [session('sess_second')], totalCount: count as number });
      await expect(
        revokeEveryOtherSession(identity, 'product-account', null, 'native-subject'),
      ).rejects.toThrow('Identity provider returned an invalid active session count');
      expect(identity.revokeSession).toHaveBeenCalledExactlyOnceWith('sess_first');
      expect(revokeIntents).toHaveBeenCalledExactlyOnceWith('product-account');
    },
  );

  it.each([
    [[], 1, null],
    [[], 1, 'sess_current'],
    [[session('sess_current')], 2, 'sess_current'],
  ] as const)(
    'does not declare an exhausted page complete with unseen sessions %j',
    async (rows, totalCount, currentId) => {
      const identity = operations(rows);
      identity.listUserSessions.mockResolvedValue({ sessions: rows, totalCount });
      const sweep = await revokeEveryOtherSession(
        identity,
        'product-account',
        currentId,
        'native-subject',
      );
      expect(sweep.incomplete).toBe(true);
      expect(identity.listUserSessions).toHaveBeenCalledTimes(1);
      expect(identity.revokeSession).not.toHaveBeenCalled();
      expect(revokeIntents).toHaveBeenCalledExactlyOnceWith('product-account');
    },
  );

  it.each(['fulfilled', 'alreadyGone', 'failed'] as const)(
    'reports a still-active %s target without retrying it forever',
    async (outcome) => {
      const rows = [session('sess_current'), session('sess_other')];
      const identity = operations(rows);
      identity.listUserSessions.mockResolvedValue({ sessions: rows, totalCount: 2 });
      if (outcome !== 'fulfilled') {
        identity.revokeSession.mockRejectedValue({ status: outcome === 'alreadyGone' ? 404 : 500 });
      }
      const sweep = await revokeEveryOtherSession(
        identity,
        'product-account',
        'sess_current',
        'native-subject',
      );
      expect(sweep.incomplete).toBe(true);
      expect(sweep[outcome === 'fulfilled' ? 'ended' : outcome]).toEqual(['sess_other']);
      expect(identity.revokeSession).toHaveBeenCalledExactlyOnceWith('sess_other');
      expect(identity.listUserSessions).toHaveBeenCalledTimes(2);
      expect(revokeIntents).toHaveBeenCalledExactlyOnceWith('product-account');
    },
  );

  it('retains honest progress when the terminal page advertises unseen sessions', async () => {
    const identity = operations([]);
    identity.listUserSessions
      .mockResolvedValueOnce({ sessions: [session('sess_other')], totalCount: 2 })
      .mockResolvedValueOnce({ sessions: [], totalCount: 1 });
    await expect(
      revokeEveryOtherSession(identity, 'product-account', null, 'native-subject'),
    ).resolves.toMatchObject({ ended: ['sess_other'], targetCount: 2, incomplete: true });
    expect(identity.listUserSessions).toHaveBeenCalledTimes(2);
  });

  it.each([null, 'sess_current'])(
    'completes shrinking pages with current session %j and preserves undercount clamping',
    async (currentId) => {
      const current = currentId ? [session(currentId)] : [];
      const identity = operations([]);
      identity.listUserSessions
        .mockResolvedValueOnce({ sessions: [...current, session('sess_first')], totalCount: 0 })
        .mockResolvedValueOnce({ sessions: [...current, session('sess_second')], totalCount: 0 })
        .mockResolvedValueOnce({ sessions: current, totalCount: 0 });
      const sweep = await revokeEveryOtherSession(
        identity,
        'product-account',
        currentId,
        'native-subject',
      );
      expect(sweep).toMatchObject({
        ended: ['sess_first', 'sess_second'],
        failed: [],
        incomplete: false,
        targetCount: 1,
      });
      expect(identity.revokeSession.mock.calls).toEqual([['sess_first'], ['sess_second']]);
      for (const call of identity.listUserSessions.mock.calls) {
        expect(call).toEqual(['native-subject', { status: 'active', limit: 100, offset: 0 }]);
      }
    },
  );
});

describe('later session page integrity', () => {
  it('rejects duplicate IDs after prior effects without revoking the duplicate page', async () => {
    const identity = operations([]);
    identity.listUserSessions
      .mockResolvedValueOnce({ sessions: [session('sess_first')], totalCount: 3 })
      .mockResolvedValueOnce({
        sessions: [session('sess_second'), session('sess_second')],
        totalCount: 2,
      });
    await expect(
      revokeEveryOtherSession(identity, 'product-account', null, 'native-subject'),
    ).rejects.toThrow('Identity provider returned an invalid active session page');
    expect(identity.revokeSession).toHaveBeenCalledExactlyOnceWith('sess_first');
    expect(revokeIntents).toHaveBeenCalledExactlyOnceWith('product-account');
  });

  it('uses final empty count-zero evidence rather than a stale initial total', async () => {
    const identity = operations([]);
    identity.listUserSessions
      .mockResolvedValueOnce({ sessions: [session('sess_first')], totalCount: 250 })
      .mockResolvedValueOnce({ sessions: [], totalCount: 0 });
    await expect(
      revokeEveryOtherSession(identity, 'product-account', null, 'native-subject'),
    ).resolves.toMatchObject({ ended: ['sess_first'], targetCount: 250, incomplete: false });
    expect(identity.listUserSessions).toHaveBeenCalledTimes(2);
    expect(revokeIntents).toHaveBeenCalledExactlyOnceWith('product-account');
  });
});
