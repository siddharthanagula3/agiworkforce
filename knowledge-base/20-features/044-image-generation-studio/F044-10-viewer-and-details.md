---
id: "F044-10"
type: "feature"
title: "Viewer and details"
aliases: ["Viewer and details", "Full-screen viewer", "Image viewer", "Prompt and settings caption", "Generated with <model>", "Image versions", "/image open", "/image last"]
area: "44 Image-generation studio"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S44.22", "S44.23"]
depends_on: ["F044-09", "F044-11", "SYS-model-catalog-and-routing", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "SYS-voice-and-media"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F044-10 Viewer and details

Open an image large and see what made it. Mobile has a full-screen viewer with the prompt and a 'Generated with <model> · ratio' caption. Web shows the same caption on the card and a Library viewer with zoom. Size and quality are shown only by the CLI's last-image summary.

Area: [44. Image-generation studio](README.md). Requirement items: [S44.22](../../10-requirements/capabilities/044-image-generation-studio.md#s4422), [S44.23](../../10-requirements/capabilities/044-image-generation-studio.md#s4423).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person look at a generated image at full size and see the prompt and the model and ratio used.

**Why it exists.** The person needs to judge the result and know which prompt and settings produced it before reusing them. (doc: area brief 044, S44.22, S44.23)

**Who uses it.** Anyone reviewing generated images on Web, Desktop (hosted web app), Mobile, CLI.

**Problems it solves**

- Small previews hide flaws.
- Forgetting which model made an image.
- Not knowing the prompt of an old image.

**Use cases**

- On Mobile tap an image to open the viewer, pinch to zoom and read the prompt.
- On Web open the Library item to see the image large with zoom controls.
- In the CLI run `agi image --last` to see prompt, model and settings.

## 2. User experience

**Where to find it**

- Web chat: the image card and its caption under it. (apps/web/features/chat/components/ImageGenerationCard.tsx:1157-1162)
- Web Library: click an image tile to open the viewer dialog titled '<prompt> viewer'. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1157-1210)
- Mobile: tap the image in chat or Library to open the full-screen viewer. (apps/mobile/src/features/chat/components/ImageFullScreen.tsx)
- CLI: `agi image --last`, `/image last`, `/image open`. (apps/cli/src/lib.rs:3489; apps/cli/src/tui/tui_app.rs:5594-5611)

**Before you start**

- An image exists and its file is reachable; on Mobile only a saved Cloud image path can use Save, Share and Copy. (apps/mobile/services/fileCreation.ts:643-651)

**Screens and controls**

- Web caption 'Generated with <model name> · <ratio>' (ratio omitted when auto). (apps/web/features/chat/components/ImageGenerationCard.tsx:1157-1162)
- Web card prompt used as alt text and as the revise panel title (first 36 characters). (apps/web/features/chat/components/ImageGenerationCard.tsx:1005-1010,430)
- Web Library viewer: breadcrumb 'Library > <prompt>', zoom in and out, Download, Close file viewer, 'Ask about this file'. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1212-1275,1340-1375)
- Mobile viewer: header controls Change this image, Edit an area, Report this image, Delete image, Save image to Photos, Share image, Copy image, Close; the prompt and caption under the picture; swipe between images; pinch zoom; drag down to close. (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:640-700,744-795)
- CLI: summary line 'AI-generated with <model> (<provider>): <settings>.' and `--last` lines Prompt, Model, Settings, Files. (apps/cli/src/cloud/image.rs:236-262,761-795)

**Journey**

1. 1. Person taps or clicks the image.
2. 2. The viewer opens at full size; Mobile also shows the prompt and the caption.
3. 3. Person zooms, swipes or reads details, and closes the viewer.
4. 4. CLI: person runs --last or /image open to see the settings or open the file in the system viewer.

**What the person sees and gets**

- Mobile caption text 'Generated with <model name> · <ratio>' (apps/mobile/src/features/image/imageSettingsCaption.ts:3-8).
- CLI settings line lists size, ratio, quality, transparency and count. (apps/cli/src/cloud/image.rs:131-190)
- Web 'Image failed to load' with Retry when the file cannot be fetched. (apps/web/features/chat/components/ImageGenerationCard.tsx:986-1000)

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mobile viewer shows prompt and model plus ratio caption for generated images, not for attachments. (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:329-331,744-795)
- Web card caption with model name and ratio; the model name is read from the catalog and stays silent when the model is unknown. (apps/web/features/chat/components/ImageGenerationCard.test.tsx test 'stays silent rather than guessing when the message stored no catalog model')
- Web Library viewer with zoom for images; the prompt is the display name. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:160-168,1212-1222)
- CLI --last prints prompt, model, settings, files and saved defaults. (apps/cli/src/cloud/image.rs:761-795)

**Incomplete**

- The web card has no details panel; model and ratio appear only as a caption and prompt only as alt text and a truncated panel title. The brief's pointer to line 1078 is the 'More actions' menu. (apps/web/features/chat/components/ImageGenerationCard.tsx:1077-1100)
- Size and quality are not shown on Web or Mobile; only the CLI settings line shows them. (apps/cli/src/cloud/image.rs:671-697)
- Web Library viewer shows no model, ratio, size or quality, although the API returns provider and model. (apps/web/app/api/library/route.ts:80-83)
- CLI 'viewer' is the operating system's default viewer launched with file://, not a terminal viewer, and only for files made in the current terminal chat. (apps/cli/src/tui/tui_app.rs:5596-5611)

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Chrome extension viewer or details for generated images: none found.
- VS Code: not applicable.

## 4. Required behaviour

**Established requirements**

- User opens a generated image in a full-screen viewer. (source: S44.22)
- User can see the prompt and generation settings (model, ratio, size, quality) used for an image. (source: S44.23)

**Acceptance criteria**

1. Tapping an image on Mobile opens a full-screen viewer with zoom and the prompt.
2. The caption names the model by its display name and the ratio unless the ratio is auto.
3. A Web Library image opens large and can be closed with Escape.
4. The CLI --last output lists prompt, model, settings and file paths after one generation.
5. A missing file shows a clear failure with a retry rather than a blank frame.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Size and quality should be recorded with the job so every app can show them; the job plan already stores quality. (apps/web/lib/server/image-generation-jobs.ts:23-35 plan fields) [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a details sheet on Web with prompt, model, ratio, size, quality and created time.
- [proposed] Show the model and ratio in the Web Library viewer header.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ImageGenerationCard ResultCard | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Web image, caption, copy, more menu and version control. |
| component | FileViewerOverlay | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Library full-screen viewer with zoom. |
| service | libraryItemDisplayName | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Uses the prompt as an image's visible name. |
| endpoint | GET /api/library (item fields) | `apps/web/app/api/library/route.ts` | Returns prompt, provider and model per item. |
| component | ImageFullScreen | `apps/mobile/src/features/chat/components/ImageFullScreen.tsx` | Mobile full-screen viewer with prompt and caption. |
| service | imageSettingsCaption | `apps/mobile/src/features/image/imageSettingsCaption.ts` | Builds 'Generated with <model> · <ratio>'. |
| component | GeneratedImage (mobile) | `apps/mobile/src/features/chat/components/GeneratedImage.tsx` | Inline image in the message that opens the viewer (file existence only). |
| service | describe_last / settings_line | `apps/cli/src/cloud/image.rs` | CLI prompt and settings text. |
| command | agi image --last | `apps/cli/src/lib.rs` | Prints the last image details. |
| command | /image open, /image last, chip line | `apps/cli/src/tui/tui_app.rs` | Terminal chat chip and viewer launch. |
| component | imageViewerDismiss helpers | `apps/mobile/src/features/chat/components/imageViewerDismiss.ts` | Drag-down dismissal maths (file referenced by ImageFullScreen). |
| store | web-chat-store message metadata | `apps/web/shared/stores/web-chat-store.ts` | Keeps image model, ratio and prompt on the message. |
| config | model catalog name lookup | `packages/contracts/types/src/model-catalog.ts` | getModelMetadataById supplies the display name. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client already holds the image address and message metadata (prompt, model id, ratio). | device | apps/web/features/chat/pages/WebChatPage.tsx:3430-3437 (metadata keys imageGenPrompt, imageGenAspect, imageGenModel) |
| Client turns the model id into a display name from the bundled catalog and builds the caption. | device | apps/mobile/src/features/image/imageSettingsCaption.ts:3-8 |
| Client fetches the image bytes from /api/files/<id> with the session credential. | device and our servers | apps/web/lib/server/media-storage.ts:340; apps/mobile/services/fileCreation.ts:408-425 |
| CLI reads image.json for the last image. | device | apps/cli/src/cloud/image.rs:761-795 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Prompt, model id and ratio of a message | Message metadata in the chat store and conversation | With the conversation | With the conversation. |
| Prompt, provider and model of a library asset | table media_assets | Via /api/library | With the asset. |

**Models and providers.** Display names come from the shared model catalog; a model id that is unknown yields no caption. (apps/mobile/src/features/image/imageSettingsCaption.ts:4-6)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account to fetch an image from /api/files; the route is workspace scoped. (apps/web/app/api/files/[id]/route.ts:194-215) |
| Permissions | none found in the code beyond ownership |
| Subscription | Viewing an owned generated image is not metered as a download. (apps/web/lib/services/tier-unit-quota-service.ts:472-479) |
| Limits and metering | none found in the code for viewing |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Images from on-device sources (camera, files) open in the Mobile viewer without Cloud; generated images exist only in Cloud mode. (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:129-142; apps/mobile/__tests__/ImageFullscreenAuthShare.test.tsx test 'never asks Cloud to authorize an on-device attachment') |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web shows a spinner 'Loading image' until the image loads. | apps/web/features/chat/components/ImageGenerationCard.tsx:1017-1021 |
| Error | Web 'Image failed to load' with Retry up to a retry limit; Mobile has 'Retry loading this image'. | apps/web/features/chat/components/ImageGenerationCard.tsx:986-1000; apps/mobile/src/features/chat/components/ImageFullScreen.tsx:244 |
| Unknown model | No caption is drawn. | apps/mobile/src/features/image/imageSettingsCaption.ts:6 |
| Ratio auto | Ratio is left out of the caption. | apps/mobile/src/features/image/imageSettingsCaption.ts:7 |
| Attachment, not generated | Mobile shows no caption for attachments. | apps/mobile/src/features/chat/components/ImageFullScreen.tsx:329-331 |
| Accessibility | Mobile image label uses the prompt, else 'Full screen generated image'; Web viewer dialog has aria-modal and Escape closes it. | apps/mobile/src/features/chat/components/ImageFullScreen.tsx:142; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1190-1203 |
| Offline | not handled in the code (no offline cache for the full image found) | searched ImageFullScreen.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Caption names the catalog model while generating and on the finished card; silent when no model stored.
- `apps/mobile/__tests__/ImageFullscreenAuthShare.test.tsx`: Authenticated source, share path, no Cloud authorisation for on-device images, report control, change sheet, timers.
- `apps/mobile/__tests__/imageViewerDismiss.test.ts`: Drag-down dismissal maths.
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Shared Library view, includes viewer (titles not read).
- `apps/cli/src/cloud/image.rs`: Rust unit tests; none by title cover describe_last.

**Test scenarios**

- **Mobile viewer details**
  1. Generate an image on Mobile.
  2. Tap it.
  - Expected: Full-screen viewer with prompt text and caption 'Generated with <model> · <ratio>'; pinch zoom works; drag down closes.
- **Web caption**
  1. Generate an image with a 16:9 ratio.
  - Expected: Caption under the card reads 'Generated with <model> · 16:9'.
- **Web Library viewer**
  1. Open Library > Images, click a tile.
  - Expected: Dialog with the image and zoom; Escape closes; no model or ratio is shown (known gap).
- **CLI details**
  1. agi image 'a red bicycle' --quality hd
  2. agi image --last
  - Expected: Prints Prompt, Model, Settings including 'hd quality', and the saved file path.
- **Missing file**
  1. Delete the stored file in a test environment.
  2. Open the image.
  - Expected: 'Image failed to load' with Retry on Web; a clear retry on Mobile.

**Where to look when it fails**

- Server 404 'File bytes are not available' from /api/files/<id>.
- Web console warning about inline blob URLs when storage is not configured.
- CLI: image.json in the CLI config folder.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/044-image-generation-studio.md](../../70-qa/test-plans/web/044-image-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/044-image-generation-studio.md](../../70-qa/test-plans/desktop/044-image-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/044-image-generation-studio.md](../../70-qa/test-plans/mobile/044-image-generation-studio.md)
- CLI: [70-qa/test-plans/cli/044-image-generation-studio.md](../../70-qa/test-plans/cli/044-image-generation-studio.md)

## 10. Gaps and dependencies

- **Web has no prompt and settings details view; size and quality are not shown on Web or Mobile.** Affects: Web, Desktop, Mobile. Evidence: apps/web/features/chat/components/ImageGenerationCard.tsx:1157-1162. Work needed: Persist and show full settings in a details panel; brief marks Web and Mobile built, which overstates this.
- **CLI opens the system viewer, and only for this terminal session.** Affects: CLI. Evidence: apps/cli/src/tui/tui_app.rs:5596-5611. Work needed: Offer `agi library show` for images or an inline terminal preview.
- **Web Library viewer hides model and ratio.** Affects: Web, Desktop. Evidence: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1212-1300. Work needed: Show provider, model and ratio from the item.
- **Chrome extension has no viewer for generated images.** Affects: Chrome. Evidence: apps/extension/src/side_panel.ts. Work needed: Confirm scope, then add.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- F044-09
- F044-11
- SYS-model-catalog-and-routing
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- SYS-voice-and-media

## Unknown

- Whether Desktop Electron adds a native image viewer.
- Whether the Mobile GeneratedImage component draws any caption outside the viewer (file not opened).
- Whether CLI describe_last has a test.
- Exact content of the Library tests.
