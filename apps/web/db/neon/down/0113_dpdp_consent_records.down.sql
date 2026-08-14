-- Reversal of 0113 — drop the DPDP per-purpose consent ledger.
--
-- WHAT THIS COSTS, stated plainly because this reversal destroys evidence and
-- the next incident is a bad time to discover that:
--
-- Dropping `consent_records` destroys EVERY consent decision the product has
-- recorded — every grant, and every withdrawal. After this runs, the product
-- cannot show that any data principal ever consented to anything, cannot show
-- that anyone ever withdrew, and cannot answer a Data Protection Board question
-- about either. That is the record DPDP s.6 exists to produce, and it is not
-- reconstructible from anything else in the schema: the waitlist row proves an
-- address was stored, not that its owner agreed to it being stored.
--
-- DO NOT run this to roll back an unrelated deploy. If the forward migration
-- has been live long enough to have collected rows, dump the table first:
--
--   \copy (select * from public.consent_records) to 'consent_records.csv' csv header
--
-- The RLS policy, both indexes, and the check constraint go with the table;
-- they are named below so the coverage check can see each one accounted for.

BEGIN;

drop policy if exists consent_records_user_isolation on public.consent_records;

alter table public.consent_records drop constraint if exists consent_records_has_subject;

drop index if exists public.idx_consent_records_user_purpose;
drop index if exists public.idx_consent_records_email_purpose;

alter table public.consent_records disable row level security;

drop table if exists public.consent_records;

delete from public.schema_migrations where filename = '0113_dpdp_consent_records.sql';

COMMIT;
