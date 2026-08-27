-- 0146 — repair production branches whose historical baseline ledger recorded
-- 0072 without verifying that its additive column was present.
--
-- Existing rows deliberately remain unverified. Only the GitHub OAuth callback
-- may set this marker after proving that the signed-in GitHub user can access
-- the installation.

alter table public.github_installations
  add column if not exists ownership_verified_at timestamptz;

comment on column public.github_installations.ownership_verified_at is
  'Set only after a GitHub App user access token proves this user can access the installation; NULL rows are legacy/untrusted and cannot mint tokens.';
