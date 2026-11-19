import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/server/mobile-intent-tokens');

vi.mock('@/lib/server/mobile-intent-tokens', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  revokeEveryMobileIntentToken: vi.fn().mockResolvedValue(undefined),
  revokeMobileIntentTokens: vi.fn().mockResolvedValue(undefined),
  revokeOrganizationMobileIntentTokens: vi.fn().mockResolvedValue(0),
}));

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  finishFamilyAsCompromised,
  REFRESH_FAMILY_COMPROMISE_REASONS,
  revokeDeviceRefreshCredentials,
  revokeDeviceRefreshFamily,
  revokeEveryDeviceRefreshCredential,
  revokeEveryDeviceRefreshFamily,
  revokeWorkspaceDeviceRefreshFamilies,
} from '../refresh-token-family';

interface TokenRow {
  id: string;
  family_id: string;
  user_id: string;
  device_id: string | null;
  used_at: string | null;
  revoked_at: string | null;
  compromised_at: string | null;
  compromised_reason: string | null;
  expires_at: string;
}

interface UnredeemedCredentials {
  deviceCodes: { user_id: string; status: string }[];
  desktopGrants: { user_id: string; consumed_at: string | null }[];
}

function row(overrides: Partial<TokenRow> & Pick<TokenRow, 'id' | 'family_id'>): TokenRow {
  return {
    user_id: 'user-1',
    device_id: 'device-1',
    used_at: null,
    revoked_at: null,
    compromised_at: null,
    compromised_reason: null,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    ...overrides,
  };
}

/**
 * Answers the two statements the way Postgres does: the same predicates and
 * the same coalesce.
 */
type Families = Map<string, { user_id: string; revoked_at: string | null }>;

function fakeDeviceRefreshTokens(
  rows: TokenRow[],
  unredeemed: UnredeemedCredentials = { deviceCodes: [], desktopGrants: [] },
  families: Families = new Map(),
): DatabaseAdapter {
  const scoped = (sql: string, params: unknown[]): TokenRow[] => {
    const byFamilyText = /family_id::text = \$1/.test(sql);
    const byEveryRow = /where user_id = \$1/.test(sql);
    if (byEveryRow) return rows.filter((candidate) => candidate.user_id === params[0]);
    if (byFamilyText) {
      return rows.filter(
        (candidate) => candidate.family_id === params[0] && candidate.user_id === params[1],
      );
    }
    const families = new Set(
      rows
        .filter((candidate) => candidate.user_id === params[1] && candidate.device_id === params[0])
        .map((candidate) => candidate.family_id),
    );
    return rows.filter(
      (candidate) =>
        candidate.user_id === params[1] &&
        (families.has(candidate.family_id) || candidate.family_id === params[2]),
    );
  };

  const run = (sql: string, params: unknown[]): TokenRow[] => {
    if (/insert into public\.device_refresh_token_families/.test(sql)) {
      const at = typeof params[2] === 'string' ? params[2] : new Date().toISOString();
      const touched = scoped(sql, params);
      for (const candidate of touched) {
        const existing = families.get(candidate.family_id);
        if (!existing) {
          families.set(candidate.family_id, { user_id: candidate.user_id, revoked_at: at });
        } else if (existing.user_id === candidate.user_id) {
          existing.revoked_at ??= at;
        }
      }
      return [];
    }
    if (/update public\.device_authorization_codes/.test(sql)) {
      for (const code of unredeemed.deviceCodes) {
        if (code.user_id === params[0] && code.status === 'approved') code.status = 'revoked';
      }
      return [];
    }
    if (/delete from public\.desktop_sign_in_grants/.test(sql)) {
      unredeemed.desktopGrants = unredeemed.desktopGrants.filter(
        (grant) => !(grant.user_id === params[0] && grant.consumed_at === null),
      );
      return [];
    }
    if (/set compromised_at/.test(sql)) {
      const at = typeof params[2] === 'string' ? params[2] : new Date().toISOString();
      const reason = String(params[params.length - 1]);
      const touched = scoped(sql, params);
      for (const candidate of touched) {
        candidate.compromised_at ??= at;
        candidate.compromised_reason ??= reason;
      }
      return touched;
    }
    if (/set revoked_at/.test(sql)) {
      const at = typeof params[2] === 'string' ? params[2] : new Date().toISOString();
      const touched = scoped(sql, params).filter((candidate) => candidate.revoked_at === null);
      for (const candidate of touched) candidate.revoked_at = at;
      return touched;
    }
    throw new Error(`the fake was asked a statement it does not model: ${sql}`);
  };

  return {
    query: (async (sql: string, params: unknown[] = []) =>
      run(sql, params).map(({ id }) => ({ id }))) as DatabaseAdapter['query'],
    execute: async (sql: string, params: unknown[] = []) => run(sql, params).length,
    transaction: (async (callback: (tx: DatabaseAdapter) => unknown) =>
      callback(
        fakeDeviceRefreshTokens(rows, unredeemed, families),
      )) as DatabaseAdapter['transaction'],
    withUser: () => {
      throw new Error('not used');
    },
    withOrg: () => {
      throw new Error('not used');
    },
    dispose: async () => {},
  } as DatabaseAdapter;
}

const AT = '2026-09-20T10:00:00.000Z';

describe('finishing a refresh-token family that is known to be compromised', () => {
  let rows: TokenRow[];

  beforeEach(() => {
    rows = [
      row({ id: 'spent', family_id: 'family-a', used_at: '2026-09-19T00:00:00.000Z' }),
      row({ id: 'live', family_id: 'family-a' }),
      row({ id: 'other-family', family_id: 'family-b' }),
      row({ id: 'other-account', family_id: 'family-a', user_id: 'user-2' }),
    ];
  });

  it('revokes every live row of the one family and leaves the rest alone', async () => {
    const outcome = await finishFamilyAsCompromised(fakeDeviceRefreshTokens(rows), {
      familyId: 'family-a',
      userId: 'user-1',
      reason: 'replayed',
      at: AT,
    });

    expect(outcome.revoked).toBe(2);
    expect(rows.filter((candidate) => candidate.revoked_at !== null).map(({ id }) => id)).toEqual([
      'spent',
      'live',
    ]);
  });

  it('records why on every row of the family, including rows already revoked', async () => {
    rows[0]!.revoked_at = '2026-09-19T12:00:00.000Z';

    await finishFamilyAsCompromised(fakeDeviceRefreshTokens(rows), {
      familyId: 'family-a',
      userId: 'user-1',
      reason: 'replayed',
      at: AT,
    });

    expect(rows[0]).toMatchObject({
      revoked_at: '2026-09-19T12:00:00.000Z',
      compromised_at: AT,
      compromised_reason: 'replayed',
    });
    expect(rows[1]).toMatchObject({ compromised_at: AT, compromised_reason: 'replayed' });
    expect(rows[2]?.compromised_at).toBeNull();
    expect(rows[3]?.compromised_at).toBeNull();
  });

  it('leaves no live row behind, so nothing can be issued into the family again', async () => {
    await finishFamilyAsCompromised(fakeDeviceRefreshTokens(rows), {
      familyId: 'family-a',
      userId: 'user-1',
      reason: 'replayed',
      at: AT,
    });

    const issuable = rows.filter(
      (candidate) =>
        candidate.family_id === 'family-a' &&
        candidate.user_id === 'user-1' &&
        candidate.revoked_at === null &&
        candidate.used_at === null,
    );

    expect(issuable).toEqual([]);
  });

  it('never revokes another account holding the same family id', async () => {
    await finishFamilyAsCompromised(fakeDeviceRefreshTokens(rows), {
      familyId: 'family-a',
      userId: 'user-1',
      reason: 'replayed',
      at: AT,
    });

    expect(rows[3]?.revoked_at).toBeNull();
  });

  it('spends a reason the schema accepts', () => {
    expect(REFRESH_FAMILY_COMPROMISE_REASONS).toContain('replayed');
  });
});

describe('the other two ways a family ends', () => {
  it('a lost device finishes its family and says so', async () => {
    const rows = [
      row({ id: 'a', family_id: 'family-a' }),
      row({ id: 'b', family_id: 'family-b', device_id: 'device-2' }),
    ];

    const outcome = await revokeDeviceRefreshCredentials(fakeDeviceRefreshTokens(rows), {
      userId: 'user-1',
      deviceId: 'device-1',
      credentialFamilyId: null,
      compromisedAs: 'device_lost',
    });

    expect(outcome).toEqual({ revoked: 1, compromiseRecorded: true });
    expect(rows[0]?.compromised_reason).toBe('device_lost');
    expect(rows[1]?.revoked_at).toBeNull();
  });

  it('signing out everywhere revokes every live credential and records no compromise', async () => {
    const rows = [
      row({ id: 'a', family_id: 'family-a' }),
      row({ id: 'b', family_id: 'family-b', device_id: 'device-2' }),
      row({ id: 'c', family_id: 'family-c', user_id: 'user-2' }),
    ];

    const revoked = await revokeEveryDeviceRefreshCredential(
      fakeDeviceRefreshTokens(rows),
      'user-1',
    );

    expect(revoked).toBe(2);
    expect(rows[2]?.revoked_at).toBeNull();
    expect(rows.every((candidate) => candidate.compromised_at === null)).toBe(true);
  });
});

describe('signing out everywhere also ends credentials nobody has redeemed yet', () => {
  it('revokes the account approved device codes and deletes its unconsumed desktop grants', async () => {
    const unredeemed: UnredeemedCredentials = {
      deviceCodes: [
        { user_id: 'user-1', status: 'approved' },
        { user_id: 'user-1', status: 'pending' },
        { user_id: 'user-1', status: 'consumed' },
        { user_id: 'user-2', status: 'approved' },
      ],
      desktopGrants: [
        { user_id: 'user-1', consumed_at: null },
        { user_id: 'user-1', consumed_at: AT },
        { user_id: 'user-2', consumed_at: null },
      ],
    };

    await revokeEveryDeviceRefreshCredential(fakeDeviceRefreshTokens([], unredeemed), 'user-1');

    expect(unredeemed.deviceCodes.map(({ status }) => status)).toEqual([
      'revoked',
      'pending',
      'consumed',
      'approved',
    ]);
    expect(unredeemed.desktopGrants).toEqual([
      { user_id: 'user-1', consumed_at: AT },
      { user_id: 'user-2', consumed_at: null },
    ]);
  });
});

describe('a rotation racing a revocation, fenced by the family row', () => {
  /**
   * The route's rotation, as the fake can model it: it takes the family row's
   * lock first and refuses a family that has been ended.
   */
  function rotate(rows: TokenRow[], families: Families, presentedId: string): TokenRow | null {
    const presented = rows.find((candidate) => candidate.id === presentedId);
    if (!presented || presented.revoked_at || presented.used_at) return null;
    if (families.get(presented.family_id)?.revoked_at) return null;
    presented.used_at = AT;
    const successor = row({ id: `${presentedId}-next`, family_id: presented.family_id });
    rows.push(successor);
    return successor;
  }

  /**
   * A rotation that already held the family lock commits while the
   * revocation's fence waits on it, so its successor exists before the fence
   * and the revoking UPDATE run.
   */
  function rotationCommitsWhileFenceWaits(
    rows: TokenRow[],
    families: Families,
    presentedId: string,
    statements: string[] = [],
  ) {
    const inner = fakeDeviceRefreshTokens(rows, undefined, families);
    let rotated = false;
    const settle = async <T>(sql: string, run: () => Promise<T>): Promise<T> => {
      statements.push(sql);
      if (!rotated && /insert into public\.device_refresh_token_families/.test(sql)) {
        rotated = true;
        rotate(rows, families, presentedId);
      }
      return run();
    };
    return {
      ...inner,
      query: ((sql: string, params?: unknown[]) =>
        settle(sql, () => inner.query(sql, params))) as DatabaseAdapter['query'],
      execute: ((sql: string, params?: unknown[]) =>
        settle(sql, () => inner.execute(sql, params))) as DatabaseAdapter['execute'],
    } as DatabaseAdapter;
  }

  function racingRows() {
    return {
      rows: [row({ id: 'head', family_id: 'family-a' })],
      families: new Map() as Families,
    };
  }

  it('unlinking a device ends the successor the rotation committed and the family itself', async () => {
    const { rows, families } = racingRows();

    const outcome = await revokeDeviceRefreshCredentials(
      rotationCommitsWhileFenceWaits(rows, families, 'head'),
      { userId: 'user-1', deviceId: 'device-1', credentialFamilyId: null },
    );

    expect(rows.map(({ id, revoked_at }) => [id, revoked_at !== null])).toEqual([
      ['head', true],
      ['head-next', true],
    ]);
    expect(outcome.revoked).toBe(2);
    expect(families.get('family-a')?.revoked_at).not.toBeNull();
  });

  it('refuses the successor rotation an attacker attempts after the unlink returns', async () => {
    const { rows, families } = racingRows();

    await revokeDeviceRefreshCredentials(rotationCommitsWhileFenceWaits(rows, families, 'head'), {
      userId: 'user-1',
      deviceId: 'device-1',
      credentialFamilyId: null,
    });
    const leaked = rows.find(({ id }) => id === 'head-next')!;
    leaked.revoked_at = null;

    expect(rotate(rows, families, 'head-next')).toBeNull();
    expect(rows.some(({ id }) => id === 'head-next-next')).toBe(false);
  });

  it('a rotation that arrives after the fence is refused, so nothing is issued into the family', async () => {
    const rows = [row({ id: 'head', family_id: 'family-a' })];
    const families: Families = new Map();

    await revokeDeviceRefreshCredentials(fakeDeviceRefreshTokens(rows, undefined, families), {
      userId: 'user-1',
      deviceId: 'device-1',
      credentialFamilyId: null,
    });

    expect(rotate(rows, families, 'head')).toBeNull();
    expect(rows).toHaveLength(1);
  });

  it('finishing a compromised family ends the successor and the family', async () => {
    const { rows, families } = racingRows();

    await finishFamilyAsCompromised(rotationCommitsWhileFenceWaits(rows, families, 'head'), {
      familyId: 'family-a',
      userId: 'user-1',
      reason: 'replayed',
      at: AT,
    });

    expect(rows.every((candidate) => candidate.revoked_at !== null)).toBe(true);
    expect(families.get('family-a')?.revoked_at).toBe(AT);
  });

  it('signing out everywhere ends the successor and the family', async () => {
    const { rows, families } = racingRows();

    const revoked = await revokeEveryDeviceRefreshCredential(
      rotationCommitsWhileFenceWaits(rows, families, 'head'),
      'user-1',
    );

    expect(rows.every((candidate) => candidate.revoked_at !== null)).toBe(true);
    expect(revoked).toBe(2);
    expect(families.get('family-a')?.revoked_at).not.toBeNull();
  });

  it('signing one device out ends its family for that account only', async () => {
    const rows = [
      row({ id: 'mine', family_id: 'family-a' }),
      row({ id: 'theirs', family_id: 'family-b', user_id: 'user-2' }),
    ];
    const families: Families = new Map();

    const revoked = await revokeDeviceRefreshFamily(
      fakeDeviceRefreshTokens(rows, undefined, families),
      { familyId: 'family-a', userId: 'user-1' },
    );

    expect(revoked).toBe(1);
    expect(families.get('family-a')?.revoked_at).not.toBeNull();
    expect(families.has('family-b')).toBe(false);
    expect(rows[1]?.revoked_at).toBeNull();
  });

  it.each([
    [
      'unlink',
      (db: DatabaseAdapter) =>
        revokeDeviceRefreshCredentials(db, {
          userId: 'user-1',
          deviceId: 'device-1',
          credentialFamilyId: null,
        }),
    ],
    [
      'compromise',
      (db: DatabaseAdapter) =>
        finishFamilyAsCompromised(db, {
          familyId: 'family-a',
          userId: 'user-1',
          reason: 'device_lost',
          at: AT,
        }),
    ],
    ['every family', (db: DatabaseAdapter) => revokeEveryDeviceRefreshFamily(db, 'user-1')],
    [
      'one family',
      (db: DatabaseAdapter) =>
        revokeDeviceRefreshFamily(db, { familyId: 'family-a', userId: 'user-1' }),
    ],
    [
      'workspace',
      (db: DatabaseAdapter) =>
        revokeWorkspaceDeviceRefreshFamilies(db, { userId: 'user-1', organizationId: 'org-1' }),
    ],
  ])('%s ends the family row before it revokes a token row', async (_name, revoke) => {
    const statements: string[] = [];
    const rows = [row({ id: 'head', family_id: 'family-a' })];
    await revoke(rotationCommitsWhileFenceWaits(rows, new Map(), 'absent', statements));

    const fence = statements.findIndex((sql) =>
      /insert into public\.device_refresh_token_families/.test(sql),
    );
    const revocation = statements.findIndex(
      (sql) =>
        /update device_refresh_tokens/.test(sql) &&
        /set revoked_at/.test(sql) &&
        !/device_refresh_token_families/.test(sql),
    );
    expect(fence).toBeGreaterThanOrEqual(0);
    expect(revocation).toBeGreaterThan(fence);
  });
});
