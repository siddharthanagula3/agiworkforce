-- =============================================================================
-- Migration 0338: Advanced Account Security, sign-in completed with a passkey
--                 or security key
--
-- Why    : a stolen password or a read inbox was enough to reach an account,
--          because every sign-in method the identity provider offers ends in a
--          usable session. ChatGPT's Advanced Account Security lets a person
--          opt in to requiring a passkey or a FIDO security key for every
--          sign-in, with recovery keys shown once and a 48-hour wait on any
--          recovery.
--
-- Shape  : account_security_enrollments is one row per person who started or
--          finished enrolling: when they enrolled (null while setting up), the
--          hashes of their unused recovery keys, keys generated but not yet
--          confirmed as saved with the session that generated them, and the
--          recovery hold a used key starts.
--          account_security_credentials holds each registered passkey or
--          security key's public key and signature counter; no private
--          material ever reaches the server. account_security_sessions records
--          which identity sessions completed a passkey check and until when,
--          which is what the request gate reads. account_security_challenges
--          holds single-use WebAuthn challenges, the browser handoffs a
--          desktop or mobile app uses when it cannot run WebAuthn itself, and
--          the one-time code emailed to the account's address before it can
--          enroll, stored only as a keyed hash with a count of wrong tries.
--          Turning the mode on records the session that did it and the hash of
--          a 48-hour link, emailed to the account, that turns it off again
--          without a passkey in case the enrollment was not the owner's.
--          profiles gains email_changed_at, stamped by a trigger whenever any
--          writer first sets or changes the address, so an address learned
--          from the identity provider moments ago cannot pass the enrollment
--          cooldown.
--
-- Depends: 0037 (profiles, current_app_user_id), 0076 (set_row_updated_at)
-- =============================================================================

begin;

create table if not exists public.account_security_enrollments (
  user_id text primary key references public.profiles(id) on delete cascade,
  enrolled_at timestamptz,
  recovery_key_hashes text[] not null default '{}'
    check (cardinality(recovery_key_hashes) <= 16),
  pending_recovery_key_hashes text[]
    check (pending_recovery_key_hashes is null or cardinality(pending_recovery_key_hashes) <= 16),
  pending_recovery_keys_expire_at timestamptz,
  pending_recovery_session_id text check (
    pending_recovery_session_id is null or char_length(pending_recovery_session_id) between 1 and 200
  ),
  recovery_started_at timestamptz,
  recovery_unlocks_at timestamptz,
  recovery_session_id text check (recovery_session_id is null or char_length(recovery_session_id) <= 200),
  enrolled_session_id text check (enrolled_session_id is null or char_length(enrolled_session_id) <= 200),
  undo_token_hash text unique check (undo_token_hash is null or undo_token_hash ~ '^[0-9a-f]{64}$'),
  undo_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_security_undo_shape check (
    (undo_token_hash is null) = (undo_expires_at is null)
    and (undo_token_hash is null or enrolled_at is not null)
  ),
  constraint account_security_pending_keys_shape check (
    (pending_recovery_key_hashes is null) = (pending_recovery_keys_expire_at is null)
    and (pending_recovery_key_hashes is null) = (pending_recovery_session_id is null)
  ),
  constraint account_security_recovery_hold_shape check (
    (recovery_started_at is null and recovery_unlocks_at is null and recovery_session_id is null)
    or (
      recovery_started_at is not null
      and recovery_unlocks_at > recovery_started_at
      and recovery_session_id is not null
    )
  )
);

drop trigger if exists set_account_security_enrollments_updated_at on public.account_security_enrollments;
create trigger set_account_security_enrollments_updated_at
  before update on public.account_security_enrollments
  for each row execute function public.set_row_updated_at();

create table if not exists public.account_security_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  credential_id text not null unique check (credential_id ~ '^[A-Za-z0-9_-]{16,1400}$'),
  public_key text not null check (public_key ~ '^[A-Za-z0-9_-]{16,4096}$'),
  sign_count bigint not null default 0 check (sign_count >= 0),
  transports text[] not null default '{}' check (cardinality(transports) <= 8),
  device_type text not null check (device_type = any (array['singleDevice', 'multiDevice'])),
  backed_up boolean not null default false,
  name text not null check (char_length(name) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

drop trigger if exists set_account_security_credentials_updated_at on public.account_security_credentials;
create trigger set_account_security_credentials_updated_at
  before update on public.account_security_credentials
  for each row execute function public.set_row_updated_at();

create index if not exists idx_account_security_credentials_user
  on public.account_security_credentials (user_id, created_at);

create table if not exists public.account_security_sessions (
  session_id text primary key check (char_length(session_id) between 1 and 200),
  user_id text not null references public.profiles(id) on delete cascade,
  method text not null check (method = any (array['passkey', 'recovery'])),
  credential_id uuid references public.account_security_credentials(id) on delete set null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint account_security_sessions_window check (expires_at > verified_at)
);

create index if not exists idx_account_security_sessions_user
  on public.account_security_sessions (user_id, expires_at);

create table if not exists public.account_security_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  purpose text not null check (
    purpose = any (array['registration', 'authentication', 'handoff', 'enrollment_email'])
  ),
  session_id text not null check (char_length(session_id) between 1 and 200),
  challenge text check (challenge is null or challenge ~ '^[A-Za-z0-9_-]{16,128}$'),
  handoff_hash text unique check (handoff_hash is null or handoff_hash ~ '^[0-9a-f]{64}$'),
  code_challenge text check (code_challenge is null or code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  code_hash text check (code_hash is null or code_hash ~ '^[0-9a-f]{64}$'),
  client text check (client is null or client = any (array['desktop', 'mobile'])),
  attempts smallint not null default 0 check (attempts between 0 and 10),
  completed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_security_challenges_handoff_shape check (
    (purpose = 'handoff') = (handoff_hash is not null and code_challenge is not null and client is not null)
  ),
  constraint account_security_challenges_ceremony_shape check (
    purpose = any (array['handoff', 'enrollment_email']) or challenge is not null
  ),
  constraint account_security_challenges_email_code_shape check (
    purpose <> 'enrollment_email'
    or (code_hash is not null and challenge is null and handoff_hash is null)
  )
);

drop trigger if exists set_account_security_challenges_updated_at on public.account_security_challenges;
create trigger set_account_security_challenges_updated_at
  before update on public.account_security_challenges
  for each row execute function public.set_row_updated_at();

create index if not exists idx_account_security_challenges_session
  on public.account_security_challenges (user_id, session_id, purpose);

create index if not exists idx_account_security_challenges_expiry
  on public.account_security_challenges (expires_at);

alter table public.profiles add column if not exists email_changed_at timestamptz;

update public.profiles
  set email_changed_at = now()
  where email_changed_at is null
    and nullif(btrim(email), '') is not null
    and greatest(created_at, updated_at) > now() - interval '7 days';

create or replace function public.stamp_profile_email_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.email_changed_at := case when nullif(btrim(new.email), '') is null then null else now() end;
  elsif new.email is distinct from old.email then
    new.email_changed_at := now();
  else
    new.email_changed_at := old.email_changed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_profile_email_change on public.profiles;
create trigger stamp_profile_email_change
  before insert or update on public.profiles
  for each row execute function public.stamp_profile_email_change();

revoke all on public.account_security_enrollments from app_rls;
revoke all on public.account_security_credentials from app_rls;
revoke all on public.account_security_sessions from app_rls;
revoke all on public.account_security_challenges from app_rls;
grant select, insert, update, delete on public.account_security_enrollments to app_rls;
grant select, insert, update, delete on public.account_security_credentials to app_rls;
grant select, insert, update, delete on public.account_security_sessions to app_rls;
grant select, insert, update, delete on public.account_security_challenges to app_rls;

alter table public.account_security_enrollments enable row level security;
alter table public.account_security_enrollments force row level security;
alter table public.account_security_credentials enable row level security;
alter table public.account_security_credentials force row level security;
alter table public.account_security_sessions enable row level security;
alter table public.account_security_sessions force row level security;
alter table public.account_security_challenges enable row level security;
alter table public.account_security_challenges force row level security;

drop policy if exists account_security_enrollments_owner on public.account_security_enrollments;
create policy account_security_enrollments_owner
  on public.account_security_enrollments for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

drop policy if exists account_security_credentials_owner on public.account_security_credentials;
create policy account_security_credentials_owner
  on public.account_security_credentials for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

drop policy if exists account_security_sessions_owner on public.account_security_sessions;
create policy account_security_sessions_owner
  on public.account_security_sessions for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

drop policy if exists account_security_challenges_owner on public.account_security_challenges;
create policy account_security_challenges_owner
  on public.account_security_challenges for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

commit;
