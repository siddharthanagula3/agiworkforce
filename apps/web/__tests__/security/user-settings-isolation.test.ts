import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(WEB, p), 'utf-8');

/**
 * `public.user_settings` is under RLS as of 0134_user_settings_rls.sql, and the
 * preferences route reads it through `getUserScopedDb()` so the policy actually
 * applies, the Neon owner role carries BYPASSRLS, so a route left on
 * `getNeonDb()` would sail straight past it and the policy would be decorative.
 *
 * Both halves are pinned here, plus the `where user_id = $1` predicate that
 * remains the first line of defence. The policy is the second, for the day
 * someone forgets the predicate.
 *
 * This file previously asserted the OPPOSITE, that no policy existed and that
 * 0042's "RLS isolates it" comment was a false claim. It was, when written.
 * 0134 made it true, and 0042 cannot be edited to say so: it is an applied
 * migration, and rewriting one is checksum drift the migration runner reports
 * forever.
 */
describe('user_settings tenant isolation', () => {
  const route = read('app/api/settings/preferences/route.ts');

  it('scopes every user_settings query by user_id', () => {
    const statements =
      route.match(
        /(?:select|insert into|update|delete from)[\s\S]{0,240}?user_settings[\s\S]{0,240}?(?=;|`)/gi,
      ) ?? [];
    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) {
      expect(s).toMatch(/user_id/i);
    }
  });

  it('has an RLS policy on user_settings, so the guarantee is real', () => {
    const migration = read('db/neon/0134_user_settings_rls.sql');
    expect(migration).toMatch(/enable row level security/i);
    // FORCE matters: without it the table owner bypasses the policy, and the
    // owner is exactly who the application connects as.
    expect(migration).toMatch(/force row level security/i);
    expect(migration).toMatch(/using \(user_id = public\.current_app_user_id\(\)\)/i);
    expect(migration).toMatch(/with check \(user_id = public\.current_app_user_id\(\)\)/i);
  });

  it('reads user_settings through the scoped client, not the BYPASSRLS one', () => {
    // A policy with the route left on getNeonDb() is decorative: the Neon owner
    // role has BYPASSRLS and would never see it.
    expect(route).toContain('getUserScopedDb');
    // Comments stripped first: the route explains WHY it is not on getNeonDb,
    // and matching that sentence would fail on the documentation.
    const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('getNeonDb');
  });
});
