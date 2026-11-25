---
id: "F103-01"
type: "feature"
title: "Account and sign-in identity"
aliases: ["Accounts and authentication identities (S103.01)", "Sessions and devices (S103.02)", "profiles", "identities", "device registry", "Linked devices", "device_registrations", "device_refresh_tokens"]
area: "103 Data and persistence categories"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S103.01", "S103.02"]
depends_on: ["SYS-authentication-and-identity", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-api-and-contracts", "SYS-sync-and-continuity", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "table:profiles", "table:identities", "table:device_registrations", "table:device_refresh_tokens"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F103-01 Account and sign-in identity

The server-side records of who a person is and which of their devices are signed in. One profile row per account, a map from sign-in provider identity to account, a device registry filled by app heartbeats, and rotating refresh-token families that let one device or all devices be signed out. All of it runs on our servers.

Area: [103. Data and persistence categories](README.md). Requirement items: [S103.01](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10301), [S103.02](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10302).

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

**What it does.** Stores the account profile (profiles table), the link from a sign-in provider subject to the account (identities table), one registry row per signed-in install of a desktop, CLI, VS Code, Chrome or mobile app (device_registrations), and device refresh-token families that rotate on each use and are revoked on sign-out, unlink or replay (apps/web/db/neon/0002_profiles.sql:1; apps/web/db/neon/0174_identities.sql:1; apps/web/db/neon/0207_device_registrations.sql:23; apps/web/db/neon/0080_device_refresh_token_rotation.sql:1). GET /api/me assembles the account the apps display (apps/web/app/api/me/route.ts:325).

**Why it exists.** So an account is recognised the same way on every app, the person can see which machines are signed in and cut one off, and a stolen refresh token cannot be used quietly. Brief items S103.01 and S103.02 require these records to be durable, owned by one canonical record and classified for export and erasure (doc: knowledge-base/data/area-briefs/103-data-and-persistence-categories.md).

**Who uses it.** Every signed-in person on every app; support and admins read it indirectly through account and device lists.

**Problems it solves**

- Recognising the same person across apps and across sign-in providers (apps/web/db/neon/0174_identities.sql:1)
- Showing which device is which and whether it is awake (apps/web/db/neon/0207_device_registrations.sql:1)
- Ending a lost or compromised device's access, including a refresh token that is used twice (apps/web/app/api/auth/device/refresh/route.ts:153)
- Making sure erasure and export know every table that holds account data (apps/web/lib/services/deletion-manifest.ts:122,173)

**Use cases**

- A person signs the CLI in on a laptop; later the Linked devices list shows it with its operating system and last seen time.
- A person loses a phone and unlinks it as lost; its refresh family is finished for good.
- A refresh token is replayed by an attacker; the whole family is revoked, a critical audit event is written and the owner is notified.
- A desktop app opens settings and reads the profile name, plan and billing owner from /api/me.

## 2. User experience

**Where to find it**

- Web: Settings > Linked devices panel, headed 'Linked devices', with row buttons 'Rename' and 'Unlink' (apps/web/features/settings/components/LinkedDevicesPanel.tsx:374,341,356). Settings pages exist at /settings/account, /settings/profile and /settings/security (apps/web/app/settings).
- Desktop, CLI, VS Code, Chrome, Mobile: no visible control found in this pass. Each posts a heartbeat that appears in the web list (apps/desktop/src/services/__tests__/deviceRegistryHeartbeat.test.ts; apps/cli/src/device_registry.rs; apps/extension-vscode/src/__tests__/deviceHeartbeat.test.ts; apps/extension/__tests__/device-heartbeat.test.ts; apps/mobile/src/features/device-registry/__tests__/heartbeat.test.ts). The visible labels inside those apps: unknown.

**Before you start**

- A signed-in account. Heartbeat and refresh need a valid session or device credential (apps/web/app/api/devices/heartbeat/route.ts:22).
- Device sign-in uses the device authorization flow (apps/web/app/api/auth/device/code, approve, token).

**Screens and controls**

- Linked devices list with rename and an Unlink button; Unlink asks 'Unlink <device>?' with the confirm label 'Unlink device' (apps/web/features/settings/components/LinkedDevicesPanel.tsx:333-336).
- The unlink call accepts options lost and logoutAll (apps/web/app/api/settings/devices/[deviceId]/route.ts). Whether the panel exposes those two choices: unknown, not opened.
- Sessions list and revoke through /api/settings/sessions (apps/web/app/api/settings/sessions/route.ts).

**Journey**

1. 1. The person starts sign-in on a device (device code route).
2. 2. They approve it in the web app (approve route).
3. 3. The device exchanges the code for an access token and a refresh token (token route).
4. 4. The app sends a heartbeat with its install id, operating system, version and capabilities; the server creates or updates its registry row.
5. 5. When the access token expires the app calls refresh; the server swaps the refresh token for a new one.
6. 6. In Linked devices the person can rename or unlink; unlinking revokes the refresh family and removes the registry row.

**What the person sees and gets**

- Heartbeat answers with the device id and the next heartbeat interval (apps/web/app/api/devices/heartbeat/route.ts:22).
- First time a device is seen the account gets a new-device notice (notifyNewDeviceRegistered in the heartbeat route).
- Refresh refusals carry specific errors: terms acceptance required with a link, age review required, account unavailable with a recovery link (apps/web/app/api/auth/device/refresh/route.ts:153).
- Button text changes to 'Unlinking…' while the call runs (apps/web/features/settings/components/LinkedDevicesPanel.tsx:356).

**Settings**

- Rename a device (DeviceRenameRequestSchema, apps/web/app/api/settings/devices/[deviceId]/route.ts).
- Account profile fields display_name and avatar_url can be patched through PATCH /api/me (apps/web/app/api/me/route.ts:129).
- Heartbeat interval is set by the server per app type (packages/contracts/cloud-contracts/src/device-registry.ts:19).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/me builds id, email, visible name, profile, avatar, plan and billing owner from the profile and subscription rows (apps/web/app/api/me/route.ts:325).
- Sign-in subject resolves to an account through the identities table, with a fallback only where the provider subject is the stored account id, and an erased flag from erasure_tombstones (apps/web/lib/server/identity-account.ts:54).
- POST /api/devices/heartbeat upserts the registry row keyed by user, app and install id, never turns remote work back on by itself, and notifies on first sight (apps/web/app/api/devices/heartbeat/route.ts:22).
- Refresh rotates the token inside a transaction with a row lock, marks the old one used, and treats a reused token as a replay: the family is finished as compromised, an audit event 'refresh_family_compromised' (critical) is written and a notice is sent (apps/web/app/api/auth/device/refresh/route.ts:153).
- Refresh is withheld, without revoking the family, when terms need accepting or the 18-and-over decision is missing (apps/web/app/api/auth/device/refresh/route.ts:153).
- Unlinking a device revokes its credential family, optionally as lost (compromise recorded) and optionally everywhere, and deletes the registry rows (apps/web/app/api/settings/devices/[deviceId]/route.ts).
- Logout revokes the developer session family by refresh token (apps/web/app/api/auth/logout/route.ts).
- profiles, identities, device_registrations and the refresh tables are named in the erasure and export manifest (apps/web/lib/services/deletion-manifest.ts:122,161-163,223).

**Incomplete**

- Per-app visible controls for devices outside the web Linked devices list were not traced; status per app in the brief is 'platform' only.

**Present but disconnected or switched off**

- Migrations 0174 (identities), 0207 (device_registrations) and 0412 (refresh families) carry the header 'NOT YET APPLIED : draft only' (apps/web/db/neon/0174_identities.sql:4; apps/web/db/neon/0207_device_registrations.sql:4; apps/web/db/neon/0412_device_refresh_token_families.sql:4). Whether they are applied in production: unknown; code already reads and writes these tables.

**Not available**

- The web app is not a device surface: the registry accepts only desktop, cli, vscode, chrome, mobile (apps/web/db/neon/0207_device_registrations.sql:23).
- A single place that lists revocation history per device: not found.

## 4. Required behaviour

**Established requirements**

- User accounts and their linked sign-in identities are durably stored, owned by one canonical record, and classified for export and erasure. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.01)
- Sessions and devices (registrations, refresh tokens, revocations) are durably stored and classified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.02)
- A refresh token that was already used must not be accepted again; the family is finished as compromised. (source: apps/web/app/api/auth/device/refresh/route.ts:153)
- Presence is derived from last_seen_at when read, never stored, so a silent device cannot stay online. (source: apps/web/db/neon/0207_device_registrations.sql:1)

**Acceptance criteria**

1. After a heartbeat from each of the five device apps, one row exists per user, app and install id and a second heartbeat updates it without a duplicate.
2. Using the same refresh token twice returns an error the second time and the first rotated token no longer works.
3. Unlinking a device makes its refresh token fail on the next refresh.
4. A refresh for an account whose terms are not accepted is refused with the acceptance link and the same token works after acceptance.
5. GET /api/me for a new account returns plan, name and billing owner and never another account's data.
6. Every table named in the identity and device group appears in the deletion manifest.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local-only use of an app without sign-in should create no account or device rows [inferred; no code path found that registers without a credential].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the device list, with last seen time, in the desktop, mobile, CLI and extension settings, not only on web.
- [proposed] Record a revocation row so the person can see when and why a device was cut off.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| table | profiles | `apps/web/db/neon/0002_profiles.sql` | One canonical account profile row: email, display name, avatar, billing customer id, routing preferences. |
| table | identities | `apps/web/db/neon/0174_identities.sql` | Maps (provider, subject) to the account id. |
| service | resolveAuthenticatedAccount | `apps/web/lib/server/identity-account.ts` | Resolves a sign-in subject to an account, with erased flag and cache. |
| endpoint | GET/PATCH /api/me | `apps/web/app/api/me/route.ts` | Assembles and updates the account the apps display. |
| table | device_registrations | `apps/web/db/neon/0207_device_registrations.sql` | One row per signed-in install with os, version, capabilities and credential links; row-level security per user. |
| endpoint | POST /api/devices/heartbeat | `apps/web/app/api/devices/heartbeat/route.ts` | Upserts the device row and returns the next heartbeat interval. |
| other | Heartbeat contract | `packages/contracts/cloud-contracts/src/device-registry.ts` | Request schema, surfaces, operating systems and interval rules shared by clients and server. |
| table | device_refresh_tokens | `apps/web/db/neon/0080_device_refresh_token_rotation.sql` | Hashed refresh tokens kept after use so replay can be detected. |
| table | device_refresh_token_families | `apps/web/db/neon/0412_device_refresh_token_families.sql` | Family row that can be ended for good so a concurrent rotation cannot leave a live successor. |
| endpoint | POST /api/auth/device/refresh | `apps/web/app/api/auth/device/refresh/route.ts` | Rotates the token, detects replay, enforces terms and age gates. |
| endpoint | device code, approve, token routes | `apps/web/app/api/auth/device` | Device authorization sign-in flow. |
| service | refresh-token-family | `apps/web/lib/server/refresh-token-family.ts` | Revokes one or every device refresh family. |
| endpoint | /api/settings/devices and /api/settings/devices/[deviceId] | `apps/web/app/api/settings/devices/[deviceId]/route.ts` | List, rename and unlink devices; propagates revocation and deletes registry rows. |
| endpoint | /api/settings/sessions | `apps/web/app/api/settings/sessions/route.ts` | Lists and revokes identity-provider sessions, joined to the registry for os and app. |
| endpoint | POST /api/auth/logout | `apps/web/app/api/auth/logout/route.ts` | Revokes the developer session family on sign-out. |
| component | LinkedDevicesPanel | `apps/web/features/settings/components/LinkedDevicesPanel.tsx` | Web UI for rename and unlink. |
| service | deletion-manifest | `apps/web/lib/services/deletion-manifest.ts` | Classifies each table for export and erasure. |
| service | CLI device registry | `apps/cli/src/device_registry.rs` | CLI heartbeat client. |
| table | erasure_tombstones | `apps/web/db/neon/0103_erasure_tombstones.sql` | Marks erased accounts so a returning subject resolves as erased. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| App sends heartbeat with install id, os, version and capability flags. | device and our servers | apps/web/app/api/devices/heartbeat/route.ts:22; packages/contracts/cloud-contracts/src/device-registry.ts:19 |
| Server checks rate limit, CSRF, user scope, then upserts device_registrations and links the credential family. | our servers | apps/web/app/api/devices/heartbeat/route.ts:22 |
| Refresh: server locks the token row, rotates or refuses, writes the new hashed token. | our servers | apps/web/app/api/auth/device/refresh/route.ts:153 |
| Unlink: server revokes credentials, drops live sessions, deletes registry rows in a transaction. | our servers | apps/web/app/api/settings/devices/[deviceId]/route.ts |
| Sign-in identity itself is issued by an identity provider behind getIdentityProvider; which provider is used per app is covered by SYS-authentication-and-identity. | outside service | apps/web/app/api/settings/devices/[deviceId]/route.ts (imports getIdentityProvider from lib/server/identity); apps/web/db/neon/0174_identities.sql:1 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Account profile | public.profiles (database) | Read by every app through /api/me; not stored by the server on the device. | Classified in the deletion manifest (apps/web/lib/services/deletion-manifest.ts:223); erasure leaves a tombstone (0103). |
| Device registry row | public.device_registrations | Written by app heartbeat, read by web settings. | Deleted on unlink; cascades with the profile (0207 header). |
| Refresh tokens | public.device_refresh_tokens (hash only) | The raw token lives on the device; server stores the hash. | Used rows are kept so replay is detectable; revoked on unlink or sign-out. |

**Models and providers.** No model or inference provider takes part. Identity provider choice is a separate concern (SYS-authentication-and-identity).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Required. Heartbeat, refresh, devices and /api/me all need a signed-in account (apps/web/app/api/devices/heartbeat/route.ts:22). |
| Permissions | Row-level security limits device rows to the signed-in user (apps/web/db/neon/0207_device_registrations.sql:23). Unlink looks up the device by user and device id. |
| Subscription | None found in the code for devices or profile; /api/me only reports the plan. |
| Limits and metering | Rate limits named 'device-heartbeat', 'me' and 'settings-session-revoke' (route files). Their numeric values: unknown, not opened. |
| Feature flags | None found in this code path; /api/me returns feature_flags for other features (apps/web/app/api/me/route.ts:325). |
| Model compatibility | Not applicable. |
| Provider restrictions | Identity records are keyed by provider; only the clerk provider is described in the migration (apps/web/db/neon/0174_identities.sql:1). |
| Local mode | A heartbeat reports a local_models_available flag (apps/web/db/neon/0207_device_registrations.sql:23). Whether a person using only local inference without signing in is registered: none found in the code, a device row needs a signed-in user. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Refresh token replayed | Family revoked, critical audit event, notification to owner, caller gets an error. | apps/web/app/api/auth/device/refresh/route.ts:153 |
| Terms not accepted or age not confirmed | Refresh refused with a link; family stays unused so the device resumes after acceptance. | apps/web/app/api/auth/device/refresh/route.ts:153 |
| Owner missing or deletion scheduled | Family revoked and result 'erased'. | apps/web/app/api/auth/device/refresh/route.ts:153 |
| Remote work turned off | A heartbeat can lower remote_enabled but never raise it. | apps/web/app/api/devices/heartbeat/route.ts:22 |
| Unlink in flight | Button reads 'Unlinking…' and is busy. | apps/web/features/settings/components/LinkedDevicesPanel.tsx:356 |
| Concurrent rotation and revoke | Addressed by the family row lock in migration 0412 (header says not applied). | apps/web/db/neon/0412_device_refresh_token_families.sql:4 |
| Offline device | Presence is computed from last_seen_at when read. How the list labels a sleeping device: unknown. | apps/web/db/neon/0207_device_registrations.sql:1 |
| Empty device list, loading and error text | not established from the code opened | apps/web/features/settings/components/LinkedDevicesPanel.tsx opened only for labels |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/devices/heartbeat/route.test.ts`: Heartbeat route.
- `apps/web/app/api/auth/device/refresh/route.test.ts`: Refresh rotation and refusals.
- `apps/web/app/api/auth/device/refresh/terms-reacceptance.test.ts`: Terms gate on refresh.
- `apps/web/app/api/auth/device/__tests__/refresh-carries-device-link.test.ts`: Refresh keeps the device link.
- `apps/web/lib/server/__tests__/refresh-token-family.test.ts`: Family revoke.
- `apps/web/lib/server/__tests__/session-revocation.test.ts`: Session revocation.
- `apps/web/lib/server/identity-account.test.ts`: Identity resolution.
- apps/web/app/api/me/__tests__/route.test.ts (not found) (not found): GET /api/me.
- `apps/web/app/api/settings/devices/__tests__/route.test.ts`: Device list and unlink.
- `apps/web/db/neon/device-registrations-migration.test.ts`: Registry migration shape.
- `apps/web/features/settings/components/__tests__/LinkedDevicesPanel.test.tsx`: Panel UI.
- `apps/cli/src/device_registry.rs`: CLI client (source; tests inside not opened).

**Test scenarios**

- **Replay detection**
  1. Sign in a test device and keep its refresh token.
  2. Call refresh once and keep the new token.
  3. Call refresh again with the first token.
  4. Call refresh with the new token.
  - Expected: Second call fails as replay; the new token also fails because the family is finished; a critical audit event and a notice exist.
- **Heartbeat from every app**
  1. Sign in desktop, CLI, VS Code, Chrome and phone.
  2. Let each send a heartbeat.
  3. Open Settings > Linked devices on web.
  - Expected: Five rows, each with the right app and operating system; a repeat heartbeat updates, not duplicates.
- **Unlink as lost**
  1. Open Linked devices.
  2. Unlink a device choosing lost if offered.
  3. Try refresh from that device.
  - Expected: Refresh fails; the row is gone.
- **Terms gate**
  1. Publish a new terms version on a test account.
  2. Refresh a device token.
  - Expected: 403 with acceptance link; token still valid after accepting.
- **Erasure inventory**
  1. Run the deletion manifest test.
  - Expected: profiles, identities and device tables are classified.

**Where to look when it fails**

- Log line 'Device refresh credential replayed; family finished as compromised'.
- Audit event refresh_family_compromised.
- Tables device_registrations, device_refresh_tokens, identities; erasure_tombstones for erased accounts.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Visible device management exists on web only.** Affects: Desktop, Mobile, CLI, VS Code, Chrome users. Evidence: Only apps/web/features/settings/components/LinkedDevicesPanel.tsx found. Work needed: Confirm and, if absent, add device list and sign-out to each app.
- **Draft migrations 0174, 0207 and 0412 are marked not applied.** Affects: All apps if the database lacks them. Evidence: Headers at line 4 of each file. Work needed: Confirm applied state against the live migration ledger.
- **Empty, loading and error wording of the device list not confirmed.** Affects: Web. Evidence: Not opened. Work needed: Read the panel and add tests.

**Depends on**

- SYS-authentication-and-identity
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-api-and-contracts
- SYS-sync-and-continuity
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- table:profiles
- table:identities
- table:device_registrations
- table:device_refresh_tokens

## Unknown

- Whether migrations 0174, 0207 and 0412 are applied in production.
- Numeric heartbeat intervals and rate-limit values.
- Whether the Linked devices panel offers the lost and sign-out-everywhere choices.
- Visible device screens in desktop, mobile, CLI, VS Code and Chrome.
- Empty, loading and error wording of the device list.
- How the list labels a sleeping or offline device.
