---
id: "F017-08"
type: "feature"
title: "Feedback and report"
aliases: ["Rate answer", "Good response / Bad response", "Thumbs up and thumbs down", "Report answer", "Report this response", "Report", "Content report", "Response rating", "S17.29", "S17.30", "S17.31"]
area: "17 Assistant-message components"
available_on: ["web", "desktop", "mobile", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S17.29", "S17.30", "S17.31"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "mode:local", "mode:cloud", "api:POST /api/feedback", "api:DELETE /api/feedback", "api:POST /api/content-report", "api:POST /api/mobile/content-report", "table:feedback", "table:content_reports", "store:content-reports:v1", "SYS-authentication-and-identity", "SYS-observability-and-operations", "SYS-api-and-contracts", "SYS-security-and-privacy"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F017-08 Feedback and report

Lets a person rate an assistant answer with thumbs up or down (press again to remove) and report a harmful or wrong answer. Ratings go to the feedback table; reports go to the content-reports table for trust and safety. Built on web, desktop and mobile; rating only in VS Code; absent in CLI and Chrome.

Area: [17. Assistant-message components](README.md). Requirement items: [S17.29](../../10-requirements/capabilities/017-assistant-message-components.md#s1729), [S17.30](../../10-requirements/capabilities/017-assistant-message-components.md#s1730), [S17.31](../../10-requirements/capabilities/017-assistant-message-components.md#s1731).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Each finished assistant answer carries a Good response and a Bad response control. A rating is tied to that message id and sent to the server; pressing the same control again removes it. A thumbs-down can open a short form with a reason and comment. A separate Report action files a trust-and-safety report about the answer.

**Why it exists.** Ratings tell the team which answers worked. Reports give people a way to flag harmful content; the mobile code names the Google Play generative-AI policy as the reason a report control must exist on every assistant turn (apps/mobile/src/features/chat/components/ReportFlagButton.tsx, header comment). Brief items S17.29-S17.31.

**Who uses it.** Signed-in people on web, desktop (hosted web app) and mobile; VS Code users for ratings; the trust-and-safety team and operators who read the stored rows.

**Problems it solves**

- No signal on whether answers are good (web comment at MessageBubble.tsx:1196-1203 says this was collected nowhere before).
- No in-app way to flag harmful or inaccurate answers.
- Duplicate or double-click reports (client report id is an idempotency key: apps/web/app/api/mobile/content-report/route.ts insert 'on conflict (client_report_id) do nothing').

**Use cases**

- Web: press 'Bad response', choose 'Did not follow instructions' and add a comment, then Submit.
- Web: open the more-actions menu on an answer and choose 'Report this response'.
- Mobile: choose 'Report…' from the message menu, pick a category such as 'Harmful or dangerous', press 'Save report'.
- VS Code: press the helpful or unhelpful button on an answer in the chat panel.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron shows the hosted web app, doc: AGENTS.md section 5): under each assistant answer, thumb-up button labelled 'Good response' and thumb-down labelled 'Bad response'; the tooltip becomes 'Remove rating' once pressed (apps/web/features/chat/components/messages/MessageBubble.tsx:3777-3819). Report is a menu item 'Report this response' in the answer's more-actions menu (MessageBubble.tsx:4062-4073).
- Mobile: message menu items 'Good Response' / 'Remove Good Response', 'Bad Response' / 'Remove Bad Response' and 'Report…' (apps/mobile/src/features/chat/components/MessageBubble.tsx:1708-1718); double-tap on an answer gives a thumbs-up (lines 1630-1637). The accessibility action names are 'Good response', 'Bad response', 'Report' (lines 1817-1824).
- VS Code: native chat panel helpful/unhelpful feedback (apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:680-682) and thumb buttons in the sidebar webview with labels from L10N goodResponse, badResponse, removeRating (webviewContent.ts:4698-4724). No report.
- CLI and Chrome: no rating or report control found. CLI has a separate /feedback command for general product feedback (apps/cli/src/claude_parity.rs:195-206) which is not per-answer.

**Before you start**

- Web, mobile (Cloud conversation) and VS Code ratings need a signed-in account: the server answers 'Sign in to rate a response' (apps/web/app/api/feedback/route.ts:298); mobile throws 'Sign in to rate this Cloud message.' (apps/mobile/stores/chat/chatMessageStore.ts:141); VS Code shows 'sign in to AGI Cloud to rate answers' (answerRating.ts:62-66).
- The answer must be finished (not streaming) and have readable content (web: hasReadableTurn at MessageBubble.tsx:3764; mobile: canRate at MessageBubble.tsx:1625).
- Report on the web server does not require sign-in (user id optional) but needs a CSRF token and passes a rate limit (content-report route).

**Screens and controls**

- Web: two icon buttons with pressed state (aria-pressed) and a details form (heading from ResponseRatingDetails.tsx) with a 'Reason' group, a text area 'What was wrong with this response?', a 'Close feedback form' button and 'Submit' (apps/web/features/chat/components/messages/ResponseRatingDetails.tsx:124-208).
- Web report: a menu item that reads 'Report this response', then 'Reporting…', then 'Reported' (MessageBubble.tsx:4062-4073). There is no confirmation step and no category choice: category is fixed to 'harmful' and the note is empty (MessageBubble.tsx:1170-1185).
- Mobile report sheet: title 'Report this response'; six categories (Harmful or dangerous, Inaccurate or misleading, Offensive or hateful, Misinformation, Privacy concern, Other); 'Additional details (optional)' up to 500 characters; checkbox 'Email this report to support'; buttons 'Save report' and 'Cancel' (apps/mobile/src/features/chat/components/ReportFlagButton.tsx).
- Mobile result screen titles: 'Report submitted for review', 'Send this report to AGI?', 'Report queued', 'Report saved on this device' with Send, 'Email support instead' and Done or Cancel (ReportFlagButton.tsx DELIVERY_TITLE and DELIVERY_BODY).

**Journey**

1. Rate: 1. Wait for the answer to finish. 2. Press Good response or Bad response. 3. The button lights up at once (optimistic). 4. On thumbs-down on web or Cloud mobile, a details form opens; pick a reason and/or write a comment and press Submit, or close it. 5. Press the lit button again to remove the rating.
2. Report on web: 1. Open the answer's more-actions menu. 2. Choose 'Report this response'. 3. The item reads 'Reporting…' then 'Reported' and a toast says 'Reported. Thank you: our trust and safety team will review it.'
3. Report on mobile: 1. Message menu, 'Report…'. 2. Pick a category (Save report stays disabled until one is chosen). 3. Optionally add details or tick the email option. 4. Press 'Save report'. 5. Read the result sheet. If it says 'Send this report to AGI?', press Send to consent, or 'Email support instead'.

**What the person sees and gets**

- Web rating: pressed state; on failure a toast 'Could not send that. Please try again.' or 'Could not remove your rating. Please try again.'; a rate-limit sentence 'You've sent a lot of feedback in the last hour. Try again later.' (packages/contracts/cloud-contracts/src/response-rating.ts).
- Web report: success toast above; failure toast 'Could not send the report. Please try again.' and the menu item returns to normal (MessageBubble.tsx:1190-1193).
- Mobile rating toast: 'Thanks for your feedback' or 'Rating removed' (MessageBubble.tsx:244-249).
- Mobile report body texts: 'Your report was sent to the AGI safety team for review.', 'Saved on this device. Nothing was sent.', 'Saved on this device. It sends as soon as it can.' (ReportFlagButton.tsx).
- Details form note that tells what is stored: 'Your rating, reason and comment are saved with your account, this chat and response IDs, and your browser and device details. The response text is not attached.' (response-rating.ts RESPONSE_RATING_SHARING_NOTE).

**Settings**

- none found in the code (no setting to hide the controls).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web rating: optimistic UI, queued requests so a removal waits for the vote before it, rollback and toast on failure (MessageBubble.tsx:1213-1360).
- Server stores one rating per user and message by deleting any previous row and inserting the new one in a transaction under an advisory lock (apps/web/app/api/feedback/route.ts:37-46, 285-300); DELETE with message_id removes it (route.ts:401-422).
- Web report posts to /api/content-report with a client-generated reportId; the route re-exports the mobile intake handler (apps/web/app/api/content-report/route.ts; apps/web/app/api/mobile/content-report/route.ts).
- Mobile rating: stores the reaction on the message; for Cloud conversations also posts a rating to the feedback endpoint and patches the cloud message reaction, rolling back on failure (apps/mobile/stores/chat/chatMessageStore.ts:127-243; apps/mobile/src/features/chat/services/cloudMessageMutations.ts:38-89).
- Mobile report: saves to device storage first, then tries the server, with consent-gated queueing and connectivity-triggered flush (apps/mobile/services/contentReport.ts:228-300, 318-357).
- VS Code rating: posts to /api/feedback with Bearer token, remembers rating in extension state (apps/extension-vscode/src/features/feedback/answerRating.ts; submitFeedback.ts).
- Desktop (Electron) inherits web behaviour because it shows the hosted web app (doc: AGENTS.md section 5); I did not run it.

**Incomplete**

- VS Code: rating works (native panel and sidebar) but there is no report (no content-report reference in apps/extension-vscode/src).
- Web report has no category, note or confirmation, unlike mobile (MessageBubble.tsx:1170-1185); the draft's 'confirm' step does not exist on web.
- Mobile details form for thumbs-down is Cloud-only: submitResponseRatingDetails throws RATING_DETAILS_CLOUD_ONLY for non-Cloud conversations (chatMessageStore.ts:1119-1126).

**Present but disconnected or switched off**

- Cloud contracts name 'chrome' as a rating surface with a ready message (response-rating.ts CHROME_RESPONSE_RATING_MESSAGE), but no Chrome source uses it (search of apps/extension/src for response_rating found nothing). The contract exists; the Chrome control does not.

**Not available**

- CLI: no per-answer rating or report found (apps/cli/src/cloud/feedback.rs is general feedback only).
- Chrome: no rating or report found in apps/extension/src.
- VS Code: report not available.

## 4. Required behaviour

**Established requirements**

- A thumbs-up on an answer records positive feedback tied to that message. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S17.29)
- A thumbs-down records negative feedback tied to that message. (source: S17.30 (same brief))
- An answer can be reported (harmful or incorrect) to the trust-and-safety intake from the answer itself. (source: S17.31 (same brief))
- Every async flow has complete states: loading, error, retry, cancellation, offline and permission denial. (source: doc: docs/product/experience-contract.md:82)
- Reports must tell the truth about what happened: a report that never left the phone must never read as submitted. (source: apps/mobile/src/features/chat/components/ReportFlagButton.tsx header comment (code comment, rank 2 intent))
- A mutation fired straight from onClick for an action a user cannot undo must ask first; ratings are undoable, reports are not removable by the user in the code seen. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Pressing Good response on a finished answer lights the button and sends one POST to /api/feedback with feedback_context 'response_rating', rating 'up' and the message id.
2. Pressing the lit button again sends DELETE /api/feedback?message_id=<id> and clears the state.
3. A failed rating request restores the previous state and shows an error message.
4. Choosing 'Report this response' on web sends one POST to /api/content-report and shows the thank-you toast; a failure returns the item to its normal state.
5. On mobile, 'Save report' is disabled until a category is chosen, and the result sheet states truthfully whether the report was sent, queued or only saved on the device.
6. Rating and report controls do not appear while an answer is streaming or on the person's own messages.
7. A signed-out person who presses a rating control is told to sign in rather than seeing a silent failure (VS Code, mobile Cloud; web server returns 401).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reporting from Local mode must stay possible without an account (route comment says user_id is optional so Local-only users can report).
- Once reported, the web item should not allow a second report for the same answer until reload; it does this only in component state ([inferred] from reportState).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a category and note step on the web report to match mobile and the server schema.
- [proposed] Add a report and rating control to VS Code, CLI and Chrome, using the shared feedback contract.
- [proposed] Use the existing Chrome rating surface name in response-rating.ts when building the Chrome control.
- [proposed] Show a different toast for a Local-mode rating that stays on the device.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | MessageBubble (web) rating and report | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Thumb buttons (3760-3825), rateResponse (1294), reportMessage (1170), report menu item (4062). |
| component | ResponseRatingDetails | `apps/web/features/chat/components/messages/ResponseRatingDetails.tsx` | Thumbs-down reason and comment form. |
| store | response-rating-draft-store | `apps/web/features/chat/stores/response-rating-draft-store.ts` | Keeps the open details draft per message (imported by the rating test). |
| schema | response-rating contract | `packages/contracts/cloud-contracts/src/response-rating.ts` | Reasons, copy, limits, FEEDBACK_PATH, request body builder and remove path. |
| endpoint | POST and DELETE /api/feedback | `apps/web/app/api/feedback/route.ts` | Validates, rate-limits ('feedback' bucket), requires sign-in for ratings, replaces or deletes the rating row. |
| endpoint | POST /api/content-report | `apps/web/app/api/content-report/route.ts` | Web alias that re-exports the mobile intake handler. |
| endpoint | POST /api/mobile/content-report | `apps/web/app/api/mobile/content-report/route.ts` | Validates the report, applies the 'mobile-content-report' rate limit, inserts into content_reports with idempotency. |
| config | rate limits | `apps/web/lib/rate-limit.ts` | 'feedback' 120 per hour and 'mobile-content-report' 20 per hour, both fail open. |
| table | feedback | `apps/web/db/neon/0016_misc.sql` | Stores ratings (metadata feedback_context 'response_rating'); index added in 0352_feedback_response_rating_index.sql; answer text dropped by 0353_feedback_ratings_drop_answer_text.sql. |
| table | content_reports | `apps/web/db/neon/0093_content_reports.sql` | Stores reports; triage columns in 0124_content_report_triage.sql; row level security in 0172_content_reports_row_level_security.sql. |
| component | MessageBubble (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | applyReaction (1482), canRate and canReport (1625-1628), menu items (1708-1718), mounts ReportSheet. |
| component | ReportFlagButton and ReportSheet | `apps/mobile/src/features/chat/components/ReportFlagButton.tsx` | Mobile report sheet, categories and delivery outcomes. |
| component | ResponseRatingDetails (mobile) | `apps/mobile/src/features/chat/components/ResponseRatingDetails.tsx` | Mobile thumbs-down details sheet. |
| service | contentReport service | `apps/mobile/services/contentReport.ts` | Saves to device (MMKV key content-reports:v1), posts to server, queues and flushes reports. |
| store | chatMessageStore rateMessage | `apps/mobile/stores/chat/chatMessageStore.ts` | Optimistic reaction, Cloud-only server calls and rollback (127-243, 1116-1138). |
| service | cloudMessageMutations | `apps/mobile/src/features/chat/services/cloudMessageMutations.ts` | recordResponseRatingRemote and setCloudMessageReactionRemote. |
| service | answerRating (VS Code) | `apps/extension-vscode/src/features/feedback/answerRating.ts` | Applies, removes and remembers ratings; sign-in prompt. |
| service | submitFeedback (VS Code) | `apps/extension-vscode/src/features/feedback/submitFeedback.ts` | POST/DELETE to /api/feedback with Bearer token. |
| hook | onDidReceiveFeedback | `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` | Sends helpful/unhelpful from the native chat panel (680-682). |
| component | Sidebar rating buttons | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | paintAnswerRating and appendRatingButtons (4698-4730). |
| component | ChatStateManager rateAnswer | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Handles the rateAnswer message and queues rating calls (2130-2150). |
| component | Admin content report queue | `apps/web/features/admin/components/ContentReportQueuePanel.tsx` | Operator view of reports (file seen in test listing; content not read). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses a rating control; UI updates at once and the reaction is saved on the message. | device | MessageBubble.tsx (web) 1294-1300; mobile MessageBubble.tsx:1482-1492 |
| Web and VS Code and Cloud-mobile send POST /api/feedback with a CSRF or Bearer credential; the server checks the rate limit, requires a signed-in user, then in one transaction deletes any earlier rating for that user and message and inserts the new one into the feedback table. | our servers | apps/web/app/api/feedback/route.ts:285-300, 380-396; replaceResponseRating transaction near line 282 |
| Mobile Cloud rating also patches the cloud message reaction; failure rolls the reaction back. | device and our servers | chatMessageStore.ts:204-231 |
| Mobile Local conversation rating changes only the on-device message metadata; no server call is made. | device | chatMessageStore.ts isCloud gating, lines 133-140, 169, 204-207 (server calls are inside the isCloud branch) |
| Web report posts reportId, messageId, conversationId, category 'harmful', first 500 characters of the answer and an empty note to /api/content-report; server validates with a schema, rate-limits, and inserts into content_reports, ignoring a repeated reportId. | our servers | MessageBubble.tsx:1170-1185; mobile content-report route.ts |
| Mobile report first writes the report to device storage, then tries the server; if that fails (offline or Local-mode egress block) the sheet asks consent to send, then queues it until a send succeeds or connectivity returns. An email hand-off opens the mail app. | device and our servers | apps/mobile/services/contentReport.ts:1-30, 191-300, 341-357 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Rating row (user, rating, reason, comment, message id, conversation id, client details). Answer text is not attached. | table:feedback in Neon Postgres | Written to the server only; the reaction also lives on the message | Deleted when the person removes the rating (DELETE route); retention beyond that: unknown |
| Report (category, note, up to 500-character excerpt, ids, source web or mobile) | table:content_reports | Server only; mobile also keeps a device copy (key content-reports:v1 in MMKV, capped history) | Server retention: unknown. Device copy capped by MAX_STORED_REPORTS, queued reports kept until sent (contentReport.ts capHistory) |
| VS Code remembered ratings | store:agiWorkforce.answerRatings in extension global state (up to 500 entries) | No | Trimmed to 500 (answerRating.ts) |

**Models and providers.** No model or provider is called. The rating and report ride on the app's own server routes. The VS Code message names the model label in the feedback text only (submitFeedback.ts submitAnswerRating).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Rating requires a signed-in account on web (401 otherwise), mobile Cloud conversations and VS Code. Report needs no account on the server (user_id optional). |
| Permissions | CSRF token required on web POST and DELETE; VS Code uses a Bearer account token. No role or workspace permission found. |
| Subscription | No plan or entitlement check found for rating or report in the code read. |
| Limits and metering | Rate limits: 'feedback' 120 per hour; 'mobile-content-report' 20 per hour, both fail open (apps/web/lib/rate-limit.ts:147-156). Neither counts against model usage [inferred; no usage accounting call seen]. |
| Feature flags | none found in the code |
| Model compatibility | Not model-specific. |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local: ratings stay on the device only. Reports are saved on the device; sending to our servers needs the person's consent and passes the Local egress guard only for that report (contentReport.ts header). Web and Desktop have no Local mode for this control. VS Code requires AGI Cloud sign-in to rate. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Rating request fails (web) | Restores the saved rating, shows an error toast; if a details draft is open the failure shows inside the form. | MessageBubble.tsx:1312-1335 |
| Rate limited (web) | Specific sentence about too much feedback. | response-rating.ts RESPONSE_RATING_RATE_LIMITED; test MessageBubble.rating.test.tsx 'says when too much feedback was sent recently' |
| Remove after reload | A removal is sent with the message id. | test MessageBubble.rating.test.tsx 'removes a rating given before the page was reloaded' |
| Report in progress or done (web) | Item shows 'Reporting…' then 'Reported' and is disabled; reverts on failure. State is not saved across reload. | MessageBubble.tsx:1141, 4062-4073 |
| Offline or Local-mode report (mobile) | Report stays on device; sheet title 'Send this report to AGI?'; consent queues it; connectivity flushes it. | ReportFlagButton.tsx DELIVERY_TITLE; contentReport.ts 341-357 |
| Device storage full (mobile) | 'Report could not be saved on this device. Free up space and try again.' | ReportFlagButton.tsx handleSubmit catch |
| No mail app (mobile) | Note says the email could not be opened. | ReportFlagButton.tsx MAIL_UNAVAILABLE_NOTE |
| Signed out (VS Code) | Warning with a 'Sign in' button; rating not recorded. | answerRating.ts:56-70 |
| Empty or streaming answer | Report hidden on an empty assistant turn and while streaming; rating hidden while streaming. | MessageBubble.tsx (mobile) 1625-1628; test MessageBubbleReport.test.tsx 'hides Report on an empty assistant turn and while streaming' |
| Accessibility | Web buttons use aria-label and aria-pressed; mobile sheet exposes categories as buttons with selected state and alert-role errors; VS Code buttons set aria-pressed and labels. | MessageBubble.tsx:3777; ReportFlagButton.tsx; webviewContent.ts:4698-4707 |
| Timeout | not handled in the code beyond the generic fetch failure path. | none specific |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/__tests__/MessageBubble.rating.test.tsx`: Both verdicts offered, one pair only, host sink, no rating on user messages, attribution to message, assistive state, failure rollback, rate-limit sentence, toggle off, remove, ordering and failure of removal.
- `apps/web/app/api/feedback/route.test.ts`: The feedback route (exact cases not read).
- `apps/web/app/api/content-report/__tests__/route.test.ts`: Web content-report alias (cases not read).
- `apps/web/app/api/mobile/content-report/__tests__/route.test.ts`: Mobile intake route (cases not read).
- `packages/contracts/cloud-contracts/src/__tests__/response-rating.test.ts`: Rating contract (cases not read).
- `apps/web/db/neon/feedback-ratings-drop-answer-text-migration.test.ts`: Migration that drops answer text from ratings.
- `apps/mobile/__tests__/ReportFlagButton.test.tsx`: Accessible categories, email option, Save disabled until category, truthful delivery message, private storage diagnostics, email hand-off.
- `apps/mobile/__tests__/MessageBubbleReport.test.tsx`: Report offered on text, image and video turns; hidden when empty or streaming.
- `apps/mobile/__tests__/ResponseRatingDetails.test.tsx`: Mobile thumbs-down details sheet.
- `apps/mobile/__tests__/coverage-wave2-content-report.test.ts`: Content report service (cases not read).
- `apps/extension-vscode/src/__tests__/answerRating.test.ts`: Removal asks the server to delete before clearing the pressed state.
- `apps/web/features/chat/components/messages/__tests__/MessageBubble.emptyTurnActions.test.tsx`: No verdict on a turn stopped before its first token; verdicts present once words exist.
- `apps/web/features/admin/components/ContentReportQueuePanel.test.tsx`: Operator report queue panel.

**Test scenarios**

- **Rate and unrate on web**
  1. Sign in on web and finish an answer.
  2. Press Good response, reload, press it again.
  3. Check the feedback table row for that message id.
  - Expected: One row appears with rating up; after the second press the row is gone.
- **Thumbs-down with reason**
  1. Press Bad response.
  2. Pick 'Incomplete response', add a comment, press Submit.
  - Expected: The row carries reason and comment; the form closes.
- **Report on web**
  1. Open more-actions, choose Report this response.
  - Expected: Toast 'Reported. Thank you...'; a content_reports row with category harmful exists; a second click is disabled.
- **Report failure on web**
  1. Block the network, choose Report this response.
  - Expected: Error toast and the item is usable again.
- **Report in Local mode on mobile**
  1. Use a Local conversation offline, choose Report…, pick a category, Save report.
  - Expected: Sheet says 'Send this report to AGI?' and nothing was sent; pressing Send while online delivers it.
- **VS Code signed out**
  1. Sign out, press an answer's thumb.
  - Expected: Warning with a Sign in button and the thumb returns to its prior state.

**Where to look when it fails**

- Server log message 'Failed to store feedback' (feedback/route.ts) and 'Failed to store content report' (mobile content-report route).
- HTTP 401 on /api/feedback means signed out; 429 means rate limited.
- Tables: feedback (metadata->>'feedback_context' = 'response_rating'), content_reports (client_report_id).
- Mobile device store key content-reports:v1; VS Code global state key agiWorkforce.answerRatings.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/017-assistant-message-components.md](../../70-qa/test-plans/web/017-assistant-message-components.md)
- Desktop: [70-qa/test-plans/desktop/017-assistant-message-components.md](../../70-qa/test-plans/desktop/017-assistant-message-components.md)
- Mobile: [70-qa/test-plans/mobile/017-assistant-message-components.md](../../70-qa/test-plans/mobile/017-assistant-message-components.md)
- VS Code: [70-qa/test-plans/vscode/017-assistant-message-components.md](../../70-qa/test-plans/vscode/017-assistant-message-components.md)

## 10. Gaps and dependencies

- **CLI has no per-answer rating or report** Affects: CLI users. Evidence: Brief S17.29-31 missing; only /feedback exists (claude_parity.rs:195-206). Work needed: Add rating and report commands using the shared feedback contract.
- **Chrome has no rating or report** Affects: Chrome users. Evidence: No response_rating or content-report reference in apps/extension/src; contract already names chrome. Work needed: Add buttons to side-panel bubbles and send via the contract.
- **VS Code has no report** Affects: VS Code users. Evidence: No content-report reference in apps/extension-vscode/src. Work needed: Add a Report action posting to the content-report intake.
- **Web report cannot choose a category, add a note or confirm** Affects: Web and Desktop users, triage quality. Evidence: MessageBubble.tsx:1170-1185 hard-codes category 'harmful'. Work needed: Add a short report form reusing the mobile categories.
- **Local-mode mobile rating shows a thank-you toast but never leaves the device** Affects: Mobile Local users; the team gets no signal. Evidence: confirmRating runs after applyReaction regardless of mode (MessageBubble.tsx:1482-1492); server calls only for Cloud (chatMessageStore.ts:133-231). Work needed: Decide whether Local ratings should stay private and say so, or offer consented sending as reports do.
- **Brief cites chatParticipant.ts:618 for VS Code rating, but the feedback hook is at line 680** Affects: Brief accuracy. Evidence: chatParticipant.ts:680-682. Work needed: Fix the brief reference.
- **Report not persisted as reported after reload on web** Affects: Web users may report twice. Evidence: reportState is component state (MessageBubble.tsx:1141). Work needed: Server idempotency covers the same reportId only; decide dedupe by message.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- mode:local
- mode:cloud
- api:POST /api/feedback
- api:DELETE /api/feedback
- api:POST /api/content-report
- api:POST /api/mobile/content-report
- table:feedback
- table:content_reports
- store:content-reports:v1
- SYS-authentication-and-identity
- SYS-observability-and-operations
- SYS-api-and-contracts
- SYS-security-and-privacy

## Unknown

- How long rows in feedback and content_reports are kept.
- What the operator dashboard does with ratings: only a code comment says they show in feedback counts (MessageBubble.tsx:1201-1204).
- Whether the desktop Tauri app has its own rating code (apps/desktop/src search for 'Good response' found no component).
- Whether mobile passes onSubmitRatingDetails in Local conversations.
- Contents of the feedback and content-report route test cases.
- Which provider routes are involved: none found, since no model is called.
- Whether Chrome has any answer feedback outside apps/extension/src (not searched).
