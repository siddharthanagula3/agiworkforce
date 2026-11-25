---
id: "F015-07"
type: "feature"
title: "Capability and cost badges"
aliases: ["Capability and cost badges", "Capability chips", "Capability filter", "About card (model detail card)", "Price band", "Context ceiling / Output ceiling", "High usage-rate hint", "Input/output modality badges (brief S15.12-S15.15, S15.17)"]
area: "15 Model-selector interface"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S15.12", "S15.13", "S15.14", "S15.15", "S15.17"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:apps/web/features/chat/components/Composer/ModelCatalogue.tsx", "file:packages/ai/routing/src/model-picker.ts", "api:GET /api/models/catalogue", "api:GET /api/llm/v1/models"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F015-07 Capability and cost badges

Shows what each model can do and how heavy it is. Web and Desktop list capabilities as filter chips and in a model detail card, with context and output limits and credit estimates there. Short-list rows show a price band and a high-usage hint. Mobile offers four filters; CLI, VS Code and Chrome show text details.

Area: [15. Model-selector interface](README.md). Requirement items: [S15.12](../../10-requirements/capabilities/015-model-selector-interface.md#s1512), [S15.13](../../10-requirements/capabilities/015-model-selector-interface.md#s1513), [S15.14](../../10-requirements/capabilities/015-model-selector-interface.md#s1514), [S15.15](../../10-requirements/capabilities/015-model-selector-interface.md#s1515), [S15.17](../../10-requirements/capabilities/015-model-selector-interface.md#s1517).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person compare models before choosing one: which inputs and outputs a model handles, whether it can use tools, how much text it can hold, and how fast it uses up the plan allowance. The data comes from the shared model catalogue, never from a per-app list.

**Why it exists.** A person should not pick a model that cannot read their image, cannot use tools, or burns their allowance quickly, and then find out after a failed or costly turn. The product contract says the selector shows 'Context/tool/multimodal support where useful' (doc: docs/product/experience-contract.md, section 7.3) and that unsupported capabilities are visible (doc: docs/product/requirements.md, M-MODEL-005).

**Who uses it.** Anyone choosing a model in Web, Desktop, Mobile, CLI, VS Code or Chrome; developers reading the public models list.

**Problems it solves**

- Picking a model that cannot read images, audio or tools.
- Not knowing a model's context size before pasting a long document.
- Not knowing a model eats the usage allowance faster than others.
- Guessing which models are fast or heavy.

**Use cases**

- On Web, open the model menu, choose 'All models', press the 'Vision' filter chip, and see only models that read images.
- On Web, press the question-mark button beside a row to open the About card and read 'Context ceiling', 'Output ceiling' and 'Credits per 1M tokens'.
- On the CLI, run /models to list models with T/V/R/P/A flags, context and output size.
- A developer calls the public models endpoint to read context_window, max_output and capabilities.

## 2. User experience

**Where to find it**

- Web and Desktop (Desktop shows the hosted web app, AGENTS.md section 5): composer footer model button, then the 'All models' row opens the catalogue with the chip group 'Filter by capability' (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1738; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:677). Row button 'About <model name>' opens the About card (ModelCatalogue.tsx:601-608).
- Web and Desktop short list: each row can show a price band and a tooltip 'consumes usage limits faster than other models' (ComposerFooter.tsx:697-701).
- Mobile: model sheet filter chips 'Instant', 'Economy', 'Images', 'Files' (apps/mobile/src/features/model-picker/modelFilters.ts:12-38; components/ModelFilterChips.tsx:34-63). Shown only when the sheet scope is not local (components/ModelPickerSheet.tsx:327,825).
- CLI: /model picker row ends with a tier word and 'NNNK ctx' (apps/cli/src/tui/widgets/model_picker.rs:511-594,637-662); /models lists T V R P A flags with context and output (apps/cli/src/provider.rs:165-215); '/models <name>' prints Context window, Max output, Pricing, Tool use, Vision, Reasoning, Audio in/out, PDF (provider.rs:126-160; tui/tui_app.rs:5842-5846).
- VS Code: 'Select Model' quick pick, command agi-workforce.selectModel; row description and detail lines (apps/extension-vscode/src/core/commandSetup.ts:1302; features/model-picker/modelConstants.ts:276-300).
- Chrome: side panel model menu; 'All capabilities' dropdown with Vision, Reasoning, Tools, Web search, Code execution, Image generation, Video generation (apps/extension/src/side_panel.ts:11285-11300; _locales/en/messages.json keys spModelsCapability and spModels*).

**Before you start**

- The model catalogue must load: Web calls the catalogue endpoint when the menu opens (apps/web/features/chat/lib/use-model-catalogue.ts:70-103).
- Free users do not get the full catalogue: an effect closes it when the plan is Free (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1053-1056).
- Mobile filters need a cloud-capable scope; the local-only sheet has no filters (ModelPickerSheet.tsx:327).

**Screens and controls**

- Web catalogue: search field 'Search models'; developer rail; chip group 'Filter by capability' with Vision, Reasoning, Tools, Search, Code execution, Image out, Video out, Audio in, Audio out, plus 'Open weight' (ModelCatalogue.tsx:124-160,677-710).
- Web row tags: 'New', 'Router', stage label, price band or 'Free', and lock tags (ModelCatalogue.tsx:520-583). No capability badge is drawn on the row.
- Web short-list row: capability names are placed in a screen-reader-only description, not drawn (ComposerFooter.tsx:660,695); a test asserts this (apps/web/features/chat/components/Composer/__tests__/ComposerFooter.picker-parity.test.tsx:294).
- Web About card facts: Family, Typical message, Credits per 1M tokens, Context ceiling, Output ceiling, Released; then 'Capabilities' chips or 'Text only', plus 'Open weight' (ModelCatalogue.tsx:233-340).
- Mobile: four toggle chips with accessibility label '<name> models only' (ModelFilterChips.tsx:45).

**Journey**

1. Open the model menu from the composer.
2. Web: choose 'All models' to open the catalogue. Mobile: the sheet opens with filter chips above the list. CLI: type /model. VS Code: run Select Model. Chrome: open the model menu and choose the capability dropdown.
3. Press a capability filter (or read the row text).
4. Optional on Web: press the question-mark button to read the About card with context, output and credit figures.
5. Pick the model; the choice itself is covered by the explicit-selection feature, not here.

**What the person sees and gets**

- Web: filter chips report pressed state (aria-pressed); an empty result shows 'No models match' (ModelCatalogue.tsx:734-736).
- Web card shows only facts that exist; missing facts are dropped, not shown as placeholders (ModelCatalogue.tsx:260-262; test ModelCatalogue.about-card.test.tsx).
- CLI /models flags: T tools, V vision, R reasoning, P pdf, A audio input (provider.rs:184-188).

**Settings**

- None found that change these badges. The credit read-out on Web is not user-configurable.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop catalogue: 9 capability filter chips from catalogue data plus 'Open weight' (ModelCatalogue.tsx:124-160,697-709). The server projects capability flags per model (apps/web/lib/server/model-catalogue.ts, function projectCapabilities and the CatalogueEntry.capabilities field).
- Web About card shows context and output limits, formatted as K or M (ModelCatalogue.tsx:183-190,233-262), and credit estimates for models that are not free (ModelCatalogue.tsx:233-262).
- Web short list: price band mark and high-usage tooltip for models whose picker tier is 'premium' (ComposerFooter.tsx:307-309,697-701; packages/ai/routing/src/model-picker.ts:136).
- Public models endpoint publishes context_window, max_output, capabilities (image_input, audio_input, video_input, structured_output, function_calling, reasoning), deprecation_date and request_parameters (apps/web/app/api/llm/v1/models/route.ts:41-82,89-122).
- Mobile filters Instant, Economy, Images, Files (modelFilters.ts:12-38).
- CLI /models and '/models <name>' show tools, vision, reasoning, pdf, audio flags, context and output (provider.rs:126-215); the picker row shows a context column (model_picker.rs:637-662).
- VS Code rows show plan label, 'Thinking', speed label, and 'NK context' and 'NK output' in the detail line (modelConstants.ts:276-300).
- Chrome capability dropdown filters by capability key from the shared picker logic (side_panel.ts:11285-11300; apps/extension/src/features/cloud-bridge/managedModelPicker.ts:249-266).

**Incomplete**

- Web/Desktop: the brief says input, output and tool badges appear on each row, but rows only carry capability names for screen readers; the visible form is the filter chips and the About card (ComposerFooter.tsx:695; ModelCatalogue.tsx:520-583).
- Web catalogue has no chip for video input or document input, although the brief lists them; chips cover vision, audio in and out, image out, video out (ModelCatalogue.tsx:124-160).
- Usage-rate hint exists only on short-list rows; catalogue rows and the About card do not carry it (ModelCatalogue.tsx has no usage-rate text).
- CLI picker rows show no input or tool badge; those appear only in /models (model_picker.rs:511-594 vs provider.rs:184-188). The brief's cite tui_app.rs:3454-3458 is not that code.
- VS Code shows context and output size but no input, output or tool badge (modelConstants.ts:276-300).
- Chrome has only the capability filter; no context or cost information was found in the picker code read (side_panel.ts:10967-11046).

**Present but disconnected or switched off**

- CAPABILITY_GLYPHS (icon plus label per capability) is defined but only the labels are used, as screen-reader text (ComposerFooter.tsx:182-190,695).

**Not available**

- Mobile: no output, tool, context or cost badge (ModelRow.tsx:1-392 shows only install state, outage, lock, retirement and favourite marks).
- CLI local models have a context size of 0, so the context column is blank (tui_app.rs:3384-3410; model_picker.rs:637-662 blanks it when ctx_k is 0).

## 4. Required behaviour

**Established requirements**

- Models show which inputs they accept as badges. (source: brief S15.12 (status: web done, desktop done, cli done, vscode missing, chrome missing))
- Models show which outputs they produce as badges. (source: brief S15.13 (status: web done, desktop done, mobile/cli/vscode/chrome missing))
- Models show whether they can use tools. (source: brief S15.14 (status: web done, desktop done, cli done, mobile/vscode/chrome missing))
- The selector shows how much context each model can hold. (source: brief S15.15 (status: web, desktop, cli, api done; mobile, vscode, chrome missing))
- The selector shows how much each model costs or how fast it uses the allowance. (source: brief S15.17 (status: web, desktop, cli, vscode done; mobile, chrome missing))
- The selector renders context, tool and multimodal support where useful, and no surface owns a model list. (source: doc: docs/product/experience-contract.md section 7.3)
- Unsupported capabilities are visible; file, image and tool controls respond to the selected model. (source: doc: docs/product/requirements.md, M-MODEL-005)

**Acceptance criteria**

1. On Web, 'All models' then pressing 'Vision' leaves only models whose catalogue capability imageInput is true; pressing it again clears the filter.
2. On Web, the About card for a priced model shows 'Context ceiling' and 'Output ceiling' in K or M, and for a free-pool model shows 'Free, uses no credits' in place of credit figures.
3. On Web, a short-list row of a top-tier model shows a tooltip saying it consumes usage limits faster; a mid-tier row shows none.
4. On Mobile, pressing 'Images' leaves only models with vision, and pressing 'Files' leaves models with document or pdf input; the chips do not appear in the local-only sheet.
5. On the CLI, '/models <name>' prints Context window, Max output, Tool use, Vision and PDF values equal to the shared catalogue entry.
6. The public models endpoint returns context_window greater than 0 for every model it lists, and omits models without a context size (route.ts:92-99).
7. No surface shows a capability the catalogue does not list for that model.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Visible badges on each row would make the 'badge' wording in the brief true; today the catalogue treats capabilities as filters and card content [inferred].
- The credit figures in the About card are computed in the browser from a shared estimates module, while the server comment says per-million prices are withheld from the payload [inferred; apps/web/lib/server/model-catalogue.ts comment on priceBand; ModelCatalogue.tsx:20-24 imports credit-estimates].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Draw the capability glyphs on catalogue rows (the glyph map already exists) and keep the screen-reader text.
- [proposed] Add video-input and document-input chips, using the catalogue's existing modality data.
- [proposed] Give Mobile a read-only model detail view with context, tools and cost, reusing the shared picker logic.
- [proposed] Show the high-usage hint in the catalogue and in VS Code and Chrome from the same shared tier function.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ModelCatalogue | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Web and Desktop full catalogue: capability chips (124-160), rows (447-611), About card (233), list states (712-740). |
| component | ComposerFooter (ModelRow, rowGuidance, tooltip) | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Short-list rows, price band, high-usage tooltip (697-701), screen-reader capability text (695). |
| service | buildModelPickerShortList and capability helpers | `packages/ai/routing/src/model-picker.ts` | Shared capability keys (29-51), resolveModelCapabilityKeys (140), price band (136), guidance (151-164), short list (272). |
| service | model-catalogue projection | `apps/web/lib/server/model-catalogue.ts` | Builds per-plan catalogue entries with capabilities, contextTokens, maxOutputTokens, priceBand. |
| endpoint | GET /api/models/catalogue | `apps/web/app/api/models/catalogue/route.ts` | Serves the plan-aware catalogue to the Web picker (lines 71-115). |
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Public list with context_window, max_output, capabilities, deprecation_date, request_parameters. |
| hook | useModelCatalogue | `apps/web/features/chat/lib/use-model-catalogue.ts` | Fetches the catalogue and exposes status idle/loading/ready/error (70-103). |
| service | credit estimates | `apps/web/lib/billing/credit-estimates.ts` | Imported by the About card for typical message credits and credits per million tokens (ModelCatalogue.tsx:20-24). File content not read. |
| component | ModelFilterChips and MODEL_FILTERS | `apps/mobile/src/features/model-picker/modelFilters.ts` | Mobile Instant, Economy, Images, Files filters; chips in components/ModelFilterChips.tsx. |
| component | ModelPickerSheet | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | Hosts filter chips only when scope is not local (327,825). |
| component | CLI model picker | `apps/cli/src/tui/widgets/model_picker.rs` | Row with tier word and context column (511-594,637-662); detail line (424-468). |
| command | /models and format_model_list | `apps/cli/src/provider.rs` | Capability flags, context, output, pricing text (126-215). |
| service | Quick pick builder | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | VS Code description and detail lines with plan, speed and limits (209-330). |
| service | managed model picker | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | Chrome options, capability keys, filterManagedModelOptions (249). |
| screen | side panel model menu | `apps/extension/src/side_panel.ts` | Chrome capability dropdown and row rendering (10967-11046,11285-11300). |
| test | About card tests | `apps/web/features/chat/components/Composer/__tests__/ModelCatalogue.about-card.test.tsx` | Covers About card facts and credit rows. |
| test | picker parity tests | `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.picker-parity.test.tsx` | Covers row layout, screen-reader-only capabilities, plan marks. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens the model menu; Web fetches the plan-aware catalogue and, separately, provider availability. | device and our servers | apps/web/features/chat/lib/use-model-catalogue.ts:70-103; ComposerFooter.tsx:223-232,922-928 |
| Server builds catalogue entries for the caller's plan: capabilities, context, output, price band, admission. Kill switches and training opt-out filter the list. | our servers | apps/web/app/api/models/catalogue/route.ts:71-97; apps/web/lib/server/model-catalogue.ts (toCatalogueEntry) |
| Browser filters the entries by the chips and renders rows; opening the About card computes credit figures in the browser. | device | ModelCatalogue.tsx:349-445,233-262 |
| Mobile filters its own model list with shared catalogue metadata on the device. | device | modelFilters.ts:12-42 |
| CLI reads the bundled shared catalogue and prints flags; it makes no network call for /models. | device | apps/cli/src/provider.rs:126-215 (reads model_catalog) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Capability, context and cost data | Generated model catalogue in the shared types package (packages/contracts/types/src/models.json, never hand-edited per AGENTS.md section 4) | Bundled with each app; Web also receives a per-plan projection from the server | Replaced on each release; nothing is stored per user for this feature |
| Active filter chips | Component state in memory (ModelCatalogue.tsx:362-364); mobile component state (ModelPickerSheet.tsx:273-275 area) | No | Cleared when the menu closes |

**Models and providers.** The feature reads facts about every model in the catalogue; it never calls a model. Capability flags come from the registry, not from a provider name (apps/web/features/chat/components/Composer/model-compatibility.ts:91-96 comment). Cost figures depend on the plan and on whether the model is in a free pool.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web: the catalogue endpoint resolves the viewer and falls back to the anonymous plan when sign-in cannot be resolved (apps/web/app/api/models/catalogue/route.ts:52-69). CLI and Mobile list from bundled data without a request. |
| Permissions | none found in the code for viewing badges. |
| Subscription | The catalogue marks each model admitted or not for the plan; locked models still show their capabilities (apps/web/lib/server/model-catalogue.ts toCatalogueEntry). The public endpoint lists models by plan tier (route.ts function getVisibleModelsForTier). |
| Limits and metering | Catalogue endpoint is rate-limited under the key 'model-catalog' (route.ts:75). Credit figures are estimates; the usage-rate hint is tied to the 'premium' picker tier (ComposerFooter.tsx:307-309). |
| Feature flags | Kill switches remove a model or provider from the public list (apps/web/app/api/llm/v1/models/route.ts:135-138). A 'free lane' UI gate changes the locked-slot text (ComposerFooter.tsx, resolveFreeLaneUiEnabled). |
| Model compatibility | Badges are accurate only for models that exist in the catalogue; a model missing from it gets no badge and, on Web, an 'unknown_model' finding in the switch check (model-compatibility.ts:158-172). |
| Provider restrictions | Models whose providers are not configured in this deployment are not in the Web catalogue at all (model-catalogue.ts comment above toCatalogueEntry). The catalogue names the developer, never the supplier (test ModelCatalogue.supply-and-event.test.tsx). |
| Local mode | Local models discovered on a device carry no catalogue facts: Web shows only name and size (ComposerFooter.tsx:588-596); CLI shows a blank context column (tui_app.rs:3384-3410). Mobile local rows show file size and install state, not capabilities (ModelRow.tsx:87-95,253-269). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web catalogue shows 'Loading models…' while entries are empty. | ModelCatalogue.tsx:729-732 |
| Error | Web shows 'The model list could not be loaded.' with a 'Try again' button. | ModelCatalogue.tsx:713-728 |
| Empty | 'No models match' when filters and search leave nothing. | ModelCatalogue.tsx:733-736 |
| Missing facts | About card drops absent facts and shows 'Text only' when no capability applies. | ModelCatalogue.tsx:256-262,297-318 |
| Accessibility | Chip group has a label and pressed state; filters are kept out of the option list a screen reader walks; capability names are read through the row description. | ModelCatalogue.tsx:677-684; ComposerFooter.tsx:695-696; test ModelCatalogue.dead-control.test.tsx |
| Offline | not handled in the code beyond the load error and retry on Web; CLI and Mobile read bundled data. | use-model-catalogue.ts:103 |
| Mobile local-only sheet | No filter chips are drawn. | ModelPickerSheet.tsx:327,825 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/__tests__/ModelCatalogue.about-card.test.tsx`: About card facts, grid layout, credit rows for priced, free-pool and event models.
- `apps/web/features/chat/components/Composer/__tests__/ModelCatalogue.dead-control.test.tsx`: Selectable and refused rows, chip pressed state, filters kept out of the option list, rail counts.
- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.picker-parity.test.tsx`: Fixed-height rows, capabilities in the row description for screen readers only, top-plan mark, New mark.
- `apps/web/features/models/__tests__/ModelCatalogueBrowser.filters.test.tsx`: Capability narrowing on the models browser page.
- `packages/ai/routing/src/__tests__/model-picker.test.ts`: Shared short list, price bands, capability glyphs read from the registry entry.
- `apps/web/app/api/llm/v1/models/route.test.ts`: Public models endpoint (file listed; individual test titles not read).
- `apps/extension/__tests__/managed-model-picker.test.ts`: Chrome search by name and provider and catalogue capability filtering.
- `apps/mobile/__tests__/ModelPicker.test.tsx`: Mobile sheet cards and Free catalogue notes (filter chips not confirmed).

**Test scenarios**

- **Web capability filter**
  1. Sign in on a paid plan.
  2. Open the model menu, choose 'All models'.
  3. Press 'Vision', then 'Tools'.
  4. Press 'Vision' again.
  - Expected: List narrows to models with both flags, then to tool-capable models only; every visible row matches the catalogue flags.
- **About card limits**
  1. Open 'All models'.
  2. Press the question-mark button on a priced model.
  3. Compare Context ceiling and Output ceiling with the catalogue entry.
  - Expected: Values match contextTokens and maxOutputTokens, formatted as K or M; free-pool models show 'Free, uses no credits'.
- **High-usage hint**
  1. Open the short list on a plan that admits a top-tier model.
  2. Hover or focus its row.
  - Expected: Tooltip says the model consumes usage limits faster; a mid-tier row shows no tooltip.
- **Mobile filters**
  1. Open the picker in cloud scope on a paid plan.
  2. Press 'Images', then 'Files'.
  3. Open the picker in local scope.
  - Expected: Chips narrow the list; local scope shows no chips.
- **CLI details**
  1. Run /models then '/models <catalog model name>'.
  - Expected: Flags T V R P A and context and output sizes match the catalogue.

**Where to look when it fails**

- Web: network call to /api/models/catalogue and the log line 'Model catalogue projection served' (route.ts:88).
- Web: 'Failed to serve the model catalogue projection' error log and INTERNAL_ERROR body (route.ts:108-113).
- Public list: models without a positive context size are silently omitted (route.ts:92-99).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/015-model-selector-interface.md](../../70-qa/test-plans/web/015-model-selector-interface.md)
- Desktop: [70-qa/test-plans/desktop/015-model-selector-interface.md](../../70-qa/test-plans/desktop/015-model-selector-interface.md)
- Mobile: [70-qa/test-plans/mobile/015-model-selector-interface.md](../../70-qa/test-plans/mobile/015-model-selector-interface.md)
- CLI: [70-qa/test-plans/cli/015-model-selector-interface.md](../../70-qa/test-plans/cli/015-model-selector-interface.md)
- VS Code: [70-qa/test-plans/vscode/015-model-selector-interface.md](../../70-qa/test-plans/vscode/015-model-selector-interface.md)
- Chrome: [70-qa/test-plans/chrome/015-model-selector-interface.md](../../70-qa/test-plans/chrome/015-model-selector-interface.md)

## 10. Gaps and dependencies

- **Short-list rows carry no visible capability badges; capabilities are screen-reader text only.** Affects: Web and Desktop users scanning the short list. Evidence: ComposerFooter.tsx:660,695; ComposerFooter.picker-parity.test.tsx:294. Work needed: Decide the visible form, draw the existing glyphs, update the test.
- **No video-input or document-input chips, though the brief lists them.** Affects: Web and Desktop. Evidence: ModelCatalogue.tsx:124-160. Work needed: Add chips from catalogue modality data and extend the server capability projection if needed.
- **Mobile has no output, tool, context or cost information.** Affects: Mobile. Evidence: ModelRow.tsx:1-392; modelFilters.ts:12-38. Work needed: Add a detail view or row text from shared metadata; add tests.
- **CLI picker rows lack input and tool badges; only /models has them. Local rows have blank context.** Affects: CLI. Evidence: model_picker.rs:511-594; provider.rs:184-188; tui_app.rs:3384-3410. Work needed: Show flags in the picker detail line; fill context for discovered local models when the server reports it.
- **VS Code lacks input, output and tool badges; the brief's cite for a usage hint points at the plan label, not a cost hint.** Affects: VS Code. Evidence: modelConstants.ts:112-123,276-300. Work needed: Add capability text to the description or detail line; add a test (no test found for the quick-pick text).
- **Chrome shows only a capability filter, no context or cost.** Affects: Chrome. Evidence: side_panel.ts:11031,11285-11300. Work needed: Add context and cost text from the shared metadata.
- **The usage-rate hint exists only on the Web short list.** Affects: Web catalogue, Mobile, CLI, VS Code, Chrome. Evidence: ComposerFooter.tsx:697-701; no equivalent found in the other files read. Work needed: Expose the shared tier function and show the hint in each picker.
- **Brief line cites for this feature are stale (for example tui_app.rs:3454-3458, modelConstants.ts:94).** Affects: Documentation readers. Evidence: Code read in this review. Work needed: Refresh the brief from current code.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:apps/web/features/chat/components/Composer/ModelCatalogue.tsx
- file:packages/ai/routing/src/model-picker.ts
- api:GET /api/models/catalogue
- api:GET /api/llm/v1/models

## Unknown

- Whether the Web credit figures in the About card are meant to be shown, given the server comment withholding per-million prices (apps/web/lib/server/model-catalogue.ts).
- Contents of apps/web/lib/billing/credit-estimates.ts were not read.
- Whether Mobile's 'Files' filter matches every model the product treats as document-capable.
- Whether the free-plan catalogue is hidden by design on Web (effect found, intent not documented).
- Individual test titles in apps/web/app/api/llm/v1/models/route.test.ts.
