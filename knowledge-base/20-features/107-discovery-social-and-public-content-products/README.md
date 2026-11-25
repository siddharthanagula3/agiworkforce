---
id: "AREA-107"
type: "area"
title: "Discovery, social, and public-content products"
features: ["F107-01", "F107-02", "F107-03", "F107-04", "F107-05", "F107-06", "F107-07", "F107-08", "F107-09", "F107-10", "F107-11", "F107-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 107. Discovery, social, and public-content products

This area covers what people see beyond their own chats: public shared chats, a gallery of examples, public work by other users, and the rules for reporting and removing content. A visitor can read a shared chat, copy it into their own account and keep going, reuse a gallery example's prompt, and report harmful or infringing content. Most of the discovery side the brief describes (personal feed, topics, follows, blocking, collections, comments) has no code in the repository yet, so the area is mostly sharing, gallery examples, reporting and operator takedown.

**Who uses it.** Signed-out visitors and anyone with a share link (read a public shared chat, browse the curated gallery). Signed-in users (copy a shared chat into their account, report an AI answer or a shared item). Platform admins only (review the report queue and copyright notices, unpublish content). Publishers and partners (plugin directory submission and marketplace sources; the partner page is a contact page). The brief marks no paid-plan gate for this area, and the code I opened shows none.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F107-01](F107-01-personal-discovery-feed-topics-and-feed-tuning.md) | Personal discovery feed, topics and feed tuning | no | no | no | n/a | n/a | n/a |
| [F107-02](F107-02-news-and-research-collections-licensed-content.md) | News and research collections, licensed content | no | no | no | n/a | n/a | n/a |
| [F107-03](F107-03-curated-gallery-examples-and-prompt-reuse.md) | Curated gallery examples and prompt reuse | built | n/a | no | n/a | n/a | n/a |
| [F107-04](F107-04-public-gallery-of-user-work-artifacts-generated-ap.md) | Public gallery of user work (artifacts, generated apps, images and video) | no | no | no | n/a | n/a | n/a |
| [F107-05](F107-05-creator-profiles-and-following.md) | Creator profiles and following | no | no | no | n/a | n/a | n/a |
| [F107-06](F107-06-favorites-and-saved-items.md) | Favorites and saved items | no | no | no | n/a | n/a | n/a |
| [F107-07](F107-07-shared-chats-read-copy-into-my-account-and-attribu.md) | Shared chats: read, copy into my account, and attribution | built | built | partly | partly | n/a | n/a |
| [F107-08](F107-08-comments-blocking-and-muting.md) | Comments, blocking and muting | no | no | partly | n/a | n/a | n/a |
| [F107-09](F107-09-reporting-harmful-content.md) | Reporting harmful content | built | built | built | no | no | no |
| [F107-10](F107-10-sponsored-content-labels-and-paid-ranking-rules.md) | Sponsored content labels and paid ranking rules | n/a | n/a | n/a | n/a | n/a | n/a |
| [F107-11](F107-11-publisher-and-partner-programs.md) | Publisher and partner programs | partly | partly | no | built | n/a | n/a |
| [F107-12](F107-12-moderation-queue-for-platform-staff.md) | Moderation queue for platform staff | built | built | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/107-discovery-social-and-public-content-products.md](../../10-requirements/capabilities/107-discovery-social-and-public-content-products.md).

## How this area works in the code

1. **Share a chat.** The owner creates a share link with a visibility of public or organization. The share route writes a row and returns the token. The visibility is normalised, and anything other than organization becomes public. (`apps/web/app/api/share/route.ts:598`, `apps/web/lib/services/org-shared-session-service.ts:34`)
2. **Resolve the share for a viewer.** The public share page first looks for a public row by token. If none is found, it tries the signed-in, row-security read for organization shares. A share that is not live is treated as not found. (`apps/web/app/share/[token]/page.tsx:28-48`, `apps/web/lib/services/org-shared-session-service.ts:255-264`, `apps/web/app/share/[token]/page.tsx:78-80`)
3. **Render the read-only page.** System messages are removed, and the viewer shows the title, model, sharer, message count and expiry. Signed-out viewers see sign-up and sign-in links. (`apps/web/app/share/[token]/page.tsx:100-122`, `apps/web/features/chat/components/share/SharedSessionViewer.tsx:48-105`)
4. **Fetch the share as JSON for the copy step.** The API returns the share with a 410 response when the link has expired, a 404 when it is missing, and a rate limit on the share-view bucket. (`apps/web/app/api/share/[token]/route.ts:60-80`)
5. **Copy the chat into the viewer's account.** The continue screen reads the workspace, fetches the share, creates a new conversation with the title and model, then posts messages in batches of 200 to the bulk-message route. Artifacts from the shared chat are saved in the local artifact store. On success it opens the new chat. On failure it deletes the partial conversation. (`apps/web/app/chat/from-share/[token]/ContinueSharedSession.tsx:142-200`, `apps/web/app/chat/from-share/[token]/ContinueSharedSession.tsx:25-26`, `apps/web/app/chat/from-share/[token]/ContinueSharedSession.tsx:89-116`)
6. **Report content from the chat.** The web message menu sends a report with the harmful category, the message ID, the conversation ID and up to 500 characters of the message. The report goes to the content-report route, which is the same handler as the mobile route. (`apps/web/features/chat/components/messages/MessageBubble.tsx:1170-1185`, `apps/web/features/chat/components/messages/MessageBubble.tsx:4058-4068`, `apps/web/app/api/content-report/route.ts:14`)
7. **Validate and store the report.** The handler checks the CSRF token and a rate limit, validates the body with a schema, and reads the user if signed in. It inserts a row into the reports table, using the client report ID as a unique key so repeats do nothing. (`apps/web/app/api/mobile/content-report/route.ts:34-63`, `apps/web/app/api/mobile/content-report/route.ts:65-122`)
8. **Mobile report hand-off.** The mobile app keeps reports in on-device storage and can open the mail app with the report filled in. The intake route comment says the device copy is an offline fallback only. (`apps/mobile/services/contentReport.ts:125-150`)
9. **Staff review and takedown.** Platform admins list notices and record decisions. Marking a notice actioned calls the takedown route, which needs an admin session, a CSRF token and an audit event. A not-found result leads to a separate confirm step that records the notice without removing anything. (`apps/web/app/api/admin/copyright-notices/route.ts:49-106`, `apps/web/features/admin/components/CopyrightNoticeQueuePanel.tsx:115-150`, `apps/web/app/api/admin/takedown/route.ts:27-60`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/share/[token]/page.tsx` | Public shared-chat page: resolves the share (public first, then signed-in organization read) and renders it. |
| `apps/web/app/chat/from-share/[token]/ContinueSharedSession.tsx` | Copies a shared chat into the viewer's account as a new conversation, with batching, artifact keeping and cleanup on failure. |
| `apps/web/lib/services/org-shared-session-service.ts` | Share lookup and visibility rules; the public query requires visibility public. |
| `apps/web/app/api/share/[token]/route.ts` | JSON API for a share; returns 410 when expired and a rate limit on share-view. |
| `apps/web/app/gallery/GalleryClient.tsx` | Gallery screen: own-artifact list, curated examples, filters, and the launch-to-chat prompt action. |
| `apps/web/app/gallery/inspiration.ts` | Static list of curated gallery examples and the lookup helpers. |
| `apps/web/app/api/mobile/content-report/route.ts` | Report intake for all surfaces (also served at /api/content-report); validates, rate-limits and inserts the report. |
| `apps/web/features/chat/components/messages/MessageBubble.tsx` | Web chat message menu with the report action for AI answers. |
| `apps/mobile/services/contentReport.ts` | Mobile report storage on the device and the mail hand-off. |
| `apps/web/app/api/admin/copyright-notices/route.ts` | Admin list and decision endpoint for copyright notices, with audit events. |
| `apps/web/app/api/admin/takedown/route.ts` | Operator-only unpublish of a public share or artifact, with audit. |
| `apps/web/features/admin/components/CopyrightNoticeQueuePanel.tsx` | Admin UI for reviewing notices and recording decisions, with a confirm dialog for records that need one. |

## What is stored

- Content reports: user ID (optional), client report ID (unique), message ID, conversation ID, category, excerpt (500 max), user note (2,000 max), and a metadata JSON with source, asset, shared item and subject.: Postgres table public.content_reports (apps/web/app/api/mobile/content-report/route.ts:94-115; schema in apps/web/db/neon/0093_content_reports.sql and row security in 0172_content_reports_row_level_security.sql).
- Shared chats: token, title, model, provider, messages snapshot, visibility, expiry, created date and owner, plus the organization link for organization shares.: Postgres via apps/web/lib/services/org-shared-session-service.ts (queries at lines 255-264 and 394; exact table names not confirmed).
- Copyright notices and their decisions and notes.: Stored by apps/web/lib/server/copyright-notices (module not opened; called from apps/web/app/api/admin/copyright-notices/route.ts:57-86).
- Mobile content reports kept on the device.: Device key-value storage under MMKV_KEY, apps/mobile/services/contentReport.ts:118-135.
- Artifacts saved from a shared chat and the gallery's own-artifact list.: Browser-side artifact store (apps/web/features/chat/stores/artifacts-store, imported by ContinueSharedSession.tsx:18 and GalleryClient.tsx:25).
- Curated gallery examples.: Code, not data: apps/web/app/gallery/inspiration.ts:10.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Share visibility (public or organization)**: Decides whether a share link is readable by anyone or only by signed-in members of the organization. (apps/web/lib/services/org-shared-session-service.ts:34 and 255-264)
- **Share expiry**: Expired shares show an expired notice and return 410. (apps/web/app/api/share/[token]/route.ts:70-80; apps/web/app/share/[token]/page.tsx:78-80)
- **Rate limits**: Limit the share-view, mobile-content-report and admin-security buckets. (withRateLimit calls in apps/web/app/api/share/[token]/route.ts:62, apps/web/app/api/mobile/content-report/route.ts:69, apps/web/app/api/admin/copyright-notices/route.ts:50 and apps/web/app/api/admin/takedown/route.ts:33; the limits themselves are in apps/web/lib/rate-limit.ts (not opened).)
- **Platform admin gate**: Admin queues and takedown need a platform admin session. (requirePlatformAdmin in apps/web/app/api/admin/copyright-notices/route.ts:53 and 71, apps/web/app/api/admin/takedown/route.ts:36)
- **Size limits on copy and report**: Message copy batch size 200; message length 100,000; report excerpt 500; report note 2,000; subject ID length from the shared contract. (apps/web/app/chat/from-share/[token]/ContinueSharedSession.tsx:25-26; apps/web/app/api/mobile/content-report/route.ts:34-63)
- **Gallery prompt launch**: Sends the example prompt to the chat composer as starterPrompt. (apps/web/app/gallery/GalleryClient.tsx:1345-1347; apps/web/app/gallery/[templateId]/page.tsx:37-40)
- **No plan gate found**: No paid-plan check was seen in the share, gallery, report or copy code. (Not found in the files opened.)

## Shared between apps

Shared: the report intake (one handler, served at /api/mobile/content-report and aliased at /api/content-report, apps/web/app/api/content-report/route.ts:14); the shared request contract (@agiworkforce/cloud-contracts, for report subject kinds and the managed-cloud headers); the directory UI for plugins (packages/ui/ui/src/directory/PluginDetailView.tsx and DirectoryPanel.tsx), used by web and desktop; the admin content queue service and panels. Web only: the gallery (apps/web/app/gallery), the share page and continue screen, the copyright form (apps/web/app/copyright/report), the partners page. Mobile only: contentReport.ts (on-device storage and mail hand-off) and its report sheet (apps/mobile/src/features/chat/components/ReportFlagButton.tsx). CLI only: apps/cli/src/cloud/marketplaces.rs, which adds marketplace sources. The brief lists desktop as done for several items; the desktop code was not opened.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief cites from-share/[token]/page.tsx:127 for the copy-into-account code. That file is 12 lines long; the real logic is in ContinueSharedSession.tsx. (apps/web/app/chat/from-share/[token]/page.tsx:1-12)
- The brief cites GalleryClient.tsx:1324 and :1119 for the curated gallery and prompt reuse. Those lines are scope and filter handling and the category select. The curated list comes from inspiration.ts, and launch is at GalleryClient.tsx:1345-1347. (apps/web/app/gallery/GalleryClient.tsx:1315-1347)
- The brief cites MessageBubble.tsx:3085 for the report action. That line is an image zoom overlay. The report action is at 1170-1185 and 4058-4068. (apps/web/features/chat/components/messages/MessageBubble.tsx:3080-3090)
- A shared chat page offers a report link only for copyright or impersonation. It does not offer the harmful-content report the brief asks for in S107.15. (apps/web/app/share/[token]/page.tsx:120; apps/web/app/copyright/report/ReportContentLink.tsx:17-24)
- The intake route says the mobile device copy is an offline fallback only, but the mobile code opens the mail app with the report and keeps reports on the device. The two contradict each other, and the mail hand-off is not documented in the route. (apps/web/app/api/mobile/content-report/route.ts:9-10; apps/mobile/services/contentReport.ts:125-150)
- The brief cites OperatorDashboardPage.tsx:453 for the moderation dashboard. That code shows feedback rows with screenshots, not the copyright or report queue. The queue panel is CopyrightNoticeQueuePanel.tsx and the content-report admin route. (apps/web/features/admin/pages/OperatorDashboardPage.tsx:445-460)
- The gallery opens shared items at /shared-artifact/[token]. That route exists (apps/web/app/shared-artifact/[token]) but was not opened, so its visibility rules are unverified. (apps/web/app/gallery/GalleryClient.tsx:1341-1343)
- The brief cites partners/page.tsx:35 as a participation path. The page lists opportunities and describes who is wanted; it has no join form or program sign-up, which matches the brief marking merchant participation missing. (apps/web/app/partners/page.tsx:35-50)

## Not established

- Feed, topics, follows, creator profiles, favorites, blocking, muting, collections, comments, licensed content and merchant programs: I searched the web app for discover, feed, follow, favorite, bookmark, block and mute, and found no feature code for them. The brief marks them missing, so I did not chase them further.
- Desktop code for shares, the gallery, reports and the directory was not opened. The desktop status (done) is taken from the brief.
- CLI and VS Code and Chrome reporting: the brief marks them missing (CLI unverified for attribution); I did not read those surfaces.
- The rate-limit bucket values (apps/web/lib/rate-limit.ts) and the copyright notice store (apps/web/lib/server/copyright-notices) were not opened.
- The exact database table names for shared chats, and the full lookup for organization shares (org-shared-session-service.ts beyond lines 34, 255-264 and 394), were not confirmed.
- Whether plugin submissions are scanned and reviewed as the partner page says: the review code was not opened.
- Whether any plan or feature flag gates sharing, the gallery or reporting: none was seen in the files opened, but I did not search for flags across the whole repository.
- The taking-down path for a shared chat (the owner's own delete route) was not opened.
- The mobile report sheet, its categories and the send path beyond contentReport.ts were not read in full.
- No build, test or server was run, per the instructions; this is a code-reading result only.
