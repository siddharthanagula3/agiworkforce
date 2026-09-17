import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const neonDir = resolve(import.meta.dirname);
const sql = readFileSync(resolve(neonDir, '0218_temporary_chat_attachments.sql'), 'utf8');
const down = readFileSync(
  resolve(neonDir, 'down/0218_temporary_chat_attachments.down.sql'),
  'utf8',
);

describe('0218 a temporary chat’s attachments', () => {
  it('defaults every existing row to the kept file it already was', () => {
    expect(sql).toMatch(/add column if not exists temporary_chat boolean not null default false/i);
  });

  it('indexes only what the purge has to find', () => {
    expect(sql).toMatch(/create index if not exists idx_media_assets_temporary_chat/i);
    expect(sql).toMatch(/where temporary_chat and deleted_at is null/i);
  });

  it('adds no table, so it adds no RLS policy, erasure entry or export entry', () => {
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/create policy/i);
  });

  it('reverses by dropping the marker, never by deleting anyone’s files', () => {
    expect(down).toContain('drop index if exists public.idx_media_assets_temporary_chat');
    expect(down).toMatch(/drop column if exists temporary_chat/i);
    expect(down).not.toMatch(/delete from public\.media_assets/i);
    expect(down).toContain("where filename = '0218_temporary_chat_attachments.sql'");
  });
});
