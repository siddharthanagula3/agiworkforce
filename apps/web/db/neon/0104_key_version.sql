-- =============================================================================
-- Migration 0104: name the key that encrypted every durable secret column
--
-- Why    : the four AES-256-GCM secret columns in this schema store IV,
--          ciphertext and tag and nothing else. No byte of any row says which
--          key produced it, so rotating GITHUB_TOKEN_ENCRYPTION_KEY,
--          CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY, TOTP_ENCRYPTION_KEY or
--          DEVICE_TOKEN_ENCRYPTION_KEY turns every existing row into
--          undecryptable bytes with no way to tell a stale row from a
--          corrupt one. In practice that means a key rotation costs a mass
--          revoke of every connector grant and a re-enrolment of every 2FA
--          user — which is why no key has ever been rotated.
--
-- Model  : one text column per secret column recording the key id its
--          ciphertext belongs to. `lib/crypto/envelope.ts` resolves a key from
--          that id; `scripts/reencrypt.mjs` walks rows off the retired key and
--          stamps the new id, and uses this column as its resume point, which
--          is what makes a re-run idempotent rather than a second full pass.
--
--          Default '1' is deliberate and load-bearing: it is the same default
--          `loadKeyRing` gives the active key when <ENV>_ID is unset, so every
--          row written before this migration is correctly labelled as key 1
--          with no backfill and no downtime.
--
--          The CHECK mirrors KEY_ID_RE in lib/crypto/envelope.ts. A key id
--          that cannot round-trip through the envelope's `v1.<keyId>.` segment
--          must not be storable here.
--
-- Skipped : `connector_oauth_authorizations.code_verifier_enc` and
--           `device_authorization_codes.access_token` both hold minutes-lived
--           values that expire on their own. Rotating their key strands
--           in-flight flows only, so they need no bookkeeping column — see
--           docs/security/key-rotation.md.
--
-- Depends: 0017_github, 0025_two_factor, 0052_user_custom_connectors,
--          0097_connector_oauth_broker
-- =============================================================================

-- GitHub App installation tokens (GITHUB_TOKEN_ENCRYPTION_KEY).
alter table public.github_installations
  add column if not exists access_token_key_version text not null default '1';

alter table public.github_installations
  drop constraint if exists github_installations_access_token_key_version_shape;
alter table public.github_installations
  add constraint github_installations_access_token_key_version_shape
  check (access_token_key_version ~ '^[A-Za-z0-9_-]{1,32}$');

comment on column public.github_installations.access_token_key_version is
  'Id of the GITHUB_TOKEN_ENCRYPTION_KEY ring entry that encrypted access_token_enc.';

-- User-typed MCP bearer tokens (CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY).
alter table public.user_custom_connectors
  add column if not exists auth_header_key_version text not null default '1';

alter table public.user_custom_connectors
  drop constraint if exists user_custom_connectors_auth_header_key_version_shape;
alter table public.user_custom_connectors
  add constraint user_custom_connectors_auth_header_key_version_shape
  check (auth_header_key_version ~ '^[A-Za-z0-9_-]{1,32}$');

comment on column public.user_custom_connectors.auth_header_key_version is
  'Id of the CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY ring entry that encrypted auth_header_enc.';

-- Settled per-user OAuth grants (CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY).
-- One column covers both token columns: oauth-store.ts writes and refreshes
-- access_token_enc and refresh_token_enc in the same statement, so they can
-- never sit on different keys.
alter table public.connector_oauth_grants
  add column if not exists token_key_version text not null default '1';

alter table public.connector_oauth_grants
  drop constraint if exists connector_oauth_grants_token_key_version_shape;
alter table public.connector_oauth_grants
  add constraint connector_oauth_grants_token_key_version_shape
  check (token_key_version ~ '^[A-Za-z0-9_-]{1,32}$');

comment on column public.connector_oauth_grants.token_key_version is
  'Id of the CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY ring entry that encrypted access_token_enc and refresh_token_enc.';

-- TOTP secrets (TOTP_ENCRYPTION_KEY).
alter table public.user_two_factor
  add column if not exists totp_secret_key_version text not null default '1';

alter table public.user_two_factor
  drop constraint if exists user_two_factor_totp_secret_key_version_shape;
alter table public.user_two_factor
  add constraint user_two_factor_totp_secret_key_version_shape
  check (totp_secret_key_version ~ '^[A-Za-z0-9_-]{1,32}$');

comment on column public.user_two_factor.totp_secret_key_version is
  'Id of the TOTP_ENCRYPTION_KEY ring entry that encrypted totp_secret_enc.';

-- Resume/scan index for scripts/reencrypt.mjs: every target is swept with
-- "key_version <> <active id> order by <id>", which is a full scan without one.
create index if not exists idx_github_installations_access_token_key_version
  on public.github_installations(access_token_key_version);
create index if not exists idx_user_custom_connectors_auth_header_key_version
  on public.user_custom_connectors(auth_header_key_version);
create index if not exists idx_connector_oauth_grants_token_key_version
  on public.connector_oauth_grants(token_key_version);
create index if not exists idx_user_two_factor_totp_secret_key_version
  on public.user_two_factor(totp_secret_key_version);
