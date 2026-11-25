---
id: "F045-11"
type: "feature"
title: "Operations no app offers"
aliases: ["Operations no app offers", "Object add/remove", "Background replacement", "Lighting", "Style change", "Text in images", "Photo restoration", "Colorization", "S45.12", "S45.13", "S45.14", "S45.20", "S45.21", "S45.25", "S45.26", "S45.27"]
area: "45 Image editor"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S45.12", "S45.13", "S45.14", "S45.20", "S45.21", "S45.25", "S45.26", "S45.27"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "mode:cloud", "provider:openai", "api:POST /api/media/image/generate", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "F045-07", "F045-08", "F045-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F045-11 Operations no app offers

Adding or removing objects, replacing a background, changing lighting or style, putting legible text in an image, restoring and colourising photos have no dedicated controls on any app. A person can describe such a change in the edit text, and the model decides what happens. Diagrams and charts are routed to artifacts instead of pictures.

Area: [45. Image editor](README.md). Requirement items: [S45.12](../../10-requirements/capabilities/045-image-editor.md#s4512), [S45.13](../../10-requirements/capabilities/045-image-editor.md#s4513), [S45.14](../../10-requirements/capabilities/045-image-editor.md#s4514), [S45.20](../../10-requirements/capabilities/045-image-editor.md#s4520), [S45.21](../../10-requirements/capabilities/045-image-editor.md#s4521), [S45.25](../../10-requirements/capabilities/045-image-editor.md#s4525), [S45.26](../../10-requirements/capabilities/045-image-editor.md#s4526), [S45.27](../../10-requirements/capabilities/045-image-editor.md#s4527).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Names editing jobs that the brief marks not applicable to every app. They are reachable only as free text in the ordinary edit or generate prompt.

**Why it exists.** The brief lists them so the product states plainly that no special control or code path exists for them.

**Who uses it.** People who describe a change in words in image mode or in a card's revise box.

**Problems it solves**

- A person can still try the change without a separate tool.

**Use cases**

- Type 'remove the person on the left' in the revise box.
- Ask for a new background in the composer's edit prompt.
- Ask for a poster with a title line.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): image mode composer prompt with an attached picture ('Edit' operation) or the card's revise panel field 'Describe a change to generate a new version...' (ImageGenerationCard.tsx:862).
- Mobile: image mode prompt with attached photos (AddToChatSheet.tsx:994; ImagesScreen.tsx:453 'Describe an image').
- No separate buttons for any listed operation.

**Before you start**

- As F045-07: image plan, edit-capable model for edits on pictures, Cloud.

**Screens and controls**

- Free-text prompt only. Related but separate controls exist: 'Mask edit' ('Redraw only where the second image is masked'), 'Select an area', 'Transparent' toggle and the aspect menu (ChatComposerNew.tsx:285,6425,6439).

**Journey**

1. Attach a picture or open a card.
2. Describe the change in words.
3. Send and wait for the new image.
4. Check the result; try a new version if it is wrong.

**What the person sees and gets**

- A new image card; no guarantee the requested operation happened because the model decides.

**Settings**

- Image model, aspect ratio, Transparent toggle.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The text of the revise box is joined to the earlier prompt as '<prompt>. Edit: <text>' and sent as an edit when the model supports it, as a text-only revision otherwise (ImageGenerationCard.tsx:490-497 region).
- Prompts and attached uploads pass moderation; edits of an uploaded photo get an extra rule for sexualized subjects (managed-image-generation.ts:279-290).
- A diagram, chart or vector request is sent to the Artifacts system rather than a picture model, so exact text in diagrams comes from artifacts (ChatComposerNew.tsx:3703-3712).

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- nothing found

**Not available**

- Dedicated controls, tests and special code paths for object add or remove, background replacement, lighting, colour or style transform, legible text generation, restoration and colourisation on every app (brief; no code found).

## 4. Required behaviour

**Established requirements**

- Object addition, object removal, background replacement, lighting adjustment, colour or style transformation, text-bearing image generation, photo restoration and colourisation are listed as not applicable on every app. (source: S45.12, S45.13, S45.14, S45.20, S45.21, S45.25, S45.26, S45.27 (brief))
- Do not describe web search, memory, image generation and similar abilities as intrinsic model capabilities; they depend on a route or harness. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. No button or menu on Web or Mobile is labelled for any of these operations.
2. Typing a change in the revise box runs an ordinary edit and returns an image.
3. Product copy does not promise guaranteed object removal, restoration or legible text.
4. A diagram prompt produces an artifact, not a raster picture.
5. The brief's 'not applicable' status stays until a control and tests exist.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Result quality for these jobs depends on the provider model and is not guaranteed [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] State in the image help copy that these are done by describing the change.
- [proposed] If a dedicated control is wanted later, build it on the mask edit path (inpaint) and test it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | EditPanel handleDescribeEdit | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Free-text revise field that builds the combined prompt and edit. |
| component | ChatComposerNew image mode | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Image prompt and operation menu; routes diagrams to artifacts (lines 3703-3712). |
| component | RegionSelector | `apps/web/features/chat/components/RegionSelector.tsx` | Select a region to redraw; separate feature, related for object or background changes. |
| service | edit-mask | `apps/web/app/api/media/image/lib/edit-mask.ts` | Checks that a mask fits the source (editMaskProblem). |
| service | generateManagedImage | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Moderation, upload checks and job creation for every edit. |
| service | generateWithOpenAIImage | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Single provider edit call used for any free-text edit. |
| service | routeVisualRequest | `apps/web/features/chat/components/artifacts/structuredVisualArtifact.ts` | Sends diagrams and charts to artifacts (imported at ChatComposerNew.tsx:228). |
| service | resolveMobileImageGenerationRequest | `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts` | Mobile prompt admission; no operation-specific branches. |
| service | runImageGenerationTurn | `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts` | Mobile edit turn; sends operation 'edit' only. |
| schema | MANAGED_MEDIA_IMAGE_OPERATIONS | `packages/contracts/cloud-contracts/src/managed-media.ts` | Lists generate, edit, inpaint, outpaint, variation only; no operation for the listed jobs. |
| component | Images feature page | `apps/web/app/features/images/page.tsx` | Public wording of what image mode offers. |
| command | CLI image command | `apps/cli/src/cloud/image.rs` | Text-to-image from the terminal; no edit. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person writes the change in the prompt or revise box. | device | ImageGenerationCard.tsx:862 |
| Client sends an ordinary edit or generate request. | our servers | useMediaGeneration.ts:356-363 |
| Server moderates the prompt and any uploaded picture, reserves usage and creates a job. | our servers | managed-image-generation.ts:279-330,520-830 |
| Provider model interprets the words and returns an image. | outside service | image-generation-provider.ts:478-530 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Prompt text and result image | Chat message metadata and managed media storage | Yes with the chat | unknown |

**Models and providers.** The model alone decides how a free-text change is carried out; the code has no special handling per operation. Edits need a catalog model with edit support (managed-media.ts:62).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. |
| Permissions | As F045-07. |
| Subscription | As image generation: pro, max, max_15x, team, team_premium, enterprise tiers (billing-catalog.ts:341,356). |
| Limits and metering | Each attempt is one metered generation; prompt up to 4000 characters (managed-media.ts:97). |
| Feature flags | canUseImages. |
| Model compatibility | Text-only models cannot change an existing picture; on the card they get a re-generation from the combined prompt. |
| Provider restrictions | Edit route is the single provider API listed in managed-media.ts:62. |
| Local mode | Not available; Cloud only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model cannot edit | Card regenerates from 'prompt. Edit: change' without the earlier picture | ImageGenerationCard.tsx:490-497 |
| Prompt refused by safety rules | Request refused before any charge | managed-image-generation.ts:279-330 |
| Result not as asked | not handled in the code; the person can make a new version | No quality check found |
| Diagram or chart request | Routed to artifact instead of an image | ChatComposerNew.tsx:3703-3712 |
| Offline, timeout, cancel | As F045-07 and F045-08 | runImageGenerationTurn.ts:121,239 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Card edit flows (free-text revise and edit of the version on screen); no operation-specific tests.
- `apps/web/__tests__/api/media-image-generate.test.ts`: Image generate route behaviour; nothing specific to the listed operations found.

**Test scenarios**

- **Remove object by words**
  1. Open a generated image's 'New version'.
  2. Type 'remove the object on the left' and send.
  - Expected: An ordinary new version returns; it may or may not match; no special control involved.
- **Background by words**
  1. Attach a photo in image mode, Edit operation.
  2. Type 'replace the background with a beach'.
  - Expected: One edit request with operation 'edit'.
- **No dedicated controls**
  1. Inspect composer and card menus on Web and Mobile.
  - Expected: No control named for any listed operation.
- **Diagram request**
  1. In image mode ask for a flowchart.
  - Expected: An artifact is produced, not a raster picture.
- **Text-only model**
  1. Pick a text-only image model, open 'New version' and type a change.
  - Expected: Regeneration from the combined prompt without the picture.

**Where to look when it fails**

- Server log 'Image edit source could not be resolved' (managed-image-generation.ts:577).
- Moderation events with surface 'managed-image' (managed-image-generation.ts:300-320).
- Table image_generation_jobs for the operation recorded per job.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No guarantee or test that free-text edits perform object, background, lighting, style, text, restoration or colour work.** Affects: All apps with image mode. Evidence: No code path or tests for these operations.. Work needed: Decide whether to add evaluated prompts or dedicated controls.
- **No guidance text telling people to describe such changes.** Affects: Web, Mobile. Evidence: Hints in AddToChatSheet.tsx:994 and operation menu mention only edit, variation, mask edit.. Work needed: Add help copy if wanted.
- **CLI and Chrome have no edit at all.** Affects: CLI, Chrome. Evidence: apps/cli/src/cloud/image.rs; no image code in apps/extension. Work needed: Product decision.
- **Brief marks these as not applicable, so no tracking row exists to promote them if the product decides to offer them.** Affects: Planning. Evidence: Brief status 'not applicable anywhere'. Work needed: Update the brief status if a decision is made.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- mode:cloud
- provider:openai
- api:POST /api/media/image/generate
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- F045-07
- F045-08
- F045-09

## Unknown

- How well the provider model carries out each described change; no evaluation file was found.
- Whether product copy elsewhere promises any of these operations.
- Whether Desktop Electron adds image controls beyond the hosted web app.
- Whether the Library 'open in editing state' path (S45.02) changes how these requests are formed (not read).
