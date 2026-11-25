# Area 107. Discovery, social, and public-content products

23 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S107.01 Personalized discovery feed.
- Should: A signed-in user sees a feed of stories, research or content chosen for their interests.
- Status: web missing, desktop missing, mobile missing

## S107.02 Topic-following controls.
- Should: A user can follow or unfollow topics and the product uses them to pick what it shows.
- Status: web missing, desktop missing, mobile missing

## S107.03 News/research collections.
- Should: The product offers curated news or research collections a user can browse or subscribe to.
- Status: web missing, desktop missing, mobile missing

## S107.04 Curated public pages.
- Should: Signed-out visitors can browse curated public pages of examples and directories built by the product team.
- Status: web done, mobile missing
- Code: apps/web/app/gallery/GalleryClient.tsx:1324; apps/web/app/gallery/GalleryClient.tsx:29; apps/web/app/plugins/page.tsx:42

## S107.05 Public artifact gallery.
- Should: Anyone can browse a public gallery of artifacts that users published, and open one.
- Status: mobile missing

## S107.06 Public generated-app gallery.
- Should: Anyone can browse a public gallery of apps or sites that users generated and published.
- Status: web missing, desktop missing, mobile missing

## S107.07 Public image/video gallery.
- Should: Anyone can browse a public gallery of images and videos users generated.
- Status: web missing, desktop missing, mobile missing

## S107.08 Creator profiles.
- Should: Each creator has a public profile page listing what they published.
- Status: web missing, desktop missing, mobile missing

## S107.09 Follow creator.
- Should: A user can follow a creator and see their new public work.
- Status: web missing, desktop missing, mobile missing

## S107.10 Favorite/save.
- Should: A user can favorite or save a public item (gallery example, shared chat, artifact) to come back to it.
- Status: web missing, desktop missing, mobile missing

## S107.11 Remix/fork.
- Should: From a public shared conversation a viewer copies it into their own account and keeps working on it.
- Status: web done, mobile missing
- Code: apps/web/features/chat/components/share/SharedSessionViewer.tsx:65; apps/web/app/chat/from-share/[token]/page.tsx:127

## S107.12 Prompt reuse.
- Should: From a public example a visitor reuses its prompt: the prompt lands in their composer ready to send.
- Status: web done, mobile missing
- Code: apps/web/app/gallery/GalleryClient.tsx:1119; apps/web/app/gallery/[templateId]/page.tsx:37

## S107.13 Attribution and source lineage.
- Should: Public and third-party content shows who made it and where it came from (publisher, author, source, versions, "copied from").
- Status: web done, desktop done, cli unverified
- Code: apps/web/features/chat/components/share/SharedSessionViewer.tsx:61; apps/web/app/share/[token]/page.tsx:45; apps/web/lib/services/org-shared-session-service.ts:290

## S107.14 Public comments where offered.
- Should: Viewers can post and read public comments on shared content where comments are offered.
- Status: web missing, desktop missing, mobile missing

## S107.15 Content reporting.
- Should: A viewer can report a public page or an AI answer as harmful or infringing, and the report reaches the operators.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3085; apps/web/features/chat/components/messages/MessageBubble.tsx:935; apps/web/app/share/[token]/page.tsx:92; apps/web/app/api/mobile/content-report/route.ts:57; apps/mobile/src/features/chat/components/MessageBubble.tsx:1128; apps/mobile/services/contentReport.ts:140

## S107.16 Block/mute controls.
- Should: A user can block or mute another user or creator so their content no longer appears.
- Status: web missing, desktop missing, mobile missing

## S107.17 Feed-personalization controls.
- Should: A user can tune what a feed recommends (more/less like this, not interested, reset).
- Status: web missing, desktop missing, mobile missing

## S107.18 Sponsored-content labeling where applicable.
- Should: Any sponsored or paid content is clearly labelled as such.
- Status: not applicable anywhere

## S107.19 Organic versus paid ranking separation.
- Should: Organic results are ranked separately from anything paid, and paid placement never changes organic order.
- Status: not applicable anywhere

## S107.20 Publisher participation.
- Should: Third-party publishers can get their plugins or content in front of users: a submission path or a user-added publisher source, with the publisher named.
- Status: web done, desktop done, mobile missing, cli done
- Code: packages/ui/ui/src/directory/PluginDetailView.tsx:743; packages/ui/ui/src/directory/DirectoryPanel.tsx:598; apps/web/app/partners/page.tsx:35; apps/cli/src/cloud/marketplaces.rs:51; apps/cli/src/lib.rs:6073

## S107.21 Licensed-content access.
- Should: Users can access licensed publisher content (news, premium sources) inside answers with the licence respected.
- Status: web missing, desktop missing, mobile missing

## S107.22 Merchant or partner participation.
- Should: Merchants or partners can join a program to list products, services or integrations.
- Status: web missing, desktop missing, mobile missing

## S107.23 Public-content moderation dashboard.
- Should: Platform staff review reported public content in a dashboard, decide on it, and take content down.
- Status: web done, desktop done
- Code: apps/web/app/api/admin/copyright-notices/route.ts:89; apps/web/app/api/admin/copyright-notices/route.ts:90; apps/web/features/admin/components/CopyrightNoticeQueuePanel.tsx:60; apps/web/features/admin/components/CopyrightNoticeQueuePanel.tsx:136; apps/web/features/admin/pages/OperatorDashboardPage.tsx:453
