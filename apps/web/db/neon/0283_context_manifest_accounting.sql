-- =============================================================================
-- Migration 0283: what a context manifest has to record for a turn to be
--                 explained: its own identity, the assembler that built it,
--                 the token accounting, and the versions it was built against
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : the manifest recorded counts and a character budget. A turn that
--          overflowed a provider window, or that was assembled against a
--          Memory or policy state that has since moved, could not be told
--          apart from one that did neither. Tokens are what a window is spent
--          in, so tokens are what the row records, next to the reservation the
--          output needed and the count the provider reported afterwards.
--
-- Expand only: manifest_id stays nullable. The release running while this
--          applies still inserts manifests without one, so a NOT NULL here
--          would reject its writes; the reader falls back to the turn id and a
--          later contract migration can tighten it once nothing writes null.
--
-- Versions: policy, memory, project, retrieval and prompt template. An entry
--          whose version has moved since the turn is stale, which is how a
--          cached assembly is invalidated rather than trusted forever.
--
-- No content: unchanged from 0252. Identities, counts, budgets and a digest.
--
-- Depends: 0252 (context_manifests)
-- =============================================================================

begin;

alter table public.context_manifests
  add column if not exists manifest_id text,
  add column if not exists assembler_version text not null default '1',
  add column if not exists token_estimate integer not null default 0
    check (token_estimate >= 0),
  add column if not exists actual_token_count integer
    check (actual_token_count is null or actual_token_count >= 0),
  add column if not exists budget_tokens integer
    check (budget_tokens is null or budget_tokens >= 0),
  add column if not exists reserved_output_tokens integer
    check (reserved_output_tokens is null or reserved_output_tokens >= 0),
  add column if not exists over_budget boolean not null default false,
  add column if not exists temporary_chat boolean not null default false,
  add column if not exists versions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(versions) = 'object');

update public.context_manifests
   set manifest_id = turn_id
 where manifest_id is null;

create unique index if not exists idx_context_manifests_manifest_id
  on public.context_manifests (manifest_id);

comment on column public.context_manifests.manifest_id is
  'Derived from the turn, the account, the timestamp and the content digest, so replaying one turn lands on the same manifest identity instead of a fresh random one. Nullable: the release running during the deploy writes rows without it, and the reader falls back to the turn id.';
comment on column public.context_manifests.assembler_version is
  'Which version of the assembler produced this row. Bumped whenever the order, the checks or the budgeting change, so two rows are only comparable when it matches.';
comment on column public.context_manifests.token_estimate is
  'Estimated input tokens the assembled context spent. Character budgets are per source; the window is spent in tokens.';
comment on column public.context_manifests.actual_token_count is
  'What the provider reported for the turn, recorded against the estimate that drove it. NULL until a turn reports one.';
comment on column public.context_manifests.reserved_output_tokens is
  'Held back from the window for the answer, so a full context cannot leave the model no room to reply.';
comment on column public.context_manifests.over_budget is
  'True only when the instruction and safety layers alone did not fit. Those are never dropped, so the overflow is reported instead of hidden.';
comment on column public.context_manifests.temporary_chat is
  'Whether the turn ran under the temporary boundary, which excludes every durable personal source class.';
comment on column public.context_manifests.versions is
  'The policy, memory, project, retrieval and prompt-template versions this assembly was built against. An entry whose trigger version has moved is stale.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. Existing rows keep an identity:
-- --    SELECT count(*) FROM public.context_manifests WHERE manifest_id IS NULL;
-- --    EXPECT: 0
--
-- -- 2. Two manifests cannot claim one identity:
-- --    UPDATE public.context_manifests SET manifest_id = (
-- --      SELECT manifest_id FROM public.context_manifests LIMIT 1);
-- --    EXPECT: unique violation.
--
-- -- 3. A negative token count is refused:
-- --    UPDATE public.context_manifests SET token_estimate = -1;
-- --    EXPECT: check violation.
--
-- -- 4. Versions must be an object, never an array:
-- --    UPDATE public.context_manifests SET versions = '[]'::jsonb;
-- --    EXPECT: check violation.
