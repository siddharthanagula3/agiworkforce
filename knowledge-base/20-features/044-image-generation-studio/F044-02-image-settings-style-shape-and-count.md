---
id: "F044-02"
type: "feature"
title: "Image settings: style, shape and count"
aliases: ["Style presets", "Style menu", "Aspect ratio selector", "Select aspect ratio", "Transparent background", "Transparent", "Size", "Quality", "Count", "-n / --count", "--aspect", "--size", "--quality", "--transparent"]
area: "44 Image-generation studio"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S44.03", "S44.07", "S44.08", "S44.09", "S44.10", "S44.11"]
depends_on: ["F044-01", "SYS-model-catalog-and-routing", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "surface:web", "surface:mobile", "surface:cli", "mode:cloud", "plan:premium"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F044-02 Image settings: style, shape and count

Settings that shape an image before it is made: a style preset (Web only, added to the prompt text), aspect ratio (Web, Mobile, CLI), transparent background (Web, Mobile, CLI, only on editing-capable models), and size, quality and count (CLI only). Chrome has none.

Area: [44. Image-generation studio](README.md). Requirement items: [S44.03](../../10-requirements/capabilities/044-image-generation-studio.md#s4403), [S44.07](../../10-requirements/capabilities/044-image-generation-studio.md#s4407), [S44.08](../../10-requirements/capabilities/044-image-generation-studio.md#s4408), [S44.09](../../10-requirements/capabilities/044-image-generation-studio.md#s4409), [S44.10](../../10-requirements/capabilities/044-image-generation-studio.md#s4410), [S44.11](../../10-requirements/capabilities/044-image-generation-studio.md#s4411).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person choose the shape and look of the output. Style presets append a phrase to the prompt. Aspect ratio, transparency, size, quality and count are sent as fields of the shared image request. (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6344-6350; packages/contracts/cloud-contracts/src/managed-media.ts:92-109)

**Why it exists.** Different uses need different shapes (a phone wallpaper, a logo on a clear background). The server validates the choices against what the chosen model can do, so each app only offers what works. (apps/web/features/chat/lib/imageGenerationOptions.ts:63-92; apps/web/app/api/media/image/lib/managed-image-generation.ts:483-504)

**Who uses it.** Anyone using image mode on a plan with image generation; CLI users get the widest set of options.

**Problems it solves**

- Getting a portrait or widescreen image instead of a square.
- Getting a logo or sticker without a background.
- Getting a consistent look without writing the style words each time.
- Scripting several images at set quality from the terminal.

**Use cases**

- On Web, open Style and pick 'Watercolor' to add 'soft watercolor painting on textured paper' to the prompt.
- On Mobile, pick 'Aspect ratio' 9:16 in Add to chat, then send a prompt for a phone wallpaper.
- In the CLI, run agi image "logo" --aspect 1:1 --transparent -n 2 --quality hd.
- On Web with an editing-capable model, press 'Transparent' to return a clear background.

## 2. User experience

**Where to find it**

- Web and Desktop, image mode only: 'Style' button (aria-label 'Add a style to the prompt', menu 'Image style') (ChatComposerNew.tsx:6324-6360); aspect button (aria-label 'Select aspect ratio', menu 'Image aspect ratio'), hidden when the selected model is a free promotional model (ChatComposerNew.tsx:6271-6320); 'Transparent' toggle (ChatComposerNew.tsx:6439-6453).
- Mobile: Add to chat sheet, with Create image active: section 'Aspect ratio' (shown when the model has more than one option) and row 'Transparent background' with hint 'Return the image without a background' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1003-1043).
- CLI: flags --aspect, --size, --quality (standard or hd), --count/-n, --transparent, plus --save-defaults (apps/cli/src/lib.rs:1118-1155).
- Chrome: not available.

**Before you start**

- Image mode on (F044-01).
- Transparent: the selected model must support editing (Web) or reference images (Mobile) (ChatComposerNew.tsx:1370-1372; AddToChatSheet.tsx:271-272,1033).
- CLI count above 1: the model must allow it (apps/cli/src/cloud/image.rs:101-117).

**Screens and controls**

- Web style menu: eight presets Photorealistic, Illustration, Watercolor, Oil painting, 3D render, Anime, Line art, Pixel art, each with its phrase (apps/web/features/chat/lib/imageGenerationOptions.ts:95-104).
- Web aspect menu labels: Auto, Square 1:1, Portrait 2:3, Portrait 3:4, Portrait 4:5, Story 9:16, Tall 9:21, Landscape 3:2, Landscape 4:3, Landscape 5:4, Widescreen 16:9, Ultrawide 21:9, narrowed to the ratios of the selected model's image API (imageGenerationOptions.ts:48-92).
- Web 'Transparent' toggle button with aria-pressed and title 'Return the image on a transparent background'.
- Mobile rows from getImageAspectOptionsForModel and a transparency row.
- CLI flags; --aspect conflicts with --size (apps/cli/src/lib.rs:1118).

**Journey**

1. 1. Enter image mode.
2. 2. Web: open Style and pick a preset; its phrase is appended to the prompt text (a comma is added if text exists) (ChatComposerNew.tsx:6344-6350).
3. 3. Open the aspect menu and pick a ratio; changing the model resets a ratio the new model cannot draw (ChatComposerNew.tsx:6795-6800).
4. 4. Turn on Transparent if shown.
5. 5. Send. The request carries aspect_ratio and transparent_background; style text is just part of prompt (useMediaGeneration.ts:507-514).
6. 6. CLI: pass flags and send; the CLI checks ratio and count against the model's published limits before posting (apps/cli/src/cloud/image.rs:101-117,856-858).

**What the person sees and gets**

- The aspect button shows the chosen label.
- The server answers an unsupported ratio with 400 unsupported_aspect_ratio and lists supported ones (managed-image-generation.ts:488-503).
- Too many images: 400 unsupported_image_count with max_images (managed-image-generation.ts:441-461).
- CLI local failure text: '<model> does not make <ratio> images. It supports <list>.' and '<model> makes at most N images per request.' (apps/cli/src/cloud/image.rs:101-117).
- CLI summary line shows the settings used (apps/cli/src/cloud/image.rs:671-697).

**Settings**

- CLI saved defaults (--save-defaults, --clear-defaults) (apps/cli/src/lib.rs:1161-1167).
- Mobile chat view store: imageAspectRatio (default '1:1') and imageTransparentBackground (apps/mobile/stores/chat/chatViewStore.ts:84,369).
- Web: composer state only.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web style presets, aspect menu and Transparent toggle (ChatComposerNew.tsx:6271-6453).
- Mobile aspect ratio and transparency rows, and the request resolver that drops an unsupported ratio or a transparency request on a model that cannot edit (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:86-106,276-283).
- CLI size, quality, count, aspect and transparent flags map to request fields (apps/cli/src/cloud/image.rs:277-304,857-871).
- Server validates every field and supports transparency on the openai image API for generate and edit (apps/web/app/api/media/image/lib/image-generation-provider.ts:445-545).
- Server maps the optional size to a ratio when no ratio is given (image-generation-provider.ts:232-257).

**Incomplete**

- Style preset is only prompt text; the server field style (max 200 characters) is accepted and stored but not applied: the Google adapter takes it as an unused parameter and the openai adapter has none (apps/web/app/api/media/image/lib/image-generation-provider.ts:570,851,873; packages/contracts/cloud-contracts/src/managed-media.ts:97).
- Transparency is applied only on the openai image API; on other APIs the setting is not offered in Web or Mobile (ChatComposerNew.tsx:6439; image-generation-provider.ts:456-545).
- Quality changes only the openai call and the cost estimate; the Google adapter ignores it (image-generation-provider.ts:347-352,476).
- Web aspect list omits 1:4, 1:8, 4:1 and 8:1, which the contract and the Gemini API accept (imageGenerationOptions.ts:48-92 vs managed-media.ts:19-35).
- Desktop (Tauri internal) sends a fixed size 1024x1024, n 1 and standard quality (apps/desktop/src/api/cloudApi.ts:460-468).

**Present but disconnected or switched off**

- Mobile transparency check passes the model provider to supportsManagedMediaImageEdit, which expects an image API name; it works only because the provider and API both read 'openai' (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:86-94) [inferred].

**Not available**

- Web, Desktop and Mobile: size, quality and count are not offered; the Web hook allows a size option but the composer never sets it (useMediaGeneration.ts:101; ChatComposerNew.tsx:3762-3770).
- Mobile and CLI: no style preset.
- Chrome extension: none of these settings.

## 4. Required behaviour

**Established requirements**

- User picks a style preset (photo, illustration, etc.) that changes the generated look. (source: S44.03 (brief))
- User picks the aspect ratio from ratios the model supports. (source: S44.07 (brief))
- User picks the output size or resolution. (source: S44.08 (brief; CLI only))
- User picks a quality level (standard or HD). (source: S44.09 (brief; CLI only))
- User picks how many images to generate and sees all of them. (source: S44.10 (brief; CLI only))
- User asks for a transparent background on the generated image. (source: S44.11 (brief))

**Acceptance criteria**

1. On Web in image mode, choosing a style preset appends its phrase to the message text and does not add a separate field.
2. With an OpenAI-API model selected, the Web aspect menu offers only Auto, 1:1, 2:3 and 3:2.
3. Posting aspect_ratio 3:4 for an openai-API model returns 400 unsupported_aspect_ratio.
4. Posting n above the model maximum returns 400 unsupported_image_count; n above 4 is rejected by the schema.
5. The Transparent toggle is absent when the selected model cannot edit.
6. In the CLI, --aspect and --size together are rejected by the argument parser.
7. In the CLI, a count above the model's published maximum fails locally before any request.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Transparency on a model that cannot do it should be refused or hidden, never silently ignored [inferred from the UI gating at ChatComposerNew.tsx:6439].
- Where a control exists but the server ignores its value (style field, quality on Google), that is a defect not a requirement [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer aspect ratio and count in all apps from the model's published aspect_ratios and max_images.
- [proposed] Either apply the style field on the server or remove it from the contract.
- [proposed] Add a style picker to Mobile and CLI using the same preset list.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | IMAGE_STYLE_PRESETS | `apps/web/features/chat/lib/imageGenerationOptions.ts` | Eight presets with label and phrase (lines 95-104). |
| config | IMAGE_ASPECT_OPTIONS and IMAGE_PICKER_RATIOS_BY_API | `apps/web/features/chat/lib/imageGenerationOptions.ts` | Web aspect labels and per-API allowed ratios (lines 48-92). |
| hook | getImageAspectOptionsForModel / isImageAspectSupported | `packages/contracts/types/src/model-catalog.ts` | Shared catalog ratio helpers used by Mobile (lines 2431-2510). |
| component | ChatComposerNew style, aspect and transparent controls | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web UI (lines 6271-6453) and send (3762-3770). |
| schema | Request fields aspect_ratio, size, style, n, quality, transparent_background | `packages/contracts/cloud-contracts/src/managed-media.ts` | Contract limits (lines 92-109). |
| service | resolveProviderImageAspectRatio, maxImagesPerRequest | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Per-API ratio sets, count limit (1 for gemini, 4 otherwise), size fallback (lines 203-262). |
| service | generateManagedImage count and ratio checks | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Rejects unsupported count and ratio (lines 441-504). |
| service | OpenAI transparent branch | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Sends background transparent and PNG output (lines 456-545). |
| hook | useMediaGeneration.generateImage | `apps/web/lib/hooks/useMediaGeneration.ts` | Sends aspect_ratio and transparent_background (lines 507-514). |
| component | AddToChatSheet aspect and transparency rows | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Mobile controls (lines 291-297,1003-1043). |
| service | resolveMobileImageGenerationRequest | `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts` | Validates ratio and transparency (lines 86-106). |
| store | chatViewStore image settings | `apps/mobile/stores/chat/chatViewStore.ts` | imageAspectRatio and imageTransparentBackground (lines 84,369). |
| command | agi image flags | `apps/cli/src/lib.rs` | --aspect, --size, --quality, --transparent, --count (lines 1118-1155). |
| service | CLI request builder and model limits | `apps/cli/src/cloud/image.rs` | ImageGenerationRequest, unsupported_for_model, parse_aspect_ratio (lines 28-52,101-117,443-465,857-871). |
| store | CLI image.json | `apps/cli/src/cloud/image.rs` | Saved defaults and last image (lines 30,723-760). |
| endpoint | GET /api/media/availability | `apps/web/app/api/media/availability/route.ts` | Publishes aspect_ratios, max_images and supports_edit per model (managed-media.ts:249-266). |
| service | cloudApi.generateCloudImage (internal Tauri desktop) | `apps/desktop/src/api/cloudApi.ts` | Fixed 1024x1024, n 1, standard (lines 453-470). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The client reads the model's allowed ratios and edit support from the catalog or the availability endpoint and shows only valid controls. | device | apps/web/features/chat/lib/imageGenerationOptions.ts:105-125; apps/web/app/api/media/availability/route.ts:12-20 |
| A style preset is appended to the composer text on the device before send. | device | ChatComposerNew.tsx:6344-6350 |
| The request carries aspect_ratio, transparent_background (and size, quality, n for the CLI). | device and our servers | useMediaGeneration.ts:507-514; apps/cli/src/cloud/image.rs:857-865 |
| The server rejects an unsupported ratio or count with a coded 400 before reserving usage. | our servers | managed-image-generation.ts:441-504 |
| The provider adapter maps ratio to its native size; the openai adapter adds transparent background and PNG; the Google adapter ignores quality, style and transparency. | outside service | image-generation-provider.ts:456-545,570,846-881 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| The chosen settings of each job (ratio, quality, legacy size, transparency, style) | plan column of table image_generation_jobs | Server held | Unknown |
| CLI saved defaults | image.json on the device | No | Until --clear-defaults |
| Mobile ratio and transparency choices | store:chatViewStore (in memory) | No | Reset by resetMediaChoice after a send (apps/mobile/src/features/image/startImageCreation.ts:187-189) |

**Models and providers.** Allowed ratios are decided per image API in the catalog entry (gemini: 14 ratios, imagen: 5, openai: 3, stability: 9) (apps/web/app/api/media/image/lib/image-generation-provider.ts:203-227). Count maximum is 1 for the gemini API and 4 for others (image-generation-provider.ts:228-230).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Same as F044-01: signed-in account. |
| Permissions | None specific to these settings; the same organization and model policy checks apply (managed-image-generation.ts:395-401). |
| Subscription | Same plan gate as F044-01 (image_generation capability); no setting has its own plan rule (packages/contracts/types/src/billing-catalog.ts:356). |
| Limits and metering | Count up to 4 by schema and per-model maximum; quality hd raises the cost estimate for the openai provider (image-generation-provider.ts:347-352); n multiplies the estimate (managed-image-generation.ts:703). Monthly image quota is null (model-catalog.ts:1292). |
| Feature flags | None found for these settings beyond the image feature flags in F044-01. |
| Model compatibility | Transparency and edits need the openai image API (packages/contracts/cloud-contracts/src/managed-media.ts:69-75). Ratios depend on the image API. Count depends on the image API. |
| Provider restrictions | Style and quality have no effect on provider google; transparency is only sent to provider openai (image-generation-provider.ts:456-545,570). |
| Local mode | Not available: image generation needs Cloud on every app (see F044-01). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model changed after a ratio was chosen | Web resets the ratio to Auto if the new model cannot draw it; Mobile falls back to the first allowed option. | ChatComposerNew.tsx:6795-6800; AddToChatSheet.tsx:295-298 |
| Promotional (free) image model selected | Aspect menu is hidden and Transparent is not shown. | ChatComposerNew.tsx:6271,1370-1372 |
| Ratio not supported by the server | 400 unsupported_aspect_ratio with the supported list; Web card stops the loader without replaying a ratio the model rejects. | managed-image-generation.ts:488-503; ImageGenerationCard.test.tsx:74 |
| Count above model maximum | 400 unsupported_image_count; CLI refuses locally. | managed-image-generation.ts:441-461; apps/cli/src/cloud/image.rs:101-117 |
| Only size sent (older clients) | Server derives a ratio from the size. | image-generation-provider.ts:232-257 |
| Accessibility | Transparent toggle exposes aria-pressed; menus have labels. Mobile rows use labelled rows. Other screen-reader details not verified. | ChatComposerNew.tsx:6442; AddToChatSheet.tsx:1033-1043 |
| Offline, cancel, timeout | Same as F044-01; no setting-specific handling found (not handled in the code beyond F044-01). | Searched ChatComposerNew.tsx image controls and AddToChatSheet.tsx image rows; no handling found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx`: Exact ratios sent unchanged, unsupported ratios removed and stale choice reset when the openai API is selected (lines 2859-3100).
- `apps/web/__tests__/api/media-image-generate.test.ts`: Unsupported aspect ratio message, n above 4, style accepted as free text, OpenAI 3:4 refused before reservation, legacy size mapping, hd quality.
- `packages/contracts/cloud-contracts/src/__tests__/managed-media.test.ts`: Defaults, invented ratio rejected, unknown fields rejected.
- `packages/contracts/cloud-contracts/src/__tests__/managed-media.image-edit.test.ts`: Transparent flag carried; edit API decided by the catalog image API.
- `apps/mobile/__tests__/ChatTabImageReferences.test.tsx`: Transparent background handed to the generation turn (line 282).
- `apps/mobile/__tests__/AddToChat.test.tsx`: Add to chat media rows (aspect and transparency rows not confirmed by name).
- `apps/cli/src/cloud/image.rs`: Request carries only accepted fields; model default; output naming (inline tests, lines 1552-1993).

**Test scenarios**

- **Style adds text**
  1. Web image mode, type 'a cat'.
  2. Open Style, choose Anime.
  - Expected: Message becomes 'a cat, anime style, cel shading'; the request has no style field.
- **Ratio list follows the model**
  1. Select an openai-API model, open the aspect menu.
  2. Select a gemini-API model, open it again.
  - Expected: First menu shows 4 entries; second shows the larger list.
- **Reject bad ratio**
  1. POST aspect_ratio 3:4 for an openai-API model.
  - Expected: 400 unsupported_aspect_ratio with supported_aspect_ratios.
- **CLI count**
  1. Run agi image --list-models, pick a model with max 1.
  2. Run agi image "x" -n 3 --model <that model>.
  - Expected: Local refusal 'makes at most 1 image per request.' and no request.
- **Transparent**
  1. Pick an editing-capable model, turn on Transparent, send.
  - Expected: Returned image is a PNG with a clear background (visual check; provider behaviour not asserted by any test I opened).

**Where to look when it fails**

- Error codes unsupported_aspect_ratio, unsupported_image_count, invalid_request_error with param.
- image_generation_jobs.plan column holds the applied settings.
- CLI: agi image --last prints the last settings.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/044-image-generation-studio.md](../../70-qa/test-plans/web/044-image-generation-studio.md)
- Desktop: [70-qa/test-plans/desktop/044-image-generation-studio.md](../../70-qa/test-plans/desktop/044-image-generation-studio.md)
- Mobile: [70-qa/test-plans/mobile/044-image-generation-studio.md](../../70-qa/test-plans/mobile/044-image-generation-studio.md)
- CLI: [70-qa/test-plans/cli/044-image-generation-studio.md](../../70-qa/test-plans/cli/044-image-generation-studio.md)

## 10. Gaps and dependencies

- **Size, quality and count are not offered on Web, Desktop or Mobile.** Affects: Web, Desktop, Mobile. Evidence: brief S44.08-S44.10 (cli done only); ChatComposerNew.tsx:3762-3770. Work needed: Add controls from the model's published limits, or mark them out of scope.
- **Style preset missing on Mobile and CLI; on Web it is only text.** Affects: Mobile, CLI. Evidence: brief S44.03. Work needed: Share the preset list and add a picker.
- **style field accepted but not applied; quality ignored by the Google adapter.** Affects: All clients that send them. Evidence: image-generation-provider.ts:570,873. Work needed: Apply or remove, and document per-model support.
- **Web ratio picker omits four ratios the server accepts.** Affects: Web, Desktop. Evidence: imageGenerationOptions.ts:48-92 vs managed-media.ts:19-35. Work needed: Decide whether to expose or document the omission.
- **Chrome extension has none of these settings.** Affects: Chrome extension. Evidence: brief S44.03-S44.11. Work needed: Follows the decision on an image mode there.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- F044-01
- SYS-model-catalog-and-routing
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- surface:web
- surface:mobile
- surface:cli
- mode:cloud
- plan:premium

## Unknown

- Whether Mobile AddToChat tests assert the aspect and transparency rows (not opened beyond names).
- Whether any app is planned to expose size, quality or count.
- Retention of the stored job settings.
