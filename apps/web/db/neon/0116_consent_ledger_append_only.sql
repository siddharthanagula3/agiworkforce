-- 0116 — make the DPDP consent ledger actually append-only.
--
-- WHAT WENT WRONG IN 0113/0114
-- Both migrations issue `grant select, insert ... to app_rls` and both are
-- documented — in the migration, in its down script, in a test, and in
-- DPDP_PROGRESS.md — as append-only because of it. That grant is ADDITIVE and
-- prevents nothing. 0037:83 sets
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls;
--
-- so every table created after it is born with UPDATE and DELETE for app_rls
-- already granted. Verified against a real branch: app_rls held
-- INSERT,SELECT,UPDATE,DELETE on both tables immediately after 0113/0114
-- applied. The text-matching migration test could not see this — it read the
-- .sql file and found the words `grant select, insert`, which were there.
--
-- Why that matters more here than almost anywhere else: a consent ledger's
-- entire legal value is that a withdrawal cannot overwrite the grant it
-- withdraws. If app_rls can UPDATE, the product can no longer show that consent
-- was ever held, which is the record DPDP s.6 exists to produce. The claim was
-- published while the database disagreed.
--
-- 0043_audit_log_immutability.sql hit this exact footgun on
-- `security_audit_logs` and fixed it with a REVOKE, while noting that a REVOKE
-- is not re-grant-proof: any future `GRANT ... ON ALL TABLES IN SCHEMA public`
-- silently restores UPDATE/DELETE with no failing test. It proposed a trigger
-- as the durable mechanism and deferred it because the audit table had to
-- coexist with SECURITY DEFINER purges.
--
-- This migration does BOTH, because the deferral reason does not apply here:
-- nothing purges `consent_records` through a SECURITY DEFINER function.
-- `delete_user_data()` (0020) does not touch it, and account erasure deletes it
-- over the Neon OWNER connection (lib/server/account-erasure.ts,
-- USER_SCOPED_TABLES), which the trigger deliberately admits.
--
-- WHY data_rights_requests IS ALSO REVOKED BUT NOT TRIGGERED
-- Its status legitimately moves (received → in_progress → resolved), but only
-- from the admin route, which runs on the owner connection. app_rls has no
-- business updating it. It gets the REVOKE. It does not get the trigger,
-- because unlike the consent ledger an operator will eventually need a
-- supported write path, and a trigger written before that path exists would be
-- guessing at its shape.

-- 1. Remove what the default privilege granted. Fixes today's state.
revoke update, delete on public.consent_records from app_rls;
revoke update, delete on public.data_rights_requests from app_rls;

-- 2. Make it survive a future blanket re-grant.
--
-- The guard is "is the caller the table owner", not "is the caller app_rls",
-- so a new application role added later is refused by default rather than
-- silently admitted. Owner-connection writes — account erasure, and any
-- operator correction that has been thought about — still pass.
create or replace function public.consent_records_forbid_mutation()
returns trigger
language plpgsql
as $$
declare
  table_owner text;
begin
  select pg_get_userbyid(relowner)
    into table_owner
    from pg_class
   where oid = 'public.consent_records'::regclass;

  if current_user is distinct from table_owner then
    raise exception
      'consent_records is append-only: % is not permitted for role %',
      tg_op, current_user
      using errcode = 'insufficient_privilege',
            hint = 'Record a withdrawal as a new row with granted = false.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function public.consent_records_forbid_mutation() is
  'Append-only guard for the DPDP consent ledger. Survives a blanket re-grant, which a REVOKE alone does not. Admits the table owner so account erasure still works.';

drop trigger if exists consent_records_append_only on public.consent_records;
create trigger consent_records_append_only
  before update or delete on public.consent_records
  for each row
  execute function public.consent_records_forbid_mutation();

-- =============================================================================
-- VERIFICATION — `node scripts/verify-dpdp-schema.mjs` against a throwaway Neon
-- branch proves all of this behaviourally: the grants, the trigger in both
-- directions, and that the owner path still erases. Do not trust the
-- text-matching migration test alone; it is what missed the defect this
-- migration repairs.
-- =============================================================================
