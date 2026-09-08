import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0177_cloud_code_session_base_branch.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0177_cloud_code_session_base_branch.down.sql'),
  'utf8',
);
const branchMigration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0176_cloud_code_session_branch_and_context.sql'),
  'utf8',
);

describe('0177 cloud code session base branch migration', () => {
  it('is marked not yet applied', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('adds the column additively, so an existing session keeps working', () => {
    expect(migration).toContain('add column if not exists base_branch text');
    expect(migration).not.toContain('not null');
  });

  it('constrains the base to the same plain ref shape the working branch uses', () => {
    const pattern = "~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$'";
    expect(branchMigration).toContain(`working_branch ${pattern}`);
    expect(migration).toContain(`base_branch ${pattern}`);
  });

  it('leaves repository_branch alone, because the two answer different questions', () => {
    expect(migration).not.toMatch(/alter\s+column\s+repository_branch/);
    expect(migration).not.toMatch(/set\s+repository_branch/);
  });

  it('reverses the column and its constraint and retracts its ledger row', () => {
    expect(reversal).toContain('drop column if exists base_branch');
    expect(reversal).toContain('drop constraint if exists cloud_code_sessions_base_branch_ref');
    expect(reversal).toContain(
      "delete from public.schema_migrations\n where filename = '0177_cloud_code_session_base_branch.sql'",
    );
    expect(reversal.includes('\nbegin;')).toBe(true);
    expect(reversal.trim().endsWith('commit;')).toBe(true);
  });
});
