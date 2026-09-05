-- 0171 — put public.github_installations behind row level security.
--
-- NOT YET APPLIED — draft only, pending explicit approval before running.
--
-- The table has carried a not-null user_id since 0017_github.sql. GET and
-- DELETE /api/github/installations, api/connectors/route.ts and
-- lib/support/actions/executors/revoke-connector.ts already run through
-- getUserScopedDb (app_rls) and already filter or delete by the caller's
-- user_id in SQL, so this migration is behaviour-preserving for them. Nothing
-- in the database enforced that filter until now: row level security was
-- never enabled on this table, so any of those statements, or a future one
-- that forgets the predicate, could see or delete another account's
-- installation.
--
-- The webhook (api/github/webhook/route.ts), the OAuth callback that claims
-- an installation before ownership is proven (api/github/oauth/callback/
-- route.ts) and the PR-review lookup they share (lib/github-app.ts) stay on
-- the privileged owner connection, which bypasses RLS unchanged; they are
-- allowlisted in scripts/config/rls-boundary-allowlist.json for reasons that
-- do not depend on this migration. lib/user-connector-tools.ts's
-- getUserGithubInstallations read also stays on the owner connection today —
-- this migration makes scoping it possible, it does not scope it.

alter table public.github_installations enable row level security;
alter table public.github_installations force row level security;

drop policy if exists github_installations_user_isolation on public.github_installations;
create policy github_installations_user_isolation
  on public.github_installations
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.github_installations is
  'GitHub App installations linked to an account. Isolation is database-enforced: app_rls sees and can change only the signed-in account''s own rows.';
