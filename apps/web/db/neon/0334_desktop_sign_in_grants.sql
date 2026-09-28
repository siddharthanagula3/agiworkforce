-- =============================================================================
-- Migration 0334: one-time grants that carry a browser sign-in to the desktop app
--
-- Why    : the desktop app signs in through the system browser, as the Claude
--          and ChatGPT desktop apps do, so any identity provider works,
--          including one on a customer's own domain. The app opens the
--          browser with the SHA-256 challenge of a verifier it keeps to
--          itself. Once the browser is signed in, the server records a grant
--          for that challenge and the browser hands the app a code through
--          its deep link. The app's window redeems the code with the verifier,
--          once, within a minute, and only then is a Clerk sign-in token
--          minted for it.
--
-- Shape  : code_hash is the SHA-256 of the code, so this table never holds a
--          value that can complete a sign-in. code_challenge is the
--          base64url SHA-256 of the app's verifier. A redemption sets
--          consumed_at and must match the challenge before expires_at.
--
-- Depends: 0037_rls_user_isolation (profiles, current_app_user_id, app_rls role)
-- =============================================================================

begin;

create table if not exists public.desktop_sign_in_grants (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint desktop_sign_in_grants_code_unique unique (code_hash)
);

create index if not exists idx_desktop_sign_in_grants_user
  on public.desktop_sign_in_grants(user_id);
create index if not exists idx_desktop_sign_in_grants_expiry
  on public.desktop_sign_in_grants(expires_at);

alter table public.desktop_sign_in_grants enable row level security;
alter table public.desktop_sign_in_grants force row level security;
drop policy if exists desktop_sign_in_grants_user_isolation
  on public.desktop_sign_in_grants;
create policy desktop_sign_in_grants_user_isolation
  on public.desktop_sign_in_grants for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

comment on table public.desktop_sign_in_grants is
  'One-time grants that hand a sign-in made in the system browser to the desktop app. Redeemed once, with the verifier whose challenge the grant holds, before it expires.';

commit;
