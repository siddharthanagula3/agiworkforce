---
id: "PLAN-web-088"
type: "test-plan"
title: "Web · 88. Support, trust, and policy product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "88"
---
# Web · 88. Support, trust, and policy product

26 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S88.01 Contextual help links.

- **Expected:** Screens that need explaining link straight to the matching help or docs article for that feature.
- **Code:** done. Evidence present: apps/web/features/settings/sections/MemorySection.tsx:244; apps/web/features/settings/sections/PrivacySection.tsx:175; apps/web/features/settings/sections/BillingSection.tsx:657; apps/web/features/workspace-console/components/ConsolePage.tsx:30; apps/web/app/workspace/policy/page.tsx:14
- **Earlier check in the running app:** PASS: E006 [UI_ONLY; visible UI]: Account menu opens with workspace, settings, support, shortcuts, upgrades, and policy destinations. No account/security mutation performed. | E030 [PASS; scoped settings observation]: Help destination opened; ticket list later settled empty. Support, status, legal and documentation links visible; no messages sent.
- **Where to find it:** Settings > Memory > "How memory works" link (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and go to the Memory section.
  2. Find the link "How memory works" under the memory description.
  3. Click "How memory works".
  4. Check that a help article about memory opens and matches the Memory screen.

## S88.02 Searchable help center.

- **Expected:** Users can search a help centre and open matching articles.
- **Code:** done. Evidence moved: apps/web/app/help/page.tsx:63; apps/web/features/support/components/HelpSearch.tsx:34 (quoted code not found in the file now); apps/web/app/api/help/search/route.ts:48
- **Earlier check in the running app:** PASS: E072 [PASS; search interaction]: Search temporary returned five relevant pages with snippets and article links. | E073 [PASS; search result navigation]: Temporary chats help article rendered at result URL; initial click snapshot was premature and replaced with settled evidence.
- **Where to find it:** Settings > Help > "Help center" (labels found in the code)
- **Steps:**
  1. Open Settings and go to Help.
  2. Click "Help center" (it opens in a new tab).
  3. Type a word into the search box on the Help center page and press Enter.
  4. Check that matching articles appear with snippets and links, then click one and check it opens.

## S88.03 Contact-support flow.

- **Expected:** A signed-in user can reach support from the product, describe a problem, and follow the replies.
- **Code:** done. Evidence moved: apps/web/features/settings/components/WebSettingsModal.tsx:301; apps/web/features/settings/sections/HelpSection.tsx:79; apps/web/features/support/components/SupportTicketsPanel.tsx:84 (quoted code not found in the file now); apps/web/app/api/support/tickets/route.ts:45
- **Earlier check in the running app:** UI_ONLY: E076 [UI_ONLY; destination render; no forms submitted]: Linked page rendered. Support/contact submissions not performed.
- **Where to find it:** Settings > Help > "Contact support" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and go to Help.
  2. Look at the support tickets panel at the top of the Help section.
  3. Click "Contact support" (opens in a new tab).
  4. Check that the support page opens where you can describe a problem; check that replies to a ticket appear with a "Send reply" form.

## S88.04 Report-a-bug flow.

- **Expected:** A user can report a bug from the product, with enough context (build, platform) for support to act.
- **Code:** done. Evidence present: apps/web/features/settings/sections/HelpSection.tsx:44; apps/web/app/support/page.tsx:110; apps/web/lib/support/diagnostics/collect.ts:47; apps/web/app/api/support/tickets/route.ts:45
- **Earlier check in the running app:** UI_ONLY: E076 [UI_ONLY; destination render; no forms submitted]: Linked page rendered. Support/contact submissions not performed.
- **Where to find it:** Settings > Help > "Report a bug" (labels found in the code)
- **Steps:**
  1. Open Settings and go to Help.
  2. Click "Report a bug" (opens in a new tab at the support page, bugs section).
  3. Describe a problem in the bug part of the support page.
  4. Check that the page mentions build and platform details being sent with the report.

## S88.05 Product feedback.

- **Expected:** Users can send general product feedback from inside the product and it is stored for the team.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:23; apps/web/features/chat/components/messages/MessageBubble.tsx:3827; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:166
- **Known to be unfinished:** ['mount']
- **Where to find it:** Feedback > Feedback type > "Send feedback" (in the chat composer) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open a chat.
  2. Click the "Feedback" button near the composer.
  3. Leave the Feedback type on the general option and type a note.
  4. Click "Send feedback" and check that a confirmation appears.

## S88.06 Feature request.

- **Expected:** Users can submit a feature request from inside the product and it is stored for the team.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:25; apps/web/features/chat/components/messages/MessageBubble.tsx:3827; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:166
- **Known to be unfinished:** ['mount']
- **Where to find it:** Feedback > Feedback type > "Feature request" > "Send feedback" (in the chat composer) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open a chat.
  2. Click the "Feedback" button near the composer.
  3. Under "Feedback type", choose "Feature request".
  4. Type a request and click "Send feedback"; check that a confirmation appears.

## S88.07 User-reviewable diagnostic bundle.

- **Expected:** A user can produce a diagnostic bundle, see what it contains, and choose to share it with support.
- **Code:** done. Evidence present: apps/web/features/support/components/SupportTicketsPanel.tsx:187; apps/web/features/support/components/SupportTicketsPanel.tsx:97; apps/web/features/support/components/SupportTicketsPanel.tsx:125; apps/web/features/support/lib/ticket-client.ts:98
- **Where to find it:** Settings > Help > "Review diagnostics" > "Download diagnostics" (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and go to Help.
  2. Keep the box "Attach diagnostics: your build, platform and the last few errors this browser recorded." ticked, or untick it.
  3. Click "Review diagnostics" and read the summary in the box labelled "Diagnostics that would be attached".
  4. Click "Download diagnostics" and check the file contents match the summary.

## S88.08 Request/error identifier.

- **Expected:** When a request fails, the user sees a reference id they can quote to support.
- **Code:** done. Evidence moved: apps/web/features/chat/lib/turn-error-notice.ts:152 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:267; apps/web/lib/hooks/useChatStream.ts:673
- **Where to find it:** Chat > a reply that fails > the error notice under the reply (path not confirmed in the code; trust the screen)
- **Needs:** a way to make a reply fail
- **Steps:**
  1. Open a chat and send a message in a way that makes the reply fail (for example with the network turned off).
  2. Read the error notice under the reply.
  3. Look for the reference id in the notice text.
  4. Compare it with the reference shown in the message details.

## S88.10 Service-status integration.

- **Expected:** Users can see current service status from the product, fed by live health checks.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/HelpSection.tsx:56; apps/web/app/status/page.tsx:203 (quoted code not found in the file now); apps/web/app/status/page.tsx:92; apps/web/features/chat/components/Composer/ComposerFooter.tsx:352
- **Earlier check in the running app:** PASS: E070 [PASS; destination render]: Linked public page rendered. No purchases, software installs, or support messages submitted.
- **Where to find it:** Settings > Help > "System status" (labels found in the code)
- **Steps:**
  1. Open Settings and go to Help.
  2. Click "System status" (opens the status page in a new tab).
  3. Read the page title "Status: hosted dependency and route checks" and the current status rows.
  4. Compare the rows with what the app shows in the composer footer.

## S88.11 Incident notices.

- **Expected:** During an incident, users see a notice in the product describing the problem and its status.
- **Code:** done. Evidence moved: apps/web/lib/server/service-notices.ts:40 (quoted code not found in the file now); apps/web/shared/components/ServiceNotices.tsx:15 (quoted code not found in the file now); apps/web/shared/components/ProductNotices.tsx:12 (quoted code not found in the file now); apps/web/app/AppRuntimeMounts.tsx:28
- **Where to find it:** no screen of its own. Notices come from the service notices feed (apps/web/lib/server/service-notices.ts); the visible wording comes from data, not fixed text.
- **Needs:** an active incident notice (set by the team)
- **Steps:**
  1. Sign in while an incident notice is active and look at the top of the app.
  2. Check that the notice card shows the problem and its status.

## S88.12 Maintenance notices.

- **Expected:** Users are told about planned maintenance before and during it, inside the product.
- **Code:** done. Evidence moved: apps/web/lib/server/service-notices.ts:54; apps/web/lib/server/service-notices.ts:58 (quoted code not found in the file now); apps/web/shared/components/ServiceNotices.tsx:117; apps/web/app/AppRuntimeMounts.tsx:28
- **Where to find it:** no screen of its own. Maintenance notices use a clock icon (apps/web/shared/components/ServiceNotices.tsx); the wording comes from data.
- **Needs:** a scheduled maintenance notice (set by the team)
- **Steps:**
  1. Sign in while a maintenance notice is scheduled and look at the top of the app.
  2. Check that the maintenance notice shows the planned time.

## S88.13 Release-update education.

- **Expected:** After an update, users learn what changed (what's new, release notes) from inside the product.
- **Code:** done. Evidence present: apps/web/shared/components/ReleaseNotice.tsx:39; apps/web/shared/components/ReleaseNotice.tsx:53; apps/web/shared/components/ProductNotices.tsx:13
- **Where to find it:** A banner at the top of the app that starts with "What's new:" after an update (labels found in the code)
- **Needs:** a new release in the release feed
- **Steps:**
  1. Sign in after a new release is published, or clear the saved last-seen release value in the browser to test again.
  2. Read the banner "What's new:" followed by the headline.
  3. Click the banner link and check it opens the release notes for that release.
  4. Click the dismiss control and check the banner goes away.

## S88.14 Model-retirement notice.

- **Expected:** Users are warned before a model they use is retired and told what replaces it when it is.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ComposerFooter.tsx:353; apps/web/features/chat/components/UnavailableModelNotice.tsx:26; apps/web/shared/stores/model-store.ts:293; apps/web/features/models/lib/model-presentation.ts:43
- **Where to find it:** Composer footer > model picker: a row that reads "Leaving" a model, or a notice that says "is no longer available" (labels found in the code)
- **Needs:** a model marked as retiring or retired in the catalogue
- **Steps:**
  1. Open a chat that uses a model marked as retiring.
  2. Look at the model picker in the composer footer for the row that reads "Leaving" the model name.
  3. Look at the notice that says the model "is no longer available" and says which model replaces it.
  4. Click the dismiss control on the notice and check it closes.

## S88.15 Feature-migration assistant.

- **Expected:** An assistant helps users move their data and settings from another product or a replaced feature, with a preview before changes.
- **Code:** done. Evidence present: apps/web/features/settings/components/ImportMemoryDialog.tsx:41
- **Where to find it:** Settings > Memory > import dialog (choose a source, pick a file, then preview) (labels found in the code)
- **Needs:** a .txt or .json file to upload
- **Steps:**
  1. Open Settings and go to Memory.
  2. Open the memory import dialog.
  3. Choose a source such as "ChatGPT", then choose a .txt or .json file.
  4. Check the preview step lists what will be imported before you confirm the import.

## S88.16 Privacy-rights request portal.

- **Expected:** A user can submit access, correction or erasure requests and see their status in a privacy portal.
- **Code:** done. Evidence present: apps/web/app/privacy/requests/page.tsx:133; apps/web/app/privacy/requests/YourRightsRequests.tsx:51; apps/web/app/privacy/requests/YourRightsRequests.tsx:100
- **Earlier check in the running app:** UI_ONLY: E011 [UI_ONLY; visible UI]: Privacy exposes telemetry, temporary-chat, archived/recently-deleted/shared-link management, JSON export and rights-request entry points. No privacy preference or destructive control changed. | E065 [UI_ONLY; Rights-request page opens; no request submitted]: Linked page opens with readable content; backend enforcement or form submission not tested.
- **Where to find it:** Settings > Privacy > rights-request link > "Exercise your rights." page (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open Settings and go to Privacy.
  2. Find the link to rights requests and click it.
  3. On the "Exercise your rights." page, read the "Your requests" list if you have any.
  4. Check each listed request shows its reference, type (Access, Correction or Erasure) and status.

## S88.17 Cookie preference center.

- **Expected:** Users can review and change cookie categories at any time from a preference centre, and the choice is honoured.
- **Code:** done. Evidence moved: apps/web/app/cookies/CookiePreferencesButton.tsx:7 (quoted code not found in the file now); apps/web/app/layout.tsx:195; apps/web/shared/components/CookieConsent.tsx:109; apps/web/shared/lib/cookie-consent.ts:78 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E067 [PASS; open save revisit reopen]: Saved necessary-on/analytics-off, then dev server exited. After restart and fresh tab, reopening preferences still shows analytics off and necessary locked on. No recurring banner visible. Network tracking enforcement not checked.
- **Where to find it:** "Cookie preferences" (cookie preference centre, opened from the cookies page or the cookie banner) (labels found in the code)
- **Steps:**
  1. Open "Cookie preferences" from the cookies page or the cookie banner.
  2. Turn analytics off and keep necessary cookies on, then save.
  3. Reload the page and open "Cookie preferences" again.
  4. Check analytics is still off and necessary is still locked on, and no banner returns.

## S88.18 Content-reporting flow.

- **Expected:** A user can report a harmful or problematic response from where it appears, and the report reaches moderation.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:1174; apps/web/app/api/content-report/route.ts:14; apps/web/app/api/mobile/content-report/route.ts:95
- **Where to find it:** Under a chat reply: "Report this response" (labels found in the code)
- **Needs:** a chat reply
- **Steps:**
  1. Open a chat with a reply.
  2. Find "Report this response" on the reply.
  3. Click it and check the message "Reported. Thank you: our trust and safety team will review it." appears.
  4. Check the report button shows it was sent and cannot be sent again.

## S88.19 Copyright/impersonation reporting.

- **Expected:** Anyone can report copyright infringement or impersonation in hosted content and get a reference.
- **Code:** done. Evidence present: apps/web/app/copyright/report/CopyrightNoticeForm.tsx:246; apps/web/app/copyright/report/CopyrightNoticeForm.tsx:62; apps/web/app/api/copyright-notice/route.ts:41; apps/web/db/neon/0312_content_notice_type.sql:19; apps/web/app/copyright/report/page.tsx:79
- **Where to find it:** Browser address bar: /copyright/report (copyright report form) (labels found in the code)
- **Needs:** none (a link to the form was not found in the app)
- **Steps:**
  1. Open /copyright/report in a browser.
  2. Read the legend "What you are reporting" and choose the type of report.
  3. Fill in the reporter fields and submit.
  4. Check the result shows "recorded" with a reference number.

## S88.20 Safety-warning appeal.

- **Expected:** When a response is refused for safety reasons, the user can appeal or report the refusal from that notice.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:1974; apps/web/features/chat/components/Composer/ComposerFeedbackDialog.tsx:183; apps/web/app/api/feedback/route.ts:425
- **Where to find it:** Under a refused chat reply: "Report issue" > "Submit report" (labels found in the code)
- **Needs:** a refused reply (needs a safety refusal from the provider)
- **Steps:**
  1. Get a chat reply that the provider refuses for safety reasons.
  2. Find the notice under the refused reply and click "Report issue".
  3. Describe the refusal and click "Submit report".
  4. Check a confirmation appears.

## S88.21 Account-suspension appeal.

- **Expected:** A suspended user is told why and can appeal from where they are blocked, with a way to follow the appeal.
- **Code:** done. Evidence moved: apps/web/features/auth/AccountAccessNotice.tsx:35; apps/web/features/auth/SuspensionAppeal.tsx:141; apps/web/app/api/support/appeal/route.ts:81 (quoted code not found in the file now); apps/web/lib/support/tickets/appeals.ts:66 (quoted code not found in the file now); apps/web/features/auth/AuthNoticeStep.tsx:60 (quoted code not found in the file now); apps/web/app/appeal/page.tsx:27; apps/web/lib/support/tickets/service.ts:404
- **Where to find it:** Sign-in screen for a suspended account: "Submit appeal" (or "Why should the suspension be lifted?") (labels found in the code)
- **Needs:** a suspended account (or the appeal page)
- **Steps:**
  1. Sign in to a suspended account, or open the appeal page at /appeal.
  2. Read the account access notice that explains the suspension.
  3. Type a reason under "Why should the suspension be lifted?" and click "Submit appeal".
  4. Check the appeal thread shows your appeal and the note "A person reviews every appeal."

## S88.22 Security vulnerability reporting.

- **Expected:** Security researchers find a published way to report vulnerabilities (policy page and security.txt).
- **Code:** done. Evidence present: apps/web/app/security/page.tsx:618; apps/web/app/.well-known/security.txt/route.ts:8
- **Where to find it:** Browser address bar: /security (section "Reporting a vulnerability.") (labels found in the code)
- **Steps:**
  1. Open /security in a browser.
  2. Scroll to the section "Reporting a vulnerability.".
  3. Read the reporting instructions and the contact the page names.
  4. Check /.well-known/security.txt also opens and lists a contact.

## S88.23 Accessibility feedback.

- **Expected:** Users can report accessibility barriers through a dedicated, accessible channel from the product.
- **Code:** done. Evidence present: apps/web/features/support/components/SupportTicketsPanel.tsx:583; apps/web/features/support/components/SupportTicketsPanel.tsx:65; apps/web/app/accessibility/page.tsx:116
- **Where to find it:** Browser address bar: /accessibility (section "Report a barrier.") (labels found in the code)
- **Steps:**
  1. Open /accessibility in a browser.
  2. Scroll to the section "Report a barrier.".
  3. Read how to report an accessibility barrier and the channel it names.
  4. Check the channel can be used without a mouse (keyboard and screen reader).

## S88.24 Policy-version history.

- **Expected:** Users can see earlier versions of the terms and policies and what changed between them.
- **Code:** done. Evidence moved: apps/web/app/terms/page.tsx:271; apps/web/app/legal/archive/[policy]/page.tsx:79; apps/web/app/legal/archive/[policy]/[date]/page.tsx:66 (quoted code not found in the file now); apps/web/app/legal/archive/[policy]/[date]/page.tsx:87; scripts/archive-policy-versions.mjs:88 (quoted code not found in the file now); scripts/check-policy-versions.mjs:192 (quoted code not found in the file now)
- **Where to find it:** Settings > Help > "Legal" > "Previous versions" (labels found in the code)
- **Steps:**
  1. Open Settings and go to Help.
  2. Click "Legal" (it opens the legal page in a new tab).
  3. Open a policy and find the "Previous versions" link under its date.
  4. Click it and check earlier dated versions of the policy and what changed are listed.

## S88.25 Subprocessor information.

- **Expected:** A current list of subprocessors, with a change log, is published.
- **Code:** done. Evidence present: apps/web/app/subprocessors/page.tsx:288; apps/web/app/subprocessors/page.tsx:256
- **Earlier check in the running app:** PASS: E064 [PASS; page and content render only]: Linked page opens with readable content; backend enforcement or form submission not tested.
- **Where to find it:** Browser address bar: /subprocessors (title "Subprocessors.") (labels found in the code)
- **Steps:**
  1. Open /subprocessors in a browser.
  2. Read the page title "Subprocessors." and the "Last updated:" line.
  3. Read the list of subprocessors.
  4. Check the change log link (to /changelog) is present.

## S88.26 Security/compliance evidence portal.

- **Expected:** Customers can review security and compliance evidence (reports, certifications, questionnaires) in a trust portal.
- **Code:** partial. Evidence present: apps/web/app/trust/page.tsx:85; apps/web/app/trust/page.tsx:48; apps/web/content/support/enterprise-security.md:23
- **Known to be unfinished:** owner: commission SOC 2, ISO 27001 and a third-party penetration test and publish the reports on the trust page
- **Earlier check in the running app:** PASS: E063 [PASS; page and content render only]: Linked page opens with readable content; backend enforcement or form submission not tested.
- **Owner decision is open on this item.**
- **Where to find it:** Browser address bar: /trust (heading "Claims with dates, and the ones we cannot make.") (labels found in the code)
- **Steps:**
  1. Open /trust in a browser.
  2. Read the heading and the section "Audit reports".
  3. Read the "SOC 2" and "ISO 27001" rows, which say no report is held.
  4. Compare with Expected: the page states no reports or certificates are published yet.

## S88.27 Jurisdiction-specific notices where applicable.

- **Expected:** Where required, users in a jurisdiction see the notices that apply to them (e.g. India DPDP, EU representative, region blocks).
- **Code:** done. Evidence present: apps/web/app/privacy/india/page.tsx:256; apps/web/app/legal/eu-representative/page.tsx:24; apps/web/app/legal/page.tsx:130; apps/web/app/privacy/india/page.tsx:256; apps/web/app/legal/eu-representative/page.tsx:24
- **Where to find it:** Settings > Help > Legal > India: DPDP notice (the EU representative page is reached the same way through the Legal page, or from the footer Legal list) (labels found in the code)
- **Steps:**
  1. Sign in, open Settings, and choose the Help tab.
  2. Click the Legal item (it opens the /legal page).
  3. Find and click the India: DPDP notice link. Check that the page titled Notice to Data Principals in India. loads and shows the DPDP Act, 2023 notice.
  4. Go back to Legal and click EU representative. Check that the page says no representative is currently appointed under Article 27 GDPR, with the date-stamped status text and where to send privacy requests.
