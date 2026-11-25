---
id: "F084-06"
type: "feature"
title: "New chat defaults: model, reasoning effort, mode and workspace"
aliases: ["New chat defaults", "Default model", "Reasoning effort", "New chats start in", "Default effort", "Default mode", "Default workspace", "S84.10", "S84.11", "S84.12", "S84.13"]
area: "84 General and appearance settings"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S84.10", "S84.11", "S84.12", "S84.13"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-api-and-contracts", "table:user_settings", "store:agi-thinking-store", "store:agi-model-store", "api:GET /api/settings/preferences", "api:PUT /api/settings/preferences", "plan:free", "plan:basic", "plan:pro", "plan:max", "mode:local", "mode:cloud", "F084-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F084-06 New chat defaults: model, reasoning effort, mode and workspace

Sets what a new chat starts with. Web and Desktop have Default model, Reasoning effort and New chats start in (Chat or Work), all limited by plan. Mobile has a device-only default effort and remembers the last model per mode. VS Code has three settings. CLI has config values. A default workspace exists nowhere.

Area: [84. General and appearance settings](README.md). Requirement items: [S84.10](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8410), [S84.11](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8411), [S84.12](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8412), [S84.13](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8413).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Web and Desktop: saves a default model to the account, an effort level on the device, and a Chat or Work start mode in the account. Other surfaces keep their own equivalents.

**Why it exists.** People should not repick the same model, effort and mode for every chat. The brief lists default model, effort, mode and workspace (S84.10 to S84.13).

**Who uses it.** Regular users on every app, and developers using VS Code or the CLI.

**Problems it solves**

- Repeating the same picks at the start of each chat.
- Choosing a model or effort the plan does not include (shown as locked).

**Use cases**

- Set a default model on Web and every new chat starts with it.
- Set effort to High once.
- Start new chats in Work for people on a plan that includes it.
- In VS Code set the default agent mode to Plan.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, General, Preferences: rows 'Default model', 'Reasoning effort', 'New chats start in' (apps/web/features/settings/sections/GeneralSection.tsx:299-307; row definitions at lines 361, 460, 583).
- Mobile: Settings, General: a 'Default effort' slider group labelled by settings:defaultEffort, and the row 'Models' that opens the model screen (apps/mobile/src/features/settings/general/index.tsx:156-183).
- VS Code settings: agiWorkforce.model, agiWorkforce.agent.mode, agiWorkforce.agent.effort (apps/extension-vscode/package.json:1219, 1404, 1428).
- CLI: config [default] model, reasoning_effort and permission_mode (apps/cli/src/config.rs:177, 200-202, 213-216); /effort saves the effort (apps/cli/src/repl/slash_commands.rs:800-807).
- Chrome: the effort last chosen in the side panel is remembered (apps/extension/src/side_panel.ts:11111, 11501-11503); no Options row.
- Default workspace: none.

**Before you start**

- Web: billing information must be loaded before models and effort levels are shown as allowed or locked (GeneralSection.tsx:361-380, 470-478).
- Default Work mode applies only if the plan allows Work (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1062-1066, 1233-1237).

**Screens and controls**

- Default model: a drop-down with 'Last used' first, then models. Models above the plan show '<name> · Upgrade to use (<plan label>)' and cannot be saved; picking one shows 'X needs <plan>.' with an 'Upgrade to use' link (GeneralSection.tsx:410-430).
- Reasoning effort: a drop-down 'Off' plus levels low, medium, high, xhigh, max; levels over the plan show '<label>, not on your plan' and are disabled; plus the note 'Each chat can change this in the composer.' (GeneralSection.tsx:448-520).
- New chats start in: a drop-down with Chat and Work and a plan hint (GeneralSection.tsx:583-604).
- Mobile: an effort slider (general/index.tsx:158-171). Intro: 'Local defaults. These apply to this device only, not AGI Cloud.' (general/index.tsx:101-104).

**Journey**

1. Open Settings, General.
2. Pick a model, an effort and a start mode.
3. Web saves the model and the mode to the account; effort stays on the device.
4. Open a new chat: it starts with the saved model if the plan allows it, and in Work mode if allowed.

**What the person sees and gets**

- If the saved model is no longer on the plan the hint reads 'Your saved default is not on your plan, so new chats use your last model.' (GeneralSection.tsx:381-390).
- A model save failure shows the toast 'Your default model was not saved. Try again.' (GeneralSection.tsx:405-408).
- A load failure shows the error with a 'Try again' button (GeneralSection.tsx:432-441; apps/web/features/chat/lib/default-model-preference.ts:70-74).
- Account sync alert for the mode value.

**Settings**

- Account namespace 'default-model' field modelId (apps/web/features/chat/lib/default-model-preference.ts:18, 95-97).
- Account namespace 'appearance' field defaultWorkMode (apps/web/features/settings/lib/appearance-namespace.ts:27, 120).
- Browser store 'agi-thinking-store' for effort (apps/web/shared/stores/thinking-store.ts, persist name near line 125).
- Mobile agent control store default scope '__default__' (apps/mobile/src/features/model-picker/components/EffortSlider.tsx:52-60).
- VS Code: three settings listed above.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web default model: loaded from the 'default-model' namespace, saved on change; models above the plan are shown with an upgrade link and cannot be saved (GeneralSection.tsx:361-430; default-model-preference.ts:52-102).
- Web: a new empty chat selects the saved default if it is on the plan; a free-plan promotion overrides it; a choice made inside the same new chat is not overridden (apps/web/features/chat/hooks/use-new-chat-default-model.ts:22-48). The hook is mounted in the chat page (apps/web/features/chat/pages/WebChatPage.tsx:2125).
- Web effort: levels above the plan are visible but disabled; billing unknown means everything is offered (GeneralSection.tsx:460-480). The server clamps effort to the plan (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1826-1837).
- Web mode: 'New chats start in' writes defaultWorkMode, which is synced with the appearance namespace and applied to an empty chat when Work is allowed (CloudSettingsSync.tsx:74, 105; ChatComposerNew.tsx:1233-1237).
- Mobile: default effort slider writes a project-default in the agent control store; new conversations resolve to it (apps/mobile/stores/agentControlStore.ts:40-56; EffortSlider.tsx:52-60).
- Mobile: setModel remembers the model for the mode it belongs to, and a new chat restores that model or a safe default (apps/mobile/src/features/model-picker/store.ts:179-191, 207-240).
- VS Code: three settings with defaults auto, auto and medium; changes are watched (apps/extension-vscode/package.json:1219-1223, 1404-1427, 1428-1443; apps/extension-vscode/src/extension.ts:433-434, 467-468; apps/extension-vscode/src/platform/config.ts:211-218).
- CLI: default model and provider and reasoning effort are in the config file; /effort saves the effort to the project config (apps/cli/src/config.rs:177-180, 200-202, 1144-1160; slash_commands.rs:800-807). The permission_mode setting sets the start posture (config.rs:213-216).

**Incomplete**

- Web effort is stored only on the device (thinking store), not in the account, so it does not follow the person to another browser (apps/web/shared/stores/thinking-store.ts persist; appearance-namespace.ts has no effort key).
- Web default model is in the 'default-model' namespace, which is not in the list of cloud-safe namespaces pulled by the settings sync endpoint (apps/web/app/api/settings/sync/route.ts:14-25), so Mobile cannot read it through that route.
- Mobile 'default mode' is the Local or Cloud app mode, remembered in a store, and not a Chat or Work choice (apps/mobile/src/features/chat/store/appModeStore.ts:5, 60-70). The brief points at a drawer control (apps/mobile/src/features/drawer/components/DrawerContent.tsx:635 shows ModeToggle).
- Mobile default model is the last one used per mode, not a separate setting (model-picker/store.ts:179-191).
- Chrome: effort is remembered per device; no default model setting was found in Options.
- The older document docs/decisions/wire-or-cut.md says default model writes model-store.ts; the code now uses the 'default-model' account namespace, so that row is out of date (code wins).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Default workspace: no control and no code on any app (brief S84.13 missing on all six).
- CLI default Chat or Work: the CLI has permission modes instead; no Chat or Work choice found.

## 4. Required behaviour

**Established requirements**

- The user can set a default model that new conversations start with. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.10)
- The user can set a default reasoning effort used for new turns. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.11)
- The user can choose the default mode new conversations start in (chat vs agent or work, ask vs auto). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.12)
- The user can choose which workspace the app opens in by default. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.13)
- The screen must not promise a level the server will not give; gated levels stay visible with the reason. (source: apps/web/features/settings/sections/GeneralSection.tsx:448-459)
- Default model, reasoning effort and shortcuts are wired in Settings, General. (source: docs/decisions/wire-or-cut.md (row 'Default model, reasoning effort, text size, code wrapping, shortcuts'))

**Acceptance criteria**

1. On Web, choose a model, reload, open a new chat: the model is preselected.
2. A model above the plan shows 'Upgrade to use', cannot be saved, and opens the upgrade link.
3. If the saved model drops off the plan, the hint says new chats use the last model.
4. Effort levels above the plan are disabled with 'not on your plan'.
5. Choosing Work for 'New chats start in' on an allowed plan opens a new chat in Work; on a plan without Work it opens in Chat.
6. A forced save error shows the toast; a forced load error shows 'Try again'.
7. In VS Code, changing agiWorkforce.agent.mode changes the default of a new conversation.
8. Mobile default effort changes the effort of a new conversation.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Effort should follow the account like model and mode [inferred; model and mode do].
- Default mode on Mobile and CLI means different things; each should be named for its own surface [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Store effort in the account.
- [proposed] Add 'default-model' to what Mobile and other surfaces can read.
- [proposed] Add a Default workspace row on Web and Desktop, or record as not planned, since nothing exists.
- [proposed] Update docs/decisions/wire-or-cut.md for the changed model default storage.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | DefaultModelRow | `apps/web/features/settings/sections/GeneralSection.tsx` | Default model control with plan lock (line 361) |
| component | ReasoningEffortRow | `apps/web/features/settings/sections/GeneralSection.tsx` | Effort control with plan gating (line 460) |
| component | DefaultWorkModeRow | `apps/web/features/settings/sections/GeneralSection.tsx` | Chat or Work (line 583) |
| hook | useDefaultModelPreference | `apps/web/features/chat/lib/default-model-preference.ts` | Load, save and retry of the account default; isModelOnPlan |
| hook | useNewChatDefaultModel | `apps/web/features/chat/hooks/use-new-chat-default-model.ts` | Applies the default to a new chat |
| component | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Mounts the hook (line 2125) |
| service | model-plan-admission (modelLock) | `apps/web/features/chat/lib/model-plan-admission.ts` | Decides whether a plan can use a model |
| store | thinking-store | `apps/web/shared/stores/thinking-store.ts` | Effort and on/off, persisted in the browser |
| store | model-store | `apps/web/shared/stores/model-store.ts` | Selected model, persisted as 'agi-model-store' (line 376) |
| store | useSettingsStore.defaultWorkMode | `apps/web/shared/stores/web-settings-store.ts` | Start mode value, default 'chat' (line 134) |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Applies the start mode; checks canUseAgiWork (lines 1062-1066, 1233-1237) |
| service | resolveRequestEffort | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Server clamp of effort to the plan (line 1826) |
| endpoint | api:GET/PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Stores 'default-model' and 'appearance' namespaces |
| table | public.user_settings | `apps/web/app/api/settings/preferences/route.ts` | Account store |
| screen | GeneralSettingsScreen | `apps/mobile/src/features/settings/general/index.tsx` | Mobile default effort slider and Models row |
| hook | EffortSlider helpers | `apps/mobile/src/features/model-picker/components/EffortSlider.tsx` | useDefaultEffort and setDefaultEffort |
| store | agentControlStore | `apps/mobile/stores/agentControlStore.ts` | Resolves effort and mode per conversation, project or global default |
| store | model-picker store | `apps/mobile/src/features/model-picker/store.ts` | Remembers new-chat model per mode |
| store | chat app mode store | `apps/mobile/src/features/chat/store/appModeStore.ts` | Local or Cloud mode |
| config | VS Code settings | `apps/extension-vscode/package.json` | agiWorkforce.model, agent.mode, agent.effort (lines 1219, 1404, 1428) |
| service | VS Code config | `apps/extension-vscode/src/platform/config.ts` | Reads and validates agent mode and effort (lines 211-218) |
| config | CLI default config | `apps/cli/src/config.rs` | [default] model, provider, reasoning_effort, permission_mode |
| command | /effort | `apps/cli/src/repl/slash_commands.rs` | Saves effort to the project config (lines 800-807) |
| service | side panel effort memory | `apps/extension/src/side_panel.ts` | Stores and restores agi_reasoning_effort (lines 11111, 11501) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web page loads the saved default model from the account and the model list from the model store. | device and our servers | default-model-preference.ts:59-78; apps/web/app/api/settings/preferences/route.ts:134-140 |
| Person picks a model; the device checks the plan and blocks locked choices. | device | GeneralSection.tsx:361-380, 401-404; default-model-preference.ts:47-50 |
| The choice is written to the 'default-model' namespace; a saved event updates other listeners. | device and our servers | default-model-preference.ts:92-102, 80-90 |
| Opening a new chat applies the default if the model exists and is on the plan. | device | use-new-chat-default-model.ts:22-38 |
| On send, the server reads the effort and clamps it to the plan before calling the provider. | our servers | request-processor.ts:1826-1837 |
| Start mode Work is applied to an empty chat only when the plan allows Work. | device | ChatComposerNew.tsx:1233-1237 |
| Mobile: a new conversation resolves effort and model from device stores; no account call. | device | agentControlStore.ts:44-56; model-picker/store.ts:207-240 |
| VS Code: settings are read by the extension and passed to the CLI engine. | device | apps/extension-vscode/src/platform/config.ts:211-218, 275 [passing to the CLI inferred] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Default model id | public.user_settings.settings['default-model'].modelId | Across Web browsers; not in the cloud-safe list for Mobile pull | Kept until changed; choose 'Last used' to clear (saves null) |
| Default start mode | localStorage 'agiworkforce-web-settings' and appearance.defaultWorkMode in the account | Yes on Web | Kept until changed |
| Web effort and on/off | localStorage 'agi-thinking-store' | No | Kept in the browser |
| Mobile default effort and last model | Mobile stores (agent control store, model-store persisted) | No sync of these found | Kept on device |
| CLI default model and effort | config.toml (user or project) | No | Kept in the file |
| Chrome effort | chrome.storage.local key agi_reasoning_effort | No | Removed in one code path at side_panel.ts:1995 |

**Models and providers.** The model list comes from the shared catalog loaded into the model store; whether a model is allowed comes from plan rules (isModelAllowedForTier and modelLock). Effort is sent to the provider only if the model supports it; the server drops or clamps it (request-processor.ts:1826-1837). The default must never route a Local chat to a hosted model; on Mobile the remembered model is stored per mode (model-picker/store.ts:186-188).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web needs a sign-in to save the model and the mode in the account. The effort and the Mobile settings need none. |
| Permissions | none found in the code beyond the signed-in user's own settings row. |
| Subscription | Yes. Models above the plan are locked with an upgrade link (GeneralSection.tsx:361-430; plan keys basic, pro, max in UpgradePlan at line 351). Free plan gets only models in FREE_TRIAL_MODELS (default-model-preference.ts:47-50) and a possible promotion model (use-new-chat-default-model.ts:16, 45-48). Effort levels above the plan cap are disabled and clamped by the server. Work mode needs a plan with the AGI Work capability (ChatComposerNew.tsx:1062-1066; GeneralSection.tsx:586-587). Applies to plan:free, plan:basic, plan:pro and plan:max. |
| Limits and metering | Higher effort draws the usage allowance faster; the screen says so for paid plans (GeneralSection.tsx:492-497). The settings endpoint is rate limited. |
| Feature flags | none found in the code for these rows. |
| Model compatibility | Effort levels shown depend on the selected model's reasoning options (getModelReasoning, GeneralSection.tsx:472-476). Mobile hides the slider when the model has no steps (general/index.tsx:156). |
| Provider restrictions | Effort is sent only when the model supports it, and for one provider an extra support check applies (request-processor.ts:1831-1836). |
| Local mode | Mobile Local defaults are device only and cost nothing (general/index.tsx:101-104). On Web and Desktop the model list is cloud-based; whether Desktop Local models appear in this drop-down was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | The model drop-down is disabled until the plan and the saved value are ready. | GeneralSection.tsx:397-398 |
| Empty (no model chosen) | 'Last used' is the first option and selected. | GeneralSection.tsx:410-413 |
| Saved model off the plan | Hint says new chats use the last model; the selected value shows 'Last used'. | GeneralSection.tsx:381-390 |
| Save error | A toast shows the error; no retry button for save. | GeneralSection.tsx:405-408 |
| Load error | Error text and a 'Try again' button. | GeneralSection.tsx:432-441; default-model-preference.ts:70-74 |
| Billing not loaded | Effort offers every level so a paying customer is not wrongly locked. | GeneralSection.tsx:466-476 |
| Plan without Work | The start mode is not applied; new chats stay in Chat. | ChatComposerNew.tsx:1233-1237 |
| Free promotion model active | The promoted model wins over the saved default. | use-new-chat-default-model.ts:28, 45-48 |
| Choice made in the new chat before the default applies | The default does not override it. | use-new-chat-default-model.ts:36 |
| Mobile cloud locked | Restoring the Cloud model is skipped when Cloud is not unlocked. | model-picker/store.ts:209-211 |
| Accessibility | Controls carry aria-labels 'Default model', 'Reasoning effort', 'New chats start in'; the lock message has role=status; the error has role=alert. | GeneralSection.tsx:408-412, 423, 433 |
| Offline, timeout, cancel | not handled in the code beyond the error paths above. | GeneralSection.tsx:405-441 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/__tests__/EffortEntitlementHonest.test.tsx`: Disables levels the plan lacks, keeps them visible with a reason, offers every level while the tier is unknown, does not store a clamped level, free-plan wording.
- `apps/web/features/chat/hooks/__tests__/useNewChatDefaultModel.free-model-promotion.test.tsx`: A free-plan promotion model wins over a saved default, reapplies per new chat, does not override a choice inside the chat, plan default returns afterwards.
- `apps/web/features/settings/sections/GeneralSection.test.tsx`: General page layout, composer controls and other rows; the appearance controls are left to Appearance (line 150).
- `apps/web/features/settings/lib/__tests__/appearance-namespace.test.ts`: defaultWorkMode is part of the round trip and invalid values are ignored.
- `apps/mobile/__tests__/ComposerEffort.test.tsx`: Mobile effort in the composer; cases not opened.
- `apps/mobile/__tests__/SettingsModelRowOwnership.test.tsx`: Mobile Models row ownership in settings; cases not opened.
- `apps/extension-vscode/src/__tests__/configDefaults.test.ts`: VS Code configuration defaults; cases not opened.
- `apps/extension-vscode/src/__tests__/agentModeConsent.test.ts`: VS Code agent mode consent; cases not opened.
- `apps/cli/src/config.rs`: In-file tests: reasoning effort survives the config merge (module reasoning_effort_tests around line 3631).

**Test scenarios**

- **Default model applies**
  1. Sign in on a paid plan.
  2. Settings, General, Default model: choose a model.
  3. Reload and open a new chat.
  - Expected: The new chat starts with that model; public.user_settings has default-model.modelId.
- **Locked model**
  1. Sign in on the Free plan.
  2. Open the Default model list and choose an 'Upgrade to use' entry.
  - Expected: Nothing is saved; the message 'needs <plan>' with an 'Upgrade to use' link shows.
- **Effort gating**
  1. On a plan with a capped effort, open Reasoning effort.
  - Expected: Levels above the cap are visible but disabled with 'not on your plan'; sending a request at a higher level (forced) is clamped by the server.
- **Start in Work**
  1. On a plan that includes Work set 'New chats start in' to Work.
  2. Open a new chat.
  - Expected: The composer is in Work mode. On a plan without Work it is Chat.
- **Save and load errors**
  1. Block /api/settings/preferences, reload General.
  2. Then unblock, block again, change the model.
  - Expected: First: error with 'Try again'. Second: toast 'Your default model was not saved. Try again.'
- **VS Code defaults**
  1. Set agiWorkforce.agent.mode to plan and agiWorkforce.agent.effort to high in user settings.
  2. Open a new conversation.
  - Expected: It starts in Plan mode with High effort unless the composer already holds a per-model choice.

**Where to look when it fails**

- Web: toast text 'Your default model was not saved. Try again.'; load error 'Your default model could not be loaded.' (default-model-preference.ts:19).
- Server: public.user_settings row; logger lines in apps/web/app/api/settings/preferences/route.ts.
- Server effort clamp: resolveRequestEffort in request-processor.ts.
- VS Code: configuration change listeners at src/extension.ts:433-434, 467-468.
- Mobile: __DEV__ debug handle for chat mode (appModeStore.ts after line 78).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/084-general-and-appearance-settings.md](../../70-qa/test-plans/web/084-general-and-appearance-settings.md)
- Desktop: [70-qa/test-plans/desktop/084-general-and-appearance-settings.md](../../70-qa/test-plans/desktop/084-general-and-appearance-settings.md)
- Mobile: [70-qa/test-plans/mobile/084-general-and-appearance-settings.md](../../70-qa/test-plans/mobile/084-general-and-appearance-settings.md)
- CLI: [70-qa/test-plans/cli/084-general-and-appearance-settings.md](../../70-qa/test-plans/cli/084-general-and-appearance-settings.md)
- VS Code: [70-qa/test-plans/vscode/084-general-and-appearance-settings.md](../../70-qa/test-plans/vscode/084-general-and-appearance-settings.md)
- Chrome: [70-qa/test-plans/chrome/084-general-and-appearance-settings.md](../../70-qa/test-plans/chrome/084-general-and-appearance-settings.md)

## 10. Gaps and dependencies

- **Default workspace is not offered anywhere.** Affects: Web, Desktop, Mobile, CLI, VS Code, Chrome. Evidence: Brief S84.13 status missing on all six; no row in GeneralSection.tsx. Work needed: Define what 'workspace' means per surface, then build or record not planned.
- **Web effort is not saved to the account, so it does not follow the person across browsers, unlike model and start mode.** Affects: Web, Desktop. Evidence: thinking-store.ts persists to localStorage; no effort key in appearance-namespace.ts:17-33. Work needed: Add effort to an account namespace.
- **The default model is not in the cloud-safe namespaces of the settings sync, so Mobile cannot read it.** Affects: Mobile. Evidence: apps/web/app/api/settings/sync/route.ts:14-25. Work needed: Decide the Mobile behaviour and add the namespace if wanted.
- **Mobile has no Chat or Work default; its 'mode' is Local or Cloud and its model default is the last used.** Affects: Mobile. Evidence: appModeStore.ts:5; model-picker/store.ts:179-191. Work needed: Confirm the intended meaning and record it.
- **Chrome has no default model or effort setting in Options.** Affects: Chrome. Evidence: Effort memory only in side_panel.ts:11111, 11501. Work needed: Add Options rows or record the decision.
- **The decision document for default model storage is out of date.** Affects: Maintainers. Evidence: docs/decisions/wire-or-cut.md says model-store; code uses the 'default-model' namespace. Work needed: Update the document.
- **Whether Desktop Local models can be a default is not established.** Affects: Desktop. Evidence: Not traced. Work needed: Check the model list used on Desktop.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-api-and-contracts
- table:user_settings
- store:agi-thinking-store
- store:agi-model-store
- api:GET /api/settings/preferences
- api:PUT /api/settings/preferences
- plan:free
- plan:basic
- plan:pro
- plan:max
- mode:local
- mode:cloud
- F084-01

## Unknown

- Whether Desktop shows Local-inference models in the Default model list.
- Whether VS Code passes agent.effort and mode to the CLI for each new conversation exactly as described (only config reading was opened).
- What Mobile tests cover (not opened).
- Whether Chrome has any default model setting elsewhere than Options (not found).
- Meaning of 'workspace' to be defaulted on each surface.
