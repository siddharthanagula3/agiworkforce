import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0097_connector_oauth_broker.sql'),
  'utf8',
);

const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('connector OAuth broker migration', () => {
  it('creates both legs of the flow', () => {
    expect(sql).toContain('create table if not exists public.connector_oauth_authorizations');
    expect(sql).toContain('create table if not exists public.connector_oauth_grants');
  });

  it('stores the state as a hash, never the state itself', () => {
    expect(sql).toContain("state_hash text not null check (state_hash ~ '^[0-9a-f]{64}$')");
    expect(sql).not.toMatch(/^\s*state text/m);
  });

  it('keeps the PKCE verifier server-side and encrypted', () => {
    expect(sql).toContain('code_verifier_enc text not null');
    expect(sql).not.toMatch(/code_verifier text/);
    expect(sql).toContain('code_challenge_method');
    expect(sql).toContain("code_challenge_method = any (array['S256', 'plain'])");
  });

  it('makes a pending authorization single-use and expiring', () => {
    expect(sql).toContain('expires_at timestamptz not null');
    expect(sql).toContain('consumed_at timestamptz');
    expect(sql).toContain(
      'constraint connector_oauth_authorizations_state_unique unique (state_hash)',
    );
  });

  it('pins the redirect_uri and refuses a protocol-relative return path', () => {
    expect(sql).toContain('redirect_uri text not null');
    expect(sql).toContain("return_path ~ '^/[^/\\\\]'");
  });

  it('encrypts both tokens and records what was actually granted', () => {
    for (const column of [
      'access_token_enc text',
      'refresh_token_enc text',
      'token_type text not null',
      "granted_scopes text[] not null default '{}'",
      'access_token_expires_at timestamptz',
      'token_endpoint text not null',
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).not.toMatch(/^\s*(access_token|refresh_token) text/m);
  });

  it('makes revocation physically drop the secret rather than only flag a row', () => {
    expect(sql).toContain('revoked_at timestamptz');
    expect(sql).toContain('constraint connector_oauth_grants_revoked_holds_no_secret');
    expect(sql).toContain(
      'check (revoked_at is null or (access_token_enc is null and refresh_token_enc is null))',
    );
  });

  it('refuses a live grant that carries no usable credential', () => {
    expect(sql).toContain('constraint connector_oauth_grants_live_has_token');
    expect(sql).toContain('check (revoked_at is not null or access_token_enc is not null)');
  });

  it('holds exactly one grant per user and connector', () => {
    expect(sql).toContain(
      'constraint connector_oauth_grants_unique unique (user_id, connector_id)',
    );
  });

  it('enables and forces per-user RLS on both tables, matching 0069/0052', () => {
    for (const table of ['connector_oauth_authorizations', 'connector_oauth_grants']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`alter table public.${table} force row level security`);
      expect(sql).toContain(`create policy ${table}_user_isolation`);
      expect(sql).toContain(`on public.${table} for all to app_rls`);
    }
    expect(sql.match(/using \(user_id = public\.current_app_user_id\(\)\)/g)).toHaveLength(2);
    expect(sql.match(/with check \(user_id = public\.current_app_user_id\(\)\)/g)).toHaveLength(2);
  });

  it('keeps grants personal — an org admin must not inherit a member OAuth token', () => {
    expect(sql).not.toContain('organization_id');
    expect(sql).not.toContain('app_row_is_visible');
    expect(sql).not.toContain('app_row_is_writable');
  });

  it('indexes the per-user lookups the broker actually issues', () => {
    expect(sql).toContain('idx_connector_oauth_grants_user');
    expect(sql).toContain('idx_connector_oauth_authorizations_user');
    expect(sql).toContain('idx_connector_oauth_authorizations_expiry');
  });

  it('is replay-safe', () => {
    expect(sql).not.toMatch(/create table (?!if not exists)/);
    expect(sql).not.toMatch(/create index (?!if not exists)/);
    for (const policy of [
      'connector_oauth_authorizations_user_isolation',
      'connector_oauth_grants_user_isolation',
    ]) {
      expect(sql).toContain(`drop policy if exists ${policy}`);
    }
  });
});
