---
id: "AREA-089"
type: "area"
title: "Account and access components"
features: ["F089-01", "F089-02", "F089-03", "F089-04", "F089-05", "F089-06", "F089-07", "F089-08", "F089-09", "F089-10", "F089-11", "F089-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 89. Account and access components

This area is the server side of "who you are and what you may touch". It maps each sign-in to one account, checks the account's state on every request, keeps track of signed-in sessions and devices, and lets a workspace admin manage members, roles, invitations, enterprise sign-in and service keys. It also covers pairing a phone or second device, account recovery, account export and deletion, and the rules that stop support staff from reading customer data without a recorded reason and a second approver. Without it, a locked, suspended or removed person could keep working, and there would be no audit trail of who was let in.

**Who uses it.** Every signed-in person (sign-in, account status, sessions, devices, profile, preferences, terms, pairing, personal API keys, export and deletion). Workspace owners and admins (members, roles, groups, invitations, workspace policy, SSO, SCIM, service principals, workspace deletion). Enterprise identity providers push users in through SCIM and SSO. Support staff use recovery and the support-access grant flow. Developers use personal API keys. The brief marks every item "platform done" and shows no per-app differences; the code confirms the server side only.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F089-01](F089-01-sign-in-and-account-standing.md) | Sign-in and account standing | n/a | n/a | n/a | n/a | n/a | n/a |
| [F089-02](F089-02-sessions-and-device-sign-in-credentials.md) | Sessions and device sign-in credentials | n/a | n/a | n/a | n/a | n/a | n/a |
| [F089-03](F089-03-account-recovery-through-support.md) | Account recovery through support | n/a | n/a | n/a | n/a | n/a | n/a |
| [F089-04](F089-04-profile-preferences-terms-and-consent.md) | Profile, preferences, terms and consent | n/a | n/a | n/a | n/a | n/a | n/a |
| [F089-05](F089-05-workspaces-personal-and-team.md) | Workspaces (personal and team) | n/a | n/a | n/a | n/a | n/a | n/a |
| [F089-06](F089-06-members-invitations-groups-and-roles.md) | Members, invitations, groups and roles | n/a | n/a | n/a | n/a | n/a | n/a |
| [F089-07](F089-07-workspace-policy-enforcement.md) | Workspace policy enforcement | n/a | n/a | n/a | n/a | n/a | n/a |
| [F089-08](F089-08-enterprise-sign-in-and-directory-sync.md) | Enterprise sign-in and directory sync | n/a | n/a | n/a | n/a | n/a | n/a |
| [F089-09](F089-09-service-accounts-and-api-keys.md) | Service accounts and API keys | n/a | n/a | n/a | n/a | n/a | n/a |
| [F089-10](F089-10-pairing-a-second-device.md) | Pairing a second device | n/a | n/a | n/a | n/a | n/a | n/a |
| [F089-11](F089-11-deleting-and-exporting-account-data.md) | Deleting and exporting account data | n/a | n/a | n/a | n/a | n/a | n/a |
| [F089-12](F089-12-support-staff-access-to-customer-data.md) | Support staff access to customer data | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/089-account-and-access-components.md](../../10-requirements/capabilities/089-account-and-access-components.md).

## How this area works in the code

1. **Identity check and account lookup.** A request's identity is verified by the one identity provider the app selects. The verified subject is looked up (cache first, then the database) and mapped to an AGI account id. A new identity link is created when none exists. (`apps/web/lib/server/identity.ts:24-35`, `packages/platform/identity/src/factory.ts:41-48`, `apps/web/lib/server/identity-account.ts:180-212`)
2. **Account state gate.** Every API request calls the account check. Locked, recovering, suspended, banned, deleted and scheduled-deletion states are decided in one function, and a denial carries a reason and a recovery path. (`apps/web/lib/api-auth.ts:205-216`, `apps/web/lib/auth/account-status.ts:47-100`)
3. **Workspace selection.** The active workspace is taken from a request header if present, otherwise from a cache, otherwise from the saved setting. A header that is malformed or names a workspace the person is not in is refused. (`apps/web/lib/services/active-workspace-service.ts:63-84`, `apps/web/lib/services/active-workspace-service.ts:196-214`)
4. **Permission and policy checks.** A member's permissions are read from their role and group roles. A grant cannot exceed the actor's own permissions. Each workspace policy is read with a retry, and an unreadable policy denies the request. (`apps/web/lib/services/organization-permission-service.ts:95-119`, `apps/web/lib/services/organization-role-service.ts:86-106`, `apps/web/lib/services/organization-policy-gate.ts:190-224`)
5. **Member removal and cut-off.** A removal deletes the membership row first, then revokes the member's workspace-issued sessions, device refresh families, mobile intent tokens, and API keys. Failures are returned as warnings and recorded in the audit event. (`apps/web/app/api/settings/team/[memberId]/route.ts:44-69`, `apps/web/lib/services/deprovision-service.ts:18-43`, `apps/web/lib/services/deprovision-service.ts:65-116`, `apps/web/lib/services/deprovision-service.ts:142-157`)
6. **Device sign-in refresh.** A device exchanges its refresh token for a new one. Terms and age checks can withhold the new token. A replayed token marks the whole family compromised and revokes it. (`apps/web/app/api/auth/device/refresh/route.ts:257-284`, `apps/web/app/api/auth/device/refresh/route.ts:305-328`, `apps/web/lib/server/refresh-token-family.ts:91-116`)
7. **Device registry.** A device heartbeat upserts its row (surface, OS, version, capabilities) and never re-enables remote work. The settings list reads the registry with a live-credential flag; rename and unlink are separate routes. (`apps/web/app/api/devices/heartbeat/route.ts:21-40`, `apps/web/app/api/settings/devices/route.ts:66-84`, `apps/web/app/api/settings/devices/[deviceId]/route.ts:306-330`, `apps/web/app/api/settings/devices/[deviceId]/route.ts:431-433`)
8. **Pairing through the relay.** The web server checks the person's remote-control standing and the relay settings, then asks the relay for a pairing code. The phone claims it, and the relay checks the account id before rotating credentials. (`apps/web/app/api/pair/initiate/route.ts:47-80`, `apps/web/app/api/pair/initiate/route.ts:171`, `services/signaling-server/src/db.ts:170-177`)
9. **Erasure and retention.** Account erasure removes stored files and backup copies, then leaves a tombstone. Organization erasure stops for an active legal hold or unreadable billing state. A deletion manifest states the path for each store. (`apps/web/lib/server/account-erasure.ts:965`, `apps/web/lib/server/organization-erasure.ts:285-306`, `apps/web/lib/services/deletion-manifest.ts:425-459`)
10. **Support access grant.** A staff request creates a pending grant with a reason and a ticket reference. A second operator approves it with a time window capped at eight hours. Each read is recorded in the workspace trail and in a hash-chained support log. (`apps/web/app/api/admin/support-access/route.ts:141-190`, `apps/web/lib/server/support-access-service.ts:433-516`, `apps/web/lib/server/support-access-service.ts:342-369`, `apps/web/lib/server/admin-data-access.ts:24-50`)

## Files to know

| File | Role |
|---|---|
| `apps/web/lib/api-auth.ts` | Runs the account-state check and workspace binding on each authenticated request. |
| `apps/web/lib/auth/account-status.ts` | Single decision table for locked, recovering, suspended, deleted and scheduled-deletion accounts. |
| `apps/web/lib/server/identity-account.ts` | Maps a verified sign-in to an AGI account id, with cache and identity-link creation. |
| `packages/platform/identity/src/factory.ts` | Chooses the identity provider from the environment; only the hosted provider is implemented. |
| `apps/web/lib/services/deprovision-service.ts` | Cuts off a removed member's sessions, device tokens, API keys and shared connectors. |
| `apps/web/app/api/settings/team/[memberId]/route.ts` | Remove-member and change-role endpoints for team members. |
| `apps/web/lib/services/organization-policy-gate.ts` | Applies workspace policy (MFA, IP, analytics, retention, billing hold) and denies when a policy cannot be read. |
| `apps/web/app/api/auth/device/refresh/route.ts` | Rotating device refresh with replay detection and terms and age gating. |
| `apps/web/app/api/pair/initiate/route.ts` | Starts a pairing through the relay after standing and configuration checks. |
| `apps/web/lib/server/account-erasure.ts` | Erases account data and stored files, including backup copies. |
| `apps/web/lib/server/support-access-service.ts` | Support access grants: request, second-operator approval, time window, hash-chained trail. |

## What is stored

- Profile row: display name, avatar, accepted Terms version, acceptance time and surface, account status: Neon database table public.profiles (apps/web/lib/support/tickets/recovery.ts:40-42; apps/web/lib/server/terms.ts:56-58; apps/web/lib/server/user-identity.ts:96-98)
- Per-person settings, one JSON object with namespaces (identity fields, workspace selection, preferences): Database table public.user_settings, column settings (apps/web/lib/server/user-identity.ts:50; apps/web/lib/services/active-workspace-service.ts:196-210)
- Identity link from the provider subject to the AGI account: Database table named in a query constant in apps/web/lib/server/identity-account.ts (table name not opened)
- Device rows: surface, OS, versions, capabilities, last seen, remote-work flag, credential family id: Database table public.device_registrations (apps/web/app/api/devices/heartbeat/route.ts:24-40; settings/devices route.ts:67-81)
- Device refresh tokens and token families, with revoked, used and compromised markers: Database tables device_refresh_tokens and device_refresh_token_families (apps/web/lib/server/refresh-token-family.ts:95-124)
- Revoked developer tokens by id until expiry: Database table revoked_jwts (apps/web/lib/server/developer-token.ts:136-142)
- Personal API keys: name, scopes, hash, short prefix, expiry, project id: Database table api_keys (apps/web/lib/services/api-key-service.ts:216-217)
- Organization and membership: members, roles, group roles, seats, owner, invitations (token hash only, status, expiry): Database tables organizations, organization_members, organization_roles, organization_group_roles (apps/web/lib/services/organization-role-service.ts:75-80; organization-seat-service.ts:37-43); invitation columns at organization-invitation-service.ts:44-46
- Consent decisions, with the subject email stored only as a hash: Database table consent_records (apps/web/lib/server/consent-records.ts:95-99)
- Support access grants and a hash-chained event log: Database tables used by support-access-service.ts (table names not all opened); hash fields at support-access-service.ts:342-369
- Pairing sessions with account id in metadata, and expiry: Signaling server database table signaling_sessions (services/signaling-server/src/db.ts:157-177)
- Audit events and identity security events: Via recordAuditEvent (apps/web/app/api/settings/team/[memberId]/route.ts:71-87) and emitIdentitySecurityEvent (recovery.ts:51-57)
- Sessions and sign-in credentials: Held by the external hosted identity provider, not in this repository (apps/web/lib/server/session-revocation.ts:137-143 calls it)
- Browser or device storage for this area: Not established in the files opened

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_IDENTITY_PROVIDER**: Chooses the identity provider. Only the hosted provider exists; any other value throws a configuration error. (packages/platform/identity/src/factory.ts:9, 18-28, 41-48)
- **SIGNALING_HTTP_URL and SIGNALING_INTERNAL_SECRET**: Both required for pairing; without them pairing returns 503. A localhost URL is allowed only in development. (apps/web/app/api/pair/initiate/route.ts:69-80)
- **Developer mode check (NODE_ENV)**: Allows a non-HTTPS relay URL in development only. (apps/web/app/api/pair/initiate/route.ts:72)
- **MAX_ACTIVE_API_KEYS**: Caps active personal API keys at 20. (apps/web/app/api/settings/api-keys/route.ts:26)
- **DEFAULT_SUPPORT_ACCESS_TTL_MS and MAX_SUPPORT_ACCESS_TTL_MS**: Default support grant window one hour, maximum eight hours. (apps/web/lib/server/support-access-service.ts:58-59)
- **CURRENT_TERMS_VERSION**: The Terms version a person must have accepted; a change forces re-acceptance on every gated page and device refresh. (apps/web/lib/server/terms.ts:9)
- **Workspace policy (MFA, IP allow-list, product analytics, retention, billing hold)**: Set per workspace by admins; applied to every request scoped to that workspace. (apps/web/lib/services/organization-policy-gate.ts:190-224, 498-513)
- **Seat count**: Licensed seats limit how many members a workspace can hold. (apps/web/lib/services/organization-seat-service.ts:33-54)
- **jit_provisioning_enabled and jit_default_role on an SSO connection**: Whether a verified-domain sign-in creates a member, and at which role. (apps/web/lib/server/sso/jit-provisioning.ts:49-57)
- **Remote-work flag on a device**: Set by pairing, cleared by stop-remote-work; a heartbeat never sets it. (apps/web/app/api/devices/heartbeat/route.ts:21-23; apps/web/app/api/settings/devices/[deviceId]/route.ts:433)
- **ORGANIZATION_DELETION_COOLING_PERIOD_DAYS**: Days between a workspace deletion request and its erasure; the value was not opened. (apps/web/app/api/settings/organization/route.ts:573-575)
- **Plan tier and entitlement**: Plan name, billing owner, and seat type are reported to the client; feature gating by plan was not traced in full. (apps/web/app/api/me/route.ts:305-324)

## Shared between apps

Shared across apps: the identity adapter package (packages/platform/identity, used by the web server); the cloud contracts package (@agiworkforce/cloud-contracts) for device heartbeat and rename request shapes (apps/web/app/api/devices/heartbeat/route.ts:5-8; apps/web/app/api/settings/devices/[deviceId]/route.ts:5); and the pairing contract file packages/contracts/types/src/pairing.ts, which its comment says is shared by desktop and mobile. Separate per app: the mobile pairing store (apps/mobile/stores/connectionStore.ts), the CLI remote-control module (apps/cli/src/remote_control/mod.rs), and the signaling relay, which is its own deployable (services/signaling-server) and repeats some constants (deletion-manifest.ts:425-431). The server services in apps/web/lib are used only by the web API routes.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The Should says blocks use until current Terms are accepted, but mustAcceptTerms returns false when the acceptance read fails and logs 'letting the account through'. A database fault therefore admits an account that may not have accepted current Terms. (apps/web/lib/server/terms.ts:148-159)
- The Should lists four identity adapters (password, social, passkey, SSO) behind one interface. The factory has one case, the hosted provider; password is a method on the interface, and no passkey or social adapter was found. (packages/platform/identity/src/factory.ts:45-48; packages/platform/identity/src/types.ts:105, 233-234)
- Brief line reference for S89.06 cites team/[memberId]/route.ts:301 for the remove route, but the file has 162 lines; the DELETE and PATCH exports are at lines 156-157. (apps/web/app/api/settings/team/[memberId]/route.ts:156-157)
- Brief line reference for S89.22 cites packages/contracts/types/src/pairing.ts:189, but the file has 124 lines. The code-length constants are at lines 50-60. (packages/contracts/types/src/pairing.ts:50-60)
- Brief item S89.10 says the organization service transfers ownership, but the organization route file has no transfer handler; transfer is a separate route. (apps/web/app/api/settings/organization/route.ts:579-582; apps/web/app/api/settings/organization/transfer-ownership/route.ts:132)
- Account recovery does not restore access for an account with advanced account security on; the owner must use a recovery key. This is a deliberate limit that the brief's Should ('regain access when password, email or second factor is lost') does not mention. (apps/web/lib/support/tickets/recovery.ts:122-126)
- Session listing stops after a fixed number of pages, and the code notes that more sessions may still be live when the limit is reached. (apps/web/lib/services/deprovision-service.ts:60-61, 98-100)

## Not established

- Whether the hosted identity provider implements password, social, passkey and SSO sign-in as the Should describes; those flows live outside this repository.
- Whether recovery verifies the requester automatically; the code shows a staff person acts on the ticket, but the staff check steps were not read.
- The table names used in the identity-link and support-access queries were not all opened, and row-level security was not checked.
- The value of ORGANIZATION_DELETION_COOLING_PERIOD_DAYS and the exact plan gates for seats and workspace features were not established.
- The bodies of the group, role-mapping, SCIM auth and token service routes were only partly read; the error shapes returned on failure were not traced.
- Per-app behaviour: the brief gives no per-app status beyond 'platform done', and desktop, Chrome extension and VS Code extension code for these features was not opened.
- The pair/claim route, the signaling relay's claim logic and the CLI remote-control flow were only partly read.
- The user-facing delete-account and export routes were located but not read in full, so their interaction with the erasure coordinator is unverified.
- No builds, tests or servers were run, as the task was read-only; claims are from code reading only.
