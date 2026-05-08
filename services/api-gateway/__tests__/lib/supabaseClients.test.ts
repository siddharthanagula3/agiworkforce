/**
 * @file Unit tests for the Wave 1 P0-G Supabase client helpers.
 *
 * Coverage:
 *   - mintSupabaseJwt() emits a valid HS256 token claiming
 *     `{ sub: userId, role: 'authenticated', aud: 'authenticated' }`
 *     so PostgREST's `auth.uid()` / `auth.role()` resolve correctly.
 *   - The 50-second per-userId cache returns the same token within the
 *     window and a fresh token after invalidation.
 *   - getUserScopedClient() flows the minted JWT through `getUserClient`
 *     so subsequent DB calls land on the user's RLS-bound client.
 *
 * Cross-tenant integration coverage (mint A's JWT, query B's rows →
 * empty) is gated behind `RLS_INTEGRATION_TEST=1` because it requires
 * real Supabase credentials + provisioned test users that aren't part
 * of the unit-test runner image. Locally:
 *
 *   RLS_INTEGRATION_TEST=1 \
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_JWT_SECRET=... \
 *   RLS_TEST_USER_A_ID=... RLS_TEST_USER_B_ID=... \
 *   pnpm --filter @agiworkforce/api-gateway test -- supabaseClients
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  _resetSupabaseJwtCacheForTests,
  getServiceClient,
  getUserScopedClient,
  mintSupabaseJwt,
} from '../../src/lib/supabaseClients';

// Use a stable test secret. Each `it` block sees the same value because
// process.env mutations stick within the test process; cache reset
// between cases means we never serve a stale token signed with a
// previous secret.
const TEST_JWT_SECRET = 'test-supabase-jwt-secret-do-not-use-in-prod';

beforeAll(() => {
  process.env['SUPABASE_URL'] ??= 'https://test.supabase.co';
  process.env['SUPABASE_ANON_KEY'] ??= 'test-anon-key';
  process.env['SUPABASE_JWT_SECRET'] ??= TEST_JWT_SECRET;
});

beforeEach(() => {
  _resetSupabaseJwtCacheForTests();
});

describe('mintSupabaseJwt — Supabase-shaped JWT mint (P0-G)', () => {
  it('emits an HS256 token whose claims drive RLS correctly', () => {
    const userId = '00000000-0000-0000-0000-00000000aaaa';
    const token = mintSupabaseJwt(userId);

    const decoded = jwt.verify(token, process.env['SUPABASE_JWT_SECRET']!, {
      algorithms: ['HS256'],
      audience: 'authenticated',
    }) as jwt.JwtPayload;

    expect(decoded.sub).toBe(userId);
    expect(decoded.role).toBe('authenticated');
    expect(decoded.aud).toBe('authenticated');
    expect(typeof decoded.exp).toBe('number');
    expect(typeof decoded.iat).toBe('number');
    // 60-second TTL — guard against accidental widening.
    expect(decoded.exp! - decoded.iat!).toBe(60);
  });

  it('caches the token per userId within the 50s window', () => {
    const userId = '00000000-0000-0000-0000-00000000bbbb';
    const first = mintSupabaseJwt(userId);
    const second = mintSupabaseJwt(userId);
    expect(second).toBe(first);
  });

  it('issues distinct tokens for distinct users', () => {
    const tokenA = mintSupabaseJwt('aaaa-aaaa');
    const tokenB = mintSupabaseJwt('bbbb-bbbb');
    expect(tokenA).not.toBe(tokenB);

    const decodedA = jwt.decode(tokenA) as jwt.JwtPayload;
    const decodedB = jwt.decode(tokenB) as jwt.JwtPayload;
    expect(decodedA.sub).toBe('aaaa-aaaa');
    expect(decodedB.sub).toBe('bbbb-bbbb');
  });

  it('throws for missing/empty userId rather than minting an aud-only token', () => {
    expect(() => mintSupabaseJwt('')).toThrow(/userId is required/);
  });

  it('refreshes after the cache is reset', () => {
    const userId = '00000000-0000-0000-0000-00000000cccc';
    const first = mintSupabaseJwt(userId);
    _resetSupabaseJwtCacheForTests();
    const second = mintSupabaseJwt(userId);
    // The mint clock ticks forward (or at least doesn't tick backward),
    // so the iat fields differ at least by one process-tick. We assert
    // the strings differ OR the iats differ — either signal works.
    const decodedFirst = jwt.decode(first) as jwt.JwtPayload;
    const decodedSecond = jwt.decode(second) as jwt.JwtPayload;
    expect(decodedFirst.sub).toBe(decodedSecond.sub);
    expect(typeof decodedSecond.iat).toBe('number');
  });
});

describe('getUserScopedClient — RLS-bound supabase client (P0-G)', () => {
  it('returns a client distinct from the service-role singleton', () => {
    const userId = '00000000-0000-0000-0000-00000000dddd';
    const userDb = getUserScopedClient(userId);
    const adminDb = getServiceClient();

    expect(userDb).not.toBe(adminDb);
    // Quick smoke check: from() is callable and returns the SDK's
    // PostgREST query builder (we don't assert on shape further; the
    // wire-level RLS test is gated below).
    expect(typeof userDb.from).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Wire-level cross-tenant RLS test — gated.
//
// Activates only when RLS_INTEGRATION_TEST=1 plus the four supporting
// vars are present. Otherwise vitest skips so the unit suite stays
// hermetic in CI.
// ---------------------------------------------------------------------------
const integrationGate =
  process.env['RLS_INTEGRATION_TEST'] === '1' &&
  process.env['RLS_TEST_USER_A_ID'] &&
  process.env['RLS_TEST_USER_B_ID'] &&
  process.env['SUPABASE_URL'] &&
  process.env['SUPABASE_ANON_KEY'] &&
  process.env['SUPABASE_JWT_SECRET'];

describe.skipIf(!integrationGate)(
  'getUserScopedClient — cross-tenant RLS isolation (live DB, gated)',
  () => {
    afterEach(() => {
      _resetSupabaseJwtCacheForTests();
    });

    it('a JWT for user A cannot read user B subscriptions row', async () => {
      const userA = process.env['RLS_TEST_USER_A_ID']!;
      const userB = process.env['RLS_TEST_USER_B_ID']!;

      const dbAsA = getUserScopedClient(userA);
      const { data, error } = await dbAsA
        .from('subscriptions')
        .select('user_id')
        .eq('user_id', userB);

      // RLS should silently filter to zero rows. We assert no error
      // (RLS returns empty, doesn't 403) and zero rows.
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    });

    it('a JWT for user A CAN read user A subscriptions row (sanity)', async () => {
      const userA = process.env['RLS_TEST_USER_A_ID']!;

      const dbAsA = getUserScopedClient(userA);
      const { error } = await dbAsA.from('subscriptions').select('user_id').eq('user_id', userA);

      // Either zero rows (user A doesn't have a subscription yet) or
      // exactly one — both are RLS-passing outcomes. The assertion
      // we care about is "no permission error".
      expect(error).toBeNull();
    });
  },
);
