begin;

drop trigger if exists beta_invites_touch_updated_at on public.beta_invites;
alter table public.beta_invites drop column if exists updated_at;

delete from public.schema_migrations
 where filename = '0363_beta_invite_update_time.sql';

commit;
