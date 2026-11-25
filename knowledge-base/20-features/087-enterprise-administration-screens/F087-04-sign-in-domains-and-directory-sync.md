---
id: "F087-04"
type: "feature"
title: "Sign-in, domains and directory sync"
aliases: ["Identity", "Workspace > People > Identity", "SSO", "Single sign-on", "Domain verification", "Directory sync (SCIM 2.0)", "SCIM provisioning", "Add connection", "Verify domain", "S87.09", "S87.10", "S87.11", "SSOPanel", "DirectorySyncAdminPage"]
area: "87 Enterprise administration screens"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "missing", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S87.09", "S87.10", "S87.11"]
depends_on: ["surface:web", "surface:desktop", "plan:enterprise", "api:POST /api/admin/sso", "api:POST /api/admin/sso/verify-domain", "api:POST /api/admin/directory-sync/tokens", "api:GET /api/scim/v2/Users", "table:sso_connections", "table:scim_tokens", "table:directory_sync_connections", "table:scim_provisioned_users", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "F087-02", "F087-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F087-04 Sign-in, domains and directory sync

On the Identity page an owner claims a company email domain with a DNS TXT record, then sets up a SAML or OIDC single sign-on connection for it, and connects an identity provider over SCIM so members are created, updated and removed automatically. SSO and SCIM need the Enterprise plan. Requiring SSO for everyone is not available.

Area: [87. Enterprise administration screens](README.md). Requirement items: [S87.09](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8709), [S87.10](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8710), [S87.11](../../10-requirements/capabilities/087-enterprise-administration-screens.md#s8711).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates an SSO connection for a domain and issues a verification challenge; verifies ownership by looking up a TXT record; activates the connection through the sign-in service (Clerk) only after the domain is verified; creates first-sign-in (JIT) members for verified domains; lets an admin add a directory sync connection, mint SCIM bearer tokens and map groups to roles; and serves SCIM Users and Groups to the provider.

**Why it exists.** Companies want staff to sign in with their own identity provider and want joiners and leavers handled by their directory, not by hand.

**Who uses it.** Workspace owners (SSO, domain) and owners/admins (directory sync) on Enterprise.

**Problems it solves**

- Proving a company controls a domain before routing sign-in for it.
- Manual onboarding and offboarding.
- Stale access after someone leaves the company.

**Use cases**

- Owner adds company domain, publishes the TXT record, verifies, and activates SAML.
- Admin connects an identity provider, copies the token once.
- Provider disables a user; membership, tokens and keys end.
- New staff sign in through SSO and join as a default role (JIT).

## 2. User experience

**Where to find it**

- Web: console 'People' > 'Identity' (/workspace/identity), hint 'SSO, domains, SCIM provisioning' (WorkspaceConsoleNav.tsx:67-72; identity/page.tsx:13-24). Panels: SSO panel, 'Directory sync (SCIM 2.0)', Service principals (WorkspaceIdentityPanels.tsx:70-75).
- Desktop: hosted web pages [inferred].
- Mobile, CLI, VS Code, Chrome: not available.

**Before you start**

- Enterprise plan for SSO and SCIM (sso-access.ts:20-22; scim-auth.ts:113).
- Owner role to create, verify or delete SSO connections (sso/route.ts:208-214; verify-domain/route.ts:65).
- Owner or admin for directory sync (directory-sync-access.ts:65).
- Access to DNS for the domain and to the identity provider.

**Screens and controls**

- SSO panel: 'Add connection' with fields 'Email domain', 'Protocol', 'Display name', 'IdP metadata URL' or 'OIDC discovery URL' and 'OIDC client ID'; 'OIDC client secret' (SSOPanel.tsx:600-762).
- Status labels 'Domain not verified', 'Domain verified', 'Ready to activate', 'Active' (SSOPanel.tsx:33-50).
- DNS record rows 'Record type', 'Record name', 'Record value' and buttons 'Verify domain' and 'Reissue challenge' (SSOPanel.tsx:409-481).
- Service provider rows 'ACS URL', 'SP entity ID', 'SP metadata URL'.
- 'Directory sync (SCIM 2.0)' page: SCIM base URL, 'Connections', 'SCIM tokens', 'Group role mapping', 'Recent IdP activity' (DirectorySyncAdminPage.tsx:348-661).
- Notice 'Not yet available: Requiring SSO' (WorkspaceIdentityPanels.tsx:92).

**Journey**

1. Open Identity, press 'Add connection', enter domain, protocol and provider details.
2. Copy the DNS TXT record shown and publish it at your DNS host.
3. Press 'Verify domain'. If it fails, read the reason; wait for DNS and retry, or 'Reissue challenge' if expired.
4. Activate the connection so sign-in is routed for that domain.
5. Under Directory sync add a connection, create a token (name, optional expiry) and copy it once into the identity provider.
6. Map directory groups to roles; watch 'Recent IdP activity'.

**What the person sees and gets**

- Verify failure messages: record not found, mismatched value, challenge expired, lookup failed (verify-domain/route.ts:131-156).
- Success: 'verified' with next step configure and activate.
- Token shown once on creation.
- Notice that removing a user at the provider ends their membership, tokens, keys and sessions (WorkspaceIdentityPanels.tsx:79-84).

**Settings**

- Challenge lifetime 7 days (domain-verification.ts:10).
- JIT default role (member or viewer) and the on/off flag are stored on the connection (jit-provisioning.ts:11,41-58); where they are edited was not found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Domain verification with expiry, constant-time compare, distinct reasons (domain-verification.ts:88-132).
- Already-verified connection returns success without re-checking; no challenge returns 409 NO_CHALLENGE (verify-domain/route.ts:112-128).
- Activation refused until the domain is verified (sso/[id]/route.ts:283-290).
- JIT membership only for active, verified connections with JIT enabled and a matching email domain; seat shortage is refused and audited (jit-provisioning.ts:50-60,108-126).
- Directory connection create, token mint (name, optional future expiry, audit event) (directory-sync/route.ts:75-200; tokens/route.ts:52-130).
- SCIM requests need a valid token, an unlocked tenant, an active connection, a token issuer who still administers the workspace, and Enterprise (scim-auth.ts:44-120).
- Rejected or failed SCIM requests are logged as sync events (scim-route.ts:30-56).

**Incomplete**

- Requiring SSO is not available: an active connection adds a route and members with passwords can still use them (WorkspaceIdentityPanels.tsx:92-95).
- Group-scoped sharing and budgets from directory groups are not available (WorkspaceIdentityPanels.tsx:96-99).
- Sign-in routing by domain is performed by the outside sign-in service after activation; the routing itself was not read.

**Present but disconnected or switched off**

- Connections stay dormant ('Ready to activate') until activated (SSOPanel.tsx:43-46).

**Not available**

- CLI, mobile, VS Code, Chrome: no screens. Mobile brief status n/a.

## 4. Required behaviour

**Established requirements**

- An administrator claims a company domain, publishes a DNS TXT challenge, and the product verifies ownership before routing sign-in for that domain. (source: S87.09 Should)
- A workspace owner configures a SAML or OIDC connection for a verified domain, and members on that domain sign in through the identity provider. (source: S87.10 Should)
- An administrator connects an identity provider over SCIM (connection and bearer token), and the provider creates, updates and deprovisions members. (source: S87.11 Should)
- SSO/SCIM are part of the enterprise path. (source: docs/product/commercial.md:131-141)

**Acceptance criteria**

1. Verify with no record returns 409 reason no_record; with a different token returns token_mismatch.
2. Verify on a verified connection returns verified true without a DNS lookup.
3. Activating an unverified connection returns 409.
4. A user whose email domain differs from the connection domain is not auto-joined.
5. A SCIM call with a revoked token returns 401; with a token whose issuer left returns 403.
6. A SCIM call on a non-Enterprise workspace returns 403.
7. Deactivating a user via SCIM removes the membership and revokes credentials.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Sign-in routing is delegated to the sign-in service and works only if its connection is active [inferred from sso/[id]/route.ts:281-345].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add 'Require SSO' enforcement with an owner break-glass path.
- [proposed] Show JIT role settings on the Identity page if missing.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Identity page | `apps/web/app/workspace/identity/page.tsx` | Console page. |
| component | WorkspaceIdentityPanels | `apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx` | Combines SSO, directory sync and service principals. |
| component | SSOPanel | `apps/web/features/settings/sections/team/SSOPanel.tsx` | SSO and domain UI. |
| component | DirectorySyncAdminPage | `apps/web/features/admin/pages/DirectorySyncAdminPage.tsx` | SCIM connections, tokens, mapping, activity. |
| endpoint | /api/admin/sso | `apps/web/app/api/admin/sso/route.ts` | List, create, delete SSO connections. |
| endpoint | /api/admin/sso/[id] | `apps/web/app/api/admin/sso/[id]/route.ts` | Update and activate with verification guard. |
| endpoint | /api/admin/sso/verify-domain | `apps/web/app/api/admin/sso/verify-domain/route.ts` | POST verify, PUT reissue challenge. |
| service | domain-verification | `apps/web/lib/server/sso/domain-verification.ts` | Challenge token, DNS TXT lookup. |
| service | sso-route-guard and sso-access | `apps/web/lib/server/sso/sso-route-guard.ts` | Role and Enterprise checks. |
| service | clerk-enterprise-connections | `apps/web/lib/server/sso/clerk-enterprise-connections.ts` | Creates and toggles the connection at the outside sign-in service. |
| service | jit-provisioning | `apps/web/lib/server/sso/jit-provisioning.ts` | First sign-in membership. |
| service | idp-metadata | `apps/web/lib/server/sso/idp-metadata.ts` | Safe URL and metadata checks. |
| endpoint | /api/admin/directory-sync | `apps/web/app/api/admin/directory-sync/route.ts` | Directory connections. |
| endpoint | /api/admin/directory-sync/tokens | `apps/web/app/api/admin/directory-sync/tokens/route.ts` | Mint, list SCIM tokens; [tokenId] revokes. |
| service | directory-sync-access | `apps/web/app/api/admin/directory-sync/directory-sync-access.ts` | Owner/admin and Enterprise gate. |
| endpoint | SCIM Users | `apps/web/app/api/scim/v2/Users/route.ts` | Provider creates and lists users. |
| endpoint | SCIM Groups | `apps/web/app/api/scim/v2/Groups/route.ts` | Provider syncs groups. |
| service | scim-auth | `apps/web/lib/server/scim/scim-auth.ts` | Bearer token, lockdown, issuer and plan checks. |
| service | scim-route | `apps/web/lib/server/scim/scim-route.ts` | withScim wrapper, body limit, event recording. |
| service | scim-provisioning-service | `apps/web/lib/server/scim/scim-provisioning-service.ts` | User and group writes, membership grant and revoke. |
| table | sso_connections | `apps/web/db/neon/0204_sso_jit_provisioning.sql` | Connection, verification token, JIT settings. |
| table | directory_sync_connections / scim_tokens / scim_provisioned_users / scim_groups / directory_sync_events | `apps/web/db/neon/0084_scim_provisioning.sql` | SCIM storage. |
| service | deprovision-service | `apps/web/lib/services/deprovision-service.ts` | Credential revocation after removal. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Owner creates a connection; input is validated, URLs checked, a challenge token with expiry is stored. | our servers | apps/web/app/api/admin/sso/route.ts:175-264 |
| Owner publishes the TXT record at their DNS host. | outside service | SSOPanel.tsx:409-420 |
| Verify: the server asks DNS for the TXT record, compares in constant time, and stamps domain_verified_at. | our servers | verify-domain/route.ts:131-210; domain-verification.ts:88-132 |
| Activation registers or toggles the connection at the outside sign-in service. | outside service | apps/web/app/api/admin/sso/[id]/route.ts:300-345 |
| A first sign-in through the provider triggers JIT membership if active and verified. | our servers | jit-provisioning.ts:39-100 |
| Admin mints a SCIM token (shown once); the provider sends SCIM calls with it; every call is authenticated and checked. | our servers | tokens/route.ts:52-130; scim-auth.ts:44-120 |
| Provider sends the user inactive or deletes it; membership is deleted (never an owner) and credentials revoked. | our servers | scim-provisioning-service.ts:518-533,777-782 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| SSO connection incl. verification token and verified time | table sso_connections | Mirrored to the sign-in service on activation | DELETE deactivates, hard delete optional (sso/route.ts:308-373) |
| SCIM token (hash and prefix; raw token shown once) | table scim_tokens | Server only | Revocable; optional expiry |
| Provisioned users, groups and sync events | tables scim_provisioned_users, scim_groups, directory_sync_events | From the provider | unknown |

**Models and providers.** No AI model takes part. Outside services: the customer's DNS, the sign-in service (Clerk) and the customer's identity provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in owner or admin of an Enterprise workspace; the provider authenticates with a SCIM bearer token. |
| Permissions | SSO create, verify, delete: owner only; SSO list: owner or admin (sso/route.ts:121-124; verify-domain/route.ts:65). Directory sync: owner or admin (directory-sync-access.ts:65). |
| Subscription | Enterprise only (billing-catalog.ts:363 enterprise_controls). Re-checked on every SCIM request (scim-auth.ts:113-130). |
| Limits and metering | Rate limits 'api-key-create' on verify, 'scim' and 'scim-token-mint'; SCIM body max 256 KiB (scim-route.ts:66). |
| Feature flags | A tenant lockdown flag makes SCIM refuse (scim-auth.ts:62-68). |
| Model compatibility | none found in the code |
| Provider restrictions | Directory providers accepted: okta, azure_ad, google, onelogin, generic_scim (directory-sync/route.ts:19). |
| Local mode | Not applicable. Sign-in and provisioning are cloud features; Local inference needs neither. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Domain not verified | Status label and instructions; sign-in not routed. | SSOPanel.tsx:35-38 |
| DNS lookup fails | 503 with message that it is a resolver problem; retry. | verify-domain/route.ts:153-156 |
| Challenge expired | 409 with reissue instruction; UI offers 'Reissue this domain challenge?' confirm. | verify-domain/route.ts:131-150; SSOPanel.tsx:488-500 |
| Domain already verified by another workspace | 409 message. | verify-domain/route.ts:182-190 |
| Challenge replaced mid-check | 409 CHALLENGE_REPLACED. | verify-domain/route.ts:215-230 |
| No seat on first sign-in | JIT refused, audit sso_jit_membership_refused. | jit-provisioning.ts:108-126 |
| SCIM issuer left | 403 'Mint a new token.' | scim-auth.ts:105-109 |
| Connection disabled | 403 'This directory sync connection is disabled'. | scim-auth.ts:82-88 |
| Empty list | 'No directory sync connection yet.' | DirectorySyncAdminPage.tsx:422 |
| Offline | not handled in the code beyond error messages. | searched SSOPanel.tsx and DirectorySyncAdminPage.tsx; no offline handling found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/sso/__tests__/domain-verification.test.ts`: Challenge and DNS check.
- `apps/web/app/api/admin/sso/__tests__/verify-domain.challenge-expiry.test.ts`: Expiry on verify.
- `apps/web/app/api/admin/sso/__tests__/verify-domain.operational-failure.test.ts`: Lookup failure.
- `apps/web/app/api/admin/sso/__tests__/route.entitlement.test.ts`: Enterprise gate.
- `apps/web/app/api/admin/sso/__tests__/route.roundtrip.test.ts`: Create and read.
- `apps/web/app/api/admin/sso/__tests__/route.audit-events.test.ts`: Audit events.
- `apps/web/app/api/admin/sso/__tests__/route.hostile-metadata.test.ts`: Unsafe metadata.
- `apps/web/lib/server/sso/__tests__/jit-provisioning.test.ts`: First sign-in membership.
- `apps/web/app/api/scim/v2/__tests__/scim-routes.test.ts`: SCIM routes.
- `apps/web/app/api/scim/v2/__tests__/scim-every-handler-gated.test.ts`: Every SCIM handler is gated.
- `apps/web/lib/server/scim/__tests__/scim-token-service.test.ts`: Token service.
- `apps/web/app/api/admin/directory-sync/__tests__/route.entitlement.test.ts`: Directory sync gate.
- `apps/web/features/settings/sections/team/SSOPanel.test.tsx`: SSO panel.
- `apps/web/features/admin/pages/DirectorySyncAdminPage.test.tsx`: SCIM admin page.
- `apps/web/features/workspace-console/components/__tests__/WorkspaceIdentityPanels.test.tsx`: Identity page.

**Test scenarios**

- **Verify with the right record**
  1. Add a domain, publish the TXT record, press Verify domain.
  - Expected: Status becomes Domain verified.
- **Wrong value**
  1. Publish a TXT with a different token.
  - Expected: 409 token_mismatch message.
- **Activation guard**
  1. Try to activate before verifying.
  - Expected: 409 telling you to verify first.
- **Deprovision**
  1. Provision a user over SCIM, give them a device token, send active false.
  - Expected: Membership removed, credentials revoked, sync event recorded.
- **Non-Enterprise**
  1. Call SCIM Users with a valid token on a Team workspace.
  - Expected: 403 requires Enterprise.
- **JIT scope**
  1. Sign in via SSO with an email on another domain.
  - Expected: No membership created.

**Where to look when it fails**

- Table directory_sync_events and the 'Recent IdP activity' panel.
- Security events sso-domain-verification-failed, sso-domain-verified.
- Log 'SCIM request refused: organization is not entitled'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/087-enterprise-administration-screens.md](../../70-qa/test-plans/web/087-enterprise-administration-screens.md)
- Desktop: [70-qa/test-plans/desktop/087-enterprise-administration-screens.md](../../70-qa/test-plans/desktop/087-enterprise-administration-screens.md)

## 10. Gaps and dependencies

- **Requiring SSO is not available.** Affects: Enterprise admins. Evidence: WorkspaceIdentityPanels.tsx:92-95. Work needed: Server rule that refuses non-SSO sign-in for verified domains.
- **Sign-in routing by domain not read in repository code; relies on outside service.** Affects: SSO members. Evidence: sso/[id]/route.ts:300-345 only registers the connection. Work needed: Confirm routing behaviour by a live test.
- **No CLI or mobile surface.** Affects: CLI, mobile. Evidence: no references. Work needed: Product decision.
- **JIT role setting editing not located.** Affects: Admins. Evidence: jit-provisioning.ts:11 field exists; UI not found. Work needed: Locate or add the control.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- plan:enterprise
- api:POST /api/admin/sso
- api:POST /api/admin/sso/verify-domain
- api:POST /api/admin/directory-sync/tokens
- api:GET /api/scim/v2/Users
- table:sso_connections
- table:scim_tokens
- table:directory_sync_connections
- table:scim_provisioned_users
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- F087-02
- F087-03

## Unknown

- Where JIT default role and enable flag are set in the UI.
- How the sign-in service routes a domain after activation.
- Retention of SCIM events.
- Test assertions were not opened.
- Whether Electron exposes the Identity page.
