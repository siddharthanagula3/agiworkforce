---
id: "PLAN-desktop-088"
type: "test-plan"
title: "Desktop · 88. Support, trust, and policy product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "88"
---
# Desktop · 88. Support, trust, and policy product

26 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S88.01 Contextual help links.

- **Expected:** Screens that need explaining link straight to the matching help or docs article for that feature.
- **Code:** done. Evidence present: apps/web/features/settings/sections/MemorySection.tsx:244; apps/web/features/settings/sections/PrivacySection.tsx:175; apps/web/features/settings/sections/BillingSection.tsx:657; apps/web/features/workspace-console/components/ConsolePage.tsx:30; apps/web/app/workspace/policy/page.tsx:14
- **Where to find it:** Settings > Memory > How memory works (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in, open the account menu and choose Settings.
  2. Open the Memory section.
  3. Click the link How memory works.
  4. Check that a help article about memory opens and matches what Memory does.

## S88.02 Searchable help center.

- **Expected:** Users can search a help centre and open matching articles.
- **Code:** done. Evidence moved: apps/web/app/help/page.tsx:63; apps/web/features/support/components/HelpSearch.tsx:34 (quoted code not found in the file now); apps/web/app/api/help/search/route.ts:48
- **Where to find it:** Settings > Help > Help center (labels found in the code)
- **Steps:**
  1. Open Settings from the account menu, then choose Help.
  2. Click Help center (it opens in a new tab).
  3. Type a word such as billing into Search help articles.
  4. Check that matching articles are listed and that clicking one opens it.

## S88.03 Contact-support flow.

- **Expected:** A signed-in user can reach support from the product, describe a problem, and follow the replies.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:301; apps/web/features/settings/sections/HelpSection.tsx:79; apps/web/features/support/components/SupportTicketsPanel.tsx:84 (quoted code not found in the file now); apps/web/app/api/support/tickets/route.ts:45; apps/desktop/electron/appMenu.ts:231 (quoted code not found in the file now)
- **Where to find it:** Settings > Help > Raise a ticket (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings from the account menu, then choose Help.
  2. Click Raise a ticket.
  3. Type a Subject and What happened, then click Raise ticket.
  4. Check that the ticket appears in the list, then open it and use Send reply to add a follow-up and check that the reply shows in the thread.

## S88.04 Report-a-bug flow.

- **Expected:** A user can report a bug from the product, with enough context (build, platform) for support to act.
- **Code:** done. Evidence present: apps/web/features/settings/sections/HelpSection.tsx:44; apps/web/app/support/page.tsx:110; apps/web/lib/support/diagnostics/collect.ts:47; apps/web/app/api/support/tickets/route.ts:45
- **Where to find it:** Settings > Help > Raise a ticket (in-app bug report); Settings > Help > Report a bug (public page) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Help.
  2. Click Raise a ticket, type a Subject and What happened, and read the line Attach diagnostics.
  3. Click Raise ticket and check that the ticket is listed with its status.
  4. Optional: click Report a bug in the Help list and compare the public page with Expected.

## S88.05 Product feedback.

- **Expected:** Users can send general product feedback from inside the product and it is stored for the team.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:23; apps/web/features/chat/components/messages/MessageBubble.tsx:3827; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:166
- **Known to be unfinished:** ['mount']
- **Where to find it:** Account menu > Send feedback (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the account menu from the sidebar.
  2. Click Send feedback.
  3. Choose General feedback, type in Details, then click Send feedback.
  4. Check that the dialog says Thanks, your feedback was sent.

## S88.06 Feature request.

- **Expected:** Users can submit a feature request from inside the product and it is stored for the team.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:25; apps/web/features/chat/components/messages/MessageBubble.tsx:3827; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:166
- **Known to be unfinished:** ['mount']
- **Where to find it:** Account menu > Send feedback > Feature request (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the account menu and click Send feedback.
  2. Choose Feature request.
  3. Type in Details and click Send feedback.
  4. Check the thank-you message and that the feedback type is Feature request.

## S88.07 User-reviewable diagnostic bundle.

- **Expected:** A user can produce a diagnostic bundle, see what it contains, and choose to share it with support.
- **Code:** done. Evidence present: apps/web/features/support/components/SupportTicketsPanel.tsx:187; apps/web/features/support/components/SupportTicketsPanel.tsx:97; apps/web/features/support/components/SupportTicketsPanel.tsx:125; apps/web/features/support/lib/ticket-client.ts:98
- **Where to find it:** Settings > Help > Raise a ticket > Review diagnostics > Download diagnostics (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Help, then click Raise a ticket.
  2. Type a Subject and What happened. Leave Attach diagnostics ticked.
  3. Click Review diagnostics and read the box of diagnostics that would be attached.
  4. Click Download diagnostics, then compare the file and the box with Expected.

## S88.08 Request/error identifier.

- **Expected:** When a request fails, the user sees a reference id they can quote to support.
- **Code:** done. Evidence moved: apps/web/features/chat/lib/turn-error-notice.ts:152 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:267; apps/web/lib/hooks/useChatStream.ts:673
- **Where to find it:** Any chat reply that fails: the error line under the reply (labels found in the code)
- **Needs:** a way to make a request fail
- **Steps:**
  1. Send a chat message while the service is failing, or use a failing model route.
  2. Read the error line under the reply.
  3. Check that it ends with a Reference: code you could quote to support.

## S88.10 Service-status integration.

- **Expected:** Users can see current service status from the product, fed by live health checks.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/HelpSection.tsx:56; apps/web/app/status/page.tsx:203 (quoted code not found in the file now); apps/web/app/status/page.tsx:92; apps/web/features/chat/components/Composer/ComposerFooter.tsx:352
- **Where to find it:** Settings > Help > System status (labels found in the code)
- **Steps:**
  1. Open Settings, then Help.
  2. Click System status (it opens in a new tab).
  3. Read the overall status word and the list of checks.
  4. Compare with Expected: the page should show when results were checked and show Checks passing or a failing state.

## S88.11 Incident notices.

- **Expected:** During an incident, users see a notice in the product describing the problem and its status.
- **Code:** done. Evidence moved: apps/web/lib/server/service-notices.ts:40 (quoted code not found in the file now); apps/web/shared/components/ServiceNotices.tsx:15 (quoted code not found in the file now); apps/web/shared/components/ProductNotices.tsx:12 (quoted code not found in the file now); apps/web/app/AppRuntimeMounts.tsx:28
- **Where to find it:** no screen of its own. The notice appears only when the server health checks fail. The dismissal is saved in this browser under agi-dismissed-service-notices (apps/web/shared/components/ServiceNotices.tsx). I did not find a visible label for the dismiss control.
- **Needs:** a live incident, which the tester cannot start
- **Steps:**
  1. Sign in and watch the top of the app while an incident is open.
  2. Read the notice text, then click its dismiss control.
  3. Compare with Expected: the notice should say the problem and its status.

## S88.12 Maintenance notices.

- **Expected:** Users are told about planned maintenance before and during it, inside the product.
- **Code:** done. Evidence moved: apps/web/lib/server/service-notices.ts:54; apps/web/lib/server/service-notices.ts:58 (quoted code not found in the file now); apps/web/shared/components/ServiceNotices.tsx:117; apps/web/app/AppRuntimeMounts.tsx:28
- **Where to find it:** no screen of its own. Window text comes from apps/web/lib/server/service-notices.ts (ANNOUNCE_AHEAD_MS, maintenanceNotice). I did not find the exact visible copy, so no label is given.
- **Needs:** a scheduled maintenance window, which the tester cannot create
- **Steps:**
  1. Sign in when a maintenance window is scheduled within 72 hours.
  2. Read the notice; it should change from upcoming to underway.
  3. Compare with Expected: the notice should give the planned time.

## S88.13 Release-update education.

- **Expected:** After an update, users learn what changed (what's new, release notes) from inside the product.
- **Code:** done. Evidence present: apps/web/shared/components/ReleaseNotice.tsx:39; apps/web/shared/components/ReleaseNotice.tsx:53; apps/web/shared/components/ProductNotices.tsx:13
- **Where to find it:** Any page after a new release: the banner What's new: <headline> > Read more (labels found in the code)
- **Needs:** a release newer than the last one this browser saw
- **Steps:**
  1. Sign in after a new release is published.
  2. Look for the banner that starts with What's new:.
  3. Click Read more and read the release notes page.
  4. Check that the release notes show what changed.

## S88.14 Model-retirement notice.

- **Expected:** Users are warned before a model they use is retired and told what replaces it when it is.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:353; apps/web/features/chat/components/UnavailableModelNotice.tsx:26; apps/web/shared/stores/model-store.ts:293; apps/web/features/models/lib/model-presentation.ts:43
- **Where to find it:** Chat > the model picker in the composer, and the notice shown in chat when the model is retired (labels found in the code)
- **Needs:** a model that is being retired, which the tester may not have
- **Steps:**
  1. Open a chat and open the model picker from the composer footer.
  2. Look for a model marked Leaving or Unavailable right now.
  3. If a chat is saved with a retired model, read the notice that says the model is no longer available.
  4. Compare with Expected: the notice should name the replacement model and offer a way to pick another.

## S88.15 Feature-migration assistant.

- **Expected:** An assistant helps users move their data and settings from another product or a replaced feature, with a preview before changes.
- **Code:** done. Evidence present: apps/web/features/settings/components/ImportMemoryDialog.tsx:41
- **Where to find it:** Settings > Memory > Import memory from other AI providers (labels found in the code)
- **Needs:** text or a file from another AI assistant
- **Steps:**
  1. Open Settings, then Memory.
  2. Click the button that opens the import dialog, the one titled Import memory from other AI providers.
  3. Click Copy prompt, paste a reply into Paste memories, or use Upload file.
  4. Check the preview of memories to import before saving, with Already saved marked where it applies.

## S88.16 Privacy-rights request portal.

- **Expected:** A user can submit access, correction or erasure requests and see their status in a privacy portal.
- **Code:** done. Evidence present: apps/web/app/privacy/requests/page.tsx:133; apps/web/app/privacy/requests/YourRightsRequests.tsx:51; apps/web/app/privacy/requests/YourRightsRequests.tsx:100
- **Where to find it:** Footer > Privacy choices (labels found in the code)
- **Needs:** a signed-in account to see your own requests (signed-out requests go by email)
- **Steps:**
  1. Scroll to the footer and click Privacy choices.
  2. Read Your requests and the Access, Correction and Erasure request types.
  3. Submit a request and check that it appears under Your requests with its status.

## S88.17 Cookie preference center.

- **Expected:** Users can review and change cookie categories at any time from a preference centre, and the choice is honoured.
- **Code:** done. Evidence moved: apps/web/app/cookies/CookiePreferencesButton.tsx:7 (quoted code not found in the file now); apps/web/app/layout.tsx:195; apps/web/shared/components/CookieConsent.tsx:109; apps/web/shared/lib/cookie-consent.ts:78 (quoted code not found in the file now)
- **Where to find it:** Footer > Cookies > Change your cookie preferences (labels found in the code)
- **Steps:**
  1. Scroll to the footer and click Cookies.
  2. Click Change your cookie preferences.
  3. Turn a cookie category off, save, and reload the page.
  4. Check that the choice stays off and that the page respects it.

## S88.18 Content-reporting flow.

- **Expected:** A user can report a harmful or problematic response from where it appears, and the report reaches moderation.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:1174; apps/web/app/api/content-report/route.ts:14; apps/web/app/api/mobile/content-report/route.ts:95
- **Where to find it:** Chat > an assistant reply > its more actions menu, the item that reports the message (labels found in the code)
- **Needs:** a chat with a reply
- **Steps:**
  1. Open a chat and find an assistant reply.
  2. Open its more actions menu and choose the report item.
  3. Read the confirmation message.
  4. Compare with Expected: it should say the report goes to trust and safety.

## S88.19 Copyright/impersonation reporting.

- **Expected:** Anyone can report copyright infringement or impersonation in hosted content and get a reference.
- **Code:** done. Evidence present: apps/web/app/copyright/report/CopyrightNoticeForm.tsx:246; apps/web/app/copyright/report/CopyrightNoticeForm.tsx:62; apps/web/app/api/copyright-notice/route.ts:41; apps/web/db/neon/0312_content_notice_type.sql:19; apps/web/app/copyright/report/page.tsx:79
- **Where to find it:** Open /copyright/report in the browser (no sign-in needed) (labels found in the code)
- **Needs:** a shared conversation or artifact link on this site
- **Steps:**
  1. Open the copyright report page in the browser.
  2. Read the title Report infringing or impersonating content.
  3. Choose What you are reporting, fill in the link and the contact details, tick the accuracy statement, and submit.
  4. Check the confirmation that gives a reference and says nothing has been removed yet.

## S88.20 Safety-warning appeal.

- **Expected:** When a response is refused for safety reasons, the user can appeal or report the refusal from that notice.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:1974; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:183; apps/web/app/api/feedback/route.ts:425
- **Where to find it:** Chat > a reply that was refused for safety reasons > Report issue (labels found in the code)
- **Needs:** a refused reply, which the tester may not be able to cause
- **Steps:**
  1. Find a reply with the notice The model declined to finish this response for safety reasons.
  2. Click Report issue.
  3. Read the dialog Report an incorrect refusal, add details, and click Submit report.
  4. Check the thank-you message.

## S88.21 Account-suspension appeal.

- **Expected:** A suspended user is told why and can appeal from where they are blocked, with a way to follow the appeal.
- **Code:** done. Evidence moved: apps/web/features/auth/AccountAccessNotice.tsx:35; apps/web/features/auth/SuspensionAppeal.tsx:141; apps/web/app/api/support/appeal/route.ts:81 (quoted code not found in the file now); apps/web/lib/support/tickets/appeals.ts:66 (quoted code not found in the file now); apps/web/features/auth/AuthNoticeStep.tsx:60 (quoted code not found in the file now); apps/web/app/appeal/page.tsx:27; apps/web/lib/support/tickets/service.ts:404
- **Where to find it:** Appeal page /appeal, reached from the suspended-account notice (labels found in the code)
- **Needs:** a suspended account (not normally available to a tester)
- **Steps:**
  1. Sign in with a suspended account, or open /appeal.
  2. Read the notice about accounts being suspended.
  3. Type the email address of the suspended account, then add your reason under Why should the suspension be lifted?.
  4. Submit, then check the receipt and reference that the page says is sent by email.

## S88.22 Security vulnerability reporting.

- **Expected:** Security researchers find a published way to report vulnerabilities (policy page and security.txt).
- **Code:** done. Evidence present: apps/web/app/security/page.tsx:618; apps/web/app/.well-known/security.txt/route.ts:8
- **Where to find it:** Footer > Security > Report a vulnerability (labels found in the code)
- **Steps:**
  1. Scroll to the footer and click Security.
  2. Click Report a vulnerability on the page.
  3. Read the reporting section.
  4. Check that a security.txt file is served at /.well-known/security.txt and points to the policy.

## S88.23 Accessibility feedback.

- **Expected:** Users can report accessibility barriers through a dedicated, accessible channel from the product.
- **Code:** done. Evidence present: apps/web/features/support/components/SupportTicketsPanel.tsx:583; apps/web/features/support/components/SupportTicketsPanel.tsx:65; apps/web/app/accessibility/page.tsx:116
- **Where to find it:** Settings > Help > Report an accessibility barrier (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings, then Help.
  2. Click Report an accessibility barrier.
  3. Check that the form opens with the subject Accessibility barrier and a What happened box.
  4. Compare with Expected: the form should say it is a dedicated accessibility channel.

## S88.24 Policy-version history.

- **Expected:** Users can see earlier versions of the terms and policies and what changed between them.
- **Code:** done. Evidence moved: apps/web/app/terms/page.tsx:271; apps/web/app/legal/archive/[policy]/page.tsx:79; apps/web/app/legal/archive/[policy]/[date]/page.tsx:66 (quoted code not found in the file now); apps/web/app/legal/archive/[policy]/[date]/page.tsx:87; scripts/archive-policy-versions.mjs:88 (quoted code not found in the file now); scripts/check-policy-versions.mjs:192 (quoted code not found in the file now)
- **Where to find it:** Footer > Legal > Version history (labels found in the code)
- **Steps:**
  1. Scroll to the footer and click Legal.
  2. Open a policy such as Terms, then follow its version history link.
  3. Read the page titled Version history. and open an archived date.
  4. Compare with Expected: the archived version should show what changed.

## S88.25 Subprocessor information.

- **Expected:** A current list of subprocessors, with a change log, is published.
- **Code:** done. Evidence present: apps/web/app/subprocessors/page.tsx:288; apps/web/app/subprocessors/page.tsx:256
- **Where to find it:** Open /subprocessors in the browser (public page) (labels found in the code)
- **Steps:**
  1. Open the subprocessors page in the browser.
  2. Read the title Subprocessors. and the table with the caption Subprocessors.
  3. Look for a change log on the page.
  4. Compare with Expected: the list should be current and a change log should be published.

## S88.26 Security/compliance evidence portal.

- **Expected:** Customers can review security and compliance evidence (reports, certifications, questionnaires) in a trust portal.
- **Code:** partial. Evidence present: apps/web/app/trust/page.tsx:85; apps/web/app/trust/page.tsx:48; apps/web/content/support/enterprise-security.md:23
- **Known to be unfinished:** owner: commission SOC 2, ISO 27001 and a third-party penetration test and publish the reports on the trust page
- **Owner decision is open on this item.**
- **Where to find it:** Footer > Trust centre > Trust and compliance status (labels found in the code)
- **Steps:**
  1. Scroll to the footer and click Trust centre.
  2. Read the title Trust and compliance status and the section list.
  3. Look for the evidence section, The documents behind the rows.
  4. Compare with Expected: the page should say no certifications are claimed; SOC 2, ISO 27001 and a penetration test are not yet published.

## S88.27 Jurisdiction-specific notices where applicable.

- **Expected:** Where required, users in a jurisdiction see the notices that apply to them (e.g. India DPDP, EU representative, region blocks).
- **Code:** done. Evidence present: apps/web/app/privacy/india/page.tsx:256; apps/web/app/legal/eu-representative/page.tsx:24; apps/web/app/legal/page.tsx:130; apps/web/app/privacy/india/page.tsx:256; apps/web/app/legal/eu-representative/page.tsx:24
- **Where to find it:** Public site footer > Legal > India: DPDP notice (the EU representative page is the row above it on the Legal page, linking to /legal/eu-representative) (labels found in the code)
- **Steps:**
  1. Open the public website (no sign-in needed) and scroll to the footer.
  2. Click "Legal" in the footer's legal links.
  3. On the "Legal." page, find the row "India: DPDP notice" and click its link to /privacy/india.
  4. Check that the page titled "Notice to Data Principals in India." shows the itemised DPDP notice, including the grievance redressal section and the nomination note.
  5. Go back to the "Legal." page and open the row that links to /legal/eu-representative.
  6. Check that the page titled "EU representative." says AGI has not designated an EU representative under GDPR Article 27, with the date and where to send privacy requests.
