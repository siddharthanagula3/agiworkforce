---
id: "F045-03"
type: "feature"
title: "Paint the area to change (mask and selection)"
aliases: ["Select area", "Select an area", "Select the area to change", "Mask edit", "Add mask / Replace mask", "Region selector", "Inpaint (request operation)", "Edit an area of this image (mobile)", "Brush selection", "Clear selection", "Selection overlay", "S45.05 S45.06 S45.07 S45.08 S45.09 S45.10 S45.11"]
area: "45 Image editor"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S45.05", "S45.06", "S45.07", "S45.08", "S45.09", "S45.10", "S45.11"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "F045-01", "provider:openai", "file:apps/web/app/api/media/image/lib/edit-mask.ts", "api:POST /api/media/image/generate", "plan:pro", "plan:max", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F045-03 Paint the area to change (mask and selection)

The person paints the part of a picture to change, then describes the change; only the painted part is redrawn. Web has a fixed brush, a 50 percent tint, Clear selection, and an optional PNG mask upload. Mobile has brush size, undo, redo and clear. No eraser or invert on either. CLI and Chrome: none.

Area: [45. Image editor](README.md). Requirement items: [S45.05](../../10-requirements/capabilities/045-image-editor.md#s4505), [S45.06](../../10-requirements/capabilities/045-image-editor.md#s4506), [S45.07](../../10-requirements/capabilities/045-image-editor.md#s4507), [S45.08](../../10-requirements/capabilities/045-image-editor.md#s4508), [S45.09](../../10-requirements/capabilities/045-image-editor.md#s4509), [S45.10](../../10-requirements/capabilities/045-image-editor.md#s4510), [S45.11](../../10-requirements/capabilities/045-image-editor.md#s4511).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Builds a PNG mask where painted pixels are transparent and sends it with the source as operation inpaint (apps/web/features/chat/components/RegionSelector.tsx:46-62; apps/web/app/api/media/image/lib/edit-mask.ts:84-103).

**Why it exists.** The brief wants a region tool, brush, overlay and clear (doc: knowledge-base/data/area-briefs/045-image-editor.md S45.05, S45.06, S45.09, S45.10).

**Who uses it.** People who want to change one part of a picture and keep the rest.

**Problems it solves**

- A text-only edit may change the whole picture.
- Making a precise mask by hand in another tool.

**Use cases**

- Paint a person's shirt and type 'make it red'.
- Paint a sign and type 'remove the text'.
- Attach a mask exported from a design tool.
- On a phone, paint with a finger over a generated picture.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): revision panel buttons 'Select area' (becomes 'Cancel selection'), 'Clear selection', 'Add mask' (becomes 'Replace mask') (ImageGenerationCard.tsx:755-821).
- Web composer: with one photo attached, the operation menu has an item 'Select an area' ('Paint over the part to redraw') that opens a dialog titled 'Select the area to change' with buttons Cancel and 'Use this area' (ChatComposerNew.tsx:6413-6430; apps/web/features/chat/components/Composer/ImageMaskDialog.tsx:100-125). The 'Mask edit' operation appears only once a second file is attached (ChatComposerNew.tsx:1377-1383).
- Mobile: full-screen image viewer, control 'Edit an area of this image' opens a screen titled 'Select the area to change' with 'Brush size', Undo, Redo, 'Clear selection', 'Describe the change' and an 'Edit' button (apps/mobile/src/features/chat/components/ImageFullScreen.tsx:647; apps/mobile/src/features/image/components/ImageAreaEditor.tsx).
- CLI, Chrome, VS Code: not available.

**Before you start**

- An editing-capable model (web supports_edit; mobile server edit model list).
- Plan with image generation.
- Mobile: AGI Cloud mode, signed in, the image has a recorded editing model (chat/[id].tsx:2063-2090).

**Screens and controls**

- Web: painting canvas with aria-label 'Paint over the area to change', a fixed round brush of 5 percent of image width (minimum 8 pixels), tint at 50 percent opacity (RegionSelector.tsx:5, 37, 110-111).
- Web: hint text 'Paint over the part to change, then describe the change. The area guides the edit, so nearby content may change too. Check the rest of the image.' (ImageGenerationCard.tsx:730).
- Web: 'Add mask' file input aria-label 'Mask image'; tooltip 'Attach a PNG the same size as this image, transparent where the model should redraw' (ImageGenerationCard.tsx:795-818).
- Mobile: slider range 2 to 15 percent of width, default 5 percent (ImageAreaEditor.tsx:35-37).

**Journey**

1. Open the revision panel on the image (web) or the full-screen image (mobile).
2. Press Select area (web) or 'Edit an area of this image' (mobile).
3. Paint over the part to change. The paint shows as a tint.
4. Optionally Clear selection (web) or Undo, Redo, Clear (mobile).
5. Type the change.
6. Press the send arrow (web) or Edit (mobile).
7. Wait for the new version.

**What the person sees and gets**

- Tinted overlay on the image before sending.
- Web error under the image in role alert; typed change and attached mask are kept if the revision fails (test ImageGenerationCard.test.tsx:494).
- Server refusals with plain messages: mask must be a PNG; needs transparency; size mismatch 'The mask is WxH but the image is WxH. They must be the same size.' (edit-mask.ts:84-103), all before any charge (managed-image-generation.ts:653-668 comes before reservation at 745).
- Mobile errors: 'This image is too large to edit an area of.', 'The selected area could not be prepared.' (ImageAreaEditor.tsx:151-160).

**Settings**

- None for brush on web (fixed).
- Mobile brush size slider only.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web paint to mask: black fill with painted pixels cut out so they are transparent, exported as selection.png (RegionSelector.tsx:46-62).
- Web revision panel sends operation inpaint when a mask (painted or attached) exists, otherwise edit (ImageGenerationCard.tsx:502-546).
- Web composer dialog prepares an upright source and the mask, then sets the operation to inpaint (ImageMaskDialog.tsx:70-97; ChatComposerNew.tsx:1385-1396).
- Server checks mask is PNG, has transparency, same size as source (edit-mask.ts:84-103).
- Schema requires mask only for inpaint or outpaint and requires one for inpaint (managed-media.ts:143-158).
- Mobile paints, undoes, redoes, clears, builds a PNG mask and sends inpaint (ImageAreaEditor.tsx; apps/mobile/src/features/image/services/imageMask.ts:183-237; chat/[id].tsx:2098-2112).
- Clear selection works on web and mobile (ImageGenerationCard.tsx:788; ImageAreaEditor.tsx Clear selection).

**Incomplete**

- Brief marks web brush selection and overlay missing, but code has a brush and a tint overlay: record the conflict (RegionSelector.tsx:37, 111).
- Brief marks mobile painting missing; code has it (ImageAreaEditor.tsx).
- Web brush size is fixed; no eraser; no invert on any app (RegionSelector.tsx:5; ImageAreaEditor.tsx has no invert).
- Web Clear selection exists only while painting in the panel; the composer dialog has no clear control (ImageMaskDialog.tsx:100-125).
- Mask only guides: the UI warns nearby content may change (ImageGenerationCard.tsx:730).

**Present but disconnected or switched off**

- Mask controls are hidden and replaced with 'This model cannot edit an existing image' when the model cannot edit (ImageGenerationCard.tsx:836).
- 'Add mask' is disabled while painting, and Select area is disabled while a mask file is attached (ImageGenerationCard.tsx:770-815).

**Not available**

- Eraser, invert, brush-size control on web; eraser and invert on mobile.
- CLI and Chrome: no mask. Desktop: only through the hosted web app.

## 4. Required behaviour

**Established requirements**

- The user selects a region and only that region is edited. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S45.05)
- The user paints with a brush; changes brush size; erases; sees an overlay before sending; clears in one action; inverts where offered. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S45.06, S45.11)
- The mask must be a PNG with transparency and the source's size; it is refused with a clear message before any charge. (source: apps/web/app/api/media/image/lib/edit-mask.ts:84-103; managed-image-generation.ts:653-668)
- The UI tells the person nearby content may also change. (source: apps/web/features/chat/components/ImageGenerationCard.tsx:730)

**Acceptance criteria**

1. Painting on web shows a tint over the image and Clear selection removes it.
2. Sending a painted selection sends operation inpaint with a PNG mask whose painted pixels are transparent.
3. A JPEG mask returns 422 invalid_mask_image with the PNG message.
4. A PNG mask with no alpha returns the transparency message.
5. A mask of different size returns the size message naming both sizes.
6. No charge is made when the mask is refused.
7. On mobile the brush slider changes stroke width, Undo and Redo step, Clear empties in one tap, and Edit stays disabled until an area and a prompt exist.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The tint colour on web follows the theme's primary colour [inferred from RegionSelector.tsx:34].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an eraser and a brush-size control on web; reuse the mobile stroke model.
- [proposed] Add Invert to both apps.
- [proposed] Add Clear selection to the composer dialog.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | RegionSelector | `apps/web/features/chat/components/RegionSelector.tsx` | Canvas painting, 50 percent tint, PNG mask export |
| component | ImageMaskDialog | `apps/web/features/chat/components/Composer/ImageMaskDialog.tsx` | Composer dialog: paint, make source upright, return mask and source |
| component | ImageGenerationCard EditPanel | `apps/web/features/chat/components/ImageGenerationCard.tsx:395-880` | Select area, Clear selection, Add mask, edit send |
| component | ChatComposerNew mask wiring | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1385` | Adds mask as second attachment and sets inpaint |
| service | editMaskProblem | `apps/web/app/api/media/image/lib/edit-mask.ts:84` | Server mask checks (PNG, alpha, size) |
| schema | mask rules in request schema | `packages/contracts/cloud-contracts/src/managed-media.ts:143-158` | mask only for inpaint or outpaint; required for inpaint |
| service | generateManagedImage mask step | `apps/web/app/api/media/image/lib/managed-image-generation.ts:653` | Returns invalid_mask_image 422 before reservation |
| service | generateWithOpenAIImage | `apps/web/app/api/media/image/lib/image-generation-provider.ts:459` | Attaches the mask to the provider edit call |
| hook | imageEditFields | `apps/web/lib/hooks/useMediaGeneration.ts:356` | Maps maskImageBase64 to mask_image |
| component | ImageAreaEditor | `apps/mobile/src/features/image/components/ImageAreaEditor.tsx` | Mobile painting screen with brush slider, undo, redo, clear |
| service | imageMask (mobile) | `apps/mobile/src/features/image/services/imageMask.ts` | Builds the PNG mask from strokes; hasMaskArea |
| component | ImageFullScreen | `apps/mobile/src/features/chat/components/ImageFullScreen.tsx:647` | Entry control 'Edit an area of this image' |
| screen | chat/[id] handleEditImageArea | `apps/mobile/app/(app)/chat/[id].tsx:2098` | Sends inpaint with mask through the turn runner |
| service | runImageGenerationTurn mask field | `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:315` | Adds mask_image to the request |
| store | imageEditAdmissions | `apps/mobile/stores/chat/imageEditAdmissions.ts` | Which models the server says can edit |
| service | imageEditSupport | `apps/mobile/stores/chat/imageEditSupport.ts` | Whether a message's image is editable |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person paints on a canvas; strokes are drawn at the image's native size. | device | RegionSelector.tsx:30-45; ImageAreaEditor.tsx |
| On pointer release the canvas exports a PNG mask (black with the painted area cut out). | device | RegionSelector.tsx:46-62 |
| Source and mask are read as base64 and sent with operation inpaint. | device and our servers | ImageGenerationCard.tsx:449-466 |
| Server resolves bytes, checks the upload hashes and structure, then checks the mask. | our servers | managed-image-generation.ts:525-668 |
| The provider receives the mask and source in a multipart edit call and returns the image. | outside service | image-generation-provider.ts:459-520 |
| Result stored and shown as a new version; the earlier image stays in version history. | our servers | WebChatPage.tsx:3465-3487 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Mask PNG and its hash | Inline in the request; the job stores a mask hash (and an asset id if the mask was a stored asset) (managed-image-generation.ts:769-785) | Job row only | Mask bytes retention: unknown |
| Painted strokes | Component state only | No | Lost when the panel closes |

**Models and providers.** The mask is passed only to the openai adapter's edit endpoint (image-generation-provider.ts:500-505). Models on other image APIs are refused for any edit (managed-image-generation.ts:685-697).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; adult gate; same as F045-01. |
| Permissions | Mask and source belong to the caller's workspace when passed as assets (managed-image-generation.ts:540-560). |
| Subscription | Plan with image_generation (billing-catalog.ts:356); Free refused (media-image-generate.test.ts:786). |
| Limits and metering | Mask counts inside the 9 MB per-image cap (managed-media.ts:80-84). Reservation happens only after the mask passes (managed-image-generation.ts:653-757). Mobile refuses a mask larger than the cap (ImageAreaEditor.tsx:151-156). |
| Feature flags | Web: model supports_edit. Mobile: FEATURES.imageGen, per-user imageGen, cloud mode (chat/[id].tsx:2063-2070). |
| Model compatibility | Edit-capable image API only (managed-media.ts:69). The mobile control is hidden unless the server lists an editing model that made the image (chat/[id].tsx:2068-2090). |
| Provider restrictions | openai adapter only. |
| Local mode | Mobile: not available in Local mode (mayEditImages requires cloud; chat/[id].tsx:2063). Web: no Local editing path found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Nothing painted | 'Use this area' is disabled on web; mobile Edit stays disabled until an area and a prompt exist. | ImageMaskDialog.tsx:118-122; ImageAreaEditor.tsx ready flag |
| Preparing | Spinner 'Preparing the selection' on web; mobile loading indicator. | ImageMaskDialog.tsx:118-122 |
| Prepare failed | 'The image could not be prepared for a masked edit. Try another image.' | ImageMaskDialog.tsx:22 |
| Phone photo rotated by metadata | Dialog re-renders the source upright so mask and source sizes match. | ImageMaskDialog.tsx:24-43 |
| Cancel while preparing | Result discarded; no mask adopted. | ImageMaskDialog.tsx:62-97; test lines 74-111 |
| Revision fails | Typed text and mask kept for retry. | ImageGenerationCard.test.tsx:494 |
| Mask refused by server | Plain message in the error line, no charge. | edit-mask.ts:84-103 |
| Touch | Canvas uses touch-none and pointer capture so a finger paints instead of scrolling. | RegionSelector.tsx:111 |
| Keyboard-only paint | Not handled in the code; the canvas needs a pointer. | not handled in the code |
| Offline | Not handled specially. | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/__tests__/ImageMaskDialog.test.tsx`: Adopt mask when preparation completes, nothing on cancel, error for the live session (lines 64-124).
- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Inpaint sent once a mask is attached (569); mask kept on failure (494); mask control hidden when the model cannot edit (593).
- `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx`: Mask edit offered only once a second image is attached (3593, by test name).
- `apps/web/e2e/chat-attachment-refusal-and-image-edit.spec.ts`: A mask edit carries the second image as the mask (line 140).
- `apps/mobile/__tests__/ImageAreaEditorClear.test.tsx`: Clear empties the area in one tap and Redo brings it back (line 55).
- `apps/web/__tests__/api/media-image-generate.test.ts`: Denylisted mask refused (1764). Mask rule messages (editMaskProblem, invalid_mask_image): no test found.

**Test scenarios**

- **Paint on web panel**
  1. Open 'New version' panel.
  2. Press Select area, paint.
  3. Type a change and send.
  - Expected: Request has operation inpaint and mask_image PNG; the new version appears.
- **Wrong-size mask**
  1. Add mask with a PNG of another size.
  - Expected: 422 message naming both sizes; no usage reserved.
- **JPEG as mask**
  1. Add mask with a JPEG.
  - Expected: 'The mask must be a PNG image.'
- **Mobile area edit**
  1. Cloud chat, open a generated image full screen.
  2. Edit an area of this image, paint, Undo, Redo, Clear, paint again.
  3. Type a change, press Edit.
  - Expected: Inpaint turn starts; new image arrives; Retry offered on failure.
- **Composer dialog**
  1. Attach one photo, open the operation menu, choose Select an area.
  2. Paint, press Use this area.
  - Expected: Photo and mask attached, operation shows Mask edit.
- **Non-editing model**
  1. Open the panel for an image from a non-editing model.
  - Expected: Text 'This model cannot edit an existing image'; no mask controls.

**Where to look when it fails**

- Error code invalid_mask_image with param mask_image.
- Mobile message 'The selected area could not be prepared.'
- Table image_generation_jobs mask hash column (maskImageSha256 in the job plan).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/045-image-editor.md](../../70-qa/test-plans/web/045-image-editor.md)
- Desktop: [70-qa/test-plans/desktop/045-image-editor.md](../../70-qa/test-plans/desktop/045-image-editor.md)
- Mobile: [70-qa/test-plans/mobile/045-image-editor.md](../../70-qa/test-plans/mobile/045-image-editor.md)

## 10. Gaps and dependencies

- **Brief says web brush selection and overlay are missing, but the code has a brush and a tint.** Affects: Web, Desktop. Evidence: RegionSelector.tsx:37, 111. Work needed: Correct the brief; add brush-size control.
- **Brief says mobile has no painting; code has full painting with undo, redo, clear and size.** Affects: Mobile. Evidence: ImageAreaEditor.tsx; ImageFullScreen.tsx:647. Work needed: Correct the brief; add device verification.
- **Eraser and invert are missing everywhere.** Affects: Web, Desktop, Mobile. Evidence: no eraser or invert in RegionSelector.tsx or ImageAreaEditor.tsx. Work needed: Design and build both.
- **No test covers the mask checks in edit-mask.ts.** Affects: Web, Desktop. Evidence: grep found no test naming editMaskProblem or invalid_mask_image. Work needed: Add server unit tests.
- **No test for the web RegionSelector itself (the desktop screen-capture RegionSelector test is a different component).** Affects: Web. Evidence: apps/desktop/src/features/screen-capture/RegionSelector.test.tsx is separate. Work needed: Add a component test.
- **Mask is a hint; nearby content can change.** Affects: All. Evidence: ImageGenerationCard.tsx:730. Work needed: Consider a post-edit blend that keeps unmasked pixels.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- F045-01
- provider:openai
- file:apps/web/app/api/media/image/lib/edit-mask.ts
- api:POST /api/media/image/generate
- plan:pro
- plan:max
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- SYS-model-catalog-and-routing

## Unknown

- Whether the provider really leaves unmasked pixels unchanged: the UI itself warns they may change; no test records it.
- Mask bytes retention.
- How mobile masks behave on very large images beyond the 9 MB cap check.
- Test results: none recorded.
- Why the brief marks web brush and overlay missing while code has them (stale brief or different meaning).
