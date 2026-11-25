---
id: "F045-02"
type: "feature"
title: "Remix an earlier image"
aliases: ["Remix", "New version (card button)", "Revise this image (panel)", "Open a previously generated image", "S45.02"]
area: "45 Image editor"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S45.02"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "F045-01", "F045-03", "file:apps/web/features/library/lib/library-chat-handoff.ts", "table:media_assets", "store:web-chat-store", "api:POST /api/media/keep", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F045-02 Remix an earlier image

Starts a new edit from an image made earlier. On web, the chat card button 'New version' opens the revision panel for this chat's images; the Library row action 'Remix' loads the saved image and its prompt into an image-mode composer. Mobile Library also has Remix, in AGI Cloud mode only. CLI and Chrome have nothing.

Area: [45. Image editor](README.md). Requirement items: [S45.02](../../10-requirements/capabilities/045-image-editor.md#s4502).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person pick up an earlier image and change it. In this chat the card opens the revision panel; for older chats the Library stages the saved file, its original prompt and its aspect ratio into the composer in image mode (apps/web/features/library/lib/library-chat-handoff.ts:75-92).

**Why it exists.** The brief requires that an image generated earlier, in this chat or an older one, opens into an editing state (doc: knowledge-base/data/area-briefs/045-image-editor.md S45.02). The code comment says an image from an earlier session used to be a dead end (library-chat-handoff.ts:68-74).

**Who uses it.** Signed-in people who generate images and want to continue from an earlier result.

**Problems it solves**

- No way back to an image from an older chat.
- Having to download and re-upload a generated image.
- Losing the original prompt when starting again.

**Use cases**

- Open last week's logo from the Library and ask for a new colour.
- Press 'New version' on a result in the current chat and describe a change.
- On the phone, use the row menu in the Library and choose Remix.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): on an image card, hover or focus shows the button 'New version' (title 'Revise this image'), which opens the 'Revise this image' panel (ImageGenerationCard.tsx:1028-1037, 603).
- Web and Desktop: Library row menu item 'Remix', shown for images only (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1833-1842).
- Mobile: Library row action menu item 'Remix' for image assets, only when the app is in cloud mode (apps/mobile/src/features/library/index.tsx:624-631).
- CLI, Chrome, VS Code: not available.

**Before you start**

- Signed in, plan with image generation, a model that can edit for edits to apply in place.
- Web Remix: the saved file must be loadable (not too large) and an image.
- Mobile Remix: cloud mode and an image model available.

**Screens and controls**

- Web card: 'New version', Share, Copy, Download (ImageGenerationCard.tsx:1028-1100).
- Web Library menu: Remix.
- Revision panel (role dialog, aria-label 'Revise this image'): Aspect ratio, Share, Download, Variation, Select area, Add mask, text field 'Describe a change to this image...' (ImageGenerationCard.tsx:603-880).
- Mobile Library action menu: Add to chat, Remix, Open chat, Delete.

**Journey**

1. Web in this chat: press 'New version' on the card.
2. Web older image: open the Library, open the row menu, choose Remix.
3. The browser goes to a new chat with image mode on, the file attached, the original prompt in the box and the saved ratio picked.
4. Mobile: choose Remix in the row menu; the app enters image mode, stages the prompt and attaches the image, then opens the chat tab.
5. Edit the prompt and send.

**What the person sees and gets**

- On failure the Library row shows the error text (e.g. 'Only an image can be remixed.') (packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx:1010-1020).
- Too-large file: 'This file is too large to add from the Library. Download it, then add it from your device.' (library-chat-handoff.ts:21).
- Mobile with no model: alert 'Image generation is unavailable'.
- In the panel, the new version replaces the shown image and is announced 'The new version of this image is ready'.

**Settings**

- Remix keeps the saved model if it exists and can edit; otherwise the composer picks an editing model (ChatComposerNew.tsx:1455-1480).
- The saved ratio is matched to the nearest ratio within 2 percent (library-chat-handoff.ts:23, 45-57).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Library Remix stages the file, the prompt and the ratio into the composer (library-chat-handoff.ts:75-92; apps/web/features/library/components/LibraryView.tsx:230-233).
- Web composer applies the staged model and ratio once media models are known (ChatComposerNew.tsx:1455-1480).
- Web card revision panel edits the version on screen and keeps earlier versions in message metadata (ImageGenerationCard.tsx:1284-1300; WebChatPage.tsx:3465-3487).
- Non-images are refused: 'Only an image can be remixed.' (library-chat-handoff.ts:77).
- Mobile Library Remix exists: picks the model, enters image mode, stages the prompt and attaches the image (apps/mobile/src/features/library/index.tsx:545-560, 630).

**Incomplete**

- The brief marks mobile Remix missing, but code has it; it is hidden outside cloud mode (library/index.tsx:624-631).
- Mobile only stages the prompt when signed in with a Clerk user (library/index.tsx:553).

**Present but disconnected or switched off**

- A host with no image composer omits the Remix row entirely (LibraryView.tsx:293-294 in packages/ui/unified-chat).

**Not available**

- CLI: no Library remix. Chrome: not available. Mobile in Local mode: Remix row hidden.

## 4. Required behaviour

**Established requirements**

- The user opens an image made earlier (this chat or an older one) into an editing state where changes apply to it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S45.02)
- Remix must load the saved file, its original prompt and its aspect ratio into the composer in image mode. (source: apps/web/features/library/lib/library-chat-handoff.ts:75-92)
- Only images can be remixed. (source: apps/web/features/library/lib/library-chat-handoff.ts:76-78)
- A file too large to load shows a clear message asking the person to add it from the device. (source: apps/web/features/library/lib/library-chat-handoff.ts:21-22)

**Acceptance criteria**

1. From the Library, an image row shows Remix and a document row does not.
2. After Remix on web, the new chat has image mode on, the file attached and the original prompt in the box.
3. The ratio chosen matches the image's shape within 2 percent, or is Auto.
4. A 413 from the file read shows the too-large message.
5. 'New version' on a card opens a panel showing that exact version.
6. On mobile, Remix is absent in a Local chat and present in cloud mode for images.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- If the stored model cannot edit, the composer swaps in an editing model (test names at ChatComposerNew.test.tsx:3681) [inferred].
- An unsent draft in the new-chat box is kept and the prompt is added after it (library-chat-handoff.test.ts, test name at line 83) [inferred from test name].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer Remix from an image opened full screen on web.
- [proposed] Show the original prompt as editable text in the panel header.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | stageLibraryItemForImageRemix | `apps/web/features/library/lib/library-chat-handoff.ts:75` | Stages file, prompt, image mode and ratio |
| service | readLibraryItemFile | `apps/web/features/library/lib/library-chat-handoff.ts:25` | Loads the stored file and maps 413 to the too-large message |
| service | takeStagedLibraryAttachments | `apps/web/features/library/lib/library-chat-handoff.ts:94` | Hands the staged file to the new chat |
| screen | WebChatPage staged attachments | `apps/web/features/chat/pages/WebChatPage.tsx:1541` | Takes the staged file into the composer |
| component | Web LibraryView | `apps/web/features/library/components/LibraryView.tsx:230` | Wires remixItem and navigates to a new chat |
| component | Shared LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx:698` | Remix menu row for images and error display on the row |
| store | web-chat-store pendingImageSettings | `apps/web/shared/stores/web-chat-store.ts:99` | Carries model and ratio to the composer |
| component | ChatComposerNew pending settings effect | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1455` | Applies model and ratio, swaps to an editing model |
| component | ImageGenerationCard / EditPanel | `apps/web/features/chat/components/ImageGenerationCard.tsx:603` | Card button and revision panel |
| screen | WebChatPage handleRegenerateImageInPlace | `apps/web/features/chat/pages/WebChatPage.tsx:3402` | Updates the existing message in place and appends the old image to imageVersions |
| screen | Mobile Library handleRemix | `apps/mobile/src/features/library/index.tsx:545` | Mobile Remix action |
| service | mobile imageVersions | `apps/mobile/src/features/image/imageVersions.ts` | Reads earlier versions from message metadata |
| table | media_assets | `apps/web/lib/server/media-assets.ts` | Saved images the Library lists |
| endpoint | POST /api/media/keep | `apps/web/app/api/media/keep/route.ts:42` | Saves a temporary-chat image to the Library |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Library lists the person's saved media. | our servers | apps/web/app/api/media/jobs/route.ts:27 and Library transport (LibraryView.tsx) |
| Remix downloads the saved file, reads its shape, and parks file, mode and settings in the chat store. | device and our servers | library-chat-handoff.ts:25-92 |
| Router opens a new chat; the composer takes the staged file and settings. | device | LibraryView.tsx:230-233; WebChatPage.tsx:1541; ChatComposerNew.tsx:1455-1480 |
| The person sends; the flow continues as F045-01. | device and our servers | ChatComposerNew.tsx:3755-3815 |
| For a card revision, the panel reads the displayed image by URL and sends it as the source. | device and our servers | imageGenerationOptions.ts:300-304; ImageGenerationCard.tsx:449-466 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Staged file and settings | module variable stagedAttachments and the web chat store (library-chat-handoff.ts:17) | No | Taken once and cleared; lost on page reload [inferred] |
| Earlier versions of an edited card | message metadata imageVersions (WebChatPage.tsx:3465-3487) | With the conversation | Mobile shows the last 50 (imageVersions.ts:9) |
| Source asset | media_assets | Server | Library delete moves to deleted items, then purge after 30 days on mobile wording (library/index.tsx:564-571) |

**Models and providers.** Remix keeps the asset's recorded model if it is available, and otherwise falls back to an editing-capable model (ChatComposerNew.tsx:1455-1480). Edits run through the managed route and the openai adapter only (managed-media.ts:69).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. The Library and the image route are per account. |
| Permissions | Remix reads the file with the person's own session; asset lookups are workspace scoped (image-generation-provider.ts:430-445). |
| Subscription | Remix itself loads a file for free; sending the new edit needs a plan with image_generation (billing-catalog.ts:356). |
| Limits and metering | The edit is metered like F045-01. The file read has a size limit that returns 413 (library-chat-handoff.ts:22-23). |
| Feature flags | Mobile: FEATURES.imageGen and the per-user setting for entering image mode (library/index.tsx:549-552 calls enterMediaMode). Other flags: none found in the code read. |
| Model compatibility | If the saved model cannot edit, the composer switches to an editing model; if none exists the composer only offers removing the image (test names ChatComposerNew.test.tsx:3667, 3681). |
| Provider restrictions | Edit only via the openai adapter (managed-media.ts:69). |
| Local mode | Mobile Remix row is hidden unless appMode is cloud (library/index.tsx:624-631). Web: the Library is a cloud list; Local behaviour unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Not an image | Error 'Only an image can be remixed.' shown on the row. | library-chat-handoff.ts:77; LibraryView.test.tsx:1010-1020 (shared) |
| File too large | Message to download and add from the device. | library-chat-handoff.ts:21-33 |
| Unsent draft in new chat | Prompt is added after the parked draft. | library-chat-handoff.ts:37-42 |
| No ratio match | Ratio becomes Auto. | library-chat-handoff.ts:45-57; ChatComposerNew.tsx:1466-1470 |
| Model unavailable or not an editor | Composer chooses an editing model. | ChatComposerNew.tsx:1458-1465 |
| Mobile no model | Alert 'Image generation is unavailable'. | library/index.tsx:549-552 |
| Card revision while another job runs | Controls disabled; retry-blocked label shows the wait. | ImageGenerationCard.tsx:623-640, 868-880 |
| Image fails to load | 'Image failed to load' with Retry up to a limit. | ImageGenerationCard.tsx:986-1000 |
| Offline | Not handled specially in the code read. | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/library/lib/__tests__/library-chat-handoff.test.ts`: Remix with prompt and image mode, keeps unsent draft, refuses a non-image (lines 57-116).
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Remix puts the image in the composer with its prompt (line 514).
- `packages/ui/unified-chat/src/components/library/__tests__/LibraryView.test.tsx`: Remix on images only, failure shown on the row, hidden without an image host (971-1020).
- `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx`: Remix switches to an editing model when the original cannot (line 3681, by test name).
- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Edits the version on screen, not the latest (line 457).
- `apps/mobile/__tests__/library-generated-images.test.ts`: Mobile Library generated images (by file name).

**Test scenarios**

- **Remix from Library**
  1. Open Library, open an image row menu, choose Remix.
  - Expected: New chat in image mode with file, prompt and ratio set.
- **Remix a PDF**
  1. Check the menu of a document row.
  - Expected: No Remix item.
- **Large file**
  1. Remix an image above the read limit.
  - Expected: Too-large message, no navigation.
- **Card revision**
  1. Press 'New version' on a result.
  2. Type a change and Send in the panel.
  - Expected: Panel shows the new image; the old one is in version history.
- **Mobile Remix cloud vs local**
  1. Open Library in cloud mode, long-press an image.
  2. Repeat in Local mode.
  - Expected: Remix present in cloud, absent in Local.

**Where to look when it fails**

- Row error text in Library.
- Console and toast text from toUserMessage.
- Message metadata keys imageVersions, imageGenPrompt, imageGenAspect, imageGenModel.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/045-image-editor.md](../../70-qa/test-plans/web/045-image-editor.md)
- Desktop: [70-qa/test-plans/desktop/045-image-editor.md](../../70-qa/test-plans/desktop/045-image-editor.md)
- Mobile: [70-qa/test-plans/mobile/045-image-editor.md](../../70-qa/test-plans/mobile/045-image-editor.md)

## 10. Gaps and dependencies

- **The brief marks mobile Remix missing but code has a Remix action.** Affects: Mobile. Evidence: apps/mobile/src/features/library/index.tsx:545-560, 630. Work needed: Update the brief and run it on a device.
- **Desktop marked done only through the hosted web app.** Affects: Desktop. Evidence: apps/desktop/electron/main.ts:1065. Work needed: None in code; verify in the Electron window.
- **CLI and Chrome have no remix.** Affects: CLI, Chrome. Evidence: apps/cli/src/cloud/image.rs has no image-source option. Work needed: Decide scope.
- **The web card button reads 'New version', not Edit.** Affects: Web docs. Evidence: ImageGenerationCard.tsx:1036. Work needed: Use the real label in user docs.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- F045-01
- F045-03
- file:apps/web/features/library/lib/library-chat-handoff.ts
- table:media_assets
- store:web-chat-store
- api:POST /api/media/keep
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-shared-ui-and-design

## Unknown

- Whether the staged file survives a page reload on web.
- How long deleted Library images remain recoverable on web.
- Whether Electron adds any Library behaviour of its own.
- Remix behaviour in a Local web chat.
- Test results: none recorded.
