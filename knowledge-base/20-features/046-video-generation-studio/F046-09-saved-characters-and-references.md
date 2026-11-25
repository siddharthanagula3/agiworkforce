---
id: "F046-09"
type: "feature"
title: "Saved characters and references"
aliases: ["Saved characters (S46.17)", "Character or reference selection", "Character library", "Reference images for video"]
area: "46 Video-generation studio"
available_on: ["web"]
implementation: {web: "partial", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S46.17"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "file:packages/contracts/cloud-contracts/src/managed-media.ts", "file:apps/web/app/api/media/video/generate/route.ts", "api:POST /api/media/video/generate", "table:video_generation_jobs", "provider:google", "provider:openrouter", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-voice-and-media", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F046-09 Saved characters and references

Video-generation studio has no saved characters. A person cannot pick a stored character or reference to appear in a clip. The nearest feature is uploaded reference images, which exist on the Web composer only for models that accept images. No character store was found on any app.

Area: [46. Video-generation studio](README.md). Requirement items: [S46.17](../../10-requirements/capabilities/046-video-generation-studio.md#s4617).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Would let a person pick a saved character or reference (a face, a mascot, a product) and have it appear consistently in a video. Not built. Per-clip uploaded reference images are a related, separate feature that does exist on Web (packages/contracts/cloud-contracts/src/managed-media.ts:209-216).

**Why it exists.** The brief lists character or reference selection (S46.17) and several reference slots (S46.04) (doc: knowledge-base/data/area-briefs/046-video-generation-studio.md).

**Who uses it.** People making several clips with the same subject on Web, Desktop, Mobile and Chrome.

**Problems it solves**

- Today: a person must upload the reference image again for each clip on Web, and cannot at all on Mobile, Desktop or Chrome.
- If built: keeps the same subject across clips without re-uploading.

**Use cases**

- Reuse a brand mascot across a series of clips (not possible today).
- Pick a saved person photo as the lead of a clip (not possible today).
- Attach a product image as a reference for an ad (possible on Web as an upload only, for models that take images).

## 2. User experience

**Where to find it**

- Saved characters: not available on any app.
- Web uploaded references: attach an image in video mode when the selected video model takes images (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1569-1590). Exact visible label for the attach control: unknown, not read.
- Mobile, Desktop, Chrome: no image input found in their video request code (apps/mobile/src/features/video/services/videogen.ts:13; apps/desktop/src/api/cloudApi.ts:610-613; apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:126).

**Before you start**

- Signed-in account on a plan with video generation (route.ts:1102-1115).
- For uploaded references on Web: a video model that declares image input; the limit is the model's declared maximum, capped at 4 (managed-media.ts:161, :181-190). Only google and openrouter adapters carry images (managed-media.ts:168).

**Screens and controls**

- Web: image attach in video mode; the composer closes the attach rows when the model cannot read an image (ChatComposerNew.tsx:1577-1582) and flags a conflict (line 1584).
- No character picker or character library exists.

**Journey**

1. Person opens Web video mode and chooses a model that takes images.
2. They attach up to the model's limit of images; one image is sent as first frame, several as references (apps/web/lib/hooks/useMediaGeneration.ts:30-37).
3. They send. First frame and references cannot be combined (managed-media.ts:219-231).
4. The clip returns.

**What the person sees and gets**

- If the model cannot take images the attach rows are closed; if the images are unusable the composer reports an attachment conflict (ChatComposerNew.tsx:1580-1585). Server refusals come back as 422 with a code and the parameter name (route.ts:765-777).

**Settings**

- None for characters. Input limit comes from the model catalog imageInput.maxImagesPerRequest (managed-media.ts:186-190).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web sends first_frame_image or reference_images for models whose catalog entry allows images (useMediaGeneration.ts:30-37; managed-media.ts:181-190).
- Server resolves, inspects and moderates the input images before billing (route.ts:779-871; imports inspectImageBytes, matchDenylistedUpload at route.ts:20-25).

**Incomplete**

- Image input exists on Web only; Mobile, Desktop and Chrome requests carry no image (see paths above).
- The brief marks image-to-video and reference slots missing on all apps (S46.02, S46.04), which disagrees with the Web code; code wins (doc: AGENTS.md section 2).

**Present but disconnected or switched off**

- Promotional video models are given an input limit of 0 (ChatComposerNew.tsx:1569).

**Not available**

- Saved character store and picker: Web, Desktop, Mobile, Chrome.
- Reference images: Desktop, Mobile, Chrome.
- All video input: CLI and VS Code.

## 4. Required behaviour

**Established requirements**

- A person selects a saved character or reference to appear in the video. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.17)
- A person fills several reference slots (images, characters, styles) for one video. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S46.04)
- Competitor review must cover reference identity. (source: doc: docs/product/competitive-guidance.md section 5.17 items 131-132)

**Acceptance criteria**

1. A saved character can be created from an image, named, listed and deleted by the person; deleting asks first and names the consequence.
2. Choosing a saved character in video mode attaches it as a reference for models that accept references.
3. Characters sync across a person's apps on the same account.
4. A model that cannot take references shows the character picker disabled with a reason.
5. Uploaded or saved reference images pass the same safety checks (upload inspection and denylist) before any credit is reserved.
6. Account deletion removes saved characters.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The existing reference_images field could carry a saved character's image bytes without a new server field, if the client resolves the character first [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store characters as owner-scoped media records in the existing files and library storage rather than a new table family.
- [proposed] Port the Web image-input control to the Mobile sheet using the same catalog limit function.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | reference_images and first_frame_image | `packages/contracts/cloud-contracts/src/managed-media.ts` | Request fields for image inputs (lines 209-216) |
| service | managedMediaVideoInputImageLimit | `packages/contracts/cloud-contracts/src/managed-media.ts` | Per-model image count limit, capped at 4 and only for google and openrouter (lines 168-190) |
| service | refineManagedMediaVideoImageInputs | `packages/contracts/cloud-contracts/src/managed-media.ts` | Refuses first frame plus references together (lines 219-231) |
| service | resolveVideoInputImages | `apps/web/app/api/media/video/generate/route.ts` | Server resolves, checks and moderates input images (line 779) |
| hook | videoInputImageFields | `apps/web/lib/hooks/useMediaGeneration.ts` | Maps composer inputs to first_frame_image or reference_images (lines 30-37) |
| service | VideoGenerationRequest | `apps/web/features/media/services/media-api-service.ts` | Web request type with image fields (lines 41-51) |
| component | ChatComposerNew video input logic | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Input limit, conflicts and attach availability (lines 1565-1590) |
| service | resolveVideoRetryInputs | `apps/web/features/chat/lib/videoRetryInputs.ts` | Reuses input images when a failed video is retried (imported at WebChatPage.tsx:104) |
| service | submitOpenRouterVideo | `apps/web/lib/services/openrouter-video-provider-service.ts` | Sends images as provider input references (lines 119-150) |
| config | imageInput in catalog | `packages/contracts/types/src/model-catalog.ts` | Catalog data that decides which models take images |
| component | LibraryView | `packages/ui/unified-chat/src/components/library/LibraryView.tsx` | Library of media; no character concept (searched) |
| service | startVideoGeneration | `apps/mobile/src/features/video/services/videogen.ts` | Mobile request type allows image fields through the shared type but no UI sends them (line 13) |
| service | generateCloudVideo | `apps/desktop/src/api/cloudApi.ts` | Desktop sends prompt and duration only (lines 610-613) |
| service | startChromeVideo | `apps/extension/src/features/cloud-bridge/videoGenerationClient.ts` | Chrome sends prompt only (line 126) |
| test | media-video-generate-input-images.test | `apps/web/__tests__/api/media-video-generate-input-images.test.ts` | Server tests for image inputs to video |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person attaches images in Web video mode; the composer converts them to base64 inputs. | device | apps/web/lib/hooks/useMediaGeneration.ts:30-37 |
| The request goes to the Cloud route with first_frame_image or reference_images. | device and our servers | apps/web/features/media/services/media-api-service.ts:41-51 |
| The server checks the model's image limit, inspects each image, and refuses denylisted or disallowed uploads before any billing reservation. | our servers | apps/web/app/api/media/video/generate/route.ts:779-871, :1180-1195 |
| The provider adapter sends the images with the prompt; the provider renders the clip. | outside service | apps/web/lib/services/openrouter-video-provider-service.ts:119-150 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Input image bytes | unknown; sent to the provider as data inline; whether the server keeps a copy was not established | not applicable | unknown |
| Job row | video_generation_jobs | server-side | unknown |

**Models and providers.** Only models whose catalog entry lists image input and whose provider is google or openrouter can take images (managed-media.ts:168-190). Runway: no image input path found. A saved character would have to follow the same limit.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required for Cloud video. |
| Permissions | Uploaded images are inspected and checked against a denylist (route.ts imports at lines 20-25). Saved-character permissions: none found in the code. |
| Subscription | Video generation requires a plan in video_generation capability (billing-catalog.ts:357). No separate entitlement for references. |
| Limits and metering | Image count capped by the model and by 4 (managed-media.ts:161). Video seconds metered (route.ts:1239). |
| Feature flags | canUseVideoGeneration (route.ts:1011). None for characters. |
| Model compatibility | Depends on catalog imageInput and inputModalities (managed-media.ts:181-190). |
| Provider restrictions | Image input only through google and openrouter adapters (managed-media.ts:168). The no-training preference can force a different video model or refuse (route.ts:1169-1186) [inferred relevance]. |
| Local mode | Video and reference images are Cloud-only in the code read; Mobile requires cloud-send consent first (videogen.ts:97). Local mode: none found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model cannot read images | Attach rows close on Web | ChatComposerNew.tsx:1580-1582 |
| Too many or unusable images | Composer marks an attachment conflict | ChatComposerNew.tsx:1575-1585 |
| Both first frame and references sent | Validation issue 'send first_frame_image or reference_images, not both' | managed-media.ts:219-231 |
| Image refused by safety checks | 422 response with code and param | route.ts:765-777 |
| Retry of a failed video | Retry reuses stored inputs | WebChatPage.tsx:104 (resolveVideoRetryInputs) |
| Offline, cancel, reconnect for a character picker | not handled in the code; no picker exists | searched apps and packages |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/media-video-generate-input-images.test.ts`: Server handling of image inputs for video (file exists; contents not opened)
- `apps/web/lib/hooks/useMediaGeneration.test.tsx`: Web media generation hook
- `apps/web/app/api/media/video/openrouter-webhook/route.test.ts`: OpenRouter video webhook

**Test scenarios**

- **Attach on a capable model**
  1. Web video mode
  2. Pick a model that takes images
  3. Attach one image
  4. Send
  - Expected: Request carries first_frame_image; clip returns.
- **Incapable model**
  1. Pick a model without image input
  - Expected: Attach rows closed.
- **Both input kinds**
  1. POST with first_frame_image and reference_images
  - Expected: Validation error.
- **No character picker**
  1. Open video mode on each app
  2. look for saved characters
  - Expected: None exists.
- **Mobile image input**
  1. Open Mobile 'Create video'
  2. look for image attach
  - Expected: None found in code; confirm in the app.

**Where to look when it fails**

- 422 responses carry error.code and error.param (route.ts:765-777).
- Safety events: recordMediaSafety and recordModerationEvent in apps/web/lib/moderation and media-telemetry.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/046-video-generation-studio.md](../../70-qa/test-plans/web/046-video-generation-studio.md)

## 10. Gaps and dependencies

- **No saved character store or picker** Affects: all four video apps. Evidence: no character code found; managed-media.ts:209-216 takes uploaded images only. Work needed: Storage model, picker, sync, delete flow with confirmation, tests.
- **Reference images missing on Desktop, Mobile, Chrome** Affects: those apps. Evidence: cloudApi.ts:610-613; videogen.ts:13; videoGenerationClient.ts:126. Work needed: Port the Web input control and send image fields.
- **Brief marks S46.02 and S46.04 missing on Web, but Web code sends images** Affects: brief accuracy. Evidence: useMediaGeneration.ts:30-37. Work needed: Update the brief and ledger from code.
- Not built on: Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- file:packages/contracts/cloud-contracts/src/managed-media.ts
- file:apps/web/app/api/media/video/generate/route.ts
- api:POST /api/media/video/generate
- table:video_generation_jobs
- provider:google
- provider:openrouter
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-voice-and-media
- SYS-model-catalog-and-routing

## Unknown

- Visible label of the Web image-attach control in video mode: not read.
- Whether the server stores input images: not established.
- Whether Mobile has any image input for video: none found in video request code; the sheet file not fully read.
- Contents of the input-images test: not opened.
