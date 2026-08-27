import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('GitHub installation ownership migration', () => {
  it('adds an explicit proof marker without trusting or backfilling legacy rows', async () => {
    const sql = await readFile(
      join(process.cwd(), 'db/neon/0072_github_installation_ownership.sql'),
      'utf8',
    );

    expect(sql).toMatch(/alter table public\.github_installations/i);
    expect(sql).toMatch(/add column if not exists ownership_verified_at timestamptz/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.github_installations\b/i);
  });

  it('repairs baselined databases without trusting legacy rows', async () => {
    const sql = await readFile(
      join(process.cwd(), 'db/neon/0146_repair_github_installation_ownership.sql'),
      'utf8',
    );

    expect(sql).toMatch(/alter table public\.github_installations/i);
    expect(sql).toMatch(/add column if not exists ownership_verified_at timestamptz/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.github_installations\b/i);
  });
});
