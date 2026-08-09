-- 0102 — record that an account holder accepted the terms.
--
-- /signup mounted the Clerk widget directly, with no clickwrap in front of it,
-- and no column anywhere in this schema held a version, a timestamp or a
-- surface for an acceptance. The arbitration clause, the class-action waiver
-- and the liability cap in /terms only bind a user who can be shown to have
-- agreed to them, and nothing in the product could show that for a single
-- account.
--
-- Why columns on `profiles` and not a `terms_acceptances` table: every table
-- carrying a user-scoping column must be classified by
-- lib/server/account-erasure.ts (delete / anonymize / retain), and that
-- classification is a deletion decision that belongs with the erasure work, not
-- with the clickwrap. `profiles` is already classified, already keyed by the
-- Clerk user id, and already RLS-isolated by 0037, so the acceptance inherits
-- all three. The cost is that only the most recent acceptance survives: when
-- /terms is revised and the user re-accepts, the previous version's timestamp
-- is overwritten rather than kept as history. An append-only ledger of every
-- version a user ever accepted needs the erasure classification above first.
--
-- `terms_version` is the document's revision date, not a serial. It is the same
-- value /terms prints as "Last updated" (POLICY_LAST_UPDATED.terms in
-- lib/legal-constants.ts), so a stored version names the exact text that was on
-- screen when the box was ticked.
--
-- All three columns are nullable and default NULL: every account created before
-- this migration has no acceptance on record, which is the truth about them.

alter table public.profiles
  add column if not exists terms_version text;

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

alter table public.profiles
  add column if not exists terms_accepted_surface text;

comment on column public.profiles.terms_version is
  'Revision date of the terms the user accepted, matching POLICY_LAST_UPDATED.terms. NULL means no acceptance is on record.';
comment on column public.profiles.terms_accepted_at is
  'When the current terms_version was first accepted. Not moved by later visits to the same version.';
comment on column public.profiles.terms_accepted_surface is
  'Where the acceptance was collected (e.g. web-signup), for reconstructing which clickwrap was shown.';
