---
id: "F047-11"
type: "feature"
title: "Collection privacy and remix"
aliases: ["Public versus private media collection (S47.25)", "Remix-permission settings (S47.26)", "Generated-media discovery feed (S47.27)", "Public/Private", "Remix settings", "Discover", "Library Remix action"]
area: "47 Video editing and media continuity"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S47.25", "S47.26", "S47.27"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "table:published_artifacts", "table:media_assets", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-files-artifacts-and-storage", "SYS-sync-and-continuity", "F047-10"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F047-11 Collection privacy and remix

Planned: set a media collection public or private, control whether others may remix it, and browse a public feed. None exists for media. The Library 'Remix' action only reuses your own image as a new prompt, and public links exist only for text artifacts. The public gallery shows curated examples, not people's media.

Area: [47. Video editing and media continuity](README.md). Requirement items: [S47.25](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4725), [S47.26](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4726), [S47.27](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4727).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Planned: a collection of generated media is Public or Private (Private by default), Remix settings decide who may remix, and Discover lists public items owners chose to publish.

**Why it exists.** Briefs S47.25 to S47.27. People may want to show work, and the owner must control reuse. Discovery is 'where offered'.

**Who uses it.** People who generate media and want to share or browse it. Not built, so nobody yet.

**Problems it solves**

- Library media can be shared only as text artifacts; image and video cannot get a public link (apps/web/lib/services/published-artifact-service.ts:61-69).
- No permission model exists for others reusing a person's media.

**Use cases**

- Publish a set of generated clips as a public collection.
- Keep a collection private for a project.
- Allow friends to remix a clip but not strangers.

## 2. User experience

**Where to find it**

- Web, Desktop, Mobile, Chrome extension: no collection Public/Private control, Remix settings or Discover feed for media (brief S47.25-S47.27 missing; CLI and VS Code n/a).
- Different built items: Library 'Remix' menu row for an image (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1833-1841; apps/mobile/src/features/library/index.tsx:626-630), 'Share link' for artifacts (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1795-1850), and the public '/gallery' page (apps/web/app/gallery/page.tsx) titled 'Gallery: artifacts built with AGI'.

**Before you start**

- Planned: signed-in account; plan rules not defined.

**Screens and controls**

- Not built. Planned labels from the brief: Public, Private, Remix settings, Discover [proposed].
- Built, but different meaning: Remix reads the file and prompt into your own composer in image mode (apps/web/features/library/lib/library-chat-handoff.ts:75-100).

**Journey**

1. Planned: open a collection, choose Public or Private.
2. Planned: open Remix settings and choose who may remix.
3. Planned: open Discover to browse public media; if empty, learn how to publish.
4. Today: open the Library, choose Remix on one of your images, edit the prompt and generate a new image for yourself.

**What the person sees and gets**

- Planned: a blocked item is hidden and the owner told (brief).
- Today: Library actions show a toast on failure; Remix on a non-image throws 'Only an image can be remixed.' (apps/web/features/library/lib/library-chat-handoff.ts:76-78).

**Settings**

- None found for media collections. Published text artifacts have audience values public, organization, invited (apps/web/db/neon/0372_published_site_viewers.sql:25).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Library Remix for your own image on web and mobile: stages the file and original prompt in the composer (apps/web/features/library/lib/library-chat-handoff.ts:75-100; apps/mobile/src/features/library/index.tsx:545-560). Shown only for images and, on mobile, only in Cloud app mode and not for videos (apps/mobile/src/features/library/index.tsx:626-630; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1833).
- Share link publishes a text-like Library item as an artifact with a public or organization or invited audience (apps/web/features/library/components/LibraryView.tsx:51-74; apps/web/db/neon/0372_published_site_viewers.sql:21-25).
- Public /gallery page renders the user's artifacts or curated examples (apps/web/app/gallery/page.tsx; apps/web/app/gallery/GalleryClient.tsx).

**Incomplete**

- Publishable kinds are html, react, svg, mermaid, markdown, text, code only, so no image or video collection can be published (apps/web/lib/services/published-artifact-service.ts:61-69).

**Present but disconnected or switched off**

- Mobile hides Remix for videos and outside Cloud mode (apps/mobile/src/features/library/index.tsx:626-630).

**Not available**

- Collection visibility, remix permission, Discover feed and the moderation of public items: not available on web, desktop, mobile, Chrome. No table for media collections found (searched migration file names for collection, remix, feed).

## 4. Required behaviour

**Established requirements**

- User sets a media collection public or private. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.25)
- User controls whether others may remix their media. (source: S47.26 (same brief))
- User browses a feed of other people's generated media where offered. (source: S47.27 (same brief))
- External image sharing is declined; adding videos to projects is declined; a video studio destination is not built (video is kept in the Library). (source: doc: docs/decisions/2026-09-27-founder-decisions.md:132-144)
- Media safety enforces policy, consent and moderation. (source: doc: docs/product/competitive-guidance.md:418)

**Acceptance criteria**

1. A new collection is Private.
2. A remix of another person's media is blocked unless its owner allowed it.
3. Discover shows only items whose owners published them.
4. An empty feed explains how to publish.
5. A blocked item is hidden and its owner is told.
6. Changing Public to Private removes it from Discover and from public links at once.
7. A public item carries its AI-generated provenance.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The founder decision declining external image sharing probably puts S47.25 and S47.27 out of scope; the owner must confirm. unknown.
- Public media needs the same moderation as managed generation before publishing [inferred].

**Proposed improvements** (suggestions, not requirements)

- Extend the published-artifact audience model to media rather than creating a second public-link system.
- Make 'Remix' in the Library read the owner's permission when the source belongs to someone else.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LibraryView (shared) | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Library menu with Remix and Share link |
| component | LibraryView (web host) | `apps/web/features/library/components/LibraryView.tsx` | Host actions: remix, share artifact, media jobs |
| service | library-chat-handoff | `apps/web/features/library/lib/library-chat-handoff.ts` | Stages an image and prompt for a personal remix |
| screen | Mobile Library | `apps/mobile/src/features/library/index.tsx` | Mobile Remix, delete and video playback |
| screen | Gallery page | `apps/web/app/gallery/page.tsx` | Public gallery of artifacts and examples |
| component | GalleryClient | `apps/web/app/gallery/GalleryClient.tsx` | Gallery cards and thumbnails for artifacts |
| service | published-artifact-service | `apps/web/lib/services/published-artifact-service.ts` | Publishes, versions and revokes text artifacts |
| table | published_artifacts | `apps/web/db/neon/0095_published_artifacts.sql` | Public link rows for text artifacts |
| schema | visibility values | `apps/web/db/neon/0372_published_site_viewers.sql` | Allows public, organization, invited |
| table | shared_sessions | `apps/web/db/neon/0186_organization_shared_sessions.sql` | Shared conversations with visibility public or organization |
| table | media_assets | `apps/web/db/neon/0036_media_assets.sql` | Where generated media lives; no visibility column |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Lists the person's own media; no public listing |
| schema | LibraryItemSchema | `packages/contracts/cloud-contracts/src/library.ts` | Library item without visibility or remix fields |
| endpoint | POST /api/mobile/content-report | `apps/web/app/api/mobile/content-report/route.ts` | Report generated media |
| service | AI-generated provenance | `apps/web/lib/compliance/ai-act.ts` | Provenance headers on generated media |
| test | LibraryView shared tests | `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx` | Covers Library actions |
| test | library-chat-handoff test | `apps/web/features/library/lib/__tests__/library-chat-handoff.test.ts` | Covers staging for remix |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens the Library; the client lists their own items. | device and our servers | apps/web/app/api/library/route.ts:76 |
| Choosing Remix on an image fetches its bytes into the composer with its prompt; nothing is sent to others. | device | apps/web/features/library/lib/library-chat-handoff.ts:75-100 |
| Choosing Share link on an artifact uploads it as a published artifact and copies a link. | device and our servers | apps/web/features/library/components/LibraryView.tsx:51-74 |
| Collection visibility, remix permission and feed: no step exists. | our servers | Not built (briefs S47.25-S47.27) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Published artifact link rows (text only) | table published_artifacts (apps/web/db/neon/0095_published_artifacts.sql:47) | Server side; link readable by anyone with the token for public | Revocable (apps/web/db/neon/0395_published_artifact_audience_revocation.sql) |
| Collection privacy, remix permission, feed entries | Not implemented | not applicable | not applicable |

**Models and providers.** None needed for privacy and permissions. A Library remix uses the chosen image model through the normal managed or own-key path [inferred from the staging of image mode, apps/web/features/library/lib/library-chat-handoff.ts:88-96].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for Library and sharing (apps/web/app/api/library/route.ts). The public gallery page itself is open (apps/web/app/gallery/page.tsx). |
| Permissions | Library items are owner-scoped (apps/web/app/api/files/[id]/thumbnail/route.ts:60-64). Remix permission for others: none found in the code. |
| Subscription | No rule for collections or remix: none found in the code. Image and video generation are plan features (packages/contracts/types/src/billing-catalog.ts:356-357). |
| Limits and metering | none found in the code for collections; published artifacts have a quota (apps/web/lib/services/published-artifact-service.ts, quota-admission tests). |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent; a remix needs an image model that accepts a picture [inferred]. |
| Provider restrictions | None found in the code. |
| Local mode | Public sharing needs our servers, so it cannot work in Local mode [inferred]. Library Remix on mobile is hidden outside Cloud app mode (apps/mobile/src/features/library/index.tsx:626). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Remix on a non-image | Throws 'Only an image can be remixed.'; the menu row is shown only for images | apps/web/features/library/lib/library-chat-handoff.ts:76-78; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1833 |
| Remix on mobile with no image model | Alert 'Image generation is unavailable' | apps/mobile/src/features/library/index.tsx:549-552 |
| Share link fails | Error thrown 'This artifact cannot be shared from the library.' | apps/web/features/library/components/LibraryView.tsx:66-67 |
| Empty Discover feed | not handled in the code (no feed) | none |
| Blocked public item | not handled in the code | none |
| Offline, retry, cancel for sharing media | not handled in the code for media | none |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Shared Library actions including Remix row
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Web Library host actions
- `apps/web/features/library/lib/__tests__/library-chat-handoff.test.ts`: Staging an image and prompt for remix
- `apps/mobile/__tests__/LibraryActionMenus.test.tsx`: Mobile Library menus with Remix
- `apps/web/app/gallery/GalleryClient.test.tsx`: Gallery cards
- `apps/web/db/neon/published-artifacts-migration.test.ts`: Published artifact table rules

**Test scenarios**

- **Library Remix is personal**
  1. Open the Library on web
  2. Choose Remix on a generated image
  - Expected: Composer opens in image mode with the file and prompt; no one else is notified
- **Video has no Remix**
  1. Open the Library on mobile and open a video's menu
  - Expected: No Remix row
- **No media Public toggle**
  1. Open any media item or collection on all apps
  - Expected: No Public or Private control
- **Private default (after built)**
  1. Create a collection
  2. Open the page signed out
  - Expected: Not visible
- **Remix blocked (after built)**
  1. Open another person's public item that disallows remix
  2. Choose Remix
  - Expected: Blocked with a reason; owner told
- **Empty Discover (after built)**
  1. Open Discover with no published items
  - Expected: Empty state explains how to publish

**Where to look when it fails**

- Toast or alert text from Library actions ('Remix' failures via runHostAction in packages/ui/unified-chat/src/components/library/LibraryView.tsx:698-703).
- Table published_artifacts visibility column for published text items.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No public or private control for media collections** Affects: All users on web, desktop, mobile, Chrome. Evidence: Brief S47.25 missing; media_assets has no visibility column. Work needed: Collection model, default Private, API and screens
- **No remix permission and no social remix** Affects: All users. Evidence: Brief S47.26 missing; Library Remix is personal only (apps/web/features/library/lib/library-chat-handoff.ts:75). Work needed: Permission model and checks
- **No Discover feed** Affects: All users. Evidence: Brief S47.27 missing; /gallery shows artifacts and curated examples only. Work needed: Feed with moderation, reporting and empty state
- **Publishing of media blocked by kind list** Affects: Anyone sharing images or video. Evidence: apps/web/lib/services/published-artifact-service.ts:61-69. Work needed: Add media serving path and moderation
- **Founder decisions decline external image sharing and edit controls** Affects: Scope. Evidence: doc: docs/decisions/2026-09-27-founder-decisions.md:139-144. Work needed: Owner confirms scope
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- table:published_artifacts
- table:media_assets
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-files-artifacts-and-storage
- SYS-sync-and-continuity
- F047-10

## Unknown

- Whether the owner wants a public media feed given founder decisions declining external image sharing.
- Whether the desktop Library has Remix (not opened beyond the shared view).
- What 'who may remix' means (person, group, anyone).
- Plan rules for collections and Discover.
- Whether the gallery page ever lists other people's media (it lists artifacts and examples).
