---
id: "PLAN-desktop-107"
type: "test-plan"
title: "Desktop · 107. Discovery, social, and public-content products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "107"
---
# Desktop · 107. Discovery, social, and public-content products

4 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S107.13 Attribution and source lineage.

- **Expected:** Public and third-party content shows who made it and where it came from (publisher, author, source, versions, "copied from").
- **Code:** done. Evidence present: apps/web/features/chat/components/share/SharedSessionViewer.tsx:89; apps/web/app/share/[token]/page.tsx:45; apps/web/lib/services/org-shared-session-service.ts:303
- **Where to find it:** Chat header > "Share conversation", then open the share link as a second account. The viewer shows "Shared by <name>", the message count and "Expires". (labels found in the code)
- **Needs:** A second account in the same workspace
- **Steps:**
  1. Sign in with account A, open a conversation, and click "Share conversation" in the chat header.
  2. In the dialog, choose a workspace or organization share and create the link.
  3. Sign in with account B in the same workspace (or open the link in a new window) and open the link.
  4. Look under the title for "Shared by <name>", "<n> messages" and "Expires <time>". Compare with Expected: publisher, author, source, versions and "copied from" were not found on this page.

## S107.15 Content reporting.

- **Expected:** A viewer can report a public page or an AI answer as harmful or infringing, and the report reaches the operators.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4065; apps/web/features/chat/components/messages/MessageBubble.tsx:1174
- **Where to find it:** An AI reply > "More message actions" > "Report this response". Report is offered only on AI replies, not on public share pages. (labels found in the code)
- **Needs:** A conversation that already has an AI reply
- **Steps:**
  1. Sign in, open a conversation that has an AI reply.
  2. Hover or click the AI reply, then click the "More message actions" button.
  3. Click "Report this response". The item changes to "Reporting…" and then "Reported".
  4. Compare with Expected: the report is sent to /api/content-report with category harmful. Confirming it reaches operators needs the operator dashboard (see S107.23).

## S107.20 Publisher participation.

- **Expected:** Third-party publishers can get their plugins or content in front of users: a submission path or a user-added publisher source, with the publisher named.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:972; packages/ui/ui/src/directory/DirectoryPanel.tsx:696; apps/web/app/partners/page.tsx:41
- **Where to find it:** Settings > Plugins > open a plugin you created > "Submit to the directory". Public information: the "Partners" page (site navigation) says "List a plugin in the directory". (labels found in the code)
- **Needs:** A plugin you created that is submittable
- **Steps:**
  1. Sign in, open Settings, and choose "Plugins".
  2. Open a plugin you created so its detail page shows.
  3. Click "Submit to the directory" and confirm in the dialog.
  4. Look for the submission note and the review note on the plugin page. Compare with Expected: the publisher is named and the submission goes to review.

## S107.23 Public-content moderation dashboard.

- **Expected:** Platform staff review reported public content in a dashboard, decide on it, and take content down.
- **Code:** done. Evidence present: apps/web/app/api/admin/copyright-notices/route.ts:108; apps/web/app/api/admin/copyright-notices/route.ts:109; apps/web/features/admin/components/CopyrightNoticeQueuePanel.tsx:55; apps/web/features/admin/components/CopyrightNoticeQueuePanel.tsx:186; apps/web/features/admin/pages/OperatorDashboardPage.tsx:501
- **Where to find it:** Operator dashboard (/operator) > content tab > "Rights notices" (staff account only). (labels found in the code)
- **Needs:** A staff operator account
- **Steps:**
  1. Sign in with a staff operator account and open /operator.
  2. Open the content tab, which holds the "Rights notices" list.
  3. Pick a notice, read its details, and choose a status; for an unpublish, click "Unpublish" and confirm the dialog.
  4. Compare with Expected: the notice is reviewed here and the public item is taken down, with the decision recorded in the audit log.
