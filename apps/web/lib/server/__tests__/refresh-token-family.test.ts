import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  finishFamilyAsCompromised,
  REFRESH_FAMILY_COMPROMISE_REASONS,
  revokeDeviceRefreshCredentials,
  revokeEveryDeviceRefreshCredential,
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

const PG_UNDEFINED_COLUMN = '42703';

class UndefinedColumn extends Error {
  readonly code = PG_UNDEFINED_COLUMN;

  constructor(column: string) {
    super(`column "${column}" does not exist`);
  }
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
 * Answers the two statements the way Postgres does: the same predicates, the
 * same coalesce, the same refusal when the compromise columns are not there.
 */
function fakeDeviceRefreshTokens(
  rows: TokenRow[],
  options: { compromiseColumns?: boolean } = {},
): DatabaseAdapter {
  const compromiseColumns = options.compromiseColumns ?? true;

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
    if (/set compromised_at/.test(sql)) {
      if (!compromiseColumns) throw new UndefinedColumn('compromised_at');
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
      callback(fakeDeviceRefreshTokens(rows, options))) as DatabaseAdapter['transaction'],
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

  it('keeps the revocation when the compromise columns are not there yet', async () => {
    const outcome = await finishFamilyAsCompromised(
      fakeDeviceRefreshTokens(rows, { compromiseColumns: false }),
      { familyId: 'family-a', userId: 'user-1', reason: 'replayed', at: AT },
    );

    expect(outcome).toEqual({ revoked: 2, compromiseRecorded: false });
    expect(rows[1]?.revoked_at).toBe(AT);
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
