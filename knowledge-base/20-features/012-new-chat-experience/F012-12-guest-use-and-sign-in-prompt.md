---
id: "F012-12"
type: "feature"
title: "Guest use and sign-in prompt"
aliases: ["Guest chat", "Chat without an account", "guest.chat flag", "GuestChat", "Sign up for free / Log in", "S12.24"]
area: "12 New-chat experience"
available_on: ["web", "mobile", "cli"]
implementation: {web: "partial", desktop: "missing", mobile: "built", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S12.24"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "mode:local", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "plan:free", "api:POST /api/llm/v1/chat/completions/guest"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F012-12 Guest use and sign-in prompt

On the web, a signed-out visitor can chat in a limited text-only mode, with a daily message count, spend caps and age confirmation, and prominent 'Log in' and 'Sign up for free' links. It is off unless bot protection is ready and the guest.chat flag is on. Mobile and CLI let people start Local without an account and prompt sign-in for Cloud.

Area: [12. New-chat experience](README.md). Requirement items: [S12.24](../../10-requirements/capabilities/012-new-chat-experience.md#s1224).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Serves the /chat page to signed-out visitors as a guest chat when the switch is on, streams replies from a free-tier model through a guest endpoint, counts and caps use, and shows sign-in and sign-up links. (apps/web/app/chat/layout.tsx:43) (apps/web/app/api/llm/v1/chat/completions/guest/route.ts:226)

**Why it exists.** The brief requires that a signed-out visitor can use the product within stated limits and is prompted to sign in to lift them (doc: knowledge-base/data/area-briefs/012-new-chat-experience.md, S12.24). The brief also records that the web switch is off by owner decision and desktop is declined by a lead ruling of 2026-09-28 (same brief).

**Who uses it.** First-time visitors on the web; indirectly mobile and CLI newcomers who use Local first.

**Problems it solves**

- Visitors can try before signing up.
- Abuse and cost are bounded with bot checks, age confirmation, per-device and per-network limits and spend caps.
- Visitors learn what sign-in unlocks.

**Use cases**

- A visitor opens the chat page and sends a text message.
- A visitor reaches the daily limit and is told to sign in.
- A mobile newcomer uses an on-device model without an account and taps 'Sign in to use Cloud'.
- A CLI newcomer picks 'Local model: Run AI locally, no account required'.

## 2. User experience

**Where to find it**

- Web: the chat page for signed-out visitors, only when guest chat is open: header buttons 'Log in' and 'Sign up for free', greeting, input with placeholder 'How can I help you today?' and a counter of messages left (apps/web/features/chat/guest/GuestChat.tsx:51-52, 229-249).
- Desktop: not offered by ruling; the desktop shell sends a signed-out window to its sign-in screen (apps/desktop/electron/main.ts:764-772).
- Mobile: Local chat needs no account; Cloud entry and the work switch push sign-in ('Sign in to use Cloud') (apps/mobile/app/(app)/(tabs)/chat.tsx:940).
- CLI: onboarding menu offers 'Local model: Run AI locally, no account required' and 'AGI cloud: Sign in to get started' (apps/cli/src/onboarding.rs:262).

**Before you start**

- Web: bot protection ready (enforced or not on a hosted platform) and the guest.chat flag on for this visitor on the web surface (apps/web/lib/guest-chat/guest-chat-access.ts:15-30).
- Web: no browser session cookie (apps/web/app/chat/layout.tsx:41).
- Web: on-device age confirmation (apps/web/app/api/llm/v1/chat/completions/guest/route.ts:119).

**Screens and controls**

- GuestChat page with header links, input, send, age step (GuestAgeStep), notice row and footer.
- Status endpoint reports available, dailyLimit, remaining, signInPath and signUpPath (apps/web/app/api/llm/v1/chat/completions/guest/route.ts:78-90).

**Journey**

1. Visitor opens /chat while signed out and with no session cookie.
2. The layout asks isGuestChatAvailable; if false the visitor is redirected to sign in.
3. If true the guest page shows; the visitor confirms age, types and sends.
4. The server checks CSRF, human check, body shape, age, rate limits, moderation and spend hold, then streams the reply.
5. When a limit is hit the response is 429 with a 'Sign in to keep going' message and sign-in path.

**What the person sees and gets**

- 'You have reached today’s limit for chatting without an account. Sign in to keep going.' (429).
- 'Chat without an account takes text only: up to N messages of M characters. Sign in to attach files or use tools.' (400).
- 'Chat without an account has reached today’s capacity. Sign in to keep going.' (503).
- 'Chat without an account is unavailable just now. Try again in a moment, or sign in.' (503).
- 'Sign in to chat.' (403) when the switch is off.

**Settings**

- Environment names: GUEST_CHAT_DEVICE_MESSAGES_PER_DAY, GUEST_CHAT_IP_MESSAGES_PER_DAY, GUEST_CHAT_DEVICE_SPEND_MICROUSD_PER_DAY, GUEST_CHAT_IP_SPEND_MICROUSD_PER_DAY, GUEST_CHAT_GLOBAL_SPEND_MICROUSD_PER_DAY, GUEST_CHAT_MAX_MESSAGES, GUEST_CHAT_MAX_MESSAGE_CHARS, GUEST_CHAT_MAX_OUTPUT_TOKENS, GUEST_CHAT_TURN_TIMEOUT_MS (apps/web/lib/guest-chat/config.ts:5-15).
- Switch names: feature flag guest.chat and environment switch AGI_BOT_CHALLENGE_ENFORCED (apps/web/lib/guest-chat/config.ts:3) (apps/web/lib/security/bot-challenge-routes.ts:1).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Availability check: needs bot protection ready and guest.chat enabled for the visitor on surface web; any error reading the flag keeps it off and logs a warning (apps/web/lib/guest-chat/guest-chat-access.ts:15-35).
- Guest endpoint with status (GET) and turn (POST) handlers (apps/web/app/api/llm/v1/chat/completions/guest/route.ts:226-227).
- Per-network and per-device rate limits plus spend holds at device, network and global scope, keys prefixed guest-chat:spend: (apps/web/lib/guest-chat/guest-chat-service.ts:40, 264).
- Moderation of user text before spend (apps/web/app/api/llm/v1/chat/completions/guest/route.ts:157).
- The guest model is the default chat model of the Free plan, resolved through the catalog (apps/web/lib/guest-chat/guest-chat-service.ts:38, 73).
- Mobile and CLI Local-first paths with sign-in prompts (apps/mobile/app/(public)/onboarding.tsx:804) (apps/cli/src/onboarding.rs:262).

**Incomplete**

- Web is partial: switched off by owner decision (brief). Turning it on needs AGI_BOT_CHALLENGE_ENFORCED=1 and the guest.chat flag on for surface web (doc: knowledge-base/data/area-briefs/012-new-chat-experience.md).
- Mobile has no guest chat service in code: no 'guest' symbol found in the chat screen; the brief's remark that the guest service was not opened is confirmed as 'not found' (apps/mobile/app/(app)/(tabs)/chat.tsx searched).

**Present but disconnected or switched off**

- Guest chat is off in production by owner decision (brief).
- Desktop declines guest chat by ruling; no desktop code that blocks the hosted guest page was found, only a handler that returns a signed-out window to sign-in (apps/desktop/electron/main.ts:764).

**Not available**

- Guest chat on VS Code and Chrome (brief: n/a).
- Files and tools for guests: text only (apps/web/app/api/llm/v1/chat/completions/guest/route.ts:112).

## 4. Required behaviour

**Established requirements**

- A signed-out visitor can use the product within stated guest limits and is prompted to sign in to lift them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S12.24)
- Guest chat is off unless bot protection is ready and guest.chat is on for the visitor's surface; if the switch cannot be read it stays off and a warning is logged. (source: apps/web/lib/guest-chat/guest-chat-access.ts:15-35)
- Guest spend is tracked per visitor (guest-chat:spend key prefix) and refused when over the limit. (source: apps/web/lib/guest-chat/guest-chat-service.ts:40)
- Desktop declines guest chat; desktop requires sign-in (lead ruling 2026-09-28). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S12.24)
- 18 and over on every surface with a server-held decision (owner decision 2026-11-20). (source: (doc: project memory, owner-product-decisions; code: guest route requires on-device age check, apps/web/app/api/llm/v1/chat/completions/guest/route.ts:119))

**Acceptance criteria**

1. With the switch off, a signed-out visitor to /chat is redirected to sign in and the status endpoint reports available false.
2. With the switch on, the guest chat shows 'Log in' and 'Sign up for free'.
3. A guest turn without age confirmation returns 403 with the age message.
4. The 21st message in a day for a device (default limit 20) returns 429 with the sign-in path.
5. A guest message with attachments or too many characters returns 400 text-only.
6. If the flag service errors, guest chat stays off and a warning '[guest-chat] the switch could not be read' is logged.
7. A guest turn that runs over the spend hold is refused; the hold is released if the turn is refused.
8. Mobile Local chat starts without sign-in and Cloud entry opens sign-in.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Guest replies are not saved to an account because no account exists [inferred].
- Guest chat is a Cloud-managed route (our servers pay) even though the visitor has no account [inferred from the route using a free-tier model].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the remaining count in the status endpoint (remaining is null today).
- [proposed] Block the guest page inside the Electron shell in code, not only by ruling.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | guest-chat-access | `apps/web/lib/guest-chat/guest-chat-access.ts` | Decides if guest chat is open: bot protection and guest.chat flag. |
| config | guest-chat config | `apps/web/lib/guest-chat/config.ts` | Flag key, env names and defaults for limits. |
| service | guest-chat-service | `apps/web/lib/guest-chat/guest-chat-service.ts` | Model selection, system prompt, request building, streaming, spend reserve and settle. |
| schema | guest chat contract | `apps/web/lib/guest-chat/contract.ts` | Request schema, error codes, status type. |
| endpoint | GET and POST guest completions | `apps/web/app/api/llm/v1/chat/completions/guest/route.ts` | Status and turn handlers with CSRF, human check, age check, limits, moderation, streaming. |
| screen | Chat layout | `apps/web/app/chat/layout.tsx` | Shows GuestChat to signed-out visitors when open, else redirects to sign-in. |
| component | GuestChat | `apps/web/features/chat/guest/GuestChat.tsx` | Guest UI with Log in, Sign up for free, input and counter. |
| component | GuestAgeStep | `apps/web/features/chat/guest/GuestAgeStep.tsx` | On-device age confirmation step. |
| service | guest-chat-stream | `apps/web/features/chat/guest/guest-chat-stream.ts` | Client stream reader for guest turns. |
| service | bot challenge | `apps/web/lib/security/bot-challenge.ts` | isBotChallengeEnforced reads AGI_BOT_CHALLENGE_ENFORCED. |
| config | bot challenge env name | `apps/web/lib/security/bot-challenge-routes.ts` | BOT_CHALLENGE_ENFORCEMENT_ENV_VAR. |
| service | anonymous session | `apps/web/lib/csrf.ts` | getOrCreateAnonSession gives the visitor id and cookie. |
| store | guest spend keys | `apps/web/lib/guest-chat/guest-chat-service.ts` | Key-value store keys guest-chat:spend:<scope>:<day> with a two-day expiry (lines 40-41). |
| screen | Electron signed-out handling | `apps/desktop/electron/main.ts` | followSignedInState returns signed-out windows to the sign-in screen (line 764). |
| screen | Mobile cloud sign-in entry | `apps/mobile/app/(app)/(tabs)/chat.tsx` | handleOpenCloudAccess and handleTapWorkMode push sign-in (lines 936-947). |
| screen | Mobile onboarding sign-in | `apps/mobile/app/(public)/onboarding.tsx` | 'Sign in to use Cloud' after device setup (line 804). |
| service | CLI onboarding menu | `apps/cli/src/onboarding.rs` | Local no-account path and AGI cloud sign-in (line 262). |
| test | guest-chat-service.test | `apps/web/lib/guest-chat/__tests__/guest-chat-service.test.ts` | Service tests. |
| test | GuestChat.test | `apps/web/features/chat/guest/GuestChat.test.tsx` | UI tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The /chat layout finds no signed-in user and no session cookie and asks if guest chat is open. | our servers | apps/web/app/chat/layout.tsx:38-45 |
| The access check requires bot protection and evaluates the guest.chat flag for a web visitor. | our servers | apps/web/lib/guest-chat/guest-chat-access.ts:19-30 |
| The browser posts a turn; the server checks flag, CSRF, human caller, schema, age, then per-network and per-device rate limits. | our servers | apps/web/app/api/llm/v1/chat/completions/guest/route.ts:94-141 |
| The server moderates the prompt, prices the turn and reserves spend at device, network and global scope. | our servers | apps/web/app/api/llm/v1/chat/completions/guest/route.ts:157-192 |
| The reply streams from the Free-plan default chat model through its provider route with a turn timeout; the spend hold is settled with real usage. | outside service | apps/web/app/api/llm/v1/chat/completions/guest/route.ts:209-222 |
| Mobile and CLI Local paths run on the device with no account. | device | apps/cli/src/onboarding.rs:835 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Anonymous visitor id and cookie | Cookie and server session helper | No account | unknown |
| Guest spend counters | Key-value store keys guest-chat:spend:... | Server side | Expire after two days (apps/web/lib/guest-chat/guest-chat-service.ts:41) |
| Rate-limit counters guest-chat-ip and guest-chat-device | Rate-limit store | Server side | unknown |
| Guest messages | Kept in the page state for the visit; server persistence not found | No | unknown |

**Models and providers.** The model is the default chat model of the Free plan resolved from the catalog, then mapped to a provider route or gateway (apps/web/lib/guest-chat/guest-chat-service.ts:73-94). Zero-data-retention is recorded when the model is a router (same file:90). Provider names were not read: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None required for web guest chat. A visitor id is created from a cookie. Mobile Local and CLI Local need no account; Cloud needs sign-in. |
| Permissions | Visitor must confirm age on the device; moderation blocks disallowed prompts (apps/web/app/api/llm/v1/chat/completions/guest/route.ts:119, 157). |
| Subscription | No plan: runs as the Free tier model but outside any account usage, using separate guest caps (apps/web/lib/guest-chat/guest-chat-service.ts:38). |
| Limits and metering | Defaults in code: 20 messages per device per day, 100 per network per day, spend caps per device, network and globally, 40 messages of up to 8000 characters per request, 2048 output tokens, 120 s timeout; all overridable by the environment names listed above (apps/web/lib/guest-chat/config.ts:19-27). |
| Feature flags | guest.chat feature flag (surface web) and AGI_BOT_CHALLENGE_ENFORCED; bot protection also counts as ready when not on a hosted platform (apps/web/lib/guest-chat/guest-chat-access.ts:15). |
| Model compatibility | Only the single Free default chat model; no model choice for guests (apps/web/lib/guest-chat/guest-chat-service.ts:73). |
| Provider restrictions | none found beyond the resolved route. |
| Local mode | Guest chat itself is a hosted web feature and does not run Local. Mobile and CLI Local modes need no account and no payment (apps/cli/src/onboarding.rs:262). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Switch off or cannot be read | Off; warning logged; sign-in redirect on page, 403 'Sign in to chat.' on API. | apps/web/lib/guest-chat/guest-chat-access.ts:34 |
| Network or device limit | 429 with reset time and sign-in path. | apps/web/app/api/llm/v1/chat/completions/guest/route.ts:62-72 |
| Global spend cap | 503 capacity message. | apps/web/app/api/llm/v1/chat/completions/guest/route.ts:176 |
| No key-value store or pricing failure | 503 'unavailable just now'. | apps/web/app/api/llm/v1/chat/completions/guest/route.ts:154, 182 |
| Moderation refusal | 422 with refusal text. | apps/web/app/api/llm/v1/chat/completions/guest/route.ts:166 |
| Turn takes too long or client leaves | Aborted by timeout or request signal. | apps/web/app/api/llm/v1/chat/completions/guest/route.ts:201 |
| Visitor has a session cookie | Guest page not shown; session-expired redirect. | apps/web/app/chat/layout.tsx:41 |
| Accessibility | Input labelled 'Message input'; nav labelled 'Account'; messages region labelled. | apps/web/features/chat/guest/GuestChat.tsx:229, 293, 320 |
| Offline / retry | not handled in the code on the server; client stream handling not read. | apps/web/features/chat/guest/guest-chat-stream.ts (not opened) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/guest-chat/__tests__/guest-chat-service.test.ts`: Spend, request building, model.
- `apps/web/features/chat/guest/GuestChat.test.tsx`: Guest UI.
- `apps/web/features/chat/guest/guest-chat-stream.test.ts`: Client stream.
- `apps/web/app/api/llm/v1/chat/completions/guest/__tests__`: Guest route tests (folder exists; files not individually opened).

**Test scenarios**

- **Switch off**
  1. Leave guest.chat off.
  2. Open /chat signed out in a fresh browser.
  - Expected: Redirect to sign-in; GET status shows available false.
- **Switch on**
  1. Enable AGI_BOT_CHALLENGE_ENFORCED and guest.chat for web in a test environment.
  2. Open /chat signed out.
  - Expected: Guest chat with 'Log in' and 'Sign up for free'.
- **Daily limit**
  1. Send messages until the device limit is exceeded.
  - Expected: 429 with sign-in link.
- **Text only**
  1. Post a body with a disallowed field or too long text.
  - Expected: 400 text-only message.
- **Flag read error**
  1. Make the flag service fail.
  - Expected: Guest chat stays off and the warning is logged.
- **Mobile no account**
  1. Fresh install; skip sign-in.
  2. Send a message with a local model.
  - Expected: Works with no account; Cloud entry opens sign-in.

**Where to look when it fails**

- Log lines '[guest-chat] the switch could not be read, so guest chat stays off', '[guest-chat] turn settled', '[guest-chat] the turn could not be priced or held; refusing it'.
- Error codes in GUEST_CHAT_ERROR_CODES (apps/web/lib/guest-chat/contract.ts).
- Key-value keys guest-chat:spend:*.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/012-new-chat-experience.md](../../70-qa/test-plans/web/012-new-chat-experience.md)
- Mobile: [70-qa/test-plans/mobile/012-new-chat-experience.md](../../70-qa/test-plans/mobile/012-new-chat-experience.md)
- CLI: [70-qa/test-plans/cli/012-new-chat-experience.md](../../70-qa/test-plans/cli/012-new-chat-experience.md)

## 10. Gaps and dependencies

- **Guest chat is switched off on the web by owner decision.** Affects: Web visitors. Evidence: brief S12.24 'Unfinished' note. Work needed: Owner decision plus enabling AGI_BOT_CHALLENGE_ENFORCED=1 and the guest.chat flag.
- **Desktop decline is by ruling, with no code gate found against the hosted guest page.** Affects: Desktop. Evidence: apps/desktop/electron/main.ts:764. Work needed: Verify what the Electron window shows for a signed-out visitor when the switch is on.
- **Mobile has no guest service; 'done' in the brief rests on Local use without an account.** Affects: Mobile. Evidence: apps/mobile/app/(app)/(tabs)/chat.tsx searched. Work needed: Clarify the requirement for mobile.
- **Status endpoint never reports remaining messages.** Affects: Web. Evidence: apps/web/app/api/llm/v1/chat/completions/guest/route.ts:81. Work needed: Fill remaining, or drop the field.
- Not built on: Desktop (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- mode:local
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- plan:free
- api:POST /api/llm/v1/chat/completions/guest

## Unknown

- Which provider and model the guest route uses at run time.
- Whether guest messages are stored on the server.
- What the Electron window shows for a signed-out visitor when the switch is on.
- Whether mobile has any guest-specific sign-in prompt beyond the Cloud entry points.
- Current production value of the guest.chat flag (not readable from code).
- Retention of rate-limit counters.
