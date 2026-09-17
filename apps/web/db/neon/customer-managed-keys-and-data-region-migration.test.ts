import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const neonDir = resolve(import.meta.dirname);
const sql = readFileSync(
  resolve(neonDir, '0220_customer_managed_keys_and_data_region.sql'),
  'utf8',
);
const down = readFileSync(
  resolve(neonDir, 'down/0220_customer_managed_keys_and_data_region.down.sql'),
  'utf8',
);

describe('0220 customer-managed encryption keys', () => {
  it('stores the wrapped data key and the name of the customer key, never the key that wraps it', () => {
    expect(sql).toMatch(/create table if not exists public\.organization_encryption_keys/i);
    expect(sql).toMatch(/wrapped_data_key text not null/i);
    expect(sql).toMatch(/key_uri text not null/i);
    expect(sql).not.toMatch(/\bkek_material\b|\bprivate_key\b/i);
  });

  it('keeps previous versions so a rotation does not have to rewrite every ciphertext first', () => {
    expect(sql).toMatch(/retired_keys jsonb not null default '\[\]'::jsonb/i);
    expect(sql).toMatch(/jsonb_typeof\(retired_keys\) = 'array'/i);
  });

  it('constrains the status to the three the resolver knows, revocation included', () => {
    expect(sql).toMatch(/status in \('active', 'rotating', 'revoked'\)/i);
    expect(sql).toMatch(/\(status = 'revoked'\) = \(revoked_at is not null\)/i);
  });

  it('restricts reads to owners and admins and grants no write at all', () => {
    expect(sql).toMatch(/grant select on public\.organization_encryption_keys to app_rls/i);
    expect(sql).not.toMatch(
      /grant (insert|update|delete)[^;]*public\.organization_encryption_keys/i,
    );
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/force row level security/i);
    expect(sql).toMatch(/m\.role in \('owner', 'admin'\)/i);
  });
});

describe('0220 the region a workspace is pinned to', () => {
  it('adds the pin, the requested move and when it was asked for', () => {
    expect(sql).toMatch(/add column if not exists data_region text/i);
    expect(sql).toMatch(/add column if not exists data_region_requested text/i);
    expect(sql).toMatch(/add column if not exists data_region_requested_at timestamptz/i);
  });

  it('constrains the region to the ids the build declares rather than free text', () => {
    expect(sql).toMatch(/data_region is null or data_region in \('us', 'eu'\)/i);
    expect(sql).toMatch(
      /data_region_requested is null or data_region_requested in \('us', 'eu'\)/i,
    );
  });

  it('says in the schema that a request is not the same as the region the data is in', () => {
    expect(sql).toMatch(/comment on column public\.organizations\.data_region_requested/i);
    expect(sql).toMatch(/moving is a copy and a cutover/i);
  });
});

describe('0220 reverses', () => {
  it('drops the table, its policy and the three columns, and nothing else', () => {
    expect(down).toMatch(/drop table if exists public\.organization_encryption_keys/i);
    expect(down).toMatch(/drop policy if exists organization_encryption_keys_admin_read/i);
    expect(down).toMatch(/drop column if exists data_region\b/i);
    expect(down).not.toMatch(/drop table if exists public\.organizations/i);
    expect(down).toContain("where filename = '0220_customer_managed_keys_and_data_region.sql'");
  });

  it('warns that dropping the table discards the wrapped keys', () => {
    expect(down).toMatch(/re-wrap onto the platform ring BEFORE running this/i);
  });
});
