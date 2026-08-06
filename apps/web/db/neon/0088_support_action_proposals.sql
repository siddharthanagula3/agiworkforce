-- 0088: Server-issued, single-use confirmation tokens for support-agent actions.
--
-- WHY THIS TABLE EXISTS
-- The support agent may PROPOSE a bounded, reversible account action, but it may
-- never execute one. Execution requires the authenticated user to confirm a
-- proposal the SERVER wrote. This table is the binding between those two steps.
--
-- Every property below exists to make one class of attack structurally
-- impossible rather than merely checked in application code:
--   token_hash unique  -> the raw bearer is returned exactly once and never stored
--   user_id            -> a token is welded to one caller
--   action_id          -> a token cannot be swapped for a different action
--   params_hash        -> a token cannot be retargeted at different parameters
--   consumed_at        -> single use, claimed by a conditional UPDATE
--   expires_at         -> short-lived; a stale proposal is not a standing grant
--
-- WHAT THIS TABLE DELIBERATELY DOES NOT HOLD
-- No message content, no model output, no prompt text, no credential material.
-- `params` only ever holds the action registry's typed, server-normalized
-- fields (connectorId / keyId). `conversation_ref` is an opaque client id that
-- is recorded but never used for authorization.
--
-- NUMBERING: 0087 is taken by the enterprise-audit write migration and 0089 is
-- claimed by the concurrent support live-handoff work, so this takes 0088.
--
-- Depends on: 0037_rls_user_isolation (current_app_user_id(), app_rls role).

create table if not exists public.support_action_proposals (
  id uuid primary key default gen_random_uuid(),
  -- Clerk user id of the authenticated caller the proposal was minted for.
  -- Resolved server-side from the session; never supplied by a client or model.
  user_id text not null,
  -- Registry action id. Checked against the code allowlist before insert; the
  -- column is text so adding an action needs no migration, but a value outside
  -- the registry can never be executed because execution looks it up in code.
  action_id text not null,
  params jsonb not null default '{}'::jsonb,
  params_hash text not null check (params_hash ~ '^[0-9a-f]{64}$'),
  -- SHA-256 of a 256-bit random bearer. The raw token is returned once, to the
  -- proposing response, and is never persisted.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  surface text not null default 'web' check (surface in ('web', 'marketing')),
  conversation_ref text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  outcome text not null default 'proposed'
    check (outcome in ('proposed', 'executing', 'success', 'failure', 'denied', 'expired')),
  created_at timestamptz not null default now()
);

create index if not exists idx_support_action_proposals_user
  on public.support_action_proposals (user_id, created_at desc);
create index if not exists idx_support_action_proposals_expiry
  on public.support_action_proposals (expires_at);

comment on table public.support_action_proposals is
  'Single-use, caller-bound, action-bound confirmation tokens for support-agent account actions. Holds no message content and no credential material.';
comment on column public.support_action_proposals.token_hash is
  'SHA-256 of a 256-bit random bearer returned exactly once. The raw credential is never stored.';
comment on column public.support_action_proposals.params_hash is
  'SHA-256 of the canonical JSON of `params`. Binds a token to one parameter set so a proposal cannot be retargeted.';

-- RLS: the runtime app_rls role may only ever see its own rows. The service
-- adapter connects as the Neon owner, which has BYPASSRLS (see 0037's header),
-- so the application path still writes — but every application statement also
-- carries an explicit `user_id = $n` predicate. RLS is the backstop, not the
-- primary gate.
alter table public.support_action_proposals enable row level security;
alter table public.support_action_proposals force row level security;

drop policy if exists support_action_proposals_user_isolation on public.support_action_proposals;
create policy support_action_proposals_user_isolation
  on public.support_action_proposals
  to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

grant select, insert, update on public.support_action_proposals to app_rls;

-- Retention: a consumed or expired proposal has no further use. Rows older than
-- 30 days past `expires_at` are disposable. No cron is owned by this migration;
-- deleting them is safe at any time.

-- ---------------------------------------------------------------------------
-- VERIFICATION (manual, on a throwaway Neon BRANCH — vitest cannot prove this)
-- A static SQL-shape test proves the text below, not the runtime role behaviour.
-- Rehearse:
--   set role app_rls;
--   select set_config('request.jwt.claim.sub', 'user_a', true);
--   insert into public.support_action_proposals (user_id, action_id, params_hash, token_hash, expires_at)
--     values ('user_b', 'revoke_connector', repeat('a',64), repeat('b',64), now() + interval '5 min');
--   -- expect: new row violates row-level security policy
--   select count(*) from public.support_action_proposals where user_id = 'user_b';
--   -- expect: 0 (not permission denied — the rows are simply invisible)
-- ---------------------------------------------------------------------------
