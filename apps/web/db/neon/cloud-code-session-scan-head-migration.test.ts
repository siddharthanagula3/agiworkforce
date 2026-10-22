import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0382_cloud_code_session_scan_head.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0382_cloud_code_session_scan_head.down.sql'),
  'utf8',
);

describe('0382 cloud code session scan head migration', () => {
  it('is marked not yet applied', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('adds both columns nullable, so an existing session keeps working', () => {
    expect(migration).toContain('add column if not exists security_scan_id uuid');
    expect(migration).toContain('add column if not exists security_scan_issued_at timestamptz');
    expect(migration).not.toMatch(/not null/i);
  });

  it('reverses both columns and retracts its ledger row', () => {
    expect(reversal).toContain('drop column if exists security_scan_id');
    expect(reversal).toContain('drop column if exists security_scan_issued_at');
    expect(reversal).toContain(
      "delete from public.schema_migrations\n where filename = '0382_cloud_code_session_scan_head.sql'",
    );
    expect(reversal.includes('\nbegin;')).toBe(true);
    expect(reversal.trim().endsWith('commit;')).toBe(true);
  });
});
