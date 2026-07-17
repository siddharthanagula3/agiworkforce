-- Migration 0054: enforce gateway tenant isolation for canonical user-owned tables.
--
-- The API gateway binds request.jwt.claim.sub and executes user requests as
-- the non-BYPASSRLS app_rls role. These tables are all created by earlier
-- canonical migrations. Shadow/manual gateway tables are deliberately absent:
-- no policy is invented without an owned migration and verified schema.

-- Direct user-owned device and sync records.
alter table public.desktop_devices enable row level security;
alter table public.desktop_devices force row level security;
drop policy if exists desktop_devices_user_isolation on public.desktop_devices;
create policy desktop_devices_user_isolation
  on public.desktop_devices
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

alter table public.mobile_devices enable row level security;
alter table public.mobile_devices force row level security;
drop policy if exists mobile_devices_user_isolation on public.mobile_devices;
create policy mobile_devices_user_isolation
  on public.mobile_devices
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

alter table public.sync_data enable row level security;
alter table public.sync_data force row level security;
drop policy if exists sync_data_user_isolation on public.sync_data;
create policy sync_data_user_isolation
  on public.sync_data
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

-- User-authored feedback and metered usage.
alter table public.feedback enable row level security;
alter table public.feedback force row level security;
drop policy if exists feedback_user_isolation on public.feedback;
create policy feedback_user_isolation
  on public.feedback
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

alter table public.usage_events enable row level security;
alter table public.usage_events force row level security;
drop policy if exists usage_events_user_isolation on public.usage_events;
create policy usage_events_user_isolation
  on public.usage_events
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

-- Token revocation records are scoped to the verified token subject. System
-- retention/cleanup remains an explicitly privileged operation.
alter table public.revoked_jwts enable row level security;
alter table public.revoked_jwts force row level security;
drop policy if exists revoked_jwts_user_isolation on public.revoked_jwts;
create policy revoked_jwts_user_isolation
  on public.revoked_jwts
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

-- Enterprise organization discovery is read-only at this boundary. A user can
-- read only their own membership rows and organizations containing one of
-- those rows. Administrative mutations remain privileged control-plane work.
alter table public.organization_members enable row level security;
alter table public.organization_members force row level security;
drop policy if exists organization_members_self_read on public.organization_members;
create policy organization_members_self_read
  on public.organization_members
  for select
  using (user_id = (select public.current_app_user_id()));

alter table public.organizations enable row level security;
alter table public.organizations force row level security;
drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read
  on public.organizations
  for select
  using (
    exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id = organizations.id
        and membership.user_id = (select public.current_app_user_id())
    )
  );
