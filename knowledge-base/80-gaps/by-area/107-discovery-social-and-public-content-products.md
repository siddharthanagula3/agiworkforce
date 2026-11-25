---
id: "GAPS-AREA-107"
type: "gap-list"
title: "Gaps: Discovery, social, and public-content products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 107. Discovery, social, and public-content products

65 open gaps that touch this area. Area page: [20-features/107-discovery-social-and-public-content-products](../../20-features/107-discovery-social-and-public-content-products/README.md).

## CMP-CP341

**Read-only share link of a session**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F107-07](../../20-features/107-discovery-social-and-public-content-products/F107-07-shared-chats-read-copy-into-my-account-and-attribu.md)
- Detail: Creating a share link from the CLI is the missing part agi shares lists the conversation links the user shared and revokes one (apps/cli/src/lib.rs:1023-1024,1263-1271). Creating a share link from the CLI is the missing part; the search looked only in tui and repl.
- Evidence: searched: /share, share link in apps/cli/src/tui, repl

## CMP-DP87

**Share plugins with workspace teammates**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F107-11](../../20-features/107-discovery-social-and-public-content-products/F107-11-publisher-and-partner-programs.md)
- Detail: The cited route is read-only: apps/web/app/api/plugins/organization/route.ts exports GET only and lists what the worksp… The cited route is read-only: apps/web/app/api/plugins/organization/route.ts exports GET only and lists what the workspace already published. Publishing to the workspace is an admin action (apps/web/app/api/settings/organization/plugins/route.ts:43-50 canManage; WorkspacePlugins.tsx upload). A membe
- Evidence: apps/web/app/api/plugins/organization/route.ts

## CMP-W345

**Give a teammate edit access to an agent, share it with a group, and handle two people editing**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F107-11](../../20-features/107-discovery-social-and-public-content-products/F107-11-publisher-and-partner-programs.md)
- Detail: An agent has one owner who sets who can use it; nobody else can edit it and it cannot be shared with a group.
- Evidence: apps/web/features/agents/components/AgentPublishPanel.tsx:216-218; searched: canEdit, collaborator in apps/web/features/agents

## CMP-W349

**Plugin publish review (request changes, approve)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F107-11](../../20-features/107-discovery-social-and-public-content-products/F107-11-publisher-and-partner-programs.md)
- Detail: Plugins publish straight to the workspace; no review queue with changes requested.
- Evidence: apps/web/app/api/settings/organization/plugins/route.ts:82; searched: changes requested in apps/web

## CMP-W354

**Shareable profile with activity stats and Sites showcase**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F107-05](../../20-features/107-discovery-social-and-public-content-products/F107-05-creator-profiles-and-following.md)
- Detail: No public or workspace profile page.
- Evidence: searched: profile share, activity stats, /u/ in apps/web/app, features

## CMP-W355

**Site co-editing and editor role**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-04](../../20-features/026-artifact-container-and-panel/F026-04-preview-source-view-and-read-only-mode.md), [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F107-04](../../20-features/107-discovery-social-and-public-content-products/F107-04-public-gallery-of-user-work-artifacts-generated-ap.md)
- Detail: Sites are owner-only; invited people are view-only.
- Evidence: apps/web/features/sites/components/SiteViewersEditor.tsx; searched: co-edit, editor in features/sites

## CMP-W356

**Sites: transfer ownership of a site to another person**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F107-04](../../20-features/107-discovery-social-and-public-content-products/F107-04-public-gallery-of-user-work-artifacts-generated-ap.md)
- Detail: A site stays with its publisher; ownership transfer exists only for workspaces.
- Evidence: searched: transferOwner, transfer ownership in apps/web/features/sites, apps/web/app/api/artifacts (only apps/web/lib/services/organization-seat-service.ts:100 for workspaces)

## CMP-WP262

**Share a chat as a public snapshot link**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F107-07](../../20-features/107-discovery-social-and-public-content-products/F107-07-shared-chats-read-copy-into-my-account-and-attribu.md)
- Detail: Leader links have no expiry and last until unshared (catalog oh08:68, ch05:60) The dialog offers only 1, 7 or 30 days (apps/web/features/chat/components/share/ShareConversationDialog.tsx:28-30), so every link dies within 30 days. Leader links have no expiry and last until unshared (catalog oh08:68, ch05:60). A user cannot keep a lasting public link, which is a gap, not parity.
- Evidence: apps/web/features/chat/components/share/ShareConversationDialog.tsx:29; apps/web/app/api/share/route.ts:32

## CMP-WP264

**Share a plugin or skill with people, groups or the workspace**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F107-11](../../20-features/107-discovery-social-and-public-content-products/F107-11-publisher-and-partner-programs.md)
- Detail: No named-person sharing or link Skills can be shared with the workspace and admins publish plugins with Required, Installed by default or Available per group; no named-person sharing or link.
- Evidence: apps/web/features/skills/components/SkillEditorDialog.tsx:52; features/workspace-console/components/WorkspacePlugins.tsx:37

## GAP-AREA107-LW05

**The intake route says the mobile device copy is an offline fallback only, but the mobile code opens the mail app with the report and keeps reports on the device. The two contradict each other, and the mail hand-off is not documented in the route.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-107
- Detail: Area 107. Discovery, social, and public-content products
- Evidence: apps/web/app/api/mobile/content-report/route.ts:9-10; apps/mobile/services/contentReport.ts:125-150

## GAP-AREA107-LW07

**The gallery opens shared items at /shared-artifact/[token]. That route exists (apps/web/app/shared-artifact/[token]) but was not opened, so its visibility rules are unverified.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-107
- Detail: Area 107. Discovery, social, and public-content products
- Evidence: apps/web/app/gallery/GalleryClient.tsx:1341-1343

## GAP-CAP-sharing-and-collaboration-01

**Share a chat as a public snapshot link: Links always expire within 30 days, while both leaders' links last until unshared. CLI cannot create a link. Behaviour for Local chats not established.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F107-07](../../20-features/107-discovery-social-and-public-content-products/F107-07-shared-chats-read-copy-into-my-account-and-attribu.md)
- Requirement items: S107.11
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-sharing-and-collaboration-07

**Continue a shared chat as your own: Mobile cannot copy a shared chat.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F107-07](../../20-features/107-discovery-social-and-public-content-products/F107-07-shared-chats-read-copy-into-my-account-and-attribu.md)
- Requirement items: S107.11
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-sharing-and-collaboration-24

**Hosted sites: audience, outside viewers, editors: No site editor role, no owner transfer. Public gallery missing on mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F026-07](../../20-features/026-artifact-container-and-panel/F026-07-sharing-and-visibility.md), [F107-04](../../20-features/107-discovery-social-and-public-content-products/F107-04-public-gallery-of-user-work-artifacts-generated-ap.md)
- Requirement items: S107.05, S26.31
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-sharing-and-collaboration-26

**Share agents, plugins and skills: No named-person or group sharing; no review queue.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F107-11](../../20-features/107-discovery-social-and-public-content-products/F107-11-publisher-and-partner-programs.md)
- Requirement items: S107.20
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-sharing-and-collaboration-29

**Shareable public profile: Absent.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F107-05](../../20-features/107-discovery-social-and-public-content-products/F107-05-creator-profiles-and-following.md)
- Requirement items: S107.08
- Detail: Claude unknown, ChatGPT yes; AGI not built

## GAP-F107-01-01

**Whole feature missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-01](../../20-features/107-discovery-social-and-public-content-products/F107-01-personal-discovery-feed-topics-and-feed-tuning.md)
- Detail: Affects: Web, Desktop, Mobile users. Work needed: Product decision, content source, ranking service, topic store, UI on three apps, tests.
- Evidence: Brief S107.01, S107.02, S107.17 status missing; no code found

## GAP-F107-01-02

**No content source defined**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-01](../../20-features/107-discovery-social-and-public-content-products/F107-01-personal-discovery-feed-topics-and-feed-tuning.md)
- Detail: Affects: All apps. Work needed: Choose source and licence (see F107-02).
- Evidence: No news or research source service found in packages or apps/web/lib [inferred from search]

## GAP-F107-01-NOTBUILT

**Personal discovery feed, topics and feed tuning: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F107-01](../../20-features/107-discovery-social-and-public-content-products/F107-01-personal-discovery-feed-topics-and-feed-tuning.md)
- Requirement items: S107.01, S107.02, S107.17
- Detail: Web: S107.01, S107.02, S107.17; Desktop: S107.01, S107.02, S107.17; Mobile: S107.01, S107.02, S107.17

## GAP-F107-02-01

**Collections missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-02](../../20-features/107-discovery-social-and-public-content-products/F107-02-news-and-research-collections-licensed-content.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Content source, collection model, browse and subscribe UI.
- Evidence: Brief S107.03 missing

## GAP-F107-02-02

**Licensed content missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-02](../../20-features/107-discovery-social-and-public-content-products/F107-02-news-and-research-collections-licensed-content.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Publisher contracts, licence enforcement, citations, metering.
- Evidence: Brief S107.21 missing

## GAP-F107-02-NOTBUILT

**News and research collections, licensed content: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F107-02](../../20-features/107-discovery-social-and-public-content-products/F107-02-news-and-research-collections-licensed-content.md)
- Requirement items: S107.03, S107.21
- Detail: Web: S107.03, S107.21; Desktop: S107.03, S107.21; Mobile: S107.03, S107.21

## GAP-F107-03-01

**No mobile curated gallery or prompt reuse**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-03](../../20-features/107-discovery-social-and-public-content-products/F107-03-curated-gallery-examples-and-prompt-reuse.md)
- Detail: Affects: Mobile users. Work needed: Mobile screen and shared registry package.
- Evidence: Brief S107.04 and S107.12 mobile missing; mobile artifacts screen lists own items only

## GAP-F107-03-02

**Signed-out prompt reuse unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-03](../../20-features/107-discovery-social-and-public-content-products/F107-03-curated-gallery-examples-and-prompt-reuse.md)
- Detail: Affects: Signed-out visitors on web. Work needed: Test the journey; make guest chat read the prompt if it does not.
- Evidence: chat/layout.tsx guest path; GuestChat.tsx has no starter prompt reference

## GAP-F107-03-03

**Prompt reuse not offered from the list drawer**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-03](../../20-features/107-discovery-social-and-public-content-products/F107-03-curated-gallery-examples-and-prompt-reuse.md)
- Detail: Affects: Web visitors. Work needed: Add the action or document the two-step path.
- Evidence: Drawer links are 'Open page' and 'Open chat' only

## GAP-F107-03-04

**Brief code citations are stale**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-03](../../20-features/107-discovery-social-and-public-content-products/F107-03-curated-gallery-examples-and-prompt-reuse.md)
- Detail: Affects: Maintainers. Work needed: Update the brief.
- Evidence: GalleryClient.tsx:1119 is in SharedNotice; 1324 is in the category and launch handlers area, not the curated list

## GAP-F107-03-05

**Examples are code-only and hard-wired for six**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-03](../../20-features/107-discovery-social-and-public-content-products/F107-03-curated-gallery-examples-and-prompt-reuse.md)
- Detail: Affects: Product team. Work needed: Optional: content source for staff edits.
- Evidence: inspiration.ts

## GAP-F107-03-06

**No recorded run of the e2e or unit tests**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-03](../../20-features/107-discovery-social-and-public-content-products/F107-03-curated-gallery-examples-and-prompt-reuse.md)
- Detail: Affects: Testers. Work needed: Run and record.
- Evidence: No result file read

## GAP-F107-03-NOTBUILT

**Curated gallery examples and prompt reuse: not built on Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile
- Features: [F107-03](../../20-features/107-discovery-social-and-public-content-products/F107-03-curated-gallery-examples-and-prompt-reuse.md)
- Requirement items: S107.04, S107.12
- Detail: Mobile: S107.04, S107.12

## GAP-F107-04-01

**No public gallery of artifacts**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-04](../../20-features/107-discovery-social-and-public-content-products/F107-04-public-gallery-of-user-work-artifacts-generated-ap.md)
- Detail: Affects: All visitors. Work needed: Opt-in flag, list endpoint, moderation gate, UI.
- Evidence: Brief S107.05; no list endpoint

## GAP-F107-04-02

**No generated apps or media gallery**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-04](../../20-features/107-discovery-social-and-public-content-products/F107-04-public-gallery-of-user-work-artifacts-generated-ap.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Publish path for sites and media, list UI.
- Evidence: Brief S107.06, S107.07

## GAP-F107-04-03

**No author shown on public pages**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-04](../../20-features/107-discovery-social-and-public-content-products/F107-04-public-gallery-of-user-work-artifacts-generated-ap.md)
- Detail: Affects: Viewers. Work needed: Attribution decision (S107.13).
- Evidence: GAP-266 text

## GAP-F107-04-04

**Brief gives no web status for S107.05**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-04](../../20-features/107-discovery-social-and-public-content-products/F107-04-public-gallery-of-user-work-artifacts-generated-ap.md)
- Detail: Affects: Planning. Work needed: Correct the brief: web has no public list.
- Evidence: Brief S107.05 lists mobile only

## GAP-F107-04-NOTBUILT

**Public gallery of user work (artifacts, generated apps, images and video): not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F107-04](../../20-features/107-discovery-social-and-public-content-products/F107-04-public-gallery-of-user-work-artifacts-generated-ap.md)
- Requirement items: S107.05, S107.06, S107.07
- Detail: Web: S107.06, S107.07; Desktop: S107.06, S107.07; Mobile: S107.05, S107.06, S107.07

## GAP-F107-05-01

**Profiles missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-05](../../20-features/107-discovery-social-and-public-content-products/F107-05-creator-profiles-and-following.md)
- Detail: Affects: All apps. Work needed: Public identity design, profile page, privacy controls.
- Evidence: Brief S107.08

## GAP-F107-05-02

**Follow missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-05](../../20-features/107-discovery-social-and-public-content-products/F107-05-creator-profiles-and-following.md)
- Detail: Affects: All apps. Work needed: Follow table, controls, notification path.
- Evidence: Brief S107.09

## GAP-F107-05-03

**No public gallery to profile**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-05](../../20-features/107-discovery-social-and-public-content-products/F107-05-creator-profiles-and-following.md)
- Detail: Affects: Planning. Work needed: Build F107-04 first.
- Evidence: F107-04 unbuilt

## GAP-F107-05-NOTBUILT

**Creator profiles and following: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F107-05](../../20-features/107-discovery-social-and-public-content-products/F107-05-creator-profiles-and-following.md)
- Requirement items: S107.08, S107.09
- Detail: Web: S107.08, S107.09; Desktop: S107.08, S107.09; Mobile: S107.08, S107.09

## GAP-F107-06-01

**Feature missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-06](../../20-features/107-discovery-social-and-public-content-products/F107-06-favorites-and-saved-items.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Saved-items store, controls, list, sync.
- Evidence: Brief S107.10

## GAP-F107-06-02

**No decision on where saved items live**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-06](../../20-features/107-discovery-social-and-public-content-products/F107-06-favorites-and-saved-items.md)
- Detail: Affects: Design. Work needed: Decide Library filter versus separate page.
- Evidence: No document found

## GAP-F107-06-NOTBUILT

**Favorites and saved items: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F107-06](../../20-features/107-discovery-social-and-public-content-products/F107-06-favorites-and-saved-items.md)
- Requirement items: S107.10
- Detail: Web: S107.10; Desktop: S107.10; Mobile: S107.10

## GAP-F107-07-01

**Brief says mobile remix is missing; code has Continue in a new chat but only text and title.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-07](../../20-features/107-discovery-social-and-public-content-products/F107-07-shared-chats-read-copy-into-my-account-and-attribu.md)
- Detail: Affects: Mobile users. Work needed: Update brief; decide whether model, artifacts and attachments should be carried; add a viewer for /share links.
- Evidence: continueSharedChat.ts:28-45; brief S107.11

## GAP-F107-07-02

**Public shares show no sharer name and no lineage.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-07](../../20-features/107-discovery-social-and-public-content-products/F107-07-shared-chats-read-copy-into-my-account-and-attribu.md)
- Detail: Affects: Web and desktop viewers. Work needed: Decide what attribution public shares should show and add it.
- Evidence: page.tsx:44-48

## GAP-F107-07-03

**No expired notice on /share itself.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-07](../../20-features/107-discovery-social-and-public-content-products/F107-07-shared-chats-read-copy-into-my-account-and-attribu.md)
- Detail: Affects: Web readers. Work needed: Optional expired-specific page.
- Evidence: page.tsx:112-114

## GAP-F107-07-04

**CLI has no way to view or copy a share.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-07](../../20-features/107-discovery-social-and-public-content-products/F107-07-shared-chats-read-copy-into-my-account-and-attribu.md)
- Detail: Affects: CLI users. Work needed: Add view and copy commands or mark not applicable.
- Evidence: apps/cli/src/cloud/shares.rs:31-48

## GAP-F107-07-05

**No offline, cancel or timeout handling on web copy.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-07](../../20-features/107-discovery-social-and-public-content-products/F107-07-shared-chats-read-copy-into-my-account-and-attribu.md)
- Detail: Affects: Web users on weak networks. Work needed: Add cancel and timeout messages.
- Evidence: ContinueSharedSession.tsx

## GAP-F107-07-PARTLY

**Shared chats: read, copy into my account, and attribution: partly built on CLI**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F107-07](../../20-features/107-discovery-social-and-public-content-products/F107-07-shared-chats-read-copy-into-my-account-and-attribu.md)
- Requirement items: S107.13

## GAP-F107-08-01

**No comments anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-08](../../20-features/107-discovery-social-and-public-content-products/F107-08-comments-blocking-and-muting.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Product decision, then build.
- Evidence: search found nothing; brief S107.14

## GAP-F107-08-02

**No server-side block or mute; mobile hide is device-only and covers only workspace shares.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-08](../../20-features/107-discovery-social-and-public-content-products/F107-08-comments-blocking-and-muting.md)
- Detail: Affects: All apps. Work needed: Server table and route plus UI on each app.
- Evidence: hiddenSharers.ts

## GAP-F107-08-NOTBUILT

**Comments, blocking and muting: not built on Web, Desktop**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F107-08](../../20-features/107-discovery-social-and-public-content-products/F107-08-comments-blocking-and-muting.md)
- Requirement items: S107.14, S107.16
- Detail: Web: S107.14, S107.16; Desktop: S107.14, S107.16

## GAP-F107-09-01

**Web cannot choose a category or add a note.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-09](../../20-features/107-discovery-social-and-public-content-products/F107-09-reporting-harmful-content.md)
- Detail: Affects: Web and desktop users. Work needed: Add a small dialog.
- Evidence: MessageBubble.tsx:1180-1183

## GAP-F107-09-02

**No harmful-content report on public share pages.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-09](../../20-features/107-discovery-social-and-public-content-products/F107-09-reporting-harmful-content.md)
- Detail: Affects: Web readers. Work needed: Add a report control posting subject kind shared-item.
- Evidence: page.tsx:117-121

## GAP-F107-09-03

**CLI, VS Code and Chrome have no report control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-09](../../20-features/107-discovery-social-and-public-content-products/F107-09-reporting-harmful-content.md)
- Detail: Affects: Those apps. Work needed: Add or mark not applicable.
- Evidence: brief S107.15

## GAP-F107-09-04

**No feedback to the reporter after review.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-09](../../20-features/107-discovery-social-and-public-content-products/F107-09-reporting-harmful-content.md)
- Detail: Affects: All reporters. Work needed: Product decision.
- Evidence: reviewer note never returned automatically (0124 migration comment)

## GAP-F107-09-NOTBUILT

**Reporting harmful content: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F107-09](../../20-features/107-discovery-social-and-public-content-products/F107-09-reporting-harmful-content.md)
- Requirement items: S107.15
- Detail: CLI: S107.15; VS Code: S107.15; Chrome: S107.15

## GAP-F107-10-01

**No rule or guard exists for the future case.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-10](../../20-features/107-discovery-social-and-public-content-products/F107-10-sponsored-content-labels-and-paid-ranking-rules.md)
- Detail: Affects: Future directory or feed. Work needed: Add when paid placement is decided.
- Evidence: no code found

## GAP-F107-11-01

**No merchant or partner program.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-11](../../20-features/107-discovery-social-and-public-content-products/F107-11-publisher-and-partner-programs.md)
- Detail: Affects: All apps. Work needed: Product decision.
- Evidence: brief S107.22; partners page

## GAP-F107-11-02

**Mobile has no submission or marketplace add.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-11](../../20-features/107-discovery-social-and-public-content-products/F107-11-publisher-and-partner-programs.md)
- Detail: Affects: Mobile. Work needed: Decide scope.
- Evidence: brief S107.20

## GAP-F107-11-03

**Partner applications are email only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-11](../../20-features/107-discovery-social-and-public-content-products/F107-11-publisher-and-partner-programs.md)
- Detail: Affects: Operators. Work needed: Store and track applications.
- Evidence: apply/route.ts

## GAP-F107-11-04

**Publisher attribution on the directory not verified end to end.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-11](../../20-features/107-discovery-social-and-public-content-products/F107-11-publisher-and-partner-programs.md)
- Detail: Affects: Web, desktop. Work needed: Verify in the running app.
- Evidence: DirectoryPanel.tsx:608-616 shows a publisher filter

## GAP-F107-11-NOTBUILT

**Publisher and partner programs: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F107-11](../../20-features/107-discovery-social-and-public-content-products/F107-11-publisher-and-partner-programs.md)
- Requirement items: S107.20, S107.22
- Detail: Web: S107.22; Desktop: S107.22; Mobile: S107.20, S107.22

## GAP-F107-12-01

**Notice decision and takedown are two calls, so a partial result can leave a notice undecided.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-12](../../20-features/107-discovery-social-and-public-content-products/F107-12-moderation-queue-for-platform-staff.md)
- Detail: Affects: Operators. Work needed: Make atomic or add recovery text.
- Evidence: CopyrightNoticeQueuePanel.tsx:126-163

## GAP-F107-12-02

**Reports do not link to the reported content in the queue.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-12](../../20-features/107-discovery-social-and-public-content-products/F107-12-moderation-queue-for-platform-staff.md)
- Detail: Affects: Operators. Work needed: Prefill takedown from the subject.
- Evidence: ContentReportQueuePanel.tsx:132-142

## GAP-F107-12-03

**No notice to the reporter.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-12](../../20-features/107-discovery-social-and-public-content-products/F107-12-moderation-queue-for-platform-staff.md)
- Detail: Affects: Reporters. Work needed: Product decision.
- Evidence: 0124 migration comment

## GAP-F107-12-04

**Desktop availability of admin screens unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F107-12](../../20-features/107-discovery-social-and-public-content-products/F107-12-moderation-queue-for-platform-staff.md)
- Detail: Affects: Desktop operators. Work needed: Check in the running app.
- Evidence: no desktop code found
