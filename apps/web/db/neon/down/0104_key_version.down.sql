-- Reverses 0104_key_version.sql — remove the key-id bookkeeping columns.
--
-- SAFE ONLY BEFORE THE FIRST ROTATION. The column is the only thing that says
-- which key ring entry encrypted a row; drop it after `scripts/reencrypt.mjs`
-- has moved any row off key '1' and those rows become ciphertext nobody can
-- attribute to a key — undecryptable in practice, and re-applying 0104 labels
-- them '1' by default, which is then a lie. Confirm every row is still on the
-- original key before running:
--
--   select count(*) from public.github_installations
--    where access_token_key_version <> '1';
--   select count(*) from public.user_custom_connectors
--    where auth_header_key_version <> '1';
--   select count(*) from public.connector_oauth_grants
--    where token_key_version <> '1';
--   select count(*) from public.user_two_factor
--    where totp_secret_key_version <> '1';
--
-- All four must be 0. If any is not, roll back the re-encryption first.
--
-- The indexes and CHECK constraints below go with their columns anyway; they
-- are named explicitly so this file states everything 0104 added.

begin;

drop index if exists public.idx_github_installations_access_token_key_version;
drop index if exists public.idx_user_custom_connectors_auth_header_key_version;
drop index if exists public.idx_connector_oauth_grants_token_key_version;
drop index if exists public.idx_user_two_factor_totp_secret_key_version;

alter table public.github_installations
  drop constraint if exists github_installations_access_token_key_version_shape,
  drop column if exists access_token_key_version;

alter table public.user_custom_connectors
  drop constraint if exists user_custom_connectors_auth_header_key_version_shape,
  drop column if exists auth_header_key_version;

alter table public.connector_oauth_grants
  drop constraint if exists connector_oauth_grants_token_key_version_shape,
  drop column if exists token_key_version;

alter table public.user_two_factor
  drop constraint if exists user_two_factor_totp_secret_key_version_shape,
  drop column if exists totp_secret_key_version;

delete from public.schema_migrations where filename = '0104_key_version.sql';

commit;
