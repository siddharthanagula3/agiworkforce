import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const original = readFileSync(resolve(import.meta.dirname, '0338_account_security.sql'), 'utf8');
const migration = readFileSync(
  resolve(import.meta.dirname, '0394_account_security_recovery_batch.sql'),
  'utf8',
);
const sql = migration
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const rollback = readFileSync(
  resolve(import.meta.dirname, 'down/0394_account_security_recovery_batch.down.sql'),
  'utf8',
);
const rollbackSql = rollback
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// These source assertions do not execute PostgreSQL or establish concurrency safety.
describe('append-only recovery batch migration source', () => {
  it('preserves the applied account-security migration byte for byte', () => {
    expect(createHash('sha256').update(original).digest('hex')).toBe(
      '64a23aeda3d9334b75a13487486d75f4f369ed5047fa3a6de9b4bdbf4f4d8480',
    );
  });

  it('adds the opaque receipt in a privileged transaction', () => {
    expect(sql).toMatch(/^begin;/);
    expect(sql).toMatch(/commit;$/);
    expect(sql).toContain('rolname = current_user and (rolsuper or rolbypassrls)');
    expect(sql).toContain(
      "raise exception 'Recovery batch migration requires a privileged owner with BYPASSRLS'",
    );
    expect(sql).toContain(
      'alter table public.account_security_enrollments add column pending_recovery_batch_id text;',
    );
  });

  it('invalidates only legacy pending material and never rewrites active keys', () => {
    const updates = [
      ...sql.matchAll(/update public\.account_security_enrollments\s+set\s+([^;]+);/g),
    ];
    expect(updates).toHaveLength(1);
    expect(updates[0]?.[1]).toBe(
      'pending_recovery_key_hashes = null, pending_recovery_keys_expire_at = null, pending_recovery_session_id = null',
    );
    expect(sql).not.toMatch(/\brecovery_key_hashes\s*=/);
    expect(sql).not.toMatch(
      /\b(?:delete from|truncate|drop table)\s+public\.account_security_enrollments/,
    );
    expect(sql.indexOf('set pending_recovery_key_hashes = null')).toBeLessThan(
      sql.indexOf('add constraint account_security_pending_batch_shape'),
    );
  });

  it('combines old all-or-none fields with the new receipt shape and exact format', () => {
    expect(original).toContain(
      '(pending_recovery_key_hashes is null) = (pending_recovery_keys_expire_at is null)',
    );
    expect(original).toContain(
      '(pending_recovery_key_hashes is null) = (pending_recovery_session_id is null)',
    );
    expect(sql).toContain(
      'add constraint account_security_pending_batch_shape check ( (pending_recovery_batch_id is null) = (pending_recovery_key_hashes is null)',
    );
    expect(sql).toContain(
      "and (pending_recovery_batch_id is null or pending_recovery_batch_id ~ '^[A-Za-z0-9_-]{43}$')",
    );
    expect(sql).not.toContain('drop constraint');
    expect(sql).not.toContain('not valid');
  });

  it('rejects old mixed-version overwrites using null-safe payload comparisons', () => {
    expect(sql).toContain(
      'create function public.require_new_recovery_batch_identity() returns trigger language plpgsql set search_path = pg_catalog, pg_temp',
    );
    expect(sql).toContain(
      'if new.pending_recovery_key_hashes is not null and new.pending_recovery_batch_id is not distinct from old.pending_recovery_batch_id and ( new.pending_recovery_key_hashes is distinct from old.pending_recovery_key_hashes or new.pending_recovery_keys_expire_at is distinct from old.pending_recovery_keys_expire_at or new.pending_recovery_session_id is distinct from old.pending_recovery_session_id ) then',
    );
    expect(sql).toContain(
      "raise exception using errcode = '23514', message = 'Generate recovery keys with a new batch identity'",
    );
    expect(sql).toContain('return new;');
    expect(sql).toContain(
      'create trigger require_new_recovery_batch_identity before update on public.account_security_enrollments for each row execute function public.require_new_recovery_batch_identity();',
    );
  });

  it('permits paired clears while rejecting identity-less inserts and receipt-retaining promotion shapes', () => {
    expect(sql).toContain('if new.pending_recovery_key_hashes is not null');
    expect(sql).toContain(
      '(pending_recovery_batch_id is null) = (pending_recovery_key_hashes is null)',
    );
    expect(sql).not.toMatch(/pending_recovery_batch_id text\s+default/);
    expect(sql).not.toMatch(/new\.pending_recovery_batch_id\s*:=/);
    expect(sql).not.toMatch(/disable trigger|session_replication_role/i);
  });

  it('rolls back pending proof without changing active recovery keys or deleting enrollments', () => {
    const updates = [
      ...rollbackSql.matchAll(/update public\.account_security_enrollments\s+set\s+([^;]+);/g),
    ];
    expect(updates).toHaveLength(1);
    const assignments = updates[0]![1]!
      .split(/\s+where\s+/)[0]!
      .split(',')
      .map((value) => value.trim());
    expect(assignments).toEqual([
      'pending_recovery_batch_id = null',
      'pending_recovery_key_hashes = null',
      'pending_recovery_keys_expire_at = null',
      'pending_recovery_session_id = null',
    ]);
    expect(rollbackSql).not.toMatch(/\brecovery_key_hashes\s*=/);
    expect(rollbackSql).not.toMatch(
      /\b(?:delete from|truncate|drop table)\s+public\.account_security_enrollments/,
    );
    expect(
      rollbackSql.indexOf(
        'lock table public.account_security_enrollments in access exclusive mode',
      ),
    ).toBeLessThan(rollbackSql.indexOf('update public.account_security_enrollments'));
    expect(rollbackSql).toContain(
      "delete from public.schema_migrations where filename = '0394_account_security_recovery_batch.sql';",
    );
  });
});
