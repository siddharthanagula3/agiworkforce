---
id: "PLAN-web-107"
type: "test-plan"
title: "Web · 107. Discovery, social, and public-content products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "107"
---
# Web · 107. Discovery, social, and public-content products

7 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S107.04 Curated public pages.

- **Expected:** Signed-out visitors can browse curated public pages of examples and directories built by the product team.
- **Code:** done. Evidence moved: apps/web/app/gallery/GalleryClient.tsx:1324 (quoted code not found in the file now); apps/web/app/gallery/GalleryClient.tsx:29 (quoted code not found in the file now); apps/web/app/plugins/page.tsx:39
- **Where to find it:** Open the sitemap page (apps/web route /sitemap-page) > Gallery. Public routes /gallery and /plugins also exist. (labels found in the code)
- **Steps:**
  1. Sign out, then open the sitemap page at /sitemap-page in the browser.
  2. Click Gallery under its list of links.
  3. Check that the curated examples page opens without signing in.
  4. Check the example cards and directory content are set by the product team, not by users, and compare with Expected.

## S107.11 Remix/fork.

- **Expected:** From a public shared conversation a viewer copies it into their own account and keeps working on it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/share/SharedSessionViewer.tsx:65 (quoted code not found in the file now); apps/web/app/chat/from-share/[token]/page.tsx:127 (quoted code not found in the file now)
- **Where to find it:** Open a shared link (/share/<token>) > Open in AGI (labels found in the code)
- **Needs:** a Free account and a public shared conversation link
- **Steps:**
  1. Sign in, then open a public shared conversation link (/share/<token>).
  2. Click Open in AGI in the top right of the header.
  3. Wait for the page /chat/from-share/<token> to create your own conversation.
  4. Send a new message in your own conversation and check it continues with the copied messages, compare with Expected.

## S107.12 Prompt reuse.

- **Expected:** From a public example a visitor reuses its prompt: the prompt lands in their composer ready to send.
- **Code:** done. Evidence present: apps/web/app/gallery/GalleryClient.tsx:1347; apps/web/app/gallery/[templateId]/page.tsx:37
- **Where to find it:** Gallery > choose a category card > fill in the creation wizard > send (prompt opens in /chat) (labels found in the code)
- **Steps:**
  1. Open the gallery page at /gallery.
  2. Click an example card or category, then fill in the wizard that opens.
  3. Submit the wizard, which opens /chat with the prompt added as starterPrompt.
  4. Check the prompt sits in the composer ready to send, and compare with Expected.

## S107.13 Attribution and source lineage.

- **Expected:** Public and third-party content shows who made it and where it came from (publisher, author, source, versions, "copied from").
- **Code:** done. Evidence present: apps/web/features/chat/components/share/SharedSessionViewer.tsx:89; apps/web/app/share/[token]/page.tsx:45; apps/web/lib/services/org-shared-session-service.ts:303
- **Where to find it:** Open a shared link (/share/<token>) > the line under the title that starts with Shared by (labels found in the code)
- **Steps:**
  1. Open a public shared conversation link (/share/<token>) while signed out.
  2. Look under the title for the line Shared by and the model badge.
  3. Check the message count and Expires line also appear.
  4. Compare with Expected: publisher and source shown, and check for copied-from or version information.

## S107.15 Content reporting.

- **Expected:** A viewer can report a public page or an AI answer as harmful or infringing, and the report reaches the operators.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4065; apps/web/features/chat/components/messages/MessageBubble.tsx:1174; apps/web/app/share/[token]/page.tsx:120; apps/web/app/api/mobile/content-report/route.ts:95
- **Where to find it:** A public share page (/share/<token>) > Report infringement or impersonation. For an AI answer: the answer's menu > Report this response. (labels found in the code)
- **Needs:** a signed-in account for the AI answer report
- **Steps:**
  1. Open a public shared conversation link (/share/<token>) and scroll to the bottom.
  2. Click Report infringement or impersonation and check the notice form opens.
  3. In a chat, open the menu on an AI answer and click Report this response.
  4. Check for the toast Reported. Thank you: our trust and safety team will review it., and compare with Expected.

## S107.20 Publisher participation.

- **Expected:** Third-party publishers can get their plugins or content in front of users: a submission path or a user-added publisher source, with the publisher named.
- **Code:** done. Evidence present: packages/ui/ui/src/directory/PluginDetailView.tsx:972; packages/ui/ui/src/directory/DirectoryPanel.tsx:696; apps/web/app/partners/page.tsx:41
- **Where to find it:** Plugins > open a plugin's detail > Submit to the directory (labels found in the code)
- **Needs:** a plugin you created in the account
- **Steps:**
  1. Open a plugin you created, then its detail view.
  2. Look for the button Submit to the directory under the plugin details.
  3. Click it and confirm in the dialog that opens.
  4. Check the plugin shows as submitted and is named, and compare with Expected.

## S107.23 Public-content moderation dashboard.

- **Expected:** Platform staff review reported public content in a dashboard, decide on it, and take content down.
- **Code:** done. Evidence present: apps/web/app/api/admin/copyright-notices/route.ts:108; apps/web/app/api/admin/copyright-notices/route.ts:109; apps/web/features/admin/components/CopyrightNoticeQueuePanel.tsx:55; apps/web/features/admin/components/CopyrightNoticeQueuePanel.tsx:186; apps/web/features/admin/pages/OperatorDashboardPage.tsx:501
- **Where to find it:** not found in the code. The moderation panels are in OperatorDashboardPage.tsx under a tab key 'content' (CopyrightNoticeQueuePanel and ContentTakedownPanel), but I did not find the visible label of that tab, so the path from the dashboard is unknown.
- **Needs:** a platform staff account
