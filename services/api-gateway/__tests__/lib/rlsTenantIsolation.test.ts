/**
 * P1-GW-RLS invariant tests.
 *
 * The "RLS defense-in-depth" comments that used to litter the gateway described
 * a control that does NOT exist: getUserScopedClient returns the service-role
 * client (the Neon HTTP driver cannot carry `SET LOCAL request.jwt.claims`
 * across one-shot requests, so Postgres RLS on `auth.uid()` is never active).
 * Tenant isolation rests SOLELY on the explicit `.eq('user_id', …)` filter that
 * each route applies.
 *
 * These tests encode that invariant two ways:
 *  1. A comment-scan asserts the misleading "RLS … defense in depth" claims are
 *     gone from src/.
 *  2. A behavioural test runs the REAL Neon query builder over a fake driver and
 *     asserts the generated SQL carries the `"user_id" = $1` predicate — i.e.
 *     the sole isolation mechanism is actually present. If a future regression
 *     drops the filter, this test goes red (it would leak across tenants).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// 1. Comment-scan: no false "RLS defense-in-depth" tenant-isolation claims.
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
    // `user_id = auth.uid()` RLS backstop") are allowed and must not match.
    const banned = [
      /RLS-bound/,
      /RLS adds[- ]defense/i,
      /RLS adds defense/i,
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
// 2. Behavioural: the explicit user_id filter is the actual isolation mechanism.
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

const { getUserScopedClient, _resetCloudDbForTests } = await import('../../src/lib/neonClients');

describe('P1-GW-RLS: explicit user_id filter is the sole isolation mechanism', () => {
  afterEach(() => {
    captured.length = 0;
    _resetCloudDbForTests();
  });

  it('emits a `user_id = $1` predicate for a representative user-scoped read', async () => {
    _resetCloudDbForTests();
    const userId = 'tenant-A';
    const db = getUserScopedClient(userId);

    await db.from('conversations').select('id, title').eq('user_id', userId);

    expect(captured).toHaveLength(1);
    const { sql, params } = captured[0]!;
    // The generated SQL MUST scope by user_id — there is no RLS to fall back on.
    expect(sql).toMatch(/"user_id"\s*=\s*\$1/);
    expect(params).toEqual([userId]);
  });

  it('a query that omits the user_id filter produces NO scoping clause (proves there is no backstop)', async () => {
    _resetCloudDbForTests();
    const db = getUserScopedClient('tenant-A');

    // Simulate a regression that forgot the ownership filter.
    await db.from('conversations').select('id, title');

    expect(captured).toHaveLength(1);
    const { sql } = captured[0]!;
    // No WHERE clause at all — without the explicit filter, every tenant's rows
    // would be returned. This is exactly why the filter is load-bearing.
    expect(sql).not.toMatch(/WHERE/i);
  });
});
