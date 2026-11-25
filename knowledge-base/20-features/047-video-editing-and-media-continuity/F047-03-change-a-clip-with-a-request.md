---
id: "F047-03"
type: "feature"
title: "Change a clip with a request"
aliases: ["Conversational revision", "Style transfer", "Object or background change", "Change a clip with a request", "S47.03", "S47.04", "S47.05"]
area: "47 Video editing and media continuity"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S47.03", "S47.04", "S47.05"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "mode:cloud", "plan:max_15x", "plan:enterprise", "provider:google", "provider:openrouter", "api:POST /api/media/video/generate", "table:video_generation_jobs", "table:media_assets", "F047-04", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F047-03 Change a clip with a request

Asking in chat for a changed version of an existing clip (new style, background or object) does not exist in any app. Chat can only create a new clip from a prompt, optionally guided by an image. There is no source-clip input, no version link and no model flag for editing. Plan limits are undefined.

Area: [47. Video editing and media continuity](README.md). Requirement items: [S47.03](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4703), [S47.04](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4704), [S47.05](../../10-requirements/capabilities/047-video-editing-and-media-continuity.md#s4705).

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

**What it does.** Intended: the person types a change and gets a revised clip kept as a new version. Today the video route only makes new clips from a prompt (packages/contracts/cloud-contracts/src/managed-media.ts:193-217).

**Why it exists.** The brief lists conversational revision, style transfer and object or background changes (S47.03-S47.05). The research note in the project says the leaders' video editing should be inspected (doc: docs/product/competitive-guidance.md:415), while founder decisions state editing is not built (docs/decisions/2026-09-27-founder-decisions.md:310).

**Who uses it.** Intended: signed-in people on Ultra or Enterprise (billing-catalog.ts:357). Nobody today.

**Problems it solves**

- A person wanting a small change must rewrite the whole prompt and pay for a new clip.
- Nothing tells a person which clip a new one came from.

**Use cases**

- Make this clip look like a watercolour.
- Change the background to a beach.
- Swap the red car for a blue one, where the model supports it.

## 2. User experience

**Where to find it**

- Web: no revise control. Video mode in the composer offers a model picker, aspect, quality, duration and attached image use labelled First frame or Reference image (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:605-606).
- Desktop Electron: follows web [inferred from AGENTS.md section 5]. Desktop Tauri build: prompt-only video turn (apps/desktop/src/runtime/CloudRuntime.ts:578-662).
- Mobile: video switched off (apps/mobile/lib/v1FeatureFlags.ts:28).
- Chrome: a menu item Create a video, words only (apps/extension/_locales/en/messages.json:3421-3443).
- CLI and VS Code: not applicable.

**Before you start**

- A finished clip.
- Signed in; plan with video.

**Screens and controls**

- No revise control exists. Reference image option is the nearest: the image guides how the video looks (ChatComposerNew.tsx:606).

**Journey**

1. Today: type a new prompt to make a new clip; no link to the earlier one.
2. Intended: open a clip, type the change, read the revised clip, keep it or go back [proposed].

**What the person sees and gets**

- Intended: revised clip as a new version; message when the model cannot change objects or backgrounds. [proposed]
- Today: none.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- New-clip creation from a prompt works on web, with a first-frame or reference image (apps/web/app/api/media/video/generate/route.ts:779-872).

**Incomplete**

- A person could imitate a style change by attaching a frame as Reference image and typing a new prompt [inferred]; the result is a new unrelated clip.

**Present but disconnected or switched off**

- Mobile video creation is flag-off (apps/mobile/lib/v1FeatureFlags.ts:28).

**Not available**

- Revise, style transfer, object or background change: no code on web, desktop, mobile or Chrome.
- No source-clip field in the request schema (managed-media.ts:193-217).
- No model flag for editing in the catalog video block (packages/contracts/types/src/model-catalog.ts:213-219).

## 4. Required behaviour

**Established requirements**

- User asks in conversation for a change and gets a revised version of the previous clip (S47.03). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.03)
- User applies a new visual style to an existing clip (S47.04). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.04)
- User changes an object or the background in an existing clip where supported (S47.05). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S47.05)
- Image and video edit controls are declined because leaders edit by prompt; video editing not built. (source: docs/decisions/2026-09-27-founder-decisions.md:139-141,310)

**Acceptance criteria**

1. A revision is saved as a new version; the earlier clip is unchanged.
2. The person can keep the new one or return to the earlier one.
3. If the model cannot change objects or backgrounds, the app says so before spending usage.
4. A failed revision leaves the previous clip and shows the reason.
5. Usage for a revision is counted under the plan rules once defined.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Revision needs a model that takes a source video; no catalog field says which do [inferred].
- Because the leaders edit by prompt (decision doc), the chat is the right place for it [inferred].

**Proposed improvements** (suggestions, not requirements)

- Add catalog flags for style, object and background change.
- Offer a Revise action on a finished clip that pre-fills the chat with the clip as the source.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/media/video/generate | `apps/web/app/api/media/video/generate/route.ts` | Creation route; would need a source input to revise. |
| schema | ManagedMediaVideoGenerationRequestSchema | `packages/contracts/cloud-contracts/src/managed-media.ts` | Strict contract with no source clip. |
| schema | VideoGenerationMetadata | `packages/contracts/types/src/model-catalog.ts` | Catalog video block: durations, sizes, audio, seed, pricing; no editing flags. |
| service | resolveVideoInputImages | `apps/web/app/api/media/video/generate/route.ts` | Image inputs for guidance. |
| component | ChatComposerNew video mode | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Composer controls for video. |
| screen | WebChatPage video turn | `apps/web/features/chat/pages/WebChatPage.tsx` | Starts and watches video turns and keeps retry inputs in memory (lines 3735, 3913-4045). |
| hook | useMediaGeneration | `apps/web/lib/hooks/useMediaGeneration.ts` | Starts video jobs from chat. |
| service | media-turn | `apps/web/features/chat/lib/media-turn.ts` | Chat media turn helpers; contents not opened. |
| table | video_generation_jobs | `apps/web/db/neon/0105_durable_video_generation_jobs.sql` | Jobs; conversation_id and assistant_message_id bind to a chat turn; no parent. |
| service | desktop CloudRuntime sendManagedVideoTurn | `apps/desktop/src/runtime/CloudRuntime.ts` | Tauri-build video turn; prompt only. |
| service | mobile resolveMobileVideoGenerationRequest | `apps/mobile/src/features/chat/actions/resolveMobileVideoGenerationRequest.ts` | Mobile gate: flag, cloud mode, sign-in, plan, online, model. |
| component | Chrome side panel video mode | `apps/extension/src/side_panel.ts` | Create a video menu item; refuses attachments. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person writes a prompt in video mode. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3860-3892 |
| Client posts it with an idempotency key. | device and our servers | apps/web/features/media/services/media-api-service.ts:190-215 |
| Server checks plan, moderates the prompt, reserves usage, submits to the provider. | our servers | apps/web/app/api/media/video/generate/route.ts:938-1030,1136-1150 |
| Provider renders a new clip; result stored and linked to the chat turn. | outside service | apps/web/db/neon/0105_durable_video_generation_jobs.sql:74-90 |
| Revision step: no code. [proposed] The source clip and the change text would be sent to a model that edits video; the output is saved as a child of the source. | outside service | [proposed] no code exists |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| New clip, prompt, job row | Object storage, media_assets, video_generation_jobs | Shared by user library | Soft delete on assets |
| Revision link to previous clip | Not stored | not applicable | not applicable |

**Models and providers.** Creation uses Google or OpenRouter routes only (managed-media.ts:168-170). No catalog model is marked as able to edit video (model-catalog.ts:213-219). Runway withheld (video-provider-release-policy.ts:16-18).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in, adult-verified (route.ts:889-896). |
| Permissions | none found in the code for revisions. |
| Subscription | Video: Ultra or Enterprise (billing-catalog.ts:357). |
| Limits and metering | Monthly video seconds for creation (tier-unit-quota-service.ts:57,165). None for revisions. |
| Feature flags | canUseVideoGeneration (route.ts:1008-1013). |
| Model compatibility | Unknown which models can edit; catalog has no field. |
| Provider restrictions | Google and OpenRouter only for image-guided creation. |
| Local mode | No local video; mobile requires cloud mode (resolveMobileVideoGenerationRequest.ts:107). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unsupported change | Not handled in the code; no capability flag. | model-catalog.ts:213-219 |
| Failure | Not handled for revisions; creation failures give a public message (0105 migration:114). | apps/web/db/neon/0105_durable_video_generation_jobs.sql:114 |
| Retry | Creation retry keeps image inputs in memory; if lost it asks to attach again (apps/web/features/chat/lib/videoRetryInputs.ts:12-24). | same |
| Cancel and timeout | Creation only: cancel route and a 5 minute poll limit. | apps/web/app/api/media/video/cancel/route.ts; apps/mobile/src/features/video/services/videogen.ts:42-43 |
| Offline | Mobile blocks creation when offline (resolveMobileVideoGenerationRequest.ts:111). | same |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/video-model-selectability.test.ts`: Video model picker selectability; name indicates, contents not opened.
- `packages/contracts/types/src/__tests__/video-generation-catalog.test.ts`: Catalog video block checks; contents not opened.
- `apps/web/__tests__/api/media-video-generate.test.ts`: Creation route; contents not opened.

**Test scenarios**

- **Revise absent today**
  1. Open a finished clip in chat.
  2. Look for Revise or style options.
  - Expected: None exist.
- **Revision is a new version (once built)**
  1. Ask for a new style.
  2. Open the Library.
  - Expected: Original unchanged; new clip linked to it.
- **Unsupported object change (once built)**
  1. Choose a model without object editing; ask to swap an object.
  - Expected: App says the model does not support it; no usage charged.
- **Failure (once built)**
  1. Force provider failure.
  - Expected: Previous clip stays; reason shown.

**Where to look when it fails**

- Revisions have no logs. For creation: video_generation_jobs.public_error, error code video_resolution_unpriced (route.ts:483).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No revise, style transfer or object/background change** Affects: web, desktop, mobile, Chrome. Evidence: brief S47.03-S47.05 missing. Work needed: Source-clip input, model flags, chat action, parent link.
- **No version link** Affects: all. Evidence: 0105 and 0036 tables. Work needed: Migration.
- **Model support unknown** Affects: all. Evidence: model-catalog.ts:213-219 has no editing fields. Work needed: Probe providers, add flags.
- **Plan limits undefined** Affects: all. Evidence: billing-catalog.ts. Work needed: Owner decision.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- mode:cloud
- plan:max_15x
- plan:enterprise
- provider:google
- provider:openrouter
- api:POST /api/media/video/generate
- table:video_generation_jobs
- table:media_assets
- F047-04
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing

## Unknown

- Which provider models can edit an existing video.
- Whether the owner will build editing.
- Plan rules.
- How a revision is billed.
- Contents of the listed tests; not opened.
