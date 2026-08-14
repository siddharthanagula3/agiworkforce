-- 0113 — per-purpose consent ledger for the DPDP Act, 2023 (India).
--
-- WHY A LEDGER AND NOT A COLUMN
-- 0102 put terms acceptance on `profiles` because only the latest acceptance
-- mattered and `profiles` was already classified for erasure and RLS. Consent
-- cannot take that shortcut. DPDP s.6 makes consent per-purpose, revocable, and
-- provable, and s.6(6) requires withdrawal to be as easy as giving — so the
-- question the product must answer is not "did this person consent" but "for
-- which purpose, under which notice, at which instant, and has it since been
-- withdrawn". A boolean column cannot answer that after the fact, and a column
-- that is overwritten on withdrawal destroys the evidence that consent was ever
-- held. Every row here is append-only in intent: a withdrawal is a NEW row with
-- `granted = false`, never an UPDATE of the grant.
--
-- WHY user_id IS NULLABLE
-- The largest unconsented intake in the product is `/api/waitlist/public`,
-- which takes a visitor's plaintext email with no account and no relationship.
-- That is exactly the collection DPDP s.5 wants a notice in front of, so the
-- ledger has to be able to record a consent for someone who has no `profiles`
-- row. Anonymous rows are keyed by `subject_email_sha256` instead.
--
-- WHY THE EMAIL IS HASHED
-- The address itself already lives in `cloud_managed_waitlist`. Storing it a
-- second time here would widen the blast radius of this table without adding
-- anything: SHA-256 of the normalised address is enough to link a consent to a
-- waitlist row and enough to answer "what do you hold about me" for a data
-- principal who supplies their address, which is the only way an anonymous
-- subject can identify themselves anyway.
--
-- WHAT THIS ROW IS NOT
-- It is not a signed attestation. The server records what the client said the
-- person ticked; it has no independent proof the checkbox was rendered. Treat a
-- row as evidence of consent collected by the flow named in `surface`, under
-- the notice revision named in `notice_version` — and treat the absence of a
-- row as no consent on record, not as consent that failed to save. Callers must
-- fail the request when the write fails rather than proceed unconsented.

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),

  -- Account holder when one exists. Null for pre-account (anonymous) consent.
  user_id text references public.profiles(id) on delete cascade,

  -- SHA-256 of the lowercase, trimmed email. Set when the consent was collected
  -- against an address rather than an account. Never the plaintext address.
  subject_email_sha256 text,

  -- The specific purpose consented to. Free-text rather than an enum so a new
  -- purpose does not need a migration; the authoritative list with its
  -- user-facing description is `lib/server/consent-records.ts` (CONSENT_PURPOSES),
  -- which is what the notice page renders.
  purpose text not null,

  -- true = consent given. false = consent withdrawn. Withdrawal is a new row.
  granted boolean not null,

  -- Revision date of the privacy notice that was on screen, matching
  -- POLICY_LAST_UPDATED in lib/legal-constants.ts, so a stored consent names
  -- the exact text the person was shown.
  notice_version text not null,

  -- Where it was collected, e.g. 'web-waitlist-inline', 'web-consent-centre'.
  surface text not null,

  recorded_at timestamptz not null default now(),

  -- A consent must attach to a subject one way or the other. A row with neither
  -- an account nor an address hash cannot be honoured, exported, or withdrawn,
  -- so the database refuses it rather than accumulating orphans.
  constraint consent_records_has_subject
    check (user_id is not null or subject_email_sha256 is not null)
);

-- "What is the current state of purpose P for user U" is the read the consent
-- centre and every gate performs: newest row per (subject, purpose) wins.
create index if not exists idx_consent_records_user_purpose
  on public.consent_records (user_id, purpose, recorded_at desc);

create index if not exists idx_consent_records_email_purpose
  on public.consent_records (subject_email_sha256, purpose, recorded_at desc);

grant select, insert on public.consent_records to app_rls;

alter table public.consent_records enable row level security;
alter table public.consent_records force row level security;

-- Account-bound rows are readable and writable only by their subject. Anonymous
-- rows (user_id null) are deliberately NOT visible on the scoped handle: they
-- are written by the public intake route over the owner connection, and no
-- signed-in user should be able to enumerate the consents of an address that is
-- not proven to be theirs.
drop policy if exists consent_records_user_isolation on public.consent_records;
create policy consent_records_user_isolation
  on public.consent_records for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

comment on table public.consent_records is
  'Append-only per-purpose consent ledger for DPDP s.6. A withdrawal is a new row with granted=false, never an update. Anonymous rows are keyed by subject_email_sha256.';
comment on column public.consent_records.granted is
  'true = consent given, false = consent withdrawn. The newest row per (subject, purpose) is the live state.';
comment on column public.consent_records.notice_version is
  'Revision date of the privacy notice shown when this consent was collected. Matches POLICY_LAST_UPDATED.';
comment on column public.consent_records.subject_email_sha256 is
  'SHA-256 of the normalised email for consent collected without an account. Not reversible and not a substitute for the address held elsewhere.';
