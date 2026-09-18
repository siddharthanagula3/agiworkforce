import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const neonDir = resolve(import.meta.dirname);
const sql = readFileSync(resolve(neonDir, '0238_cmek_key_rewrap_runs.sql'), 'utf8');
const down = readFileSync(resolve(neonDir, 'down/0238_cmek_key_rewrap_runs.down.sql'), 'utf8');

describe('0238 the record a key retirement is gated on', () => {
  it('records one rewrap per workspace and version pair', () => {
    expect(sql).toMatch(/create table if not exists public\.organization_key_rewrap_runs/i);
    expect(sql).toMatch(/from_key_version text not null/i);
    expect(sql).toMatch(/to_key_version text not null/i);
    expect(sql).toMatch(/create unique index if not exists organization_key_rewrap_runs_pair_idx/i);
  });

  it('makes a completion with work left in it impossible in the schema, not only in code', () => {
    expect(sql).toMatch(
      /organization_key_rewrap_runs_complete_has_no_remainder[\s\S]*remaining = 0 and failure_count = 0/i,
    );
    expect(sql).toMatch(/\(state = 'complete'\) = \(completed_at is not null\)/i);
  });

  it('refuses a rewrap that goes nowhere', () => {
    expect(sql).toMatch(
      /organization_key_rewrap_runs_versions_differ[\s\S]*from_key_version <> to_key_version/i,
    );
  });

  it('never stores key material, only the versions', () => {
    expect(sql).not.toMatch(/^\s*\w*(wrapped|material|plaintext)\w*\s+(text|bytea|jsonb)/im);
  });

  it('restricts reads to owners and admins and grants no write at all', () => {
    expect(sql).toMatch(/grant select on public\.organization_key_rewrap_runs to app_rls/i);
    expect(sql).not.toMatch(
      /grant (insert|update|delete)[^;]*public\.organization_key_rewrap_runs/i,
    );
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/force row level security/i);
    expect(sql).toMatch(/m\.role in \('owner', 'admin'\)/i);
  });
});

describe('0238 reverses', () => {
  it('drops the table, its policy and its indexes, and nothing else', () => {
    expect(down).toMatch(/drop table if exists public\.organization_key_rewrap_runs/i);
    expect(down).toMatch(/drop policy if exists organization_key_rewrap_runs_admin_read/i);
    expect(down).not.toMatch(/drop table if exists public\.organization_encryption_keys/i);
    expect(down).toContain("where filename = '0238_cmek_key_rewrap_runs.sql'");
  });

  it('warns that without it a retirement has nothing to gate on', () => {
    expect(down).toMatch(/nothing to gate on/i);
  });
});
