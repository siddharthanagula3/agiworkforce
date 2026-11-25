---
id: "F045-05"
type: "feature"
title: "Transparent background"
aliases: ["Transparent", "Transparent background", "Background removal (brief wording)", "Alpha-channel preservation", "transparent_background (request field)", "--transparent (CLI)", "S45.15 S45.33"]
area: "45 Image editor"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S45.15", "S45.33"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "provider:openai", "plan:pro", "plan:max", "F045-01", "file:apps/web/app/api/media/image/lib/image-generation-provider.ts", "api:POST /api/media/image/generate", "table:media_assets", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F045-05 Transparent background

A generation option that asks the model for an image on a see-through background, returned as a PNG. Web has a 'Transparent' pill in image mode, mobile has a 'Transparent background' row, the CLI has --transparent. It is not a separate background-removal tool, and the code never inspects the result's transparency.

Area: [45. Image editor](README.md). Requirement items: [S45.15](../../10-requirements/capabilities/045-image-editor.md#s4515), [S45.33](../../10-requirements/capabilities/045-image-editor.md#s4533).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Sends transparent_background true so the provider is asked for a transparent PNG (apps/web/app/api/media/image/lib/image-generation-provider.ts:484, 544).

**Why it exists.** The brief wants background removal and alpha preservation (doc: knowledge-base/data/area-briefs/045-image-editor.md S45.15, S45.33). The code implements this as a request option, not as a removal tool.

**Who uses it.** People making logos, icons, stickers and cut-outs.

**Problems it solves**

- Getting a subject without a backdrop for slides and design work.

**Use cases**

- Generate a logo on transparent.
- Attach a product photo and ask for the product alone on transparent.
- CLI: draw an icon with --transparent.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): the pill button 'Transparent' with tooltip 'Return the image on a transparent background', shown in image mode when the selected model can edit (ChatComposerNew.tsx:6439-6453).
- Mobile: Add to chat sheet, row 'Transparent background' with hint 'Return the image without a background', shown in image mode for an editing model (AddToChatSheet.tsx:1034-1045).
- CLI: 'agi image --transparent' (value needs an equals sign: --transparent=false turns a saved default off) (apps/cli/src/lib.rs:1127-1130).
- Chrome and VS Code: not available.

**Before you start**

- Image mode, an edit-capable model on web and mobile, a plan with image generation.

**Screens and controls**

- Toggle with aria-pressed on web (ChatComposerNew.tsx:6442).
- Selectable row on mobile.
- CLI flag, saved defaults supported (apps/cli/src/lib.rs:1127-1160).

**Journey**

1. Switch to image mode.
2. Turn on Transparent.
3. Type the prompt, optionally attach a photo.
4. Send.
5. Download or share the PNG.

**What the person sees and gets**

- The toggle shows pressed state.
- Result is a stored image; download uses the image's real type for the file extension (ImageGenerationCard.tsx:86-100).

**Settings**

- Mobile keeps the choice in the chat view store (AddToChatSheet.tsx:222-223).
- CLI: --save-defaults and --clear-defaults (lib.rs:1143).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web composer sends transparent only when the model can edit (ChatComposerNew.tsx:3763-3768) and passes it through the request options (imageGenerationOptions.ts:177-182; useMediaGeneration.ts:513).
- Server accepts transparent_background (managed-media.ts:109) and puts it in the job plan (managed-image-generation.ts:776).
- The openai adapter sends background transparent for edits and background transparent plus PNG output for new images (image-generation-provider.ts:484, 544).
- Mobile applies the option when the model is edit-capable (resolveMobileImageGenerationRequest.ts:86-95) and remembers it for retry (runImageGenerationTurn.ts:174-178).
- CLI passes transparent_background to the same route (apps/cli/src/lib.rs:7790; apps/cli/src/platform/runtime/tool_catalog.rs:1270).

**Incomplete**

- No code checks that the returned picture really has transparency; the PNG alpha check (pngHasAlpha) validates masks only (edit-mask.ts:30-40).
- The web revision panel (New version) never sends transparency: buildEdit and handleRegenerateImageInPlace pass no flag (ImageGenerationCard.tsx:449-466; WebChatPage.tsx:3410-3414).
- The brief marks mobile missing but a toggle exists.
- The edit call sets background transparent but not an explicit PNG output format, unlike the generation call (image-generation-provider.ts:484 vs 544); effect: unknown.
- Server does not check that the model is an editing model: it stores the flag from the request (managed-image-generation.ts:776) and the google adapter does not read it (image-generation-provider.ts:869-876).

**Present but disconnected or switched off**

- The pill and row are hidden for models that cannot edit (ChatComposerNew.tsx:6439; AddToChatSheet.tsx:1034).

**Not available**

- Removing the background of an existing photo as a dedicated tool: not built; only the edit path with the option.
- Chrome: not available. CLI: only on new images, not on an existing picture (no source option in apps/cli/src/cloud/image.rs).

## 4. Required behaviour

**Established requirements**

- User removes the background and gets the subject on a transparent background. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S45.15)
- A transparent image keeps its transparency through editing, storage and download. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S45.33)
- The option is shown only for models that can edit. (source: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6439; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1034)

**Acceptance criteria**

1. With an editing model, Transparent sends transparent_background true; with a non-editing model the control is absent.
2. A generation with Transparent returns a PNG whose alpha channel has transparent pixels (check file bytes).
3. Stored and downloaded copies keep the alpha channel and the .png extension.
4. A retry replays the same transparent setting (mobile retry memory keeps it).
5. The panel New version keeps or loses transparency as decided and documented.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Stored bytes are written as returned by the provider with no re-encode [inferred from image-job-executor.ts:352-380], so alpha should survive; no test proves it.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a post-generation alpha check and tell the person if the result has none.
- [proposed] Send transparency from the panel when the source image has alpha.
- [proposed] A dedicated 'Remove background' action on an existing picture.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Transparent pill | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6439` | Web toggle |
| service | resolveImageGenerationRequestOptions | `apps/web/features/chat/lib/imageGenerationOptions.ts:158` | Adds transparentBackground to request options |
| hook | generateImage body | `apps/web/lib/hooks/useMediaGeneration.ts:500-520` | Sends transparent_background |
| schema | transparent_background field | `packages/contracts/cloud-contracts/src/managed-media.ts:109` | Request field, default false |
| service | job plan | `apps/web/app/api/media/image/lib/managed-image-generation.ts:776` | Stores the flag in the job plan |
| service | job executor | `apps/web/app/api/media/image/lib/image-job-executor.ts:301` | Passes the flag to the edit context and provider call |
| service | generateWithOpenAIImage | `apps/web/app/api/media/image/lib/image-generation-provider.ts:459` | Sends background transparent |
| service | generateImages | `apps/web/app/api/media/image/lib/image-generation-provider.ts:846` | Routes by provider; google adapter ignores the flag |
| service | edit-mask pngHasAlpha | `apps/web/app/api/media/image/lib/edit-mask.ts:30` | Alpha check for masks only |
| component | AddToChatSheet transparent row | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1034` | Mobile toggle |
| service | transparencyFor | `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:86` | Keeps the flag only for edit-capable models |
| service | runImageGenerationTurn | `apps/mobile/src/features/chat/actions/runImageGenerationTurn.ts:303` | Sends transparent_background and keeps it for retry |
| command | agi image --transparent | `apps/cli/src/lib.rs:1127` | CLI flag |
| command | CLI image settings | `apps/cli/src/lib.rs:7790` | Maps the flag into the cloud image call |
| config | image_generation tool schema | `apps/cli/src/platform/runtime/tool_catalog.rs:1270` | Tool argument transparent_background |
| component | download filename by type | `apps/web/features/chat/components/ImageGenerationCard.tsx:86` | Keeps the real extension when saving |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person turns on the option; the composer includes it only for an editing model. | device | ChatComposerNew.tsx:3763-3768 |
| Request carries transparent_background true to the managed route. | device and our servers | useMediaGeneration.ts:513 |
| Server stores it in the job plan and the executor passes it on. | our servers | managed-image-generation.ts:776; image-job-executor.ts:301, 334 |
| The adapter asks the provider for a transparent PNG. | outside service | image-generation-provider.ts:484, 544 |
| The returned bytes are stored as an asset with their content type. | our servers | image-job-executor.ts:368-375 |
| Download saves the file with its type's extension. | device | ImageGenerationCard.tsx:86-110 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| The flag | job plan in image_generation_jobs | Server | Retention unknown |
| The transparent PNG | table media_assets and object storage | Library on every app | Library delete rules |

**Models and providers.** Only the openai adapter reads the flag (image-generation-provider.ts:484, 544). The google adapter takes no such argument (image-generation-provider.ts:869-876), so a model on that API would ignore it [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; same gates as F045-01. |
| Permissions | Same as F045-01. |
| Subscription | Plan with image_generation (billing-catalog.ts:356). The option itself has no extra charge rule found. |
| Limits and metering | Same reservation as F045-01. Extra cost for transparency: none found in the code. |
| Feature flags | Mobile FEATURES.imageGen; web supports_edit for showing the control. |
| Model compatibility | Shown only for edit-capable models. Mobile checks the catalog provider value against the edit list (resolveMobileImageGenerationRequest.ts:91). |
| Provider restrictions | openai adapter. |
| Local mode | Mobile Local: image generation blocked (resolveMobileImageGenerationRequest.ts:252). Web Local: unknown. CLI: the command calls the hosted route, so it needs the cloud account [inferred from apps/cli/src/cloud/image.rs name]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model switched to non-editing | Toggle hidden; web send drops the flag (condition at line 3766). | ChatComposerNew.tsx:3766 |
| Provider returns a URL not bytes | Server fetches the URL when storage is configured. | image-job-executor.ts:372-376 |
| Provider output without alpha | Not handled in the code; no check. | not handled in the code |
| Retry on mobile | Remembered request keeps transparentBackground. | runImageGenerationTurn.ts:174-178 |
| CLI false | --transparent=false turns a saved default off. | apps/cli/src/lib.rs:1127 |
| Accessibility | Web toggle exposes aria-pressed. | ChatComposerNew.tsx:6442 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-image-generate.test.ts`: Route behaviour; a test naming transparent_background was not found by grep of that name in api tests.
- `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx`: Image composer behaviour; a transparent-specific test was not confirmed.
- `apps/mobile/__tests__/ChatTabNewChatCloudSend.test.tsx`: File matched a search for the word transparent; what it asserts for this feature was not read.

**Test scenarios**

- **Web transparent generate**
  1. Image mode with an editing model, press Transparent, send 'a red apple'.
  - Expected: Request has transparent_background true; the saved PNG has an alpha channel (check with an image tool).
- **Non-editing model**
  1. Pick a model that cannot edit.
  - Expected: No Transparent control.
- **Download**
  1. Download the result.
  - Expected: File ends in .png and opens with a transparent backdrop.
- **Mobile retry**
  1. Turn on Transparent background, send, force a failure, press Retry.
  - Expected: The retried request still carries the flag.
- **CLI**
  1. Run agi image --transparent "a logo".
  - Expected: A PNG is written; inspect alpha.

**Where to look when it fails**

- Job row in image_generation_jobs (plan.transparentBackground).
- Provider error text surfaced by throwImageProviderHttpError (image-generation-provider.ts:520).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/045-image-editor.md](../../70-qa/test-plans/web/045-image-editor.md)
- Desktop: [70-qa/test-plans/desktop/045-image-editor.md](../../70-qa/test-plans/desktop/045-image-editor.md)
- Mobile: [70-qa/test-plans/mobile/045-image-editor.md](../../70-qa/test-plans/mobile/045-image-editor.md)
- No hands-on plan yet for CLI: the ledger marks this area as not built there, so the plan builder made none. Use the scenarios above.

## 10. Gaps and dependencies

- **The code never verifies output transparency.** Affects: All apps. Evidence: pngHasAlpha used only in edit-mask.ts. Work needed: Add a result check and a warning.
- **Panel 'New version' drops the transparency option.** Affects: Web, Desktop. Evidence: ImageGenerationCard.tsx:449-466; WebChatPage.tsx:3410-3414. Work needed: Decide and implement.
- **The brief calls this background removal; the code is an option on generation or edit, not a removal tool.** Affects: All. Evidence: image-generation-provider.ts:484, 544. Work needed: Rename in the brief or build a dedicated tool.
- **The brief says mobile missing; the code has a toggle.** Affects: Mobile. Evidence: AddToChatSheet.tsx:1034-1045. Work needed: Update the brief and test on a device.
- **Edit calls do not set a PNG output format.** Affects: Web, Mobile. Evidence: image-generation-provider.ts:484 versus 544. Work needed: Confirm provider default or set it.
- **Mobile reads .provider while web reads .imageApi for the same edit-support check.** Affects: Mobile. Evidence: resolveMobileImageGenerationRequest.ts:91 vs imageEditSupport.ts:7. Work needed: Use one helper.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- provider:openai
- plan:pro
- plan:max
- F045-01
- file:apps/web/app/api/media/image/lib/image-generation-provider.ts
- api:POST /api/media/image/generate
- table:media_assets
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Whether the provider always returns real alpha when asked.
- Effect of omitting the PNG output setting on edit calls.
- CLI behaviour offline or with no account (not opened).
- Whether Desktop Electron differs from web.
- Test results: none recorded; a transparent-specific test was not found.
