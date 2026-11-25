---
id: "F044-05"
type: "feature"
title: "Repeatable results: seed and negative prompt"
aliases: ["Seed", "Negative prompt", "negative_prompt", "Repeatable results", "Reproducible images"]
area: "44 Image-generation studio"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S44.12", "S44.13"]
depends_on: ["F044-01", "SYS-api-and-contracts", "SYS-model-catalog-and-routing", "provider:google", "surface:web", "surface:mobile", "surface:cli"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F044-05 Repeatable results: seed and negative prompt

Not offered to users. There is no seed anywhere. A negative prompt is accepted by the server (up to 2000 characters) and used only by the Google image API, but no Web, Mobile or CLI control sends one. The internal Tauri desktop command can carry one, and no caller fills it.

Area: [44. Image-generation studio](README.md). Requirement items: [S44.12](../../10-requirements/capabilities/044-image-generation-studio.md#s4412), [S44.13](../../10-requirements/capabilities/044-image-generation-studio.md#s4413).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person repeat an image with the same seed and tell the model what to avoid. Today the server alone has a negative-prompt field; no person can reach it. (packages/contracts/cloud-contracts/src/managed-media.ts:100; apps/web/app/api/media/image/lib/image-generation-provider.ts:131-157)

**Why it exists.** Power users want controllable, repeatable images. The brief lists a seed control (missing everywhere) and a negative-prompt control (marked not applicable everywhere). (brief S44.12, S44.13)

**Who uses it.** Would be: advanced users and script writers (CLI). Nobody uses it today.

**Problems it solves**

- Reproducing a good image (seed).
- Excluding unwanted elements (negative prompt).

**Use cases**

- agi image "city" --seed 42 would repeat an image.
- A Web field 'Avoid' would keep text out of a poster.

## 2. User experience

**Where to find it**

- Not available on any app. No seed field and no negative-prompt field exist in the Web composer, Mobile Add to chat, CLI flags or Chrome (apps/cli/src/lib.rs:1110-1172; ChatComposerNew.tsx:6254-6460; AddToChatSheet.tsx:1003-1046).

**Before you start**

- Not applicable.

**Screens and controls**

- None for seed. None for negative prompt.

**Journey**

1. 1. Person describes the image in the prompt only.
2. 2. Anything to avoid must be written into the prompt text.
3. 3. Results can differ on every run.

**What the person sees and gets**

- None for this feature.

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server accepts negative_prompt up to 2000 characters, checks it with the safety floor together with the prompt, stores it in the job plan and passes it to the Google adapter when that adapter runs (managed-media.ts:100; managed-image-generation.ts:282-286,778; image-job-executor.ts:650; image-generation-provider.ts:157).

**Incomplete**

- The openai adapter and the gemini API path ignore the field (image-generation-provider.ts:456-545,570-581) [inferred from the function signatures; the gemini function receives no negative prompt: line 144].

**Present but disconnected or switched off**

- The Tauri desktop command carries negative_prompt, style, quality and n in its payload, but its one caller sets negative_prompt to None (apps/desktop/src-tauri/src/sys/commands/media.rs:210-227; apps/desktop/src-tauri/src/core/llm/tool_executor/media_tools.rs:47-55).
- The Web client type for an image request lists negative_prompt, but the image path does not use that service (apps/web/features/media/services/media-api-service.ts:18-27; apps/web/lib/hooks/useMediaGeneration.ts:507-514).

**Not available**

- Seed: no field in the request schema, no server handling, no UI on any app (managed-media.ts:89-118).
- Negative prompt UI: none on Web, Desktop, Mobile, CLI or Chrome.

## 4. Required behaviour

**Established requirements**

- User sets a seed (on models that support it) to reproduce an image. (source: S44.12 (brief))
- User enters a negative prompt (what to avoid) on models that support it. (source: S44.13 (brief; status 'not applicable anywhere'))
- Unsupported capabilities must be visible, not hidden or faked. (source: doc: docs/product/requirements.md:984 (M-MODEL-005))

**Acceptance criteria**

1. Today: the Web composer, Mobile sheet and CLI help show no seed or negative-prompt control.
2. Today: POSTing negative_prompt with an Imagen-API model reaches the provider call; with an openai-API model it is accepted and has no effect.
3. Today: POSTing seed returns 400 because the schema is strict and has no seed field.
4. Future: a seed control appears only for models that publish seed support and the same seed returns the same image on repeat (not testable until built).
5. Future: a negative prompt is shown only for models that use it.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A control should be shown only when the chosen model supports it, so model support must be published in the availability response, which has no field for it today (managed-media.ts:249-266) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add optional seed and a per-model flag for seed and negative-prompt support to the availability payload.
- [proposed] Decide whether the brief's 'not applicable' for negative prompt means out of scope; if so remove the server field to avoid an unused path (AGENTS.md section 9).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | negative_prompt field | `packages/contracts/cloud-contracts/src/managed-media.ts` | Optional text up to 2000 characters (line 100); schema is strict so unknown fields such as seed are rejected. |
| service | Negative prompt safety check | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Moderates prompt and negative prompt together (lines 279-288) and stores it in the plan (line 778). |
| schema | ImageGenerationPlan.negativePrompt | `apps/web/lib/server/image-generation-jobs.ts` | Job plan field (lines 28,153). |
| job | Executor passes negativePrompt | `apps/web/app/api/media/image/lib/image-job-executor.ts` | Hands the field to the provider call (line 650). |
| service | Google image adapter | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Adds negativePrompt to the Imagen body when set (lines 131-157). |
| command | media_generate_image | `apps/desktop/src-tauri/src/sys/commands/media.rs` | Tauri payload with negative_prompt, style, quality and n (lines 15-30,210-227). |
| service | Tauri tool executor | `apps/desktop/src-tauri/src/core/llm/tool_executor/media_tools.rs` | Only caller; sets negative_prompt None (lines 47-55). |
| service | Web media-api-service ImageGenerationRequest type | `apps/web/features/media/services/media-api-service.ts` | Type lists negative_prompt; the image hook does not use it (lines 18-27). |
| component | ChatComposerNew image controls | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | No seed or negative field (lines 6254-6460). |
| component | AddToChatSheet image options | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | No seed or negative field (lines 1003-1046). |
| command | agi image flags | `apps/cli/src/lib.rs` | No seed or negative flag (lines 1110-1172). |
| endpoint | GET /api/media/availability | `apps/web/app/api/media/availability/route.ts` | Would publish per-model seed support; today has none (managed-media.ts:249-266). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No app sends seed or negative_prompt on the image path. | device | useMediaGeneration.ts:507-514; runImageGenerationTurn.ts:299-312; apps/cli/src/cloud/image.rs:28-52 |
| If a caller did send negative_prompt, the server checks it with the prompt, stores it and passes it to the Google adapter. | our servers | managed-image-generation.ts:279-288,778; image-job-executor.ts:650 |
| The Google provider receives it in the request body. | outside service | image-generation-provider.ts:157 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| negative_prompt text if sent | plan column of image_generation_jobs | Server held | Unknown |

**Models and providers.** Only the Google 'imagen' API path uses a negative prompt (image-generation-provider.ts:143-157). Seed: no model path exists.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for these controls (they do not exist); the route needs a signed-in account. |
| Permissions | none found in the code. |
| Subscription | none found in the code beyond the image_generation capability (billing-catalog.ts:356). |
| Limits and metering | Negative prompt max 2000 characters (managed-media.ts:100). No seed limit. |
| Feature flags | none found in the code. |
| Model compatibility | Negative prompt effective only on the imagen image API; ignored elsewhere. Seed: none. |
| Provider restrictions | Provider google only for negative prompt. |
| Local mode | none found in the code; image generation is not available in Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Negative prompt too long | 400 invalid request from the schema (above 2000 characters). | managed-media.ts:100; managed-image-generation.ts:233-253 |
| Negative prompt with blocked content | Prompt moderation includes it, so 422 content_policy_violation. | managed-image-generation.ts:279-314 |
| Seed sent | 400: schema is strict and rejects unknown fields. | managed-media.ts:89-118,121; managed-media.test.ts:159 |
| Model that ignores the negative prompt | Accepted silently; the user is not told. Not handled in the code. | image-generation-provider.ts:456-545 |
| Loading, offline, cancel, accessibility | not handled in the code (no control). | No seed or negative-prompt control exists in the apps searched |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/cloud-contracts/src/__tests__/managed-media.test.ts`: Strict schema rejects unknown fields (line 159); does not name seed or negative prompt.
- `apps/web/__tests__/api/media-image-generate.test.ts`: Rejects unknown client fields (line 930); negative-prompt behaviour not named in any test title.

**Test scenarios**

- **No UI today**
  1. Open image mode on Web and Mobile; run agi image --help.
  - Expected: No seed or negative-prompt control or flag.
- **Server negative prompt, imagen API**
  1. POST a valid body with negative_prompt using an imagen-API model.
  - Expected: Accepted; the provider body contains negativePrompt (check by a test double).
- **Server negative prompt, openai API**
  1. POST the same with an openai-API model.
  - Expected: Accepted; no effect on the provider body.
- **Seed rejected**
  1. POST a body with a seed field.
  - Expected: 400 invalid_request_error naming the unknown key.

**Where to look when it fails**

- Table image_generation_jobs.plan shows whether negativePrompt was stored.
- Log of request validation errors uses the 'Invalid request:' message (managed-image-generation.ts:241).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No seed support anywhere (schema, server, UI).** Affects: All apps. Evidence: brief S44.12; managed-media.ts:89-118. Work needed: Decide scope; then add schema field, per-model support flag, adapter wiring, UI and tests.
- **Negative prompt exists on the server for one API but no client sends it, and the brief calls it not applicable.** Affects: All apps; dead server path. Evidence: managed-media.ts:100; brief S44.13; media_tools.rs:47-55. Work needed: Either add UI gated on per-model support or remove the unused path.
- **Models that ignore a negative prompt do not say so.** Affects: Any future UI. Evidence: image-generation-provider.ts:456-545. Work needed: Publish support in the availability payload.
- Not built on: Web, Desktop, Mobile, CLI, Chrome (from the capability ledger).

**Depends on**

- F044-01
- SYS-api-and-contracts
- SYS-model-catalog-and-routing
- provider:google
- surface:web
- surface:mobile
- surface:cli

## Unknown

- Whether seed is meant to be supported by any current provider API; not checked against provider documentation.
- What 'not applicable' means in the brief for S44.13 (out of scope, or not applicable to the model).
- Whether the gemini-API adapter drops negative prompts on purpose.
