-- Reversal of 0415: drop the hold check a member's deleting statement calls.
--
-- WHAT THIS COSTS: every destructive statement the web app runs (message and
-- media deletion, retention and purge sweeps) calls this function through
-- apps/web/lib/services/legal-hold-gate.ts, so the code that renders it must be
-- rolled back first or each of those statements fails with "function does not
-- exist" and nothing is deleted. Once the code is back on the inline predicate,
-- an ordinary member's connection can no longer see the holds on their own
-- content again, and a member can permanently delete a file or message that an
-- active legal hold preserves.

begin;

drop function if exists public.legal_hold_preserves(uuid, text, text);

delete from public.schema_migrations
 where filename = '0415_legal_hold_preserves.sql';

commit;
