---
id: "F004-09"
type: "feature"
title: "Library, artifacts, images and media jobs"
aliases: ["Library", "Files", "Uploads", "Generated files", "Artifacts gallery (S4.25)", "Images (S4.28)", "Image studio (S4.27)", "Generations", "Media job history (S4.30)", "/chat/library", "agi library"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "partly seen (1 of 6)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S4.23", "S4.25", "S4.26", "S4.27", "S4.28", "S4.30"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:desktop", "api:GET /api/library", "api:GET /api/media/jobs", "table:media_assets", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-09 Library, artifacts, images and media jobs

The Library is one page listing everything the account made or uploaded: images, videos, documents, artifacts, uploads and generated files, with tabs, sort, search, preview, download and recovery of deleted items. A section above lists image and video generation jobs with status. Artifacts open in an editor where edits become new versions.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.23](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s423), [S4.25](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s425), [S4.26](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s426), [S4.27](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s427), [S4.28](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s428), [S4.30](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s430).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (1 of 6) |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lists the account's stored media and files from one API with filters, shows storage and download meters, and lists generation jobs that are queued, running, failed or cancelled with cancel and retry. (apps/web/app/api/library/route.ts:155) (packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:49)

**Why it exists.** So generated and uploaded material is not lost inside chats, matching the library in the leaders' apps. [inferred]

**Who uses it.** Any signed-in person who generates images or videos, uploads files or creates artifacts.

**Problems it solves**

- Finding an image or file made weeks ago.
- Seeing why a generation has not finished.
- Recovering a deleted item within the recovery window.
- Editing an artifact without asking the assistant again.

**Use cases**

- Open Library, choose Images, open a picture and download it.
- See 'Generating 40%' for a video, then Cancel it.
- Retry a failed image with 'Try again'.
- Open an artifact and edit its source; the edit saves as a new version.

## 2. User experience

**Where to find it**

- Web: /chat/library inside the app shell (apps/web/app/chat/library/page.tsx:1).
- /chat/artifacts redirects to /chat/library?surface=artifact (apps/web/app/chat/artifacts/page.tsx:8); /chat/images redirects to /chat/library?tab=images (apps/web/app/chat/images/page.tsx:12).
- Desktop: the public Desktop shows the hosted web app (doc: AGENTS.md section 5); the Tauri build has DesktopLibrary (apps/desktop/src/features/library/DesktopLibrary.tsx).
- Mobile: 'Library' and 'Images' items in the drawer (apps/mobile/src/features/drawer/components/DrawerContent.tsx:111).
- CLI: agi library (apps/cli/src/lib.rs:1006).
- VS Code and Chrome: not found (no api/library reference under apps/extension-vscode/src or apps/extension/src).

**Before you start**

- Signed-in account.
- Items are read for the current workspace scope (user and organization) (apps/web/app/api/library/route.ts:150).

**Screens and controls**

- Tabs: All, Images, Videos, Documents, Artifacts, Uploads, Generated files (packages/ui/unified-chat/src/components/library/LibraryView.tsx:92).
- Sort: Modified, Name, Size, Type (packages/ui/unified-chat/src/components/library/LibraryView.tsx:124); the API also accepts oldest.
- Search text q (up to 200 characters), origin and surface filters.
- Section 'Generations' with status Queued, Generating, Failed, Done, Cancelled; buttons 'Open chat', 'Try again', 'Cancel' (packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:12).
- Preview, download, delete, restore actions via /api/media.
- Artifact panel: source editor, version chip, restore of older versions (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1041).

**Journey**

1. Open Library; the first 24 items load.
2. Pick a tab or type a search; results reload from /api/library.
3. Open an item to preview, or download it.
4. For an artifact, open it in the artifact panel, edit source on the latest version; the edit is stored as a new version.
5. Watch 'Generations' for jobs; cancel or retry when allowed.

**What the person sees and gets**

- Item cards with kind, size, model or Upload/Generated label, thumbnail.
- Storage used and limit, images and documents breakdown, download meter (apps/web/app/api/library/route.ts:200).
- Job errors shown only when failed (apps/web/lib/server/media-job-history.ts:123).
- Load failures 'Your generations could not be loaded.' and 'That did not go through. Try again.' (packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:15).

**Settings**

- Plan storage and download limits (see access).
- Recovery window of 30 days (apps/web/lib/resources/deletion-policies.ts:8).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- GET /api/library with kind, sort, surface, origin, q, limit (default 24, max 100), offset, deleted=true (apps/web/app/api/library/route.ts:155) (packages/contracts/cloud-contracts/src/library.ts:80).
- Items carry erase_after = deleted time plus 30 days for deleted rows (apps/web/app/api/library/route.ts:60).
- Web LibraryView in the shared UI package, wired to fetches in apps/web/features/library/components/LibraryView.tsx.
- Media jobs API and section: image and video jobs, hidden when from temporary chats (apps/web/lib/server/media-job-history.ts:100), polling every 5 seconds while a job is in flight and the tab is visible.
- Artifact save to library via POST /api/library (apps/web/app/api/library/route.ts:234).
- Artifact source editing producing a new version (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:934).
- Mobile library, filters, jobs, image area editor (apps/mobile/src/features/library/index.tsx:678) (apps/mobile/src/features/image/components/ImageAreaEditor.tsx:57).
- CLI agi library lists items and can print a text file or save the original (apps/cli/src/cloud/library.rs:7).

**Incomplete**

- Brief marks every app partial or unverified for these items; nothing in the code records that someone ran them. See verification.
- Media jobs section hides 'done' jobs, since finished items appear as library items (packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:97).
- CLI has no media jobs view; the CLI library item has fewer fields than the API (apps/cli/src/cloud/library.rs:9).

**Present but disconnected or switched off**

- Video generation is off on mobile: FEATURES.videoGen false (apps/mobile/lib/v1FeatureFlags.ts:21); web video is plan-limited (packages/contracts/types/src/billing-catalog.ts:353).

**Not available**

- Dedicated image studio route on web: none; /chat/images only redirects, images are made in chat (apps/web/app/chat/images/page.tsx:3).
- Video studio: not applicable (brief S4.29).
- Artifact editor on mobile, CLI, VS Code and Chrome: not present (brief S4.26).
- Library on VS Code and Chrome: none found.

## 4. Required behaviour

**Established requirements**

- A Library lists everything the account produced or uploaded with filters and open/download actions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S4.23)
- An artifact gallery lists generated artifacts and opens any; an editor edits content directly and saves a new version. (source: S4.25, S4.26 (same brief))
- A dedicated image studio with prompt, options and history; an image collection with open, download and remix. (source: S4.27, S4.28 (same brief))
- A media job history lists image and video jobs with status queued, running, failed, done and links to results. (source: S4.30 (same brief))
- A file or session an agent removes goes to Trash or Recently deleted; permanent removal only on explicit user action naming what is lost. (source: (doc: AGENTS.md section 9))

**Acceptance criteria**

1. Library page loads 24 items and pages further with has_more and next_offset.
2. Each tab filters correctly and search narrows results.
3. /chat/artifacts shows the Library filtered to artifacts; /chat/images shows the Images tab.
4. A job shows its status; an error text appears only when status is failed.
5. A job made in a temporary chat does not appear.
6. A deleted item shows an erase-after date 30 days after deletion and can be restored.
7. Editing an artifact's source on its latest version creates a new version and leaves the old one restorable.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Storage and download meters should match plan limits resolved server-side (apps/web/app/api/library/route.ts:83). [inferred]
- Items from other accounts must never appear; the route scopes by user and organization. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a real image history page or tab description so 'image studio' is explicit, or retire S4.27 for web.
- [proposed] Show finished jobs too, with a link to the result, to match S4.30 wording.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Library page | `apps/web/app/chat/library/page.tsx` | Web route rendering LibraryView. |
| component | LibraryView (web wrapper) | `apps/web/features/library/components/LibraryView.tsx` | Wires fetches for list, delete, restore, jobs, projects. |
| component | LibraryView (shared) | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Tabs, sorts, grid, preview, actions, meters. |
| component | MediaJobsSection | `packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx` | Generations list with polling, cancel, retry. |
| endpoint | GET/POST /api/library | `apps/web/app/api/library/route.ts` | List items with filters; save an artifact. |
| schema | LibraryListQuerySchema | `packages/contracts/cloud-contracts/src/library.ts` | Query shape, page size 24 and max 100. |
| endpoint | /api/media (GET, DELETE, POST) | `apps/web/app/api/media/route.ts` | List, delete and restore media. |
| endpoint | GET /api/media/jobs | `apps/web/app/api/media/jobs/route.ts` | Job history. |
| service | media-job-history | `apps/web/lib/server/media-job-history.ts` | Joins image and video jobs, hides temporary chats, maps statuses. |
| endpoint | image cancel and retry, video cancel | `apps/web/app/api/media/image/retry/route.ts` | Job actions used by the Generations section. |
| service | media-assets | `apps/web/lib/server/media-assets.ts` | listLibraryAssets query. |
| table | media_assets | `apps/web/app/api/library/route.ts` | Stored files and media (storage breakdown query). |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Artifact view, source editor and version history. |
| screen | Redirects | `apps/web/app/chat/artifacts/page.tsx` | Artifacts and images routes redirect into the Library. |
| screen | DesktopLibrary | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Tauri desktop Library calling the cloud API. |
| screen | Mobile Library | `apps/mobile/src/features/library/index.tsx` | Mobile library and jobs. |
| service | libraryClient (mobile) | `apps/mobile/src/features/library/libraryClient.ts` | Calls /api/library, /api/media and /api/media/jobs. |
| component | ImageAreaEditor | `apps/mobile/src/features/image/components/ImageAreaEditor.tsx` | Mobile area edit of an image. |
| command | agi library | `apps/cli/src/cloud/library.rs` | CLI list, print text, save original. |
| config | deletion-policies | `apps/web/lib/resources/deletion-policies.ts` | 30-day recovery window. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client requests /api/library with filters; server validates, rate limits and reads media_assets for the user and workspace, fetching one extra row to compute has_more. | our servers | apps/web/app/api/library/route.ts:150 |
| On the first page the server also reads storage meter, document and image bytes and download usage for the plan. | our servers | apps/web/app/api/library/route.ts:196 |
| Client opens an item through /api/files/<id> and thumbnail path. | our servers | apps/web/app/api/library/route.ts:77 |
| Jobs section calls /api/media/jobs on load, when the tab becomes visible and every 5 seconds while any job is queued or running. | device and our servers | packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:78 |
| Image and video generation themselves run through managed generation providers on the server. | outside service | apps/web/app/api/media/image/lib/image-generation-provider.ts |
| Artifact edit saves content as a new version through the artifact store, then may sync to the cloud. | device and our servers | apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:934 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Library items (files, images, videos, saved artifacts) | table media_assets and file storage behind /api/files | Shared by all apps through /api/library | Soft delete with deleted_at; erase_after 30 days later; permanent delete via /api/media permanent=true |
| Image and video jobs | image and video job tables joined in media-job-history | read by web, desktop and mobile | limit on rows per query; retention unknown |
| Artifact versions | artifact store; table names not read | cloud push exists (apps/mobile/__tests__/artifact-store-cloud-push.test.ts) | unknown |

**Models and providers.** Items record provider, model and prompt for generated media (apps/web/app/api/library/route.ts:84). Image and video generation use the provider and model chosen at generation time; listing uses no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; scoped by user and organization (apps/web/app/api/library/route.ts:150). |
| Permissions | Rate limit bucket chat-conversation; mutations through /api/media; CSRF on saving artifacts (apps/web/app/api/library/route.ts:235). |
| Subscription | Listing is open to any signed-in plan in the code I read. Storage limit and download limit come from the plan (apps/web/app/api/library/route.ts:83). Image generation needs a Pro-level tier and video generation a higher tier in the capability table (packages/contracts/types/src/billing-catalog.ts:353). |
| Limits and metering | Page size 24 (max 100); storage meter, download meter; job list limit in SQL (apps/web/lib/server/media-job-history.ts:110). |
| Feature flags | Mobile videoGen false, imageGen true (apps/mobile/lib/v1FeatureFlags.ts:21). |
| Model compatibility | none found in the code for listing; generation availability depends on the model catalog. |
| Provider restrictions | none found for the Library; generation providers not inspected. |
| Local mode | The Library reads our servers, so it works only signed in with cloud storage. Whether local-only generated images are listed anywhere on mobile or desktop is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | List loads page by page; job section renders nothing until jobs exist. | packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:108 |
| Empty jobs | Section hidden when no job except done ones and no error. | packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:109 |
| Job load error | 'Your generations could not be loaded.' shown in a status line. | packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:15 |
| Job action failure | 'That did not go through. Try again.' | packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:16 |
| Cancel / retry | Buttons appear only when the job is cancellable or retryable. | packages/ui/unified-chat/src/components/library/MediaJobsSection.tsx:160 |
| Waiting retry | A failed job waiting for its next attempt reads as queued. | apps/web/lib/server/media-job-history.ts:114 |
| Deleted items | Returned with erase_after when deleted=true. | apps/web/app/api/library/route.ts:60 |
| Old artifact version | Cannot be edited until restored; PDF, DOCX and image artifacts have no source editor. | apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1041 |
| Invalid query | Validation error with the first issue. | apps/web/app/api/library/route.ts:163 |
| Offline | not handled in the code I read. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/library/__tests__/route.test.ts`: List route.
- `apps/web/app/api/library/__tests__/library-item-open.test.ts`: Opening items.
- `apps/web/app/api/media/jobs/__tests__/route.test.ts`: Jobs route.
- `apps/web/lib/server/media-job-history.test.ts`: Job history query and mapping.
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Web wrapper.
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Shared view.
- `apps/desktop/src/features/library/__tests__/DesktopLibrary.test.tsx`: Tauri desktop library.
- `apps/web/app/chat/images/page.test.tsx`: Images redirect.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.edit.test.tsx`: Artifact editing.
- `apps/web/features/chat/components/artifacts/ArtifactPreview.restore.test.tsx`: Version restore.
- `apps/mobile/__tests__/LibraryFilterChips.test.tsx`: Mobile filters (many other Library*.test.tsx files exist).
- `apps/mobile/__tests__/library-hosted-client.test.ts`: Mobile hosted client.

**Test scenarios**

- **Tabs and paging**
  1. Seed more than 24 items.
  2. Open /chat/library, scroll to load more, switch tabs.
  - Expected: 24 per page, tabs filter by kind.
- **Redirects**
  1. Open /chat/artifacts and /chat/images.
  - Expected: Library with artifact surface filter; Library on Images tab.
- **Failed job**
  1. Create a failing image job.
  - Expected: Row shows Failed, an error line and 'Try again'.
- **Temporary chat**
  1. Generate an image in a temporary chat.
  - Expected: Job is not listed.
- **Recovery date**
  1. Delete an item, list with deleted=true.
  - Expected: erase_after is 30 days after deletion.
- **Edit artifact**
  1. Open an artifact, edit source, save, open version chip.
  - Expected: New version exists; old one restorable.

**Where to look when it fails**

- Log line 'Library storage breakdown could not be read' and 'Library download meter could not be read' (apps/web/app/api/library/route.ts:96).
- Tables media_assets (deleted_at, temporary_chat).
- Route /api/media/jobs response status.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)
- CLI: [70-qa/test-plans/cli/004-signed-in-application-destinations.md](../../70-qa/test-plans/cli/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **No dedicated image studio on web; only redirect to Library.** Affects: Web and desktop. Evidence: apps/web/app/chat/images/page.tsx:3. Work needed: Owner decision: keep chat-first images or build a studio page.
- **Artifact editor exists only on web (and desktop through hosted web).** Affects: Mobile, CLI, VS Code, Chrome. Evidence: brief S4.26; ArtifactPreview.tsx:1041. Work needed: Decide per app.
- **No Library or artifact gallery on VS Code and Chrome.** Affects: VS Code, Chrome. Evidence: no api/library use in those folders. Work needed: Add or mark not applicable.
- **Media jobs not available in CLI, VS Code, Chrome.** Affects: those apps. Evidence: brief S4.30. Work needed: Optional CLI view.
- **Nothing in the repository records a run of these screens; the brief marks all partial or unverified.** Affects: Testers. Evidence: brief statuses. Work needed: Run scenarios and record.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:desktop
- api:GET /api/library
- api:GET /api/media/jobs
- table:media_assets
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design

## Unknown

- Whether artifact version rows live in the same media_assets table.
- Retention of job rows.
- Whether the Tauri DesktopLibrary is shipped in the public Desktop.
- Which tests pass; none were run.
- How local-only generated images appear in the Library.
- What the mobile Library does with Images route duplicates (drawer Images and Library both exist).
