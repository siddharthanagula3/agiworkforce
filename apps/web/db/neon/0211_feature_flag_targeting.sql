-- 0211 : rollout feature flags with targeting, percentage, kill switch, variants and expiry.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0016 created feature_flags as one boolean per user and nothing ever read it
-- except the privacy export. A rollout needs a definition that lives once per
-- flag and answers for everyone: which workspaces, roles, plans, regions and
-- client versions it targets, what share of each cohort it reaches by a stable
-- hash, which variant each arm serves, a kill switch that wins over every rule
-- by serving the declared 'off' variant to everyone,
-- and an expiry so a finished rollout cannot linger as dead configuration.
--
-- feature_flag_definitions holds that definition. feature_flags stays the one
-- per-subject override table rather than gaining a parallel twin: a row now
-- names either a user or a workspace, and may pin a variant and expire.
--
-- Rollout flags are not workspace policy. The policy layers from 0201 decide
-- what a workspace allows; a flag decides who has received a change yet.
--
-- Every write goes through the platform-admin API, which records an audit event
-- per change with the actor, so neither table carries its own actor column.
--
-- Service context only. No privileges are granted to app_rls on the definition
-- table, following 0089: evaluation runs on the server connection with the
-- caller's verified user and workspace ids as explicit predicates.

begin;

create table if not exists public.feature_flag_definitions (
  key text primary key check (
    char_length(key) between 2 and 120
    and key ~ '^[a-z][a-z0-9_]*([.:-][a-z0-9_]+)*$'
  ),
  description text not null default '' check (char_length(description) <= 500),
  kill_switch boolean not null default false,
  variants text[] not null default array['on', 'off']::text[] check (
    cardinality(variants) between 2 and 16 and 'off' = any (variants)
  ),
  default_variant text not null default 'off',
  rules jsonb not null default '[]'::jsonb check (
    jsonb_typeof(rules) = 'array' and jsonb_array_length(rules) <= 50
  ),
  expires_at timestamptz,
  archived_at timestamptz,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_flag_definitions_default_variant_declared
    check (default_variant = any (variants))
);

create index if not exists idx_feature_flag_definitions_active
  on public.feature_flag_definitions (key)
  where archived_at is null;

revoke all on public.feature_flag_definitions from app_rls;

alter table public.feature_flags
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.feature_flags
  add column if not exists variant text check (variant is null or char_length(variant) between 1 and 64);

alter table public.feature_flags
  add column if not exists expires_at timestamptz;

alter table public.feature_flags
  alter column user_id drop not null;

alter table public.feature_flags
  add constraint feature_flags_one_subject
    check ((user_id is null) <> (organization_id is null));

create unique index if not exists idx_feature_flags_organization_flag
  on public.feature_flags (organization_id, flag_name)
  where organization_id is not null;

commit;
