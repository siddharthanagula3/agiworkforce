---
id: "F089-02"
type: "feature"
title: "Sessions and device sign-in credentials"
aliases: ["Session service", "Active sessions", "Log out of all devices", "Device registry", "Linked devices", "Device refresh token", "Refresh token family", "Developer token", "Heartbeat (S89.03, S89.04, S89.05)"]
area: "89 Account and access components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S89.03", "S89.04", "S89.05"]
depends_on: ["SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "table:device_registrations", "table:device_refresh_tokens", "table:device_refresh_token_families", "table:revoked_jwts", "api:GET /api/settings/sessions", "api:DELETE /api/settings/sessions", "api:GET /api/settings/devices", "api:POST /api/devices/heartbeat", "api:POST /api/auth/device/refresh", "F089-01", "F089-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F089-02 Sessions and device sign-in credentials

Lets a person list signed-in sessions and devices, end one or all of them, rename or unlink a device, and stop remote work on it. Command-line and editor sign-ins keep working through rotating refresh tokens; reusing a token revokes its whole family. Devices announce themselves by heartbeat.

Area: [89. Account and access components](README.md). Requirement items: [S89.03](../../10-requirements/capabilities/089-account-and-access-components.md#s8903), [S89.04](../../10-requirements/capabilities/089-account-and-access-components.md#s8904), [S89.05](../../10-requirements/capabilities/089-account-and-access-components.md#s8905).

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

**What it does.** Provides (1) a session list and revoke endpoints backed by the identity provider, (2) a device registry with rename, unlink and stop-remote-work, (3) a rotating device refresh token with replay detection, and (4) a heartbeat that records each client's surface, system, version and capabilities.

**Why it exists.** A person must be able to end a lost or unknown sign-in, and long-lived device sign-ins need credentials that die if copied.

**Who uses it.** Any signed-in person using Settings; the CLI, VS Code extension, Desktop, Mobile and Chrome extension through their heartbeats and refresh calls.

**Problems it solves**

- A stolen refresh token is detected on second use and the family is revoked (apps/web/app/api/auth/device/refresh/route.ts:153-176).
- A person can sign out everywhere, including device credentials, in one step (apps/web/app/api/settings/sessions/route.ts:189-250).
- Sessions older than the lifetime rule end even though the provider keeps renewing them (apps/web/app/api/settings/sessions/route.ts:96-140).

**Use cases**

- A person loses a phone and unlinks it as lost from Linked devices.
- A person clicks 'Log out of all devices' after a suspicious sign-in.
- A CLI session refreshes its access token every few days without a new browser sign-in.
- A team admin removes a member and that member's workspace device tokens die (see F089-06).

## 2. User experience

**Where to find it**

- Web: Settings, Security section has the rows 'Active sessions' (links to Account) and 'Log out of all devices' (apps/web/features/settings/sections/SecuritySection.tsx).
- Web: Settings, Account shows the session list; the Linked devices panel has buttons 'Rename' and 'Unlink' (apps/web/features/settings/components/LinkedDevicesPanel.tsx:321-356).
- Desktop: Settings, Account tab, 'Active sessions' with 'Log out of all devices' (apps/desktop/src/features/settings/tabs/Account/CloudAccountControls.tsx:164-178).
- Mobile: Account security screen, section 'Sessions' with 'Session timeout' and 'Log out of all devices' (apps/mobile/src/features/settings/account-security/index.tsx:679-754).
- CLI and extensions: heartbeat and refresh run in the background; no screen found.

**Before you start**

- Signed in with a session or a device bearer token.
- Revoke-all needs a CSRF token and a step-up check (apps/web/app/api/settings/sessions/route.ts:189-205).
- Heartbeat from the CLI runs only in Cloud mode (apps/cli/src/device_registry.rs:172-176, test at :290).

**Screens and controls**

- Log out of all devices: confirm title 'Log out of all devices?', body 'Every signed-in session on every device ends immediately, including this one. You will need to sign in again.', confirm button 'Log out everywhere' (apps/web/features/settings/sections/SecuritySection.tsx:82-85).
- Unlink: confirm title 'Unlink <device>?' with confirm button 'Unlink device' (apps/web/features/settings/components/LinkedDevicesPanel.tsx:333-337).
- Rename: inline field labelled 'New name for <device>' (LinkedDevicesPanel.tsx:270).
- Per-session revoke: DELETE /api/settings/sessions/{sessionId} (apps/web/app/api/settings/sessions/[sessionId]/route.ts).

**Journey**

1. Open Settings and the sessions or devices area.
2. The app calls GET /api/settings/sessions and GET /api/settings/devices.
3. The person picks a session or device and confirms.
4. The app sends the DELETE (or PATCH rename, or POST stop remote work) with a CSRF token.
5. The list refreshes; for revoke-all the current session also ends and the person signs in again.

**What the person sees and gets**

- Session list rows: id, status, device, os, osVersion, surface, browser, location, createdAt, lastActiveAt, expiresAt, absoluteExpiresAt, isCurrent; plus totalCount, returnedCount, truncated, endedByLifetime (apps/web/app/api/settings/sessions/route.ts:63-86, 178-186).
- Partial revoke: 502 'Ended N of M sessions, try again to finish.' (sessions/route.ts:224-240).
- Revoke-all success: 'All active sessions revoked' with revokedCount, deviceCredentialsRevoked, currentSessionRevoked.
- Rename: returns id and name; empty or over-long name gives 'A device name is 1 to 120 characters...'.
- Device refresh failures: invalid_grant 400, account_unavailable 403, terms_acceptance_required 403, age review 403 (apps/web/app/api/auth/device/refresh/route.ts).

**Settings**

- Mobile 'Session timeout' choices 15, 30, 60, 120, 480 minutes, default 60 (apps/mobile/src/features/settings/account-security/service.ts:17-20).
- Device 'Remote control' capability flag, switched off by stop-remote-work and back on only by pairing again (apps/web/app/api/devices/heartbeat/route.ts:21-23, 43).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Session list: one page of 100, with total count and truncated flag; sessions past the lifetime bounds are ended while listing and an audit event is written (apps/web/lib/server/session-revocation.ts:46-62; sessions/route.ts:96-176).
- Revoke all: rate limit, CSRF, step-up; ends every other session in batches of 10 with up to 3 attempts per session under provider rate limits, then the current session, then device refresh credentials and Ask-from-Siri tokens; emits all_sessions_revoked (sessions/route.ts:189-270; session-revocation.ts:20-27, 93-135).
- Single-session revoke route exists (sessions/[sessionId]/route.ts:73).
- Device list merges registrations, device-code sign-ins and legacy desktop and mobile rows, max 200, with presence and live-credential flags (apps/web/app/api/settings/devices/route.ts:141-246).
- Device rename, unlink (options lost, logoutAll) and stop remote work (apps/web/app/api/settings/devices/[deviceId]/route.ts:431-433).
- Refresh rotation inside one transaction with row lock; replay finishes the family as compromised, notifies the owner, writes a critical audit event (refresh/route.ts:153-176, 270-300).
- Refresh refuses with account_unavailable, terms, or age-review without destroying the family (refresh/route.ts:182-216).
- Developer access token lives 7 days; refresh token 30 days (apps/web/lib/server/developer-token.ts:11; apps/web/lib/server/device-refresh-token.ts:5).
- Heartbeat upsert keyed on user, surface, install id; first sighting sends a new-device notice (heartbeat/route.ts:24-100).
- Heartbeat clients exist on Desktop, Mobile, CLI, VS Code, Chrome and the web desktop-host (apps/desktop/src/services/deviceRegistryHeartbeat.ts; apps/mobile/src/features/device-registry/heartbeat.ts; apps/cli/src/device_registry.rs; apps/extension-vscode/src/features/device-registry/deviceHeartbeat.ts; apps/extension/src/features/cloud-bridge/deviceHeartbeat.ts).

**Incomplete**

- The first-draft claim that DELETE /api/settings/sessions revokes 'all other sessions' is wrong: it ends every session including the current one (sessions/route.ts:243-270).
- Refresh gate for terms only withholds accounts that never accepted, because no binding revision is set (apps/web/lib/server/terms.ts:20; see F089-04).
- Session list is capped at 100 rows; the remainder is only counted (session-revocation.ts:46-62).

**Present but disconnected or switched off**

- Device sign-in can be toggled in Settings (DeviceSignInToggle component exists); how it gates the refresh route was not traced (apps/web/features/settings/components/DeviceSignInToggle.tsx).

**Not available**

- A session list on the web Security section itself: it only links to Account (SecuritySection.tsx).
- Pairing a second device (S89.22) belongs to another feature and is not described here.

## 4. Required behaviour

**Established requirements**

- A session service lists a user's active sessions and revokes one, all others, or all. (source: brief S89.03)
- Device credentials use rotating refresh tokens with reuse detection, and can be revoked per device or all at once. (source: brief S89.04)
- A device registry records each signed-in client (surface, OS, version, capabilities, last seen) and lets the user rename or unlink it. (source: brief S89.05)
- Heartbeat never turns remote work back on by itself; only pairing again does. (source: apps/web/app/api/devices/heartbeat/route.ts:21-23)
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. GET /api/settings/sessions returns at most 100 sessions, a totalCount and truncated true when more exist.
2. DELETE /api/settings/sessions without CSRF or step-up is refused and ends nothing.
3. DELETE /api/settings/sessions ends all sessions including the current one and all device refresh credentials.
4. Using a refresh token twice returns invalid_grant the second time and every later token in that family also fails.
5. A heartbeat cannot set remote control back to true once stop-remote-work turned it off.
6. Renaming a device to an empty or 121-character name is refused with the 1 to 120 character message.
7. A provider 429 during revoke-all produces a 502 'try again to finish' message with counts.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web (the only surface not registering) shows as surface 'web' in the list [inferred from the comment in sessions/route.ts:63-70].
- Heartbeat is a Cloud-mode feature on the CLI; the other apps' gating by mode is unknown.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show a clear 'also signs this device out' note next to revoke-all on every app, as the confirm text does on web and desktop.
- [proposed] Trace heartbeat gating in Local mode on Desktop and Mobile and add a test like the CLI one.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET and DELETE /api/settings/sessions | `apps/web/app/api/settings/sessions/route.ts` | List sessions; revoke all. |
| endpoint | DELETE /api/settings/sessions/{sessionId} | `apps/web/app/api/settings/sessions/[sessionId]/route.ts` | Revoke one session. |
| service | session-revocation | `apps/web/lib/server/session-revocation.ts` | Listing, batch revoke, backoff, sweep of other sessions. |
| service | session-principal | `apps/web/app/api/settings/sessions/session-principal.ts` | Resolves db, user, current session for the settings routes. |
| endpoint | GET /api/settings/devices | `apps/web/app/api/settings/devices/route.ts` | Device list merged from registry, grants and legacy tables. |
| endpoint | PATCH, DELETE, POST /api/settings/devices/{deviceId} | `apps/web/app/api/settings/devices/[deviceId]/route.ts` | Rename, unlink, stop remote work. |
| endpoint | POST /api/devices/heartbeat | `apps/web/app/api/devices/heartbeat/route.ts` | Register or refresh a device. |
| endpoint | POST /api/auth/device/refresh | `apps/web/app/api/auth/device/refresh/route.ts` | Rotate the device refresh token. |
| service | refresh-token-family | `apps/web/lib/server/refresh-token-family.ts` | Lock, compromise and revoke families. |
| service | device-refresh-token | `apps/web/lib/server/device-refresh-token.ts` | Creates and hashes refresh tokens; 30 day lifetime. |
| service | developer-token | `apps/web/lib/server/developer-token.ts` | Issues, verifies and revokes access tokens (revoked_jwts). |
| service | device-credential-link | `apps/web/lib/server/device-credential-link.ts` | Ties a heartbeat to its credential family or provider session. |
| component | LinkedDevicesPanel | `apps/web/features/settings/components/LinkedDevicesPanel.tsx` | Web rename and unlink UI. |
| component | SecuritySection SessionsPanel | `apps/web/features/settings/sections/SecuritySection.tsx` | Web log-out-everywhere row. |
| component | CloudAccountControls | `apps/desktop/src/features/settings/tabs/Account/CloudAccountControls.tsx` | Desktop session list and revoke. |
| service | fetchCloudActiveSessions | `apps/desktop/src/api/cloudAccountSettings.ts` | Desktop client for sessions. |
| service | account-security service | `apps/mobile/src/features/settings/account-security/service.ts` | Mobile sessions client (lines 160-187). |
| service | deviceRegistryHeartbeat | `apps/desktop/src/services/deviceRegistryHeartbeat.ts` | Desktop heartbeat. |
| service | device_registry.rs | `apps/cli/src/device_registry.rs` | CLI heartbeat loop, Cloud mode only. |
| service | oauth.rs refresh | `apps/cli/src/oauth.rs` | CLI refresh call to /auth/device/refresh (line 229). |
| service | sys/account refresh | `apps/desktop/src-tauri/src/sys/account/mod.rs` | Desktop native refresh path constant (line 1169). |
| schema | device-registry contracts | `packages/contracts/cloud-contracts/src/device-registry.ts` | Heartbeat path, intervals, surfaces, presence. |
| table | device_registrations, device_refresh_tokens, device_refresh_token_families, revoked_jwts | `apps/web/app/api/devices/heartbeat/route.ts` | Tables written by heartbeat, refresh and revoke. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app calls the sessions or devices endpoint with its credential and CSRF token for writes. | device and our servers | apps/desktop/src/api/cloudAccountSettings.ts:338-380 |
| The server lists sessions from the identity provider and joins device_registrations to add OS and surface. | outside service | apps/web/app/api/settings/sessions/route.ts:143-176 (provider list), :42-61 (registry join) |
| Revoke-all checks rate limit, CSRF and step-up, ends other sessions through the provider in batches, then the current one, then revokes device refresh credentials and writes a security event. | our servers | apps/web/app/api/settings/sessions/route.ts:189-270 |
| A device sends a refresh token; the server hashes it, locks the family row, checks account status, terms and age review, inserts a new token, marks the old one used, and returns a new access token. | our servers | apps/web/app/api/auth/device/refresh/route.ts:107-260 |
| A used token presented again revokes the family, records compromise, notifies the owner and writes a critical audit event. | our servers | refresh/route.ts:153-176, 270-300 |
| A client sends a heartbeat every 45 seconds (Desktop) or 5 minutes (others); the server upserts the registration. | device and our servers | packages/contracts/cloud-contracts/src/device-registry.ts:6-21; heartbeat/route.ts:24-100 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Device registration (surface, install id, name, OS, version, capabilities, remote_enabled, last seen) | table device_registrations | Server; read by every app through the list | Row deleted on unlink; rename audit event device_renamed written. |
| Refresh tokens (hash only) and families | tables device_refresh_tokens, device_refresh_token_families | Server only; the raw token is held by the device | 30 day expiry; revoked_at and compromised_at kept. |
| Revoked access token ids | table revoked_jwts (jti, user_id, until_exp, reason) | Server only | Kept until the token's own expiry [inferred from until_exp]. |
| Session records | Identity provider (Clerk) | Provider side | Ended by revoke calls. |

**Models and providers.** No AI model takes part. The identity provider is an outside service for sessions. Device refresh and heartbeat do not call any inference provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; refresh needs a valid refresh token owned by an account that is not deleted or scheduled for deletion (refresh/route.ts:134-151). |
| Permissions | The caller must own the sessions and devices; workspace roles do not apply. Workspace-driven revocation is in F089-06. |
| Subscription | none found in the code |
| Limits and metering | Rate limits by name: settings-sessions-list, settings-sessions-revoke-all, settings-session-revoke, device-heartbeat, device-poll (route files). Values are configuration, unknown here. Devices list capped at 200; sessions page 100. |
| Feature flags | none found in the code for these routes; a Settings toggle DeviceSignInToggle exists (not traced). |
| Model compatibility | Not model-dependent. |
| Provider restrictions | Sessions are tied to the single identity provider. |
| Local mode | Server calls need Cloud reach. The CLI heartbeat is refused outside Cloud mode (apps/cli/src/device_registry.rs:172-176). Behaviour of Desktop and Mobile heartbeat in Local mode is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading/empty | Desktop shows 'Loading active sessions…' and an error 'Could not load your active sessions.' on failure. | apps/desktop/src/features/settings/tabs/Account/CloudAccountControls.tsx:104,193 |
| Truncated list | truncated true and totalCount returned when the account has over 100 sessions. | apps/web/lib/server/session-revocation.ts:46-62 |
| Provider rate limit | Waits the provider's Retry-After or backs off 500 ms doubling to 30 s, max 3 attempts, then reports failure. | apps/web/lib/server/session-revocation.ts:20-27, 76-90 |
| Session already gone (404) | Counted as ended, not failed. | session-revocation.ts:27, 108-113 |
| Replay | invalid_grant to the caller, family revoked, owner notified. | refresh/route.ts:270-300 |
| Terms or age review pending | 403; token withheld, family left intact so the device resumes after acceptance. | refresh/route.ts:182-200 |
| Token expired | Marked revoked and invalid_grant returned. | refresh/route.ts:177-181 |
| Step-up cancelled | Web shows no error when the step-up is cancelled. | apps/web/features/settings/sections/SecuritySection.tsx:78 |
| Offline | CLI heartbeat failure is logged at debug and retried by the loop; other apps unknown. | apps/cli/src/device_registry.rs:221 |
| Accessibility | Rename and unlink buttons carry aria-labels 'Rename <device>' and 'Unlink <device>'. | LinkedDevicesPanel.tsx:321-341 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/sessions/route.test.ts`: Session list and revoke-all route.
- `apps/web/app/api/settings/sessions/[sessionId]/route.test.ts`: Single-session revoke.
- `apps/web/lib/server/__tests__/session-revocation.test.ts`: Batch revoke and backoff.
- `apps/web/lib/server/__tests__/refresh-token-family.test.ts`: Family locking and compromise.
- `apps/web/app/api/auth/device/refresh/route.test.ts`: Rotation and replay.
- `apps/web/app/api/auth/device/refresh/terms-reacceptance.test.ts`: Terms gate on refresh.
- `apps/web/lib/server/developer-token.test.ts`: Access token issue and revoke.
- `apps/web/app/api/devices/heartbeat/route.test.ts`: Heartbeat upsert.
- `apps/web/app/api/settings/devices/__tests__/route.test.ts`: Device list.
- `apps/web/app/api/settings/devices/__tests__/route.stop-remote-work.test.ts`: Stop remote work.
- `apps/web/features/settings/sections/AccountSection.sessions.test.tsx`: Web session UI.
- `apps/web/db/neon/device-refresh-token-families-migration.test.ts`: Family table migration.

**Test scenarios**

- **Replay detection**
  1. Sign in a CLI device
  2. Call refresh once and keep the old token
  3. Call refresh again with the old token
  4. Call refresh with the new token
  - Expected: Second call returns invalid_grant; the third also fails; a device_credential_compromised notice and a refresh_family_compromised audit event exist.
- **Log out everywhere**
  1. Sign in on web and a CLI device
  2. Press 'Log out of all devices' and confirm with step-up
  3. Reload web and call the CLI
  - Expected: Both are signed out; response shows currentSessionRevoked true.
- **Stop remote work sticks**
  1. Register a device with remote control on
  2. POST stop remote work
  3. Send another heartbeat claiming remote control
  - Expected: remote control stays off until pairing again.
- **Rename limits**
  1. PATCH a device with a 121 character name
  - Expected: Validation error 'A device name is 1 to 120 characters...'.
- **Partial provider failure**
  1. Simulate provider 429 for some sessions in revoke-all
  - Expected: 502 with 'Ended N of M sessions, try again to finish.'.

**Where to look when it fails**

- Logs 'Device refresh credential replayed; family finished as compromised', 'Some non-current sessions could not be revoked', 'Device refresh withheld until current terms are accepted'.
- Audit events session_revoked, device_trust_revoked, device_renamed, refresh_family_compromised, all_sessions_revoked.
- Tables device_registrations, device_refresh_tokens, device_refresh_token_families, revoked_jwts.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **The brief and first draft describe revoke-all as ending other sessions; code ends all including this one.** Affects: Docs and testers; all apps. Evidence: apps/web/app/api/settings/sessions/route.ts:243-270. Work needed: State 'all sessions including this one' in the brief.
- **Heartbeat gating by mode on Desktop, Mobile, VS Code and Chrome not established.** Affects: Local mode users. Evidence: Only the CLI has an explicit Cloud-mode test (apps/cli/src/device_registry.rs:290). Work needed: Trace each client and add a test.
- **Web Security section links to Account instead of listing sessions.** Affects: Web users. Evidence: SecuritySection.tsx:111-120. Work needed: None required if intended; confirm.

**Depends on**

- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- table:device_registrations
- table:device_refresh_tokens
- table:device_refresh_token_families
- table:revoked_jwts
- api:GET /api/settings/sessions
- api:DELETE /api/settings/sessions
- api:GET /api/settings/devices
- api:POST /api/devices/heartbeat
- api:POST /api/auth/device/refresh
- F089-01
- F089-04

## Unknown

- Whether the Web desktop-host heartbeat (apps/web/features/desktop-host/lib/device-heartbeat.ts) runs in Local mode.
- How DeviceSignInToggle gates device refresh.
- Rate limit values for the named limiters.
- Mobile and other-app handling of a 502 partial revoke.
