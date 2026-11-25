---
id: "AREA-024"
type: "area"
title: "Library and file-management experience"
features: ["F024-01", "F024-02", "F024-03", "F024-04", "F024-05", "F024-06", "F024-07", "F024-08", "F024-09", "F024-10", "F024-11", "F024-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 24. Library and file-management experience

The Library is where a signed-in person finds every file and artifact they have made or uploaded in one place. They can browse by type or source, search by name, open a file, reuse it in a new chat or a project, and recover files they deleted within 30 days. It matters because generated images, documents and saved artifacts would otherwise be lost in old chats, and because deleted files must be recoverable before they are erased for good.

**Who uses it.** Every signed-in user on web, desktop (which shows the hosted web app, so it runs the same code) and mobile. The web and mobile Library list only files in the active workspace (organization) the user is in, through the server query (apps/web/lib/server/media-assets.ts:403, 444). Signed-out web users see a sign-in page instead (apps/web/features/library/components/LibraryView.tsx:278). Storage and download numbers depend on the user's plan. The CLI reads artifacts through a different index, not the Library. Nothing in the code I read limits Library use to paid plans or to workspace admins, but the storage and download allowances are plan-based. The CLI and the VS Code and Chrome surfaces are not in the Library.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F024-01](F024-01-browse-by-source-all-files-uploads-generated-files.md) | Browse by source: All files, Uploads, Generated files, Artifacts | built | built | built | partly | partly | partly |
| [F024-02](F024-02-browse-by-media-type-images-videos-documents-audio.md) | Browse by media type: Images, Videos, Documents, Audio | partly | partly | partly | no | no | no |
| [F024-03](F024-03-recent-favourite-shared-and-folder-views.md) | Recent, favourite, shared and folder views | partly | partly | no | no | no | no |
| [F024-04](F024-04-search-sort-and-layout.md) | Search, sort and layout | built | built | partly | no | no | no |
| [F024-05](F024-05-filter-by-origin-owner-project-or-date.md) | Filter by origin, owner, project or date | partly | partly | partly | no | no | no |
| [F024-06](F024-06-select-and-act-on-several-files.md) | Select and act on several files | no | no | partly | no | no | no |
| [F024-07](F024-07-rename-duplicate-and-move-a-file.md) | Rename, duplicate and move a file | no | no | no | no | no | no |
| [F024-08](F024-08-use-a-file-in-a-chat-or-a-project.md) | Use a file in a chat or a project | built | built | partly | no | no | no |
| [F024-09](F024-09-recently-deleted-and-restore.md) | Recently deleted and restore | built | built | built | no | no | no |
| [F024-10](F024-10-file-details-version-history-and-the-original-sour.md) | File details, version history and the original source | no | no | no | no | no | no |
| [F024-11](F024-11-storage-use-and-file-status.md) | Storage use and file status | built | built | partly | no | no | no |
| [F024-12](F024-12-connected-storage-and-external-files.md) | Connected storage and external files | no | no | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/024-library-and-file-management-experience.md](../../10-requirements/capabilities/024-library-and-file-management-experience.md).

## How this area works in the code

1. **1. Screen and host wiring (web).** The web page builds a transport object that calls the Library API, the media delete/restore API, the project APIs and the chat staging helpers. Signed-out users get a sign-in page. Desktop shows the same web app. (`apps/web/features/library/components/LibraryView.tsx:133-290`, `apps/web/features/library/components/LibraryView.tsx:278`)
2. **2. Shared view state.** The shared Library component (used by web) holds the active tab, sort, layout (grid/list), search text, the page of items, folders and the deleted toggle. The grid or list layout is saved in the browser. (`packages/ui/unified-chat/src/components/library/LibraryView.tsx:92-132`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx:131-147`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx:393-424`)
3. **3. Request a page.** The view builds query parameters (sort, surface, kind, origin, q, deleted, limit, offset) and fetches /api/library. The first page also reads storage and download numbers. (`packages/ui/unified-chat/src/components/library/LibraryView.tsx:447-504`, `packages/ui/unified-chat/src/components/library/LibraryView.tsx:450-463`)
4. **4. API route validates and assembles the response.** The route applies the rate limit, scopes the database to the user and organization, validates the query, asks for limit plus one row to know if there is another page, and adds storage, breakdown and download meters on the first page. (`apps/web/app/api/library/route.ts:148-212`, `apps/web/app/api/library/route.ts:170-183`, `packages/contracts/cloud-contracts/src/library.ts:101-116`)
5. **5. Database query.** listLibraryAssets reads public.media_assets for the user and active organization, excludes temporary-chat files, and applies kind, surface, origin, search, sort and the deleted window (30 days). (`apps/web/lib/server/media-assets.ts:396-451`, `apps/web/lib/server/media-assets.ts:366-372`, `apps/web/lib/server/media-assets.ts:429-436`)
6. **6. Shape each row for the screen.** Each row becomes a LibraryItem with file name, uri (/api/files/{id}), thumbnail, surface, previewable flag, origin, provider, model, prompt, conversation id and erase_after for deleted rows. (`apps/web/app/api/library/route.ts:44-89`)
7. **7. Delete, restore and permanent delete.** The web host asks first (confirm dialog), then calls /api/media with a CSRF token. Soft delete and restore touch only deleted_at. Permanent delete removes stored bytes and derived records, unless a legal hold applies. (`packages/ui/unified-chat/src/components/library/LibraryView.tsx:726-756`, `apps/web/features/library/components/LibraryView.tsx:182-205`, `apps/web/app/api/media/route.ts:45-84`, `apps/web/lib/server/media-assets.ts:693-805`)
8. **8. Save an artifact into the Library.** POST /api/library validates the file name and content (up to 1,000,000 characters), checks CSRF, then stores the bytes as a generated file with origin saved_artifact. (`apps/web/app/api/library/route.ts:214-274`, `apps/web/lib/server/generated-file-persist.ts:186`)
9. **9. Add a file to a project.** The web host reads the file's bytes and uploads them to the project's knowledge files, so the project keeps its own copy. (`apps/web/features/library/components/LibraryView.tsx:234-240`, `apps/web/app/api/projects/[id]/knowledge-files/route.ts:77-96`)
10. **10. Mobile path.** The mobile screen keeps its own state (sort, search, filter, selection, deleted toggle), merges device and cloud artifacts for the Artifacts chip, and calls the same /api/library and /api/media endpoints through its own client. (`apps/mobile/src/features/library/index.tsx:183-220`, `apps/mobile/src/features/library/index.tsx:320-363`, `apps/mobile/src/features/library/libraryClient.ts:90-150`, `apps/mobile/src/features/library/libraryClient.ts:152-174`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | The shared Library screen for web and desktop: tabs, search, sort, grid/list, viewer, row actions and confirm dialogs. |
| `apps/web/features/library/components/LibraryView.tsx` | The web host. It connects the shared screen to real API calls, chat staging, project upload and artifact sharing. |
| `apps/web/app/api/library/route.ts` | GET list of Library items with paging and meters; POST saves an artifact into the Library. |
| `apps/web/lib/server/media-assets.ts` | Database access for public.media_assets: list query, soft delete, restore, permanent delete, and the 30-day window. |
| `apps/web/app/api/media/route.ts` | DELETE (soft or permanent), and POST (restore) for one Library file, with CSRF and rate limits. |
| `packages/contracts/cloud-contracts/src/library.ts` | Shared schema for list query, sort values, page sizes and the item shape used by every app. |
| `apps/mobile/src/features/library/index.tsx` | The mobile Library screen: filters, search, sort, selection, deleted view, storage line, and the Artifacts merge. |
| `apps/mobile/src/features/library/libraryClient.ts` | Mobile client for /api/library and /api/media; maps items to mobile rows. |
| `apps/web/lib/server/generated-file-persist.ts` | Stores generated or saved bytes as Library files and classifies them as artifact or file (classifyGeneratedFile at line 186). |
| `apps/web/lib/server/file-storage.ts` | Reads the workspace's file storage usage and its plan allowance for the storage meter. |
| `apps/cli/src/cloud/artifacts.rs` | CLI artifact client: the account-wide artifact index route (ARTIFACT_INDEX_PATH at line 25) and publish/show routes. It does not read the Library list. |

## What is stored

- Every library file row: id, kind, mime type, byte size, prompt, provider, model, source surface, metadata JSON (filename, origin, surface, previewable), conversation id, temporary-chat flag, created, updated and deleted timestamps, and storage path.: Postgres table public.media_assets (apps/web/lib/server/media-assets.ts:76-78, 440-442, 471-473).
- The stored file bytes. Removed on permanent delete (media-assets.ts:777-779).: Object storage through deleteStoredMedia and storage_pathname; the storage backend itself was not opened.
- Project knowledge copies made by Add to project.: Project knowledge table, read in apps/web/app/api/projects/[id]/knowledge-files/route.ts:40-45.
- Grid or list layout choice.: Browser localStorage key agi-library-view-mode (packages/ui/unified-chat/src/components/library/LibraryView.tsx:131).
- Device-stored artifacts merged into the mobile Artifacts view.: Mobile local artifact store (input storedArtifacts in apps/mobile/src/features/library/index.tsx:320-326); the store itself was not opened.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Plan storage allowance (file storage limit)**: Sets the storage limit shown on the storage line; no limit means only usage is shown. (apps/web/lib/server/file-storage.ts:77-95 (resolveFileStorageAllowance), read by apps/web/app/api/library/route.ts:192-193.)
- **Monthly download allowance**: Sets the download meter; null limit means no meter. Large uploads that would exceed it are declined in the browser. (apps/web/app/api/library/route.ts:91-105 (plan tier and readDownloadUsage); packages/ui/unified-chat/src/components/library/LibraryView.tsx:559-568.)
- **Decline large files in chat upload**: Upload from Library declines large files instead of attaching them inline. (apps/web/features/library/components/LibraryView.tsx:180.)
- **Recovery window (30 days)**: How long deleted files stay restorable and the time shown as 'Kept until'. (apps/web/lib/resources/deletion-policies.ts:8 (RESOURCE_RECOVERY_WINDOW_DAYS), used at apps/web/app/api/library/route.ts:60-63; the restore and deleted queries also hard-code 30 days (apps/web/lib/server/media-assets.ts:432, 723).)
- **Page size and max page size**: Items per page (24 default, 100 max) for the list. (packages/contracts/cloud-contracts/src/library.ts:84-85.)
- **Default sort**: Modified (updated_at, newest first) unless the user picks another sort. (packages/contracts/cloud-contracts/src/library.ts:89.)
- **Rate limit**: Library list, save and file delete/restore share the chat-conversation limit. (apps/web/app/api/library/route.ts:149, 238; apps/web/app/api/media/route.ts:31, 49, 72.)
- **Mobile image generation feature flag**: Enables the image edit action in the Library preview. (apps/mobile/src/features/library/index.tsx:1122 (FEATURES.imageGen from apps/mobile/lib/v1FeatureFlags).)
- **Mobile app mode (cloud or local)**: Delete from the preview and image edit are shown only in cloud mode; artifacts shown are only for the current mode. (apps/mobile/src/features/library/index.tsx:322, 1122-1123.)
- **URL parameters on web**: Preselect surface (surface=), tab (tab=), item (item=) or search text (q=). (apps/web/features/library/components/LibraryView.tsx:137-141.)

## Shared between apps

Shared between web and desktop: the screen in packages/ui/unified-chat/src/components/library/LibraryView.tsx (desktop shows the hosted web app, so the code is the same; desktop-specific code was not opened). Shared across apps: the schema and sort values in packages/contracts/cloud-contracts/src/library.ts, and the server routes /api/library and /api/media that web and mobile both call. Separate per app: the web host (apps/web/features/library/components/LibraryView.tsx), the mobile screen and client (apps/mobile/src/features/library/index.tsx, libraryClient.ts; mobile has its own filters, selection and sort labels), and the CLI artifact code (apps/cli/src/cloud/artifacts.rs), which reads /api/artifacts/index, not the Library list. VS Code and Chrome code for this area was not found in the paths I read.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Mobile has multi-select and batch delete, but the brief marks S24.20 and S24.23 missing on mobile. (apps/mobile/src/features/library/index.tsx:202, 239-255, 692-725, 1093.)
- The brief marks S24.15 (source-provider filter) done on web, but the only origin tabs are Uploads and Generated. No connector or provider filter exists. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:98-99, 114-115.)
- Expired-resource display (S24.35) is marked done, but the only signal is an 'unavailable' message after a 404 or 410 response. The server sends no expiry state, and erase_after is sent only for deleted rows. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:575-609, 765, 1513-1515; apps/web/app/api/library/route.ts:86-87.)
- Restore window is written twice: the constant (30 days) drives the displayed 'Kept until' date, while the SQL hard-codes '30 days' for both the deleted list and restore. Changing the constant would make display and behaviour disagree. (apps/web/app/api/library/route.ts:60-63; apps/web/lib/server/media-assets.ts:432, 723; apps/web/lib/resources/deletion-policies.ts:8.)
- Search matches the prompt text as well as the file name, but the brief says search is by name. (apps/web/lib/server/media-assets.ts:422-426.)
- The server supports the 'oldest' sort, but the web sort menu does not offer it (mobile does). (packages/contracts/cloud-contracts/src/library.ts:87; packages/ui/unified-chat/src/components/library/LibraryView.tsx:124-129; apps/mobile/src/features/library/index.tsx:85-91.)
- Add to project copies the file into project knowledge; it does not move it. The brief lists S24.26 'move to folder' as missing, so the Add to project action should not be read as a move. (apps/web/features/library/components/LibraryView.tsx:234-240.)
- Brief pointer for S24.27 (knowledge-files route.ts:227) is past the end of the file, which has 113 lines. The create handler starts near line 77. (apps/web/app/api/projects/[id]/knowledge-files/route.ts:77-113.)
- Brief pointers for the CLI artifacts (apps/cli/src/lib.rs:1899) point at approval-rule code, not artifacts. The artifact command is at lib.rs:1083 and 1359, and its list action at lib.rs:3851-3876. (apps/cli/src/lib.rs:1083, 1359, 1890-1899, 3851-3876.)
- Recent files (S24.08) is marked done, but it is only the default sort by updated time, not a view of files recently used. (packages/contracts/cloud-contracts/src/library.ts:89; apps/web/lib/server/media-assets.ts:367.)

## Not established

- I did not run any code, tests, builds or servers, because this was a read-only reading task. The relayed request about testing on localhost, one surface at a time, did not apply to a read-only write-up, so nothing was tested.
- Desktop-specific code for the Library (the brief marks desktop done) was not opened; the desktop shows the hosted web app, which I took from AGENTS.md section 5.
- VS Code and Chrome Library code: I searched only the Library paths the brief names, and found none for those apps. The brief marks CLI artifacts and VS Code artifacts done and Chrome artifacts unverified; I did not confirm the VS Code or Chrome code.
- Storage backend and the delete of stored bytes (deleteStoredMedia) were not opened.
- persistGeneratedFileBytes (the save path for artifacts and generated files) was only partly read, through classifyGeneratedFile at apps/web/lib/server/generated-file-persist.ts:186.
- The file viewer and file serving (/api/files/{id}), the image preview, and the text preview were not opened.
- The brief's pointers for Recent files (ChatComposerNew.tsx:5312, ComposerFilesMenu.tsx:80) were not opened, so I cannot confirm what the composer's recent-files menu does.
- Mobile local artifact store and the mergeMobileArtifactsForGallery function were not opened.
- Plan rules behind resolveFileStorageAllowance, resolveEntitledPlanTier and readDownloadUsage were not opened, so the actual limits per plan are unknown.
- Whether processing status (S24.36) exists in the web or desktop shared viewer was not confirmed; no status field was found in the list item.
- I did not search every file for rename, duplicate, favourites and shared-with-me beyond the Library paths, so a missing item may exist elsewhere in the web app.
