import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0403_support_access_grant_lifecycle.sql');
const down = read('down/0403_support_access_grant_lifecycle.down.sql');
const flat = (sql: string) => sql.replace(/\s+/g, ' ');

describe('0403 support access grant lifecycle', () => {
  it('replaces the 0229 equivalence under the same constraint name', () => {
    expect(up).toContain('NOT YET APPLIED : draft only');
    expect(flat(up)).toContain(
      'drop constraint if exists support_access_grants_approval_is_complete;',
    );
    expect(flat(up)).toContain(
      'add constraint support_access_grants_approval_is_complete check ( case status',
    );
    expect(flat(up)).not.toContain("(status = 'approved') =");
  });

  it('keeps the complete approval on approved and expired grants', () => {
    const complete =
      'approved_by_user_id is not null and decided_at is not null and expires_at is not null';
    expect(flat(up)).toContain(`when 'approved' then ${complete}`);
    expect(flat(up)).toContain(`when 'expired' then ${complete}`);
  });

  it('lets a revoked grant carry no approval or the whole approval, never part of one', () => {
    expect(flat(up)).toContain(
      "when 'revoked' then (approved_by_user_id is null and expires_at is null) or (approved_by_user_id is not null and decided_at is not null and expires_at is not null)",
    );
    expect(flat(up)).toContain('else approved_by_user_id is null and expires_at is null end');
  });

  it('never clears approval history to satisfy the check', () => {
    const applied = up.slice(up.indexOf('begin;'), up.indexOf('commit;'));
    expect(applied).not.toMatch(/set\s+approved_by_user_id\s*=\s*null/i);
    expect(applied).not.toMatch(/update\s+public\.support_access_grants/i);
  });

  it('rolls back to the 0229 equivalence and forgets the migration', () => {
    expect(down).toContain('WHAT THIS COSTS');
    expect(flat(down)).toContain(
      "check ( (status = 'approved') = (approved_by_user_id is not null and decided_at is not null and expires_at is not null) );",
    );
    expect(down).toContain("where filename = '0403_support_access_grant_lifecycle.sql';");
  });
});
