-- 0207 : one device registry every signed-in surface writes to.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- desktop_devices (0013) was never written by any client, so its version and
-- last_seen_at columns stayed null, and mobile_devices only records a push
-- token. The devices panel therefore could not say which machine is which,
-- whether it is awake, what it can do, or which workspace it signed in under.
--
-- Each surface (desktop, CLI, VS Code, Chrome, mobile) posts a heartbeat keyed by
-- a stable per-install id. The row records the workspace active at the last
-- heartbeat, the OS, architecture, app version and the capabilities that install
-- reports. Presence is derived from last_seen_at when read, never stored, so a
-- device that stops reporting cannot stay "online".
--
-- credential_family_id is the developer-token refresh family the heartbeat was
-- authenticated with and identity_session_id the identity-provider session, so
-- revoking a device revokes exactly the credential it holds.
--
-- Erasure: the profile foreign key cascades, and account-erasure names the
-- table explicitly so the export inventory has to answer for it.

create table if not exists public.device_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  surface text not null
    check (surface = any (array['desktop', 'cli', 'vscode', 'chrome', 'mobile'])),
  install_id text not null check (install_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  name text check (name is null or char_length(name) between 1 and 120),
  os text not null
    check (os = any (array['macos', 'windows', 'linux', 'ios', 'android', 'chromeos', 'other'])),
  os_version text check (os_version is null or char_length(os_version) <= 64),
  architecture text
    check (architecture is null or architecture = any (array['arm64', 'x64', 'x86', 'arm', 'other'])),
  app_version text check (app_version is null or char_length(app_version) <= 64),
  shell text check (shell is null or shell ~ '^[a-z][a-z0-9-]{0,31}$'),
  browser_available boolean not null default false,
  computer_use_available boolean not null default false,
  local_models_available boolean not null default false,
  local_mcp_available boolean not null default false,
  remote_enabled boolean not null default false,
  credential_family_id text,
  identity_session_id text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_registrations_install_unique unique (user_id, surface, install_id)
);

create index if not exists idx_device_registrations_user_seen
  on public.device_registrations (user_id, last_seen_at desc);

create index if not exists idx_device_registrations_organization
  on public.device_registrations (organization_id)
  where organization_id is not null;

grant select, insert, update, delete on public.device_registrations to app_rls;

alter table public.device_registrations enable row level security;
alter table public.device_registrations force row level security;

drop policy if exists device_registrations_user_isolation on public.device_registrations;
create policy device_registrations_user_isolation
  on public.device_registrations
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.device_registrations is
  'Every signed-in install of a surface, written by its heartbeat. Presence is derived from last_seen_at when read. app_rls sees only the signed-in account''s own rows.';
comment on column public.device_registrations.credential_family_id is
  'device_refresh_tokens.family_id the last heartbeat authenticated with. Revoking the device revokes this family.';
comment on column public.device_registrations.identity_session_id is
  'Identity-provider session the last heartbeat authenticated with, for surfaces that sign in without a device grant. Revoking the device revokes this session.';
