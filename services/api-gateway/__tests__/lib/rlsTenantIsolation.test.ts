/**
 * P1-GW-RLS invariant tests.
 *
 * Two realities coexist in the gateway's Neon query layer (src/lib/neonClients.ts):
 *
 *  1. RLS-GAP tables (most of them — no policy yet in apps/web/db/neon): their
 *     call sites use getServiceClient() directly, and the explicit
 *     `.eq('user_id', …)` filter each route applies is the SOLE
 *     tenant-isolation mechanism — there is no RLS to fall back on.
 *  2. RLS-covered tables (subscriptions, token_credits, credit_transactions —
 *     0037_rls_user_isolation.sql): their call sites use
 *     getUserScopedClient({ userId, token }), which binds Postgres RLS via
 *     NeonDatabaseAdapter.withUser(token) (packages/data-layer) as a REAL
 *     DB-level backstop BEHIND the same explicit filter. getUserScopedClient
 *     falls back to getServiceClient() — the RLS-GAP guarantee, not a
 *     regression — when the token can't be bound (empty, or a pre-rollout
 *     gateway device token minted before the `sub` claim was added).
 *
 * These tests encode all three:
 *  1. A comment-scan asserts no code falsely claims a table has an RLS
 *     backstop it doesn't have.
 *  2. A behavioural test proves the RLS-GAP path (getServiceClient) still
 *     emits the explicit user_id predicate as its sole isolation mechanism.
 *  3. A behavioural test proves getUserScopedClient threads a verified token
 *     into NeonDatabaseAdapter.withUser(), and fails SAFE — falls back to the
 *     RLS-GAP guarantee, never crashes, never silently drops the filter —
 *     when the token can't be bound.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// 1. Comment-scan: no false "RLS defense-in-depth" tenant-isolation claims
//    for a table that doesn't actually have a policy.
// ---------------------------------------------------------------------------
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      out.push(...walk(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('P1-GW-RLS: no false RLS defense-in-depth claims remain', () => {
  it('does not assert RLS as a tenant-isolation backstop anywhere in src/', () => {
    const srcDir = join(__dirname, '..', '..', 'src');
    const offenders: string[] = [];

    // Phrases that falsely claim RLS provides tenant isolation / defense in
    // depth. Honest negations ("RLS … is therefore NOT active", "no
    // `user_id = auth.uid()` RLS backstop") and honest claims scoped to the
    // verified getUserScopedClient/withUser path are allowed and must not
    // match.
    const banned = [
      /RLS-bound/,
      /RLS adds[- ]defense/i,
      /RLS on `[^`]+`\s*(is then enforced|enforces|is the second line)/i,
      /defense[- ]in[- ]depth\s*(?:so|because)?\s*(?:a|any)?\s*missing[- ]filter/i,
    ];

    for (const file of walk(srcDir)) {
      const text = readFileSync(file, 'utf8');
      for (const re of banned) {
        if (re.test(text)) {
          offenders.push(`${file}: matched ${re}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Behavioural: RLS-GAP tables — the explicit user_id filter is the sole
//    isolation mechanism when a call site uses getServiceClient() directly.
// ---------------------------------------------------------------------------
const captured: { sql: string; params: unknown[] }[] = [];

vi.mock('@neondatabase/serverless', () => ({
  // neon() returns a callable client whose `.query(sql, params)` we capture.
  neon: () => {
    const client = (() => Promise.resolve([])) as unknown as {
      query: (sql: string, params: unknown[]) => Promise<unknown[]>;
    };
    client.query = (sql: string, params: unknown[]) => {
      captured.push({ sql, params });
      return Promise.resolve([]);
    };
    return client;
  },
}));

// The RLS-capable path goes through @agiworkforce/data-layer's
// createDatabaseClient()/withUser(), not the neon() HTTP driver mocked above.
// Mock it at that boundary so these tests exercise getUserScopedClient's own
// wiring/fallback logic without depending on data-layer's Pool internals —
// those are covered by packages/data-layer's own adapter tests.
// Each captured query also records which token bound it — the wiring-level
// proof that getUserScopedClient never shares/reuses a mutable "current
// identity" across calls (which would let user A's request see user B's
// binding under concurrent traffic). Real row-level isolation is Postgres's
// job via the RLS policy itself; that's out of reach of any mock and is
// covered by the pre-deploy probe in the handoff report, not here.
const rlsCaptured: { sql: string; params: unknown[]; boundToken: string }[] = [];
vi.mock('@agiworkforce/data-layer', () => ({
  createDatabaseClient: vi.fn(() => ({
    withUser: (token: string) => {
      if (token === 'unbindable-token') {
        // Mirrors NeonDatabaseAdapter.withUser() throwing on a malformed / `sub`-less
        // token (packages/data-layer/src/adapters/neon.ts's decodeJwtSub()).
        throw new Error('withUser: cannot bind unverified/malformed token (test stub)');
      }
      if (token === 'app_rls-missing-token') {
        // withUser() itself succeeds (token decodes fine) but the bound
        // adapter's query() fails once it actually runs — mirrors
        // `SET LOCAL ROLE app_rls` failing at query time because the role is
        // missing/ungranted on this database (packages/data-layer/src/adapters/
        // neon.ts's query()/execute() only touch the role inside the query,
        // not inside withUser()).
        return {
          query: () => Promise.reject(new Error('role "app_rls" does not exist (test stub)')),
        };
      }
      return {
        query: (sql: string, params: unknown[]) => {
          rlsCaptured.push({ sql, params, boundToken: token });
          return Promise.resolve([]);
        },
      };
    },
  })),
}));

const { getServiceClient, getUserScopedClient, _resetCloudDbForTests } =
  await import('../../src/lib/neonClients');

describe('P1-GW-RLS: RLS-GAP tables — explicit user_id filter is the sole isolation mechanism', () => {
  afterEach(() => {
    captured.length = 0;
    rlsCaptured.length = 0;
    _resetCloudDbForTests();
  });

  it('emits a `user_id = $1` predicate for a representative RLS-GAP read via getServiceClient()', async () => {
    const userId = 'tenant-A';
    const db = getServiceClient();

    await db.from('conversations').select('id, title').eq('user_id', userId);

    expect(captured).toHaveLength(1);
    const { sql, params } = captured[0]!;
    // The generated SQL MUST scope by user_id — there is no RLS to fall back on.
    expect(sql).toMatch(/"user_id"\s*=\s*\$1/);
    expect(params).toEqual([userId]);
  });

  it('a query that omits the user_id filter produces NO scoping clause (proves there is no backstop for RLS-GAP tables)', async () => {
    const db = getServiceClient();

    // Simulate a regression that forgot the ownership filter.
    await db.from('conversations').select('id, title');

    expect(captured).toHaveLength(1);
    const { sql } = captured[0]!;
    // No WHERE clause at all — without the explicit filter, every tenant's rows
    // would be returned. This is exactly why the filter is load-bearing for
    // every RLS-GAP call site.
    expect(sql).not.toMatch(/WHERE/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Behavioural: getUserScopedClient threads the verified token into
//    withUser(), and fails safe — falls back to the service-role path,
//    never crashes, never silently drops the filter — when it can't.
// ---------------------------------------------------------------------------
describe('P1-GW-RLS: getUserScopedClient wiring + fail-safe fallback', () => {
  afterEach(() => {
    captured.length = 0;
    rlsCaptured.length = 0;
    _resetCloudDbForTests();
  });

  it('routes an RLS-covered query through NeonDatabaseAdapter.withUser(token) for a verified token', async () => {
    const db = getUserScopedClient({ userId: 'tenant-A', token: 'valid-token' });

    await db.from('subscriptions').select('plan_tier').eq('user_id', 'tenant-A');

    expect(rlsCaptured).toHaveLength(1);
    expect(captured).toHaveLength(0); // did NOT fall back to the service client
  });

  it('falls back to getServiceClient() — same explicit-filter guarantee, not a crash — when the token cannot be bound (e.g. no `sub` claim)', async () => {
    const db = getUserScopedClient({ userId: 'tenant-A', token: 'unbindable-token' });

    await db.from('subscriptions').select('plan_tier').eq('user_id', 'tenant-A');

    expect(rlsCaptured).toHaveLength(0);
    expect(captured).toHaveLength(1);
    const { sql, params } = captured[0]!;
    expect(sql).toMatch(/"user_id"\s*=\s*\$1/);
    expect(params).toEqual(['tenant-A']);
  });

  it('falls back to getServiceClient() when auth.token is empty', async () => {
    const db = getUserScopedClient({ userId: 'tenant-A', token: '' });

    await db.from('subscriptions').select('plan_tier').eq('user_id', 'tenant-A');

    expect(rlsCaptured).toHaveLength(0);
    expect(captured).toHaveLength(1);
  });

  it('falls back to getServiceClient() mid-request — not a 503 — when withUser() succeeds but the bound query fails (e.g. `app_rls` missing/ungranted on this database)', async () => {
    const db = getUserScopedClient({ userId: 'tenant-A', token: 'app_rls-missing-token' });

    const result = await db.from('subscriptions').select('plan_tier').eq('user_id', 'tenant-A');

    // The route must see a normal DbResult, not a rejected promise — this is
    // the failure mode that would otherwise turn planGate (gates ALL cloud
    // chat) and deduct_credits (a billing write) into hard failures if the
    // RLS infrastructure isn't provisioned on this database.
    expect(result.error).toBeNull();
    expect(rlsCaptured).toHaveLength(0);
    expect(captured).toHaveLength(1);
    const { sql, params } = captured[0]!;
    expect(sql).toMatch(/"user_id"\s*=\s*\$1/);
    expect(params).toEqual(['tenant-A']);
  });

  it("binds independent identities per call — user A's client never sees user B's binding, even interleaved (proves no shared mutable RLS-scoping state)", async () => {
    // Two clients built back-to-back, the way two different Express requests
    // would each call getUserScopedClient() with their own req.user.token.
    const dbA = getUserScopedClient({ userId: 'user-A', token: 'token-for-A' });
    const dbB = getUserScopedClient({ userId: 'user-B', token: 'token-for-B' });

    // Interleave queries — if getRlsAdapter()'s singleton ever mutated shared
    // state instead of handing back a fresh withUser()-bound child adapter
    // per call, B's query could observe A's binding (or vice versa).
    await dbA.from('subscriptions').select('plan_tier').eq('user_id', 'user-A');
    await dbB.from('subscriptions').select('plan_tier').eq('user_id', 'user-B');
    await dbA.from('subscriptions').select('plan_tier').eq('user_id', 'user-A');

    expect(rlsCaptured).toHaveLength(3);
    expect(rlsCaptured[0]!.boundToken).toBe('token-for-A');
    expect(rlsCaptured[0]!.params).toEqual(['user-A']);
    expect(rlsCaptured[1]!.boundToken).toBe('token-for-B');
    expect(rlsCaptured[1]!.params).toEqual(['user-B']);
    expect(rlsCaptured[2]!.boundToken).toBe('token-for-A');
    expect(rlsCaptured[2]!.params).toEqual(['user-A']);
  });
});
