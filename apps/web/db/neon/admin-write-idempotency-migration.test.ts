import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATION = '0245_admin_write_idempotency_and_service_principals.sql';
const dir = path.join(process.cwd(), 'db/neon');
const sql = readFileSync(path.join(dir, MIGRATION), 'utf8');
const down = readFileSync(path.join(dir, 'down', MIGRATION.replace(/\.sql$/, '.down.sql')), 'utf8');

describe('admin request idempotency', () => {
  it('keys a record by workspace, scope and the caller key together', () => {
    expect(sql).toMatch(/primary key \(organization_id, scope, idempotency_key\)/);
  });

  it('stores the request fingerprint, so a key reused for a different body is detectable', () => {
    expect(sql).toMatch(
      /request_fingerprint text not null check \(request_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'\)/,
    );
  });

  it('refuses a completed record that carries no response to replay', () => {
    expect(sql).toMatch(/admin_request_idempotency_completed_carries_a_response/);
    expect(sql).toMatch(
      /status <> 'completed' or \(response_status is not null and completed_at is not null\)/,
    );
  });

  it('expires records so a key can be reused for a genuinely new intent', () => {
    expect(sql).toMatch(
      /expires_at timestamptz not null default \(now\(\) \+ interval '24 hours'\)/,
    );
    expect(sql).toMatch(/idx_admin_request_idempotency_expires/);
  });

  it('keeps a replayed response out of every interactive session', () => {
    expect(sql).toMatch(/alter table public\.admin_request_idempotency enable row level security/);
    expect(sql).toMatch(/alter table public\.admin_request_idempotency force row level security/);
    expect(sql).toMatch(/revoke all on public\.admin_request_idempotency from app_rls/);
    expect(sql).not.toMatch(/grant [a-z, ]*on public\.admin_request_idempotency to app_rls/);
  });
});

describe('service principals', () => {
  it('is a workspace-owned identity, not a column on the key', () => {
    expect(sql).toMatch(/create table if not exists public\.organization_service_principals/);
    expect(sql).toMatch(
      /organization_id uuid not null references public\.organizations\(id\) on delete cascade/,
    );
    expect(sql).toMatch(/unique \(organization_id, name\)/);
  });

  it('bounds what any key issued to it may carry', () => {
    expect(sql).toMatch(/max_scopes text\[\] not null check \(/);
    expect(sql).toMatch(/cardinality\(max_scopes\) between 1 and 16/);
  });

  it('can be disabled once to stop every key issued to it', () => {
    expect(sql).toMatch(/disabled_at timestamptz/);
    expect(sql).toMatch(/disabled_by_user_id text/);
  });

  it('gives every key that exists today an identity rather than leaving it null', () => {
    expect(sql).toMatch(/add column if not exists service_principal_id uuid/);
    expect(sql).toMatch(/where service_principal_id is null/);
    expect(sql).toMatch(
      /update public\.organization_admin_api_keys\s+set service_principal_id = principal/,
    );
  });

  it('backfills the principal with exactly the scopes the key already had', () => {
    expect(sql).toMatch(/key_row\.scopes/);
  });

  it('is readable by a workspace administrator and writable by none', () => {
    expect(sql).toMatch(/organization_service_principals_identity_read/);
    expect(sql).toMatch(
      /using \(public\.app_has_org_permission\(organization_id, 'identity\.read'\)\)/,
    );
    expect(sql).not.toMatch(
      /grant (insert|update|delete)[a-z, ]* on public\.organization_service_principals to app_rls/,
    );
  });
});

describe('reversal', () => {
  it('drops both tables, the column and the index, and clears the ledger row', () => {
    expect(down).toMatch(/drop table if exists public\.admin_request_idempotency/);
    expect(down).toMatch(/drop table if exists public\.organization_service_principals/);
    expect(down).toMatch(/drop column if exists service_principal_id/);
    expect(down).toMatch(/drop index if exists public\.idx_organization_admin_api_keys_principal/);
    expect(down).toMatch(new RegExp(`delete from public\\.schema_migrations[\\s\\S]*${MIGRATION}`));
  });

  it('states what running it costs', () => {
    expect(down).toMatch(/COST, read this before running it/);
  });
});
