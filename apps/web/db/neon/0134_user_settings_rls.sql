-- Row-level security for public.user_settings.
--
-- 0037 enabled RLS on ten user-scoped tables and this was not one of them, so
-- isolation for everyone's synced settings rested entirely on the app-layer
-- `where user_id = $1` in app/api/settings/preferences/route.ts. That predicate
-- is correct, which is why this is defence in depth rather than an incident —
-- but it is one forgotten WHERE clause away from being one, and every other
-- table holding the same class of data has had a policy since 0037.
--
-- Confirmed absent on a branch off production, 2026-08-21: relrowsecurity was
-- false and pg_policies returned zero rows for this table.
--
-- FORCE is included for the same reason 0037 includes it: without it the table
-- owner bypasses the policy, and the owner is exactly who the app connects as.
alter table public.user_settings enable row level security;
alter table public.user_settings force row level security;

drop policy if exists user_settings_user_isolation on public.user_settings;
create policy user_settings_user_isolation
  on public.user_settings
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());
