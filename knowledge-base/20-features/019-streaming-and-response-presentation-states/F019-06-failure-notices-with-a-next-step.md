---
id: "F019-06"
type: "feature"
title: "Failure notices with a next step"
aliases: ["Rate-limited", "Budget exhausted", "Authentication expired", "Provider unavailable", "Failed with recoverable input", "Failed after partial output", "Turn error notice", "Reference id"]
area: "19 Streaming and response-presentation states"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "partly seen (2 of 6)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S19.21", "S19.22", "S19.23", "S19.25", "S19.26", "S19.27"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-observability-and-operations", "SYS-api-and-contracts", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:own-key", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F019-06 Failure notices with a next step

When a turn fails, the app says why in plain words and offers the next move: retry, switch model, sign in again, shorten the message, or check usage. Text that arrived stays and is marked. Web maps about 30 server codes to 18 causes.

Area: [19. Streaming and response-presentation states](README.md). Requirement items: [S19.21](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1921), [S19.22](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1922), [S19.23](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1923), [S19.25](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1925), [S19.26](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1926), [S19.27](../../10-requirements/capabilities/019-streaming-and-response-presentation-states.md#s1927).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (2 of 6) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns failure codes into one clear sentence plus actions, shows a reference id for support, and never invents a wait time.

**Why it exists.** A raw provider error is useless and sometimes unsafe to show; the person needs the next step.

**Who uses it.** Anyone whose turn fails: rate limit, plan limit, expired session, provider down, too-long input.

**Problems it solves**

- Wrong fixes: shortening a message when the provider is down.
- Lost partial answers.
- Unactionable errors.

**Use cases**

- Provider overloaded: see Retry and Switch model.
- Rate limit with a stated wait: 'Try again in about 30 seconds'.
- Context too long: told to start a new chat or remove attachments.
- Report a problem quoting 'Reference: <id>'.

## 2. User experience

**Where to find it**

- Web and Desktop: the failure reason on the run summary line plus Retry and Switch model links, or the notice in the composer column.
- Mobile: a red notice under the bubble with Retry and Switch model; a paywall sheet for plan limits.
- CLI: an error line with a hint line.
- VS Code: an error card with headline, optional detail and an action button.
- Chrome: an error bubble with Retry and a Switch model action and optional recovery button.

**Before you start**

- A failed turn.

**Screens and controls**

- Web: 'Retry' (aria 'Retry this response') and 'Switch model' (ChatMessageList.tsx:1827-1845). Switch model is offered only for codes provider_quota_exhausted, provider_overloaded, provider_unreachable, provider_error, provider_billing_exhausted, model_not_found (1823-1830).
- Mobile: 'Retry' and 'Switch model' (MessageBubble.tsx:2895-2921); 'Try again' on a stopped turn.
- VS Code: recovery offers labelled Add credits, Compare plans, See usage, See options (errorPresentation.ts:371-376); sign-in offers.
- Chrome: errorAction switch-model for most codes except auth_required, account_suspended, terms_required, plan_required, policy_blocked, quota_exceeded, cancelled, invalid_request, protocol_error (side_panel.ts:9754-9765).

**Journey**

1. 1. The turn fails mid-stream or at request time.
2. 2. The server sends an error frame with message, code, retryable, optional retryAfterSeconds and requestId (apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:44-70).
3. 3. The app maps the code to a cause and sentence (web turn-error-notice.ts:83-114; mobile messageStreamError.ts:174-190; CLI errors.rs:530-700; VS Code errorPresentation.ts:380-440).
4. 4. Existing text stays; the notice is added.
5. 5. The person uses Retry, Switch model, signs in again, or opens usage.

**What the person sees and gets**

- Web sentences (turn-error-notice.ts:116-151): rate limit 'This model is receiving too many requests right now. Wait a moment and retry, or switch to another model if your plan has one.'; with a stated wait 'Try again in <wait>' (245-254); provider outage; timeout; contextLength 'Start a new chat, remove some attachments, or choose a model with a larger context window.'; messageLength 'Shorten it or send it in parts'; attachment; sessionExpired 'Your session ended before this turn finished. Sign in again, then retry.'; accountLimit 'Open Usage to see when it resets, then retry.'; interrupted 'The part that arrived is kept above. Retry to get a complete answer.'; empty 'The model returned no response for this turn.'
- Web default: "This turn didn't complete. No response was received." (162).
- Reference text: '<text> Reference: <id>' (turn-error-notice.ts:179-190); Chrome and mobile and VS Code append the same.
- Mobile partial prefix: 'Response may be incomplete: <detail>' (messageStreamError.ts:68,179-183).
- CLI hints: 'Run agi login to sign in to your AGI account again.', 'Run agi usage ...' (errors.rs:565-575,610-625).
- VS Code: usage-limit headline with wait or reset time; 'See usage' offer (errorPresentation.ts:380-395).

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: error-code to cause table (28 codes listed at turn-error-notice.ts:83-114 to 18 causes at 56-74) and cause sentences; wait stated only if the provider gave one, within 1 to 86,400 seconds (198-223).
- Web: reference id from streamError.requestId or errorRequestId (170-177).
- Web: 45-second grace before a user message with no reply counts as incomplete (266-276,306).
- Web: notices are mutually exclusive: Continue, user Stop, stream error, refusal each own the last message (285-308).
- Web: gateway side builds the error frame with code, retryable, retryAfterSeconds, requestId (upstream-error-copy.ts:44-70).
- Web: raw payload markers are filtered so a provider payload is not shown (ChatMessageList.tsx:92-99).
- Mobile: parseStreamFailure keeps message, code, retryable, retryAfterSeconds and requestId; free-usage text; 401 becomes 'Sign in to AGI Cloud to continue.' with code auth_required; Switch model is withheld for auth, quota and billing codes (apiErrors.ts:94-123; messageStreamError.ts:32-54).
- CLI: error kinds and hints for auth expired, auth missing, rate limit, context overflow, paywall, usage limit, plan excludes model, model unavailable, stream disconnect and four incomplete-turn causes (errors.rs:77-150,505-700,1023-1050).
- VS Code: typed failure codes to category, headline, action and alternative-model offer; wait bounded at 86,400 s (errorPresentation.ts:276-440).
- Chrome: stream failure text with try-again wait, reset label and reference; switch-model action; recovery from quota block (chat-state.ts:520-575; side_panel.ts:9741-9830).

**Incomplete**

- Web: the accountLimit sentence says 'a usage limit' without naming which; it mentions Usage but the function has no link (turn-error-notice.ts:144-145). A separate paywall path exists (ChatMessageList.tsx:725-745).
- Web and mobile: no 'Sign in again' button was found in the notice code opened; only text. Mobile expired-session evidence is only apiErrors.ts:94,123.
- The 45-second grace is on web only; no equivalent found on other apps.
- Brief claim 'VS Code and Chrome map error codes to categories with headlines': confirmed for VS Code (errorPresentation.ts:300-327); Chrome uses the gateway sentence, not a headline table.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Chrome has no code-to-headline table found; it displays server text.

## 4. Required behaviour

**Established requirements**

- A rate-limited turn says so, with when to retry if known. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.21)
- A turn blocked by an exhausted budget or plan limit names it and points to the fix. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.22)
- An expired sign-in says so and offers to sign in again. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.23)
- A provider outage says so and offers retry or another model. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.25)
- A turn failing on user input explains what to change. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.26)
- A turn failing after useful output keeps it and marks the failure. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S19.27)
- Never invent a wait time; only the provider's stated figure up to 24 hours. (source: apps/web/features/chat/lib/turn-error-notice.ts:192-205)

**Acceptance criteria**

1. Force a rate-limit with a stated wait: the notice includes 'about N seconds/minutes' and no invented time when none was stated.
2. Force provider_overloaded: the notice offers Retry and Switch model.
3. Force an expired session: the sentence says sign in again; no retry loop.
4. Send an over-long message: the notice names shortening or a bigger context model.
5. Fail mid-stream: previous text remains and the notice says it may be incomplete or kept above.
6. Force a failure with a request id: 'Reference: <id>' appears and matches the server log.
7. Leave a user message unanswered 10 seconds on web: no failure notice yet; after 45 seconds the default notice appears.
8. Hit a plan limit on mobile: the paywall sheet opens.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A sign-in action should be a control, not only text [inferred from S19.23 'offers to sign in again'].
- Usage limit sentences should name the limit [inferred from S19.22].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Sign in again button on web and mobile.
- [proposed] Name which limit was reached in the web accountLimit sentence.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | turn-error-notice | `apps/web/features/chat/lib/turn-error-notice.ts` | Code to cause table, sentences, reference, wait, grace, resolveTurnErrorNotice. |
| service | continue-generation helpers | `apps/web/features/chat/lib/continue-generation.ts` | hasStreamError, isMessageContinuable, getStreamErrorMessage (imported at turn-error-notice.ts:3). |
| component | web ChatMessageList failure reason and actions | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | streamErrorReason, Retry, Switch model (85-150,1810-1850). |
| service | gateway upstream error copy | `apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts` | Builds the error shape and stream error frame. |
| service | provider error classifier | `packages/ai/provider-runtime/src/errors.ts` | classifyError with retryAfterSeconds. |
| service | mobile messageStreamError | `apps/mobile/src/features/chat/utils/messageStreamError.ts` | parseStreamFailure and streamFailureNoticeText. |
| service | mobile failureCopy | `apps/mobile/services/failureCopy.ts` | statedWait and free usage limit text (11-31). |
| service | mobile apiErrors | `apps/mobile/services/apiErrors.ts` | 401 sign-in message, offersModelSwitch (94-123). |
| component | mobile failure notice | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Notice with Retry and Switch model (2838-2921). |
| service | CLI errors | `apps/cli/src/errors.rs` | CliError kinds, hints, IncompleteTurnCause. |
| service | VS Code errorPresentation | `apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts` | presentTurnFailure, presentChatError, statedWait. |
| service | Chrome chat-state failure helpers | `apps/extension/src/features/side-panel/chat-state.ts` | statedWait, streamFailureText, applyStreamFailure (520-575). |
| component | Chrome handleStreamError | `apps/extension/src/side_panel.ts` | Maps code to action and updates message (9741-9830). |
| config | INCOMPLETE_TURN_GRACE_MS | `apps/web/features/chat/lib/turn-error-notice.ts` | 45,000 ms grace (line 266). |
| test | web turn-error-notice message test | `apps/web/features/chat/lib/turn-error-notice.message.test.ts` | Sentence tests. |
| test | mobile streamFailureNotice test | `apps/mobile/src/features/chat/utils/__tests__/streamFailureNotice.test.ts` | Mobile notice text. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The upstream provider returns an error or ends the stream badly. | outside service | packages/ai/provider-runtime/src/errors.ts:15,114,212 |
| The AGI gateway classifies the error, builds a sentence with code, retryable, wait and request id, and sends it as an error frame or HTTP error. | our servers | upstream-error-copy.ts:7-70 |
| The client stores the error on the message metadata (streamError) and maps the code to a cause and sentence. | device | turn-error-notice.ts:225-264; messageStreamError.ts:97-109 |
| The notice renders with Retry or Switch model; retry re-sends the previous user message. | device | ChatMessageList.tsx:1827-1845 |
| For plan or usage limits the server may return a paywall payload and the client opens a paywall card or sheet. | device and our servers | ChatMessageList.tsx:725-745; apps/mobile/app/(app)/chat/[id].tsx:596-599 |
| The CLI classifies provider HTTP statuses locally (401/403 auth, 429 rate limit, 5xx unavailable) and prints a hint. | device | apps/cli/src/errors.rs:935-945 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| streamError (message, code, retryable, retryAfterSeconds, requestId) on the assistant message metadata | Message metadata on the client and saved message | Saved with the message for Cloud chats [inferred] | Kept with the message |
| Request id | Server log line and response header (upstream-error-copy.ts:34-37) | n/a | Per server log retention (see SYS-observability-and-operations) |

**Models and providers.** The cause depends on the code the provider layer returned, so it varies by provider. A model may be offered as a switch only for route-level failures. Own-key mode: provider credentials rejected maps to the provider outage cause on web (turn-error-notice.ts:92) and to 'key rejected' headlines in VS Code (errorPresentation.ts:419-423). Free shared allowance has its own sentence (146-147).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in expiry is itself one of the failures; the notices are shown to anyone. |
| Permissions | Workspace administrators can block a model or feature (workspacePolicy and twoFactorRequired causes, turn-error-notice.ts:139-142). |
| Subscription | Plan restriction cause 'The selected model is not part of your plan.' (137-138); account limit and shared Free allowance causes; CLI paywall and plan-excludes-model errors; actual entitlement rules are in SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Wait text bounded to 86,400 seconds on web, mobile, VS Code, Chrome; CLI bound unknown. Grace period 45,000 ms on web. |
| Feature flags | None found. |
| Model compatibility | Attachment and context causes are model-specific by nature. |
| Provider restrictions | Provider rate limits and credentials only matter in own-key mode; Cloud hides provider names behind AGI sentences. |
| Local mode | Local mode keeps working when the account or cloud fails: mobile has the constant 'Local mode keeps working.' (failureCopy.ts:33); local failure notices on web and CLI: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Rate limit with no stated wait | No time is invented; generic sentence. | turn-error-notice.ts:245-254 |
| Wait over 24 hours or under 1 second | Ignored. | turn-error-notice.ts:204-205; failureCopy.ts:16 |
| Failure after partial output | Text kept; web 'The part that arrived is kept above.'; mobile prefix 'Response may be incomplete'. | turn-error-notice.ts:148-149; messageStreamError.ts:179-183 |
| No output at all | 'The model returned no response for this turn.' or the default sentence; mobile 'The model finished without returning a response. Try again.' | turn-error-notice.ts:150,161-162; messageStreamError.ts:61-65 |
| User message trailing with no reply | Ignored for 45 seconds, then notice. | turn-error-notice.ts:266-308 |
| Safety refusal | Separate refusal notice, not a generic error. | turn-error-notice.ts:5-17; MessageBubble.tsx (mobile) 2955-2975 |
| Image generation failure | 'Image generation did not finish. Check the status page for an outage, or retry.' | turn-error-notice.ts:233-240 |
| Retry on a failure behind a pause (Chrome) | Pause kept, error text shown. | side_panel.ts:9794-9808 |
| Accessibility | Mobile notice is a button with label '<text> Tap to try again.'; web Retry has aria label. | MessageBubble.tsx:2843-2849; ChatMessageList.tsx:1841-1845 |
| Offline or timeout | timeout cause 'The model took too long to respond.' on web; CLI network hint; VS Code network headline. | turn-error-notice.ts:121-122; errors.rs:640-645; errorPresentation.ts:226-235 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/lib/turn-error-notice.message.test.ts`: Cause sentences [inferred from file name].
- `apps/web/features/chat/lib/turn-error-notice.resolve.test.ts`: Notice resolution [inferred].
- `apps/web/features/chat/lib/turn-error-notice.grace.test.ts`: Grace period [inferred].
- `apps/mobile/src/features/chat/utils/__tests__/streamFailureNotice.test.ts`: Mobile notice text [inferred].
- `apps/mobile/src/features/chat/utils/__tests__/messageStreamError.activity.test.ts`: Stream error from activity [inferred].
- `apps/extension/__tests__/stream-error-retry.test.ts`: Titles read: keeps the provider error out of the message body; offers a model switch beside Retry when the route failed; renders the failure with a retry control; offers retry on a failure that also produced tool activity; renders no failure footer for a successful message; omits retry when no handler.
- `apps/extension-vscode/src/__tests__/errorPresentation.webview.test.ts`: VS Code error cards [inferred].
- `apps/cli/src/errors.rs`: In-file tests including display_rate_limited_with_retry and display_rate_limited_without_retry (1274,1280), display_auth_error (1229).

**Test scenarios**

- **Rate limit with wait**
  1. Return a 429 with a retry-after of 45 from a stubbed provider.
  2. Open the failed turn.
  - Expected: 'Try again in about 45 seconds' on web; no invented time otherwise.
- **Expired session**
  1. Expire the session token.
  2. Send a message.
  - Expected: Sign-in sentence on web and mobile; 'Run agi login' in the CLI.
- **Mid-stream break**
  1. Cut the stream after some text.
  - Expected: Text stays with an interrupted notice and Retry.
- **Too-long input**
  1. Paste text beyond the context limit.
  - Expected: messageLength or contextLength sentence with a fix.
- **Reference id**
  1. Trigger a failure and copy the Reference id.
  2. Search the server log.
  - Expected: One log line with the same id.

**Where to look when it fails**

- Server: log line carrying request id; response REQUEST_ID_HEADER.
- Client: message.metadata.streamError and errorCode.
- CLI: kind strings such as api_rate_limit, auth_expired, usage_limit (errors.rs:505-525).
- Web: INCOMPLETE_TURN_CAUSE_BY_ERROR_CODE for unmapped codes.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/web/019-streaming-and-response-presentation-states.md)
- Desktop: [70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/desktop/019-streaming-and-response-presentation-states.md)
- Mobile: [70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/mobile/019-streaming-and-response-presentation-states.md)
- CLI: [70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/cli/019-streaming-and-response-presentation-states.md)
- VS Code: [70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/vscode/019-streaming-and-response-presentation-states.md)
- Chrome: [70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md](../../70-qa/test-plans/chrome/019-streaming-and-response-presentation-states.md)

## 10. Gaps and dependencies

- **No sign-in-again control on web or mobile notices.** Affects: Web, Desktop, Mobile. Evidence: turn-error-notice.ts:143; apiErrors.ts:94. Work needed: Add a control that starts sign-in.
- **Web account limit sentence does not name the limit.** Affects: Web, Desktop. Evidence: turn-error-notice.ts:144-145. Work needed: Pass which limit (five-hour, weekly) into the sentence.
- **45-second grace only on web.** Affects: Mobile, Chrome, VS Code, CLI. Evidence: turn-error-notice.ts:266. Work needed: Check whether other apps need it.
- **CLI wait bound not verified.** Affects: CLI. Evidence: errors.rs hint uses retry_after directly (610-625). Work needed: Cap or confirm.
- **Chrome has no headline table.** Affects: Chrome. Evidence: side_panel.ts:9741-9830. Work needed: Confirm that gateway sentences cover all codes.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-observability-and-operations
- SYS-api-and-contracts
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:own-key
- mode:local

## Unknown

- How the paywall card and sheet link to Usage and upgrade.
- CLI retry-after bound.
- Provider-specific behaviour in own-key mode beyond the classifier.
- Whether the CLI prints a request id.
