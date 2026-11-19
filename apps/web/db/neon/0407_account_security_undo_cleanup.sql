-- =============================================================================
-- Migration 0407: a resumable record of the cleanup an emailed undo link starts
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : opening the emailed link turns Advanced Account Security off and
--          burns the one-time link in one transaction. The cleanup that follows
--          (forgetting the enrollment, revoking mobile tokens, ending the
--          session that turned it on, resetting the password, signing out every
--          other session, telling the person) ran outside that transaction and
--          left nothing behind. One failure, or a crash, skipped every later
--          step and the burned link could not be opened to finish them.
--
-- Shape  : Four nullable columns on account_security_enrollments, written in the
--          same transaction that burns the link:
--          undo_cleanup_token_hash  the hash of the burned link, so opening the
--                                   same link again finds the unfinished work
--          undo_cleanup_expires_at  when the link would have expired; the cleanup
--                                   cannot be resumed after that
--          undo_cleanup_lease_until one resume at a time; a crashed run frees the
--                                   record when its lease runs out
--          undo_cleanup             the outcome of each step so far, as a json
--                                   object; a finished step is never repeated, so
--                                   the password is not reset twice
--          All four are null again once every step has finished. The enrollment
--          row, its row-level security, its owner policy and its erasure cascade
--          from profiles already cover them. A unique partial index finds the
--          record by link hash.
--
-- Empty  : existing rows keep null in all four columns.
--
-- Depends: 0338 (account security), 0394 (recovery batch)
-- =============================================================================

begin;

alter table public.account_security_enrollments
  add column if not exists undo_cleanup_token_hash text,
  add column if not exists undo_cleanup_expires_at timestamptz,
  add column if not exists undo_cleanup_lease_until timestamptz,
  add column if not exists undo_cleanup jsonb;

alter table public.account_security_enrollments
  drop constraint if exists account_security_undo_cleanup_shape;

alter table public.account_security_enrollments
  add constraint account_security_undo_cleanup_shape check (
    (undo_cleanup is null) = (undo_cleanup_token_hash is null)
    and (undo_cleanup is null) = (undo_cleanup_expires_at is null)
    and (undo_cleanup is not null or undo_cleanup_lease_until is null)
    and (undo_cleanup_token_hash is null or undo_cleanup_token_hash ~ '^[0-9a-f]{64}$')
    and (undo_cleanup is null or jsonb_typeof(undo_cleanup) = 'object')
  );

create unique index if not exists idx_account_security_enrollments_undo_cleanup_token
  on public.account_security_enrollments (undo_cleanup_token_hash)
  where undo_cleanup_token_hash is not null;

comment on column public.account_security_enrollments.undo_cleanup is
  'Outcome of each cleanup step the emailed undo link started. Null when no cleanup is unfinished.';

commit;
