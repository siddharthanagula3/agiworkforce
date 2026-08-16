import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('sso connections clerk link migration', () => {
  it('links connections to the identity provider and records domain ownership', async () => {
    const sql = await readFile(
      join(process.cwd(), 'db/neon/0083_sso_connections_clerk_link.sql'),
      'utf8',
    );

    for (const column of [
      'clerk_connection_id',
      'oidc_discovery_url',
      'oidc_client_id',
      'acs_url',
      'sp_entity_id',
      'sp_metadata_url',
      'domain_verified_at',
      'domain_verification_token',
    ]) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${column}\\b`, 'i'));
    }

    expect(sql).not.toMatch(/add column if not exists oidc_client_secret/i);
  });

  it('makes connections dormant by default and refuses to store an unverified active connection', async () => {
    const sql = await readFile(
      join(process.cwd(), 'db/neon/0083_sso_connections_clerk_link.sql'),
      'utf8',
    );

    expect(sql).toMatch(/alter column is_active set default false/i);
    expect(sql).toMatch(/sso_connections_active_requires_verified_provisioned/i);
    expect(sql).toMatch(
      /is_active = false\s*or \(domain_verified_at is not null and clerk_connection_id is not null\)/i,
    );
  });

  it('constrains the verification token and forbids non-https provider endpoints', async () => {
    const sql = await readFile(
      join(process.cwd(), 'db/neon/0083_sso_connections_clerk_link.sql'),
      'utf8',
    );

    expect(sql).toMatch(/domain_verification_token ~ '\^\[a-f0-9\]\{32,64\}\$'/);
    expect(sql).toMatch(/metadata_url like 'https:\/\/%'/i);
    expect(sql).toMatch(/oidc_discovery_url like 'https:\/\/%'/i);
  });

  it('keeps one local row per provisioned identity-provider connection', async () => {
    const sql = await readFile(
      join(process.cwd(), 'db/neon/0083_sso_connections_clerk_link.sql'),
      'utf8',
    );

    expect(sql).toMatch(
      /create unique index if not exists idx_sso_connections_clerk_connection_id[\s\S]*where clerk_connection_id is not null/i,
    );
  });

  it('does not edit the applied 0076 migration', async () => {
    const original = await readFile(
      join(process.cwd(), 'db/neon/0076_enterprise_control_plane_tables.sql'),
      'utf8',
    );

    expect(original).not.toMatch(/clerk_connection_id/i);
    expect(original).not.toMatch(/domain_verified_at/i);
  });
});
