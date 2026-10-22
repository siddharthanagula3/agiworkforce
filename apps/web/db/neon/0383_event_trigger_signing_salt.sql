-- =============================================================================
-- Migration 0383: a rotatable signing secret for connector triggers
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : a connector trigger's signing secret is derived from the deployment
--          key and the trigger id alone, so it can never change. A leaked
--          secret could only be revoked by deleting the trigger, which also
--          deletes its delivery history and changes its URL.
--
-- Shape  : signing_salt is mixed into the derivation when set. Regenerating
--          writes a new random salt, so the previous secret stops verifying
--          at once while the URL stays the same. Null keeps the original
--          derivation, so every existing trigger and its senders keep working
--          until the owner regenerates. Only the service role writes it: the
--          column-level update grant 0210 gives app_rls does not name it.
--
-- Depends: 0210 (event_triggers)
-- =============================================================================

begin;

alter table public.event_triggers
  add column if not exists signing_salt text
    check (signing_salt is null or signing_salt ~ '^[0-9a-f]{64}$');

comment on column public.event_triggers.signing_salt is
  'Random salt mixed into a connector trigger signing secret; replacing it revokes the previous secret. Null keeps the original secret.';

commit;
