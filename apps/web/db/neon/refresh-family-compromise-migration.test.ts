import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { REFRESH_FAMILY_COMPROMISE_REASONS } from '@/lib/server/refresh-token-family';

const MIGRATION = '0233_refresh_family_compromise.sql';

const migration = fs.readFileSync(path.resolve(import.meta.dirname, MIGRATION), 'utf8');
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down', MIGRATION.replace(/\.sql$/, '.down.sql')),
  'utf8',
);

describe('refresh family compromise migration', () => {
  it('is marked as not yet applied', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('accepts exactly the reasons the code can record', () => {
    for (const reason of REFRESH_FAMILY_COMPROMISE_REASONS) {
      expect(migration).toContain(`'${reason}'`);
    }
  });

  it('refuses a compromise recorded without a reason, or a reason without a time', () => {
    expect(migration).toContain('compromised_at is null and compromised_reason is null');
    expect(migration).toContain('compromised_at is not null');
  });

  it('indexes only the families that are compromised, which is the rare case', () => {
    expect(migration).toContain('where compromised_at is not null');
  });

  it('has a reversal that drops both columns and forgets the migration', () => {
    expect(reversal).toContain('drop column if exists compromised_at');
    expect(reversal).toContain('drop column if exists compromised_reason');
    expect(reversal).toContain(`where filename = '${MIGRATION}'`);
  });
});
