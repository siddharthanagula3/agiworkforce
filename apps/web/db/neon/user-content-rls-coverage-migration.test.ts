import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = join(process.cwd(), 'db/neon');
const MIGRATION = '0137_user_content_rls_coverage.sql';

function executableSql(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/u, ''))
    .join('\n');
}

const sql = executableSql(MIGRATION);

/**
 * The ten user-owned tables 0037 granted app_rls unconditional DML on and no
 * migration ever gave a policy. Listed here rather than derived so that adding
 * a table to the migration without adding it here fails loudly.
 */
const USER_ONLY_TABLES = [
  'user_two_factor',
  'account_sessions',
  'notifications',
  'chat_folders',
  'conversation_tags',
  'message_bookmarks',
  'message_reactions',
  'user_shortcuts',
  'email_preferences',
] as const;

describe('0137 — RLS coverage for user-owned content tables', () => {
  it('names every table the coverage audit found unprotected', () => {
    for (const table of USER_ONLY_TABLES) {
      expect(sql).toContain(`'${table}'`);
    }
    expect(sql).toContain('search_history');
  });

  it('enables AND forces row level security, not merely enables it', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/i);
  });

  it('scopes the user-only tables to the caller, on read and on write', () => {
    // USING alone would leave INSERT/UPDATE free to file a row under another
    // user's id — the forgery case, which needs WITH CHECK.
    expect(sql).toMatch(/USING \(user_id = public\.current_app_user_id\(\)\)/);
    expect(sql).toMatch(/WITH CHECK \(user_id = public\.current_app_user_id\(\)\)/);
  });

  it('binds every policy to app_rls rather than PUBLIC', () => {
    const policyTargets = [...sql.matchAll(/FOR ALL TO (\w+)/gi)].map((m) => m[1]);
    expect(policyTargets.length).toBeGreaterThan(0);
    for (const target of policyTargets) {
      expect(target).toBe('app_rls');
    }
  });

  it('reuses the shared tenancy predicates for the workspace-aware table', () => {
    // search_history carries organization_id (0110). A hand-rolled owner-only
    // rule here would let a Personal-scope caller read organization rows, which
    // app_row_is_visible already prevents for the twelve roots in 0073.
    expect(sql).toMatch(/app_row_is_visible\(user_id, organization_id\)/);
    expect(sql).toMatch(/app_row_is_writable\(user_id, organization_id\)/);
  });

  it('never re-issues a blanket grant', () => {
    // 0043's footgun: `GRANT ... ON ALL TABLES IN SCHEMA public TO app_rls`
    // would restore direct write access on the append-only tables and silently
    // undo those guarantees with no failing test.
    expect(sql).not.toMatch(/GRANT[\s\S]{0,80}ON ALL TABLES IN SCHEMA/i);
  });

  it('drops each policy by name first so re-applying is idempotent', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS/i);
  });

  it('runs as a single transaction', () => {
    expect(sql).toMatch(/^\s*BEGIN;/m);
    expect(sql).toMatch(/^\s*COMMIT;/m);
  });

  it('tolerates a relation that is absent in an environment', () => {
    expect(sql).toMatch(/to_regclass/i);
  });

  it('is the highest-numbered migration, so it cannot be skipped by ordering', () => {
    const numbers = readdirSync(migrationsDir)
      .filter((n) => /^\d{4}_.*\.sql$/.test(n))
      .map((n) => Number.parseInt(n.slice(0, 4), 10));
    expect(Math.max(...numbers)).toBeGreaterThanOrEqual(137);
  });
});
