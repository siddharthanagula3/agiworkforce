import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0387_event_trigger_signing_salt.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0387_event_trigger_signing_salt.down.sql'),
  'utf8',
);

describe('0387 event trigger signing salt migration', () => {
  it('is marked not yet applied', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('adds a nullable salt, so an existing trigger keeps its secret', () => {
    expect(migration).toContain('add column if not exists signing_salt text');
    expect(migration).not.toMatch(/not null/i);
    expect(migration).toContain("signing_salt ~ '^[0-9a-f]{64}$'");
  });

  it('gives the account no grant to write the salt itself', () => {
    expect(migration).not.toMatch(/^\s*grant\b/im);
  });

  it('drops the column and retracts its ledger row', () => {
    expect(reversal).toContain('drop column if exists signing_salt');
    expect(reversal).toContain(
      "delete from public.schema_migrations\n where filename = '0387_event_trigger_signing_salt.sql'",
    );
  });
});
