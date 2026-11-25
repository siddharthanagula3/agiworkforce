# Area 89. Account and access components

24 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S89.01 Account service.
- Should: A server-side account service maps every authenticated identity to one AGI account record and enforces account state (active, locked, pending deletion) on each request.
- Status: platform done
- Code: apps/web/lib/server/identity-account.ts:193; apps/web/lib/api-auth.ts:200; apps/web/lib/auth/account-status.ts:72

## S89.02 Authentication-provider adapters.
- Should: Authentication is delegated to identity-provider adapters (password, social, passkey, SSO) behind one server interface that verifies sessions and fetches users.
- Status: platform done
- Code: apps/web/lib/server/identity.ts:24; apps/web/lib/server/sso/clerk-enterprise-connections.ts:167

## S89.03 Session service.
- Should: A session service lists a user's active sessions and revokes one, all others, or all.
- Status: platform done
- Code: apps/web/lib/server/session-revocation.ts:137; apps/web/app/api/settings/sessions/route.ts:183

## S89.04 Token refresh and revocation service.
- Should: Device credentials use rotating refresh tokens with reuse detection, and can be revoked per device or all at once.
- Status: platform done
- Code: apps/web/lib/server/refresh-token-family.ts:100; apps/web/app/api/auth/device/refresh/route.ts:264; apps/web/lib/server/developer-token.ts:125

## S89.05 Device registry.
- Should: A device registry records each signed-in client (surface, OS, version, capabilities, last seen) and lets the user rename or unlink it.
- Status: platform done
- Code: apps/web/app/api/devices/heartbeat/route.ts:20; apps/web/app/api/settings/devices/route.ts:66

## S89.06 Recovery service.
- Should: A recovery service lets a locked-out user regain access when password, email or second factor is lost, with verification and audit.
- Status: platform done
- Code: apps/web/lib/support/tickets/recovery.ts:29; apps/web/lib/support/tickets/recovery.ts:67; apps/web/lib/support/tickets/recovery.ts:99; apps/web/lib/support/tickets/recovery.ts:116; apps/web/lib/support/tickets/recovery.ts:132; apps/web/app/api/support/recovery/route.ts:48; apps/web/app/api/support/staff/tickets/[ticketId]/recovery/route.ts:62

## S89.07 Profile service.
- Should: A profile service reads and updates the account profile (name, photo, preferred name, work description) for every client.
- Status: platform done
- Code: apps/web/app/api/me/route.ts:305; apps/web/lib/server/user-identity.ts:115

## S89.08 User-preference service.
- Should: A user-preference service stores per-namespace settings for the account with versioned writes that every client can read and sync.
- Status: platform done
- Code: apps/web/app/api/settings/preferences/route.ts:203; apps/web/lib/server/user-identity.ts:54

## S89.09 Consent and terms-version store.
- Should: A consent and terms store records which Terms version each user accepted and their consents, and blocks use until current Terms are accepted.
- Status: platform done
- Code: apps/web/lib/server/terms.ts:50; apps/web/lib/server/require-current-terms.ts:7; apps/web/lib/server/consent-records.ts:102

## S89.10 Organization service.
- Should: An organization service creates, updates, transfers and deletes organizations (workspaces for teams) with owners and seats.
- Status: platform done
- Code: apps/web/app/api/settings/organization/route.ts:578; apps/web/lib/services/organization-seat-service.ts:33

## S89.11 Workspace service.
- Should: A workspace service lists a user's workspaces (personal and team) and switches the active one, scoping data to it.
- Status: platform done
- Code: apps/web/lib/services/active-workspace-service.ts:63; apps/web/lib/services/active-workspace-service.ts:204; apps/web/app/api/settings/workspaces/route.ts:94

## S89.12 Membership service.
- Should: A membership service adds, changes and removes members, and removal revokes that member's workspace access and credentials.
- Status: platform done
- Code: apps/web/app/api/settings/team/[memberId]/route.ts:301; apps/web/lib/services/deprovision-service.ts:138

## S89.13 Invitation service.
- Should: An invitation service creates, lists, expires, revokes and accepts invitations with hashed tokens.
- Status: platform done
- Code: apps/web/lib/services/organization-invitation-service.ts:27; apps/web/app/api/settings/team/invitations/accept/route.ts:99

## S89.14 Group service.
- Should: A group service manages groups of members and maps groups to roles.
- Status: platform done
- Code: apps/web/app/api/settings/organization/groups/route.ts:84; apps/web/app/api/settings/organization/groups/[groupId]/route.ts:102; apps/web/app/api/settings/organization/groups/[groupId]/route.ts:103; apps/web/app/api/settings/organization/groups/[groupId]/members/route.ts:93; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:542; apps/web/features/workspace-console/components/WorkspaceRoles.tsx:487

## S89.15 Role/permission service.
- Should: A role/permission service defines built-in and custom roles, checks member permissions, and prevents escalation beyond the actor's own rights.
- Status: platform done
- Code: apps/web/lib/services/organization-role-service.ts:85; apps/web/lib/services/organization-permission-service.ts:95; apps/web/app/api/settings/organization/roles/route.ts:134

## S89.16 Resource-authorization layer.
- Should: A resource-authorization layer scopes every data access to the caller and active workspace and applies workspace policy (feature access, MFA, IP allow-list, retention).
- Status: platform done
- Code: apps/web/lib/services/organization-policy-gate.ts:198; apps/web/lib/services/organization-policy-gate.ts:498

## S89.17 SSO configuration.
- Should: Admins can configure SSO connections (SAML/OIDC) with domain verification and just-in-time provisioning.
- Status: platform done
- Code: apps/web/app/api/admin/sso/route.ts:166; apps/web/lib/server/sso/jit-provisioning.ts:39; apps/web/lib/server/sso/clerk-enterprise-connections.ts:167

## S89.18 Directory-provisioning adapter.
- Should: A SCIM directory-provisioning adapter creates, updates, deactivates users and groups from the customer's IdP.
- Status: platform done
- Code: apps/web/app/api/scim/v2/Users/route.ts:40; apps/web/lib/server/scim/scim-provisioning-service.ts:154

## S89.19 Service-account management.
- Should: Admins can create service accounts (non-human principals) with bounded scopes and credentials.
- Status: platform done
- Code: apps/web/lib/server/service-principal.ts:95; apps/web/app/api/settings/organization/service-principals/route.ts:88

## S89.20 API-key management.
- Should: An API-key service issues hashed, expiring keys scoped to user and workspace, lists them and revokes them.
- Status: platform done
- Code: apps/web/lib/services/api-key-service.ts:110; apps/web/app/api/settings/api-keys/route.ts:117

## S89.21 Personal-access-token management.
- Should: A personal-access-token service issues and revokes tokens distinct from API keys.
- Status: not applicable anywhere

## S89.22 Remote-device pairing service.
- Should: A pairing service links a second device (phone, browser) to a signed-in desktop or account with a short code and binds it to the account.
- Status: platform done
- Code: apps/web/app/api/pair/initiate/route.ts:43; apps/web/lib/server/device-codes.ts:7; services/signaling-server/src/db.ts:160; services/signaling-server/__tests__/relay/credential-rotation.test.ts:107; services/signaling-server/scripts/check-fly-machines.mjs:39; packages/contracts/types/src/pairing.ts:189; apps/mobile/stores/connectionStore.ts:976; apps/cli/src/remote_control/mod.rs:193

## S89.23 Account export/deletion coordinator.
- Should: An export/deletion coordinator produces the user's data export and erases the account and organization data across every store, honouring legal holds and recording what is retained.
- Status: platform done
- Code: apps/web/lib/server/account-erasure.ts:787; apps/web/lib/server/account-erasure.ts:855; apps/web/lib/server/organization-erasure.ts:297; apps/web/lib/services/deletion-manifest.ts:437

## S89.24 Administrative access service.
- Should: Administrative access to customer data requires a recorded reason, a second operator's approval, a time limit, and is logged.
- Status: platform done
- Code: apps/web/app/api/admin/support-access/route.ts:170; apps/web/lib/server/support-access-service.ts:349; apps/web/lib/server/admin-data-access.ts:24
