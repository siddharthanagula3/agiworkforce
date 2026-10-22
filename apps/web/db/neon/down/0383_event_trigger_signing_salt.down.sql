-- Reversal of 0383 : forget the rotated signing secrets of connector triggers.
--
-- WHAT THIS COSTS: code that reads signing_salt must be reverted first. Every
-- connector trigger goes back to its original secret, so a trigger whose
-- secret was regenerated rejects its current senders and accepts the secret
-- that was revoked, until the sender is given the original one again.

begin;

alter table public.event_triggers
  drop column if exists signing_salt;

delete from public.schema_migrations
 where filename = '0383_event_trigger_signing_salt.sql';

commit;
