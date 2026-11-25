---
id: "F045-06"
type: "feature"
title: "Extend and reframe"
aliases: ["Aspect ratio button (revision panel)", "Reframe", "Extend / outpaint", "Another shape (mobile)", "Make it <ratio> (mobile)", "operation: outpaint", "S45.16 S45.19"]
area: "45 Image editor"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S45.16", "S45.19"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "provider:openai", "F045-01", "F045-03", "plan:pro", "plan:max", "file:apps/web/features/chat/lib/imageGenerationOptions.ts", "api:POST /api/media/image/generate", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F045-06 Extend and reframe

On web, the revision panel's Aspect ratio button pads the picture to a new ratio and asks the model to draw the new border, so the scene extends. If the model cannot edit, it regenerates from the prompt. Mobile's 'Another shape' always makes a new image from the same description. CLI and Chrome: none.

Area: [45. Image editor](README.md). Requirement items: [S45.16](../../10-requirements/capabilities/045-image-editor.md#s4516), [S45.19](../../10-requirements/capabilities/045-image-editor.md#s4519).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Extends a picture past its edges or changes its shape. Web builds a bigger canvas with the picture centred and a mask that covers only the new border, then sends operation outpaint (apps/web/features/chat/lib/imageGenerationOptions.ts:240-298).

**Why it exists.** The brief wants outpainting and reframing of an existing image (doc: knowledge-base/data/area-briefs/045-image-editor.md S45.16, S45.19).

**Who uses it.** People who need the same scene in another shape (banner, story, square).

**Problems it solves**

- Cropping loses content; this adds content instead.
- Re-asking for a new picture changes the scene.

**Use cases**

- Turn a square picture into 16:9 for a slide.
- Make a landscape picture portrait for a story.
- On mobile, ask for the same description in another shape.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): 'Revise this image' panel, the top button with aria-label 'Aspect ratio' and a menu of ratios (ImageGenerationCard.tsx:603-690).
- Mobile: 'Change this image' sheet, section 'Another shape', buttons 'Make it <shape>' (ImageChangeSheet.tsx:222-243).
- CLI: 'agi image --aspect' for new images only (apps/cli/src/lib.rs:1115-1117). Chrome: not available.

**Before you start**

- A generated image with a recorded prompt (mobile hides shapes without a prompt, ImageChangeSheet.tsx:51-52).
- Web: an editing model for the true extend; otherwise a regeneration.
- Plan with image generation.

**Screens and controls**

- Web ratio menu lists only ratios the model supports (imageGenerationOptions.ts:73-106).
- Mobile note: 'Makes a new image in that shape from the same description.' (ImageChangeSheet.tsx:22).

**Journey**

1. Open the panel on the image.
2. Press Aspect ratio and pick a ratio.
3. Web: if the new ratio is within 1 percent of the current one, only the setting changes.
4. Otherwise the browser pads the picture and marks the new border as the area to draw.
5. Wait; the card updates and the previous image is kept as an earlier version.

**What the person sees and gets**

- Role status 'Generating a new version of this image', then 'The new version of this image is ready'.
- Error line: 'This browser cannot prepare the image for reframing.' or 'Could not prepare this image for reframing. Try again.' (ImageGenerationCard.tsx:481-491).
- Model that cannot edit: hint 'Describing a change generates a new image from the updated description. The image above is not modified.' (ImageGenerationCard.tsx:733).

**Settings**

- Ratio list depends on the image API of the model (imageGenerationOptions.ts:73-106).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web reframe: pad, mask the border and send outpaint when the model can edit and the ratio is not Auto (ImageGenerationCard.tsx:471-499; imageGenerationOptions.ts:257-298).
- Same ratio within 1 percent only sets the label (imageGenerationOptions.ts:240; ImageGenerationCard.tsx:478-481).
- Unsupported browser (no createImageBitmap or no canvas context) returns a clear message (imageGenerationOptions.ts:258, 281-285).
- Non-editing models regenerate from the prompt and the original is not changed (ImageGenerationCard.tsx:728-734; handleAspectChange falls through to runRevision without an edit).
- Schema allows a mask for outpaint (managed-media.ts:146-150).
- Mobile 'Another shape' sends a plain generation with the saved prompt and the new ratio, replayable on Retry (wholeImageEdit.ts:46-56).

**Incomplete**

- Web only pads, never crops: a ratio narrower than the current one adds top and bottom space (imageGenerationOptions.ts:268-274).
- Always centres the picture; no control for where it sits.
- Picking Auto regenerates from the prompt rather than editing (ImageGenerationCard.tsx:475).

**Present but disconnected or switched off**

- The composer deliberately does not offer outpaint because it cannot author a canvas and mask (ChatComposerNew.tsx:275-281).
- Ratio button disabled while generating or retry-blocked (ImageGenerationCard.tsx:631-640).

**Not available**

- Mobile true outpaint: not available; 'Another shape' is a new image (ImageChangeSheet.tsx:22).
- CLI and Chrome: not available. Desktop: only via hosted web.

## 4. Required behaviour

**Established requirements**

- The user extends an image beyond its borders and the new area is generated to match. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S45.16)
- The user changes the framing or aspect ratio of an existing image and gets the same scene reframed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S45.19)
- A ratio within 1 percent of the current shape does nothing new. (source: apps/web/features/chat/lib/imageGenerationOptions.ts:240, 262-266)
- A model that cannot edit regenerates from the prompt and does not change the original. (source: apps/web/features/chat/components/ImageGenerationCard.tsx:733)

**Acceptance criteria**

1. On web, choosing 16:9 on a square image sends operation outpaint with a source canvas wider than the original and a mask.
2. The mask is opaque over the original area and transparent over the border (check the PNG).
3. Choosing the current ratio sends nothing and updates the label.
4. On a non-editing model, choosing a ratio makes a new image and the earlier image stays in version history.
5. If the browser cannot decode the image, the stated message shows and nothing is sent.
6. On mobile, 'Make it <shape>' creates a new image with the saved prompt and the new ratio; Retry replays it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The mask built here is opaque on the original area and transparent on the new border only if it follows the rule that painted equals transparent; the code fills the original area black on a transparent canvas, which fits that rule [inferred from imageGenerationOptions.ts:287-293 and edit-mask.ts:92].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let the person place the picture on the canvas (left, centre, right).
- [proposed] Offer a real extend on mobile using the same canvas and mask method.
- [proposed] Offer a crop when the ratio is narrower.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | buildReframeEdit | `apps/web/features/chat/lib/imageGenerationOptions.ts:257` | Pads the picture, builds the border mask, returns edit, same-ratio or unsupported |
| service | aspect options by model | `apps/web/features/chat/lib/imageGenerationOptions.ts:73` | Ratios each image API supports |
| component | EditPanel handleAspectChange | `apps/web/features/chat/components/ImageGenerationCard.tsx:471` | Chooses edit, same-ratio, or regeneration |
| component | ImageGenerationCard aspect menu | `apps/web/features/chat/components/ImageGenerationCard.tsx:620-690` | Aspect ratio button and menu |
| screen | handleRegenerateImageInPlace | `apps/web/features/chat/pages/WebChatPage.tsx:3402` | Runs the revision on the existing message and keeps earlier versions |
| hook | useMediaGeneration | `apps/web/lib/hooks/useMediaGeneration.ts:440` | Sends operation outpaint with source and mask |
| schema | operation enum and mask rule | `packages/contracts/cloud-contracts/src/managed-media.ts:49-60, 143-158` | Allows outpaint with an optional mask |
| service | generateManagedImage | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Validates and runs the edit |
| service | generateWithOpenAIImage | `apps/web/app/api/media/image/lib/image-generation-provider.ts:459` | Sends source and mask to the provider |
| service | edit-mask checks | `apps/web/app/api/media/image/lib/edit-mask.ts:84` | Requires PNG, alpha, same size as the padded source |
| component | ImageChangeSheet shapes | `apps/mobile/src/features/image/components/ImageChangeSheet.tsx:222` | Mobile 'Another shape' list |
| service | imageShapeOptions and wholeImageEditRequest | `apps/mobile/src/features/image/wholeImageEdit.ts:29-69` | Mobile shape list and the reshape request |
| screen | chat/[id] handleEditImage | `apps/mobile/app/(app)/chat/[id].tsx:2114` | Runs the mobile reshape |
| service | runImageGenerationTurn replayOnRetry | `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:146-170` | Lets Retry repeat a reshape |
| command | agi image --aspect | `apps/cli/src/lib.rs:1115` | CLI ratio for new images only |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a ratio in the panel. | device | ImageGenerationCard.tsx:471 |
| Browser fetches the displayed image, decodes it, draws it centred on a larger canvas and draws the mask for the border. | device | imageGenerationOptions.ts:257-297 |
| Both canvases are encoded as PNG base64 and sent as source and mask with operation outpaint. | device and our servers | imageGenerationOptions.ts:244-256, 298; useMediaGeneration.ts:500-520 |
| Server runs the same checks as F045-01 and F045-03 and calls the provider edit endpoint. | our servers | managed-image-generation.ts:525-757 |
| Provider returns the extended image; the card shows it and appends the old image to versions. | outside service | image-generation-provider.ts:507-530; WebChatPage.tsx:3465-3487 |
| Mobile reshape sends a plain generation with the same prompt and the new ratio. | device and our servers | wholeImageEdit.ts:46-56 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Padded source and border mask | Canvases in the browser, then inline request bytes | No | Browser memory only; server retention unknown |
| New image and earlier versions | media_assets plus message metadata imageVersions | With the conversation | As F045-02 |

**Models and providers.** Extend needs an edit-capable image API; today only openai (managed-media.ts:69). Other models take the regenerate path. The picker lists only the ratios each model supports (imageGenerationOptions.ts:73-106).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; same gates as F045-01. |
| Permissions | Same as F045-01. |
| Subscription | Plan with image_generation (billing-catalog.ts:356). |
| Limits and metering | One reservation per revision (managed-image-generation.ts:745). Padded images count against the 9 MB inline cap (managed-media.ts:80-84). |
| Feature flags | Web: supports_edit decides edit versus regenerate (ImageGenerationCard.tsx:420). Mobile: FEATURES.imageGen and the per-user setting. |
| Model compatibility | Ratios depend on the image API; unsupported ratios are not offered (imageGenerationOptions.ts:73-106). |
| Provider restrictions | openai edit adapter for extend. |
| Local mode | Mobile Local: blocked. Web Local: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Same ratio | Only the label changes. | imageGenerationOptions.ts:262-266 |
| Browser lacks image bitmap support | Message 'This browser cannot prepare the image for reframing.' | ImageGenerationCard.tsx:481-484 |
| Image cannot be fetched | 'The generated image could not be read for reframing.' | imageGenerationOptions.ts:249-251 |
| Reframe fails | The previous shape stays selected and the error shows. | ImageGenerationCard.test.tsx:508 |
| Auto | Regenerates from the prompt; no edit. | ImageGenerationCard.tsx:475 |
| Model cannot edit | Regeneration; original unchanged. | ImageGenerationCard.tsx:733 |
| Generating | Menu items disabled. | ImageGenerationCard.tsx:652-668 |
| Menu keyboard | Menu uses menuitemradio and keyboard handling. | ImageGenerationCard.tsx:648-662, 590-597 |
| Mobile no prompt | No shapes offered. | ImageChangeSheet.tsx:51 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Previous shape stays selected when a reframe fails (508); loader stops after failure without replaying an unsupported ratio (74).
- `apps/mobile/__tests__/wholeImageEdit.test.ts`: Shape list excludes the current shape (44); a new shape is a plain generation that Retry replays (102).
- `apps/mobile/__tests__/ImageChangeSheet.test.tsx`: Offers other shapes and says they start a new image (102); no shapes without a description (117).
- `apps/web/features/chat/lib/imageGenerationOptions.ts`: No test file for buildReframeEdit was found by name; coverage unknown.

**Test scenarios**

- **Square to widescreen**
  1. Generate a square image with an editing model.
  2. Open the panel, Aspect ratio, choose 16:9.
  - Expected: Request operation outpaint; result is wider and the original sits centred.
- **Same ratio**
  1. Choose the ratio the image already has.
  - Expected: No request; label updates.
- **Non-editing model**
  1. Open the panel for an image from such a model, pick a ratio.
  - Expected: A new image is generated; earlier one kept in versions.
- **Mobile shape**
  1. Open the image full screen, 'Change this image', pick 'Make it <shape>'.
  - Expected: A new image in that shape from the same description; Retry repeats it.
- **Reframe failure**
  1. Block the image fetch, then pick a ratio.
  - Expected: Error line shown; previous ratio remains.

**Where to look when it fails**

- Error 'The mask is WxH but the image is WxH' would show if padded canvases disagree.
- Message metadata imageGenAspect.
- Table image_generation_jobs.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/045-image-editor.md](../../70-qa/test-plans/web/045-image-editor.md)
- Desktop: [70-qa/test-plans/desktop/045-image-editor.md](../../70-qa/test-plans/desktop/045-image-editor.md)
- Mobile: [70-qa/test-plans/mobile/045-image-editor.md](../../70-qa/test-plans/mobile/045-image-editor.md)

## 10. Gaps and dependencies

- **Mobile has no true extend; 'Another shape' makes a new picture.** Affects: Mobile. Evidence: ImageChangeSheet.tsx:22; wholeImageEdit.ts:46-56. Work needed: Build canvas and mask on device or accept the difference.
- **Web always centres and only pads.** Affects: Web, Desktop. Evidence: imageGenerationOptions.ts:268-274. Work needed: Add placement and crop.
- **No test found for buildReframeEdit.** Affects: Web. Evidence: no test file by name. Work needed: Add unit tests.
- **CLI and Chrome cannot reframe an existing picture.** Affects: CLI, Chrome. Evidence: apps/cli/src/cloud/image.rs has no source option. Work needed: Decide scope.
- **Brief marks crop and resize missing.** Affects: All. Evidence: doc: knowledge-base/data/area-briefs/045-image-editor.md S45.17, S45.18. Work needed: Separate decision.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- provider:openai
- F045-01
- F045-03
- plan:pro
- plan:max
- file:apps/web/features/chat/lib/imageGenerationOptions.ts
- api:POST /api/media/image/generate
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Whether the provider fills the border so it matches the original.
- Test coverage of buildReframeEdit: none found by file name.
- Memory limits for very large images in the browser canvas.
- Whether Desktop Electron differs from hosted web.
- Test results: none recorded.
