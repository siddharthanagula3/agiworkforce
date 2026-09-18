-- =============================================================================
-- Migration 0252: per-turn context manifests, and a workspace policy for every
--                 context source class rather than only for Memory
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : context assembly was observable only as span counters, so "why did
--          it know that" had no answer after the request ended. One row per
--          turn records which source classes were consulted, how many
--          candidates each produced, how many survived the permission, policy,
--          budget, dedup and staleness checks, and why the rest did not.
--
-- No content: the manifest holds source identities, counts and budgets, plus a
--          digest over the assembled text. Keeping a second copy of the context
--          itself would widen the blast radius of every retention and erasure
--          promise for nothing debugging needs.
--
-- Policy : `allow_memory` (0164) gated Memory and nothing else, so connector
--          and web results entered a turn with no workspace say over them.
--          The two columns here are the same gate for those classes, default
--          true because they are request-scoped results the user just asked
--          for, not a store that outlives the turn.
--
-- Depends: 0037 (current_app_user_id), 0076 (organization_admin_policies),
--          0164 (allow_memory)
-- =============================================================================

begin;

create table if not exists public.context_manifests (
  turn_id text primary key check (char_length(btrim(turn_id)) between 1 and 200),
  user_id text not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  project_id uuid,
  created_at timestamptz not null default now(),
  included_count integer not null default 0 check (included_count >= 0),
  budget_used_chars integer not null default 0 check (budget_used_chars >= 0),
  content_digest text not null check (content_digest ~ '^[0-9a-f]{64}$'),
  entries jsonb not null default '[]'::jsonb
    check (jsonb_typeof(entries) = 'array')
);

create index if not exists idx_context_manifests_owner_created
  on public.context_manifests (user_id, created_at desc);

grant select, insert, update, delete on public.context_manifests to app_rls;

alter table public.context_manifests enable row level security;
alter table public.context_manifests force row level security;

drop policy if exists context_manifests_owner on public.context_manifests;
create policy context_manifests_owner
  on public.context_manifests for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

comment on table public.context_manifests is
  'One row per turn: which context source classes were consulted, what each contributed, and why anything was left out. Identities, counts and a digest only, never the context text.';
comment on column public.context_manifests.content_digest is
  'SHA-256 over the assembled source ids and text. A replay that produces the same digest assembled the same context, without this row holding any of it.';

alter table public.organization_admin_policies
  add column if not exists allow_connector_context boolean not null default true;

alter table public.organization_admin_policies
  add column if not exists allow_web_result_context boolean not null default true;

comment on column public.organization_admin_policies.allow_connector_context is
  'Whether a connector result may enter a member turn as context. The same workspace gate allow_memory applies to Memory.';
comment on column public.organization_admin_policies.allow_web_result_context is
  'Whether a web search or fetch result may enter a member turn as context.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. A manifest is one row per turn:
-- --    INSERT INTO public.context_manifests (turn_id, user_id, content_digest)
-- --    VALUES ('turn_1', 'user_1', repeat('a', 64));
-- --    Repeat the same INSERT. EXPECT: primary key violation.
--
-- -- 2. A digest that is not a SHA-256 hex string is refused:
-- --    INSERT ... content_digest = 'nope'  -- EXPECT: check violation.
--
-- -- 3. Another user cannot read the manifest:
-- --    SET ROLE app_rls; SELECT set_config('app.user_id', 'user_2', true);
-- --    SELECT count(*) FROM public.context_manifests;  -- EXPECT: 0
--
-- -- 4. Existing workspaces keep connector and web context:
-- --    SELECT count(*) FROM public.organization_admin_policies
-- --     WHERE NOT allow_connector_context OR NOT allow_web_result_context;
-- --    EXPECT: 0
