import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const neonDir = resolve(import.meta.dirname);

function readMigration(name: string): string {
  return readFileSync(resolve(neonDir, name), 'utf8');
}

describe('0184 organization sharing for published artifacts', () => {
  const sql = readMigration('0184_organization_shared_artifacts.sql');
  const down = readMigration('down/0184_organization_shared_artifacts.down.sql');

  it('adds visibility defaulted to public so no existing artifact changes audience', () => {
    expect(sql).toMatch(/add column if not exists visibility text not null default 'public'/i);
    expect(sql).toMatch(/check \(visibility in \('public', 'organization'\)\)/i);
    expect(sql).not.toMatch(/update\s+public\.published_artifacts\s+set\s+visibility/i);
  });

  it('stores the share as a grant row, not a flag on the artifact', () => {
    expect(sql).toMatch(/create table if not exists public\.organization_shared_artifacts/i);
    expect(sql).toMatch(/primary key \(organization_id, published_artifact_id\)/i);
    expect(sql).toMatch(/idx_org_shared_artifacts_artifact/i);
  });

  it('cascades the grant when the artifact or the organization goes away', () => {
    expect(sql).toMatch(
      /published_artifact_id uuid not null references public\.published_artifacts\(id\) on delete cascade/i,
    );
    expect(sql).toMatch(
      /organization_id uuid not null references public\.organizations\(id\) on delete cascade/i,
    );
  });

  it('forces row level security on the grant table and binds every policy to app_rls', () => {
    expect(sql).toMatch(
      /alter table public\.organization_shared_artifacts force row level security/i,
    );
    const policies = sql.match(/create policy [\s\S]*?using/gi) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toMatch(/to app_rls/i);
    }
  });

  it('lets every member read the grant set but only the owner write it', () => {
    expect(sql).toMatch(
      /create policy organization_shared_artifacts_member_read[\s\S]*?for select to app_rls[\s\S]*?app_org_resource_is_readable/i,
    );
    const write = sql.slice(sql.indexOf('create policy organization_shared_artifacts_owner_write'));
    expect(write).toMatch(/artifact\.user_id = public\.current_app_user_id\(\)/i);
    expect(write).toMatch(/shared_by_user_id = public\.current_app_user_id\(\)/i);
  });

  it('widens only SELECT on published_artifacts for org members', () => {
    const read = sql.slice(sql.indexOf('create policy published_artifacts_org_shared_read'));
    expect(read).toMatch(/for select to app_rls/i);
    expect(read).not.toMatch(/with check/i);
    expect(sql).not.toMatch(/on public\.published_artifacts for all/i);
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
      /delete from public\.schema_migrations\s+where filename = '0184_organization_shared_artifacts\.sql';/i,
    );
    expect(down).toMatch(/drop table if exists public\.organization_shared_artifacts/i);
    expect(down).toMatch(/drop column if exists visibility/i);
  });
});
