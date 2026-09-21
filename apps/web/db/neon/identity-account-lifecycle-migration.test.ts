import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '0225_identity_account_lifecycle.sql';

const migration = fs.readFileSync(path.resolve(import.meta.dirname, MIGRATION), 'utf8');
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down', MIGRATION.replace(/\.sql$/, '.down.sql')),
  'utf8',
);

describe('identity account lifecycle migration', () => {
  it('is marked as not yet applied', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  // The vocabulary the database ends up holding is whatever the last migration
  // to redefine this constraint says, and lib/auth/__tests__/account-status.schema
  // is what keeps that in step with the code. This file answers only for the
  // three states 0020 had no way to express.
  it('introduces the states a bare text column could not express', () => {
    for (const status of ['locked', 'deletion_scheduled', 'deleted']) {
      expect(migration).toContain(`'${status}'`);
    }
  });

  it('leaves the status column nullable, because 0020 defaulted it and never backfilled', () => {
    expect(migration).toContain('account_status is null');
  });

  it('adds the status constraint NOT VALID so an unknown legacy value cannot fail the apply', () => {
    expect(migration).toMatch(/add constraint profiles_account_status_known[\s\S]*?not valid;/);
  });

  it('records where a mapping came from and when it last authenticated', () => {
    expect(migration).toContain(
      "add column if not exists creation_source text not null default 'backfill'",
    );
    expect(migration).toContain('add column if not exists last_authenticated_at timestamptz');
    expect(migration).toContain(
      "check (creation_source in ('backfill', 'sign_in', 'sso', 'link'))",
    );
  });

  it('has a reversal that drops both columns, both constraints and forgets the migration', () => {
    expect(reversal).toContain('drop column if exists creation_source');
    expect(reversal).toContain('drop column if exists last_authenticated_at');
    expect(reversal).toContain('drop constraint if exists profiles_account_status_known');
    expect(reversal).toContain(`where filename = '${MIGRATION}'`);
  });
});
