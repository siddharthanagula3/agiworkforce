import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkTokenUsable, evictRevocationCache } from '../../src/middleware/auth';
import type { CloudDbClient } from '../../src/lib/neonClients';

/**
 * The WebSocket path used to verify a signature and stop there, so a revoked
 * token and a suspended account both kept a live socket. Both entry points now
 * share this check; these cases pin what it decides.
 */

interface Rows {
  revoked?: { jti: string } | null;
  accountStatus?: string;
  throwOn?: 'revoked_jwts' | 'profiles';
}

function dbStub(rows: Rows) {
  return () =>
    ({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              if (rows.throwOn === table) throw new Error('database down');
              return { data: { account_status: rows.accountStatus ?? 'active' }, error: null };
            },
            maybeSingle: async () => {
              if (rows.throwOn === table) throw new Error('database down');
              return { data: rows.revoked ?? null, error: null };
            },
          }),
          maybeSingle: async () => {
            if (rows.throwOn === table) throw new Error('database down');
            return { data: rows.revoked ?? null, error: null };
          },
        }),
      }),
    }) as unknown as CloudDbClient;
}

let counter = 0;
function freshIds() {
  counter += 1;
  return { jti: `jti-${counter}`, userId: `user-${counter}` };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkTokenUsable', () => {
  it('passes a live token on an active account', async () => {
    const { jti, userId } = freshIds();
    await expect(checkTokenUsable(jti, userId, dbStub({}))).resolves.toEqual({ ok: true });
  });

  it('refuses a revoked token with 401', async () => {
    const { jti, userId } = freshIds();
    evictRevocationCache(jti);

    const result = await checkTokenUsable(jti, userId, dbStub({ revoked: { jti } }));

    expect(result).toMatchObject({ ok: false, reason: 'revoked', status: 401 });
  });

  it('refuses a suspended account with 403', async () => {
    const { jti, userId } = freshIds();

    const result = await checkTokenUsable(jti, userId, dbStub({ accountStatus: 'suspended' }));

    expect(result).toMatchObject({ ok: false, reason: 'inactive', status: 403 });
    if (!result.ok) expect(result.message).toContain('suspended');
  });

  it('fails closed with 503 when the revocation lookup errors', async () => {
    const { jti, userId } = freshIds();
    evictRevocationCache(jti);

    const result = await checkTokenUsable(jti, userId, dbStub({ throwOn: 'revoked_jwts' }));

    expect(result).toMatchObject({ ok: false, reason: 'unavailable', status: 503 });
  });

  it('fails closed with 503 when the account-status lookup errors', async () => {
    const { jti, userId } = freshIds();

    const result = await checkTokenUsable(jti, userId, dbStub({ throwOn: 'profiles' }));

    expect(result).toMatchObject({ ok: false, reason: 'unavailable', status: 503 });
  });

  it('still checks the account when the token carries no jti', async () => {
    const { userId } = freshIds();

    const result = await checkTokenUsable(undefined, userId, dbStub({ accountStatus: 'banned' }));

    expect(result).toMatchObject({ ok: false, reason: 'inactive' });
  });
});
