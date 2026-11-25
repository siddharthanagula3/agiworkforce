---
id: "F044-08"
type: "feature"
title: "Variations, remix and reuse"
aliases: ["Variations, remix and reuse", "New version", "Variation", "Revise this image", "Remix", "Make a variation", "Change this image", "--again", "/image again", "pendingImageSettings"]
area: "44 Image-generation studio"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S44.20", "S44.24", "S44.25", "S44.32", "S44.34"]
depends_on: ["F044-09", "F044-10", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-execution-boundaries", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F044-08 Variations, remix and reuse

Turn an existing image into new ones. Web and Mobile can make a variation or describe a change. Library Remix sends an image, its prompt, model and ratio back into the composer. The CLI can reuse the last prompt and settings. Sharing a prompt as a recipe and image-to-video are not offered.

Area: [44. Image-generation studio](README.md). Requirement items: [S44.20](../../10-requirements/capabilities/044-image-generation-studio.md#s4420), [S44.24](../../10-requirements/capabilities/044-image-generation-studio.md#s4424), [S44.25](../../10-requirements/capabilities/044-image-generation-studio.md#s4425), [S44.32](../../10-requirements/capabilities/044-image-generation-studio.md#s4432), [S44.34](../../10-requirements/capabilities/044-image-generation-studio.md#s4434).

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

**What it does.** Starts a new generation from an earlier one: a variation of the same picture, a described change, a reframed ratio, or a fresh request that reuses the old prompt and model.

**Why it exists.** People rarely accept the first picture. Starting over loses the prompt and the picture the person liked. Product requirements list variation, reuse prompt and reuse settings as items of the image studio. (doc: area brief 044, S44.20, S44.24, S44.25)

**Who uses it.** People who generate images on Web, Desktop (hosted web app), Mobile and CLI and want to iterate.

**Problems it solves**

- Retyping a long prompt.
- Losing the model and ratio that worked.
- Reaching an older image from a past chat. (apps/web/features/library/lib/library-chat-handoff.ts:65-74 comment)

**Use cases**

- On Web the person hovers a generated image, presses 'New version', then 'Variation' to get a new take.
- In Library the person chooses 'Remix' on an old image; the composer opens in image mode with the image attached and the old prompt filled in.
- On Mobile the person opens the image full screen, taps 'Change this image', then 'Make a variation'.
- In the CLI the person runs `agi image --again --aspect 16:9` to reuse the last prompt with a new ratio.

## 2. User experience

**Where to find it**

- Web chat: hover or focus a generated image, 'New version' button (title 'Revise this image'). (apps/web/features/chat/components/ImageGenerationCard.tsx:1028-1038)
- Web, Desktop, Mobile Library: item action menu 'Remix' (images only). (packages/ui/unified-chat/src/components/library/LibraryView.tsx:1833-1842; apps/mobile/src/features/library/index.tsx:630)
- Mobile image viewer: header control 'Change this image'. (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:640-644)
- CLI: `agi image --again`, `/image again`, `agi image --last`. (apps/cli/src/lib.rs:1110; apps/cli/src/cloud/image.rs:1377-1387)

**Before you start**

- An image in the transcript or Library, on a plan with image generation.
- For Variation and described edits on Web the model must report supports_edit; otherwise the button is disabled with 'This image model cannot revise an existing image'. (apps/web/features/chat/components/ImageGenerationCard.tsx:405-406,738-745)
- Library Remix needs the host to provide a remix handler. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:292-294)

**Screens and controls**

- Web revise panel (dialog 'Revise this image'): aspect ratio menu, Share, Download, 'Variation', 'Select area', mask attach, text box 'Describe a change to this image...', send button 'Generate a new version with this change'. (apps/web/features/chat/components/ImageGenerationCard.tsx:603,738-752,857-880)
- Web 'Image versions' control with Previous and Next version to flip between earlier versions. (apps/web/features/chat/components/ImageGenerationCard.tsx:1133-1155)
- Mobile change sheet: 'Describe the change', 'Change the image', 'Make a variation', 'Make it <shape>'. (apps/mobile/src/features/image/components/ImageChangeSheet.tsx:155,174,211,237)
- CLI options: --again, --aspect, --size, --quality, --transparent, --model, -n, --save-defaults, --clear-defaults, --last. (apps/cli/src/lib.rs:1110-1160)

**Journey**

1. 1. Person finds an image (card, viewer or Library).
2. 2. Web: press 'New version', then 'Variation' or describe a change or pick a ratio. Mobile: tap 'Change this image', then a choice. Library: choose 'Remix'. CLI: run --again.
3. 3. The app reads the source image bytes and sends a generation with operation 'variation' or 'edit', the same prompt and the current ratio.
4. 4. Library Remix does not send anything: it fills the composer and waits for Send. (apps/web/features/library/lib/library-chat-handoff.ts:75-91)
5. 5. The new image appears in the same card as a new version (Web) or as a new message (Mobile).

**What the person sees and gets**

- Web announces 'The new version of this image is ready'. (apps/web/features/chat/components/ImageGenerationCard.tsx:437)
- Errors: 'Could not generate a new image. Try again.', 'Could not prepare this image for editing. Try again.'
- Library Remix errors are shown on the row through runHostAction. (packages/ui/unified-chat/src/components/library/LibraryView.tsx:644-660)
- CLI prints 'Prompt: <prompt>' when the prompt is reused. (apps/cli/src/lib.rs:3523-3525)

**Settings**

- Reused settings are model and aspect ratio on Web and Mobile; CLI reuses model, size, ratio, quality, transparent background and count. (apps/cli/src/cloud/image.rs:131-146)
- Style, size and quality of a past web image are not stored on the Library item, so Remix cannot reuse them. (apps/web/app/api/library/route.ts:60-85)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Variation, described edit, area edit and ratio reframe through the revise panel, calling the same generate route with operation variation, edit or inpaint. (apps/web/features/chat/components/ImageGenerationCard.tsx:549-572; packages/contracts/cloud-contracts/src/managed-media.ts:50-56)
- Web keeps earlier versions in the card. (apps/web/features/chat/components/ImageGenerationCard.tsx:1133)
- Web Library Remix attaches the stored image, turns on image mode and fills the original prompt, model and a matched aspect ratio. (apps/web/features/library/lib/library-chat-handoff.ts:75-92)
- Mobile 'Make a variation' sends a variation with the image's prompt. (apps/mobile/src/features/image/wholeImageEdit.ts:10,30-32)
- Mobile Library Remix selects the image model if still available, enters image mode, stages the prompt and adds the image to chat. (apps/mobile/src/features/library/index.tsx:545-560)
- CLI --again and /image again reuse last prompt and settings with overrides. (apps/cli/src/cloud/image.rs:796-815)

**Incomplete**

- Web Library Remix puts the old image in as a reference attachment; whether the model treats it as an edit or a reference is decided later by composer and server. [inferred]
- Web 'Reuse prompt' and 'Reuse settings' are one combined Remix, not two actions. (apps/web/features/library/lib/library-chat-handoff.ts:75-92)
- Mobile has no reuse action in the chat bubble, only in Library and the viewer change sheet. (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:640-650)

**Present but disconnected or switched off**

- Desktop internal Tauri Library passes no remix handler, so no Remix row is drawn there. (apps/desktop/src/features/library/DesktopLibrary.tsx:165-212)

**Not available**

- Share a prompt as a recipe: no code found on any app.
- Image-to-video from a generated image: no 'animate' control found. Web video mode accepts attached images as first frame or references from the composer, so a person can attach one by hand. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3887-3888)
- CLI variation: the CLI request has no source-image field. (apps/cli/src/cloud/image.rs:41-56)
- Chrome extension: nothing found.

## 4. Required behaviour

**Established requirements**

- User asks for variations of a generated image. (source: S44.20)
- User reuses the prompt of an earlier image in one action. (source: S44.24)
- User regenerates with the same settings (model, ratio) as an earlier image. (source: S44.25)
- User shares or copies the prompt of a generated image as a reusable recipe. (source: S44.32)
- User turns a generated image into a video (image-to-video). (source: S44.34)
- Advertised model and options must produce real decodable media; unsupported configurations expose an honest disabled state. (source: doc: docs/product/experience-contract.md row W12)

**Acceptance criteria**

1. On Web, 'Variation' is disabled with an explanation when the chosen model cannot edit.
2. A Web Variation creates a new image from the current image bytes and the same prompt, and the card shows '2 / 2' versions.
3. Library Remix on an image fills the composer with image mode on, the model, the nearest listed ratio, the prompt, and the image attached; it sends nothing by itself.
4. Library Remix on a non-image is refused ('Only an image can be remixed.').
5. Mobile 'Make a variation' sends operation variation and the new image appears in the chat.
6. CLI `agi image --again` with no other input repeats the last prompt and settings; with --aspect it changes only the ratio.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reuse should also carry quality and size where the app knows them. [inferred from CLI memory model]
- A recipe share should copy prompt plus model and ratio as text. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add 'Reuse prompt' to the Mobile and CLI-adjacent surfaces and to the web card menu.
- [proposed] Add a 'Copy prompt' action to the web card More menu as the smallest recipe feature.
- [proposed] Offer 'Animate' on a generated image that opens video mode with the image as first frame.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ImageGenerationCard EditPanel | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Revise panel with Variation, describe-a-change, area select, ratio reframe. |
| service | stageLibraryItemForImageRemix | `apps/web/features/library/lib/library-chat-handoff.ts` | Stages the stored image, prompt, model and ratio into a new image-mode composer draft. |
| store | web-chat-store composer toggles (pendingImageSettings) | `apps/web/shared/stores/web-chat-store.ts` | Holds the staged image mode and settings for the new chat. |
| screen | Web LibraryView host | `apps/web/features/library/components/LibraryView.tsx` | Provides remixItem, addToProject and mediaJobs to the shared Library. |
| component | LibraryView Remix row | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Draws 'Remix' for image items when a handler exists. |
| service | managed-image-generation (operations) | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Accepts operation generate, edit, inpaint, outpaint, variation and resolves source images. |
| service | image-generation-provider (edit) | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Calls the provider edit API for variations and edits. |
| config | MANAGED_MEDIA_IMAGE_OPERATIONS | `packages/contracts/cloud-contracts/src/managed-media.ts` | Contract listing the five image operations. |
| component | ImageChangeSheet | `apps/mobile/src/features/image/components/ImageChangeSheet.tsx` | Mobile 'Make a variation' and change sheet. |
| service | wholeImageEdit | `apps/mobile/src/features/image/wholeImageEdit.ts` | Builds the variation, edit and reshape requests. |
| screen | Mobile Library Remix | `apps/mobile/src/features/library/index.tsx` | handleRemix stages prompt, model and image into the composer. |
| component | ImageFullScreen | `apps/mobile/src/features/chat/components/ImageFullScreen.tsx` | Viewer header controls 'Change this image' and 'Edit an area of this image'. |
| command | agi image --again | `apps/cli/src/lib.rs` | CLI flag that reuses the last prompt and settings. |
| service | ImageCommand.prepare / ImageSettings.over | `apps/cli/src/cloud/image.rs` | Merges overrides over the remembered last image or saved defaults. |
| store | cli-image-memory (image.json) | `apps/cli/src/cloud/image.rs` | Remembers last prompt, settings and defaults on the device. |
| command | /image again | `apps/cli/src/tui/tui_app.rs` | Terminal chat slash command for reuse. |
| hook | useMediaGeneration (edit fields) | `apps/web/lib/hooks/useMediaGeneration.ts` | Sends source_image, mask_image and reference_images with the operation. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client reads the source image bytes (Web from the authenticated URL, Mobile from the saved path) and base64-encodes them. | device | apps/web/features/chat/components/ImageGenerationCard.tsx:526-541; apps/mobile/services/fileCreation.ts:707-713 |
| Client sends generate with operation variation or edit, the prompt, ratio and source image. | device and our servers | apps/web/lib/hooks/useMediaGeneration.ts:500-520 |
| Server hash-checks and structure-checks the uploaded bytes before any billing, then reserves usage and creates the job. | our servers | apps/web/app/api/media/image/lib/managed-image-generation.ts:527-640,745 |
| Provider edit call produces the new image. | outside service | apps/web/app/api/media/image/lib/image-job-executor.ts:640-660 |
| Library Remix: client downloads the stored image into memory and parks it as a staged attachment plus a composer draft. | device | apps/web/features/library/lib/library-chat-handoff.ts:75-92 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Source image bytes of an edit | Not stored in the job row; only a SHA-256 digest is kept, so a retry must resupply the same image. | No | Per the job table comment. (apps/web/db/neon/0226_durable_image_generation_jobs.sql:49-53) |
| Staged remix attachment and draft | module memory and the web chat store | No | Taken once by the next chat. (apps/web/features/library/lib/library-chat-handoff.ts:93-97) |
| Last prompt and settings (CLI) | image.json on the device | No | Overwritten by the next image. |

**Models and providers.** Edits and variations run on image models whose admission reports supports_edit; the chat-tool edit path pins one provider (openai). (apps/web/features/chat/components/ImageGenerationCard.tsx:405-406; apps/web/app/api/media/image/lib/image-chat-tools.ts:53)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account; Library Remix reads the owner's stored image through the authenticated files route. (apps/web/features/library/lib/library-chat-handoff.ts:28-35) |
| Permissions | Edit sources are resolved against the caller's workspace; uploads pass prompt and hash safety rules before billing. (apps/web/app/api/media/image/lib/managed-image-generation.ts:527-640) |
| Subscription | Same plan gate as any image generation: pro, max, max_15x, team, team_premium, enterprise. (packages/contracts/types/src/billing-catalog.ts:356) |
| Limits and metering | Each variation is a new job with its own reservation and cost estimate; Retry-After blocks new versions until it expires. (apps/web/features/chat/components/ImageGenerationCard.tsx:549-552) |
| Feature flags | canUseImages capability flag on the server. (apps/web/app/api/media/image/generate/route.ts:100-111) |
| Model compatibility | Variation needs a model whose admission says supports_edit. |
| Provider restrictions | Image jobs run on openai or google only. (apps/web/db/neon/0226_durable_image_generation_jobs.sql:41-42) |
| Local mode | Not available: all edit and variation calls go to our servers. The CLI reuse flag also needs Managed mode. (apps/cli/src/cloud/client.rs:361-371) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model cannot edit | Variation and Select area are disabled with an explanation; describing a change generates a fresh image from a combined prompt and says the original is not modified. | apps/web/features/chat/components/ImageGenerationCard.tsx:738-745,830-836 |
| Retry-After active | All revise actions are disabled until the wait ends. | apps/web/features/chat/components/ImageGenerationCard.tsx:549-552 |
| Remix of a non-image | Throws 'Only an image can be remixed.' | apps/web/features/library/lib/library-chat-handoff.ts:75-78 |
| Remix file too large to read | Message tells the person to download and add it from the device. | apps/web/features/library/lib/library-chat-handoff.ts:25-27 |
| Existing unsent draft | Remix appends the prompt after the parked draft. | apps/web/features/library/lib/library-chat-handoff.ts:57-63; test 'keeps an unsent new-chat draft and adds the remix prompt after it' |
| Image model no longer available (Mobile) | Remix keeps the current model instead of the old one. | apps/mobile/src/features/library/index.tsx:546-549 |
| No earlier image (CLI) | 'There is no earlier image on this device to reuse yet.' | apps/cli/src/cloud/image.rs:801-805 |
| Chrome | not handled in the code | apps/extension/src/side_panel.ts searched |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/library/lib/__tests__/library-chat-handoff.test.ts`: Staging bytes once, remix with prompt and image mode, keeping an unsent draft, refusing non-images, unreadable file.
- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Revise panel: no fake edit label on a fresh generation, ratio normalising, Retry-After gating, no provider diagnostics on failure.
- `apps/mobile/__tests__/wholeImageEdit.test.ts`: Mobile whole-image edit requests (titles not read).
- `apps/mobile/__tests__/ImageChangeSheet.test.tsx`: Mobile change sheet (titles not read).
- `apps/mobile/__tests__/LibraryActionMenus.test.tsx`: Library action menus incl. Remix (titles not read).
- `apps/web/features/library/components/__tests__/LibraryView.test.tsx`: Web Library host (titles not read).
- `apps/cli/src/cloud/image.rs`: Rust unit tests; none by title cover --again (searched titles).

**Test scenarios**

- **Web variation**
  1. Generate an image with an edit-capable model.
  2. Hover, press 'New version', press 'Variation'.
  - Expected: New image appears; versions control shows 2 / 2; the earlier version is reachable with Previous version.
- **Variation on a non-edit model**
  1. Generate with a model that cannot edit.
  2. Open the revise panel.
  - Expected: Variation button is disabled with the tooltip; no request is sent.
- **Library remix**
  1. Open Library, Images tab.
  2. Item menu, Remix on an older image.
  - Expected: New chat opens in image mode with the image attached, prompt filled and model and ratio set; nothing is sent until Send.
- **Mobile variation**
  1. Open a generated image full screen.
  2. Tap 'Change this image', then 'Make a variation'.
  - Expected: A new image message appears; failure shows Retry.
- **CLI again**
  1. agi image 'a red bicycle' --aspect 1:1
  2. agi image --again --aspect 16:9
  3. agi image --last
  - Expected: Second image uses the same prompt and a 16:9 ratio; --last shows the new settings.

**Where to look when it fails**

- Response code image_job_not_retryable, unsupported_aspect_ratio.
- image_generation_jobs.operation column shows variation or edit.
- CLI: agi image --last prints the remembered prompt, model, settings and files.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/044-image-generation-studio.md](../../70-qa/test-plans/web/044-image-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/044-image-generation-studio.md](../../70-qa/test-plans/desktop/044-image-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/044-image-generation-studio.md](../../70-qa/test-plans/mobile/044-image-generation-studio.md)
- CLI: [70-qa/test-plans/cli/044-image-generation-studio.md](../../70-qa/test-plans/cli/044-image-generation-studio.md)

## 10. Gaps and dependencies

- **No share-prompt recipe action anywhere.** Affects: All apps. Evidence: No symbol found; brief S44.32 status missing everywhere. Work needed: Define the recipe format and add a copy or share action.
- **No image-to-video action from a generated image.** Affects: Web, Desktop, Mobile. Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3887 is composer-only. Work needed: Add an Animate action that opens video mode with the image as first frame.
- **Brief says Mobile has no variation or reuse prompt; code has both in the viewer sheet and Library Remix. The brief is out of date.** Affects: Documentation and testers. Evidence: apps/mobile/src/features/image/components/ImageChangeSheet.tsx:211; apps/mobile/src/features/library/index.tsx:630. Work needed: Correct the brief rows S44.20, S44.24.
- **CLI cannot make a variation of an image.** Affects: CLI. Evidence: apps/cli/src/cloud/image.rs:41-56. Work needed: Add a source-image option to the CLI request.
- **Reused settings omit quality and size on Web and Mobile.** Affects: Web, Mobile. Evidence: apps/web/features/library/lib/library-chat-handoff.ts:87. Work needed: Store quality and size on the job or asset and carry them.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- F044-09
- F044-10
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-execution-boundaries
- SYS-shared-ui-and-design

## Unknown

- Whether Library Remix sends the attached image as an edit source or as a reference on the next Send (composer code not traced).
- Whether Chrome extension supports any reuse of an image prompt.
- Whether Desktop Electron shows Remix: it loads the hosted web app, which does; not run.
- Exact scope of mobile wholeImageEdit and ImageChangeSheet tests (titles not read).
