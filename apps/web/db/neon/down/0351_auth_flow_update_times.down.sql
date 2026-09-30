begin;

drop trigger if exists mobile_intent_tokens_touch_updated_at on public.mobile_intent_tokens;
alter table public.mobile_intent_tokens drop column if exists updated_at;

drop trigger if exists github_install_authorizations_touch_updated_at
  on public.github_install_authorizations;
alter table public.github_install_authorizations drop column if exists updated_at;

delete from public.schema_migrations
 where filename = '0351_auth_flow_update_times.sql';

commit;
