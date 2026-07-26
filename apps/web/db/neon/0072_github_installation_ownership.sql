-- 0072: distinguish GitHub installations proven through a user access token.
--
-- GitHub documents that the `installation_id` delivered to an App setup URL
-- is attacker-controlled. Historical rows were written after only a browser
-- state-cookie check, which proves request continuity but not that the signed-in
-- user can access the installation. They must not become trusted merely because
-- OAuth credentials are configured later.
--
-- Deliberately leave every existing row NULL. The secure OAuth callback sets
-- this timestamp only after the target id appears in the authenticated user's
-- paginated `GET /user/installations` response.

alter table public.github_installations
  add column if not exists ownership_verified_at timestamptz;

comment on column public.github_installations.ownership_verified_at is
  'Set only after a GitHub App user access token proves this user can access the installation; NULL rows are legacy/untrusted and cannot mint tokens.';
