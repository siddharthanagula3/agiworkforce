import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const squash = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const up = squash(read('0407_account_security_undo_cleanup.sql'));
const downSource = read('down/0407_account_security_undo_cleanup.down.sql');
const down = squash(downSource);
const store = readFileSync(
  resolve(import.meta.dirname, '../../lib/server/account-security/store.ts'),
  'utf8',
);

// These source assertions do not execute PostgreSQL.
describe('0407 account security undo cleanup', () => {
  it('adds only nullable columns to the existing enrollment table in one transaction', () => {
    expect(read('0407_account_security_undo_cleanup.sql')).toContain('NOT YET APPLIED');
    expect(up).toMatch(/^begin;/);
    expect(up).toMatch(/commit;$/);
    expect(up).toContain(
      'alter table public.account_security_enrollments add column if not exists undo_cleanup_token_hash text, add column if not exists undo_cleanup_expires_at timestamptz, add column if not exists undo_cleanup_lease_until timestamptz, add column if not exists undo_cleanup jsonb;',
    );
    expect(up).not.toMatch(/add column[^;]*not null/);
    expect(up).not.toMatch(/create table/);
  });

  it('keeps the four columns consistent and the link hash well formed and unique', () => {
    expect(up).toContain('drop constraint if exists account_security_undo_cleanup_shape;');
    expect(up).toContain('(undo_cleanup is null) = (undo_cleanup_token_hash is null)');
    expect(up).toContain('(undo_cleanup is null) = (undo_cleanup_expires_at is null)');
    expect(up).toContain('(undo_cleanup is not null or undo_cleanup_lease_until is null)');
    expect(up).toContain("undo_cleanup_token_hash ~ '^[0-9a-f]{64}$'");
    expect(up).toContain("jsonb_typeof(undo_cleanup) = 'object'");
    expect(up).toContain(
      'create unique index if not exists idx_account_security_enrollments_undo_cleanup_token on public.account_security_enrollments (undo_cleanup_token_hash) where undo_cleanup_token_hash is not null;',
    );
  });

  it('is the shape the store writes when it burns the link', () => {
    for (const column of [
      'undo_cleanup_token_hash',
      'undo_cleanup_expires_at',
      'undo_cleanup_lease_until',
      'undo_cleanup',
    ]) {
      expect(up).toContain(column);
      expect(store).toContain(column);
    }
  });

  it('rolls back what it adds', () => {
    expect(downSource).toContain('WHAT THIS COSTS');
    expect(down).toMatch(/^begin;/);
    expect(down).toMatch(/commit;$/);
    expect(down).toContain(
      'drop index if exists public.idx_account_security_enrollments_undo_cleanup_token;',
    );
    expect(down).toContain('drop constraint if exists account_security_undo_cleanup_shape;');
    for (const column of [
      'undo_cleanup',
      'undo_cleanup_lease_until',
      'undo_cleanup_expires_at',
      'undo_cleanup_token_hash',
    ]) {
      expect(down).toContain(`drop column if exists ${column}`);
    }
    expect(down).toContain("where filename = '0407_account_security_undo_cleanup.sql';");
  });
});
