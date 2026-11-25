---
id: "F109-06"
type: "feature"
title: "Siri and headset invocation (phone)"
aliases: ["Ask from Siri", "Ask AGI Mobile (App Intent)", "AskAGIIntent", "Siri and headset invocation (S109.13)", "Mobile intent ask"]
area: "109 Optional native and ambient extensions"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "missing", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S109.13"]
depends_on: ["surface:mobile", "mode:cloud", "api:POST /api/mobile/intent/ask", "api:POST /api/mobile/intent-token", "api:DELETE /api/mobile/intent-token", "table:mobile_intent_tokens", "table:web_conversations", "table:web_messages", "store:ios-keychain", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-model-catalog-and-routing", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F109-06 Siri and headset invocation (phone)

On iPhone, saying 'Ask AGI Mobile' to Siri sends the question to AGI Cloud with a stored token and reads the answer aloud without opening the app. It must be switched on in Settings, Security and login, in Cloud mode. No headset-button code exists; headsets work only through Siri. Desktop, Chrome, Android: none.

Area: [109. Optional native and ambient extensions](README.md). Requirement items: [S109.13](../../10-requirements/capabilities/109-optional-native-and-ambient-extensions.md#s10913).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | not built | not built | n/a |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** An iOS App Intent posts the question to /api/mobile/intent/ask with a bearer token from the keychain; the server answers with one short model reply, charges usage, saves it as a chat and returns text that Siri speaks (apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:24-70; apps/web/lib/server/mobile-intent.ts:116-255).

**Why it exists.** The user should start talking to AGI from headphones, earbuds or a voice command without touching the phone (doc: knowledge-base/data/area-briefs/109-optional-native-and-ambient-extensions.md S109.13). The migration says the intent runs without the app open, so it has no identity session and needs its own token (apps/web/db/neon/0349_mobile_intent_tokens.sql header).

**Who uses it.** iPhone users who use Siri by voice, including through connected earbuds [inferred].

**Problems it solves**

- Getting an answer when hands or eyes are busy.
- Unlocking and opening the app for a quick question.
- Running an AI request from Siri with the account's limits and policies applied.

**Use cases**

- Say 'Ask AGI Mobile' then the question with earbuds on [inferred].
- Run the Ask AGI shortcut from the Shortcuts app.
- Open the saved chat later in the app to read the answer.

## 2. User experience

**Where to find it**

- iOS only. In the app: Settings, 'Security and login', switch 'Ask from Siri' (apps/mobile/src/features/settings/account-security/index.tsx:537,579; apps/mobile/src/features/siri/AskFromSiriSetting.tsx:59-71).
- Siri phrases: 'Ask AGI Mobile', 'AGI Mobile answer my question', 'Talk to AGI Mobile' (apps/mobile/native/ios/AGIAppIntents/AppShortcuts.swift) with the app name filled in by the system [inferred].
- Setup guide: Settings, Quick Access, 'Siri & Shortcuts' (apps/mobile/src/features/widget-setup/index.tsx:169).
- Android, desktop, Chrome: not present (apps/mobile/__tests__/WidgetSetupPage.test.tsx:91 says the Android guide makes no Assistant claims).

**Before you start**

- iOS (askFromSiriSupported is iOS only: apps/mobile/src/features/siri/askIntentToken.ts:113-115).
- AGI Cloud mode and a signed-in account; in Local mode the switch is disabled with 'Needs AGI Cloud. Switch to Cloud mode to turn it on.' (AskFromSiriSetting.tsx:61-64,69).
- Permission to share with AI providers (enableAskFromSiri calls ensureCloudSendConsent, askIntentToken.ts:188-193).
- The phone registered to the account (apps/web/app/api/mobile/intent-token/route.ts:35-46).

**Screens and controls**

- Switch 'Ask from Siri' with description 'Ask AGI through Siri and hear the answer, saved as a chat.'
- Alert titles 'Ask from Siri was not turned on' and 'Ask from Siri was not fully turned off' (AskFromSiriSetting.tsx:47-50).
- Siri parameter 'Question' with prompt 'What do you want to ask?' (AskAGIIntent.swift:13-18).

**Journey**

1. Switch on Ask from Siri in Cloud mode and allow sharing with AI providers.
2. The app asks the server for a token for this install and stores it in the keychain (askIntentToken.ts:144-170).
3. Say or type the question to Siri.
4. The intent trims it, refuses empty or over 2,000 characters, and posts it (AskAGIIntent.swift:44-56).
5. Siri speaks the answer; the same text is returned as the result (AskAGIIntent.swift:24-27).

**What the person sees and gets**

- Spoken answer.
- Spoken errors: 'Ask a shorter question.', 'Ask from Siri is off. Open AGI Mobile in AGI Cloud, sign in if asked, and turn on Ask from Siri in Settings, Security and login.', 'Ask from Siri needs to be set up again...' on 401, server messages, or 'AGI Mobile could not answer right now. Try again in the app.' (AskAGIIntent.swift:33-37,43-69).
- A saved chat titled by the first 60 characters of the question (mobile-intent.ts:38,60-96).

**Settings**

- Ask from Siri switch (storage key ask-from-siri-enabled-v1, askIntentToken.ts:27).
- Token default model captured from the app's model choice at enable time (askIntentToken.ts:128-137).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Intent, shortcut phrases, keychain read and the HTTPS post (AskAGIIntent.swift:30-97). The Swift keychain service ends with ':no-auth', which expo-secure-store appends to the service when no authentication is required (apps/mobile/node_modules/expo-secure-store/ios/SecureStoreModule.swift:175), so it matches the TypeScript service name.
- Token issue and revoke endpoints with CSRF check, rate limit, device registration check and audit events (apps/web/app/api/mobile/intent-token/route.ts:23-103).
- Ask route: bearer token lookup, rate limit 6 per minute failing closed, MFA policy, IP allow list, body check, answer, error mapping (apps/web/app/api/mobile/intent/ask/route.ts:26-71; apps/web/lib/rate-limit.ts:112-116).
- Server checks in order: account status, terms, adult eligibility, content moderation, secret handling, entitlement bundle, chat capability for the 'mobile' surface, managed compute access, route choice, cost estimate, usage reservation, model call, usage settle, conversation save with two attempts (apps/web/lib/server/mobile-intent.ts:123-255).
- Token: prefix agi_it_, SHA-256 hash stored, one live token per install, 30 days, revoked on sign-out, switch-off or device removal, rotated on app launch (apps/web/lib/server/mobile-intent-tokens.ts:11-60; apps/web/db/neon/0349_mobile_intent_tokens.sql header).
- Timeouts: server 50 s with maxDuration 60, phone 55 s (route.ts:17,20; AskAGIIntent.swift:51).

**Incomplete**

- Revocation and rotation race cases are source-reviewed only (doc: audit/registers/known-flaws.md:292-293, MOBILE-SIRI-ROTATION-RETRY-01 and MOBILE-SIRI-ROTATION-DISABLE-01).
- A small window can leave a token on the device after a kill (doc: audit/registers/known-flaws.md:343 MOBILE-SIRI-TOKEN-KILL-WINDOW-01).
- The server keeps no record of the provider-sharing permission and does not check it on this route (doc: audit/registers/known-flaws.md:205 WEB-PROVIDER-SHARING-SERVER-RECORD-01).

**Present but disconnected or switched off**

- In Local mode the switch cannot be turned on, but a token that is already on keeps answering through AGI Cloud (doc: audit/registers/known-flaws.md:342 MOBILE-SIRI-LOCAL-MODE-01; AskFromSiriSetting.tsx:61-69).

**Not available**

- Headset or earbud button handling: no code found; nothing in apps/mobile/native handles media buttons (search of native, src, services found only voice audio-route files).
- Android equivalent: none found.
- Desktop and Chrome: not present (brief).

## 4. Required behaviour

**Established requirements**

- The user can start talking to AGI from a headset or earbuds (button or voice command) without touching the phone or computer. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S109.13)
- Ask from Siri sends the question to AGI Cloud; this is the one path where content reaches the managed cloud in Local mode, recorded as a deviation. (source: doc: audit/registers/known-flaws.md:342)
- The ask route applies the account's workspace MFA and IP allow list to the token owner and answers nothing when refused. (source: apps/web/app/api/mobile/intent/ask/__tests__/route.test.ts:76,86)
- The iOS intent must not promise where the AI runs. (source: apps/mobile/__tests__/ios-app-intents-native.test.ts:280-282)

**Acceptance criteria**

1. With Ask from Siri on in Cloud mode, 'Ask AGI Mobile' plus a question returns a spoken answer and a saved chat.
2. With the switch off, Siri says Ask from Siri is off and names Settings, Security and login.
3. An empty question or one over 2,000 characters is refused on the phone and by the server (400).
4. A revoked or expired token gives 401 and the 'set up again' message.
5. A request beyond 6 per minute is rate limited; a workspace needing MFA or limiting IPs is refused.
6. An account with no model access gets a 403 with a reason and no model call or usage reservation.
7. Turning the switch off revokes the token on the server.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Earbuds and headsets work only because Siri routes their voice command to the intent [inferred]; there is no AGI code for a headset button.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether switching to Local mode turns Ask from Siri off (open owner question in MOBILE-SIRI-LOCAL-MODE-01).
- [proposed] Add a server record of the provider-sharing permission and check it on this route.
- [proposed] Decide if an Android equivalent is wanted.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | AskAGIIntent / AGIAskClient | `apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift` | App Intent, local length check, HTTPS call, spoken errors. |
| config | AGIAppShortcuts | `apps/mobile/native/ios/AGIAppIntents/AppShortcuts.swift` | Siri phrases for the Ask AGI shortcut. |
| service | askIntentToken | `apps/mobile/src/features/siri/askIntentToken.ts` | Enable, disable, rotate and revoke the token; keychain write. |
| component | AskFromSiriSetting | `apps/mobile/src/features/siri/AskFromSiriSetting.tsx` | The settings switch. |
| screen | Security and login screen | `apps/mobile/src/features/settings/account-security/index.tsx` | Hosts the switch (line 579). |
| hook | device registry heartbeat | `apps/mobile/src/features/device-registry/useDeviceRegistryHeartbeat.ts` | Registers the phone; mentions Ask from Siri (file matched the Siri search; role in rotation not traced). |
| endpoint | POST /api/mobile/intent/ask | `apps/web/app/api/mobile/intent/ask/route.ts` | Authenticates by token, applies limits and policy, returns the answer. |
| service | answerMobileIntentAsk | `apps/web/lib/server/mobile-intent.ts` | All server checks, routing, usage reservation, model call, chat save. |
| endpoint | POST and DELETE /api/mobile/intent-token | `apps/web/app/api/mobile/intent-token/route.ts` | Issue and revoke tokens. |
| service | mobile-intent-tokens | `apps/web/lib/server/mobile-intent-tokens.ts` | Hash, store, resolve, revoke tokens. |
| schema | mobile intent contracts | `packages/contracts/cloud-contracts/src/mobile-intent.ts` | Request and response schemas and the 2,000-character cap. |
| table | mobile_intent_tokens | `apps/web/db/neon/0349_mobile_intent_tokens.sql` | Hashed per-install tokens with row level security. |
| table | web_conversations and web_messages | `apps/web/lib/server/mobile-intent.ts` | Saved chat for each answer (source 'siri' in message metadata). |
| config | mobile-intent-ask rate limit | `apps/web/lib/rate-limit.ts` | 6 per minute, fail closed (line 112). |
| service | managed usage reservation | `apps/web/lib/services/managed-usage-request-service.ts` | Reserve, mark started and finalize usage. |
| service | managed compute access | `apps/web/lib/services/managed-compute-access.ts` | Plan and spend decision for the mobile surface. |
| test | ask route tests | `apps/web/app/api/mobile/intent/ask/__tests__/route.test.ts` | IP allow list, MFA, token, cap. |
| test | usage and saving tests | `apps/web/lib/server/__tests__/mobile-intent-usage.test.ts` | Reservation, settle, redaction, save and age gates. |
| test | Siri token tests | `apps/mobile/__tests__/ask-intent-token.test.ts` | Consent, rotation, revoke ordering. |
| test | iOS native source tests | `apps/mobile/__tests__/ios-app-intents-native.test.ts` | Spoken error messages and no on-device claims. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person turns on the switch; the app asks for consent and requests a token for this install. | device and our servers | apps/mobile/src/features/siri/askIntentToken.ts:144-196; apps/web/app/api/mobile/intent-token/route.ts:23-65 |
| Token is stored in the iOS keychain, readable after first unlock, this device only. | device | askIntentToken.ts:29-32,155-160 |
| Siri runs the intent; it posts the question with the bearer token over HTTPS. | device | apps/mobile/native/ios/AGIAppIntents/AskAGIIntent.swift:43-56 |
| Server resolves the token, rate limits, checks MFA and IP, validates the body. | our servers | apps/web/app/api/mobile/intent/ask/route.ts:26-48 |
| Server checks account, terms, age, moderation, secrets, plan and managed compute access, picks a route and reserves usage. | our servers | apps/web/lib/server/mobile-intent.ts:123-229 |
| Server calls the model provider, settles usage and saves the chat. | outside service | apps/web/lib/server/mobile-intent.ts:231-255 |
| The phone speaks the returned text. | device | AskAGIIntent.swift:24-27 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Ask token (hash) | Table mobile_intent_tokens on the server; plaintext only in the iOS keychain | Server-side; the phone holds one copy | 30 days, revoked on switch-off, sign-out, device removal; row deleted with the profile (0349 header) |
| Question and answer | web_conversations and web_messages on the server | Yes, appears as an account chat | Follows chat retention and deletion; question stored unredacted, provider gets the redacted text (apps/web/lib/server/__tests__/mobile-intent-usage.test.ts:228) |
| Usage record | Managed usage request records | Server only | unknown |

**Models and providers.** Route is chosen by selectUnattendedRoute with the token's default model, falling back to automatic selection, and refuses if no model on the plan keeps chats out of training (apps/web/lib/server/mobile-intent.ts:178-195). Provider is whichever the route returns: unknown from this file. Prompt carries a plain-speech directive (mobile-intent.ts:44-45).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account in Cloud mode to enable; later calls need only the token. Account status, terms and adult eligibility are re-checked per request (mobile-intent.ts:123-140). |
| Permissions | Share-with-AI-providers consent on the phone; keychain access; workspace MFA and IP rules (route.ts:34-43). |
| Subscription | Entitlement bundle, chat capability for surface 'mobile' and managed compute access decide access; usage reserved with the plan tier (mobile-intent.ts:155-176,210-229). Per-plan outcomes: unknown (services not read). |
| Limits and metering | 6 requests per minute per token; prompt up to 2,000 characters (packages/contracts/cloud-contracts/src/mobile-intent.ts:4); usage reserved with a 120-second lease and settled from measured tokens; token valid 30 days. |
| Feature flags | Capability gate 'canChat' (mobile-intent.ts:158-168); the in-app switch. |
| Model compatibility | Tool-free, non-streaming chat completion only (0349 header); the token capability is fixed to chat_completion (mobile-intent-tokens.ts:136). |
| Provider restrictions | No-training routes only when policy requires; otherwise a refusal 503 no_training_model_available (mobile-intent.ts:188-190). |
| Local mode | The switch cannot be turned on in Local mode, but an already-issued token still sends the question to AGI Cloud (doc: audit/registers/known-flaws.md:342). There is no on-device Siri answer path. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Switch off or token missing | Spoken 'Ask from Siri is off...' | AskAGIIntent.swift:33-34,49 |
| Token rejected (401) | Spoken 'needs to be set up again' | AskAGIIntent.swift:35-36,62 |
| Empty or over-long question | 'Ask a shorter question.' on the phone; 400 invalid_request on the server | AskAGIIntent.swift:44-47; route.ts:45-48 |
| Rate limit | Limited response | route.ts:31-32; rate-limit.ts:112-116 |
| Timeout or network error | 'AGI Mobile could not answer right now. Try again in the app.' | AskAGIIntent.swift:37,67-68 |
| Chat save fails | Answer still returned with conversationId null after two attempts | mobile-intent.ts:98-114,250-255 |
| Model call fails | Usage reservation released as failed | mobile-intent.ts:256-273 |
| Sign-out or account change while enabling | Operation aborted, pending revoke kept | askIntentToken.ts:88-91,160-168 |
| Provider-sharing consent withdrawn | Token forgotten on the phone | AskFromSiriSetting.tsx:27-34 |
| Retry | not handled in the code; the user asks again | AskAGIIntent.swift |
| Accessibility | Voice-first; Siri reads the dialog | AskAGIIntent.swift:26 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/mobile/intent/ask/__tests__/route.test.ts`: IP allow list, MFA, missing token, plain-text answer, prompt cap.
- `apps/web/app/api/mobile/intent-token/__tests__/route.test.ts`: Token issue and revoke route.
- `apps/web/lib/server/__tests__/mobile-intent-usage.test.ts`: Usage reservation and settle, moderation, secrets, saved chat, retries, terms and age gates.
- `apps/web/lib/server/__tests__/mobile-intent-revocation.test.ts`: Session and credential sweeps revoke intent tokens.
- `apps/mobile/__tests__/ask-intent-token.test.ts`: Consent, rotation, disable and revoke ordering.
- `apps/mobile/__tests__/AskFromSiriSetting.test.tsx`: Switch states in Cloud and Local modes and consent withdrawal.
- `apps/mobile/__tests__/ask-from-siri-owed-revoke-local.test.ts`: Owed revoke in Local mode.
- `apps/mobile/__tests__/ios-app-intents-native.test.ts`: Spoken messages and native source rules.

**Test scenarios**

- **Happy path**
  1. Cloud mode, allow sharing, turn on Ask from Siri.
  2. Say 'Ask AGI Mobile', ask a short question.
  - Expected: Spoken plain answer; a new chat with the question exists in the account.
- **Switch off**
  1. Turn the switch off, ask Siri again.
  - Expected: Spoken 'Ask from Siri is off'; token revoked server-side.
- **Local mode leftover**
  1. Enable in Cloud, switch the app to Local, ask Siri.
  - Expected: Currently still answers via AGI Cloud (recorded deviation).
- **Expired token**
  1. Revoke the token on the server, ask Siri.
  - Expected: 401 and the 'set up again' message.
- **Too long**
  1. Ask a question over 2,000 characters.
  - Expected: 'Ask a shorter question.'
- **Blocked account**
  1. Use an account without chat or managed compute access.
  - Expected: 403 with the reason; no usage reserved.

**Where to look when it fails**

- Server log '[mobile-intent] the answer failed', '[mobile-intent] the answered conversation could not be saved', '[mobile-intent] the usage reservation could not be released' (route.ts:65; mobile-intent.ts:107,267).
- Error codes: intent_token_invalid, mfa_required, ip_not_allowed, invalid_request, account_unavailable, terms_acceptance_required, content_policy_violation, secret_handling_blocked, no_training_model_available, answer_unavailable.
- Tables mobile_intent_tokens, web_conversations, web_messages, managed usage records.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md](../../70-qa/test-plans/mobile/109-optional-native-and-ambient-extensions.md)

## 10. Gaps and dependencies

- **Local-mode leftover: Ask from Siri still reaches AGI Cloud after switching to Local** Affects: Mobile iOS users who care about the Local trust boundary. Evidence: audit/registers/known-flaws.md:342; AskAGIIntent.swift (does not know the app mode). Work needed: Owner decision, then turn off or revoke on mode change.
- **Server does not check or record the provider-sharing permission** Affects: Mobile iOS users who withdraw sharing. Evidence: audit/registers/known-flaws.md:205. Work needed: Store the permission server-side and check it on the ask route.
- **No headset or earbud button code; only Siri voice** Affects: Users wanting a button start. Evidence: no media-button handling under apps/mobile/native. Work needed: Product decision and native work.
- **No Android, desktop or Chrome equivalent** Affects: Android, Desktop, Chrome users. Evidence: brief S109.13. Work needed: Product decision.
- **Token rotation and revoke races only source-reviewed** Affects: Mobile iOS sign-out and switching. Evidence: audit/registers/known-flaws.md:292-293,343. Work needed: Device acceptance run.
- **No file records a real Siri run** Affects: all. Evidence: none found. Work needed: Run on device and record.
- Not built on: Desktop (from the capability ledger).

**Depends on**

- surface:mobile
- mode:cloud
- api:POST /api/mobile/intent/ask
- api:POST /api/mobile/intent-token
- api:DELETE /api/mobile/intent-token
- table:mobile_intent_tokens
- table:web_conversations
- table:web_messages
- store:ios-keychain
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-model-catalog-and-routing
- SYS-execution-boundaries

## Unknown

- Which provider and model answer a Siri question for each plan (selectUnattendedRoute and managed compute access not read).
- Per-plan access and quota for the mobile surface.
- Retention of the saved Siri chat beyond normal chat rules.
- Whether any headset-specific behaviour exists beyond Siri.
- Whether the usage record shows the Siri source.
- Role of useDeviceRegistryHeartbeat.ts in Siri token rotation (file matched a search; not read).
