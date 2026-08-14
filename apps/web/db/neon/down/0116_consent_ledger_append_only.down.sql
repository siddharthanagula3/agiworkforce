-- Reversal of 0116 — restore the (broken) pre-0116 privilege state.
--
-- WHAT THIS COSTS: after this runs, `app_rls` can once again UPDATE and DELETE
-- rows in `consent_records`, so a withdrawal can overwrite the grant it
-- withdraws and the ledger stops being able to show that consent was ever held.
-- That is the DPDP s.6 record. Do not run this to roll back an unrelated
-- deploy — 0116 is a privilege repair, not a feature, and nothing depends on
-- the weaker state.
--
-- The re-grant below restores exactly what 0037's ALTER DEFAULT PRIVILEGES
-- would have given these tables at creation time, so the reversal returns the
-- schema to the state 0113/0114 actually produced rather than to the state they
-- claimed to produce.

BEGIN;

drop trigger if exists consent_records_append_only on public.consent_records;
drop function if exists public.consent_records_forbid_mutation();

grant update, delete on public.consent_records to app_rls;
grant update, delete on public.data_rights_requests to app_rls;

delete from public.schema_migrations where filename = '0116_consent_ledger_append_only.sql';

COMMIT;
