---
id: "F044-11"
type: "feature"
title: "Save, download, copy and share"
aliases: ["Save, download, copy and share", "Download", "Copy image", "Share image", "Save image to Photos", "Copy link", "agi library download"]
area: "44 Image-generation studio"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S44.29", "S44.30", "S44.31"]
depends_on: ["F044-09", "F044-12", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F044-11 Save, download, copy and share

Get an image out of the app. Web can download the file, copy the picture and copy a link. Mobile can save to Photos, copy the picture and open the system share sheet. The CLI writes the file to disk and can download Library items. Web and Desktop have no file share sheet.

Area: [44. Image-generation studio](README.md). Requirement items: [S44.29](../../10-requirements/capabilities/044-image-generation-studio.md#s4429), [S44.30](../../10-requirements/capabilities/044-image-generation-studio.md#s4430), [S44.31](../../10-requirements/capabilities/044-image-generation-studio.md#s4431).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Moves a generated image out of AGI Workforce as a file, as clipboard picture data, or as a share to another app.

**Why it exists.** People use generated images in documents, chats and social posts. The area brief lists download, copy and share as separate items. (doc: area brief 044, S44.29, S44.30, S44.31)

**Who uses it.** Anyone who wants to use a generated image elsewhere.

**Problems it solves**

- Images locked in a chat.
- Having to screenshot an image.
- Sharing a link that only works for the owner.

**Use cases**

- On Web press Copy and paste the picture into a document.
- On Mobile tap Share image and send it in a messaging app.
- In the CLI the image is already a file on disk after `agi image`.
- Download an original from the Web Library menu.

## 2. User experience

**Where to find it**

- Web card: 'Copy image' button under the picture; More actions menu with 'Download', 'Share', 'Save to Library' (temporary chats). (apps/web/features/chat/components/ImageGenerationCard.tsx:1054-1127)
- Web revise panel: 'Share' and a 'Download' icon button. (apps/web/features/chat/components/ImageGenerationCard.tsx:675-695)
- Web Share dialog: 'Copy link' and 'Download'. (apps/web/features/chat/components/ImageGenerationCard.tsx:254-360)
- Web Library: item menu 'Download'; viewer 'Download <file>'. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1790-1800,1260-1272)
- Mobile viewer header: 'Save image to Photos', 'Share image', 'Copy image'. (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:663-691)
- Mobile Library item menu: 'Share'. (apps/mobile/src/features/library/index.tsx:644)
- CLI: the file path printed by `agi image`; `agi library download <id>`. (apps/cli/src/lib.rs:3520-3523,7336-7345)

**Before you start**

- The image must be a saved Cloud image for Mobile save, share and copy; otherwise 'Only saved AGI Cloud images can be shared.' (apps/mobile/services/fileCreation.ts:650-652)
- Mobile Save needs Photos permission. (apps/mobile/services/fileCreation.ts:692-694)
- Web Copy needs the browser clipboard image API. (apps/web/features/chat/components/ImageGenerationCard.tsx:146-148)

**Screens and controls**

- Web Copy button shows 'Copied' for 2 seconds or 'Copy failed' for 4 seconds. (apps/web/features/chat/components/ImageGenerationCard.tsx:936-945,1056-1068)
- Web Share dialog explains the link is an authenticated address that only opens for someone signed into the workspace. (apps/web/features/chat/components/ImageGenerationCard.tsx:262-273 comment)
- Mobile viewer controls swap to a check mark after Save or Copy and clear after a timer. (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:316-324,663-690)
- CLI summary names where files were saved. (apps/cli/src/cloud/image.rs:1232-1330)

**Journey**

1. 1. Person opens the image card or the viewer.
2. 2. Chooses Download, Copy, Share or Save to Photos.
3. 3. The app fetches the full file from /api/files/<id> with the session.
4. 4. Web builds a file download or writes a PNG to the clipboard; Mobile writes the file to cache then saves, shares or copies.
5. 5. A confirmation or a failure message appears.

**What the person sees and gets**

- Web failure toast 'That image could not be downloaded. Try again.' (apps/web/features/chat/components/ImageGenerationCard.tsx:121)
- Mobile failure titles 'Could not save image', 'Could not share image', 'Could not copy image'. (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:93-97)
- Mobile permission alert for Photos. (apps/mobile/src/features/image/photosAccess.ts)
- CLI file name is made from the prompt, never overwrites an existing file unless a name is given. (apps/cli/src/cloud/image.rs:587-660)

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web download fetches the bytes and saves them with an extension from the content type; falls back to a plain link. (apps/web/features/chat/components/ImageGenerationCard.tsx:94-123)
- Server file route serves full bytes with the AI-generated headers when the asset has a claim. (apps/web/app/api/files/[id]/route.ts:248-251,330-345)
- Download of the owner's own generated media with an AI claim does not spend the monthly download allowance. (apps/web/lib/services/tier-unit-quota-service.ts:472-479; apps/web/app/api/files/[id]/route.ts:246,328)
- Web Copy writes a PNG to the clipboard, re-encoding other formats through a canvas. (apps/web/features/chat/components/ImageGenerationCard.tsx:125-148)
- Mobile Save to Photos, Share and Copy use the saved Cloud image bytes, check the type, and ignore a result if the viewer changed. (apps/mobile/services/fileCreation.ts:643-730)
- CLI saves each image as a file and reports the path. (apps/cli/src/cloud/image.rs:1232-1330)

**Incomplete**

- Web Copy re-encodes non-PNG images to PNG in a canvas, which most likely drops the embedded AI claim from the copied picture. [inferred]
- Web 'Share' is a link dialog, not an app share sheet; the link works only for signed-in members. (apps/web/features/chat/components/ImageGenerationCard.tsx:262-273)
- Large files above the inline serve cap answer 413 on Web download. (apps/web/app/api/files/[id]/route.ts:225-239)
- CLI has no copy-to-clipboard.

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Web and Desktop system share sheet for the image file.
- CLI copy image and CLI share.
- Chrome extension: none found.

## 4. Required behaviour

**Established requirements**

- User downloads the generated image at full quality. (source: S44.29)
- User copies the image itself to the clipboard. (source: S44.30)
- User shares a generated image with someone else (link or file to another app); only Mobile is marked done. (source: S44.31)
- The served file carries provenance headers. (source: S44.36 (brief code reference apps/web/app/api/files/[id]/route.ts))

**Acceptance criteria**

1. Web Download saves a file whose bytes equal the stored bytes and which still contains the embedded AI claim.
2. Web Copy followed by a paste into an image editor yields the picture; failure shows 'Copy failed'.
3. Mobile Save to Photos asks for permission once and then adds the image to Photos.
4. Mobile Share opens the system share sheet with a file named after the image.
5. Downloading your own generated image does not reduce the monthly download meter.
6. A signed-out request to /api/files/<id> is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A copied picture should keep its AI label where the target app supports it. [inferred from the product's AI-label stance]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Copy the original bytes as the clipboard item when the browser accepts the stored type.
- [proposed] Use the Web Share API for files where available.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | downloadImage / copyImage / ShareModal | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Web download, copy and link share. |
| endpoint | GET /api/files/{id} | `apps/web/app/api/files/[id]/route.ts` | Authenticated full-byte serve with provenance headers and allowance check. |
| service | downloadSpendsAllowance / assertDownloadAllowance | `apps/web/lib/services/tier-unit-quota-service.ts` | Decides whether a download uses the plan allowance. |
| service | authenticatedMediaUrl | `apps/web/lib/server/media-storage.ts` | Builds the file address. |
| component | Library Download action | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Fetches and saves a Library file; blocks files larger than the downloads left. |
| component | ImageFullScreen actions | `apps/mobile/src/features/chat/components/ImageFullScreen.tsx` | Save, Share, Copy buttons. |
| service | viewerImageActions | `apps/mobile/src/features/image/services/viewerImageActions.ts` | Decides which actions an image supports and runs them. |
| service | shareGeneratedImage / saveGeneratedImageToPhotos / copyGeneratedImage | `apps/mobile/services/fileCreation.ts` | Fetches bytes, writes cache file, calls share, media library or clipboard. |
| service | photosAccess | `apps/mobile/src/features/image/photosAccess.ts` | Photos permission checks and alert. |
| screen | Mobile Library share | `apps/mobile/src/features/library/index.tsx` | handleShareAsset downloads the file then opens the share sheet. |
| service | save_images / output_path | `apps/cli/src/cloud/image.rs` | Writes generated image files to disk. |
| command | agi library download | `apps/cli/src/lib.rs` | Saves an original from the Library. |
| service | library download | `apps/cli/src/cloud/library.rs` | CLI download call. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client requests /api/files/<id> with the signed-in session. | device | apps/web/features/chat/components/ImageGenerationCard.tsx:108-118; apps/mobile/services/fileCreation.ts:408-425 |
| Server finds the owner's asset, reads the bytes from storage, checks the download allowance unless exempt, records egress and returns the bytes with provenance headers. | our servers | apps/web/app/api/files/[id]/route.ts:196-345 |
| Web writes a Blob URL download, or draws a PNG for the clipboard. | device | apps/web/features/chat/components/ImageGenerationCard.tsx:108-148 |
| Mobile writes a cache file and calls the share sheet, Photos library or clipboard. | device | apps/mobile/services/fileCreation.ts:661-705,729 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Temporary cache copy of the image (Mobile) | app cache folder viewer-images | No | Cache; no explicit cleanup read. (apps/mobile/src/features/image/services/viewerImageActions.ts:40) |
| Download egress record | Usage egress counters | Yes, server side | Marked exempt from the allowance for owner-generated media. (apps/web/app/api/files/[id]/route.ts:328-340) |
| Saved file (CLI, Web download) | The person's disk | No | Owned by the person. |

**Models and providers.** Models and providers play no part after generation. The bytes were already marked at generation. (apps/web/app/api/media/image/lib/image-job-executor.ts:392-410)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for the file route. (apps/web/app/api/files/[id]/route.ts:196-205) |
| Permissions | Only the workspace owner of the asset can fetch it; Photos permission on Mobile. |
| Subscription | A plan monthly download allowance (and a daily one on Free) applies to downloads that spend it; owner-generated media with a matching AI claim is exempt. (apps/web/lib/services/tier-unit-quota-service.ts:472-505) |
| Limits and metering | Library shows '<used> of <limit> file downloads used this month'. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:955-962) |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Not applicable to generated images; they come from Cloud. Mobile refuses to save, share or copy anything that is not a saved Cloud path. (apps/mobile/services/fileCreation.ts:650-652,690,720-722) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Clipboard denied | Web shows 'Copy failed' for 4 seconds. | apps/web/features/chat/components/ImageGenerationCard.tsx:1056-1068 |
| Download failure | Toast and no file. | apps/web/features/chat/components/ImageGenerationCard.tsx:119-122 |
| Photos permission denied | PhotosPermissionError and an alert explaining how to allow it. | apps/mobile/services/fileCreation.ts:692-694; apps/mobile/src/features/image/photosAccess.ts |
| Unsupported format or vector image | Share and Copy are not offered for SVG; others say the format is not supported. | apps/mobile/src/features/image/services/viewerImageActions.ts:47-52; apps/mobile/services/fileCreation.ts:655-658 |
| Too large | 413 'File exceeds the inline serving limit'. | apps/web/app/api/files/[id]/route.ts:116-121 |
| Download allowance used up | Library blocks a large file with 'This file is larger than the file downloads left this month.' | packages/ui/unified-chat/src/components/library/LibraryView.tsx:312,562-567 |
| Viewer changed mid-action | Mobile ignores a stale result. | apps/mobile/services/fileCreation.ts:648,654,665; apps/mobile/__tests__/ImageFullscreenAuthShare.test.tsx test 'suppresses a rejected old action after replacing the image' |
| Offline | not handled in the code beyond a failure message | apps/mobile/src/features/chat/components/ImageFullScreen.tsx:93-97 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/ImageFullscreenAuthShare.test.tsx`: Share by materialising the durable path, stale action handling, feedback timers.
- `apps/web/lib/services/__tests__/download-allowance.test.ts`: Download allowance checks.
- `apps/web/lib/services/tier-unit-quota-service.test.ts`: assertDownloadAllowance behaviour.
- `apps/web/app/api/files/[id]/__tests__/route.test.ts`: File route (titles not read).
- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Card behaviour; no title about download or copy seen.
- `apps/cli/src/cloud/image.rs`: Rust tests for output paths and saving: single image lands in working directory, numbering, explicit out file, extension from bytes.

**Test scenarios**

- **Web download**
  1. Open a generated image on Web.
  2. More actions > Download.
  - Expected: File saved with the right extension; check the bytes contain the AI claim metadata.
- **Web copy**
  1. Press Copy, paste into an image editor.
  - Expected: Picture pastes; test with a non-PNG image and note whether the claim survives.
- **Mobile share**
  1. Open image full screen, tap Share image.
  - Expected: System share sheet opens with an image file.
- **Mobile save without permission**
  1. Deny Photos, tap Save image to Photos.
  - Expected: Alert explaining how to allow access; no crash.
- **Allowance exemption**
  1. Note the Library downloads meter.
  2. Download your own generated image.
  - Expected: Meter does not move.
- **CLI file**
  1. agi image 'a red bicycle' --out ./pics/
  2. agi library download <id> --out ./pics
  - Expected: Files saved without overwriting; paths printed.

**Where to look when it fails**

- Response codes PAYLOAD_TOO_LARGE, File bytes are not available; header carrying the AI claim.
- Mobile FileDownloadError messages 'You must be signed in', 'This file no longer exists'.
- Egress counters tagged downloadAllowanceExempt.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/044-image-generation-studio.md](../../70-qa/test-plans/web/044-image-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/044-image-generation-studio.md](../../70-qa/test-plans/desktop/044-image-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/044-image-generation-studio.md](../../70-qa/test-plans/mobile/044-image-generation-studio.md)
- CLI: [70-qa/test-plans/cli/044-image-generation-studio.md](../../70-qa/test-plans/cli/044-image-generation-studio.md)

## 10. Gaps and dependencies

- **Web and Desktop have no system share of the image file.** Affects: Web, Desktop, CLI. Evidence: apps/web/features/chat/components/ImageGenerationCard.tsx:254-360. Work needed: Use the Web Share API for files; CLI could print a share path or hand to an OS share.
- **Web Copy likely loses the embedded AI claim for non-PNG images.** Affects: Web, Desktop. Evidence: apps/web/features/chat/components/ImageGenerationCard.tsx:125-148. Work needed: Test, then copy original bytes when the browser accepts the type.
- **CLI cannot copy to the clipboard.** Affects: CLI. Evidence: no clipboard code in apps/cli/src/cloud/image.rs. Work needed: Optional; low priority.
- **Brief says Share is Mobile only, but Web has a Share dialog that only copies a workspace link.** Affects: Documentation, Web users. Evidence: apps/web/features/chat/components/ImageGenerationCard.tsx:254. Work needed: Update the brief and make the dialog's limits clear.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- F044-09
- F044-12
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-execution-boundaries

## Unknown

- Whether the Electron Desktop saves downloads through a native dialog or the browser default.
- Whether a copied non-PNG web image loses the claim (reasoned, not run).
- The file route and download-allowance test titles beyond file names.
- Whether the Mobile viewer cache folder is cleaned.
