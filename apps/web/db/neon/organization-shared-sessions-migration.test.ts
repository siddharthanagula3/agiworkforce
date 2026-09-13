import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const neonDir = resolve(import.meta.dirname);

function readMigration(name: string): string {
  return readFileSync(resolve(neonDir, name), 'utf8');
}

describe('0186 organization sharing for shared conversations', () => {
  const sql = readMigration('0186_organization_shared_sessions.sql');
  const down = readMigration('down/0186_organization_shared_sessions.down.sql');

  it('adds visibility defaulted to public so no existing link changes audience', () => {
    expect(sql).toMatch(/add column if not exists visibility text not null default 'public'/i);
    expect(sql).toMatch(/check \(visibility in \('public', 'organization'\)\)/i);
    expect(sql).not.toMatch(/update\s+public\.shared_sessions\s+set\s+visibility/i);
  });

  it('stores the share as a grant row, not a flag on the conversation', () => {
    expect(sql).toMatch(/create table if not exists public\.organization_shared_sessions/i);
    expect(sql).toMatch(/primary key \(organization_id, shared_session_id\)/i);
    expect(sql).toMatch(/idx_org_shared_sessions_session/i);
  });

  it('cascades the grant when the share or the organization goes away', () => {
    expect(sql).toMatch(
      /shared_session_id uuid not null references public\.shared_sessions\(id\) on delete cascade/i,
    );
    expect(sql).toMatch(
      /organization_id uuid not null references public\.organizations\(id\) on delete cascade/i,
    );
  });

  it('forces row level security on both tables and binds every policy to app_rls', () => {
    expect(sql).toMatch(
      /alter table public\.organization_shared_sessions force row level security/i,
    );
    expect(sql).toMatch(/alter table public\.shared_sessions force row level security/i);
    const policies = sql.match(/create policy [\s\S]*?using/gi) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toMatch(/to app_rls/i);
    }
  });

  /**
   * 0185's lesson, asserted before it can be repeated. A FOR ALL policy on a
   * grant table also governs SELECT, so reading the grant table evaluates its
   * ownership EXISTS against the shared table, whose org-shared read policy
   * reads the grant table again, and Postgres raises 42P17 on every statement.
   */
  it('writes the grant table through per-command policies, never FOR ALL', () => {
    expect(sql).not.toMatch(/on public\.organization_shared_sessions for all/i);
    for (const command of ['insert', 'update', 'delete']) {
      expect(sql).toMatch(
        new RegExp(
          `create policy organization_shared_sessions_owner_${command}[\\s\\S]*?for ${command} to app_rls`,
          'i',
        ),
      );
    }
  });

  it('lets every member read the grant set but only the share owner mint one', () => {
    expect(sql).toMatch(
      /create policy organization_shared_sessions_member_read[\s\S]*?for select to app_rls[\s\S]*?app_org_resource_is_readable/i,
    );
    const insert = sql.slice(
      sql.indexOf('create policy organization_shared_sessions_owner_insert'),
      sql.indexOf('create policy organization_shared_sessions_owner_update'),
    );
    expect(insert).toMatch(/session\.owner_id = public\.current_app_user_id\(\)/i);
    expect(insert).toMatch(/shared_by_user_id = public\.current_app_user_id\(\)/i);
  });

  it('widens only SELECT on shared_sessions for org members', () => {
    const read = sql.slice(sql.indexOf('create policy shared_sessions_org_shared_read'));
    expect(read).toMatch(/for select to app_rls/i);
    expect(read).not.toMatch(/with check/i);
    expect(sql).not.toMatch(/on public\.shared_sessions for all/i);
  });

  it('grants the scoped role only the two commands a scoped statement runs', () => {
    expect(sql).toMatch(/grant select, update on public\.shared_sessions to app_rls/i);
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*on public\.shared_sessions to app_rls/i);
  });

  it('reverses in one transaction and retracts its ledger row', () => {
    const statements = down
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .trim();
    expect(statements.startsWith('begin;')).toBe(true);
    expect(statements.endsWith('commit;')).toBe(true);
    expect(down).toMatch(
      /delete from public\.schema_migrations\s+where filename = '0186_organization_shared_sessions\.sql';/i,
    );
    expect(down).toMatch(/drop table if exists public\.organization_shared_sessions/i);
    expect(down).toMatch(/drop column if exists visibility/i);
    expect(down).toMatch(/alter table public\.shared_sessions disable row level security/i);
  });
});
