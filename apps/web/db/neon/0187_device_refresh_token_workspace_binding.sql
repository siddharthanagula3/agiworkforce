-- 0187 : bind a device credential to the workspace it was issued in.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Removing a member from one workspace revoked every device refresh token and
-- every API key on that account, because neither revocation had a workspace to
-- filter on. `api_keys` has carried `organization_id` since 0073 and the query
-- simply ignored it; `device_refresh_tokens` carried nothing at all, so the
-- only scope available was the whole user. An owner or admin of any workspace
-- the member had joined could therefore permanently revoke credentials that
-- member uses for their personal account and for unrelated tenants, which is
-- outside that admin's authorization boundary.
--
-- The column records the workspace that was active when the device redeemed
-- its authorization code; rotation carries it forward so a refreshed credential
-- keeps the binding. NULL is personal scope, which no workspace admin may
-- revoke. ON DELETE SET NULL rather than CASCADE: the credential belongs to the
-- member, so decommissioning a workspace demotes it to personal rather than
-- signing the device out.

alter table public.device_refresh_tokens
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

create index if not exists idx_device_refresh_tokens_organization
  on public.device_refresh_tokens (organization_id, user_id)
  where organization_id is not null and revoked_at is null;

comment on column public.device_refresh_tokens.organization_id is
  'Workspace active when this credential family was issued. NULL is personal scope. Removing a member from a workspace revokes only the rows bound to that workspace, never their personal or other-tenant credentials.';
