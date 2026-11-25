---
id: "F086-05"
type: "feature"
title: "Active sessions and sign-out"
aliases: ["Active sessions", "Sessions panel", "Log out of all devices", "Log out everywhere", "Sign out", "Log out", "S86.06", "S86.09", "S86.10"]
area: "86 Security and connected-access settings"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S86.06", "S86.09", "S86.10"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "file:apps/web/app/api/settings/sessions/route.ts", "file:apps/web/lib/server/session-revocation.ts", "api:GET /api/settings/sessions", "api:DELETE /api/settings/sessions", "api:DELETE /api/settings/sessions/[sessionId]", "table:device_refresh_tokens", "table:device_registrations", "SYS-authentication-and-identity", "SYS-sync-and-continuity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F086-05 Active sessions and sign-out

Lists the account's signed-in sessions with device, place and times, ends one, ends all (needs a re-check), and signs out this device. Full on web, desktop and phone. The CLI, VS Code and Chrome can only sign out their own device and cannot list or end other sessions.

Area: [86. Security and connected-access settings](README.md). Requirement items: [S86.06](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8606), [S86.09](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8609), [S86.10](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8610).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 3) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows each active session with device, OS, browser, place and times, with the current one first. Ends a single session, ends every session and device credential, and signs out the current device on each app.

**Why it exists.** If a device is lost or a login looks wrong, the person must be able to cut it off. The brief requires seeing sessions (device, place, last active) and ending any, signing out the current device, and one action to sign out everywhere (doc: knowledge-base/data/area-briefs/086-security-and-connected-access-settings.md, S86.06, S86.09, S86.10).

**Who uses it.** Any signed-in account holder on any app.

**Problems it solves**

- A forgotten login on a shared computer.
- A suspected account compromise.
- Old sessions living beyond the account lifetime policy.

**Use cases**

- Revoke one unknown session.
- Use 'Log out of all devices' after a lost phone.
- Sign out of the CLI on a shared machine.
- Sign out of the Chrome extension and clear the saved autofill profile.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Account, section 'Active sessions' (apps/web/features/settings/sections/AccountSection.tsx:632); Settings, Security, panel 'Sessions' with rows 'Active sessions' and 'Log out of all devices' (SecuritySection.tsx:83-168).
- Mobile: Account security, 'Sessions' group with 'Session timeout', device rows, and 'Log out of all devices'; Profile has 'Log Out' (account-security/index.tsx:358-380; apps/mobile/app/(app)/profile/index.tsx:117-125).
- CLI: command 'agi logout' (apps/cli/src/lib.rs:993-1000, 7274-7296).
- VS Code: command 'agi-workforce.signOut' and menu item 'Sign out of AGI Cloud' (extension-vscode/src/core/commandSetup.ts:1243, 2389).
- Chrome extension: Options, 'Log out' button (extension/src/options.ts:1706-1727) and side panel sign out (side_panel.ts:12103).

**Before you start**

- A signed-in account.
- Sign out of all needs a re-check no older than 300 seconds (actions.ts:61-64).

**Screens and controls**

- Web Account: each session row shows device label, browser, created and last-active times, and an end button labelled 'Log out current session' or 'Revoke <device> session' with confirm 'Log out this session?' or 'Revoke the <device> session?' (AccountSection.tsx:790-835).
- Web Security: button 'Log out' with dialog 'Log out of all devices?' and confirm 'Log out everywhere' (SecuritySection.tsx:123-154).
- Mobile: alert 'Sign out this device?' for one device and 'Log out of all devices?' for all (index.tsx:315-358).
- Text 'Showing N of M sessions.' when the list is truncated (AccountSection.tsx:859).

**Journey**

1. Open the sessions list; it loads current session first, then by last activity.
2. To end one, press the end button and confirm.
3. To end all, press 'Log out', confirm 'Log out everywhere', pass the re-check.
4. The server ends every other session and device credential, then the current one; the client signs out locally and returns to the sign-in page.
5. On CLI, VS Code and Chrome, sign out of this device only.

**What the person sees and gets**

- Session rows with device, OS, surface, browser, location, created, last active, expiry (sessions/route.ts:72-102).
- Errors: 'Unable to load active sessions.', 'Active sessions took too long to load. Please try again.', 'Unable to revoke this session.' (AccountSection.tsx:319-363).
- Partial failure: 502 'Ended X of Y sessions, try again to finish.' (sessions/route.ts:230).
- CLI message 'Logged out from 1 provider.' plus a warning when AGI Cloud did not confirm (cli/src/app_server/account.rs:662-679).
- Chrome: 'Signed out here. The web session could not be ended.' variants (options.ts:1718-1727).

**Settings**

- Session timeout (web 'Security' form; phone cycle 15, 30, 60, 120, 480 minutes; default 60) (account-security/service.ts:17-20; SecuritySection.tsx:189-215).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- List route reads active sessions from the identity provider, joins device registrations for OS and surface, sorts current first (sessions/route.ts:143-187).
- Sessions older than the lifetime policy are ended when the list loads and audited (sessions/route.ts:108-141, 151-176).
- Single revoke by session id with ownership check, mobile-intent token revocation and event (sessions/[sessionId]/route.ts:15-76). No step-up on this route.
- Revoke all with CSRF, rate limit and step-up session.revoke_all; ends other sessions, device credentials, then the current session, emits all_sessions_revoked (sessions/route.ts:189-271).
- CLI sign out, with optional removal of provider keys using --all (cli lib.rs:7274-7296; account.rs:651-690).
- VS Code sign out also signs the CLI out and clears caches (commandSetup.ts:1243-1257).
- Chrome sign out clears local auth and ends the web session (freeTrialClient.ts:504-508).

**Incomplete**

- CLI, VS Code and Chrome cannot list sessions or sign out everywhere (brief: missing).
- Single-session revoke has no re-check while revoke all does (sessions/[sessionId]/route.ts vs sessions/route.ts:198-204).
- Listing has a side effect: it ends over-age sessions (sessions/route.ts:151-155).

**Present but disconnected or switched off**

- None found.

**Not available**

- Session list on CLI, VS Code and Chrome. Sign out everywhere on CLI, VS Code and Chrome.

## 4. Required behaviour

**Established requirements**

- The user can see signed-in sessions (device, place, last active) and end any of them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.06)
- The user can sign out of the current device or app. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.09)
- One action signs the account out everywhere: every browser, app and device credential. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.10)
- Sign out all needs a re-check no older than 300 seconds. (source: apps/web/lib/server/step-up/actions.ts:61-64)
- If some sessions fail to end, the response is 502 with counts and a retry message. (source: apps/web/app/api/settings/sessions/route.ts:213-236)
- Success writes an identity event. (source: apps/web/app/api/settings/sessions/route.ts:250-263)
- An action a user cannot undo names its consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. The list shows the current session first and others by last activity descending.
2. Ending another session removes it from the list and the next request from that session fails.
3. Ending the current session signs this browser out and redirects to sign-in.
4. Log out of all devices without a fresh re-check opens the step-up prompt; with it, every session and device credential is ended and the browser returns to sign-in.
5. A simulated failure of some revocations returns 502 and the UI shows the message without signing out.
6. A session older than the lifetime policy disappears when the list loads and a session_revoked audit entry exists.
7. 'agi logout' prints 'Logged out from 1 provider.' and removes local account tokens; saved provider keys stay unless --all is given.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Revoking all signs out the current device last so that the call can finish (sessions/route.ts:239-243).
- [inferred] The phone shows 'SecurityRecommendation' when another device is signed in (index.tsx hasOtherSignedInDevice).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Require a re-check for single-session revoke of another device when a second factor is on, or document that it is intentional.
- [proposed] Let CLI and extensions open the sessions page on the web.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | AccountSection sessions | `apps/web/features/settings/sections/AccountSection.tsx` | Web list and per-session end. |
| component | SessionsPanel | `apps/web/features/settings/sections/SecuritySection.tsx` | Log out of all devices panel. |
| hook | useStepUp | apps/web/features/settings/hooks/useStepUp.ts (not found) (not found) | Prompts for the re-check around the DELETE call. |
| endpoint | GET and DELETE /api/settings/sessions | `apps/web/app/api/settings/sessions/route.ts` | List and revoke all. |
| endpoint | DELETE /api/settings/sessions/[sessionId] | `apps/web/app/api/settings/sessions/[sessionId]/route.ts` | Revoke one. |
| service | resolveSessionsPrincipal | `apps/web/app/api/settings/sessions/session-principal.ts` | Resolves the account and current session id. |
| service | session-revocation | `apps/web/lib/server/session-revocation.ts` | List, batch revoke, sweep other sessions. |
| service | session-policy | `apps/web/lib/auth/session-policy.ts` | Lifetime bounds that end old sessions. |
| service | refresh-token-family | `apps/web/lib/server/refresh-token-family.ts` | Revokes device refresh credentials. |
| table | device_registrations | `apps/web/app/api/settings/sessions/route.ts` | Gives OS and surface for each identity session (query lines 46-50). |
| table | device_refresh_tokens | `apps/web/app/api/settings/devices/route.ts` | Device credentials revoked by sign out all. |
| screen | Mobile Account security sessions | `apps/mobile/src/features/settings/account-security/index.tsx` | Phone session list, revoke one and all. |
| service | Mobile session calls | `apps/mobile/src/features/settings/account-security/service.ts` | fetchAccountSessions, revokeAccountSession, revokeAllAccountSessions. |
| screen | Mobile Profile Log Out | `apps/mobile/app/(app)/profile/index.tsx` | Sign out this device with confirm. |
| command | agi logout | `apps/cli/src/lib.rs` | CLI sign out command with --all. |
| service | sign_out_of_account | `apps/cli/src/app_server/account.rs` | Clears local tokens and revokes the device session. |
| command | agi-workforce.signOut | `apps/extension-vscode/src/core/commandSetup.ts` | VS Code sign out and CLI sign out. |
| service | signOutOfAccount | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Chrome extension local sign out. |
| screen | Chrome Options Log out | `apps/extension/src/options.ts` | Button and status text for sign out. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The page requests the session list; the server asks the identity provider for active sessions and reads device registrations. | our servers | sessions/route.ts:143-163 |
| Sessions past the lifetime policy are revoked and an audit event is written. | our servers | sessions/route.ts:151-176 |
| Revoke all: CSRF, rate limit, step-up; sweep other sessions at the identity provider; revoke device refresh credentials; revoke the current session; emit all_sessions_revoked. | our servers | sessions/route.ts:189-263 |
| The browser then clears local state and signs out of the identity provider client. | device | SecuritySection.tsx:70-72 |
| CLI clears local tokens first, then asks AGI Cloud to revoke the device session. | device and our servers | account.rs:651-672 (local removal first, then revoke_snapshot) |
| Chrome sign out clears local auth and tries to end the web session. | device and our servers | freeTrialClient.ts:504-508; options.ts:1718 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Sessions | The identity provider | Read by clients through the server | Revoked, not deleted; status inactive. |
| Device refresh credentials | table device_refresh_tokens | Server only | Marked revoked. |
| Local tokens on CLI, VS Code and Chrome | CLI auth store, VS Code secret store, Chrome local storage | No | Removed on sign out. |
| Audit and notices (session_revoked, all_sessions_revoked) | audit and notification stores | Server only | Retention unknown. |

**Models and providers.** No AI model or inference provider is involved. Local-mode chats on device are not affected by session revocation.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required to list or revoke. CLI, VS Code and Chrome sign out works locally even if the cloud is unreachable (CLI message says the session then ends on expiry). |
| Permissions | Account owner; a session can only be revoked if it belongs to the user (sessions/[sessionId]/route.ts:36-40). |
| Subscription | none found in the code. |
| Limits and metering | Rate limits settings-sessions-list, settings-sessions-revoke-all, settings-session-revoke. List is truncated and reports totalCount and truncated (sessions/route.ts:178-186). Step-up 300 seconds. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Depends on the identity provider's session list and revoke operations. |
| Local mode | Phone in Local mode shows 'Cloud mode required' for Devices and Session timeout. Local chats keep working after a cloud sign out [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading active sessions…' on web; 'Checking…' on the phone. | AccountSection.tsx:634-640; index.tsx |
| Empty | 'No active sessions found.' | AccountSection.tsx:664 |
| Load error and retry | Error text with a retry button; phone row 'Unavailable · Retry'. | AccountSection.tsx:641-653; index.tsx |
| Timeout | 'Active sessions took too long to load. Please try again.' | AccountSection.tsx:319-322 |
| Partial revoke | 502 with counts; client stays signed in. | sessions/route.ts:213-236; SecuritySection.tsx:74-79 |
| Revoked but sign-out failed | Client redirects to sign-in anyway. | SecuritySection.tsx:74-76 |
| Step-up cancelled | No error shown; button re-enabled. | SecuritySection.tsx:78 |
| Phone single revoke unconfirmed | Alert 'Could not confirm device sign-out' and the list refreshes. | index.tsx:~320-330 |
| Cloud unreachable on CLI | Message says the session ends on expiry or can be unlinked in Linked devices. | account.rs:672-679 |
| Truncated list | 'Showing N of M sessions.' | AccountSection.tsx:859 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/sessions/route.test.ts`: List and revoke all.
- `apps/web/app/api/settings/sessions/[sessionId]/route.test.ts`: Single revoke.
- `apps/web/features/settings/sections/AccountSection.sessions.test.tsx`: Account sessions list.
- `apps/web/features/settings/sections/SecuritySection.sessions.test.tsx`: Security sessions panel.
- `apps/web/app/api/auth/logout/route.test.ts`: Logout route.
- `apps/mobile/__tests__/AccountSecurityScreen.test.tsx`: Phone session actions.
- `apps/mobile/__tests__/sign-out-push-token-cleanup.test.ts`: Push token cleanup at sign out.
- `apps/desktop/src/stores/__tests__/logoutCleanup.test.ts`: Desktop logout cleanup.
- `apps/web/shared/stores/authentication-store.logout-cleanup.test.ts`: Web store cleanup on logout.

**Test scenarios**

- **Order**
  1. Sign in on two browsers.
  2. Open the sessions list.
  - Expected: Current first, then by last activity.
- **End another**
  1. End the other session.
  2. Reload the other browser.
  - Expected: Other browser is signed out; list no longer shows it.
- **Log out everywhere**
  1. Press 'Log out'.
  2. Confirm.
  3. Pass the re-check.
  - Expected: All sessions and device credentials ended; redirect to sign-in; notice sent.
- **Partial failure**
  1. Simulate the identity provider failing some revokes.
  - Expected: 502 'Ended X of Y sessions, try again to finish.'
- **CLI logout**
  1. Run 'agi logout' offline.
  - Expected: Local tokens removed; message says the cloud did not confirm.
- **Chrome logout**
  1. Press 'Log out' in Options.
  - Expected: Account row resets; status text if web session not ended.

**Where to look when it fails**

- Log 'Some non-current sessions could not be revoked' and 'All active sessions revoked'.
- Log 'Account session revoked'.
- Audit events session_revoked with source naming the lifetime bound.
- Identity event all_sessions_revoked.
- Table device_refresh_tokens (revoked_at).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/086-security-and-connected-access-settings.md](../../70-qa/test-plans/web/086-security-and-connected-access-settings.md)
- Desktop: [70-qa/test-plans/desktop/086-security-and-connected-access-settings.md](../../70-qa/test-plans/desktop/086-security-and-connected-access-settings.md)
- Mobile: [70-qa/test-plans/mobile/086-security-and-connected-access-settings.md](../../70-qa/test-plans/mobile/086-security-and-connected-access-settings.md)
- CLI: [70-qa/test-plans/cli/086-security-and-connected-access-settings.md](../../70-qa/test-plans/cli/086-security-and-connected-access-settings.md)
- VS Code: [70-qa/test-plans/vscode/086-security-and-connected-access-settings.md](../../70-qa/test-plans/vscode/086-security-and-connected-access-settings.md)
- Chrome: [70-qa/test-plans/chrome/086-security-and-connected-access-settings.md](../../70-qa/test-plans/chrome/086-security-and-connected-access-settings.md)

## 10. Gaps and dependencies

- **CLI, VS Code and Chrome cannot list sessions or sign out everywhere.** Affects: CLI, VS Code, Chrome. Evidence: Brief S86.06 and S86.10 status; none found in code. Work needed: Point to the web sessions page or build an in-app list.
- **Single revoke has no step-up while revoke all does.** Affects: Web, Mobile. Evidence: [sessionId]/route.ts:15-76 vs sessions/route.ts:198-204. Work needed: Decide the intended rule and record it.
- **Listing ends sessions as a side effect of a read.** Affects: All. Evidence: sessions/route.ts:151-155. Work needed: Consider a background job so reads stay read-only.
- **VS Code sign out is described as device only but also signs the CLI out.** Affects: VS Code, CLI. Evidence: commandSetup.ts:1245. Work needed: State this on the page the person sees.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- file:apps/web/app/api/settings/sessions/route.ts
- file:apps/web/lib/server/session-revocation.ts
- api:GET /api/settings/sessions
- api:DELETE /api/settings/sessions
- api:DELETE /api/settings/sessions/[sessionId]
- table:device_refresh_tokens
- table:device_registrations
- SYS-authentication-and-identity
- SYS-sync-and-continuity

## Unknown

- The numeric account lifetime in session-policy.ts (not opened).
- Whether Desktop Electron shows the web session list unchanged.
- How VS Code sign out reaches the web session (deviceAuth.ts not opened).
- Retention of audit entries.
- Whether Chrome side-panel sign out differs from the Options button (side_panel.ts:12103 only referenced).
