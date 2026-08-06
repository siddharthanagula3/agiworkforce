import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0084_scim_provisioning.sql'),
  'utf8',
);

const enterpriseControlPlane = fs.readFileSync(
  path.resolve(import.meta.dirname, '0076_enterprise_control_plane_tables.sql'),
  'utf8',
);

describe('scim provisioning migration', () => {
  it('creates every table the SCIM runtime reads or writes', () => {
    for (const table of [
      'public.scim_tokens',
      'public.scim_provisioned_users',
      'public.scim_groups',
      'public.scim_group_members',
      'public.directory_sync_events',
    ]) {
      expect(migration).toContain(`create table if not exists ${table} (`);
    }
  });

  it('never edits the applied 0076 control-plane migration', () => {
    // 0084 must be purely additive. If SCIM state had been bolted onto the
    // already-applied 0076 tables, these columns would live there instead.
    expect(enterpriseControlPlane).not.toContain('scim_tokens');
    expect(enterpriseControlPlane).not.toContain('directory_sync_events');
  });

  it('stores SCIM bearer tokens as hash + indexable prefix, never plaintext', () => {
    expect(migration).toContain('token_hash text not null');
    expect(migration).toContain(
      "token_prefix text not null unique check (token_prefix ~ '^[0-9a-f]{16}$')",
    );
    // Revocation and expiry must both be representable or a leaked token is
    // permanent.
    expect(migration).toContain('revoked_at timestamptz');
    expect(migration).toContain('expires_at timestamptz');
    expect(migration).toContain('last_used_at timestamptz');
    // No column may hold the raw secret.
    expect(migration).not.toMatch(/token_plaintext|raw_token|token_secret/u);
  });

  it('pins the entitlement subject on the token row', () => {
    // Subscriptions are per-user; a machine SCIM request has no user, so the
    // issuing admin is persisted and re-checked per request.
    expect(migration).toContain('created_by_user_id text not null');
  });

  it('cascades every SCIM resource from its directory-sync connection', () => {
    const cascades = migration.match(
      /references public\.directory_sync_connections\(id\) on delete cascade/gu,
    );
    // scim_tokens, scim_provisioned_users, scim_groups, directory_sync_events
    expect(cascades?.length).toBe(4);
  });

  it('carries an explicit tenant column on every table because RLS cannot cover SCIM', () => {
    const orgFk = migration.match(
      /organization_id uuid not null references public\.organizations\(id\) on delete cascade/gu,
    );
    expect(orgFk?.length).toBe(5);
  });

  it('makes userName the case-insensitive natural key per connection', () => {
    expect(migration).toContain(
      'create unique index if not exists idx_scim_users_connection_username\n  on public.scim_provisioned_users (connection_id, lower(user_name))',
    );
    expect(migration).toContain(
      'create unique index if not exists idx_scim_users_connection_external_id\n  on public.scim_provisioned_users (connection_id, external_id)\n  where external_id is not null',
    );
  });

  it('models an unlinked SCIM user as a real resource with a nullable account link', () => {
    expect(migration).toContain('user_name text not null');
    expect(migration).toContain('linked_user_id text,');
    expect(migration).toContain('active boolean not null default true');
    expect(migration).not.toContain('linked_user_id text not null');
  });

  it('forbids an IdP group from minting an organization owner', () => {
    expect(migration).toContain(
      "mapped_role text check (mapped_role is null or mapped_role in ('admin', 'member', 'viewer'))",
    );
    // The CHECK constraint's value list is the enforcement point; 'owner' must
    // not appear in it. (The surrounding comment mentions 'owner' on purpose.)
    const constraint = /mapped_role in \(([^)]*)\)/u.exec(migration)?.[1] ?? '';
    expect(constraint).not.toContain('owner');
    expect(constraint).toContain("'admin'");
  });

  it('locks every SCIM table behind the same owner/admin RLS shape as 0076', () => {
    for (const table of [
      'public.scim_tokens',
      'public.scim_provisioned_users',
      'public.scim_groups',
      'public.scim_group_members',
      'public.directory_sync_events',
    ]) {
      expect(migration).toContain(`alter table ${table} enable row level security`);
      expect(migration).toContain(`alter table ${table} force row level security`);
    }

    const adminAccess = migration.match(
      /using \(public\.app_has_org_role\(organization_id, array\['owner', 'admin'\]::text\[\]\)\)/gu,
    );
    expect(adminAccess?.length).toBe(5);
  });

  it('keeps the IdP event record append-only from the admin surface', () => {
    expect(migration).toContain('grant select on public.directory_sync_events to app_rls;');
    expect(migration).toContain(
      'create policy directory_sync_events_admin_read\n  on public.directory_sync_events for select to app_rls',
    );
    expect(migration).not.toMatch(/directory_sync_events for all to app_rls/u);
  });
});
