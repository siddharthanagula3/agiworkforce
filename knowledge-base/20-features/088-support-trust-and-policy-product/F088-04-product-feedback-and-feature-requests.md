---
id: "F088-04"
type: "feature"
title: "Product feedback and feature requests"
aliases: ["Send feedback", "Share feedback", "Report App Issue", "Feature request (S88.06)", "Product feedback (S88.05)", "/feedback", "/bug", "ComposerFeedbackDialog", "Report issue (safety refusal)", "AGI Work feedback"]
area: "88 Support, trust, and policy product"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S88.05", "S88.06"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "api:POST /api/feedback", "api:DELETE /api/feedback", "api:POST /api/mobile/feedback", "table:feedback", "table:feedback_screenshot_cleanups", "SYS-files-artifacts-and-storage", "SYS-authentication-and-identity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F088-04 Product feedback and feature requests

A person sends general feedback, a bug or a feature request from inside web, desktop, mobile, CLI or VS Code. The web and CLI send to /api/feedback, mobile Cloud to /api/mobile/feedback; both store a row in the feedback table. Chrome has none. Mobile in Local or own-key mode opens an email instead.

Area: [88. Support, trust, and policy product](README.md). Requirement items: [S88.05](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8805), [S88.06](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8806).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Collects a typed message (and on web an optional screenshot) plus app version, platform and page, and stores it as a row in public.feedback (apps/web/app/api/feedback/route.ts:37-38,260-279). The same route also stores response ratings, AGI Work task feedback and safety-refusal reports.

**Why it exists.** Users must be able to send general feedback and feature requests from inside the product and have them stored for the team (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md, S88.05 and S88.06).

**Who uses it.** Any user, signed in or not on the web route (getOptionalAuthUser: apps/web/app/api/feedback/route.ts:356); the product team reads the table.

**Problems it solves**

- Ideas and complaints reach the team with context.
- Ratings and refusal reports stay traceable to a message (apps/web/app/api/feedback/route.ts:148-199).

**Use cases**

- A web user chooses 'Feature request' and describes a missing option.
- A phone user sends 'Bug Report' from 'Report App Issue'.
- A CLI user types /bug the diff view hangs.
- A web user hits 'Report issue' on a safety refusal notice.

## 2. User experience

**Where to find it**

- Web: account menu, 'Get help' submenu, 'Send feedback' (apps/web/shared/components/layout/AccountMenuItems.tsx:105-108, apps/web/shared/components/layout/WebAppShell.tsx:515). The dialog is mounted with a hidden trigger at apps/web/shared/components/layout/WebAppShell.tsx:619 and apps/web/features/chat/pages/WebChatPage.tsx:7217. The message-level controls open the 'task' variant (AGI Work feedback) (apps/web/features/chat/components/messages/MessageBubble.tsx:3826) and the safety-refusal variant 'Report issue' (apps/web/features/chat/components/messages/ChatMessageList.tsx:1973).
- Desktop: Help menu, 'Send Feedback' sends the host command that opens the same dialog (apps/desktop/electron/appMenu.ts:557, apps/web/features/desktop-host/hooks/use-host-commands.ts:65-67).
- Mobile: Settings, Support, 'Report App Issue' (also in About) (apps/mobile/src/features/settings/index.tsx:875-885, apps/mobile/app/(app)/about.tsx:283-310).
- CLI: slash commands /feedback, /feedback feature, /bug (apps/cli/src/claude_parity.rs:194-212).
- VS Code: command 'Code: Send Feedback' (agi-workforce.sendFeedback) and Help menu '$(feedback) Send feedback' (apps/extension-vscode/package.json:320-323, apps/extension-vscode/src/features/help/helpMenu.ts:37).
- Chrome extension: none found.

**Before you start**

- Web and desktop: none for a general report (anonymous allowed); sign-in is required for ratings (apps/web/app/api/feedback/route.ts:298).
- Mobile: Cloud mode to post; otherwise email (apps/mobile/src/features/feedback/index.tsx:86,105-112).
- CLI and VS Code: signed in; CLI refuses Local and own-key (apps/cli/src/cloud/mod.rs:373-381, apps/cli/src/cloud/feedback.rs:123-129); VS Code replies 'signed-out' without a token (apps/extension-vscode/src/features/feedback/submitFeedback.ts:34-35).

**Screens and controls**

- Web dialog 'Share feedback': types 'General feedback', 'Something is broken', 'Feature request'; optional screenshot with 'Capture screen' and 'Upload image'; 'Details' (up to 10,000 characters); buttons 'Cancel', 'Send feedback' (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:18-22,330-428).
- Safety variant 'Report an incorrect refusal' with 'Submit report' (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:263-267,415-423).
- Mobile screen 'Report App Issue': type buttons 'Bug Report', 'Feature Request', 'General Feedback'; text field up to 2,000 characters; button 'Submit Feedback' or 'Email Feedback' (apps/mobile/src/features/feedback/index.tsx:31-35,248,306).
- CLI usage text (apps/cli/src/cloud/feedback.rs:37).

**Journey**

1. 1. Open the feedback entry for the app.
2. 2. Pick the type.
3. 3. Type the message (web may add a screenshot).
4. 4. Send.
5. 5. See the thank-you message, or the error and try again.

**What the person sees and gets**

- Web: 'Thanks, your feedback was sent.' or 'Thanks, your report was recorded.'; a note if the screenshot could not be stored (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:306-317).
- Mobile: alert 'Thank You!' / 'Your feedback has been submitted.', or 'Submission Failed' (apps/mobile/src/features/feedback/index.tsx:124-131).
- CLI: 'Bug report sent to the AGI Workforce team. Thank you.' style lines; too long: 'the description is N characters and the limit is 10000. Press Up to edit it, shorten it by M characters and send it again.' (apps/cli/src/cloud/feedback.rs:53-62,83-92).

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: dialog posts to /api/feedback with anti-forgery token; stores row; screenshot up to 4 MiB stored in private object storage when configured (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:165-215, apps/web/app/api/feedback/route.ts:47-86).
- Web route rules: rating needs message id and rating; task feedback needs run id; safety refusal needs message id and finish reason (apps/web/app/api/feedback/route.ts:148-199).
- Web: the dialog is mounted in the app shell and the chat page with a hidden trigger, opened by the account menu and the host command 'open-feedback' (apps/web/shared/components/layout/WebAppShell.tsx:233-236,619; apps/web/features/chat/pages/WebChatPage.tsx:1713,7217).
- Desktop: Help, Send Feedback emits the same command (apps/web/features/desktop-host/hooks/use-host-commands.ts:65-67).
- Mobile: Cloud mode posts /api/mobile/feedback with type, message, client context and optional refusal context (apps/mobile/src/features/feedback/index.tsx:114-121, apps/web/app/api/mobile/feedback/route.ts:39-93).
- CLI: /bug, /feedback, /feedback feature post to /api/feedback with source 'cli' (apps/cli/src/cloud/feedback.rs:65-93).
- VS Code: posts to /api/feedback with source 'vscode' (apps/extension-vscode/src/features/feedback/submitFeedback.ts:25-73).

**Incomplete**

- The brief flags web and desktop 'mount' as unfinished; the code shows the dialog mounted with a hidden trigger in WebAppShell and WebChatPage, so the general entry is reachable (apps/web/shared/components/layout/WebAppShell.tsx:619). The two cited message-level mounts open other variants. Whether the brief's flag refers to something else is unknown.
- Web stores the chosen type only inside the subject text ('Feature request · Web chat'); there is no separate type field (apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:178-184, apps/web/app/api/feedback/route.ts:116-119).
- Mobile in Local or own-key mode only opens an email draft; nothing is stored (apps/mobile/src/features/feedback/index.tsx:105-112).

**Present but disconnected or switched off**

- Web feedback route applies the 'mobile-feedback' limit (10 per hour, fails open) to report submissions after the 'feedback' limit (120 per hour), a possible tight cap for web reports (apps/web/app/api/feedback/route.ts:348,385; apps/web/lib/rate-limit.ts:142-151).

**Not available**

- Chrome extension: no feedback entry found (brief: missing).

## 4. Required behaviour

**Established requirements**

- Users can send general product feedback from inside the product and it is stored for the team. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S88.05)
- Users can submit a feature request from inside the product and it is stored. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S88.06)
- The web route stores the row in public.feedback. (source: apps/web/app/api/feedback/route.ts:37)
- Ratings need a message id; task feedback needs a run id; safety refusal reports need message id and finish reason. (source: apps/web/app/api/feedback/route.ts:148-199)
- A CLI message over 10,000 characters is refused with the number of characters to cut. (source: apps/cli/src/cloud/feedback.rs:53-62)

**Acceptance criteria**

1. Sending general feedback on web returns success and a row appears in public.feedback with source 'web'.
2. A safety-refusal report without a message id is rejected with a 400.
3. A response rating without a rating or message id is rejected.
4. On mobile in Cloud mode, 'Submit Feedback' stores a row with source 'mobile'.
5. On mobile in Local mode, the button reads 'Email Feedback' and opens a mail draft.
6. The CLI in Local mode prints 'nothing is sent to your AGI cloud account in this mode'.
7. A 10,001-character CLI message is refused and not clipped.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Feedback should never carry the user's conversation text; the dialog says prompts and content are not attached [inferred from apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:393-399].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Chrome extension feedback entry.
- [proposed] Store the feedback type as its own field on web.
- [proposed] Let mobile Local mode store feedback only with explicit consent, or label email as the only path.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerFeedbackDialog | `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx` | Dialog with general, task and safety-appeal variants. |
| endpoint | POST/DELETE /api/feedback | `apps/web/app/api/feedback/route.ts` | Validate and store feedback, ratings, refusal reports. |
| endpoint | POST /api/mobile/feedback | `apps/web/app/api/mobile/feedback/route.ts` | Mobile feedback with typed context. |
| table | feedback | `apps/web/db/neon/0016_misc.sql` | Stored rows (user_id, subject, message, metadata). |
| table | feedback_screenshot_cleanups | `apps/web/db/neon/0418_feedback_screenshot_cleanups.sql` | Cleanup record for screenshot objects. |
| config | Rate limits feedback and mobile-feedback | `apps/web/lib/rate-limit.ts` | 120 per hour and 10 per hour. |
| component | WebAppShell mount | `apps/web/shared/components/layout/WebAppShell.tsx` | Mounts dialog; opens from the menu or 'open-feedback'. |
| screen | WebChatPage mount | `apps/web/features/chat/pages/WebChatPage.tsx` | Second mount and 'open-feedback' listener. |
| component | AccountMenuItems | `apps/web/shared/components/layout/AccountMenuItems.tsx` | 'Send feedback' item. |
| hook | use-host-commands | `apps/web/features/desktop-host/hooks/use-host-commands.ts` | Maps the desktop 'send-feedback' command to the dialog. |
| command | Desktop Help menu | `apps/desktop/electron/appMenu.ts` | 'Send Feedback' menu item. |
| screen | Mobile FeedbackScreen | `apps/mobile/src/features/feedback/index.tsx` | Form, email fallback, post. |
| service | Mobile feedback client context | `apps/mobile/src/features/feedback/clientContext.ts` | App version, build, platform, device class, mode. |
| service | CLI feedback | `apps/cli/src/cloud/feedback.rs` | Build and post feedback, 10,000-character limit. |
| command | CLI /feedback and /bug | `apps/cli/src/claude_parity.rs` | Slash command parsing (line 194). |
| service | CLI send_feedback | `apps/cli/src/cloud/mod.rs` | Mode and sign-in checks (line 368). |
| service | VS Code submitFeedback | `apps/extension-vscode/src/features/feedback/submitFeedback.ts` | Posts feedback and ratings. |
| command | VS Code sendFeedback command | `apps/extension-vscode/src/core/commandSetup.ts` | Registers the command (line 1542). |
| service | redactTranscriptText | `apps/web/lib/support/handoff/transcript.ts` | Redacts subject, message and logs before storing. |
| test | feedback route test | `apps/web/app/api/feedback/route.test.ts` | Route tests. |
| test | dialog test | `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.test.tsx` | Component tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| User opens the dialog or screen and types; web may capture or upload a screenshot (max 4 MiB). | device | apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:36-60,121-134 |
| App posts the message with version, platform and page (web), client context (mobile) or source 'cli' / 'vscode'. | device | apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:165-195; apps/cli/src/cloud/feedback.rs:71-82 |
| Server checks anti-forgery (bearer exempt), rate limit, validates the payload. | our servers | apps/web/app/api/feedback/route.ts:381-391 |
| Server redacts subject and message, stores the screenshot in private object storage if configured, and inserts the row into public.feedback. | our servers | apps/web/app/api/feedback/route.ts:250-279,319-332 |
| Server answers success true (and screenshot_stored when a screenshot was sent). | our servers | apps/web/app/api/feedback/route.ts:375-378 |
| Mobile outside Cloud mode instead opens the phone's mail app with a draft to the support address. | device | apps/mobile/src/features/feedback/index.tsx:40-45,105-112 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Feedback row (user id if signed in, subject, message, metadata: source, platform, version, user agent, page path, optional ids, logs, screenshot key) | table feedback; screenshot in private object storage | Server-held | Retention unknown; failed screenshot uploads are cleaned by a sweep (apps/web/app/api/feedback/route.ts:88-110) |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Optional on web general reports; required for ratings (apps/web/app/api/feedback/route.ts:298). Required for CLI and VS Code (apps/cli/src/cloud/mod.rs:373-381; apps/extension-vscode/src/features/feedback/submitFeedback.ts:34-35). Mobile Cloud mode posts as the signed-in user if present. |
| Permissions | None found in the code. |
| Subscription | None found in the code. |
| Limits and metering | Web 'feedback' 120 per hour, fails open; 'mobile-feedback' 10 per hour, fails open (apps/web/lib/rate-limit.ts:142-151). Message 10,000 characters on web and CLI, 2,000 on mobile (apps/web/app/api/feedback/route.ts:118; apps/mobile/src/features/feedback/index.tsx:248; apps/web/app/api/mobile/feedback/route.ts:33). Screenshot 4 MiB. |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | None found in the code. |
| Local mode | Mobile Local or own-key: feedback is sent by email draft and nothing is stored by us (apps/mobile/src/features/feedback/index.tsx:86,105-112). CLI Local and own-key: refused with a message (apps/cli/src/cloud/feedback.rs:123-129). Web and desktop have no separate Local mode for this. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Submitting | Fields disabled, button loading. | apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:335-336,418-421 |
| Success | Thank-you panel with Done. | apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:306-317 |
| Error | Alert text with server message or 'Could not send feedback. Please try again.' | apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:196-217 |
| Empty message | Send button disabled (web, mobile); mobile also alerts 'Empty Feedback'. | apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:416-419; apps/mobile/src/features/feedback/index.tsx:100-103 |
| Screenshot problems | Wrong type or over 4 MiB shows a message; a dropped screenshot is reported after sending. | apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:119-130,311-315 |
| Screen capture denied | No message when the user denies permission. | apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:145-148 |
| Too long (CLI) | Refused with a number to cut. | apps/cli/src/cloud/feedback.rs:53-62 |
| Signed out | CLI: 'Feedback needs a signed-in AGI account'; VS Code: signed-out outcome. | apps/cli/src/cloud/mod.rs:377-379; apps/extension-vscode/src/features/feedback/submitFeedback.ts:34 |
| Offline | Not handled in the code beyond the generic failure messages. | Catch-all error branch at apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:218-221; no offline branch found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/feedback/route.test.ts`: Feedback route (contents not opened).
- `apps/web/features/chat/components/Composer/ComposerFeedbackDialog.test.tsx`: Dialog component (contents not opened).
- `apps/cli/src/cloud/feedback.rs`: Inline Rust tests: limit at and over 10,000, UTF-16 counting, Local and own-key never send (lines 95-130).
- `apps/web/features/desktop-host/__tests__/HostCommands.test.tsx`: 'open-feedback' host command.
- `apps/web/features/chat/pages/__tests__/WebChatPage.shortcuts.test.tsx`: Feedback shortcut event.

**Test scenarios**

- **Web general feedback**
  1. Open account menu, Get help, Send feedback.
  2. Choose 'Feature request', type text, send.
  - Expected: Thank-you panel; row in feedback with source 'web' and subject 'Feature request · Web chat'.
- **Safety refusal report**
  1. Trigger a refusal notice.
  2. Click 'Report issue', type, submit.
  - Expected: Row with feedback_context 'safety_refusal' and the message id.
- **Mobile Local**
  1. Set the phone app to Local.
  2. Open 'Report App Issue', type text.
  - Expected: Button says 'Email Feedback' and opens the mail app.
- **CLI over-limit**
  1. Run /bug with 10,014 characters.
  - Expected: Refused: shorten by 14 characters.
- **Rating without id**
  1. POST a response_rating payload with no message_id.
  - Expected: HTTP 400 'Invalid feedback payload'.

**Where to look when it fails**

- Log 'Failed to store feedback' with feedbackContext and source (apps/web/app/api/feedback/route.ts:334-344).
- Table feedback; response field screenshot_stored.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/088-support-trust-and-policy-product.md](../../70-qa/test-plans/web/088-support-trust-and-policy-product.md)
- Desktop: [70-qa/test-plans/desktop/088-support-trust-and-policy-product.md](../../70-qa/test-plans/desktop/088-support-trust-and-policy-product.md)
- Mobile: [70-qa/test-plans/mobile/088-support-trust-and-policy-product.md](../../70-qa/test-plans/mobile/088-support-trust-and-policy-product.md)
- CLI: [70-qa/test-plans/cli/088-support-trust-and-policy-product.md](../../70-qa/test-plans/cli/088-support-trust-and-policy-product.md)
- VS Code: [70-qa/test-plans/vscode/088-support-trust-and-policy-product.md](../../70-qa/test-plans/vscode/088-support-trust-and-policy-product.md)

## 10. Gaps and dependencies

- **Brief flags the dialog mount as unfinished for web and desktop; code mounts it. Needs confirmation by a real run.** Affects: Web, desktop. Evidence: apps/web/shared/components/layout/WebAppShell.tsx:619. Work needed: Drive the app and confirm the menu item opens the dialog.
- **No feedback entry on the Chrome extension.** Affects: Chrome. Evidence: brief S88.05 chrome missing; no match in apps/extension/src. Work needed: Add an entry or decide to link to the web.
- **Mobile Local and own-key send nothing to the team.** Affects: Mobile users in Local mode. Evidence: apps/mobile/src/features/feedback/index.tsx:105-112. Work needed: State this on the screen or offer consented sending.
- **Feedback type is not a separate stored field on web.** Affects: Team triage. Evidence: apps/web/app/api/feedback/route.ts:116-119. Work needed: Add a type field.
- **Report submissions share a 10 per hour limit key named mobile-feedback.** Affects: Web users. Evidence: apps/web/app/api/feedback/route.ts:348. Work needed: Confirm intended limit and rename the key.
- **Message limit differs by app (10,000, 10,000, 2,000).** Affects: Mobile. Evidence: apps/web/app/api/mobile/feedback/route.ts:33. Work needed: Align or document.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- api:POST /api/feedback
- api:DELETE /api/feedback
- api:POST /api/mobile/feedback
- table:feedback
- table:feedback_screenshot_cleanups
- SYS-files-artifacts-and-storage
- SYS-authentication-and-identity

## Unknown

- Retention and access rules for feedback rows.
- Whether the brief's 'mount' flag still applies after a real run.
- Contents of apps/web/app/api/feedback/route.test.ts and the dialog test were not read.
- Chrome extension plan for feedback.
- How the desktop Electron window routes the 'send-feedback' command in practice (code path read, not run).
