---
id: "F044-09"
type: "feature"
title: "Library: grid and save"
aliases: ["Library: grid and save", "Library", "Image grid", "Save to Library", "Add to project", "Images tab", "media_assets", "Recently deleted"]
area: "44 Image-generation studio"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S44.21", "S44.26", "S44.27", "S44.28"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-memory-projects-and-context", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "F044-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F044-09 Library: grid and save

Every generated image is saved to the person's Library and shown in a grid with an Images tab. Images can be added to a Project from the item menu on Web. Images made in a temporary chat stay out of the Library until saved. Favorites are not offered.

Area: [44. Image-generation studio](README.md). Requirement items: [S44.21](../../10-requirements/capabilities/044-image-generation-studio.md#s4421), [S44.26](../../10-requirements/capabilities/044-image-generation-studio.md#s4426), [S44.27](../../10-requirements/capabilities/044-image-generation-studio.md#s4427), [S44.28](../../10-requirements/capabilities/044-image-generation-studio.md#s4428).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores each delivered image as a media asset row and file, lists them in the Library grid or list with search, sort and filters, and lets the person add an image to a Project's knowledge files.

**Why it exists.** Generated images need a durable home that outlives the chat, and a job counts as completed only if the library holds its images. (apps/web/lib/server/image-generation-jobs.ts:446-449 comment)

**Who uses it.** Everyone who generates images on Web, Desktop (hosted web app), Mobile and CLI; reviewers who browse past work.

**Problems it solves**

- Finding an old image outside its chat.
- Keeping images after a conversation is deleted.
- Reusing an image as project knowledge.

**Use cases**

- Open Library, Images tab, and scroll the grid.
- Delete an image to Recently deleted and restore it within 30 days.
- Add a generated image to a Project from its menu.
- Save an image from a temporary chat to the Library with 'Save to Library'.

## 2. User experience

**Where to find it**

- Web: /chat/library, Library page with tabs All, Images, Videos, Documents, Artifacts, Uploads, Generated files; Grid view and List view buttons. (apps/web/app/chat/library/page.tsx:1-20; packages/ui/unified-chat/src/components/library/LibraryView.tsx:92-100,1043-1062)
- Desktop: the Electron window shows the same hosted Library. (apps/desktop/electron/main.ts:1065-1067)
- Mobile: the 'Library' entry in the navigation drawer (a screen, not a bottom tab). (apps/mobile/src/features/drawer/components/DrawerContent.tsx:111-116)
- CLI: `agi library` lists items as text lines, `agi library download <id>` saves the file. No grid. (apps/cli/src/lib.rs:1005-1020,7336; apps/cli/src/cloud/library.rs:111-149)

**Before you start**

- Signed-in account. A signed-out Library shows nothing. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:513-520)
- Object storage configured on the server; in production generation is refused with 503 'media_storage_unavailable' otherwise. (apps/web/app/api/media/image/lib/managed-image-generation.ts:506-520)

**Screens and controls**

- Item action menu: Download, Add to chat, Add to Work, Open chat, Remix, Add to project, Delete, and in Recently deleted: Restore, Delete permanently. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1770-1870)
- Add to project dialog listing folders. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1895-1930)
- Toolbar 'Recently deleted' toggle, search box 'Search the library by name', sort (Modified, Name, Size, Type). (packages/ui/unified-chat/src/components/library/LibraryView.tsx:124-129,1003-1037)
- Storage line '<used> of <limit> file storage used' and downloads line '<used> of <limit> file downloads used this month'. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:945-962)
- Web image card More actions > 'Save to Library' shown only in a temporary chat. (apps/web/features/chat/components/ImageGenerationCard.tsx:1111-1127)
- Mobile Library: filter chips, 'Library options', item actions Add to chat, Remix, Open chat, Share, Report, Delete. (apps/mobile/src/features/library/index.tsx:620-655)

**Journey**

1. 1. Person generates an image; the server stores the bytes and inserts a media asset row.
2. 2. The card shows /api/files/<id> as the image address.
3. 3. Person opens the Library; the list call returns items with prompt, model and surface.
4. 4. Person filters to Images, opens one, or opens its menu to add it to a Project.
5. 5. Web 'Add to project' downloads the image into a file and uploads it as a project knowledge file, then shows 'Added to <project>'. (apps/web/features/library/components/LibraryView.tsx:234-240)

**What the person sees and gets**

- Success toast 'Added to <folder>'; temporary chat save toast 'Saved to your Library. It stays after this chat is gone.' (apps/web/features/chat/components/ImageGenerationCard.tsx:1222-1226)
- Empty or error states in the Library with a retry. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1075-1090)
- If saving fails: 'The image was generated but could not be saved to your library, so it was not charged. Try again...' (apps/web/app/api/media/image/lib/image-job-executor.ts:789-790)

**Settings**

- Web Library tab, sort, grid or list; none belong to image generation itself.
- Plan limits for storage and monthly downloads are shown, not set, here.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Atomic insert of all images of a job into media_assets with prompt, provider, model, surface and conversation id, then the job binds them in the same transaction as completion. (apps/web/lib/server/media-assets.ts:292; apps/web/app/api/media/image/lib/image-job-executor.ts:496-515; apps/web/lib/server/image-generation-jobs.ts:450-495)
- On any storage or catalog failure all staged objects are deleted and the attempt is retryable and not charged. (apps/web/app/api/media/image/lib/image-job-executor.ts:532-555,785-795)
- Library list route returns prompt, model, provider, origin and thumbnails, plus storage and download meters on page one. (apps/web/app/api/library/route.ts:60-90,148-210)
- Images made in a temporary chat are flagged temporary_chat from the conversation and stay out of the Library; 'Save to Library' calls POST /api/media/keep. (apps/web/lib/server/media-assets.ts:69-95,735; apps/web/app/api/media/keep/route.ts:35)
- Add to project on Web copies the image as project knowledge. (apps/web/features/library/components/LibraryView.tsx:234-240)
- Soft delete to Recently deleted with a 30-day recovery window. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:731-745; apps/web/app/api/library/route.ts:55-60)

**Incomplete**

- When object storage is not configured (non-production), images are returned inline and not saved: assetIds is empty. (apps/web/app/api/media/image/lib/image-job-executor.ts:445-453)
- The Library item has no width, height, quality or size, so the grid cannot show them. (apps/web/app/api/library/route.ts:60-85)
- Whether listLibraryAssets excludes temporary-chat rows was not opened. (apps/web/lib/server/media-assets.ts:396)

**Present but disconnected or switched off**

- Desktop internal Tauri Library has no add-to-project or remix handler. (apps/desktop/src/features/library/DesktopLibrary.tsx:165-212)

**Not available**

- Favorites: no code on any app.
- Add to Project on Mobile and CLI: the mobile action menu has no such row; CLI has no project command for images. (apps/mobile/src/features/library/index.tsx:620-655)
- CLI grid view and Chrome extension Library.

## 4. Required behaviour

**Established requirements**

- Generated images are browsable together in a grid. (source: S44.21)
- Generated images are saved to the user's Library and reappear there later. (source: S44.27)
- User adds a generated image to a Project. (source: S44.28)
- User marks a generated image as a favorite and can find favorites later. (source: S44.26)
- A failed save must not charge the person. (source: doc: docs/product/experience-contract.md row W12 (storage failure settles usage consistently))

**Acceptance criteria**

1. After a successful generation the image appears in Library > Images within one refresh with its prompt as the name.
2. If storage fails, the person sees the 'not charged' message and no image row is left behind.
3. An image generated inside a temporary chat is absent from the Library until 'Save to Library' is pressed.
4. Delete moves an image to Recently deleted; Restore brings it back; Delete permanently asks first and names the consequence.
5. 'Add to project' on Web results in a knowledge file in the chosen Project and a confirmation toast.
6. The Library shows storage and monthly download meters for the plan.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Favorites would need a flag on media_assets and a Library filter. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Add-to-Project on Mobile.
- [proposed] Add a Favorites filter.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Library page | `apps/web/app/chat/library/page.tsx` | Web route that renders the Library view. |
| component | Web LibraryView host | `apps/web/features/library/components/LibraryView.tsx` | Transport: list, delete, remix, add to project, media jobs. |
| component | Shared LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Tabs, grid, list, menus, meters, viewer, Recently deleted. |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Lists items, storage and download meters. |
| service | media-assets | `apps/web/lib/server/media-assets.ts` | insertMediaAssetsAtomically, listLibraryAssets, saveTemporaryChatAssetToLibrary. |
| table | media_assets | `apps/web/db/neon/0036_media_assets.sql` | Row per stored image with prompt, provider, model, conversation id, temporary flag. |
| table | image_generation_job_assets | `apps/web/db/neon/0226_durable_image_generation_jobs.sql` | Binds job candidates to asset ids. |
| service | persistGeneratedImages | `apps/web/app/api/media/image/lib/image-job-executor.ts` | Stores bytes, inserts rows, cleans up on failure. |
| endpoint | POST /api/media/keep | `apps/web/app/api/media/keep/route.ts` | Moves a temporary-chat asset into the Library. |
| endpoint | POST /api/projects/{id}/knowledge-files | `apps/web/app/api/projects/[id]/knowledge-files/route.ts` | Receives the image as a project knowledge file. |
| service | authenticatedMediaUrl | `apps/web/lib/server/media-storage.ts` | Builds /api/files/<id> addresses. |
| screen | Mobile Library | `apps/mobile/src/features/library/index.tsx` | Grid, filters, item actions, Recently deleted. |
| service | libraryClient | `apps/mobile/src/features/library/libraryClient.ts` | Mobile list and media job calls. |
| screen | Desktop internal Library | `apps/desktop/src/features/library/DesktopLibrary.tsx` | Tauri build host of the shared view. |
| command | agi library | `apps/cli/src/lib.rs` | List, show and download Library items from the terminal. |
| service | cloud/library.rs | `apps/cli/src/cloud/library.rs` | CLI list rendering and download. |
| config | MediaJobEntry / Library schemas | `packages/contracts/cloud-contracts/src/library.ts` | Wire shapes for items and jobs. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Executor writes each image's bytes to object storage and inserts all media_assets rows in one transaction. | our servers | apps/web/app/api/media/image/lib/image-job-executor.ts:472-515 |
| Job is completed and linked to the asset ids in one transaction. | our servers | apps/web/lib/server/image-generation-jobs.ts:450-495 |
| Client lists the Library with filters; server returns items and meters. | device and our servers | apps/web/app/api/library/route.ts:148-210; packages/ui/unified-chat/src/components/library/LibraryView.tsx:455-505 |
| Add to project: client fetches the image, uploads it as a knowledge file. | device and our servers | apps/web/features/library/components/LibraryView.tsx:234-240 |
| Failure path: staged objects are deleted, cost recorded as undelivered, attempt closed as retryable. | our servers | apps/web/app/api/media/image/lib/image-job-executor.ts:532-555,782-795 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Image file bytes with embedded AI claim | Private object storage (R2 per the client warning text) | Available to every signed-in device of the account via /api/files/<id>. | Soft delete, 30-day recovery, then erase. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:736-737) |
| media_assets row (prompt, provider, model, surface, conversation, metadata.aiAct) | table media_assets | Via /api/library | Same as above; temporary chat rows are purged with the chat. (apps/web/lib/server/media-assets.ts:58-60 comment) |
| Project knowledge copy | Project knowledge files | With the Project | Independent copy of the image bytes. [inferred from upload of a File] |

**Models and providers.** The row records provider and model so the Library can show where an image came from and treats it as generated content. (apps/web/app/api/library/route.ts:82-83; packages/ui/unified-chat/src/components/library/LibraryView.tsx:242)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in; items are scoped to the user and active workspace. (apps/web/app/api/library/route.ts:148-152) |
| Permissions | Workspace-scoped lookup on file serve. (apps/web/app/api/files/[id]/route.ts:200-215) |
| Subscription | Saving is part of generation, so it follows the image_generation plan gate. Library storage and monthly download limits come from the plan tier. (apps/web/app/api/library/route.ts:91-103,194-196) |
| Limits and metering | Storage meter and monthly download meter on page one of the list. Downloads of the owner's own generated images do not spend the allowance. (apps/web/lib/services/tier-unit-quota-service.ts:472-479) |
| Feature flags | Mobile shows a Library feature promo sheet. (apps/mobile/src/features/library/LibraryFeaturePromoSheet.tsx) [existence only] |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not available for saved generated images: the Library is our servers; mobile Library uses the Cloud account. (apps/mobile/src/features/library/index.tsx:445-452) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | Library shows an empty state; CLI prints 'Your Library is empty.' | apps/cli/src/cloud/library.rs:112-117 |
| Loading and error | Web shows loading and a retry on list failure; Mobile has an error state. | packages/ui/unified-chat/src/components/library/LibraryView.tsx:1085-1100; apps/mobile/__tests__/LibraryAssetsError.test.tsx (title only) |
| Unavailable file | Tile shows 'This file is unavailable right now' after a 404 or 410. | packages/ui/unified-chat/src/components/library/LibraryView.tsx:568-574,1640-1647 |
| Storage not configured | Production: 503; development: inline image not saved and the web hook warns it will not survive reload. | apps/web/app/api/media/image/lib/managed-image-generation.ts:506-520; apps/web/lib/hooks/useMediaGeneration.ts:252-259 |
| Save failure | Retryable, not charged, message to contact support if it repeats. | apps/web/app/api/media/image/lib/image-job-executor.ts:789-795 |
| Temporary chat | Image kept out of Library until 'Save to Library'. | apps/web/lib/server/media-assets.ts:66-72,735 |
| Accessibility | Tiles are buttons with an aria-label; menu has role=menu and Actions for <file> label. | packages/ui/unified-chat/src/components/library/LibraryView.tsx:1452,1776-1780 |
| Chrome | not handled in the code | apps/extension/src searched |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/library/__tests__/route.test.ts`: Library list route (titles not read).
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Shared Library view (titles not read).
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Web Library host (titles not read).
- `apps/desktop/src/features/library/__tests__/DesktopLibrary.test.tsx`: Internal desktop Library host.
- `apps/web/__tests__/api/ai-act-image-provenance.test.ts`: Writes the claim onto the asset row; rolls back staged objects and refunds when persistence fails.
- `apps/web/lib/server/media-assets.image-context.test.ts`: Media asset image context (titles not read).
- `apps/mobile/__tests__/library-generated-images.test.ts`: Mobile generated image listing (titles not read).
- `apps/mobile/__tests__/LibraryActionMenus.test.tsx`: Mobile item menus (titles not read).
- `apps/mobile/__tests__/GeneratedImageKeep.test.tsx`: Keep of a generated image from a temporary chat (title only).
- `apps/web/db/neon/media-assets-conversation-provenance-migration.test.ts`: Migration for conversation provenance on media assets.

**Test scenarios**

- **New image reaches the Library**
  1. Generate an image on Web.
  2. Open Library > Images.
  - Expected: Image appears with its prompt as the name; download meter and storage line are shown.
- **Storage failure**
  1. In a test deployment make the object store reject writes.
  2. Generate an image.
  - Expected: Message says it was not charged; no media_assets row; job is failed and retryable; usage not settled as delivered.
- **Temporary chat**
  1. Open a temporary chat, generate an image.
  2. Open Library.
  3. Return and press More actions > Save to Library.
  - Expected: Absent first, present after, toast 'Saved to your Library...'.
- **Add to project**
  1. Library item menu > Add to project > choose a Project.
  - Expected: Toast 'Added to <name>'; the image shows in the Project's knowledge files.
- **Delete and restore**
  1. Delete an image.
  2. Toggle Recently deleted, Restore.
  - Expected: Image leaves, appears under Recently deleted with 'Kept until <date>', returns on Restore.

**Where to look when it fails**

- Log event generated_image_batch_object_cleanup_failed; 'Generated image persistence failed; the reservation is not settled against this attempt'.
- Tables media_assets, image_generation_job_assets; response code media_storage_unavailable.
- Library item response field erase_after for deleted items.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/044-image-generation-studio.md](../../70-qa/test-plans/web/044-image-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/044-image-generation-studio.md](../../70-qa/test-plans/desktop/044-image-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/044-image-generation-studio.md](../../70-qa/test-plans/mobile/044-image-generation-studio.md)
- CLI: [70-qa/test-plans/cli/044-image-generation-studio.md](../../70-qa/test-plans/cli/044-image-generation-studio.md)

## 10. Gaps and dependencies

- **No favorites.** Affects: All apps. Evidence: No symbol; brief S44.26. Work needed: Flag column, API and filter.
- **No Add to Project on Mobile or CLI.** Affects: Mobile, CLI. Evidence: apps/mobile/src/features/library/index.tsx:620-655. Work needed: Mobile action and a project knowledge upload call.
- **Library items carry no size or quality.** Affects: Web, Mobile. Evidence: apps/web/app/api/library/route.ts:60-85. Work needed: Persist width, height and quality on media_assets.
- **Dev deployments return an unsaved inline image when storage is missing.** Affects: Local development only. Evidence: apps/web/app/api/media/image/lib/image-job-executor.ts:445-453. Work needed: None for production; note for testers.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-memory-projects-and-context
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- F044-07

## Unknown

- Whether listLibraryAssets filters out temporary-chat rows (function not opened beyond its name).
- Contents of the Library tests (titles not read).
- How Desktop Electron handles the Library download (browser download in a hosted page; not traced).
- Whether the Free plan can reach the Library for generated images (depends on free media offer wiring).
