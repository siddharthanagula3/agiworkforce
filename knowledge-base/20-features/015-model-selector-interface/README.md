---
id: "AREA-015"
type: "area"
title: "Model-selector interface"
features: ["F015-01", "F015-02", "F015-03", "F015-04", "F015-05", "F015-06", "F015-07", "F015-08", "F015-09", "F015-10", "F015-11", "F015-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 15. Model-selector interface

The model selector is the control where a person sees which AI model will answer the next message, and picks a different one. It also decides which models the person may use on their plan, and says when an answer came from a different model than the one picked. Without it, people cannot choose between quick, strong or reasoning models, or know what each one costs in usage, so the choice of model becomes guesswork.

**Who uses it.** Every person who opens a chat in the Web, Desktop, Mobile, CLI, VS Code and Chrome surfaces. What each person may pick depends on the plan (read from the billing store on Web, and from the plan lock helpers on each surface). On Web, a Free plan person has the catalogue closed by an effect (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1052-1056), so the catalogue is shown only for paid plans in that code path. Developers use the public model list route (apps/web/app/api/llm/v1/models/route.ts) and the CLI flags. Workspace admins affect fast mode through a workspace block prop (ComposerFooter.tsx:845, 861). No separate admin screen was opened.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F015-01](F015-01-see-the-model-the-next-message-will-use.md) | See the model the next message will use | built | built | built | built | built | built |
| [F015-02](F015-02-browse-and-search-the-model-list.md) | Browse and search the model list | built | built | built | built | built | partly |
| [F015-03](F015-03-favourites-recent-models-and-recommended-list.md) | Favourites, recent models and recommended list | built | built | built | no | no | partly |
| [F015-04](F015-04-auto-and-default-for-new-chats.md) | Auto and default for new chats | built | built | built | built | built | built |
| [F015-05](F015-05-pick-a-model-and-keep-it.md) | Pick a model and keep it | built | built | built | built | built | built |
| [F015-06](F015-06-per-message-model-override.md) | Per-message model override | built | built | no | no | no | no |
| [F015-07](F015-07-capability-and-cost-badges.md) | Capability and cost badges | built | built | partly | partly | partly | partly |
| [F015-08](F015-08-speed-status-and-plan-labels.md) | Speed, status and plan labels | built | built | partly | partly | partly | partly |
| [F015-09](F015-09-reasoning-effort-fast-mode-and-response-style.md) | Reasoning effort, fast mode and response style | built | built | partly | partly | partly | partly |
| [F015-10](F015-10-sampling-and-provider-route-developer-controls.md) | Sampling and provider route (developer controls) | no | no | no | built | no | no |
| [F015-11](F015-11-local-and-own-key-routes.md) | Local and own-key routes | n/a | no | built | built | built | no |
| [F015-12](F015-12-switch-safety-fallback-and-substitution-notices.md) | Switch safety, fallback and substitution notices | built | built | partly | partly | partly | no |

Requirement items for this area: [10-requirements/capabilities/015-model-selector-interface.md](../../10-requirements/capabilities/015-model-selector-interface.md).

## How this area works in the code

1. **1. Open the selector and read the current model.** The composer footer reads the selected model id and routing profile from the model store, and the thinking and effort settings from the thinking store. The catalogue, favourites and local model hooks are set up here. The trigger text is built from the local model, Auto, or the model's provider and description. (`apps/web/features/chat/components/Composer/ComposerFooter.tsx:1003-1011`, `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1208-1210`, `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1274-1278`)
2. **2. Load the model list.** The full list comes from the model store's AVAILABLE_MODELS, built from the shared catalogue. The store's selectable-model helpers repair stale ids. (`apps/web/shared/stores/model-store.ts:211`, `apps/web/shared/stores/model-store.ts:237-266`, `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1229-1240`)
3. **3. Decide which models are locked for this person.** For each model the plan tier, availability state and environment decide the lock. A lock is a coming-soon, environment or plan lock. Plan locks get a label from the shared routing package. Free plan people get the free slot and a promoted model. (`apps/web/features/chat/lib/model-plan-admission.ts:32-51`, `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1212-1227`, `packages/ai/routing/src/model-picker.ts:247`)
4. **4. Build the short list and rows.** A shared function builds the recommended list, the favourites, the lock state, the guidance text, capability keys, price band and family slot for each row. Limits are 4 recommended and 3 favourites. (`packages/ai/routing/src/model-picker.ts:26-27`, `packages/ai/routing/src/model-picker.ts:272-300`, `packages/ui/unified-chat/src/lib/modelPicker.ts:1`)
5. **5. Choose a model.** Selecting a row checks for a local-model fork and for incompatibilities with the chat (images, tools, context). A blocking finding opens a confirm dialog. Otherwise the choice is recorded as recent and saved to the chat (if a chat exists) or set as the global choice. (`apps/web/features/chat/components/Composer/ComposerFooter.tsx:1171-1197`, `apps/web/features/chat/components/Composer/ComposerFooter.tsx:1143-1169`, `packages/ui/unified-chat/src/stores/modelStore.ts:183-186`)
6. **6. Store the choice and apply defaults.** The global selection is persisted to local storage under 'agi-model-store'. The default model preference is loaded from the server preference store and applied only to new chats. Favourites are saved to the server preference store, with a local fallback key. (`apps/web/shared/stores/model-store.ts:385-412`, `apps/web/features/chat/hooks/use-new-chat-default-model.ts:13-48`, `apps/web/features/chat/lib/default-model-preference.ts:18-63`, `apps/web/features/chat/lib/use-model-favourites.ts:8-9`, `apps/web/features/chat/lib/use-model-favourites.ts:31-40`, `packages/contracts/types/src/model-favourites.ts:1-2`)
7. **7. Send the turn with the chosen model.** The chosen model id travels with the message. The public chat route turns the request into a provider call and can substitute a model. The send path that reads the composer selection was not traced end to end in this read. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:297`, `apps/web/app/api/llm/v1/models/route.ts:40-90`)
8. **8. Show which model answered.** The footer reads the fallback reason from the last finished assistant message, and repeats it with the model name. The shared helper describes the reason in words. (`apps/web/features/chat/components/Composer/ComposerFooter.tsx:1112-1124`, `apps/web/lib/chat-fallback-reason.ts:1-19`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Web trigger, selection, lock rules, switch confirmation, effort, fast mode and substitution notice (2080 lines). |
| `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Web list popover: search field, favourite star, family labels, badges, locked rows. |
| `apps/web/shared/stores/model-store.ts` | Global selected model and routing profile; local storage persistence; list of models. |
| `packages/ai/routing/src/model-picker.ts` | Shared picker rules: short list limits, guidance text, plan lock labels, release stage labels, family slot. |
| `apps/web/features/chat/lib/model-plan-admission.ts` | modelLock: decides tier, coming-soon and environment locks for each model. |
| `apps/web/features/chat/lib/use-model-favourites.ts` | Loads and saves favourites on the server preference store with a local fallback. |
| `apps/web/features/chat/hooks/use-new-chat-default-model.ts` | Applies the saved default model to new chats only. |
| `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | Mobile model sheet: search, scope (local or cloud), sections and effort. |
| `apps/cli/src/tui/widgets/model_picker.rs` | CLI picker: search, family rows, detail area, effort bar, keys. |
| `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | Chrome managed picker: options, menu, plan badge, effort state, filter helper used by the side panel. |
| `apps/web/app/api/llm/v1/models/route.ts` | Public model list: plan tier, context and output sizes, capabilities, deprecation date. |

## What is stored

- Selected model id, selected provider, selected route id and routing profile (global choice): Browser local storage key 'agi-model-store' (apps/web/shared/stores/model-store.ts:385-412)
- Favourite model ids (signed in): Server preference store, namespace 'model-picker', key 'favouriteModelIds' (packages/contracts/types/src/model-favourites.ts:1-2; apps/web/features/chat/lib/use-model-favourites.ts:8, 31-40)
- Favourite model ids (device fallback): Browser local storage key 'agi-model-picker-favourites' (apps/web/features/chat/lib/use-model-favourites.ts:9)
- Default model for new chats: Server preference store, namespace 'default-model', field modelId (apps/web/features/chat/lib/default-model-preference.ts:18, 63, 95)
- Recent models, last 5 (Web and Desktop shared store): Shared unified-chat model store, persisted (packages/ui/unified-chat/src/stores/modelStore.ts:185, 221)
- Recent models, last 5 (Mobile): Mobile model-picker store (apps/mobile/src/features/model-picker/store.ts:25, 121-122, 369)
- Model of each conversation: Chat store conversation record, read at apps/web/features/chat/components/Composer/ComposerFooter.tsx:1074-1078; saved through the onModelChange callback (ComposerFooter.tsx:1154)
- Thinking on or off and effort, per conversation and global: Thinking store (ComposerFooter.tsx:1013-1032)
- Fast mode on or off: Thinking store field 'fast' (ComposerFooter.tsx:1033-1034)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Plan tier lock**: Locks models the person's plan cannot use; the lock label names the plan that unlocks them; the Free plan's catalogue is closed. (apps/web/features/chat/lib/model-plan-admission.ts:44; apps/web/features/chat/components/Composer/ComposerFooter.tsx:1038-1056)
- **Model availability state**: A model that is not live is locked as coming soon. (apps/web/features/chat/lib/model-plan-admission.ts:41-43)
- **Model environment requirement**: A model needing an environment is locked when that environment is not available. (apps/web/features/chat/lib/model-plan-admission.ts:45-49; environmentAvailability() at model-plan-admission.ts (imported at ComposerFooter.tsx:96))
- **Free-lane mode (environment variable AGI_FREE_LANE_MODE)**: Controls the free-lane mode; when on, the Auto row shows the free-lane text instead of the model name. (apps/web/lib/services/free-lane/mode.ts:3, 31-32; apps/web/features/chat/components/Composer/ComposerFooter.tsx:244-250, 1202-1206)
- **Free model promotion**: A promoted free model is selected and unlocked for Free plan people. (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1045-1046; apps/web/features/chat/hooks/use-new-chat-default-model.ts:18-22)
- **Fast mode feature and fast tier**: Fast toggle appears only when the model has a fast tier and the feature is defined. (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1322-1326; packages/contracts/types/src/feature-registry.json (fast_mode entry))
- **Workspace fast-mode block**: Turns fast mode off for a workspace. (apps/web/features/chat/components/Composer/ComposerFooter.tsx:845, 861; packages/contracts/types/src/enterprise/workspace-controls.ts (fast mode control))
- **Usage-credit check for fast mode**: Paid plans with fast mode check usage-credit status before allowing it. (apps/web/features/chat/hooks/use-fast-mode-availability.ts:11, 26-41)
- **Effort entitlement**: Effort levels a plan cannot use are shown as gated. (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1311-1314)
- **CLI --model, --provider and --temperature flags**: Choose the model, choose the provider and set temperature for CLI runs. (apps/cli/src/lib.rs:190-196 (model, provider), lib.rs:254 (temperature), lib.rs:8750 (applied))
- **CLI /fast command**: Turns the session fast-mode flag on or off and shows the cost note. (apps/cli/src/tui/tui_app.rs:5825-5830; apps/cli/src/onboarding.rs:79)

## Shared between apps

Shared across apps: the picker rules (short list limits, guidance, plan lock labels, release-stage labels, family slot) in packages/ai/routing/src/model-picker.ts, re-exported by packages/ui/unified-chat/src/lib/modelPicker.ts (line 1). The shared unified-chat model store (packages/ui/unified-chat/src/stores/modelStore.ts) holds recents and is used by Web's composer and the models pages. Shared types from @agiworkforce/types supply fallback reason text (apps/web/lib/chat-fallback-reason.ts:1-19), favourite key names (packages/contracts/types/src/model-favourites.ts), and effort helpers that the Chrome managed picker imports (apps/extension/src/features/cloud-bridge/managedModelPicker.ts:8-21). Separate per app: the Web composer (ComposerFooter.tsx, ModelCatalogue.tsx), the Mobile sheet and filters (apps/mobile/src/features/model-picker/, including its own modelFilters.ts and store.ts), the CLI widget (apps/cli/src/tui/widgets/model_picker.rs, which groups with the Rust model registry crate), the VS Code list (apps/extension-vscode/src/features/model-picker/modelConstants.ts), and the Chrome side panel (apps/extension/src/side_panel.ts).

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief's code references for many items point to unrelated code. Examples: S15.01 cites ComposerFooter.tsx:1324, which is the fast-mode maturity label; S15.01 also cites ComposerFooter.tsx:1436, a blank line; S15.04 cites ModelCatalogue.tsx:283, a closing div; S15.32 cites MessageBubble.tsx:2667 area, which is an activity timeline; mobile ChatInput.tsx:1128 is the returnQueuedToComposer callback; CLI tui_app.rs:3406 is a requires_environment field; ChatComposerNew.tsx:4964 is 'Put it back in the message' text. (~/Desktop/agiworkforce-QA/tools/area-briefs/015-model-selector-interface.md (lines 8, 14, 22, 38, 43 and others); apps/web/features/chat/components/Composer/ComposerFooter.tsx:1324, 1436; apps/mobile/src/features/chat/components/ChatInput.tsx:1128; apps/cli/src/tui/tui_app.rs:3406)
- Brief marks Chrome model search as missing, but the Chrome side panel wires a search input into the model filter. (apps/extension/src/side_panel.ts:11273-11275 (search value), side_panel.ts:11342 (filterManagedModelOptions with modelSearchQuery))
- Web catalogue is closed for Free plan people by an effect, so the search, favourites and recents list may never open for them. Brief marks the Free plan case as done. (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1052-1056)
- Per-turn model override: the only use of modelOverrideId in the Web chat page is the free-quota media path, not a general per-message model switch. (apps/web/features/chat/pages/WebChatPage.tsx:504, 2610-2613, 4385-4388)
- CLI /fast is a session toggle; the brief says it should switch to a serving tier of the same model, which is not yet done. (apps/cli/src/tui/tui_app.rs:5825-5830)
- Mobile's filters cover only Instant, Economy, Images and Files; the brief lists output, tool, context and cost badges as missing on mobile, which matches the code. (apps/mobile/src/features/model-picker/modelFilters.ts:12-30)

## Not established

- Whether the search box in Web, Mobile and CLI shows an empty-result message: not found in the code read.
- The full send path from the selected model id to the provider call, including the server-side substitution: request-processor.ts is 6988 lines and was only sampled.
- The text-turn per-message override on Web: not traced.
- Mobile's plan lock tap behaviour and whether mobile shows the Auto row exactly as the brief says (ModelPickerSheet.tsx:671 was not re-read).
- Whether the VS Code favourites feature exists: the brief marks it done but no favourites code was read in apps/extension-vscode.
- Chrome: the managed picker's recommended and plan-lock logic was only partly read (managedModelPicker.ts:100-310).
- The desktop local-model path (apps/desktop/electron/runtime/dispatcher.ts:799) was not read in detail.
- The Web 'Auto (free)' and free-lane environment values: the environment variable name is confirmed (AGI_FREE_LANE_MODE), but its default value was not read.
- Whether the 'Put it back in the message' and returnQueuedToComposer references in the brief belong to this area: they look unrelated.
- Whether the attachment keep-or-remove dialog (ChatComposerNew.tsx:4017-4059) exists as the brief says; not re-read.
- No builds, tests or servers were run; the project was read only, as the brief required. The localhost-only testing rule from the user does not apply to this read-only pass.
