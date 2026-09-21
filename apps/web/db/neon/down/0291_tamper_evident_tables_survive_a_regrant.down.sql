-- Reversal of the owner-writes-only triggers.
--
-- WHAT THIS COSTS: no rows. The eight tables go back to resting on their
-- privilege REVOKE alone, which is where they were before this migration, so a
-- later blanket GRANT or ALTER DEFAULT PRIVILEGES can hand the application role
-- UPDATE and DELETE on the support access trail, the enterprise audit trail,
-- the policy revision history, the SCIM group roster, the legal hold custodian
-- list, the admin delegations, the organization MCP server entries and the data
-- rights requests, with nothing failing when it does.

BEGIN;

DROP TRIGGER IF EXISTS data_rights_requests_owner_writes_only ON public.data_rights_requests;
DROP TRIGGER IF EXISTS enterprise_audit_events_owner_writes_only ON public.enterprise_audit_events;
DROP TRIGGER IF EXISTS legal_hold_custodians_owner_writes_only ON public.legal_hold_custodians;
DROP TRIGGER IF EXISTS organization_admin_delegations_owner_writes_only ON public.organization_admin_delegations;
DROP TRIGGER IF EXISTS organization_mcp_servers_owner_writes_only ON public.organization_mcp_servers;
DROP TRIGGER IF EXISTS organization_policy_revisions_owner_writes_only ON public.organization_policy_revisions;
DROP TRIGGER IF EXISTS scim_group_members_owner_writes_only ON public.scim_group_members;
DROP TRIGGER IF EXISTS support_access_grants_owner_writes_only ON public.support_access_grants;

DROP FUNCTION IF EXISTS public.forbid_non_owner_rewrite();

DELETE FROM public.schema_migrations
 WHERE filename = '0291_tamper_evident_tables_survive_a_regrant.sql';

COMMIT;
