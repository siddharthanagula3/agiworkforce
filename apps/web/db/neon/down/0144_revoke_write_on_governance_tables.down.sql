-- Reversal of 0144 — restore the DML grants 0037 hands out by default.
--
-- WHAT THIS COSTS: the application role regains INSERT, UPDATE and DELETE on
-- legal holds, retention sweep evidence, model and connector policy, spend
-- caps, and SIEM destinations. Those tables would then be protected only by the
-- absence of a permissive write policy, which is one policy edit away from
-- being writable by any member session.
--
-- There is no good reason to run this. It exists so the migration is
-- reversible, not because reversing it is advisable.

begin;

grant insert, update, delete on
  public.legal_holds,
  public.organization_retention_sweeps,
  public.organization_model_policies,
  public.organization_connector_policies,
  public.organization_spend_limits,
  public.organization_audit_destinations
to app_rls;

delete from public.schema_migrations
 where filename = '0144_revoke_write_on_governance_tables.sql';

commit;
