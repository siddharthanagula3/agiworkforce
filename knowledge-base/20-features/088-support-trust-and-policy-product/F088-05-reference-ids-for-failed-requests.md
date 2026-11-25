---
id: "F088-05"
type: "feature"
title: "Reference ids for failed requests"
aliases: ["Reference id", "Request id", "Error ID", "Reference for support", "x-request-id", "Reference: <id>", "S88.08"]
area: "88 Support, trust, and policy product"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S88.08"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:desktop", "surface:chrome", "SYS-chat-turn-pipeline", "SYS-observability-and-operations", "SYS-api-and-contracts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F088-05 Reference ids for failed requests

When a request or chat turn fails, the person sees 'Reference: <id>'. The id is the server request id also written to the server log, so support can find the matching log line. It is shown only on failure and only if the server gave one. Web, mobile, CLI and VS Code show it; Chrome display was not found.

Area: [88. Support, trust, and policy product](README.md). Requirement items: [S88.08](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8808).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** The web error handler puts the request id in every error body and in the response header (apps/web/lib/error-handler.ts:91-116,346). Chat clients keep the id from the failed stream and append it to the failure text (apps/web/features/chat/lib/turn-error-notice.ts:164-190, apps/mobile/src/features/chat/utils/messageStreamError.ts:158-199).

**Why it exists.** When a request fails the user can quote one id to support (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md, S88.08).

**Who uses it.** Any user who sees a failed chat turn or an error page, and support staff searching logs.

**Problems it solves**

- Support cannot find the failing request from a vague description.
- A success must show nothing to report (comment at apps/web/features/chat/lib/turn-error-notice.ts:164-168).

**Use cases**

- A user copies 'Reference: abc' from a failed reply into a ticket.
- A CLI script reads the 'reference' field of the JSON error result (apps/cli/src/errors.rs:471-474).
- A VS Code user sees 'Reference' after a failed chat message.

## 2. User experience

**Where to find it**

- Web chat: the notice under a failed reply, e.g. 'This turn didn't complete... Reference: <id>' (apps/web/features/chat/lib/turn-error-notice.ts:179-190). Web error page: 'Reference for support: <id>' and 'Error ID' with the text 'Please include this ID when contacting support.' (apps/web/app/error.tsx:56, packages/ui/i18n/locales/en/errors.json:239-243).
- Desktop: same web app in the window [inferred from AGENTS.md section 5].
- Mobile: failure notice in chat ends with 'Reference: <id>' (apps/mobile/src/features/chat/utils/messageStreamError.ts:199).
- CLI: 'Reference: <id>' on its own line in the failure hint, and the 'reference' key in --json results (apps/cli/src/errors.rs:1052-1058, apps/cli/src/errors.rs:471-474).
- VS Code: chat error headline with 'Reference' (apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:350-353,488).
- Chrome extension: not found in apps/extension/src.

**Before you start**

- A failed request or turn that carried an id from the server.

**Screens and controls**

- No control; it is text in the error notice. Web error page also shows an id label.

**Journey**

1. 1. A chat turn or request fails.
2. 2. The notice shows the usual explanation and 'Reference: <id>'.
3. 3. The person copies it into a ticket or email (F088-02).
4. 4. Support searches the server log for that id.

**What the person sees and gets**

- Text 'Reference: <id>' appended to the failure message; nothing on success; nothing when the server gave no id.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web server: every wrapped API response gets the request id header; error bodies carry requestId (apps/web/lib/error-handler.ts:91-116,247-256,346).
- Web chat client: reads requestId from the stream error or errorRequestId in message metadata and appends 'Reference: ...' only when present (apps/web/features/chat/lib/turn-error-notice.ts:164-190,226,304; apps/web/lib/hooks/useChatStream.ts:655-681).
- Upstream provider rejections log the correlation id and return it in the error shape (apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:244-275).
- Mobile: reference appended only when the server logged one (apps/mobile/src/features/chat/utils/messageStreamError.ts:158-199).
- CLI: reference in hint and JSON result; a test asserts the line ends 'Reference: req_7f3a' and is absent without an id (apps/cli/src/errors.rs:1494-1500).
- VS Code: typed failure carries requestId and the headline adds it (apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:298,350-353).

**Incomplete**

- Chrome: the stream chunk type carries a requestId field (apps/extension/src/features/cloud-bridge/managedChatHandler.ts:166,934), but no place that displays 'Reference' to the user was found in apps/extension/src; so the brief's 'chrome done' is not confirmed.
- Desktop has no separate display; relies on the hosted web app [inferred].

**Present but disconnected or switched off**

- nothing found

**Not available**

- Public API 'api done' in the brief: header is set by the wrapper (apps/web/lib/error-handler.ts:346) but not documented elsewhere in files read.

## 4. Required behaviour

**Established requirements**

- When a request fails, the user sees a reference id they can quote to support. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S88.08)
- The id is the one the server already put in its own log line for the failure; shown only on failure. (source: apps/web/features/chat/lib/turn-error-notice.ts:164-168)
- If the server gave no id, no reference is shown. (source: apps/web/features/chat/lib/turn-error-notice.ts:183-190; apps/mobile/src/features/chat/utils/messageStreamError.ts:198-199; apps/cli/src/errors.rs:1496-1500)

**Acceptance criteria**

1. A failed web chat turn with a requestId shows 'Reference: <id>' in the notice.
2. A successful turn shows no reference.
3. A failed turn with no requestId shows no reference text.
4. The API response for an error carries the same id in body and header.
5. The CLI --json error result has a 'reference' value when the engine gave one.
6. The id found in the UI matches a server log line's requestId.
7. Mobile shows the id only when the server logged one.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local-mode failures on device have no server log, so no id applies [inferred; not verified in code].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the id in the Chrome extension side panel.
- [proposed] Offer a copy button on the reference text.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | withErrorHandler / handleError | `apps/web/lib/error-handler.ts` | Creates the request id, adds it to error bodies and the response header. |
| service | upstream-error-copy | `apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts` | Maps provider failures and returns requestId. |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Reads requestId from error frames. |
| service | turn-error-notice | `apps/web/features/chat/lib/turn-error-notice.ts` | turnErrorReference and withTurnErrorReference. |
| screen | Web error boundary | `apps/web/app/error.tsx` | 'Reference for support' on the error page. |
| config | errors.json strings | `packages/ui/i18n/locales/en/errors.json` | turn.reference, supportReference, errorId strings. |
| service | mobile messageStreamError | `apps/mobile/src/features/chat/utils/messageStreamError.ts` | getMessageStreamErrorReference and notice text. |
| service | CLI errors | `apps/cli/src/errors.rs` | Reference line (1052-1058) and JSON reference (471-474). |
| service | VS Code errorPresentation | `apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts` | withFailureReference. |
| service | Chrome managedChatHandler | `apps/extension/src/features/cloud-bridge/managedChatHandler.ts` | Carries requestId in stream chunks; display not found. |
| test | turn-error-notice tests | `apps/web/features/chat/lib/turn-error-notice.message.test.ts` | Message text tests. |
| test | messageStreamError test | `apps/mobile/src/features/chat/utils/__tests__/messageStreamError.activity.test.ts` | Mobile stream error test. |
| test | VS Code errorPresentation test | `apps/extension-vscode/src/__tests__/errorPresentation.webview.test.ts` | Presentation test. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server wrapper assigns or accepts a well-formed request id and logs it with the error. | our servers | apps/web/lib/error-handler.ts:247-256,96-102 |
| Server returns the id in the error body and the response header. | our servers | apps/web/lib/error-handler.ts:105-116,346 |
| Chat stream error frames carry the id to the client; the client stores it in message metadata. | device | apps/web/lib/hooks/useChatStream.ts:655-681 |
| The failure notice text appends 'Reference: <id>' if the id exists. | device | apps/web/features/chat/lib/turn-error-notice.ts:179-190 |
| The person quotes it; support searches logs. | our servers | log field requestId at apps/web/lib/error-handler.ts:101 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Request id string | Server logs; client message metadata (streamError.requestId or errorRequestId) | Message metadata may sync with chat history [unknown] | Log retention unknown |

**Models and providers.** The id belongs to our gateway request, not the model provider. Provider rejection logs include provider name and category beside the id (apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:244-256).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None needed to see an id. |
| Permissions | None found in the code. |
| Subscription | None found in the code. |
| Limits and metering | None found in the code. |
| Feature flags | None found in the code. |
| Model compatibility | Applies to any model routed through our gateway. |
| Provider restrictions | Own-key requests that go direct to a provider (not through our server) would carry no id from us [inferred]; not verified. |
| Local mode | A purely on-device turn has no server log, so no server id; unknown how the apps show a local failure reference. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Success | No reference shown. | apps/web/features/chat/lib/turn-error-notice.ts:164-168 |
| Failure with id | Reference appended. | apps/web/features/chat/lib/turn-error-notice.ts:183-190 |
| Failure without id | Plain message. | apps/cli/src/errors.rs:1496-1500 |
| Malformed inbound id | Server generates its own id when the inbound one is not well formed. | apps/web/lib/error-handler.ts:247 |
| Retry | A new attempt gets a new id; the old id stays on the old message [inferred]. | Inferred from per-request id creation at apps/web/lib/error-handler.ts:247; not verified by a run |
| Accessibility | Web turn notice uses role alert. | apps/web/features/chat/pages/WebChatPage.tsx:6885-6890 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/lib/turn-error-notice.message.test.ts`: Turn error messages (contents not opened).
- `apps/web/lib/__tests__/error-handler.trace.test.ts`: Error handler tracing (contents not opened).
- `apps/cli/src/errors.rs`: Inline test: 'Reference: req_7f3a' present with an id, absent without (lines 1494-1500).
- `apps/extension-vscode/src/__tests__/errorPresentation.webview.test.ts`: VS Code error presentation (contents not opened).
- `apps/mobile/src/features/chat/utils/__tests__/messageStreamError.activity.test.ts`: Mobile stream error (contents not opened).

**Test scenarios**

- **Failed web turn**
  1. Force a gateway failure on a chat turn.
  2. Read the notice.
  - Expected: Message ends with 'Reference: <id>'; the log has the same requestId.
- **Successful turn**
  1. Send a normal message.
  - Expected: No reference text.
- **No id**
  1. Simulate a stream error frame without requestId.
  - Expected: No reference text.
- **CLI JSON**
  1. Run a failing prompt with JSON output.
  - Expected: Result has 'reference' string or null.
- **Chrome**
  1. Fail a managed chat turn in the side panel.
  - Expected: Unknown: check whether an id is displayed.

**Where to look when it fails**

- Server log 'API error' with requestId (apps/web/lib/error-handler.ts:95-103).
- Response header named by REQUEST_ID_HEADER.
- Provider log '[upstream] provider rejected the request'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/088-support-trust-and-policy-product.md](../../70-qa/test-plans/web/088-support-trust-and-policy-product.md)
- Desktop: [70-qa/test-plans/desktop/088-support-trust-and-policy-product.md](../../70-qa/test-plans/desktop/088-support-trust-and-policy-product.md)
- Mobile: [70-qa/test-plans/mobile/088-support-trust-and-policy-product.md](../../70-qa/test-plans/mobile/088-support-trust-and-policy-product.md)
- CLI: [70-qa/test-plans/cli/088-support-trust-and-policy-product.md](../../70-qa/test-plans/cli/088-support-trust-and-policy-product.md)
- VS Code: [70-qa/test-plans/vscode/088-support-trust-and-policy-product.md](../../70-qa/test-plans/vscode/088-support-trust-and-policy-product.md)
- Chrome: [70-qa/test-plans/chrome/088-support-trust-and-policy-product.md](../../70-qa/test-plans/chrome/088-support-trust-and-policy-product.md)

## 10. Gaps and dependencies

- **Chrome display of the id not found; brief says done.** Affects: Chrome. Evidence: no 'Reference' string in apps/extension/src (grep). Work needed: Confirm or build display.
- **Desktop and public API only verified by inference.** Affects: Desktop, API. Evidence: brief S88.08. Work needed: Run the desktop app to confirm.
- **Local-mode failures have no reference story.** Affects: Mobile, desktop, CLI in Local mode. Evidence: no code found. Work needed: Decide whether a local error id is needed.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:desktop
- surface:chrome
- SYS-chat-turn-pipeline
- SYS-observability-and-operations
- SYS-api-and-contracts

## Unknown

- Whether Chrome displays an id anywhere.
- Log retention window for request ids.
- Whether desktop shows the id beyond the hosted web UI.
- How local-only failures are labelled.
- Exact id format (generated in a helper not opened).
