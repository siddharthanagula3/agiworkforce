---
id: "F041-05"
type: "feature"
title: "Files and generated images in temporary chats"
aliases: ["Temporary chat files", "Attachments in temporary chat", "Save to Library (generated image)", "media keep", "temporary_chat on media_assets", "purge-temporary-chats cron", "S41.08", "S41.09"]
area: "41 Temporary and private experiences"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "missing", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S41.08", "S41.09"]
depends_on: ["surface:web", "surface:mobile", "surface:chrome", "mode:cloud", "table:media_assets", "table:web_conversations", "api:POST /api/media/keep", "api:GET /api/cron/purge-temporary-chats", "SYS-files-artifacts-and-storage", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-observability-and-operations", "F041-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F041-05 Files and generated images in temporary chats

Files attached to or generated in a temporary chat stay out of the Library and are deleted about 30 days after the file arrives, unless a legal hold applies. A generated image can be kept on purpose with Save to Library on web and mobile.

Area: [41. Temporary and private experiences](README.md). Requirement items: [S41.08](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4108), [S41.09](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4109).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | not stated on this page | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Marks uploads and generated media made in a temporary chat as temporary, hides them from the Library, deletes them after 30 days, and lets the person rescue one image with Save to Library (apps/web/lib/server/temporary-files/retention.ts:15-17; apps/web/app/api/media/keep/route.ts).

**Why it exists.** A temporary chat promises the conversation is not kept; before this, its attachments sat in the Library for the life of the account (doc comment: apps/web/db/neon/0218_temporary_chat_attachments.sql).

**Who uses it.** People who attach documents or make images in a temporary chat.

**Problems it solves**

- Private documents lingering in the Library.
- Losing a generated image just because the chat is temporary.

**Use cases**

- Attach a contract to a temporary chat; it is not in the Library and is deleted later.
- Generate an image in a temporary chat and choose Save to Library to keep it.
- A workspace legal hold keeps a file past 30 days.

## 2. User experience

**Where to find it**

- Web attach row in the + menu: tooltip 'Kept out of your Library and deleted with this temporary chat.' in a temporary chat; otherwise 'Saved to your Library until you delete them. Deleted files can be restored for N days.' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:156-158, 893-901).
- Web generated image: the More menu on the image card has 'Save to Library' only in a temporary chat (apps/web/features/chat/components/ImageGenerationCard.tsx:1114-1127, 1182, 1295, 1322-1337).
- Mobile generated image: long-press menu or image menu item 'Save to Library' in a temporary chat (apps/mobile/src/features/chat/components/GeneratedImage.tsx:133-141, 286).
- Mobile file explanation: Local banner says 'attachments never leave this device'; the Cloud banner says nothing about files (TemporaryChatBanner.tsx:12-15).
- Chrome: attachments upload with temporary true (apps/extension/src/side_panel.ts:10290).

**Before you start**

- Temporary chat.
- For Save to Library: a generated image with a stored file id (/api/files/<uuid>).

**Screens and controls**

- Attach row tooltip (web).
- Save to Library item in the image card menu (web) and the image action sheet (mobile).
- Support page statement (doc: apps/web/content/support/temporary-chats.md).

**Journey**

1. Attach a file or generate an image in a temporary chat.
2. The upload is recorded with temporary_chat true, decided from the conversation row.
3. The Library list excludes it.
4. Optional: choose Save to Library on an image; the flag clears and the image joins the Library.
5. After 30 days the nightly job deletes any file still flagged.

**What the person sees and gets**

- Web success toast: 'Saved to your Library. It stays after this chat is gone.' Failure toast: server message or 'This image could not be saved to your Library.' (ImageGenerationCard.tsx:1328-1335).
- Mobile success toast with the same sentence (keepMedia.ts:9); failure alert title 'Could not save to Library'; unsaveable image: 'This image cannot be saved to your Library.' (keepMedia.ts:10-11; GeneratedImage.tsx:263-271).
- Server 404 'That file is no longer waiting to be kept' if the file is not temporary any more (apps/web/app/api/media/keep/route.ts:36).

**Settings**

- None. Retention is 30 days, a constant (retention.ts:8).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web upload completion decides temporary from the conversation row, not the client (apps/web/lib/server/chat-attachment-completion.ts:92-110; test 'believes the conversation over a client that claims otherwise').
- Library listing excludes temporary_chat rows (apps/web/lib/server/media-assets.ts:326, 429-433).
- Purge route deletes expired rows and bytes in batches, honours legal holds, runs daily at 03:00 (apps/web/app/api/cron/purge-temporary-chats/route.ts; vercel.json:26-27; apps/web/lib/server/temporary-files/purge.ts).
- POST /api/media/keep clears the flag for one owned file (apps/web/app/api/media/keep/route.ts; apps/web/lib/server/media-assets.ts:735-753).
- Generated images and video jobs carry temporary_chat and expire with the chat (apps/web/lib/server/media-assets.ts:252-290; apps/web/lib/server/video-generation-jobs.ts:413-419; purge route image/video job deletes).
- Mobile Save to Library is present and works through the same endpoint (apps/mobile/src/features/image/services/keepMedia.ts:19-25; test GeneratedImageKeep.test.tsx). The brief and first draft call S41.09 missing on mobile: that is out of date.
- Chrome passes temporary true when uploading (side_panel.ts:10290).

**Incomplete**

- Files are purged by their own created_at, not the chat's, so a file added late to an old chat lives 30 days from its own arrival (apps/web/lib/server/temporary-files/purge.ts:61-63; retention.ts:23-25). The first draft said 30 days after the chat was created.
- Web Save to Library exists for images only; no keep control found for generated video or other files in a temporary chat (only caller of the keep endpoint on web is ImageGenerationCard.tsx:48).
- Web retention sentence in the Privacy switch says deleted after 30 days; mobile Cloud banner does not mention files.
- Migration 0218 header still says 'NOT YET APPLIED : draft only' (apps/web/db/neon/0218_temporary_chat_attachments.sql:3); whether it is applied in production is not shown by that file (the memory note says production is at 0425; only a repository note).

**Present but disconnected or switched off**

- none found

**Not available**

- CLI, VS Code: no temporary chat, so no file rule.
- Desktop Tauri: file handling in a temporary chat not traced (unknown).
- Mobile Save to Library for files other than images: none found.

## 4. Required behaviour

**Established requirements**

- The product explains what happens to files attached in a temporary chat and for how long they are kept. (source: Brief S41.08)
- In a temporary chat the user can choose to keep a generated output even though the chat is not saved. (source: Brief S41.09)
- A file in a temporary chat is never listed in the Library and is hard-deleted about 30 days after it arrives, on the same clock as the conversation; saving to the Library is an explicit action; a legal hold keeps it until released. (source: apps/web/lib/server/temporary-files/retention.ts:15-17)
- Saved image message: 'Saved to your Library. It stays after this chat is gone.' (source: apps/mobile/src/features/image/services/keepMedia.ts:9)

**Acceptance criteria**

1. A file attached in a temporary chat is absent from Library and gallery lists.
2. The web attach row tooltip reads the temporary text only in a temporary chat.
3. Save to Library on a generated image makes it appear in the Library and survive the purge.
4. POST /api/media/keep on a non-temporary or foreign file returns 404.
5. A file older than 30 days in a temporary chat is removed by the cron; a file under a legal hold is not.
6. An image without a stored file id shows 'This image cannot be saved to your Library.' on mobile.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Keeping one image does not keep the chat or the other files [inferred from keep route scope: one id].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer Save to Library for generated video and files.
- [proposed] Mention files in the mobile Cloud explainer.
- [proposed] State the per-file clock in the user text.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/media/keep | `apps/web/app/api/media/keep/route.ts` | Clears temporary_chat on one owned file. |
| service | saveTemporaryChatAssetToLibrary | `apps/web/lib/server/media-assets.ts` | The update (735-753); also Library filters and insert rules. |
| schema | ManagedMediaKeepRequestSchema / MANAGED_MEDIA_KEEP_PATH | `packages/contracts/cloud-contracts/src/managed-media.ts` | Request contract and path constant (line 272). |
| job | purge-temporary-chats cron | `apps/web/app/api/cron/purge-temporary-chats/route.ts` | Deletes expired conversations, jobs and attachments. |
| config | cron schedule | `vercel.json` | Daily 03:00 schedule (lines 26-27). |
| service | purgeTemporaryChatFiles | `apps/web/lib/server/temporary-files/purge.ts` | Deletes bytes then rows, row-locked, legal-hold aware. |
| config | retention constants and claim | `apps/web/lib/server/temporary-files/retention.ts` | 30 days, batch size, public claim text. |
| service | chat-attachment-completion | `apps/web/lib/server/chat-attachment-completion.ts` | Decides temporary for an upload from the conversation row. |
| table | media_assets.temporary_chat | `apps/web/db/neon/0218_temporary_chat_attachments.sql` | Flag and partial index. |
| table | image/video generation jobs temporary_chat | `apps/web/db/neon/0339_temporary_chat_media_jobs.sql` | Flags media jobs. |
| component | ImageGenerationCard keep | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Web Save to Library action. |
| component | ComposerPlusMenu attach row | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Attach retention tooltip. |
| service | mobile keepMedia | `apps/mobile/src/features/image/services/keepMedia.ts` | Labels, messages and POST to the keep path. |
| component | GeneratedImage | `apps/mobile/src/features/chat/components/GeneratedImage.tsx` | Shows keep control when inTemporaryChat; alerts on failure. |
| service | mobile uploadContext | `apps/mobile/src/features/chat/upload/uploadContext.ts` | Sends temporary with uploads. |
| service | media-assets video job marking | `apps/web/lib/server/video-generation-jobs.ts` | Marks video jobs temporary from the conversation (413-419). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client uploads a file with conversation id and a temporary hint. | device | apps/mobile/src/features/chat/upload/uploadContext.ts:17-26; packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts:199-212 |
| Server completion reads the conversation and sets temporary_chat from it; a lookup failure refuses the upload. | our servers | apps/web/lib/server/chat-attachment-completion.ts:92-110; test chat-attachment-temporary-chat.test.ts |
| The file is scanned and stored; row inserted with temporary_chat true. | our servers | apps/web/lib/server/media-assets.ts:252-290 |
| Save to Library: client posts the file id; server sets temporary_chat false. | device and our servers | apps/web/app/api/media/keep/route.ts:35; media-assets.ts:735-753 |
| Daily cron: delete conversations older than 30 days (with their settled jobs), settled orphan jobs, then expired temporary files in batches; legal hold rows are skipped. | our servers | purge-temporary-chats/route.ts:42-140 |
| File bytes are deleted from storage before the row; failures keep the row. | our servers | apps/web/lib/server/temporary-files/purge.ts:48-56, route.ts:121-130 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Uploaded file and its row | object storage plus table media_assets | Not listed in the Library | Hard-deleted bytes and row about 30 days after arrival; held by legal hold (retention.ts:15-17) |
| Generated image/video jobs | tables image_generation_jobs, video_generation_jobs | n/a | Deleted with the chat or by the orphan sweep once settled (route.ts:65-110) |
| Kept image | media_assets with temporary_chat false | Appears in the Library | Ordinary Library clock with recovery window |

**Models and providers.** Image and video generation use the managed media providers chosen by the generation route; file bytes may be read by the model provider for the turn [inferred]. The purge and keep paths are provider independent.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; all queries scoped by user and workspace. |
| Permissions | Only the owner can keep a file (keep route uses user scope: media-assets.ts:735-753); cron needs a signed cron request (route.ts:31). |
| Subscription | none found for keep or purge; generation itself is metered by the media routes (not traced). |
| Limits and metering | Retention 30 days; purge batch 500, up to 200 batches, 240 s budget per run (route.ts:21-26). |
| Feature flags | none found in the code |
| Model compatibility | Only models/tools that create images or video produce keepable outputs. |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local banner: 'attachments never leave this device' (TemporaryChatBanner.tsx:14-15). Save to Library needs a Cloud stored image (keepableImageId reads only stored AGI Cloud image ids, test GeneratedImageKeep.test.tsx:70). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| File already kept or not temporary | 404 'That file is no longer waiting to be kept' | apps/web/app/api/media/keep/route.ts:36 |
| Race between Save and purge | Row lock and re-read: a save that lands first survives; a later one finds nothing | apps/web/lib/server/temporary-files/purge.ts:45-48; test temporary-chat-purge.test.ts |
| Storage still holds bytes | Row is kept and logged | purge route.ts:122-126 |
| Backlog beyond run ceiling | Reports remaining and logs a warning | route.ts:136-141 |
| Legal hold | Chats and files survive until released; counted in the log | route.ts:42-54, 146-153 |
| Image without stored id (mobile) | Keep not offered / 'This image cannot be saved to your Library.' | keepMedia.ts:11,19-22 |
| Keep fails | Web error toast; mobile alert 'Could not save to Library' | ImageGenerationCard.tsx:1331-1335; GeneratedImage.tsx:268-271 |
| Upload lookup fails | Upload refused rather than kept as a Library file | test chat-attachment-temporary-chat.test.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/__tests__/temporary-chat-purge.test.ts`: Purge deletes bytes and row, locks rows, keeps saved files, honours storage failure, same window, gallery excludes them.
- `apps/web/app/api/cron/purge-temporary-chats/route.test.ts`: Unsigned refused; files purged on the chat clock; batching; backlog reporting.
- `apps/web/app/api/uploads/__tests__/chat-attachment-temporary-chat.test.ts`: Upload temporary flag decided from the conversation; refusal on lookup failure; no reuse across modes.
- `apps/web/app/api/media/keep/__tests__/route.test.ts`: CSRF, JSON, id, 401, 404, success.
- `apps/web/db/neon/temporary-chat-attachments-migration.test.ts`: Migration 0218 shape.
- `apps/mobile/__tests__/GeneratedImageKeep.test.tsx`: Save to Library only in temporary chats, once, failure message.
- `apps/mobile/__tests__/upload-context.test.ts`: Upload temporary context.

**Test scenarios**

- **Attach in temporary**
  1. Temporary chat on web; attach a PDF; open Library.
  - Expected: File not listed; tooltip said it is kept out of the Library.
- **Save image**
  1. Generate an image in a temporary chat.
  2. More, Save to Library.
  3. End the chat.
  - Expected: Toast 'Saved to your Library. It stays after this chat is gone.'; image in Library.
- **Mobile save**
  1. Mobile Cloud temporary chat; generate image; long-press; Save to Library.
  - Expected: Toast and the item disappears from the menu afterwards.
- **Purge**
  1. Backdate a temporary file's created_at 31 days (test database).
  2. Call the cron with a valid signature.
  - Expected: Row and bytes gone; response lists attachmentsRetired.
- **Legal hold**
  1. Place a hold on the file's workspace; run cron.
  - Expected: File remains; heldAttachments counted.

**Where to look when it fails**

- Cron JSON counters: purged, jobsPurged, attachmentsRetired, heldChats, heldAttachments, remaining.
- Log lines 'Temporary chat purge hit its per-run ceiling' and 'Temporary chat attachments kept their rows because storage still holds the bytes'.
- Tables: media_assets.temporary_chat, web_conversations.is_temporary, image/video generation jobs.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/041-temporary-and-private-experiences.md](../../70-qa/test-plans/web/041-temporary-and-private-experiences.md)
- Desktop: [70-qa/test-plans/desktop/041-temporary-and-private-experiences.md](../../70-qa/test-plans/desktop/041-temporary-and-private-experiences.md)
- Mobile: [70-qa/test-plans/mobile/041-temporary-and-private-experiences.md](../../70-qa/test-plans/mobile/041-temporary-and-private-experiences.md)
- Chrome: [70-qa/test-plans/chrome/041-temporary-and-private-experiences.md](../../70-qa/test-plans/chrome/041-temporary-and-private-experiences.md)

## 10. Gaps and dependencies

- **Brief and draft call mobile Save to Library missing; it exists.** Affects: Mobile. Evidence: apps/mobile/src/features/image/services/keepMedia.ts. Work needed: Update the brief.
- **Draft says 30 days after the chat was created; files use their own created_at.** Affects: Documentation. Evidence: purge.ts:61-63. Work needed: Correct docs and user text if needed.
- **No keep control for generated video or non-image outputs.** Affects: Web, mobile. Evidence: Only ImageGenerationCard and mobile keepMedia call the endpoint. Work needed: Add or decide.
- **Mobile Cloud explainer says nothing about files.** Affects: Mobile. Evidence: TemporaryChatBanner.tsx:12-13. Work needed: Add a files sentence.
- **Migration 0218 header says not applied.** Affects: Operations. Evidence: 0218_temporary_chat_attachments.sql:3. Work needed: Check applied state with the migration tool and fix the stale header.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:chrome
- mode:cloud
- table:media_assets
- table:web_conversations
- api:POST /api/media/keep
- api:GET /api/cron/purge-temporary-chats
- SYS-files-artifacts-and-storage
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-observability-and-operations
- F041-01

## Unknown

- Whether 0218 and 0339 are applied in production (only repository files read).
- Desktop Tauri attachment behaviour in a temporary chat.
- Whether an image from a device-model chat can be kept.
- Where the web user is told the 30-day file clock besides the support page.
- How Chrome-extension uploaded files appear after purge.
