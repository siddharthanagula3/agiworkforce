---
id: "F076-09"
type: "feature"
title: "Video understanding and timestamps"
aliases: ["Video understanding and timestamps", "Video input", "videoInput", "Timestamped video analysis", "S76.12", "S76.13", "Video in"]
area: "76 Model-capability registry"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S76.12", "S76.13"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "api:GET /api/llm/v1/models", "F076-07", "surface:web", "surface:mobile", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F076-09 Video understanding and timestamps

Not built. The model registry has a videoInput flag per model and the models API publishes it, but no app lets a person send a video to a chat model, and nothing returns timestamps. Timestamped video analysis has no registry field at all.

Area: [76. Model-capability registry](README.md). Requirement items: [S76.12](../../10-requirements/capabilities/076-model-capability-registry.md#s7612), [S76.13](../../10-requirements/capabilities/076-model-capability-registry.md#s7613).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person attach a video, have a capable model understand it, and point to times in it. Today it only records whether a model accepts video input (packages/ai/model-registry/schema/registry.schema.json:767-769) and publishes that fact as video_input (apps/web/app/api/llm/v1/models/route.ts:62-68).

**Why it exists.** Leading assistants read video. The registry brief asks that video input be recorded per model and that the product use it to show or route video understanding, and that timestamped analysis be recorded (doc: knowledge-base/data/area-briefs/076-model-capability-registry.md S76.12, S76.13).

**Who uses it.** No one yet. Future users: people who want a summary of a clip; developers using the API.

**Problems it solves**

- Today it only lets the API and the admin economics panel see which models take video (apps/web/features/admin/components/RouteEconomicsPanel.tsx:97).

**Use cases**

- Future: attach a lecture recording and ask for a summary with timestamps.
- Future: ask which second of a clip shows a given event.
- Future: Auto routing sends a video turn only to video-capable models (the router already accepts a videoInput requirement, packages/ai/routing/src/__tests__/capability-routing.test.ts:196).

## 2. User experience

**Where to find it**

- No app exposes it. The Web model catalog has chips Vision, Reasoning, Tools, Search, Code execution, Image out, Video out, Audio in, Audio out and no video-in chip (apps/web/features/chat/components/Composer/ModelCatalogue.tsx:129-162).
- API: GET /api/llm/v1/models lists capabilities.video_input per model (models/route.ts:62-68, 74-84).
- Admin: a 'Video' column in the route economics panel (RouteEconomicsPanel.tsx:97).

**Before you start**

- None; nothing to use.

**Screens and controls**

- None for end users. Admin panel column 'Video' shows the registry flag.

**Journey**

1. Not available on any app. There is no journey to describe.

**What the person sees and gets**

- API consumers see video_input true, false or null for each model.

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The registry schema has the videoInput capability field (packages/ai/model-registry/schema/registry.schema.json:767-769); the generated registry holds true for 92 entries and false for 325 (grep count of generated/registry.json).
- The models endpoint publishes video_input (apps/web/app/api/llm/v1/models/route.ts:62-68).
- The Auto router can require videoInput and tests show it honours the requirement across task types and tiers (packages/ai/routing/src/__tests__/capability-routing.test.ts:194-215).
- Admin route economics reads the flag (apps/web/features/admin/services/route-economics.ts:117; RouteEconomicsPanel.tsx:97).

**Incomplete**

- The model catalog type allows 'video' in inputModalities (packages/contracts/types/src/model-catalog.ts:653) but no chat path builds a video part (searched apps/web/app/api/llm/v1/chat/completions/lib; media-input.ts counts only image parts, line 68-77).

**Present but disconnected or switched off**

- videoInput flag is not read by the Web composer, picker chips, Mobile, CLI or VS Code (searched; only models route, admin and routing tests reference it).

**Not available**

- Video upload to chat on every app.
- Any timestamp output or registry field for timestamps (S76.13): no field in registry.schema.json.
- Chrome, VS Code, CLI, Mobile, Web and Desktop: nothing to test.

## 4. Required behaviour

**Established requirements**

- The registry records video input per model and the product uses it to show or route video understanding. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.12)
- The registry records which models can return timestamped video analysis and the product uses it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.13)
- Model capabilities are described by route or harness; never claim a capability is intrinsic when it depends on an AGI harness. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. The models API returns video_input for each model (exists today).
2. A video-input chip appears in the Web catalog for models with the flag (fails today).
3. Attaching a video to a chat turn with a model that lacks the flag is refused or rerouted with a clear message (fails today).
4. A timestamped answer cites times that exist in the video (cannot be tested; not built).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief item says 'not applicable anywhere' for S76.12, so the owner treats it as not planned yet [inferred from the brief status line].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether video understanding is in scope; if yes, add upload limits (see F076-07), a registry field for timestamped output, and a video-part path in the chat pipeline.
- [proposed] Show a 'Video in' chip only when a surface can send video.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | registry capability videoInput | `packages/ai/model-registry/schema/registry.schema.json` | Defines the flag (767-769). |
| schema | generated registry | `packages/ai/model-registry/generated/registry.json` | Holds the flag per model. |
| schema | generated registry types | `packages/ai/model-registry/generated/registry.ts` | Lists videoInput among intrinsic capability names (line 507). |
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Publishes video_input (62-68). |
| service | Auto routing capability matching | `packages/ai/routing/src/auto.ts` | Accepts requiredCapabilities including videoInput (115, 172). |
| service | managed cloud admission | `apps/web/lib/server/managed-cloud-routing/admission.ts` | Passes requiredCapabilities to the router (53, 79, 252); no caller passes videoInput. |
| test | capability routing tests | `packages/ai/routing/src/__tests__/capability-routing.test.ts` | Checks modality validation including videoInput (194-215). |
| component | RouteEconomicsPanel | `apps/web/features/admin/components/RouteEconomicsPanel.tsx` | Admin 'Video' column. |
| service | route-economics | `apps/web/features/admin/services/route-economics.ts` | Reads the flag for the admin panel (117). |
| component | ModelCatalogue chips | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Chip list that has no video-in chip (129-162). |
| service | chat media-input | `apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts` | Counts and limits image parts only (60-77). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No user action leads to video understanding. The only flow is a read: the models endpoint or admin page reads the registry flag. | our servers | apps/web/app/api/llm/v1/models/route.ts:62-84 |
| The registry is generated from the curated catalog and shipped with the server build. | our servers | doc: AGENTS.md section 4 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| videoInput flag per model | packages/ai/model-registry/generated/registry.json | Shipped with builds | Replaced on regeneration |

**Models and providers.** Some models declare video input at the provider (the curation notes list video input for some rows, packages/ai/model-registry/catalog/models.curation.json:81). The product does not send them any video.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Reading /v1/models is possible with the API surface; nothing else. |
| Permissions | None found in the code. |
| Subscription | None found in the code. |
| Limits and metering | None found in the code. |
| Feature flags | None found in the code. |
| Model compatibility | The flag exists per model; not used. |
| Provider restrictions | Not applicable until built. |
| Local mode | None found in the code. Whether any local model on Mobile or Desktop reads video: not established; Mobile local capability list shows visionIn and structuredOutput only (apps/mobile/src/features/model-picker/service.ts:144-148). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states (loading, empty, error, retry, offline) | Not handled in the code: no video-understanding flow exists | not handled in the code; searched chat completions lib and composer |
| Model flag null | The models API returns null for a capability the registry does not state | apps/web/app/api/llm/v1/models/route.ts:74-84 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/routing/src/__tests__/capability-routing.test.ts`: Router honours imageInput, audioInput and videoInput requirements.
- `packages/ai/routing/src/__tests__/route-ranking.test.ts`: Mentions videoInput in route ranking.
- `apps/web/app/api/llm/v1/models/route.test.ts`: Models endpoint (field coverage for video_input not checked).

**Test scenarios**

- **Models API publishes the flag**
  1. GET /api/llm/v1/models on localhost.
  2. Read capabilities.video_input for several models.
  - Expected: true, false or null per model.
- **No video upload path**
  1. On Web, open the attach menu and try to attach a video file to a chat turn.
  - Expected: Not supported or ignored; record the exact behaviour (not established in the code read).
- **Router modality requirement**
  1. Run the capability-routing test file.
  - Expected: Requests requiring videoInput get only models with the flag, or 'unavailable'.

**Where to look when it fails**

- Check generated registry.json for the flag.
- Router decision status 'unavailable' when no model matches (capability-routing.test.ts:190-193).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No product path sends video to a model.** Affects: All apps and the API. Evidence: media-input.ts counts only image_url parts (68-77). Work needed: Design upload, limits, pipeline part type, provider translation and pricing.
- **No registry field or product path for timestamped video analysis.** Affects: All apps and the API. Evidence: No timestamp field in registry.schema.json (searched). Work needed: Add field and output contract.
- **The registry flag is not used by any picker chip or composer check.** Affects: Web, Mobile, CLI, VS Code. Evidence: Only models route and admin read it. Work needed: Add a chip and a refusal when video support is built.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-model-catalog-and-routing
- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- api:GET /api/llm/v1/models
- F076-07
- surface:web
- surface:mobile
- mode:cloud

## Unknown

- Whether video understanding is planned and for which surfaces.
- Whether any provider adapter already translates a video part (not searched in every adapter).
- Whether the model catalog's inputModalities 'video' value is used anywhere in a product path.
- Whether Mobile or Desktop local models can read video.
- Why the brief marks S76.12 not applicable rather than missing.
