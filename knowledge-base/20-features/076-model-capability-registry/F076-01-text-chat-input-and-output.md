---
id: "F076-01"
type: "feature"
title: "Text chat input and output"
aliases: ["Text input", "Text output", "S76.01", "S76.02", "textInput / textOutput flags", "Text-only chat", "Text only chip"]
area: "76 Model-capability registry"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S76.01", "S76.02"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-api-and-contracts", "SYS-local-inference", "SYS-subscriptions-entitlements-and-usage", "file:packages/ai/model-registry/catalog/models.curation.json", "file:packages/ai/routing/src/auto.ts", "api:GET /api/llm/v1/models", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "surface:desktop", "mode:cloud", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F076-01 Text chat input and output

Every model in the catalog is recorded as accepting text, producing text, or not. Auto routing for chat tasks only picks models with both text flags. The picker and the model list API only show chat-type models. Image, audio and video models stay out of chat lists.

Area: [76. Model-capability registry](README.md). Requirement items: [S76.01](../../10-requirements/capabilities/076-model-capability-registry.md#s7601), [S76.02](../../10-requirements/capabilities/076-model-capability-registry.md#s7602).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Records, per model in the generated catalog, whether it reads text and writes text. Chat-style routing tasks require both flags, and the chat model lists (web picker, mobile picker, CLI list, VS Code picker, models API) show only chat-type models.

**Why it exists.** A chat turn sent to a speech-to-text, image or video model fails or gives nonsense. The registry makes admission a data question instead of a per-app guess.

**Who uses it.** Everyone who chats on Web, Desktop, Mobile, CLI, VS Code and Chrome, and developers calling the models API. Engineers who add models to the catalog.

**Problems it solves**

- A chat turn is never routed to a model that cannot read or write text.
- One catalog drives every app, so apps do not keep private lists of chat models.
- Models of other kinds (transcription, speech, image, video) do not appear in chat pickers.

**Use cases**

- A Free user chats and Auto picks a text model.
- A developer lists models over the API and gets only chat-capable ones.
- A CLI user prints the model list and sees context and output sizes beside capability letters.
- An engineer adds a model to the curation file and it shows up in every app after sync.

## 2. User experience

**Where to find it**

- Web: the model picker in the composer (ModelCatalogue.tsx); a model card lists capability chips and shows 'Text only' when no chip applies (ModelCatalogue.tsx:310).
- Desktop: the public Desktop shows the hosted web app, so the same picker (doc: AGENTS.md section 5). Not verified in a running desktop app.
- Mobile: the model picker sheet (ModelPickerSheet.tsx) with rows from ModelRow.tsx and filter chips Instant, Economy, Images, Files (modelFilters.ts:14-35).
- CLI: --list-models or /models prints the catalog with ctx and out sizes and one letter per capability (provider.rs:165-215); /model detail view prints Tool use, Vision, Reasoning, Audio in/out, PDF (provider.rs:126-160).
- VS Code: the model quick pick built in modelConstants.ts, description shows capability label, speed, and detail line shows context and output sizes (modelConstants.ts:285-300).
- Chrome: the managed model picker (managedModelPicker.ts).
- API: GET /api/llm/v1/models (models/route.ts).

**Before you start**

- For managed (Cloud) models: a signed-in account on a plan that admits the model.
- For Local models: a downloaded on-device model (mobile) or a selected local model (web/desktop).

**Screens and controls**

- Web picker: model rows, capability chips (Vision, Reasoning, Tools, Search, Code execution, Image out, Video out, Audio in, Audio out), 'Text only' text, a model card with Context ceiling and Output ceiling facts (ModelCatalogue.tsx:100-150, 205-310).
- Mobile picker: row per model, long press to favourite, filter chips.
- CLI: a printed table, no interactive control for text flags.

**Journey**

1. Open the model picker (or run the CLI list command).
2. Pick a model from the list; only chat-type models are listed.
3. Type a message and send.
4. The reply streams back as text.

**What the person sees and gets**

- Web card shows 'Text only' when the model has no extra chip (ModelCatalogue.tsx:308-312).
- CLI shows 'ctx' and 'out' sizes per model (provider.rs:176-215).
- Models API returns context_window, max_output and a capabilities map (models/route.ts:88-112).

**Settings**

- Auto model choice in the picker (routing uses the text flags internally).
- No setting turns the text flags on or off; they come from the catalog file models.curation.json and are compiled by pnpm sync:models (doc: AGENTS.md section 4).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The compile step turns inputModalities and outputModalities into textInput/textOutput flags; with no modality list, textInput is true unless the model type is transcription and textOutput is true unless the type is a textless-output type (packages/ai/model-registry/scripts/compile.mjs:1603-1616).
- Auto routing demands textInput and textOutput for the simple_chat and general_chat quality floors and for the simple_chat task (packages/ai/model-registry/catalog/routing-policies.json:649-670); evaluateEligibility rejects a model that lacks a required capability (packages/ai/routing/src/auto.ts:1406-1412).
- The models API only lists chat, code, reasoning, multimodal and search model types (apps/web/app/api/llm/v1/models/route.ts:41, 146-148).
- CLI prints the catalog with context and output size and capability letters T V R P A (apps/cli/src/provider.rs:165-215).
- VS Code quick pick shows capability label, speed, context and output size (apps/extension-vscode/src/features/model-picker/modelConstants.ts:285-300).
- Auto never swaps the model silently on a route failure: candidates serve the same canonical model (packages/ai/routing/src/auto.ts:1137, 1570).

**Incomplete**

- The explicit-model path on the managed chat server was not found to re-check textInput/textOutput; admission by type list and by Auto policy is what was established. [inferred]
- Empty, waiting and failure states of the web picker were not read in full.

**Present but disconnected or switched off**

- none found in the code

**Not available**

- A per-model text flag is not shown as its own chip on Web (only a 'Text only' label when no other chip applies) (ModelCatalogue.tsx:308-312).
- The CLI list does not print input types as words; it prints capability letters (provider.rs:176-215).

## 4. Required behaviour

**Established requirements**

- The registry records text input per model and routing only admits models that accept text for every chat task, on each surface that sends chat (S76.01). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.01)
- The registry records text output per model and routing only admits models that produce text for chat tasks (S76.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.02)
- The model catalog is generated; edit models.curation.json then run pnpm sync:models; consumers resolve through model-catalog.ts. (source: doc: AGENTS.md section 4)
- Capabilities come from the registry, never from a provider name guess. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. Open the Web picker: no transcription, speech, image or video model appears as a chat choice.
2. Call GET /api/llm/v1/models: every listed model belongs to a chat-type model type and has context_window and max_output.
3. Send a plain text message with Auto: the reply is text and the routing trace shows a model with textInput and textOutput.
4. Run the CLI list: every row shows ctx and out sizes.
5. Mobile and VS Code pickers list the same chat models the web picker lists for the same plan (modulo surface rules).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every app should read text flags from the same generated catalog and never keep its own list. [inferred]
- A model with neither flag should be impossible to select for chat on any app. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a catalog check that every chat-type model has both text flags true.
- [proposed] Show a text-input and text-output chip on the web model card so the flags are visible, not implied.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | models.curation.json | `packages/ai/model-registry/catalog/models.curation.json` | Source of model capabilities and modalities. |
| job | registry compile | `packages/ai/model-registry/scripts/compile.mjs` | normalizeCapabilities derives textInput/textOutput (lines 1603-1640). |
| schema | registry schema | `packages/ai/model-registry/schema/registry.schema.json` | Defines the intrinsic capability names (line 734 onward). |
| config | routing policies | `packages/ai/model-registry/catalog/routing-policies.json` | Task policies requiring textInput and textOutput (lines 649-670). |
| service | Auto router eligibility | `packages/ai/routing/src/auto.ts` | evaluateEligibility rejects models lacking required capabilities (lines 1340-1412). |
| service | model catalog accessors | `packages/contracts/types/src/model-catalog.ts` | getModelMetadataById and ModelMetadata with inputModalities (lines 645-660, 1454). |
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Publishes chat-type models with capabilities, context and output limits. |
| component | ModelCatalogue | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Web picker list, chips, model card and 'Text only' label. |
| component | ComposerFooter | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Hosts the web model picker trigger and selection handling. |
| component | ModelPickerSheet and ModelRow | `apps/mobile/src/features/model-picker/components/ModelRow.tsx` | Mobile picker rows. |
| service | mobile model service | `apps/mobile/src/features/model-picker/service.ts` | Builds ModelDef rows from catalog and local models (lines 138-210). |
| command | CLI model list | `apps/cli/src/provider.rs` | format_model_list and format_model_detail print the catalog. |
| service | CLI catalog | `apps/cli/src/model_catalog.rs` | Loads the shared catalog and exposes supports_tools, supports_vision, supports_audio_input, supports_pdf (lines 205-225, 1058-1063). |
| component | VS Code model quick pick | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | Builds grouped quick pick items with capability, speed and limits. |
| service | Chrome managed model picker | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | Chrome model choices from the shared catalog. |
| test | registry contract tests | `packages/ai/model-registry/tests/registry-contract.test.mjs` | Registry contract checks. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A model is added or edited in the curation file and compiled into the generated registry. | device | packages/ai/model-registry/scripts/compile.mjs:1603-1640 (build-time step on a developer machine) |
| The person opens a picker; the app reads the generated catalog bundled in the app and lists chat-type models for the plan. | device | apps/web/features/chat/components/Composer/ModelCatalogue.tsx; apps/mobile/src/features/model-picker/service.ts:138-210 |
| On Web/CLI/Chrome the list of models the account may run also comes from the server. | our servers | apps/web/app/api/llm/v1/models/route.ts:140-160; apps/cli/src/provider.rs:200 region (AGI MANAGED CLOUD discovery) |
| On send, the server resolves Auto through routing policies that require textInput and textOutput, then calls the provider. | our servers | packages/ai/routing/src/auto.ts:1406-1412; packages/ai/model-registry/catalog/routing-policies.json:649-670 |
| The provider returns text, streamed back to the app. | outside service | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts (provider adapters under packages/ai/providers) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Capability flags per model | Generated registry files in packages/ai/model-registry/generated and packages/contracts/types/src/models.json (bundled into each app) | Ships with each app build; not synced at runtime | Changed only by catalog edit and regeneration |

**Models and providers.** Any provider route whose model carries both text flags can serve chat. Provider choice is made by routing, not by this feature. In Local mode the model is an on-device one (mobile service.ts builds Local rows with surface 'local').

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Managed chat needs a signed-in account; the list endpoint accepts public calls and shows fewer models (provider.rs 'public' versus 'authenticated' label). Local models on mobile need no account for the list itself; sign-in is a separate question. |
| Permissions | none found in the code for the text flags themselves. |
| Subscription | Which chat models are admitted depends on the plan (tierAllowedSlots in routing-policies.json:440-480; models/route.ts tier field). The text flags are not plan-gated. |
| Limits and metering | none found in the code for the flags. Context and output ceilings are shown separately. |
| Feature flags | Per-model and per-provider kill switches can hide a model from the list (apps/web/app/api/llm/v1/models/route.ts:128-138). |
| Model compatibility | A model needs both text flags for chat Auto policies; other model types are excluded by type list. |
| Provider restrictions | Provider and region policies filter routes before ranking (auto.ts evaluateEligibility 1340-1400). |
| Local mode | Local models are listed as on-device rows on mobile (service.ts:138-210) and as local selections on web/desktop (ComposerFooter.tsx:1130-1150). Text chat works with no paid subscription; whether local selection needs sign-in was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model has no extra capability | Web card shows 'Text only'. | apps/web/features/chat/components/Composer/ModelCatalogue.tsx:308-312 |
| Model not in catalog | Web compatibility check reports unknown_model and the switch is not blocked on that alone. | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1170-1182; model-compatibility.ts:170-185 |
| Plan does not admit the model | Web card shows 'Upgrade to use' with the plan label; CLI lists it under 'Locked on your plan'. | ModelCatalogue.tsx:300-303; apps/cli/src/provider.rs:238-262 |
| Model temporarily unavailable | Web shows unavailable text; CLI lists it under temporarily unavailable. | ModelCatalogue.tsx:296-298; apps/cli/src/provider.rs:228-236 |
| Discovery fails (CLI) | Prints 'AGI MANAGED CLOUD: discovery unavailable'. | apps/cli/src/provider.rs:264-269 |
| Route fails for a model under Auto | Other routes for the same model are tried; no different model is substituted. | packages/ai/routing/src/auto.ts:1137, 1570 |
| Empty picker, offline picker | not handled in the code that was read; unknown. | not established |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/model-registry/tests/registry-contract.test.mjs`: Registry contract shape (file exists; exact assertions not read).
- `apps/cli/src/provider.rs`: Inline tests that the catalog is non-empty, has no duplicates, has positive context windows and has the expected provider families (lines 340-410).
- `apps/mobile/src/features/model-picker/__tests__/ModelPickerSearch.test.tsx`: Mobile picker search (file exists; assertions not read).
- `apps/web/features/chat/components/Composer/ComposerFooter.modelSwitch.test.tsx`: Web model switching in the composer footer (file exists; assertions not read).

**Test scenarios**

- **Chat list excludes non-chat models**
  1. Sign in on Web on localhost.
  2. Open the model picker.
  3. Scan the list and filters.
  - Expected: No transcription, speech, image or video model is offered as a chat model.
- **API list shape**
  1. Call GET /api/llm/v1/models with a valid key.
  2. Read each record.
  - Expected: Each record has context_window, max_output and a capabilities map with image_input, audio_input, video_input, structured_output, function_calling, reasoning.
- **CLI list**
  1. Run the CLI with --list-models.
  - Expected: Models are grouped by provider with capability letters, ctx and out sizes; a managed section shows locked models.
- **Text-only chat with Auto**
  1. Pick Auto.
  2. Send a short text message.
  - Expected: A text reply arrives from a text-capable model.
- **Per-app parity**
  1. With the same plan, compare the chat model lists on Web, Mobile, CLI and VS Code.
  - Expected: Same chat models, differing only by surface rules.

**Where to look when it fails**

- Routing trace reasons such as 'lacks intrinsic capability textInput' (packages/ai/routing/src/auto.ts:1411).
- pnpm check:model-catalog and pnpm sync:models:check (doc: AGENTS.md section 4).
- Generated registry: packages/ai/model-registry/generated/registry.json.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/076-model-capability-registry.md](../../70-qa/test-plans/web/076-model-capability-registry.md)
- Desktop: [70-qa/test-plans/desktop/076-model-capability-registry.md](../../70-qa/test-plans/desktop/076-model-capability-registry.md)
- Mobile: [70-qa/test-plans/mobile/076-model-capability-registry.md](../../70-qa/test-plans/mobile/076-model-capability-registry.md)
- CLI: [70-qa/test-plans/cli/076-model-capability-registry.md](../../70-qa/test-plans/cli/076-model-capability-registry.md)
- VS Code: [70-qa/test-plans/vscode/076-model-capability-registry.md](../../70-qa/test-plans/vscode/076-model-capability-registry.md)
- Chrome: [70-qa/test-plans/chrome/076-model-capability-registry.md](../../70-qa/test-plans/chrome/076-model-capability-registry.md)

## 10. Gaps and dependencies

- **The text flags are implied, not shown, on Web and CLI.** Affects: Web and CLI users; testers.. Evidence: ModelCatalogue.tsx:308-312; provider.rs:176-215. Work needed: Decide whether to show them; if yes add a chip or letter.
- **The brief cites routing-policies.json:459 and ModelCatalogue.tsx:214 as the text-admission code; at those lines the files hold tier slot lists and ModelCatalogue code unrelated to text flags.** Affects: Engineers following the brief.. Evidence: routing-policies.json:440-480; ModelCatalogue.tsx:205-215. Work needed: Update the brief's code pointers to the lines listed in the implementation map.
- **No evidence was found of a server-side re-check of text flags for an explicitly chosen model.** Affects: API and all apps when a non-chat model id is sent.. Evidence: request-processor.ts searched for textInput; no hit. Work needed: Confirm by test, or add a check.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-api-and-contracts
- SYS-local-inference
- SYS-subscriptions-entitlements-and-usage
- file:packages/ai/model-registry/catalog/models.curation.json
- file:packages/ai/routing/src/auto.ts
- api:GET /api/llm/v1/models
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- surface:desktop
- mode:cloud
- mode:local

## Unknown

- Whether any app lists a non-chat model as chat in an edge case (empty or offline picker states not read).
- Whether Desktop (Electron) shows exactly the web picker; only the project rule says so.
- Whether local selection on web/desktop requires sign-in.
- Exact assertions of the registry contract test.
