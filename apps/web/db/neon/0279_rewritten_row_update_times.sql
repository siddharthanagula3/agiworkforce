-- Depends: 0013, 0044, 0082, 0139
-- Seven tables are rewritten in place and record no update time, so the last
-- write to a key, a token or a spend alert is unrecoverable. One trigger
-- function serves them all: the column moves whenever the row does.
begin;

create or replace function public.touch_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter table public.api_keys
  add column if not exists updated_at timestamptz not null default now();
update public.api_keys
   set updated_at = greatest(coalesce(revoked_at, created_at), coalesce(last_used_at, created_at))
 where last_used_at is not null or revoked_at is not null;
drop trigger if exists api_keys_touch_updated_at on public.api_keys;
create trigger api_keys_touch_updated_at
  before update on public.api_keys
  for each row execute function public.touch_row_updated_at();

alter table public.device_refresh_tokens
  add column if not exists updated_at timestamptz not null default now();
update public.device_refresh_tokens
   set updated_at = greatest(
         coalesce(used_at, created_at),
         coalesce(revoked_at, created_at),
         coalesce(compromised_at, created_at)
       )
 where used_at is not null or revoked_at is not null or compromised_at is not null;
drop trigger if exists device_refresh_tokens_touch_updated_at on public.device_refresh_tokens;
create trigger device_refresh_tokens_touch_updated_at
  before update on public.device_refresh_tokens
  for each row execute function public.touch_row_updated_at();

alter table public.github_installations
  add column if not exists updated_at timestamptz not null default now();
update public.github_installations
   set updated_at = coalesce(ownership_verified_at, created_at)
 where ownership_verified_at is not null;
drop trigger if exists github_installations_touch_updated_at on public.github_installations;
create trigger github_installations_touch_updated_at
  before update on public.github_installations
  for each row execute function public.touch_row_updated_at();

alter table public.media_assets
  add column if not exists updated_at timestamptz not null default now();
update public.media_assets
   set updated_at = coalesce(deleted_at, created_at)
 where deleted_at is not null;
drop trigger if exists media_assets_touch_updated_at on public.media_assets;
create trigger media_assets_touch_updated_at
  before update on public.media_assets
  for each row execute function public.touch_row_updated_at();

alter table public.organization_admin_api_keys
  add column if not exists updated_at timestamptz not null default now();
update public.organization_admin_api_keys
   set updated_at = greatest(coalesce(revoked_at, created_at), coalesce(last_used_at, created_at))
 where last_used_at is not null or revoked_at is not null;
drop trigger if exists organization_admin_api_keys_touch_updated_at on public.organization_admin_api_keys;
create trigger organization_admin_api_keys_touch_updated_at
  before update on public.organization_admin_api_keys
  for each row execute function public.touch_row_updated_at();

alter table public.organization_spend_alerts
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists organization_spend_alerts_touch_updated_at on public.organization_spend_alerts;
create trigger organization_spend_alerts_touch_updated_at
  before update on public.organization_spend_alerts
  for each row execute function public.touch_row_updated_at();

alter table public.shared_sessions
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists shared_sessions_touch_updated_at on public.shared_sessions;
create trigger shared_sessions_touch_updated_at
  before update on public.shared_sessions
  for each row execute function public.touch_row_updated_at();

commit;
