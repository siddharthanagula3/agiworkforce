-- =============================================================================
-- Migration 0348: per-device tokens that let "Ask from Siri" answer unattended
--
-- Why    : the iOS Ask intent runs without the app open, so it has no identity
--          session. The signed-in app requests one token per install after the
--          person turns on Ask from Siri; the intent presents it to a single
--          route that runs one tool-free, non-streaming chat completion.
--
-- Shape  : only the SHA-256 of the opaque token is stored. A token is bound to
--          its user, workspace and install, carries one capability, and stays
--          valid for 30 days or until it is revoked: on the next app launch
--          (rotation, which issues a fresh 30 days), on sign-out, whenever the
--          account's sessions or refresh credentials are swept, when the
--          setting is turned off, or when the device is removed in Settings,
--          Devices. One live token per install.
--
-- Erasure: the profile foreign key cascades, and account-erasure names the
--          table so the export inventory has to answer for it.
-- =============================================================================

begin;

create table if not exists public.mobile_intent_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  install_id text not null check (install_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  capability text not null default 'chat_completion' check (capability = 'chat_completion'),
  default_model_id text check (default_model_id is null or char_length(default_model_id) between 1 and 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  last_used_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists mobile_intent_tokens_live_install
  on public.mobile_intent_tokens (user_id, install_id)
  where revoked_at is null;

grant select, insert, update, delete on public.mobile_intent_tokens to app_rls;

alter table public.mobile_intent_tokens enable row level security;
alter table public.mobile_intent_tokens force row level security;

drop policy if exists mobile_intent_tokens_user_isolation on public.mobile_intent_tokens;
create policy mobile_intent_tokens_user_isolation
  on public.mobile_intent_tokens
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.mobile_intent_tokens is
  'Hashed per-install tokens for the iOS Ask intent. One capability (a tool-free chat completion), revocable, one live token per install. app_rls sees only the signed-in account''s own rows.';

commit;
