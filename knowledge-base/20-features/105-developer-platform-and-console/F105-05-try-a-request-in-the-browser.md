---
id: "F105-05"
type: "feature"
title: "Try a request in the browser"
aliases: ["Try a request", "Request playground", "API playground", "Request builder", "Show code", "S105.05", "S105.06"]
area: "105 Developer platform and console"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S105.05", "S105.06"]
depends_on: ["surface:web", "surface:desktop", "api:POST /api/llm/v1/chat/completions", "api:GET /api/llm/v1/models", "SYS-chat-turn-pipeline", "SYS-inference-providers", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "F105-04", "F105-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F105-05 Try a request in the browser

A card in the web Developer console called 'Try a request' sends one chat completion to the gateway using the signed-in session and shows the answer, tool calls, latency, tokens and remaining rate limit. 'Show code' builds a curl command that reads the key from AGI_API_KEY. The brief says missing; the code exists.

Area: [105. Developer platform and console](README.md). Requirement items: [S105.05](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10505), [S105.06](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10506).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a developer pick a model (or 'auto'), type an optional system message and a user message, set max_tokens, temperature and a JSON array of function tools, send the request without an API key, and read the result. The same form generates a curl command for the gateway (apps/web/features/developers/components/RequestPlayground.tsx:151-445).

**Why it exists.** Developers want to try the gateway and copy a working request without writing code first (doc: area brief S105.05 and S105.06 Should lines).

**Who uses it.** A signed-in developer on the web app.

**Problems it solves**

- Trying a model and parameters before writing integration code.
- Getting a correct request shape and header set for curl.
- Seeing tool calls the model makes with readable arguments.

**Use cases**

- Check how a system message changes an answer.
- Test a function tool definition and read the arguments the model returns.
- Copy the curl command into a shell script.

## 2. User experience

**Where to find it**

- Web: /developers, third card titled 'Try a request' (DeveloperConsolePage.tsx:70; RequestPlayground.tsx:243).
- Desktop: the same page if the hosted app is shown [inferred from doc: AGENTS.md section 5]; brief says missing for both web and desktop (doc: area brief S105.05); not opened.
- CLI: no playground; use the curl text. Mobile and extensions: none found.

**Before you start**

- Signed in; a signed-out state shows the error 'You are signed out. Sign in again to load models.' for the model list (use-gateway-models.ts).
- The gateway must accept the session for chat; plan rules are the gateway's (unknown per plan). The card says it 'uses your plan's usage like any chat' (RequestPlayground.tsx:245-247).

**Screens and controls**

- Model select (first option 'auto'; others from the model list, with '(leaving <date>)' when scheduled) (RequestPlayground.tsx:258-289).
- 'System message' textarea, 'User message' textarea, 'max_tokens', 'temperature', 'Tools' (RequestPlayground.tsx:290-355).
- Buttons 'Send request' (shows 'Sending'), 'Show code' / 'Hide code' (356-369).
- Code panel with a 'Copy' button that turns into 'Copied' or 'Copy failed' for about 1.6 seconds (372-390, 24, 231-235).

**Journey**

1. Open Try a request.
2. Pick a model or leave 'auto'.
3. Type a user message (required); optionally system message, max_tokens, temperature, tools JSON.
4. Choose 'Send request'.
5. Read the answer box, 'Tool calls' section if any, the line 'Answered by <model> in <n> ms, <n> tokens in and <n> out', and the rate limit line.
6. Choose 'Show code' then 'Copy' to take a curl command; set AGI_API_KEY before running it.

**What the person sees and gets**

- Answer text in a bordered box or 'The model returned no text.' (RequestPlayground.tsx:407-411).
- Tool calls with name, id and pretty-printed JSON arguments, and finish reason (412-429).
- Rate-limit line '<remaining> of <limit> chat completion requests left in this window, which resets at <time>.' from X-RateLimit headers (430-438).
- Error line '<status>: <message>' from the gateway or 'The gateway answered <status>.' (144-149, 393-396).
- Tools field error 'Tools must be a JSON array.' or 'Tools are not valid JSON.' (80-83).

**Settings**

- Request is non-streaming (stream false) and sets personalization false (RequestPlayground.tsx:114, 183).
- Idempotency-Key is generated per send (185-190).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Form with model, system, user message, max_tokens, temperature, tools; send is enabled only with a non-empty user message and valid tools JSON (172-173).
- Send posts to /api/llm/v1/chat/completions through sendAuthorizedJson with the signed-in session and an Idempotency-Key (181-191).
- Result view with content, tool calls, finish reason, resolved model, latency, token counts and rate-limit headers (202-213, 398-441).
- Curl generation with single quotes escaped, Authorization from $AGI_API_KEY and an Idempotency-Key from uuidgen (121-130, 225).
- Copy with success and failure labels (227-236).
- Model list from the gateway with retirement markers (hook useGatewayModels).

**Incomplete**

- Only one system and one user message; no multi-turn editing (buildRequestBody lines 103-119).
- Only curl is generated, no other languages (S105.06 says copy as code; only curl found).
- No cancel button and no client timeout (not handled in the code, lines 175-223).
- Non-streaming only; no streaming event inspector (a different brief item, S105.07, listed missing).
- The brief's status 'missing' for web and desktop contradicts the code; the brief is stale or the card is unfinished for Desktop (unknown).

**Present but disconnected or switched off**

- Uses the signed-in session, not an API key, so key scopes, key expiry and project spend caps are not exercised by this card [inferred: spend cap runs only when an API key id is present, auth-gate.ts:290-293].

**Not available**

- Mobile, CLI, VS Code and Chrome extensions: no playground.
- Saving or sharing a request: not found.

## 4. Required behaviour

**Established requirements**

- Developers can send test requests to the API from a browser playground and see the response. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.05)
- Developers can compose a request (model, params, messages) in a form and copy it as code. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.06)
- The playground request uses the session, leaves out memory and custom instructions, uses plan usage like a chat and saves nothing to chats. (source: apps/web/features/developers/components/RequestPlayground.tsx:244-248)
- Copy shows 'Copied' or 'Copy failed' briefly then resets. (source: apps/web/features/developers/components/RequestPlayground.tsx:227-236, 379-383)

**Acceptance criteria**

1. Send is disabled while the user message is empty or Tools is not a JSON array.
2. A successful send shows the answer, model, latency and token counts.
3. A gateway refusal (for example 401, 403, 429) shows '<status>: <message>' and no stale answer.
4. A tool-calling model response shows each call with its name, id and formatted arguments.
5. 'Show code' reveals a curl command whose body matches the form values and whose Authorization header is Bearer $AGI_API_KEY.
6. Copy places the command on the clipboard and shows 'Copied'; denied clipboard shows 'Copy failed'.
7. Rate limit headers, when present, show remaining and limit.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Playground use consumes the same credits as a chat [inferred from the card text and that it calls the chat gateway].
- A key-authenticated curl can behave differently from the session send because of key scope and project cap [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a stop button and a client timeout.
- [proposed] Add multi-turn messages and a streaming view.
- [proposed] Generate snippets for more languages.
- [proposed] Update the brief status for S105.05 and S105.06.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | RequestPlayground | `apps/web/features/developers/components/RequestPlayground.tsx` | Form, send, result view, curl builder, copy. |
| hook | useGatewayModels | `apps/web/features/developers/hooks/use-gateway-models.ts` | Model dropdown data and retirement formatting. |
| service | sendAuthorizedJson | `apps/web/features/auth/step-up-fetch.ts` | Authenticated JSON POST with session, line 169. |
| service | managed chat idempotency key | packages/utils/managed-chat-idempotency (not found) (not found) | createManagedChatIdempotencyKey used for the send (import at RequestPlayground.tsx:20). |
| screen | DeveloperConsolePage | `apps/web/features/developers/components/DeveloperConsolePage.tsx` | Mounts the card (line 70). |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | The gateway the card calls. |
| service | chat auth gate | `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts` | CSRF, rate limit, terms, age gate for session callers (lines 270-293). |
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Model list for the dropdown. |
| test | playground tools test | `apps/web/features/developers/__tests__/request-playground-tools.test.ts` | parseTools and toolCallsOf. |
| service | user error message | `apps/web/lib/user-error-message.ts` | toUserMessage for failure text. |
| config | rate limit llm-completion | `apps/web/lib/rate-limit.ts` | Per-user chat completion limit applied to session sends (auth-gate.ts:272). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser builds the JSON body from the form (model, messages, stream false, optional max_tokens, temperature, tools). | device | RequestPlayground.tsx:103-119 |
| Browser posts it to the chat gateway with the session and an Idempotency-Key. | device and our servers | RequestPlayground.tsx:181-191 |
| Server runs CSRF, per-user rate limit, terms and age checks, subscription checks, then routes to a model and provider and returns the completion. | our servers | auth-gate.ts:270-330 |
| The model call goes to the provider chosen by routing. | outside service | SYS-chat-turn-pipeline and SYS-inference-providers (not traced here); unknown details |
| Browser reads the JSON and headers and renders the result; nothing is saved to chats. | device | RequestPlayground.tsx:192-213, 244-248 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Form values and result | React state in the page only | Never. | Lost on reload. |
| Usage record for the request | managed usage ledger (managed_usage_requests) as for any gateway call [inferred] | Server only. | As for other usage (unknown). |

**Models and providers.** Any model the account's plan can run, or 'auto' which the gateway resolves; the card shows the resolved model from x_agi_workforce.routing.resolved_model (RequestPlayground.tsx:206).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in web session required. |
| Permissions | No scope check, because the session is used. |
| Subscription | Whatever the chat gateway enforces for the account's plan; the card states it uses plan usage (RequestPlayground.tsx:245-247). Whether Free accounts may send is unknown. |
| Limits and metering | Per-user llm-completion rate limit (auth-gate.ts:272); remaining shown from X-RateLimit headers; credits metered as a chat. |
| Feature flags | none found in the code. |
| Model compatibility | Tools only matter for function-calling models; the card does not check capability before sending. |
| Provider restrictions | none found in the code. |
| Local mode | none found in the code. [inferred] The card always calls our gateway; it cannot run a Local model. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Before first send | No answer area content. | RequestPlayground.tsx:392-441 |
| Sending | Button 'Sending' with spinner, aria-busy; form can be resubmitted only after it ends. | RequestPlayground.tsx:357-360 |
| Model list loading | Select disabled and aria-busy. | RequestPlayground.tsx:274-275 |
| Model list error | Alert with Retry; 'auto' still selectable. | RequestPlayground.tsx:260-269 |
| Gateway error | '<status>: <message>'. | RequestPlayground.tsx:194-200, 393-396 |
| Network failure | 'The request could not be sent. Try again.' | RequestPlayground.tsx:214-219 |
| Cancel, timeout, retry button | not handled in the code. | RequestPlayground.tsx:175-223 |
| Offline | Falls into the network failure path. | RequestPlayground.tsx:214-219 |
| Accessibility | Labels tied to inputs, aria-invalid on tools, aria-live region for results, aria-expanded on Show code. | RequestPlayground.tsx:259, 348, 364, 392 |
| Touch | Coarse-pointer minimum heights on selects. | RequestPlayground.tsx:276 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/developers/__tests__/request-playground-tools.test.ts`: Tools field accepts empty or a JSON array and explains other input; tool calls read with readable arguments.

**Test scenarios**

- **Basic send**
  1. Sign in; open /developers.
  2. Leave model 'auto', type 'hello', choose Send request.
  - Expected: Answer shown with model, latency and tokens.
- **Bad tools**
  1. Type '{}' in Tools.
  - Expected: Message 'Tools must be a JSON array.' and Send disabled.
- **Tool call**
  1. Paste a function tool definition.
  2. Ask a question that needs it.
  - Expected: Tool calls section lists name and formatted arguments.
- **Curl copy**
  1. Choose Show code, then Copy.
  2. Run it in a shell with AGI_API_KEY set to a key with 'Run inference'.
  - Expected: Same shape of answer; 'Copied' showed in the card.
- **Refusal**
  1. Send while rate limited or on a plan the gateway refuses.
  - Expected: Alert with status and message; no old answer shown.

**Where to look when it fails**

- Gateway error codes in the message.
- X-RateLimit-Remaining, X-RateLimit-Limit, X-RateLimit-Reset response headers.
- Usage entries in managed_usage_requests.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/105-developer-platform-and-console.md](../../70-qa/test-plans/web/105-developer-platform-and-console.md)
- Desktop: [70-qa/test-plans/desktop/105-developer-platform-and-console.md](../../70-qa/test-plans/desktop/105-developer-platform-and-console.md)

## 10. Gaps and dependencies

- **Brief marks S105.05 and S105.06 missing for web and desktop but web code exists.** Affects: Planning and verification.. Evidence: doc: area brief S105.05; RequestPlayground.tsx:151.. Work needed: Update the brief after a Desktop check.
- **One message only, curl only, no cancel or timeout.** Affects: Web users.. Evidence: RequestPlayground.tsx:103-130, 175-223.. Work needed: Add multi-turn, stop control and more snippet languages.
- **Does not exercise key-based auth, scopes or project caps.** Affects: Developers testing keys.. Evidence: Session auth at RequestPlayground.tsx:181.. Work needed: Offer an option to send with a pasted key.
- **No component test for send, error and copy flows.** Affects: Regression safety.. Evidence: Only request-playground-tools.test.ts found in features/developers/__tests__.. Work needed: Add tests.

**Depends on**

- surface:web
- surface:desktop
- api:POST /api/llm/v1/chat/completions
- api:GET /api/llm/v1/models
- SYS-chat-turn-pipeline
- SYS-inference-providers
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- F105-04
- F105-02

## Unknown

- Whether Free-plan accounts can send from the card.
- Whether the Electron Desktop shows the card.
- Which provider serves a given send (routing not traced).
- How the gateway meters the request against credits (usage code not read).
