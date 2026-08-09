import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('terms acceptance migration', () => {
  it('gives profiles the version, instant and surface an acceptance needs to be proved', async () => {
    const sql = await readFile(join(process.cwd(), 'db/neon/0102_terms_acceptance.sql'), 'utf8');

    expect(sql).toMatch(
      /alter table public\.profiles\s+add column if not exists terms_version text/i,
    );
    expect(sql).toMatch(
      /alter table public\.profiles\s+add column if not exists terms_accepted_at timestamptz/i,
    );
    expect(sql).toMatch(
      /alter table public\.profiles\s+add column if not exists terms_accepted_surface text/i,
    );
  });

  it('adds no NOT NULL or default that would claim an acceptance for existing accounts', async () => {
    const sql = await readFile(join(process.cwd(), 'db/neon/0102_terms_acceptance.sql'), 'utf8');
    const statements = sql
      .replace(/--[^\n]*/g, '')
      .split(';')
      .filter((statement) => /add column/i.test(statement));

    expect(statements).toHaveLength(3);
    for (const statement of statements) {
      expect(statement).not.toMatch(/not null/i);
      expect(statement).not.toMatch(/default/i);
    }
  });
});
