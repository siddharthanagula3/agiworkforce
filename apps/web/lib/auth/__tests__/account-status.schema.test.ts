import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ACCOUNT_STATUSES, accountAccessDecision } from '../account-status';

const MIGRATIONS_DIR = join(process.cwd(), 'db/neon');
const CONSTRAINT = 'profiles_account_status_known';

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
}

/**
 * The last migration that redefines the constraint is the one the database ends
 * up holding, so the vocabulary is read from there rather than from a name this
 * test knows.
 */
function constrainedStatuses(): { file: string; statuses: string[] } {
  let found: { file: string; statuses: string[] } | null = null;

  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/--[^\n]*/g, '');
    const declaration = new RegExp(
      `add\\s+constraint\\s+${CONSTRAINT}\\s+check\\s*\\(([\\s\\S]*?)\\)\\s*\\)`,
      'i',
    ).exec(sql);
    if (!declaration?.[1]) continue;
    const values = [...declaration[1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1] as string);
    if (values.length > 0) found = { file, statuses: values };
  }

  if (!found) throw new Error(`No migration declares ${CONSTRAINT}`);
  return found;
}

describe('account status vocabulary', () => {
  it('is the same set in the schema and in the code that decides on it', () => {
    const { statuses } = constrainedStatuses();

    expect([...statuses].sort()).toEqual([...ACCOUNT_STATUSES].sort());
  });

  it('names every lifecycle the product distinguishes, so none of them reads as active', () => {
    const { statuses } = constrainedStatuses();

    for (const status of [
      'active',
      'locked',
      'recovery_pending',
      'suspended',
      'deletion_scheduled',
      'deleted',
    ]) {
      expect(statuses).toContain(status);
    }
  });

  it('holds the vocabulary in the schema, so a status no code decides on cannot be written', () => {
    const { file, statuses } = constrainedStatuses();
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/--[^\n]*/g, '');

    expect(sql).toMatch(/account_status\s+is\s+null\s+or\s+account_status\s+in/i);
    expect(new Set(statuses).size).toBe(statuses.length);
    for (const status of statuses) {
      expect(typeof accountAccessDecision(status).allowed).toBe('boolean');
    }
  });

  it('ships a reversal for the migration that holds the vocabulary', () => {
    const { file } = constrainedStatuses();
    const down = readFileSync(
      join(MIGRATIONS_DIR, 'down', file.replace(/\.sql$/, '.down.sql')),
      'utf8',
    );

    expect(down).toContain(CONSTRAINT);
    expect(down).toContain(`delete from public.schema_migrations where filename = '${file}'`);
  });
});
