-- =============================================================================
-- Migration: which sealed stores a rewrap actually moved
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : the rewrap run row records how much moved, never what it moved over.
--          A run handed one store reports `complete` with `remaining = 0`, and
--          the retirement gate accepts it as evidence for the whole workspace.
--          Every other column sealed under that version is then dropped out of
--          the ring and is unreadable for good.
--
-- Gate   : a run cannot claim completion without naming at least one store, and
--          the retirement in
--          apps/web/lib/server/organization-encryption-keys.ts compares the
--          names here against the sealed-store registry, so a store added after
--          the run was filed refuses the retirement until a fresh run covers it.
--
-- Depends: 0238 (organization_key_rewrap_runs)
-- =============================================================================

begin;

alter table public.organization_key_rewrap_runs
  add column if not exists covered_stores text[] not null default '{}'::text[];

comment on column public.organization_key_rewrap_runs.covered_stores is
  'The sealed stores this run walked, by name. A retirement is evidence only for the stores listed here, so a run over a subset cannot retire a version the rest are still sealed under.';

alter table public.organization_key_rewrap_runs
  drop constraint if exists organization_key_rewrap_runs_complete_names_its_stores;
alter table public.organization_key_rewrap_runs
  add constraint organization_key_rewrap_runs_complete_names_its_stores
  check (state <> 'complete' or cardinality(covered_stores) > 0);

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. A run cannot claim completion without naming what it walked:
-- --    INSERT INTO public.organization_key_rewrap_runs
-- --      (organization_id, from_key_version, to_key_version, state,
-- --       started_by_user_id, completed_at)
-- --      VALUES ('<org>', '1', '2', 'complete', 'u', now());
-- --    EXPECT: check violation (organization_key_rewrap_runs_complete_names_its_stores).
--
-- -- 2. The same insert with covered_stores = ARRAY['public.t.c'] is accepted.
--
-- -- 3. A plain member still reads no run (the 0238 policy is unchanged):
-- --    SET ROLE app_rls;
-- --    SELECT set_config('app.user_id', '<member user id>', true);
-- --    SELECT count(*) FROM public.organization_key_rewrap_runs;
-- --    EXPECT: 0.
