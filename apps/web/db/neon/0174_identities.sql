-- 0174 — map an authenticated (provider, subject) pair to this product's own
-- user id.
--
-- NOT YET APPLIED — draft only, pending explicit approval before running.
--
-- 0019_identity_bridge_retired.sql and 0031_drop_legacy_user_id_mapping.sql
-- removed the last indirection between the identity provider and the schema:
-- profiles.id became the raw provider subject, and every user_id column across
-- the schema stores that same string. That made the provider's subject format
-- a schema fact. Changing providers today means a one-time UPDATE across most
-- tables that carry a user id, with no single row to remap instead.
--
-- This table is that row. It records which provider issued a subject and which
-- internal user id that subject resolves to. For clerk the two are the same
-- string, so the seed below is an identity mapping and
-- packages/platform/identity/src/identities.ts short-circuits it without a
-- query: nothing about today's request path changes. A second provider's
-- subjects will not match any existing user_id, and this is the only place
-- that has to learn them.
--
-- WHY (provider, subject) AND NOT subject ALONE: two providers can mint the
-- same subject string, and a migration between them runs with both live. The
-- pair is the identity; the subject on its own is not.
--
-- WHY (provider, user_id) IS ALSO UNIQUE: one account holds at most one
-- identity per provider. Without it, a partial backfill could leave one user
-- with two subjects at the same provider and no way to say which is current.
--
-- OWNER-ONLY BY DESIGN: resolution runs before any user scope exists, so
-- app_rls has no business reading this table. It does not get that for free.
-- A default ACL on this database grants app_rls insert, select, update and
-- delete on every new table in schema public (pg_default_acl carries
-- app_rls=arwd), so a bare CREATE TABLE hands the scoped role the whole
-- mapping. The REVOKE below is therefore load-bearing, not decoration, and was
-- added after a local apply showed has_table_privilege('app_rls', ...) coming
-- back true on a table this migration never granted.
--
-- Row level security is enabled with no policy as the second layer: if a
-- future migration re-grants (the footgun 0043's header names), app_rls still
-- sees zero rows rather than every account's provider subject. The owner
-- connection holds BYPASSRLS, which is the path that actually reads it.

create table if not exists public.identities (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  subject text not null,
  user_id text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identities_provider_not_blank check (length(btrim(provider)) > 0),
  constraint identities_subject_not_blank check (length(btrim(subject)) > 0)
);

create unique index if not exists idx_identities_provider_subject
  on public.identities(provider, subject);

create unique index if not exists idx_identities_provider_user
  on public.identities(provider, user_id);

create index if not exists idx_identities_user_id
  on public.identities(user_id);

-- Seed: every existing account is a clerk identity whose subject is its own id.
-- ON CONFLICT DO NOTHING so a re-run after a partial apply is a no-op rather
-- than a unique violation.
insert into public.identities (provider, subject, user_id)
select 'clerk', p.id, p.id
  from public.profiles p
 on conflict (provider, subject) do nothing;

revoke all on public.identities from app_rls;

alter table public.identities enable row level security;
alter table public.identities force row level security;
