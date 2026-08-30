-- 0153 — put public.notifications behind row level security.
--
-- NOT YET APPLIED — draft only, pending explicit approval before running.
--
-- The table has carried a user_id since 0016_misc.sql, and its isolation was
-- only ever a claim in application code: lib/services/notification-service.ts
-- held the single insert/select/update over it. That service was reachable from
-- nothing — no route, page or layout imported it — so it was removed with the
-- rest of the unreachable modules, and the table was left with rows, a tenant
-- column, and nothing at all enforcing who could read them.
--
-- Deleting the USER_OWNED_TABLES entry instead would have withdrawn the claim
-- without replacing it, and an allowlist entry would only record that nothing
-- polices it. The database can enforce this without depending on any caller
-- existing, so it does, and the guard stops needing an app-enforcement promise
-- for a table no application code touches.
--
-- The privileged connection still bypasses this by design, exactly as for
-- web_push_subscriptions in 0151: a future server-side delivery path reads
-- through it, while anything holding app_rls sees only its own rows.

grant select, insert, update, delete on public.notifications to app_rls;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

drop policy if exists notifications_user_isolation on public.notifications;
create policy notifications_user_isolation
  on public.notifications
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.notifications is
  'In-app notifications. Isolation is database-enforced: app_rls sees only the signed-in account''s own rows.';
