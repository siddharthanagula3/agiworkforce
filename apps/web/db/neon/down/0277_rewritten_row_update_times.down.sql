begin;

drop trigger if exists shared_sessions_touch_updated_at on public.shared_sessions;
alter table public.shared_sessions drop column if exists updated_at;

drop trigger if exists organization_spend_alerts_touch_updated_at on public.organization_spend_alerts;
alter table public.organization_spend_alerts drop column if exists updated_at;

drop trigger if exists organization_admin_api_keys_touch_updated_at on public.organization_admin_api_keys;
alter table public.organization_admin_api_keys drop column if exists updated_at;

drop trigger if exists media_assets_touch_updated_at on public.media_assets;
alter table public.media_assets drop column if exists updated_at;

drop trigger if exists github_installations_touch_updated_at on public.github_installations;
alter table public.github_installations drop column if exists updated_at;

drop trigger if exists device_refresh_tokens_touch_updated_at on public.device_refresh_tokens;
alter table public.device_refresh_tokens drop column if exists updated_at;

drop trigger if exists api_keys_touch_updated_at on public.api_keys;
alter table public.api_keys drop column if exists updated_at;

drop function if exists public.touch_row_updated_at();

delete from public.schema_migrations where filename = '0277_rewritten_row_update_times.sql';

commit;
