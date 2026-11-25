---
id: "F003-12"
type: "feature"
title: "Guest use, plans and trials"
aliases: ["Guest chat", "Try without an account", "Continue in Local Mode", "Local-only first run", "Sync Local Chats to AGI Cloud", "Plan selection", "Trial", "guest.chat flag"]
area: "3 Authentication and onboarding screens"
available_on: ["web", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "missing", mobile: "built", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S3.33", "S3.34", "S3.37"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "SYS-local-inference", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-model-catalog-and-routing", "SYS-inference-providers", "provider:ollama", "provider:lmstudio", "api:POST /api/llm/v1/chat/completions/guest", "F003-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F003-12 Guest use, plans and trials

Lets a person try the product without an account: web guest chat (limited, server-run, behind a switch), mobile Local Mode, CLI local model and VS Code local models. Mobile can copy local chats to Cloud after sign-in. Plan selection and trials are not part of onboarding on any app; trial support lives in billing code.

Area: [3. Authentication and onboarding screens](README.md). Requirement items: [S3.33](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s333), [S3.34](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s334), [S3.37](../../10-requirements/capabilities/003-authentication-and-onboarding-screens.md#s337).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives a no-account first experience and a path to an account. On web a visitor chats with a managed model under daily limits and is nudged to sign up. On mobile, CLI and VS Code a person can use a local model or their own key without signing in. On mobile, local chats can be copied to the account later.

**Why it exists.** People should see value before registering, and local inference must not need payment or an account (product requirement).

**Who uses it.** Visitors on web; first-time users on mobile, CLI and VS Code who prefer Local mode.

**Problems it solves**

- Sign-up wall before any value.
- Losing local work when someone signs up (mobile copy tool).
- Abuse of free managed chat: per-device, per-IP and global limits.

**Use cases**

- A visitor opens /chat signed out and sends a few messages as a guest.
- A phone user presses 'Continue in Local Mode' and chats with a downloaded model.
- A CLI user chooses 'Local model, no account required' at first run.
- A phone user signs in later and syncs selected local chats to AGI Cloud.

## 2. User experience

**Where to find it**

- Web: /chat when signed out and guest chat is open (apps/web/app/chat/layout.tsx:41-52); links 'Sign up for free' and sign in (GuestChat.tsx).
- Mobile: Cloud sign-in screen button 'Continue in Local Mode' (apps/mobile/app/(auth)/login.tsx:302-304) and Settings data controls 'Sync Local Chats to AGI Cloud?' dialog with action 'Sync to Cloud' (src/features/settings/data-controls/index.tsx:181-188).
- CLI: first-run auth menu entry 'Local model, no account required' (apps/cli/src/onboarding.rs:262-280,855-868).
- VS Code: runs against local models, own provider keys or AGI Cloud, so no sign-in is needed for local (apps/extension-vscode/package.json:4).
- Desktop and Chrome: no guest mode found.

**Before you start**

- Web guest: server flag guest.chat on for the visitor, bot protection ready, no browser session cookie (guest-chat-access.ts:15-33; chat/layout.tsx:40-44).
- Mobile: age confirmation first (rootRouting.ts:36-43).
- CLI Local: Ollama or LM Studio running with a pulled model (onboarding.rs:50-70).

**Screens and controls**

- Web guest: message box, daily-limit counter, a short age step for guests (GuestAgeStep.tsx), links to sign up and sign in.
- Mobile: 'Continue in Local Mode', sign-in screen; sync dialog with warning that an interrupted copy can leave some text in Cloud and another copy can duplicate.
- CLI: menu choices for local, own key, other providers, skip.

**Journey**

1. Web guest: open /chat signed out; answer the guest age step; send messages until the daily limit; sign up to continue (nothing carries over).
2. Mobile: open app, answer age, finish setup, choose Local Mode or sign in to Cloud; later in Settings sign in, switch chat to AGI Cloud, review the text-copy summary and press 'Sync to Cloud'.
3. CLI: choose local at first run, pick a local model, start chatting; sign in later with agi login.
4. Plans and trials: not part of these journeys.

**What the person sees and gets**

- Web guest: remaining message counter and rate limit headers; blocked message when limits are reached or guest chat is closed.
- Mobile sync: summary of conversations and messages, exclusions (temporary, empty, unfinished), result counts and errors (localCloudSyncService.ts:12-24).
- CLI: 'Local model, no account needed.' and a hint to start Ollama or LM Studio (onboarding.rs:841-852).

**Settings**

- Server: guest.chat flag and GUEST_CHAT_* limits (device and IP messages per day, spend caps, max messages, max characters, max output tokens, turn timeout) (apps/web/lib/guest-chat/config.ts:5-28).
- Mobile: Local or Cloud chat mode; data controls.
- CLI: provider choice in config.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web guest chat: layout shows GuestChat for signed-out visitors on /chat when the flag is on; messages stay in page memory only; model call at /api/llm/v1/chat/completions/guest with per-device, per-IP and global limits and spend reservation (apps/web/app/chat/layout.tsx:41-52; GuestChat.tsx:71; app/api/llm/v1/chat/completions/guest/route.ts; lib/guest-chat/config.ts).
- Mobile Local Mode: dismissing sign-in returns to the local app and resets the post-sign-in target to Local (login.tsx:140-149).
- Mobile local-to-cloud copy: builds a plan from non-temporary local chats (up to 50 conversations, 100 messages each), asks for confirmation, copies text to Cloud (localCloudSyncService.ts:28-60; index.tsx:148-188).
- CLI: local model path with no account and no cloud login menu (onboarding.rs:840-852).
- VS Code: local models or own keys without AGI sign-in (package.json:4).

**Incomplete**

- No guest-to-account carry-over on web: guest messages live in component state only (GuestChat.tsx:71-79).
- Mobile copy is manual, limited to 50 conversations and 100 messages each, and not a move (localCloudSyncService.ts:28-29).
- CLI and VS Code have no sync of local work to the account found; local sessions stay on the machine (the CLI 'sync' command is for settings, lib.rs:982-985).
- Plans and trials are not part of onboarding: no plan picker or trial step appears in any first-run flow.

**Present but disconnected or switched off**

- Web guest chat is off unless the guest.chat flag evaluates on and bot protection is ready (guest-chat-access.ts:15-33); production state unknown.
- Mobile billing flag is false in this build (v1FeatureFlags.ts:6).

**Not available**

- Guest mode on Desktop and Chrome: not found (Desktop sends signed-out windows to a sign-in screen, signInScreen.ts).
- Trial activation and plan selection inside onboarding on every app.

## 4. Required behaviour

**Established requirements**

- Without an account the user can try the product (guest or local use) and later sign up with guest work carried over or still available. (source: Brief S3.37)
- A user can compare and select a plan and reach a real purchase; not applicable in this area (belongs to billing). (source: Brief S3.33)
- A user can start a trial of a paid plan, see it marked, and have it end on schedule; not applicable in this area. (source: Brief S3.34)
- Local inference on mobile and desktop is free of any paid subscription; sign-in is a separate question. (source: Product context given for this task)
- Guest chat is limited per device, per IP and in total spend. (source: apps/web/lib/guest-chat/config.ts:17-28)

**Acceptance criteria**

1. With the flag on, a signed-out visitor to /chat sees guest chat, can send a message, and sees the remaining count.
2. With the flag off or a session cookie present, the visitor is sent to sign in.
3. The guest limit is enforced: after the daily device limit the visitor is blocked with a sign-up link.
4. On mobile a fresh install can reach a local chat without signing in, after the age screen.
5. Mobile sync shows what will be copied and what is excluded before copying.
6. CLI first run with 'Local model' never shows a cloud login prompt.
7. No plan or trial step appears during onboarding on any app.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Guest limits are a cost control for managed inference (spend caps in micro-dollars) [inferred from config names].
- 'Still available' for CLI and VS Code means local sessions remain on disk after sign-up [inferred; not tested].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer to attach the current guest transcript to the new account at sign-up on web.
- [proposed] Add a plan-aware upgrade note after the guest limit, owned by billing.
- [proposed] Add guest or local-first entry to Desktop if the product wants one.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Chat layout (guest branch) | `apps/web/app/chat/layout.tsx` | Shows GuestChat to signed-out visitors when open. |
| component | GuestChat | `apps/web/features/chat/guest/GuestChat.tsx` | Guest chat UI and limits display. |
| component | GuestAgeStep | `apps/web/features/chat/guest/GuestAgeStep.tsx` | Age check for guests. |
| service | guest-age-check | `apps/web/features/chat/guest/guest-age-check.ts` | Browser local storage for the guest age check. |
| endpoint | POST /api/llm/v1/chat/completions/guest | `apps/web/app/api/llm/v1/chat/completions/guest/route.ts` | Guest model call with limits. |
| config | guest-chat config | `apps/web/lib/guest-chat/config.ts` | Flag key and GUEST_CHAT_* limits. |
| service | guest-chat-access | `apps/web/lib/guest-chat/guest-chat-access.ts` | Flag and bot-protection check. |
| service | guest-chat-service | `apps/web/lib/guest-chat/guest-chat-service.ts` | Model choice, spend reservation and streaming. |
| screen | Mobile sign-in screen | `apps/mobile/app/(auth)/login.tsx` | 'Continue in Local Mode' and sign-in. |
| service | Mobile root routing | `apps/mobile/src/features/auth/services/rootRouting.ts` | Lets signed-out users reach the local app after age and onboarding. |
| service | localCloudSyncService | `apps/mobile/src/features/settings/data-controls/localCloudSyncService.ts` | Builds and runs the local-to-Cloud text copy. |
| screen | Mobile data controls | `apps/mobile/src/features/settings/data-controls/index.tsx` | Sync dialog. |
| command | CLI first-run auth choice | `apps/cli/src/onboarding.rs` | Local model without an account. |
| service | CLI device sign-in | `apps/cli/src/oauth.rs` | Later sign-in. |
| config | VS Code package manifest | `apps/extension-vscode/package.json` | States local, own-key or Cloud use. |
| service | Desktop sign-in screen | `apps/desktop/electron/signInScreen.ts` | What a signed-out Desktop window shows. |
| service | Billing trial policy | `apps/web/lib/billing/trial-policy.ts` | Checkout trial rules (billing, outside onboarding). |
| config | Plan trial days | `packages/contracts/types/src/billing-catalog.ts` | getPlanTrialDays reads trialDays per plan. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Signed-out visitor requests /chat; the server checks there is no session, no browser session cookie, then evaluates the guest flag. | our servers | apps/web/app/chat/layout.tsx:38-52; guest-chat-access.ts:19-33 |
| Guest sends a message; the server reserves guest spend, calls a managed model, streams the answer and settles spend. | our servers | guest/route.ts imports reserveGuestSpend, streamGuestChat, settleGuestSpend |
| Guest transcript stays in page memory; leaving loses it. | device | GuestChat.tsx:71 |
| Mobile local chat runs on the phone; no server call. | device | rootRouting.ts:46-50; onboarding.tsx 'Local chats stay on this device.' |
| Mobile sync reads selected local chats, builds a plan, and after confirmation posts messages to Cloud. | device and our servers | localCloudSyncService.ts:44-60; index.tsx:181-188 |
| CLI Local path uses Ollama or LM Studio on the machine. | device | onboarding.rs:841-852 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Guest chat transcript | Page memory | No | Lost on leave; server-side retention of guest turns not read (unknown). |
| Guest age check minimum | Browser local storage key agi.guest-age-checked-minimum | No | Until cleared; cleared by clearStoredAgeCheck. |
| Guest usage counters and spend | Server rate-limit and spend stores (device, IP, global) | Server | Daily windows; store details not read. |
| Mobile local conversations | Phone local database | Only by the explicit copy | Copy does not delete the local chats. |
| Copied chats in Cloud | Account chat history | Yes | Deletable like any Cloud chat. |

**Models and providers.** Web guest uses a managed model chosen server-side by guestChatModel (lib/guest-chat/guest-chat-service.ts); the exact model is not named here. Mobile Local Mode and CLI Local use on-device inference through providers such as Ollama and LM Studio (provider:ollama, provider:lmstudio for the CLI). Own-key use needs a provider key but no AGI account.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web guest needs none; mobile Local, CLI Local and VS Code local need none. Syncing to Cloud needs a signed-in account. |
| Permissions | Guest: none. Mobile sync: signed-in account (Alert 'AGI Cloud required'). |
| Subscription | none found in the code for guest or local use. Guest chat is limited by cost caps, not by plan. Trials and plans are handled in billing, not here. |
| Limits and metering | Guest defaults: 20 messages per device per day, 100 per IP per day, spend caps per device, IP and globally, 40 messages per conversation, 8,000 characters per message, 2,048 output tokens, 120 s turn timeout (config.ts:17-26). Mobile sync: 50 conversations, 100 messages each. |
| Feature flags | guest.chat (feature flag evaluated per visitor); GUEST_CHAT_* environment variables; mobile FEATURES.billing false. |
| Model compatibility | Guest uses one server-chosen model; local paths use whatever local model the person has. |
| Provider restrictions | Guest chat is available only when bot protection is enforced or the host is not a platform host (guest-chat-access.ts:15-17). |
| Local mode | Local mode on mobile and desktop needs no paid subscription and, on mobile and CLI, no account. Mobile asks only for an age confirmation first. Desktop Local use without sign-in: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Guest chat closed | Visitor is redirected to sign in. | apps/web/app/chat/layout.tsx:53-56 |
| Session cookie present | Goes to session-expired path, not guest. | chat/layout.tsx:41,58 |
| Limit reached | Refusal with limit headers and sign-up link; error body codes GUEST_CHAT_ERROR_CODES. | guest/route.ts:33-55 |
| Guest age refused | Guest sees a refusal and the stored check is cleared. | GuestChat.tsx:79; guest-age-check.ts |
| Mobile sync: not in Cloud chat mode | Alert 'Chat is set to Local Mode'. | data-controls/index.tsx:150-156 |
| Mobile sync: nothing eligible | Alert 'No eligible text to copy'. | data-controls/index.tsx:160-163 |
| Mobile sync interrupted | Result flags outcomeUnknown and warns of possible duplicates. | localCloudSyncService.ts:14-18; index.tsx:184 |
| CLI local model missing | 'No local model selected.' with commands to scan and set a model. | onboarding.rs:937-945 |
| Offline | Local paths run on the device [inferred]; guest chat needs the server; offline handling beyond that not handled in the code found. | searched GuestChat.tsx and guest route |
| Accessibility | Not separately checked for GuestChat; mobile sign-in dismiss button has accessibility label and hint. | login.tsx:340-347 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/guest/GuestChat.test.tsx`: Guest chat UI.
- `apps/web/features/chat/guest/guest-chat-stream.test.ts`: Guest streaming.
- `apps/mobile/__tests__/local-cloud-sync-messages.test.ts`: Local-to-Cloud copy messages.
- `apps/mobile/__tests__/age-gate-guards-cloud-not-local.test.ts`: Age gate before app, Local Mode included.
- `apps/cli/src/onboarding.rs`: Unit tests in the file: Local choice never routes into cloud login (module local_first_run_tests).

**Test scenarios**

- **Web guest happy path**
  1. Turn the guest.chat flag on for the test visitor.
  2. Open /chat signed out in a clean browser.
  3. Answer the age step, send a message.
  - Expected: Streamed answer and remaining count; no data on any account.
- **Web guest limit**
  1. Set the device daily limit to 2 in a test environment.
  2. Send three messages.
  - Expected: Third is refused with a sign-up link.
- **Mobile local first**
  1. Fresh install, enter age, finish setup, choose Continue in Local Mode.
  - Expected: Local chat works with no account; no Cloud calls.
- **Mobile sync**
  1. Create two local chats, sign in, switch to AGI Cloud, open data controls, Sync to Cloud.
  - Expected: Summary then Cloud copies of both; local chats remain.
- **CLI local**
  1. Run first-run, choose Local model, no account.
  - Expected: No cloud login menu appears; model config saved.
- **Plan or trial step**
  1. Walk onboarding on each app.
  - Expected: No plan or trial step appears.

**Where to look when it fails**

- Log '[guest-chat] the switch could not be read, so guest chat stays off'.
- Guest limit headers (GUEST_CHAT_LIMIT_HEADER, GUEST_CHAT_REMAINING_HEADER, GUEST_CHAT_RESET_HEADER).
- Mobile sync result errors and outcomeUnknown.
- CLI message 'Setup interrupted. Run again to continue.'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/web/003-authentication-and-onboarding-screens.md)
- Mobile: [70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/mobile/003-authentication-and-onboarding-screens.md)
- CLI: [70-qa/test-plans/cli/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/cli/003-authentication-and-onboarding-screens.md)
- VS Code: [70-qa/test-plans/vscode/003-authentication-and-onboarding-screens.md](../../70-qa/test-plans/vscode/003-authentication-and-onboarding-screens.md)

## 10. Gaps and dependencies

- **Brief says web guest is missing; the code has a guest chat behind a flag.** Affects: Web (and Desktop if it loads /chat signed out; unknown).. Evidence: apps/web/app/chat/layout.tsx:41-52.. Work needed: Correct the brief and confirm the flag state in production.
- **No carry-over of guest messages on web.** Affects: Web visitors.. Evidence: GuestChat.tsx:71-79.. Work needed: Decide whether to attach transcripts to the new account.
- **No sync of local work to the account on CLI or VS Code.** Affects: CLI, VS Code.. Evidence: No code found; CLI sync is settings only (lib.rs:982-985).. Work needed: Decide whether local sessions should be importable.
- **Plans and trials are billing features; trial support exists in billing code but is outside onboarding and its enabled plans are unknown.** Affects: All apps.. Evidence: apps/web/lib/billing/trial-policy.ts; packages/contracts/types/src/billing-catalog.ts:1047.. Work needed: Billing owner states which plans have trial days; keep out of onboarding.
- **Desktop and Chrome have no no-account use found.** Affects: Desktop, Chrome.. Evidence: signInScreen.ts for signed-out Desktop windows.. Work needed: Decide if Desktop Local use should work without sign-in.
- Not built on: Desktop, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:own-key
- mode:cloud
- SYS-local-inference
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-model-catalog-and-routing
- SYS-inference-providers
- provider:ollama
- provider:lmstudio
- api:POST /api/llm/v1/chat/completions/guest
- F003-08

## Unknown

- Whether the guest.chat flag is on in production.
- Server-side retention of guest turns and counters.
- Whether Desktop (Electron) can reach the guest chat or only the sign-in screen.
- Whether any plan currently has trialDays above zero.
- Whether Chrome can be used without an AGI account in own-key mode (not traced).
- Whether CLI and VS Code local sessions can be imported into an account later.
