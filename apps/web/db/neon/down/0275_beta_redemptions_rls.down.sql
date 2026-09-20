begin;

drop policy if exists beta_redemptions_user_isolation on public.beta_redemptions;
alter table public.beta_redemptions no force row level security;
alter table public.beta_redemptions disable row level security;

delete from public.schema_migrations
 where filename = '0275_beta_redemptions_rls.sql';

commit;
