---
id: "F101-04"
type: "feature"
title: "Sign-in, API and streaming clients"
aliases: ["device authorization", "device sign-in", "device code flow", "shared SSE reader", "ServerSentEventDecoder", "managed cloud clients", "Continue in the cloud", "S101.10", "S101.11", "S101.12"]
area: "101 Shared package boundaries"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S101.10", "S101.11", "S101.12"]
depends_on: ["SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-chat-turn-pipeline", "SYS-inference-providers", "F101-01", "surface:desktop", "surface:vscode", "surface:cli", "file:packages/client/client-runtime/src/sse.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F101-04 Sign-in, API and streaming clients

Device sign-in (code, poll, refresh, approve) has one shared schema set and a shared client used by Desktop and VS Code; the CLI runs its own Rust copy. A shared reader decodes server-sent events. Reconnect is not in the shared reader; Mobile adds its own run-follow recovery.

Area: [101. Shared package boundaries](README.md). Requirement items: [S101.10](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10110), [S101.11](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10111), [S101.12](../../10-requirements/capabilities/101-shared-package-boundaries.md#s10112).

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

**What it does.** Lets a device without a browser sign in by showing a short code, polling until the person approves it on the web (packages/client/client-runtime/src/deviceAuthorization.ts:62-135), and reads chat or run streams with one decoder that handles line endings, comments, frame size and split chunks (packages/client/client-runtime/src/sse.ts:18-135).

**Why it exists.** A client that frames SSE by hand gets one rule wrong on a stream the others handle (scripts/check-sse-readers.mjs:1-8). Device sign-in follows the standard device grant: a start reply, a poll interval and named refusals (packages/contracts/cloud-contracts/src/device-authorization.ts:8-16).

**Who uses it.** A person signing in to Desktop, VS Code or the CLI; anyone chatting on Web, Mobile, Chrome, VS Code or Desktop; engineers.

**Problems it solves**

- Signing in on a device with no easy password entry
- A poll loop hammering the server (slow_down adds 5 seconds, packages/client/client-runtime/src/deviceAuthorization.ts:171-182)
- An account that must accept terms or confirm age before a device gets a token (packages/client/client-runtime/src/deviceAuthorization.ts:119-127)
- Streams split across network chunks losing frames (packages/client/client-runtime/src/__tests__/sse.test.ts:14-47)

**Use cases**

- Sign in to VS Code: it shows a code, the person approves at the web page
- Sign in to the CLI with device_code_login (apps/cli/src/oauth.rs:489)
- Send a chat message on Mobile and watch it stream (apps/mobile/services/streaming.ts:756)
- Choose 'Continue in the cloud' in VS Code to start a cloud session (apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:21)

## 2. User experience

**Where to find it**

- Web approval page apps/web/app/auth/device/page.tsx: title 'Connect a device.', field 'Device code', button 'Approve device' (packages/ui/i18n/locales/en/auth.json, auth:device)
- VS Code: sign-in through apps/extension-vscode/src/features/account-auth/deviceAuth.ts; modal action 'Continue in the cloud' then notification action 'Open session' (apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:21-22)
- Desktop: apps/desktop/src/services/desktopDeviceAuthorization.ts and desktopNativeSignIn.ts
- CLI: device login in apps/cli/src/oauth.rs

**Before you start**

- A web account that can sign in; for approval the person must be signed in on the web and the code must be the form XXXX-XXXX (apps/web/app/auth/device/page.tsx:81)

**Screens and controls**

- Approval page text includes 'Only approve a request you started.' and 'Verified requesting app' (packages/ui/i18n/locales/en/auth.json)
- Approved screen 'Device connected.' and a declined screen
- VS Code modal from describeCloudContinuationReview (apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:128-133)

**Journey**

1. The device asks the server for a code
2. The device shows the code and opens the approval page
3. The person signs in on the web, checks the verified app, presses 'Approve device'
4. The device polls the token route every 3 to 10 seconds until approved, denied or expired
5. The device stores the token and refresh token and renews later
6. Chat: the app posts a message and reads the SSE reply; on a drop Mobile follows the durable run

**What the person sees and gets**

- 'Device connected.' on the web page
- Device-side messages: 'Accept the updated Terms of Service at <url>, then sign in again.' or 'Confirm your age at <url>, then sign in again.' (packages/client/client-runtime/src/deviceAuthorization.ts:119-127)
- Mobile stream errors: 'The response ended before completion. Please retry.' (apps/mobile/services/streaming.ts:403)

**Settings**

- none found in the code for device sign-in
- Stream timeouts are in the apps' streaming code (not opened beyond Mobile)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server routes exist for code (GET lookup, POST start), token, refresh and approve (apps/web/app/api/auth/device/code/route.ts:181,186; token/route.ts:257; refresh/route.ts:359; approve/route.ts:232)
- The shared client validates origin, caps poll interval between 3 and 10 seconds and the window at 15 minutes (packages/client/client-runtime/src/deviceAuthorization.ts:12-16,62-94)
- slow_down raises the interval by 5 seconds, up to 60 seconds (packages/client/client-runtime/src/deviceAuthorization.ts:15-16,171-182)
- terms_acceptance_required and account_unavailable become a rejected result with the acceptance link (packages/client/client-runtime/src/deviceAuthorization.ts:119-130)
- A network error while polling counts as pending, so the poll continues (packages/client/client-runtime/src/deviceAuthorization.ts:103-107)
- Desktop and VS Code import the shared client (apps/desktop/src/services/desktopDeviceAuthorization.ts:6; apps/extension-vscode/src/features/account-auth/deviceAuth.ts:14)
- The SSE decoder refuses frames over 1,048,576 characters and keeps partial frames across chunks (packages/client/client-runtime/src/sse.ts:9-17,45-60)
- Web, Desktop, Mobile, Chrome and VS Code import the shared reader or decoder (apps/web/lib/hooks/useChatStream.ts; apps/desktop/src/api/cloudApi.ts; apps/mobile/services/streaming.ts:7; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:5-10; apps/extension-vscode/src/utils/api.ts)
- Mobile recovers a dropped stream by following the durable run and reports a lost connection if an answer had started (apps/mobile/services/streaming.ts:1015-1030,1184-1190)
- VS Code sends a request id and an idempotency key when starting a cloud session and turn (apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:151,164); Chrome sends an Idempotency-Key header starting 'cu:' (apps/extension/src/features/computer-use/cloudAgentClient.ts:335)

**Incomplete**

- Reconnect lives in Mobile's service, not in the shared reader (apps/mobile/services/streaming.ts:1015; packages/client/client-runtime/src/sse.ts has no reconnect). The brief's S101.12 'reconnect' is therefore not a shared-package feature
- The CLI uses its own Rust device flow (apps/cli/src/oauth.rs:75,133,191), not the shared client
- The surface type lists chrome, but no Chrome caller of requestDeviceAuthorization was found (search of apps); Mobile has no device sign-in reference (search of apps/mobile)
- The brief says the Electron main process uses no shared managed-cloud client; the desktop renderer file apps/desktop/src/api/cloudApi.ts uses the shared clients, and the main process was not checked
- check:idempotency enumerates database tables with deduplication keys (scripts/check-idempotency.mjs:1-4); the brief reads it as proof that VS Code and Chrome send keys, which the guard header does not say

**Present but disconnected or switched off**

- A second approval page exists at apps/web/app/device-auth/page.tsx; its role was not opened

**Not available**

- Device sign-in on Mobile (not found)

## 4. Required behaviour

**Established requirements**

- One authentication client (sign-in, device flow, token refresh) is shared by every client surface. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.10)
- Every client calls the server through the same API client modules. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.11)
- One streaming client (SSE reading, reconnect, event parsing) is shared by every client. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S101.12)
- Device refusals are pending, slow_down, denied, expired, invalid, account unavailable or terms acceptance required, and a review refusal must point to the acceptance URL. (source: packages/contracts/cloud-contracts/src/device-authorization.ts:42-73)
- Every SSE reader in a client module is either the shared reader or recorded with its owner; the record only shrinks. (source: scripts/check-sse-readers.mjs:1-8,54)
- Account approval signs the device into the account; Local mode needs no account access. (source: packages/ui/i18n/locales/en/auth.json auth:device.cloudNoteBody)

**Acceptance criteria**

1. The token route answers pending until approval, then a bearer token with a positive lifetime
2. slow_down makes the next poll at least 5 seconds slower
3. A device whose account must accept terms shows the acceptance link and does not sign in
4. A stream cut mid-answer on Mobile shows a lost-connection error, never a finished answer
5. A frame over the limit is refused under every chunk split
6. A new hand-written SSE splitter in a client file fails check:sse-readers
7. A device-start reply with a verification URL on another origin is refused

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Idempotency keys on retries mean a repeated start does not create a second cloud session [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Move reconnect and run-follow into the shared package so Chrome and VS Code get it
- [proposed] Give the CLI a golden fixture test for the device bodies
- [proposed] Add a guard that checks every client write call sends an idempotency key

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | Device authorization contract | `packages/contracts/cloud-contracts/src/device-authorization.ts` | Paths and bodies for code, token, refresh, approve |
| service | Shared device client | `packages/client/client-runtime/src/deviceAuthorization.ts` | Request, poll, slow-down and refresh logic |
| endpoint | Device code route | `apps/web/app/api/auth/device/code/route.ts` | Start (POST) and lookup (GET) |
| endpoint | Device token route | `apps/web/app/api/auth/device/token/route.ts` | Poll answer |
| endpoint | Device refresh route | `apps/web/app/api/auth/device/refresh/route.ts` | Renew token |
| endpoint | Device approve route | `apps/web/app/api/auth/device/approve/route.ts` | Approve or deny |
| screen | Device approval page | `apps/web/app/auth/device/page.tsx` | Where the person enters and approves the code |
| service | Desktop device sign-in | `apps/desktop/src/services/desktopDeviceAuthorization.ts` | Desktop use of shared client |
| service | VS Code device sign-in | `apps/extension-vscode/src/features/account-auth/deviceAuth.ts` | VS Code use of shared client |
| service | CLI device login | `apps/cli/src/oauth.rs` | Rust device flow (own copy) |
| service | Shared SSE decoder | `packages/client/client-runtime/src/sse.ts` | ServerSentEventDecoder and readServerSentEvents |
| service | Mobile streaming service | `apps/mobile/services/streaming.ts` | Chat stream, run follow and recovery |
| service | Chrome free-trial client | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Chrome chat stream through the shared decoder |
| service | Chrome cloud agent client | `apps/extension/src/features/computer-use/cloudAgentClient.ts` | Browser task cloud runs with Idempotency-Key |
| service | VS Code continue in cloud | `apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts` | Starts a cloud code session and turn |
| service | VS Code API client | `apps/extension-vscode/src/utils/api.ts` | Server calls using shared clients |
| service | Desktop cloud API | `apps/desktop/src/api/cloudApi.ts` | Desktop renderer cloud calls |
| service | Managed cloud run client | `packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts` | followRun, cancelRun, resume and other run calls |
| command | check:sse-readers | `scripts/check-sse-readers.mjs` | Fails client modules that frame SSE by hand |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The device posts its surface to the code route and receives device_code, user_code and URLs | device and our servers | packages/client/client-runtime/src/deviceAuthorization.ts:62-94 |
| The person opens the approval page, which looks up the code and approves it with a CSRF-protected request | our servers | apps/web/app/auth/device/page.tsx:95,156-175 |
| The device polls the token route and maps each answer | device and our servers | packages/client/client-runtime/src/deviceAuthorization.ts:96-135 |
| The device renews the token with the refresh route; revoked or terms-required results are reported | device and our servers | packages/client/client-runtime/src/deviceAuthorization.ts:189-210 |
| For chat, the app posts to the server and reads the SSE reply through the shared reader | device and our servers | apps/mobile/services/streaming.ts:756-776 |
| The server routes the model call to a provider and streams back (the call is outside the files opened) | outside service | SYS-inference-providers (not opened here) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Device code, user code, access and refresh tokens | server device-grant storage (table name not opened) and the device's credential store | no | codes expire (window capped at 15 minutes on the client, packages/client/client-runtime/src/deviceAuthorization.ts:14); token lifetime from expires_in |
| Chrome run handle and VS Code session id | extension storage or memory (not opened) | unknown | unknown |

**Models and providers.** The sign-in flow is model independent. The streaming reader is provider neutral: it decodes frames from the AGI server, not from a provider. Provider calls happen server-side (SYS-inference-providers).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Device sign-in needs a web account; chat and cloud runs need a signed-in account (apps/mobile/services/streaming.ts:508-512 throws 401 without a token). |
| Permissions | Approval needs the signed-in web user to confirm the verified requesting app (packages/ui/i18n/locales/en/auth.json auth:device.verifyBeforeApproving). |
| Subscription | A cloud run refused for quota or plan returns a 403 or 429 with a code that the client turns into a message (apps/extension/src/features/computer-use/cloudAgentClient.ts:360-378). The rules are in SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Poll interval 3 to 10 seconds, window 15 minutes, slow-down cap 60 seconds (packages/client/client-runtime/src/deviceAuthorization.ts:12-16); SSE frame cap 1,048,576 characters (packages/client/client-runtime/src/sse.ts:9). |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code for these clients. |
| Provider restrictions | none found in the code. |
| Local mode | The approval page states Local Mode stays local and needs no account access (packages/ui/i18n/locales/en/auth.json auth:device.cloudNoteBody). Whether Mobile Local chat uses this reader: not found in the files opened. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Pending | Keep polling | packages/client/client-runtime/src/deviceAuthorization.ts:110-112 |
| Slow down | Add 5 seconds, longer if the server says so | packages/client/client-runtime/src/deviceAuthorization.ts:171-182 |
| Denied, expired or invalid grant | Result kind denied or expired | packages/client/client-runtime/src/deviceAuthorization.ts:128-135 |
| Terms or age review needed | Rejected with a link to the acceptance URL | packages/client/client-runtime/src/deviceAuthorization.ts:119-127 |
| Poll request throws | Treated as pending | packages/client/client-runtime/src/deviceAuthorization.ts:103-107 |
| Stream ends without a done event | Error 'The response ended before completion. Please retry.' | apps/mobile/services/streaming.ts:403,776 |
| Network drop | Try to recover from the durable run; if an answer started, show a lost-connection error | apps/mobile/services/streaming.ts:1184-1192 |
| Timeout | Recover from the run, else 'The request timed out. Please check your connection and try again.' | apps/mobile/services/streaming.ts:1175-1182 |
| Account changes mid-stream | Stream is dropped via an epoch check | apps/mobile/services/streaming.ts:1170-1174 |
| Oversized frame | ServerSentEventFrameLimitError, not retried as a network error | packages/client/client-runtime/src/sse.ts:11-17; apps/mobile/services/streaming.ts:731-740 |
| Accessibility of the approval page | not handled in the code opened beyond labels; page not audited | apps/web/app/auth/device/page.tsx:303-324 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/cloud-contracts/src/__tests__/device-authorization.test.ts`: Start reply, refusals, credential
- `packages/client/client-runtime/src/__tests__/deviceAuthorization.test.ts`: Trusted origin, untrusted URL, slow_down arithmetic, terms and age refusals, non-2xx status, bearer credential
- `packages/client/client-runtime/src/__tests__/sse.test.ts`: Frames under every chunk split, oversized frame
- `apps/extension-vscode/src/__tests__/deviceAuth.test.ts`: VS Code device sign-in
- `apps/extension-vscode/src/__tests__/continueInCloud.test.ts`: Continue in the cloud flow
- `apps/mobile/__tests__/streaming-connection-lost.test.ts`: Lost connection handling
- `apps/mobile/__tests__/streaming-detached-run.test.ts`: Detached run follow
- `apps/mobile/__tests__/streaming-timeout.test.ts`: Stream timeout
- `scripts/check-sse-readers.test.mjs`: SSE reader guard

**Test scenarios**

- **Happy device sign-in**
  1. Start VS Code sign-in
  2. Open the approval page, sign in, press 'Approve device'
  - Expected: VS Code finishes sign-in without further input
- **Deny**
  1. Start sign-in
  2. Decline on the web page
  - Expected: The device reports denied
- **Terms required**
  1. Use an account that has not accepted new terms
  2. Start device sign-in
  - Expected: The device shows the acceptance link
- **Cut stream**
  1. Send a long Mobile chat
  2. Turn off the network mid-answer
  - Expected: Mobile follows the run or shows a lost-connection error, not a finished answer
- **Continue in cloud**
  1. In VS Code pick 'Continue in the cloud'
  2. Confirm the modal
  - Expected: A cloud session starts and 'Open session' appears

**Where to look when it fails**

- Error names ServerSentEventFrameLimitError and StreamConnectionLostError
- Server answers authorization_pending, slow_down, access_denied, expired_token, invalid_grant, account_unavailable, terms_acceptance_required
- CLI oauth.rs poll states

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Reconnect is not shared; only Mobile has run-follow recovery in the files opened** Affects: Chrome, VS Code, Desktop, Web. Evidence: packages/client/client-runtime/src/sse.ts (no reconnect); apps/mobile/services/streaming.ts:1015. Work needed: Move run follow into a shared module or confirm each client's own recovery
- **CLI device flow is a separate Rust copy** Affects: CLI. Evidence: apps/cli/src/oauth.rs:75,133,191. Work needed: Add golden fixtures for device bodies
- **Mobile and Chrome have no shared device sign-in caller found** Affects: Mobile, Chrome. Evidence: search of apps/mobile and apps/extension. Work needed: Confirm their sign-in path and update the brief
- **Idempotency evidence is by code reading, not by a guard on client writes** Affects: VS Code, Chrome. Evidence: scripts/check-idempotency.mjs:1-4. Work needed: Add a client-side check
- **Electron main process managed-cloud client status unknown** Affects: Desktop. Evidence: brief S101.11; apps/desktop/electron not opened. Work needed: Inspect the main process

**Depends on**

- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-chat-turn-pipeline
- SYS-inference-providers
- F101-01
- surface:desktop
- surface:vscode
- surface:cli
- file:packages/client/client-runtime/src/sse.ts

## Unknown

- Server table that holds device grants
- How Chrome signs in (no shared device caller found)
- How Mobile signs in beyond streaming (not opened)
- Whether the Electron main process calls the cloud at all
- Role of apps/web/app/device-auth/page.tsx
- Whether Chrome and VS Code reconnect after a dropped stream
- Whether guards pass today; nothing was run
