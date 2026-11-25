---
id: "PLAN-mobile-088"
type: "test-plan"
title: "Mobile · 88. Support, trust, and policy product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "88"
---
# Mobile · 88. Support, trust, and policy product

9 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S88.03 Contact-support flow.

- **Expected:** A signed-in user can reach support from the product, describe a problem, and follow the replies.
- **Code:** done. Evidence present: apps/mobile/src/features/support/SupportTicketsScreen.tsx:211; apps/mobile/src/features/support/SupportTicketScreen.tsx:105; apps/mobile/src/features/support/service.ts:94; apps/mobile/app/(app)/about.tsx:319
- **Where to find it:** Open the side menu > Settings > About > Contact Support > New ticket (labels found in the code)
- **Needs:** a Cloud account (signed in) in Cloud mode; replies come from the support team, so a reply may not arrive during the test
- **Steps:**
  1. Sign in with a Cloud account and make sure the app is in Cloud mode.
  2. Open the side menu, tap Settings, then tap About.
  3. Tap Contact Support (it only appears for a signed-in Cloud user; Email Support is always there).
  4. Tap New ticket, type a Subject and What happened, then tap Raise ticket.
  5. Open the new ticket from the list, type in Write a reply, tap Send reply.
  6. Compare: the ticket shows in the list with its status, and replies from support appear in the ticket thread.

## S88.04 Report-a-bug flow.

- **Expected:** A user can report a bug from the product, with enough context (build, platform) for support to act.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/index.tsx:599 (quoted code not found in the file now); apps/mobile/src/features/feedback/index.tsx:32; apps/mobile/src/features/feedback/index.tsx:50 (quoted code not found in the file now); apps/web/app/api/mobile/feedback/route.ts:66
- **Where to find it:** Open the side menu > Settings > Support > Report App Issue > Bug Report (labels found in the code)
- **Needs:** a Cloud account for the stored-report path; a mail app for Local mode
- **Steps:**
  1. Open the side menu, tap Settings.
  2. In the Support group, tap Report App Issue.
  3. Tap the Bug Report chip and type in the box (placeholder: What happened? What did you expect to happen?).
  4. Tap Submit Feedback (Cloud mode) and read the Thank You! alert.
  5. Compare: in Cloud mode the app sends the app version and platform with the report; in Local mode the button reads Email Feedback and opens the mail app.

## S88.05 Product feedback.

- **Expected:** Users can send general product feedback from inside the product and it is stored for the team.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/index.tsx:599 (quoted code not found in the file now); apps/mobile/src/features/feedback/index.tsx:34; apps/mobile/src/features/feedback/index.tsx:50 (quoted code not found in the file now)
- **Where to find it:** Open the side menu > Settings > Support > Report App Issue > General Feedback (labels found in the code)
- **Needs:** a Cloud account for server storage; a mail app for Local mode
- **Steps:**
  1. Open the side menu, tap Settings, then in the Support group tap Report App Issue.
  2. General Feedback is selected by default; tap it to confirm.
  3. Type a message in the box (placeholder: Tell us what you think...).
  4. Tap Submit Feedback.
  5. Compare: the Thank You! alert appears with Your feedback has been submitted.

## S88.06 Feature request.

- **Expected:** Users can submit a feature request from inside the product and it is stored for the team.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/index.tsx:599 (quoted code not found in the file now); apps/mobile/src/features/feedback/index.tsx:33; apps/mobile/src/features/feedback/index.tsx:50 (quoted code not found in the file now)
- **Where to find it:** Open the side menu > Settings > Support > Report App Issue > Feature Request (labels found in the code)
- **Needs:** a Cloud account for server storage; a mail app for Local mode
- **Steps:**
  1. Open the side menu, tap Settings, then in the Support group tap Report App Issue.
  2. Tap the Feature Request chip.
  3. Type in the box (placeholder: Describe the feature you would like...).
  4. Tap Submit Feedback.
  5. Compare: the Thank You! alert appears with Your feedback has been submitted.

## S88.07 User-reviewable diagnostic bundle.

- **Expected:** A user can produce a diagnostic bundle, see what it contains, and choose to share it with support.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/index.tsx:895; apps/mobile/src/features/settings/diagnostics/shareDiagnostics.ts:49
- **Where to find it:** Open the side menu > Settings > Support > Export Diagnostics (labels found in the code)
- **Steps:**
  1. Open the side menu, tap Settings, then in the Support group tap Export Diagnostics.
  2. Read the Share diagnostics? alert: it sends app, device and error details, never messages, files or passwords.
  3. Tap Continue; the system share sheet titled Share your AGI diagnostics opens with a .json file.
  4. If the share sheet lets you preview the file, open it to see the fields (app version, platform, locale, time zone, screen size, recent errors); otherwise cancel.
  5. Compare: the Diagnostics exported alert shows a summary, and the user picks the share target in the share sheet.

## S88.08 Request/error identifier.

- **Expected:** When a request fails, the user sees a reference id they can quote to support.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/utils/messageStreamError.ts:189; apps/web/lib/error-handler.ts:346
- **Where to find it:** Chat > the notice under a reply that failed (labels found in the code)
- **Needs:** a reply that fails; this cannot be forced reliably from the UI
- **Steps:**
  1. Open Chat and send a message.
  2. If the reply fails with an error notice, read the text under the reply.
  3. Compare: the notice ends with Reference: followed by an id that the user can quote to support, and it may say Tap to try again.
  4. If no id appears, the server did not log one for that failure.

## S88.16 Privacy-rights request portal.

- **Expected:** A user can submit access, correction or erasure requests and see their status in a privacy portal.
- **Code:** done. Evidence present: apps/mobile/src/features/settings/cloud-privacy/index.tsx:149
- **Where to find it:** Open the side menu > Settings > Privacy > Helpful resources > Data rights requests (labels found in the code)
- **Needs:** a Cloud account (the Privacy row sits in the Cloud section of Settings)
- **Steps:**
  1. Open the side menu, tap Settings, then tap Privacy.
  2. Scroll to the Helpful resources group.
  3. Tap Data rights requests; a web page (/privacy/requests) opens in the browser.
  4. Compare: the web page should let the user submit access, correction or erasure requests and show their status.

## S88.18 Content-reporting flow.

- **Expected:** A user can report a harmful or problematic response from where it appears, and the report reaches moderation.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1128 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ReportFlagButton.tsx:136 (quoted code not found in the file now); apps/mobile/services/contentReport.ts:141 (quoted code not found in the file now)
- **Where to find it:** Chat > long-press an AI reply > Report… (some labels not found in the code; trust the screen)
- **Needs:** a Cloud account for server delivery; in Local mode the report is saved on the device or sent by email
- **Steps:**
  1. Send a message in Chat and wait for the AI reply to finish.
  2. Long-press the AI reply.
  3. Tap Report… ; the sheet titled Report this response opens.
  4. Pick a category such as Harmful or dangerous, then type in the box (placeholder: Describe the issue...).
  5. Tap Save report.
  6. Compare: the sheet shows Report submitted for review (or Send this report to AGI? if it was saved on the device).

## S88.20 Safety-warning appeal.

- **Expected:** When a response is refused for safety reasons, the user can appeal or report the refusal from that notice.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2951; apps/web/app/api/mobile/feedback/route.ts:13
- **Where to find it:** Chat > the notice under a reply the model declined for safety reasons > Report (labels found in the code)
- **Needs:** a reply that is refused for safety reasons; a Cloud account for server submission
- **Steps:**
  1. Send a message in Chat that gets a safety refusal (cannot be forced reliably from the UI).
  2. Read the notice: The model declined to finish this response for safety reasons.
  3. Tap Report on the notice; the screen titled Report an incorrect refusal opens.
  4. Type the reason and tap Submit Feedback (Cloud mode) or Email Feedback (Local mode).
  5. Compare: the Thank You! alert appears and the app goes back.
