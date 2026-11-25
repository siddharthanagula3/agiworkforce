---
id: "F046-08"
type: "feature"
title: "Style presets and templates"
aliases: ["Style presets (S46.15)", "Template gallery (S46.16)", "Video styles", "Video templates"]
area: "46 Video-generation studio"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S46.15", "S46.16"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "file:packages/contracts/cloud-contracts/src/managed-media.ts", "file:apps/web/features/chat/lib/imageGenerationOptions.ts", "api:POST /api/media/video/generate", "SYS-voice-and-media", "SYS-shared-ui-and-design", "SYS-api-and-contracts", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F046-08 Style presets and templates

Video-generation studio has no style presets and no template gallery for video on any app. The video request schema has no style or template field. Style presets exist only for images, as phrases added to an image prompt. Video styles and templates are missing on Web, Desktop, Mobile and Chrome.

Area: [46. Video-generation studio](README.md). Requirement items: [S46.15](../../10-requirements/capabilities/046-video-generation-studio.md#s4615), [S46.16](../../10-requirements/capabilities/046-video-generation-studio.md#s4616).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person apply a look such as cinematic or anime to a video, and start a video from a ready-made template. Neither exists for video today.

**Why it exists.** The brief lists style presets (S46.15) and a template gallery (S46.16) as parts of the studio (doc: knowledge-base/data/area-briefs/046-video-generation-studio.md). The audit worklist places them in wave 4 (doc: audit/missing/046-video-generation-studio.md).

**Who uses it.** People who are not prompt writers and want a good-looking clip without describing the style in words, on Web, Desktop, Mobile and Chrome.

**Problems it solves**

- Today: none, not built.
- If built: removes the need to write style words by hand and gives a starting point for a blank prompt.

**Use cases**

- Pick 'cinematic' before generating (not possible today).
- Start from a product-ad template (not possible today).
- Reuse a saved look across several clips (not possible today).

## 2. User experience

**Where to find it**

- Not available for video on Web, Desktop, Mobile or Chrome.
- For images only: the Web composer maps IMAGE_STYLE_PRESETS to a menu (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6344) and the features page describes it (apps/web/app/features/images/page.tsx:100).

**Before you start**

- Not applicable. Video itself needs a signed-in account on a plan with video generation (apps/web/app/api/media/video/generate/route.ts:1102-1115).

**Screens and controls**

- No style menu and no template gallery in the video controls (ChatComposerNew.tsx:6561-6857) or the mobile 'Create video' sheet (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:943-966).

**Journey**

1. Person opens video mode.
2. They type a prompt, optionally writing style words themselves.
3. They send; the whole prompt goes to the model unchanged apart from safety checks.

**What the person sees and gets**

- No style or template feedback exists. The chat mode prompt for video says the assistant helps 'craft prompts and storyboards' (packages/ui/unified-chat/src/stores/chatStore.ts:49), which is text advice only [inferred].

**Settings**

- None for video. Image style presets are a separate list in apps/web/features/chat/lib/imageGenerationOptions.ts:95.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Image style presets work on Web image mode (imageGenerationOptions.ts:89-95; ChatComposerNew.tsx:6344). They are not connected to video.

**Incomplete**

- The image request has a style field (managed-media.ts:97); the video request has none (managed-media.ts:193-217).

**Present but disconnected or switched off**

- IMAGE_STYLE_PRESETS is imported into the composer but only the image menu renders it (ChatComposerNew.tsx:6344); no video use was seen.

**Not available**

- Video style presets: Web, Desktop, Mobile, Chrome.
- Video template gallery: Web, Desktop, Mobile, Chrome.
- Both: CLI and VS Code (no video mode).

## 4. Required behaviour

**Established requirements**

- A person applies a style preset (cinematic, anime and so on) to a video. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.15)
- A person starts a video from a template gallery. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.16)
- Product names, model IDs and design values come from shared registries, not call sites. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. Video mode shows a style control on every app that has video mode, or an honest disabled state.
2. Choosing a preset changes the generated prompt or request in a way the person can see before sending.
3. The template gallery lists templates; choosing one fills the composer with its prompt and settings and lets the person edit them.
4. Presets and templates live in one shared list, not copied per app.
5. The cost estimate and plan checks still run after a preset is applied.
6. The final prompt still passes the 2000-character limit and prompt moderation.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because image presets are phrases added to the prompt (apps/web/app/features/images/page.tsx:100), a video preset could work the same way without a new server field [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build video presets as a shared list in packages beside the image list, and render it in the web composer and mobile sheet.
- [proposed] Store templates as data, with prompt, duration, aspect ratio and a sample thumbnail.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | ManagedMediaVideoGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | Video request with no style or template field (lines 193-217) |
| schema | Image request style field | `packages/contracts/cloud-contracts/src/managed-media.ts` | Image-only style string (line 97), shown for contrast |
| config | IMAGE_STYLE_PRESETS | `apps/web/features/chat/lib/imageGenerationOptions.ts` | Image-only preset list (lines 89-95); the model for a video list |
| component | ChatComposerNew image style menu | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Renders image presets at line 6344; video menus at 6561-6857 have no style |
| component | ImageScene | `apps/web/features/marketing/components/scenes/ImageScene.tsx` | Marketing scene that uses an image preset (line 26) |
| component | Images feature page | `apps/web/app/features/images/page.tsx` | Public page explaining image style presets (line 100) |
| config | Video mode system prompt | `packages/ui/unified-chat/src/stores/chatStore.ts` | Video mode assistant instruction mentioning prompts and storyboards (line 49) |
| service | VideoGenerationRouteRequestSchema | `apps/web/app/api/media/video/generate/route.ts` | Route schema extends the shared one with conversation ids (line 163) |
| service | moderateManagedPrompt | `apps/web/app/api/media/video/generate/route.ts` | Safety check on the prompt before billing (called near line 1141); any preset text would pass through it |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Mobile 'Create video' sheet without style or template rows (lines 943-966) |
| service | startVideoGeneration | `apps/mobile/src/features/video/services/videogen.ts` | Mobile video request (line 87) |
| service | generateCloudVideo | `apps/desktop/src/api/cloudApi.ts` | Desktop video request: prompt and duration only (line 600) |
| service | startChromeVideo | `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Chrome video request: prompt only (line 109) |
| component | LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Library of finished media; no template entry seen |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person writes a prompt in video mode; no preset or template step. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6561-6857 |
| The client sends the prompt and settings to the Cloud video route. | device and our servers | apps/web/features/media/services/media-api-service.ts:41-51 |
| The server moderates the prompt, resolves the model, checks plan, allowance and storage, and queues durable jobs. | our servers | apps/web/app/api/media/video/generate/route.ts:1141-1295 |
| The provider renders the clip from the prompt. | outside service | apps/web/lib/services/openrouter-video-provider-service.ts:137-150 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Prompt text and job settings | video_generation_jobs table on the server | Server-side; clients poll the status route | unknown from files read |

**Models and providers.** A preset would only change the prompt text, so it would work with any catalog video model [inferred]. Models and providers come from the catalog (SYS-model-catalog-and-routing).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for Cloud video (route.ts:1001-1012). No account rule for presets or templates exists. |
| Permissions | Workspace policy gates apply to video (route.ts:925-945). None specific to styles. |
| Subscription | Video generation requires a plan in billing capability video_generation (billing-catalog.ts:357). No separate entitlement for presets. |
| Limits and metering | Metered in video_seconds (route.ts:1239-1246). Prompt max 2000 characters (managed-media.ts:195). |
| Feature flags | canUseVideoGeneration (route.ts:1011). None for presets. |
| Model compatibility | Not applicable today. |
| Provider restrictions | Runway prompts are limited to 1000 characters (route.ts:1210-1212), so a preset that adds text could hit that limit [inferred]. |
| Local mode | Video is Cloud-only in the code read; no Local video path found. Local-mode presets or templates: none found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Runway prompt over 1000 characters | Validation error 'Runway video prompts must be 1,000 characters or fewer.' | apps/web/app/api/media/video/generate/route.ts:1210-1212 |
| Prompt blocked by safety floor | 422 content_policy_violation | apps/web/app/api/media/video/generate/route.ts:1141-1165 |
| Unknown field style in a video request | Rejected by the strict schema [inferred] | packages/contracts/cloud-contracts/src/managed-media.ts:217 |
| Loading, empty, error states for a gallery | not handled in the code; no gallery exists | searched apps and packages for video style, template and preset names; only image presets found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/features/images/page.test.tsx`: Images feature page text including style presets (image only)
- `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx`: Web composer; mentions image style presets (video presets not covered because none exist)
- `apps/web/__tests__/api/media-video-generate.test.ts`: Video route (file exists; not opened)

**Test scenarios**

- **No video style control**
  1. Open Web video mode
  2. Open every menu
  - Expected: No style or template option.
- **Image presets still image only**
  1. Switch to image mode
  2. Open style menu
  3. Switch to video mode
  - Expected: Style menu appears in image mode only.
- **Style field rejected for video**
  1. POST video request with style: 'cinematic'
  - Expected: Validation error for an unknown field.
- **Mobile sheet**
  1. Open Mobile 'Create video'
  - Expected: Model, duration, aspect ratio and resolution only.

**Where to look when it fails**

- Validation errors from the route name the failing field path (route.ts:1019-1027).
- Safety blocks are recorded with recordMediaSafety (route.ts:1143).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No video style presets** Affects: Web, Desktop, Mobile, Chrome. Evidence: managed-media.ts:193-217; ChatComposerNew.tsx:6344 is image-only. Work needed: Shared preset list, composer control per app, prompt composition, tests.
- **No template gallery** Affects: Web, Desktop, Mobile, Chrome. Evidence: no template names in video code (searched apps/packages). Work needed: Template data model, gallery screen, start-from-template action, per-app UI.
- **Brief and audit mark these missing; project surface matrix says video absent on desktop, mobile and chrome though code exists** Affects: documentation accuracy. Evidence: docs/product/surface-feature-matrix.md:67 vs apps/desktop/src/api/cloudApi.ts:600, apps/mobile/src/features/video/services/videogen.ts:87, apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:109. Work needed: Regenerate or correct the matrix (docs are rank 6; code wins).
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- file:packages/contracts/cloud-contracts/src/managed-media.ts
- file:apps/web/features/chat/lib/imageGenerationOptions.ts
- api:POST /api/media/video/generate
- SYS-voice-and-media
- SYS-shared-ui-and-design
- SYS-api-and-contracts
- SYS-model-catalog-and-routing

## Unknown

- Whether any provider accepts a style parameter: not checked.
- Whether a template or preset concept exists in a private repo area not read.
- Contents of media-video-generate.test.ts: not opened.
