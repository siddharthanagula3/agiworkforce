import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ACCOUNT_STATUSES } from '@/lib/auth/account-status';

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

  it('accepts exactly the account statuses the auth boundary decides on', () => {
    for (const status of ACCOUNT_STATUSES) {
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
