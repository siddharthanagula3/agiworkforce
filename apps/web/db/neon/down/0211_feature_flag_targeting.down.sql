-- Reversal of 0211 : remove rollout flag definitions and workspace overrides.
--
-- WHAT THIS COSTS: every flag falls back to off for everyone at once, so any
-- change being rolled out behind a flag disappears for the users who had it, and
-- every workspace-level override row is deleted because the restored table can
-- only hold per-user rows.

begin;

delete from public.feature_flags where organization_id is not null;

drop index if exists public.idx_feature_flags_organization_flag;

alter table public.feature_flags
  drop constraint if exists feature_flags_one_subject;

alter table public.feature_flags
  alter column user_id set not null;

alter table public.feature_flags
  drop column if exists expires_at;

alter table public.feature_flags
  drop column if exists variant;

alter table public.feature_flags
  drop column if exists organization_id;

drop index if exists public.idx_feature_flag_definitions_active;
drop table if exists public.feature_flag_definitions;

delete from public.schema_migrations
 where filename = '0211_feature_flag_targeting.sql';

commit;
