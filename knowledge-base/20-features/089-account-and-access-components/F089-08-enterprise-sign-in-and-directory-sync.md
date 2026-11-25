---
id: "F089-08"
type: "feature"
title: "Enterprise sign-in and directory sync"
aliases: ["SSO configuration (S89.17)", "Directory-provisioning adapter (S89.18)", "Enterprise SSO", "SAML / OIDC connections", "SCIM 2.0 directory sync", "Directory sync", "JIT provisioning"]
area: "89 Account and access components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S89.17", "S89.18"]
depends_on: ["SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "plan:enterprise", "mode:cloud", "surface:web", "table:sso_connections", "table:directory_sync_connections", "table:scim_provisioned_users", "table:organization_members"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F089-08 Enterprise sign-in and directory sync

Lets an owner connect a company identity provider (SAML or OIDC), prove ownership of the email domain with a DNS record, and switch on just-in-time membership. A separate SCIM 2.0 service lets the company directory create, update and turn off users and groups with a bearer token. Both need an Enterprise plan.

Area: [89. Account and access components](README.md). Requirement items: [S89.17](../../10-requirements/capabilities/089-account-and-access-components.md#s8917), [S89.18](../../10-requirements/capabilities/089-account-and-access-components.md#s8918).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores SSO connections as inactive drafts with a domain challenge, registers them in the hosted identity provider (Clerk) when activated, grants membership at first sign-in from a verified domain, and exposes a first-party SCIM 2.0 server under /api/scim/v2 (apps/web/app/api/admin/sso/route.ts:175-306; apps/web/lib/server/sso/jit-provisioning.ts:39-127; apps/web/app/api/scim/v2/Users/route.ts).

**Why it exists.** Enterprise buyers need single sign-on and automatic joiner, mover and leaver handling from their directory (S89.17, S89.18 in doc: knowledge-base/data/area-briefs/089-account-and-access-components.md; doc: docs/compliance/directory-sync.md).

**Who uses it.** Workspace owners (create, delete connections), owners and admins (list, token minting), and the customer's identity provider calling SCIM with a token. End users meet it only as the enterprise sign-in.

**Problems it solves**

- Someone claiming a domain they do not own: creation is a draft, activation needs a DNS TXT proof (apps/web/app/api/admin/sso/route.ts:220-229, apps/web/lib/server/sso/domain-verification.ts:43-47).
- Leavers keeping access: deactivating a user through SCIM revokes membership and credentials (apps/web/lib/server/scim/scim-provisioning-service.ts:777-783).
- Directory sync running during an incident: a locked-down workspace refuses SCIM (apps/web/lib/server/scim/scim-auth.ts:60-70).
- Hostile IdP input: URLs, metadata and attribute mapping are validated before storing (apps/web/app/api/admin/sso/route.ts:52-103).

**Use cases**

- An owner adds a SAML connection for example.com, publishes the TXT record, verifies it, then activates it.
- A new employee signs in through SSO and is added as 'member' automatically on first sign-in.
- The directory sends POST /Users for a new hire; a pending row is created and linked when the person signs in.
- The directory sends active=false for a leaver; their seat and credentials are removed.

## 2. User experience

**Where to find it**

- Web: the SSO panel in team settings (apps/web/features/settings/sections/team/SSOPanel.tsx) with labels 'Domain not verified', 'Domain verified', 'Ready to activate', 'Reissue challenge', 'Remove connection', 'Record type', 'Record name', 'Record value', 'ACS URL', 'SP entity ID', 'SP metadata URL' (SSOPanel.tsx:35-44,409-450,496,576).
- Web admin: directory sync page with 'Connections', 'SCIM tokens', 'Group role mapping', 'Recent IdP activity', and provider choices 'Microsoft Entra ID' and 'Google Workspace' (apps/web/features/admin/pages/DirectorySyncAdminPage.tsx:66-67,420,506,601,661).
- Desktop, mobile, CLI, VS Code, Chrome: no screen found for configuration; they only sign in through the hosted flow [inferred, no UI file found by search].

**Before you start**

- An Enterprise plan on the workspace: other plans get 403 'SUBSCRIPTION_REQUIRED' (apps/web/lib/server/sso/sso-access.ts:20-22,60-71) and SCIM answers 403 'Directory sync requires an active Enterprise subscription' (scim-auth.ts:111-122).
- Owner role to create, verify, delete a connection (admin/sso/route.ts:211-218,339-346); owner or admin to list (route.ts:121-128).
- The deployment's Clerk instance must have enterprise connections enabled, or the call returns 503 not-provisioned (clerk-enterprise-connections.ts:140-144 offset; admin/sso/route.ts:356-358).
- A SCIM token minted by an owner or admin (apps/web/app/api/admin/directory-sync/tokens/route.ts:52).

**Screens and controls**

- SSO panel fields: email domain, SAML metadata URL or XML, OIDC discovery URL, client id, client secret (SSOPanel.tsx:118-124,527,611).
- Validation messages: 'Enter a company domain, such as example.com.', 'Use an HTTPS metadata URL from your identity provider.' (SSOPanel.tsx:118-122).
- Error messages: 'Could not create the SSO connection.', 'Domain verification failed.', 'Could not remove the connection.' (SSOPanel.tsx:295,477,582).

**Journey**

1. 1. Owner opens the SSO panel and enters domain and SAML or OIDC details; POST /api/admin/sso stores an inactive draft and returns 'nextStep: verify_domain' with a TXT record (admin/sso/route.ts:295-301).
2. 2. Owner publishes the TXT record under '_agiworkforce-sso' and calls verify; a successful lookup sets domain_verified_at (verify-domain/route.ts:94-190; domain-verification.ts:6-8).
3. 3. Owner activates the connection with PATCH /api/admin/sso/{id}; the server creates or updates the connection in Clerk (admin/sso/[id]/route.ts:281-345).
4. 4. Owner turns on just-in-time provisioning and picks 'member' or 'viewer' as default role (admin/sso/[id]/route.ts:46-47).
5. 5. A user signs in; on the first /api/me call the server provisions membership (apps/web/app/api/me/route.ts:165-173).
6. 6. For SCIM, an admin mints a token; the directory calls /api/scim/v2/Users and /Groups with 'Authorization: Bearer'.
7. 7. Removal: DELETE deactivates by default or hard-deletes with hard=true (admin/sso/route.ts:308-376).

**What the person sees and gets**

- 201 with connection view and domain instructions on create.
- 409 'Domain ... is already configured for SSO' on duplicate (admin/sso/route.ts:247-250).
- SCIM responses use content type application/scim+json with Bearer challenge on 401 (scim-protocol.ts:48-61).
- SCIM create returns 201 with a Location header (apps/web/app/api/scim/v2/Users/route.ts:44-56).
- Audit events sso_connection_created, sso_connection_deactivated, sso_connection_deleted, sso_jit_membership_granted, sso_jit_membership_refused (admin/sso/route.ts:281-293,396-408; jit-provisioning.ts:88,110).

**Settings**

- jit_provisioning_enabled and jit_default_role per connection (admin/sso/[id]/route.ts:46-47).
- Group role mapping on the directory sync page (DirectorySyncAdminPage.tsx:601).
- The challenge lasts seven days (domain-verification.ts:10).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Create, list, patch, verify, reissue and remove SSO connections with validation and audit (apps/web/app/api/admin/sso/route.ts; verify-domain/route.ts; [id]/route.ts).
- SAML connections are created in Clerk with IdP-initiated sign-in off and subdomains off (clerk-enterprise-connections.ts:157-162 approx).
- JIT joins only active, domain-verified, JIT-enabled connections, matched by exact domain or subdomain, and refuses with an audit event when no seat is free (jit-provisioning.ts:28-37,49-60,103-123).
- SCIM Users and Groups: GET, POST, PUT, PATCH, DELETE (apps/web/app/api/scim/v2/Users/[userId]/route.ts:22-59; Groups/[groupId]/route.ts:22-59), plus discovery routes ServiceProviderConfig, Schemas, ResourceTypes.
- SCIM auth order: rate limit, bearer token, lockdown check, connection active, token issuer still admin, Enterprise plan (scim-route.ts:10-22; scim-auth.ts:42-122).
- SCIM errors are returned as SCIM error bodies with status, detail and scimType (scim-protocol.ts:55-77).
- Failed and rejected SCIM requests are recorded as sync events (scim-route.ts:33-52).

**Incomplete**

- SCIM POST creates a pending record when no account exists; no account is created and no invitation is sent (doc: docs/compliance/directory-sync.md:50-70). Membership is granted at the person's next sign-in or on a later PUT/PATCH.
- Exact SCIM error shapes for every failure were not traced beyond the ScimError class.

**Present but disconnected or switched off**

- SSO needs the Clerk Enhanced Authentication add-on; without it the code returns 'not_entitled' (clerk-enterprise-connections.ts:1-5 of the excerpt).
- Directory sync is disabled for a locked-down workspace or a disabled connection (scim-auth.ts:60-87).

**Not available**

- No configuration UI on desktop, mobile, CLI, VS Code or Chrome [inferred; no UI file found by search].

## 4. Required behaviour

**Established requirements**

- Admins can configure SSO connections (SAML/OIDC) with domain verification and just-in-time provisioning. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S89.17)
- A SCIM adapter creates, updates and deactivates users and groups from the customer's IdP. (source: S89.18, same brief)
- Connections are created in the hosted identity provider; the SAML form refuses IdP-first sign-in. (source: apps/web/lib/server/sso/clerk-enterprise-connections.ts (buildParams, allowIdpInitiated false))
- Only the email domain or a subdomain matches a connection. (source: apps/web/lib/server/sso/jit-provisioning.ts:28-37)
- SCIM user lists are filtered and paged; a create returns 201 with a location header. (source: apps/web/app/api/scim/v2/Users/route.ts:23-56)
- SCIM is a first-party service; POST /Users always returns a real resource and a pending user is linked at sign-in. (source: doc: docs/compliance/directory-sync.md:50-70)

**Acceptance criteria**

1. A new SSO connection is stored with is_active=false and returns a TXT record to publish.
2. Creating a second connection for the same domain returns 409.
3. A non-owner calling POST /api/admin/sso is refused.
4. A user signing in with a verified-domain enterprise account joins as the connection's default role once, and a second sign-in reports 'already_member'.
5. A SCIM request without a valid bearer token gets 401 with a Bearer challenge.
6. A SCIM request for a workspace not on an Enterprise plan gets 403.
7. SCIM POST /Users returns 201 and a Location header ending in /Users/{id}.
8. SCIM active=false removes the membership and revokes credentials.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- JIT only runs when the person signs in through the web identity handshake (/api/me), so a user who never calls it is not provisioned [inferred from apps/web/app/api/me/route.ts:165-173].
- SCIM runs only against Cloud; Local mode has no accounts [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show on the SSO panel when a connection is draft, verified and active in one status line with the failing step.
- [proposed] Document every SCIM error shape in docs/compliance/directory-sync.md.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | /api/admin/sso (GET, POST, DELETE) | `apps/web/app/api/admin/sso/route.ts` | List, create draft, deactivate or delete connections |
| endpoint | /api/admin/sso/[id] (GET, PATCH) | `apps/web/app/api/admin/sso/[id]/route.ts` | Read, edit, activate, set JIT options, provision in Clerk |
| endpoint | /api/admin/sso/verify-domain (POST, PUT) | `apps/web/app/api/admin/sso/verify-domain/route.ts` | Check the DNS record; reissue the challenge for an inactive connection |
| service | domain-verification | `apps/web/lib/server/sso/domain-verification.ts` | Challenge token, TXT name and value, expiry, DNS lookup |
| service | clerk-enterprise-connections | `apps/web/lib/server/sso/clerk-enterprise-connections.ts` | Create, update, activate, delete connections in the hosted identity provider |
| service | jit-provisioning | `apps/web/lib/server/sso/jit-provisioning.ts` | Joins a user at first sign-in; seat-limit refusal |
| service | sso-access | `apps/web/lib/server/sso/sso-access.ts` | Enterprise plan check for SSO management |
| service | idp-metadata | `apps/web/lib/server/sso/idp-metadata.ts` | Validation of IdP URLs, metadata XML and attribute mapping |
| endpoint | /api/me | `apps/web/app/api/me/route.ts` | Calls provisionEnterpriseSignIn (lines 165-173) and links pending SCIM users |
| endpoint | /api/scim/v2/Users and /Users/{id} | `apps/web/app/api/scim/v2/Users/route.ts` | SCIM user list and create; item routes in Users/[userId]/route.ts |
| endpoint | /api/scim/v2/Groups | `apps/web/app/api/scim/v2/Groups/route.ts` | SCIM group list and create |
| service | scim-auth | `apps/web/lib/server/scim/scim-auth.ts` | Bearer token, lockdown, connection, issuer and plan checks |
| service | scim-route | `apps/web/lib/server/scim/scim-route.ts` | withScim wrapper: rate limit, auth, error mapping, body size limit |
| service | scim-protocol | `apps/web/lib/server/scim/scim-protocol.ts` | Filters, paging, SCIM error and response builders |
| service | scim-provisioning-service | `apps/web/lib/server/scim/scim-provisioning-service.ts` | Create, replace, patch, delete users and groups; membership reconcile; credential revocation |
| service | scim-token-service | `apps/web/lib/server/scim/scim-token-service.ts` | Generate, hash-verify, list SCIM tokens |
| endpoint | /api/admin/directory-sync/tokens | `apps/web/app/api/admin/directory-sync/tokens/route.ts` | List and mint SCIM tokens |
| screen | SSOPanel | `apps/web/features/settings/sections/team/SSOPanel.tsx` | Owner UI for connections |
| screen | DirectorySyncAdminPage | `apps/web/features/admin/pages/DirectorySyncAdminPage.tsx` | Admin UI for connections, tokens, group mapping, activity |
| table | sso_connections | `apps/web/db/neon/0083_sso_connections_clerk_link.sql` | Connection rows; later 0092 and 0204 add verified-only uniqueness and JIT columns |
| table | directory_sync_connections, scim_provisioned_users | `apps/web/db/neon/0084_scim_provisioning.sql` | SCIM connection and staged user rows |
| test | SCIM route tests | `apps/web/app/api/scim/v2/__tests__/scim-routes.test.ts` | Route behaviour |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Owner submits a connection; the server validates the domain, URLs, metadata and mapping, stores an inactive draft with a challenge token, and writes audit events. | our servers | apps/web/app/api/admin/sso/route.ts:192-293 |
| Owner publishes a DNS TXT record at their DNS host. | outside service | apps/web/lib/server/sso/domain-verification.ts:6-8,43-47 |
| The server resolves the TXT record over DNS and marks the domain verified. | our servers | domain-verification.ts:88-104; verify-domain/route.ts:180 |
| Activation calls the hosted identity provider to create or update the enterprise connection. | outside service | apps/web/lib/server/sso/clerk-enterprise-connections.ts (provisionConnection, updateConnection); admin/sso/[id]/route.ts:323 |
| A user signs in at the company IdP through the hosted provider; the app then calls /api/me and the server inserts an organization_members row with source sso_jit. | outside service | apps/web/app/api/me/route.ts:165-173; jit-provisioning.ts:75-82 |
| The customer directory calls SCIM; the server authenticates the token, applies the change in scim_provisioned_users and membership, records a sync event. | our servers | scim-route.ts:10-31; scim-provisioning-service.ts:734-800 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| SSO connection rows with domain, metadata, challenge token, JIT settings | table sso_connections | Mirrored to the hosted identity provider via clerk_connection_id | Deactivate keeps the row; hard=true deletes it (admin/sso/route.ts:370-376) |
| SCIM provisioned users and groups, sync events | tables scim_provisioned_users, directory_sync_connections and event rows | No | SCIM raw attributes have sensitive fields stripped before storage (scim-provisioning-service.ts:761); retention otherwise unknown |
| SCIM tokens (hashed) | A tokens table (name not opened); format 'scim_<16 hex>_<48 hex>' | No | unknown |
| Audit events | security audit log | No | purge-security-audit-logs cron exists (apps/web/app/api/cron/purge-security-audit-logs) |

**Models and providers.** No model or inference provider takes part. The only outside providers are the hosted identity provider (Clerk) and the customer's IdP and DNS.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in account for admin routes; SCIM uses a bearer token, no user session. |
| Permissions | Create, verify, delete: owner. List and token minting: owner or admin. SCIM token is valid only while its issuer is still owner or admin (scim-auth.ts:89-108). |
| Subscription | Enterprise plan capability 'enterprise_controls' for SSO and SCIM (sso-access.ts:20-22; scim-auth.ts:111-122). Entitlement failure to resolve fails closed to the default plan tier (scim-auth.ts:134-141). |
| Limits and metering | Rate limits 'api-key-create' on create and verify, 'api-key-revoke' on delete, 'default' on list, 'scim' for SCIM. Seat ceiling can refuse JIT joins (jit-provisioning.ts:104-123). SCIM body limit 256 KB, page size default 100 and maximum 200 (scim-route.ts:66; scim-protocol.ts:79-80). |
| Feature flags | Tenant lockdown flag blocks SCIM (scim-auth.ts:60-70). |
| Model compatibility | Not applicable. |
| Provider restrictions | Requires the hosted identity provider's enterprise connections add-on (clerk-enterprise-connections.ts). |
| Local mode | Local mode has no company accounts; SSO and SCIM do not apply. Signing in to Cloud with SSO is separate from Local inference, which stays free of any plan [inferred from the requirement that Local needs no subscription]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Domain challenge older than seven days | Verification reports challenge_expired; reissue needs the connection inactive | verify-domain/route.ts:118-122,268-286 |
| Hosted provider update fails on delete | 502 and the connection is left unchanged; 503 if the provider is not entitled | admin/sso/route.ts:355-367 |
| No free seat at JIT | Result 'seat_limit', audit event sso_jit_membership_refused | jit-provisioning.ts:104-123 |
| JIT failure at sign-in | Logged and sign-in continues | apps/web/app/api/me/route.ts:167-172 |
| SCIM rate limited | 429 SCIM error 'tooMany' | scim-route.ts:14-17 |
| SCIM body too large or bad JSON | 413 or 400 invalidSyntax | scim-route.ts:68-95 |
| Duplicate SCIM user | 409 uniqueness | scim-provisioning-service.ts:765-767 |
| Offline, cancel, loading | not handled in the code at the API level; the panel shows error strings | SSOPanel.tsx:295-582 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/admin/sso/__tests__/route.entitlement.test.ts`: Plan gate on SSO
- `apps/web/app/api/admin/sso/__tests__/route.roundtrip.test.ts`: Create, list, verify, remove flow
- `apps/web/app/api/admin/sso/__tests__/route.hostile-metadata.test.ts`: Hostile metadata rejected
- `apps/web/app/api/admin/sso/__tests__/route.audit-events.test.ts`: Audit events
- `apps/web/app/api/admin/sso/__tests__/verify-domain.challenge-expiry.test.ts`: Challenge expiry
- `apps/web/lib/server/sso/__tests__/jit-provisioning.test.ts`: JIT outcomes
- `apps/web/lib/server/sso/__tests__/domain-verification.test.ts`: DNS verification
- `apps/web/lib/server/scim/__tests__/scim-auth.test.ts`: SCIM auth
- `apps/web/lib/server/scim/__tests__/scim-protocol.test.ts`: Filters, paging, errors
- `apps/web/app/api/scim/v2/__tests__/scim-routes.test.ts`: SCIM routes
- `apps/web/app/api/scim/v2/__tests__/scim-every-handler-gated.test.ts`: Every SCIM handler is authenticated

**Test scenarios**

- **Draft then verify**
  1. POST /api/admin/sso as owner on an Enterprise workspace
  2. Publish the returned TXT record
  3. POST /api/admin/sso/verify-domain
  - Expected: Connection stays inactive until verified, then verified
- **Wrong role**
  1. POST /api/admin/sso as admin (not owner)
  - Expected: Refused
- **JIT first sign-in**
  1. Activate a verified JIT connection
  2. Sign in with an account on that domain
  3. Call /api/me
  - Expected: Member row with source sso_jit and an audit event
- **SCIM bad token**
  1. GET /api/scim/v2/Users with a wrong token
  - Expected: 401 with WWW-Authenticate Bearer
- **SCIM leaver**
  1. PATCH a linked user active=false
  - Expected: Membership removed and credentials revoked
- **Not entitled**
  1. Call SCIM for a workspace on a lower plan
  - Expected: 403

**Where to look when it fails**

- Log lines 'SSO connection draft created', 'SSO connection removed', 'Single sign-on first sign-in provisioning failed', 'Unhandled SCIM error'.
- Sync events: sync.denied, sync.rejected, sync.failed, user.provisioned (scim-auth.ts, scim-route.ts, scim-provisioning-service.ts:787).
- Audit event types sso_*.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No configuration screen or documented flow outside the web** Affects: Owners on desktop, mobile, CLI, VS Code, Chrome. Evidence: No UI file found by search. Work needed: Decide whether admin configuration stays web-only and say so in product docs.
- **SCIM POST cannot create accounts or invitations; it only stages users** Affects: Enterprise admins expecting full provisioning. Evidence: doc: docs/compliance/directory-sync.md:50-70. Work needed: Product decision on invitation emails from SCIM.
- **Full list of SCIM error shapes not traced** Affects: Directory integrators. Evidence: scim-protocol.ts:63-77 only. Work needed: Trace each ScimError throw and document.

**Depends on**

- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- plan:enterprise
- mode:cloud
- surface:web
- table:sso_connections
- table:directory_sync_connections
- table:scim_provisioned_users
- table:organization_members

## Unknown

- Table name for SCIM tokens and the exact retention of sync events.
- How the OIDC client secret is stored after it is sent to the hosted provider.
- Whether SSO sign-in works on desktop, mobile, CLI, VS Code and Chrome sign-in flows; not traced.
- Complete SCIM error catalogue.
- Line numbers for the SAML IdP-initiated flag: the excerpt was read from line 140 of clerk-enterprise-connections.ts and the flag appears about line 158.
