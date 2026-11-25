---
id: "F076-06"
type: "feature"
title: "Reasoning effort and sampling controls"
aliases: ["Reasoning effort", "Effort control", "Thinking effort", "Extended thinking effort", "Sampling parameters", "Sampling controls", "S76.26", "S76.27", "supportedEfforts", "defaultEffort", "rejectsSamplingParameters", "Effort slider", "Effort flyout"]
area: "76 Model-capability registry"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S76.26", "S76.27"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "SYS-chat-turn-pipeline", "SYS-authorization-and-workspaces", "SYS-shared-ui-and-design", "api:POST /api/llm/v1/chat/completions", "api:GET /api/llm/v1/models", "file:apps/web/app/api/llm/v1/chat/completions/lib/request-parameters.ts", "provider:anthropic", "provider:openai", "provider:google", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:own-key", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F076-06 Reasoning effort and sampling controls

Lets a person choose how hard a reasoning model thinks, from Direct up to Maximum, showing only levels the model accepts and the plan allows. The server ignores an invalid effort and caps it by plan. Models that reject sampling settings get them dropped or the request refused.

Area: [76. Model-capability registry](README.md). Requirement items: [S76.26](../../10-requirements/capabilities/076-model-capability-registry.md#s7626), [S76.27](../../10-requirements/capabilities/076-model-capability-registry.md#s7627).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Reads each model's supported effort levels and default from the catalog, shows only those in each app, and sends the chosen level. Also stops sampling settings (top_p and similar) from reaching models that reject them.

**Why it exists.** Effort levels differ by model, and sending a level or sampling value a model rejects causes provider errors. Plan limits also cap effort.

**Who uses it.** Users who trade speed for depth on any app; API and CLI developers.

**Problems it solves**

- Showing a level the model cannot use.
- Provider 400 errors for unsupported sampling values.
- Effort above the plan's allowance.

**Use cases**

- Pick Quick for a fast answer and Deep for a hard problem.
- Free user sees higher levels marked as plan-gated.
- CLI user passes --effort and the CLI maps it to the nearest supported level.
- API caller sends top_p to a model that rejects it and gets a clear 400.

## 2. User experience

**Where to find it**

- Web: composer footer effort flyout, labelled 'Reasoning effort' with an 'Effort' heading and a 'Toggle extended thinking' switch (ComposerFooter.tsx:1889-1920). Level names: Direct, Brief, Quick, Balanced, Deep, Extended, Maximum (packages/contracts/types/src/design-system/effort.ts:3-11); 'Off' when thinking is off (ComposerFooter.tsx:145).
- Desktop: hosted web app (doc: AGENTS.md section 5).
- Mobile: effort slider EffortSlider.tsx and gauge EffortGauge.tsx (model-picker components).
- CLI: --effort flag (apps/cli/src/lib.rs:10911) and /effort command (claude_parity.rs:278; tui_app.rs:6452).
- VS Code: effort controls in the sidebar webview (ChatStateManager.ts:640-644); levels via supportedEffort (modelConstants.ts:370-377).
- Chrome: effort control in the side panel (side_panel.ts:1057-1066); state from getManagedEffortControlState (managedModelPicker.ts:308-345).
- API: effort string on the chat request (request-processor.ts:805).

**Before you start**

- A model that lists effort levels. With Auto, effort stays unresolved until a route is chosen (managedModelPicker.ts:308-318).
- Plan allowing the level.

**Screens and controls**

- Web slider with marks per supported level, a thinking switch where the model allows off, a usage-rate tooltip for costly models.
- Mobile slider with steps from the model.
- Chrome shows description text 'Applies to <model>.' or '<model> does not expose a reasoning-effort control.' (managedModelPicker.ts:325-345).

**Journey**

1. Select a reasoning model.
2. Open the effort control; only supported levels appear (plan-gated ones marked).
3. Pick a level.
4. Send; the app includes the level; the server keeps it only if valid and within plan.

**What the person sees and gets**

- Selected level label on the control (ComposerFooter.tsx:1889).
- Description line per level, e.g. 'A balance of reasoning depth and response time.' (effort.ts:17-24).
- API 400 unsupported_parameter: 'The selected model does not accept top_p. Remove it or choose a model that does.' (request-processor.ts:5153-5163).
- Thinking disabled message: 'Thinking is disabled for <model>; effort must be <level> or lower.' (request-processor.ts:1933-1936).

**Settings**

- Per-conversation or global effort (ComposerFooter.tsx:1014-1031).
- Mobile default effort scope (EffortSlider.tsx:46-72).
- VS Code per-model effort memory key agiWorkforce.modelReasoningEfforts (ChatStateManager.ts:1008).
- Workspace maximum reasoning effort (request-processor.ts:5836-5837).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Catalog holds reasoning with supportedEfforts, defaultEffort, control, canDisableThinking (packages/contracts/types/src/model-catalog.ts:2586 getModelReasoning; Rust model_catalog.rs:459-463).
- Web shows only the model's levels, splits plan-gated ones and clamps stored preference (ComposerFooter.tsx:1302-1395).
- Mobile steps come from supportedEfforts in effort order (EffortSlider.tsx:34-42).
- Server: effort is kept only if the model has an effort path in its reasoning request and the value is valid; otherwise ignored without error; clamped to plan entitlement and workspace cap (request-processor.ts:1812-1840, 5829-5840).
- Free trial turns with effort on a model without thinking are refused with free_trial_model_capability naming extended thinking (request-processor.ts:4380-4396).
- Chrome returns options minus plan-gated ones and clamps (managedModelPicker.ts:308-345); outbound effort resolved the same way (side_panel.ts:1057-1066).
- CLI maps the chosen effort to the nearest supported level for the model (apps/cli/src/models/streaming.rs:619-630; model_catalog.rs:1443-1459, 1493).
- VS Code snaps a requested effort to the nearest model level (modelConstants.ts:370-377).
- Sampling: the API refuses top_p, stop, seed, penalties, logit_bias or user that the route or model rejects, with 400 unsupported_parameter (request-parameters.ts:47-70; request-processor.ts:5153-5163); a model flagged rejectsSamplingParameters has top_p added to the rejected set (request-parameters.ts:48-51).
- Provider adapters omit temperature, top_p and top_k for a flagged model: Anthropic always (anthropic translate.ts:383-400), OpenAI route unless effort is none (openai sampling.ts:9-16; translate.ts:331-341).
- CLI drops temperature for flagged models (apps/cli/src/models/streaming.rs:688-693, 776).

**Incomplete**

- The brief lists sampling as done only for CLI and API; Web, Mobile, VS Code and Chrome have no sampling control (brief S76.27).
- Brief pointer 'modelConstants.ts:322-332' for VS Code effort does not hold; effort code is at 370-377 and in ChatStateManager.ts.
- The server refusal covers top_p and other listed parameters; temperature is accepted by the schema (request-processor.ts:632) and dropped by adapters, not refused.

**Present but disconnected or switched off**

- Web hides the effort control while a free promotion fixes reasoning (ComposerFooter.tsx:1320-1326).

**Not available**

- Sampling controls in Web, Desktop, Mobile, VS Code and Chrome UIs (brief S76.27).

## 4. Required behaviour

**Established requirements**

- The registry records per-model reasoning-effort levels and each surface offers and sends only those levels (S76.26). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.26)
- The registry records which models reject sampling parameters and requests drop them for those models (S76.27). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.27)
- Inference cost is a first-class design constraint; a stronger model is not a default because it is stronger. (source: doc: AGENTS.md section 7)

**Acceptance criteria**

1. On Web pick a model with a short effort ladder: only those levels appear.
2. On Free, levels above the default are marked gated and cannot be sent.
3. API: send an invalid or unsupported effort: the request succeeds with the effort ignored.
4. API: send top_p to a model that rejects it: 400 unsupported_parameter naming top_p.
5. CLI with a flagged model and --temperature: the request body carries no temperature.
6. Mobile slider shows exactly the model's levels in order.
7. VS Code: a stored effort not supported by a newly chosen model snaps to the nearest supported level.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Effort and sampling rules should hold the same on every route for the same model. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Return a notice when an effort is ignored, so API callers learn of it.
- [proposed] Unify the temperature behaviour (drop versus refuse) with top_p.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | reasoning block per model | `packages/ai/model-registry/catalog/models.curation.json` | supportedEfforts, defaultEffort, rejectsSamplingParameters, request paths. |
| service | getModelReasoning and effort helpers | `packages/contracts/types/src/model-catalog.ts` | Reasoning accessors and resolveModelEffort (lines 2586, 2671). |
| config | effort labels | `packages/contracts/types/src/design-system/effort.ts` | Effort type, labels and descriptions. |
| service | request-processor effort | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | resolveRequestEffort, plan clamp, thinking config, sampling refusal. |
| service | request-parameters | `apps/web/app/api/llm/v1/chat/completions/lib/request-parameters.ts` | Accepted and refused sampling-style parameters. |
| service | OpenAI sampling | `packages/ai/providers/openai/src/sampling.ts` | acceptsSamplingParameters. |
| service | Anthropic translate | `packages/ai/providers/anthropic/src/translate.ts` | Drops sampling for flagged models (383-400). |
| component | ComposerFooter | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Web effort flyout and plan gating. |
| component | EffortSlider | `apps/mobile/src/features/model-picker/components/EffortSlider.tsx` | Mobile slider and effort scope store. |
| component | EffortGauge | `apps/mobile/src/features/model-picker/components/EffortGauge.tsx` | Mobile gauge. |
| service | CLI catalog effort | `apps/cli/src/model_catalog.rs` | effort_support, nearest_supported_effort, model_rejects_sampling_parameters (1443-1534). |
| service | CLI streaming | `apps/cli/src/models/streaming.rs` | effort_level mapping and effective_temperature. |
| command | CLI effort command | `apps/cli/src/claude_parity.rs` | /effort (line 278). |
| service | VS Code effort helpers | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | supportedEffort (370-377). |
| service | VS Code chat state | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | effortChanged messages, saved efforts. |
| service | developer effort ladder | `packages/contracts/local-runtime/src/developer-session.ts` | developerEffortLevels (line 135). |
| service | Chrome effort state | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | getManagedEffortControlState and outbound effort. |
| service | Chrome side panel effort | `apps/extension/src/side_panel.ts` | Effort UI refresh and payload (1014-1066). |
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Publishes request_parameters per model. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app reads the model's effort ladder from the bundled catalog and shows only supported levels, marking plan-gated ones. | device | ComposerFooter.tsx:1302-1340; EffortSlider.tsx:34-42; managedModelPicker.ts:308-345 |
| The chosen level is sent with the request (field effort). | device and our servers | side_panel.ts:1057-1066; request-processor.ts:805 |
| The server validates the level against the model, clamps by plan and workspace cap, builds the provider thinking settings. | our servers | request-processor.ts:1824-1840, 5829-5850 |
| The server refuses unsupported sampling-style parameters; adapters omit sampling for flagged models. | our servers | request-processor.ts:5153-5163; anthropic translate.ts:383-400 |
| CLI maps effort to the nearest supported level and sends it to the provider or the managed route. | device | streaming.rs:619-630 |
| The provider reasons with the given effort and answers. | outside service | provider adapters in packages/ai/providers |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chosen effort | Web: thinking store per conversation or global; Mobile: agent control store scope; VS Code: extension state key agiWorkforce.modelReasoningEfforts | unknown | Local to the app; deletion rules not read |

**Models and providers.** Effort applies only to models with an effort path in their reasoning request; Anthropic, OpenAI and Google style fields are chosen from the catalog (model_catalog.rs EffortParameter; request-processor.ts:1816-1822).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Effort levels are shown without account on the local clamp; Cloud sends need sign-in. |
| Permissions | Workspace controls can cap reasoning effort (request-processor.ts:5836-5837). |
| Subscription | Plan entitlement clamps effort (clampEffortToEntitlement; Free gates levels above default per test apps/extension/__tests__/managed-model-picker.test.ts:216). |
| Limits and metering | Higher effort uses more usage; Web shows a usage-rate tooltip for costly models (ComposerFooter.tsx:300-310 region). Exact metering rules not read. |
| Feature flags | Free promotion fixes reasoning (ComposerFooter.tsx:1320-1326). |
| Model compatibility | Model must expose effort levels; models rejecting sampling get parameters dropped or refused. |
| Provider restrictions | Harness requestParameters lists which sampling-style fields a route accepts (harnesses.json:36, 133, 160). |
| Local mode | CLI Local and own-key map effort the same way using the catalog (streaming.rs:619-630: unknown models get no effort unless Managed). Mobile local models: supportsThinking false in local rows (service.ts:162), so no effort control; Web local selection: not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model without effort levels | Mobile offers nothing; Chrome says it does not expose the control; Web hides the control. | ComposerEffort.test.tsx:65; managedModelPicker.ts:330-337; ComposerFooter.tsx:1318-1325 |
| Auto selected | Effort unresolved until a route exists; description says Auto chooses after routing. | managedModelPicker.ts:316-322 |
| Stored effort not supported by new model | Web resets to the model default; VS Code snaps to nearest. | ComposerFooter.tsx:1370-1372; modelConstants.ts:370-377 |
| Effort invalid or unsupported on server | Ignored, no error. | request-processor.ts:1824-1840 |
| Thinking disabled with high effort | Error that effort must be at or below a maximum. | request-processor.ts:1933-1936 |
| Sampling parameter refused | 400 unsupported_parameter. | request-processor.ts:5153-5163, 3197-3211 |
| Unknown model in CLI | No effort sent unless Managed. | streaming.rs:619-630 |
| Offline, retry, accessibility | Web slider has aria-labels 'Reasoning effort' (ComposerFooter.tsx:1889, 1908); other states not handled in the code read. | ComposerFooter.tsx:1889-1912 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/ComposerEffort.test.tsx`: Offers nothing for a model with no effort levels; names the level on the button; gauge needle positions.
- `apps/extension/__tests__/managed-model-picker.test.ts`: Auto effort unresolved, full ladder with manual selection, Free gating above default, never sending an effort the plan lacks.
- `apps/web/app/api/llm/v1/chat/completions/lib/reasoning-thinking.test.ts`: Thinking config per provider and effort handling.
- `packages/contracts/types/src/__tests__/reasoning-availability.test.ts`: Reasoning availability (assertions not read).
- `apps/cli/src/models/streaming.rs`: Inline tests: effective_temperature drops sampling for flagged models; own-key effort sent; chat-completions reasoning effort (lines 1629-1660, 2281-2330).
- `apps/cli/src/model_catalog.rs`: Inline test that every effort parameter the catalog names is one the CLI can send (line 1934).

**Test scenarios**

- **Levels match the model**
  1. Pick a model with a short ladder on Web.
  2. Open the effort control.
  3. Repeat on Mobile and Chrome.
  - Expected: Same supported levels appear on each app; no extra marks.
- **Free gating**
  1. Sign in as a Free user.
  2. Open the effort control on a reasoning model.
  - Expected: Levels above the default are gated with an upgrade hint; none can be sent.
- **Invalid effort over API**
  1. Send effort 'bogus' to a reasoning model.
  - Expected: Request succeeds; no effort applied.
- **Sampling refusal**
  1. Send top_p to a model with rejectsSamplingParameters.
  - Expected: 400 unsupported_parameter.
- **CLI temperature drop**
  1. Run the CLI with --temperature on a flagged model.
  2. Inspect the request.
  - Expected: No temperature in the body.
- **Model switch resets effort**
  1. Set a high effort on one model.
  2. Switch to a model that lacks that level.
  - Expected: Effort resets or snaps to a supported level.

**Where to look when it fails**

- API error code unsupported_parameter with param name.
- Console warning '[SidePanel] Ignored unsupported Managed Cloud effort metadata' (side_panel.ts:1016).
- Routing trace for effort in request-processor logs (effectiveEffort at 5829).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/076-model-capability-registry.md](../../70-qa/test-plans/web/076-model-capability-registry.md)
- Desktop: [70-qa/test-plans/desktop/076-model-capability-registry.md](../../70-qa/test-plans/desktop/076-model-capability-registry.md)
- Mobile: [70-qa/test-plans/mobile/076-model-capability-registry.md](../../70-qa/test-plans/mobile/076-model-capability-registry.md)
- CLI: [70-qa/test-plans/cli/076-model-capability-registry.md](../../70-qa/test-plans/cli/076-model-capability-registry.md)
- VS Code: [70-qa/test-plans/vscode/076-model-capability-registry.md](../../70-qa/test-plans/vscode/076-model-capability-registry.md)
- Chrome: [70-qa/test-plans/chrome/076-model-capability-registry.md](../../70-qa/test-plans/chrome/076-model-capability-registry.md)

## 10. Gaps and dependencies

- **Server silently ignores an invalid or unsupported effort.** Affects: API callers.. Evidence: request-processor.ts:1824-1840. Work needed: Optionally surface an ignored-effort notice.
- **Sampling controls exist only in CLI and API.** Affects: Web, Desktop, Mobile, VS Code, Chrome.. Evidence: brief S76.27. Work needed: Decide if apps need them.
- **Temperature is dropped, not refused, while top_p is refused; behaviour differs by parameter.** Affects: API callers.. Evidence: request-parameters.ts:47-70 versus anthropic translate.ts:396. Work needed: Document or unify.
- **Brief code pointers for VS Code effort (modelConstants.ts:322-332) and CLI (model_catalog.rs:1740-1763) are stale.** Affects: Engineers.. Evidence: modelConstants.ts:370-377; model_catalog.rs:1443-1459. Work needed: Refresh brief.
- **Local model effort on Mobile is absent by design (supportsThinking false).** Affects: Mobile Local.. Evidence: service.ts:162. Work needed: Confirm intended.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- SYS-chat-turn-pipeline
- SYS-authorization-and-workspaces
- SYS-shared-ui-and-design
- api:POST /api/llm/v1/chat/completions
- api:GET /api/llm/v1/models
- file:apps/web/app/api/llm/v1/chat/completions/lib/request-parameters.ts
- provider:anthropic
- provider:openai
- provider:google
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:own-key
- mode:local

## Unknown

- How plan usage is metered for higher effort.
- Whether Web local selection offers effort.
- Where Desktop (Electron) differs from Web.
- Whether the VS Code webview shows only supported levels (code path via developerEffortLevels not fully read).
- Sync of chosen effort between devices.
