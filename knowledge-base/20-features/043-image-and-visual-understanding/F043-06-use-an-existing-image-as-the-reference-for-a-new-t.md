---
id: "F043-06"
type: "feature"
title: "Use an existing image as the reference for a new task"
aliases: ["Reference image", "Use a library image in a new chat", "Ask about this file", "Remix", "Add to chat from Library", "Image edit and variation", "S43.17"]
area: "43 Image and visual understanding"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S43.17"]
depends_on: ["F043-01", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-authentication-and-identity", "SYS-shared-ui-and-design", "SYS-voice-and-media", "surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F043-06 Use an existing image as the reference for a new task

A person picks an image already in their Library, an earlier output or an upload and uses it as input: ask about it in a new chat, or use it as the starting point for an image edit, variation or masked edit. Built on web, desktop and mobile; missing on the CLI and Chrome.

Area: [43. Image and visual understanding](README.md). Requirement items: [S43.17](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4317).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Moves an existing image into a new task without downloading and re-uploading it: from the Library into a new chat with the file attached, into the composer in image mode for a remix, or from the mobile add-to-chat sheet into a chat or an image edit.

**Why it exists.** The brief requires that users pick an existing image (upload, library item or earlier output) as the reference input for a generation or edit (doc: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md, S43.17). Without it an image from an earlier session was a dead end (apps/web/features/library/lib/library-chat-handoff.ts:70-74).

**Who uses it.** Web, desktop and mobile Cloud users who made or saved images and want to reuse them.

**Problems it solves**

- Re-uploading a file already stored in the account.
- Starting an edit or variation from an older image.
- Asking a question about a saved file.

**Use cases**

- From the Library, ask 'What is in this picture?' about a saved image.
- Remix an earlier generated image with its original prompt.
- On the phone, pick a Library image in the add-to-chat sheet and edit it.
- On web, attach an image in image mode and choose Edit, Variation or Mask edit.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): Library page. The detail view has a box with the placeholder and label 'Ask about this file' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1346-1348), actions 'Add to chat' (LibraryView.tsx:685) and 'Remix' (LibraryView.tsx:701). Wiring in apps/web/features/library/components/LibraryView.tsx:207-232.
- Web composer image mode: operations 'Edit', 'Variation' and 'Mask edit' for an attached image (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:277-285).
- Mobile: add-to-chat sheet lists recent Library images and files in Cloud mode (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:399, 368-389) with rows 'Create image' and others (AddToChatSheet.tsx:927).
- CLI and Chrome: none (brief S43.17 missing).

**Before you start**

- Signed in, Cloud mode, and for generation or editing the plan capability canUseImages and a usable edit-capable image model (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1056-1067, 1370-1374; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:249-258).
- An adult-eligible account for the image generation route (apps/web/app/api/media/image/generate/route.ts:32-39).

**Screens and controls**

- Library detail with question box, 'Add to chat', 'Remix', 'Download to view' (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1321, 1346, 685, 701).
- Composer image operation menu with hints: 'Change the attached image with your prompt', 'A new take on the attached image', 'Redraw only where the second image is masked' (ChatComposerNew.tsx:283-285).
- Mobile sheet with Library pick rows and thumbnails.

**Journey**

1. Open the Library and pick an image.
2. Type a question and send ('Ask about this file') or choose 'Add to chat' or 'Remix'.
3. The app stages the file and opens a new chat; the file is attached and any draft is placed in the composer.
4. For Remix the composer opens in image mode with the saved prompt and model.
5. Choose Edit, Variation or Mask edit if needed, then send.
6. Read the answer or see the new image.

**What the person sees and gets**

- A toast 'That file could not be attached. Download it and attach it instead.' if staging fails (apps/web/features/library/components/LibraryView.tsx:211-212).
- 'This file is too large to add from the Library. Download it, then add it from your device.' for an over-limit file (apps/web/features/library/lib/library-chat-handoff.ts:20-21).
- Error 'Only an image can be remixed.' (library-chat-handoff.ts:77).
- Mobile blocked-image messages such as 'Attach up to 4 images: the first is edited and the others guide it.' and '<model> cannot edit an attached image. Pick ... as the image model in Add to chat, or remove the attachment.' (resolveMobileImageGenerationRequest.ts:196-199, 224-229).
- The edited image or the answer in chat.

**Settings**

- Image model choice and aspect ratio in the composer (ChatComposerNew.tsx:1242-1247).
- Operation: Edit, Variation, Mask edit (ChatComposerNew.tsx:1255).
- Mobile Cloud picker scope follows the active project or destination (AddToChatSheet.tsx:391).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: Library 'Ask about this file' stages the item as a File for a new chat and navigates to the new chat; 'Add to chat' and 'Remix' do the same with their modes (apps/web/features/library/components/LibraryView.tsx:207-232; apps/web/features/library/lib/library-chat-handoff.ts:44-90).
- Web composer: when in image mode, the first attachment is the source image and the second is the mask; operation options are Edit, Variation and Mask edit, offered only for edit-capable image models (ChatComposerNew.tsx:1370-1387).
- Mobile Cloud: Library images are listed (kind image or file) and attached by asset id so they are not uploaded again (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:399; apps/mobile/stores/chat/chatExecutionStore.ts:2472-2484).
- Mobile edit: the first attachment is edited, up to three more guide it, size and edit-capable model checks run before sending (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:196-260; packages/contracts/cloud-contracts/src/managed-media.ts:78-86).

**Incomplete**

- The mobile picker hides image files in Local mode (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:374), so Local mode gets no image reuse from the sheet.
- Desktop is the hosted web app; no desktop-only code was found for this item [inferred from AGENTS.md section 5].
- Server handling of the reference image in the image route was not read beyond the route's gates (apps/web/app/api/media/image/generate/route.ts:20-70); the brief names line 300 which printed nothing relevant: unknown.

**Present but disconnected or switched off**

- Outpaint is not offered because the composer cannot author the larger canvas and mask (ChatComposerNew.tsx:271-276).
- Mobile image generation refuses outside Cloud mode ('requires_cloud') (resolveMobileImageGenerationRequest.ts:245).

**Not available**

- CLI: no reference picker found (brief S43.17 missing); a Library list and download exists but no stage-as-attachment was found (apps/cli/src/cloud/library.rs:87-111).
- Chrome extension: missing per the brief. VS Code: not applicable per the brief.

## 4. Required behaviour

**Established requirements**

- The user picks an existing image (upload, library item or earlier output) as the reference input for a generation or edit. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.17)
- One chat: users add files, references and images to a normal chat. (source: docs/product/requirements.md section 4.2)
- Local, own-key and Cloud stay separate; a Local file is not silently moved to Cloud. (source: AGENTS.md section 6)
- An action a user cannot undo asks first and names the consequence. (source: AGENTS.md section 9)

**Acceptance criteria**

1. From the Library, 'Ask about this file' opens a new chat with that image attached and the question in the composer.
2. 'Remix' on a saved image opens the composer in image mode with the image attached and its prompt.
3. An over-limit Library file shows 'This file is too large to add from the Library. Download it, then add it from your device.'
4. In the web composer, an attached image in image mode offers Edit, Variation and, with a second image, Mask edit.
5. On mobile Cloud, picking a Library image attaches it without a second upload.
6. On mobile Local, the sheet lists no image files and says on-device models read text, not pictures.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI and Chrome should offer a way to use a Library image if parity is required [inferred from brief status missing].
- Because Library items are Cloud data, using one in Local mode would cross a boundary and must stay blocked [inferred from AGENTS.md section 6].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Library picker command to the CLI that stages a Library image through the existing /attach path.
- [proposed] Add a Library entry to the Chrome side panel attach menu.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Web LibraryView host | `apps/web/features/library/components/LibraryView.tsx` | Wires askAboutFile, addToChat, remix to staging and navigation. |
| component | Shared LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Question box 'Ask about this file', 'Add to chat', 'Remix'. |
| service | library-chat-handoff | `apps/web/features/library/lib/library-chat-handoff.ts` | stageLibraryItemForNewChat, stageLibraryItemForImageRemix, take staged files, size message. |
| component | ComposerFilesMenu | `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx` | libraryItemToFile and the 'Upload from device' label. |
| component | ChatComposerNew image mode | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Edit, Variation, Mask edit; source and mask files. |
| component | ImageMaskDialog | `apps/web/features/chat/components/Composer/ImageMaskDialog.tsx` | Mask drawing for Mask edit (imported at ChatComposerNew.tsx:45). |
| service | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Takes staged library attachments into the new chat. |
| endpoint | image generate route | `apps/web/app/api/media/image/generate/route.ts` | Managed image generation with age and policy gates. |
| service | managed media contract | `packages/contracts/cloud-contracts/src/managed-media.ts` | Reference size cap, up to 3 guide images, asset_id or b64_json reference. |
| component | mobile AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Library picks, Local filter, Create image. |
| service | mobile image request resolver | `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts` | Checks reference image count, size, edit-capable model, plan and mode. |
| service | mobile image generation turn | `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts` | Runs the edit or generation turn with retries. |
| service | mobile library client | `apps/mobile/src/features/library/libraryClient.ts` | fetchLibraryPage for the picker. |
| store | mobile chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Reuses attachments that already have an asset id. |
| service | CLI library client | `apps/cli/src/cloud/library.rs` | List, text and download for the Library; no reference staging found. |
| test | library-chat-handoff test | `apps/web/features/library/lib/__tests__/library-chat-handoff.test.ts` | Staging, remix and refusal tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person picks a Library image and asks, adds to chat or remixes. | device | packages/ui/unified-chat/src/components/library/LibraryView.tsx:685, 701, 1346 |
| The web app downloads the stored bytes from the Library and turns them into a File; an over-limit file is refused with the Library message. | device and our servers | apps/web/features/library/lib/library-chat-handoff.ts:23-32; apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:164-175 |
| The File is parked in memory, the composer mode and draft are set, and the app navigates to a new chat which takes the staged file. | device | library-chat-handoff.ts:58-67, 88-90; apps/web/features/library/components/LibraryView.tsx:209-213 |
| On send, the file goes through the normal upload, scan and hydration path (F043-01) or the image generation route when in image mode. | our servers | apps/web/lib/server/chat-attachment-completion.ts:397; apps/web/app/api/media/image/generate/route.ts:20-70 |
| The edit or generation runs on a managed image model and the result returns. | outside service | apps/web/app/api/media/image/generate/route.ts:21 imports generateManagedImage; provider detail not read |
| Mobile Cloud: picked Library items carry an asset id and are reused without upload; the request resolver checks size, count, mode and plan before generating. | device and our servers | AddToChatSheet.tsx:399-420; chatExecutionStore.ts:2475-2484; resolveMobileImageGenerationRequest.ts:235-260 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Library image (source) | Private account storage; Library records (table name not established) | Yes across Cloud apps | Kept until the person deletes it (AddToChatSheet.tsx:132-133). |
| Staged file for the new chat | Module memory variable in the web app (stagedAttachments) | No | Taken once and cleared (library-chat-handoff.ts:94-98). |
| Generated or edited image | Library of the account | Yes | Until deleted; details in SYS-files-artifacts-and-storage (not read). |

**Models and providers.** Asking about the file uses a vision chat model (F043-01). Editing needs an image model whose provider supports managed image edit; the allowed set comes from supportsManagedMediaImageEdit and the media model list (packages/contracts/cloud-contracts/src/managed-media.ts:70-75; resolveMobileImageGenerationRequest.ts:171-175). No provider is hard-wired here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Library and image routes need sign-in; the image route also checks adult eligibility (apps/web/app/api/media/image/generate/route.ts:32-39). |
| Permissions | Organisation policy and managed compute gates run before the image route proceeds (generate/route.ts:41-70). Mobile: no device permission for the Library picker. |
| Subscription | Image editing needs the canUseImages capability and the plan's image-generation allowance (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1056-1067; apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:249-255). A plan-required refusal appears on mobile. Asking about a Library file in a chat follows attachment limits (F043-01). Plan specifics: SYS-subscriptions-entitlements-and-usage. |
| Limits and metering | Library copy size limit message (library-chat-handoff.ts:20-21; exact bytes: unknown). Reference image cap MANAGED_MEDIA_IMAGE_REF_MAX_B64_LENGTH 12,000,000 base64 characters and up to 3 guide images (managed-media.ts:78-86). Rate limit 'image-generation' on the route (generate/route.ts:30). Credit metering: unknown. |
| Feature flags | Mobile: globalImageGenerationEnabled and imageGenerationEnabled gates (resolveMobileImageGenerationRequest.ts:246-247). Web: freeMediaOfferRequested and promotional media offers (ChatComposerNew.tsx:1283-1304). |
| Model compatibility | The image model must support edit; otherwise the composer hides the operation menu or mobile blocks with 'cannot edit an attached image' (ChatComposerNew.tsx:1370-1374; resolveMobileImageGenerationRequest.ts:224-229). |
| Provider restrictions | Only providers listed for managed image edit (managed-media.ts:70-75). |
| Local mode | Mobile Local: image files are removed from the add-to-chat Library list (AddToChatSheet.tsx:374) and image generation refuses outside Cloud (resolveMobileImageGenerationRequest.ts:245). Web and desktop Library is a Cloud feature. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Staging fails | Toast 'That file could not be attached. Download it and attach it instead.' | apps/web/features/library/components/LibraryView.tsx:211-212 |
| File too large | Error 'This file is too large to add from the Library. Download it, then add it from your device.' | library-chat-handoff.ts:20-21, 28-32 |
| Not an image for Remix | Error 'Only an image can be remixed.' | library-chat-handoff.ts:76-78 |
| Unsent draft | A parked draft is kept and the new text is added after it. | library-chat-handoff.ts:34-39; library-chat-handoff.test.ts:83 |
| Rate limited Library read | A 429 carries a limit that the composer shows; details not read. | apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:154-170 |
| Mobile picker loading and error | Library picker has idle, loading, ready and error states. | apps/mobile/src/features/chat/components/AddToChatSheet.tsx:168-172, 427 |
| Too many or too large references (mobile) | Blocked with messages naming the limit. | resolveMobileImageGenerationRequest.ts:196-216 |
| Offline (mobile) | Image requests are blocked with code offline. | resolveMobileImageGenerationRequest.ts:248 |
| Retry (mobile edit) | Up to three failed edit requests are remembered for retry per owner. | apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:143-175 |
| Accessibility | The Library question box has aria-label 'Ask about this file'. | packages/ui/unified-chat/src/components/library/LibraryView.tsx:1347 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/library/lib/__tests__/library-chat-handoff.test.ts`: Stages stored bytes once with draft and mode, remix with prompt and image mode, keeps an unsent draft, refuses non-images, stages nothing on read failure.
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Library view actions (file named by search; cases not read).
- `apps/web/features/chat/pages/__tests__/WebChatPage.library-handoff.test.tsx`: New chat takes the staged library file (named by search; cases not read).
- `apps/web/app/api/media/image/generate/route.ts`: No test file found next to it in this search; generation route tests not located.

**Test scenarios**

- **Ask about a library image**
  1. Open the Library on web.
  2. Open an image and type a question in 'Ask about this file'.
  3. Send.
  - Expected: A new chat opens with the image attached and the question in the composer.
- **Remix**
  1. Choose Remix on a saved generated image.
  - Expected: Composer in image mode with the image attached, its prompt and model set.
- **Over-limit library file**
  1. Pick a very large Library file and choose Add to chat.
  - Expected: Error with the Library too-large text; nothing attached.
- **Mobile Cloud Library pick**
  1. In a Cloud chat open the add-to-chat sheet.
  2. Pick a Library image.
  3. Send a question.
  - Expected: The image attaches with its asset id and is not uploaded again.
- **Mobile Local**
  1. Open the sheet in a Local chat.
  - Expected: Image files are not listed; the note says on-device models read text in photos.
- **Edit with a non-edit model**
  1. On mobile pick a model that cannot edit and attach an image in image mode.
  - Expected: Blocked with the 'cannot edit an attached image' message naming capable models.

**Where to look when it fails**

- Toast and error texts above.
- Image route gates and rate limit 'image-generation'.
- Mobile block codes reference_image_invalid, reference_image_too_large, reference_image_unsupported, requires_cloud, plan_required, offline, auth_required.
- No recorded live run for web, desktop or mobile reference-image use was found.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/043-image-and-visual-understanding.md](../../70-qa/test-plans/web/043-image-and-visual-understanding.md)
- Desktop: [70-qa/test-plans/desktop/043-image-and-visual-understanding.md](../../70-qa/test-plans/desktop/043-image-and-visual-understanding.md)
- Mobile: [70-qa/test-plans/mobile/043-image-and-visual-understanding.md](../../70-qa/test-plans/mobile/043-image-and-visual-understanding.md)

## 10. Gaps and dependencies

- **CLI has no reference-image picker.** Affects: CLI users. Evidence: brief S43.17 status missing; apps/cli/src/cloud/library.rs has list and download only. Work needed: Add a staging command that downloads a Library image into /attach.
- **Chrome extension has no reference-image picker.** Affects: Chrome users. Evidence: brief S43.17 status missing. Work needed: Add a Library attach option to the side panel.
- **Mobile Local has no way to reuse an image.** Affects: Mobile Local users. Evidence: AddToChatSheet.tsx:374 filters out images. Work needed: Decide the required Local behaviour; reuse of local photos is possible without Cloud.
- **No live check recorded and no route test located for image reference handling.** Affects: Web, desktop, mobile. Evidence: brief marks done; no test for apps/web/app/api/media/image/generate/route.ts found in this search. Work needed: Record a live run and add a route test.
- **Outpaint is not offered.** Affects: Web users. Evidence: ChatComposerNew.tsx:271-276. Work needed: Canvas and mask authoring if required.
- **The brief's code pointers for this item are stale (ChatComposerNew 2862 is draft-editing code).** Affects: Readers. Evidence: ChatComposerNew.tsx:2840-2900. Work needed: Update the brief.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- F043-01
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-authentication-and-identity
- SYS-shared-ui-and-design
- SYS-voice-and-media
- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- mode:local

## Unknown

- How the image route consumes the reference image (asset_id versus bytes) and the credit cost.
- The exact Library file size limit in bytes.
- Desktop-specific image handling beyond the hosted web app.
- Whether CLI Library download can be staged as an attachment today.
- The Library table name.
