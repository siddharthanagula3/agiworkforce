---
id: "F015-04"
type: "feature"
title: "Auto and default for new chats"
aliases: ["Auto and default for new chats", "Automatic-selection option and Default-profile option (brief S15.08, S15.09)", "Auto row, routing profile rows (Web)", "Default model setting, 'Default model' with the choice 'Last used' (Web Settings > General)", "agiWorkforce.model setting (VS Code)", "--auto flag and default.model config (CLI)"]
area: "15 Model-selector interface"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S15.08", "S15.09"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "SYS-api-and-contracts", "F015-01", "F015-05", "api:PUT /api/settings/preferences", "table:user_settings"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F015-04 Auto and default for new chats

Auto lets the product pick a model for each message. The default setting chooses which model a new chat starts with. Web has an Auto row, extra routing profile rows and a Default model setting. Mobile and VS Code have Auto; the CLI has an --auto flag and a config default. Chrome starts on Auto.

Area: [15. Model-selector interface](README.md). Requirement items: [S15.08](../../10-requirements/capabilities/015-model-selector-interface.md#s1508), [S15.09](../../10-requirements/capabilities/015-model-selector-interface.md#s1509).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Offers Auto as a choice at the top of the picker and stores a lasting default model or profile for new chats.

**Why it exists.** Many people do not want to pick a model each time. Auto routes by task, plan and cost; a default removes repeated setup. Inference cost is a design constraint, so routing is centralised (doc: AGENTS.md section 7).

**Who uses it.** Anyone who wants the product to choose, and anyone who always starts with the same model.

**Problems it solves**

- Choosing a model for every message.
- Starting each new chat on the wrong model.
- Paying for a stronger model than a message needs.

**Use cases**

- Web paid user picks Auto and sees 'Picks the best model for each message'.
- Web user sets Settings > General > Default model so new chats start on it.
- CLI user starts with --auto so the managed router picks per turn.
- VS Code user leaves agiWorkforce.model on auto.

## 2. User experience

**Where to find it**

- Web and Desktop: the Auto row near the top of the picker, then extra routing profile rows (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1635-1682). Default: Settings > General, row 'Default model' (apps/web/features/settings/sections/GeneralSection.tsx:361-440).
- Mobile: Auto rows at the top of the sheet when no search or filter is active (apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:893-909). No default-model setting was found.
- CLI: command line flag --auto (apps/cli/src/lib.rs:470-478) and default.model in the config file (apps/cli/src/config.rs:175-177); the /model overlay has no Auto row (apps/cli/src/tui/widgets/model_picker.rs:126-193).
- VS Code: the first group 'Recommended' with the Auto row and profile rows (apps/extension-vscode/src/features/model-picker/modelConstants.ts:218-249; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2008-2020). Default: setting agiWorkforce.model, default 'auto' (apps/extension-vscode/package.json:1219-1223).
- Chrome: Auto is the first row and the starting selection (apps/extension/src/side_panel.ts:936, 1792, 11224-11226).

**Before you start**

- Web: a paid plan for the Auto row; a Free plan resets Auto to the free default (ComposerFooter.tsx:1346-1348).
- Mobile: Auto in the Cloud scope needs the plan floor; in the local picker Auto is offered on every plan (ModelPickerSheet.tsx:316-326).
- CLI --auto: managed account and a resolved plan; Local and BYOK providers need an explicit model (apps/cli/src/lib.rs:475-477).
- VS Code: Auto is locked until the plan or a provider key can resolve it (modelConstants.ts:213, 59).

**Screens and controls**

- Web: Auto row (label from the registry), routing profile rows with a description, current model row (ComposerFooter.tsx:1635-1690).
- Web Settings: a select labelled 'Default model' with the first choice 'Last used', then the models; choosing a model above the plan shows 'needs <plan>' with an 'Upgrade to use' link (GeneralSection.tsx:386-440).
- Mobile: Auto rows built from the shared profile list (ModelPickerSheet.tsx:895-907).
- VS Code quick pick: sparkle rows for Auto and profiles with detail 'Recommended' on the Auto row (modelConstants.ts:219-233).

**Journey**

1. Open the picker.
2. Choose Auto (and a profile if offered).
3. Send: the product picks the model per message and the answer says which model produced it (outside this feature).
4. For a default: Web Settings > General > Default model, choose a model or Last used.
5. Start a new chat; the composer starts on the default if the plan allows it.

**What the person sees and gets**

- Web: tooltip 'Picks the best model for each message', or 'Stays on <name> for this chat' (ComposerFooter.tsx:205, 213).
- Web Settings hint 'New chats start with this model.' or 'Your saved default is not on your plan, so new chats use your last model.' (GeneralSection.tsx:386-391).
- Web error toast 'Your default model was not saved. Try again.' and a loading error with Try again (GeneralSection.tsx:407, 432-440; default-model-preference.ts:19).
- VS Code message 'this chat now uses <name>. New chats still start with <default>' or 'new chats now use <name>' (commandSetup.ts:1372-1378).

**Settings**

- Web preference namespace default-model with key modelId (apps/web/features/chat/lib/default-model-preference.ts:18, 95-97).
- CLI: default.model in the config file; -m and --auto flags (apps/cli/src/lib.rs:190-192, 470-478).
- VS Code: agiWorkforce.model (global scope when no chat is open: ChatStateManager.ts:1202-1207).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: Auto is an id in the model list; the chosen routing profile is stored with the model store and defaults to auto (apps/web/shared/stores/model-store.ts:325-329, 364-366).
- Web: new chats apply the saved default when it is on the plan, once, and not over a choice already made in that new chat (apps/web/features/chat/hooks/use-new-chat-default-model.ts:22-38).
- Web: the default is saved server side under the preference name default-model (default-model-preference.ts:92-102).
- Web: a project can carry its own default model that applies on a new chat in that project (apps/web/features/chat/pages/WebChatPage.tsx:2127-2142).
- Mobile: Auto rows exist; local scope offers them on every plan (ModelPickerSheet.tsx:316-326); new chats remember the last choice per mode, local and cloud (apps/mobile/src/features/model-picker/store.ts:107-119, 205-234).
- CLI: --auto resolves a concrete route per turn from the task, tier and the managed policy; the default model comes from config when neither flag is given (apps/cli/src/lib.rs:7994-8055).
- VS Code: default setting is auto; selecting a model with no chat open saves the setting globally, with a chat open it applies to that chat only (ChatStateManager.ts:1199-1212).
- Chrome: starts on Auto; a stored selection is restored; a selection the account no longer admits resets to Auto (side_panel.ts:11487-11500; managedModelPicker.ts:275-287).

**Incomplete**

- The area brief cites CLI line numbers (lib.rs:461, 1194, 2264, 4317, 4350) that now point to unrelated code; the real places are lib.rs:190-192, 470-478, 7994-8055 and config.rs:175-177.
- The CLI /model overlay has no Auto row, so Auto is chosen only by the --auto flag [inferred from model_picker.rs:126-193].
- Whether Auto itself can be saved as the Web default is not read: the Default model choices come from availableModels (GeneralSection.tsx:368-377) and whether Auto is in that list was not checked.
- Whether the CLI /model choice is written to the config file is not found; finish_model_pick only switches the session (apps/cli/src/tui/tui_app.rs:5073-5109).

**Present but disconnected or switched off**

- Web: Auto row and routing profile rows are hidden unless the plan is known and paid (ComposerFooter.tsx:1635, 1656).

**Not available**

- Mobile default-model setting (brief S15.09 lists Mobile absent).
- Chrome default-model setting (the brief lists Chrome done; no setting found, only the starting Auto and the stored last choice).

## 4. Required behaviour

**Established requirements**

- The user can choose Auto so the product picks a model per message. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.08)
- The user can set which model or profile new chats start with, as a lasting default. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.09)
- Auto is a managed cloud rule on Web and Mobile cloud; Local Auto costs nothing on Mobile. (source: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:316-318)
- Local, BYOK and Managed Cloud are separate trust boundaries and the CLI managed boundary is entered only by --auto or a managed provider. (source: doc: AGENTS.md section 6; apps/cli/src/lib.rs:8001-8003)
- The selector shows the Auto route profile and the resulting concrete model after selection. (source: doc: docs/product/experience-contract.md section 7.3)

**Acceptance criteria**

1. Web paid plan: the Auto row is first and choosing it makes the next message route by profile.
2. Web Free plan: Auto is not offered and a stored Auto selection is replaced by the free default.
3. Settings > General > Default model: choose a model, start a new chat, the composer starts on that model.
4. A saved default that the plan cannot use is skipped and the hint says so.
5. The default does not override a model the person picked inside the same new chat.
6. CLI: 'agi --auto' on a signed-in plan resolves a managed model and names it; 'agi --auto --model x' is refused.
7. VS Code: with no chat open, picking a model changes agiWorkforce.model; with a chat open it does not.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The model that Auto picked per message should be disclosed on the answer (S15.32) [inferred].
- Auto should be reachable on the CLI inside the session, not only by a launch flag [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an Auto row to the CLI overlay for managed sessions.
- [proposed] Add a default-model setting to Mobile and Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AutoRow and RoutingProfileRow | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Auto and profile rows (lines 405-460, 1635-1682). |
| store | useModelStore routingProfile | `apps/web/shared/stores/model-store.ts` | routingProfile defaults to auto and persists (lines 325-329, 364-366). |
| service | buildModelPickerShortList auto row | `packages/ai/routing/src/model-picker.ts` | Builds the Auto row and the continuity text (lines 335-361). |
| hook | useDefaultModelPreference | `apps/web/features/chat/lib/default-model-preference.ts` | Loads and saves the default-model namespace; plan check (lines 36-107). |
| hook | useNewChatDefaultModel | `apps/web/features/chat/hooks/use-new-chat-default-model.ts` | Applies the default on a new chat (lines 13-49). |
| component | DefaultModelRow | `apps/web/features/settings/sections/GeneralSection.tsx` | Settings select with Last used and upgrade hints (lines 361-440). |
| service | preferences-client | `apps/web/app/settings/_lib/preferences-client.ts` | fetchPreferenceNamespace and savePreferenceNamespace used for default-model (import at default-model-preference.ts:5-10). |
| endpoint | /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Stores the default-model namespace in user_settings. |
| component | Mobile Auto rows | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | AutoModeRow list and plan floor (lines 187-210, 316-326, 893-909). |
| store | Mobile newChatModels | `apps/mobile/src/features/model-picker/store.ts` | Remembers the model for new chats per mode and restores it (lines 107-119, 205-234). |
| config | CLI --auto flag and default config | `apps/cli/src/lib.rs` | Auto launch routing and model precedence (lines 470-478, 7994-8055). |
| config | CLI DefaultConfig | `apps/cli/src/config.rs` | default.model field (lines 175-177). |
| config | agiWorkforce.model | `apps/extension-vscode/package.json` | VS Code default model setting, default auto (lines 1219-1223). |
| service | VS Code Auto rows | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | Auto and profile quick pick rows and reachability (lines 62-75, 213-249). |
| service | Chrome reconcileManagedModelSelection | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | Resets unsupported selections to Auto (lines 275-287). |
| test | useNewChatDefaultModel test | `apps/web/features/chat/hooks/__tests__/useNewChatDefaultModel.free-model-promotion.test.tsx` | New-chat default under a free promotion. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web person picks Auto: routing profile and model id are written to the model store and browser storage. | device | ComposerFooter.tsx:1635-1654; apps/web/shared/stores/model-store.ts:364-366 |
| On send, the request names the Auto model; the server classifies the task and chooses a route. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:285-305 imports the routing helpers (classifyTaskFamily, routing trace); full route not traced |
| Default save: the settings select calls savePreferenceNamespace for default-model with modelId. | device and our servers | apps/web/features/chat/lib/default-model-preference.ts:92-102 |
| New chat: the hook reads the saved id, checks the plan, and sets the model store unless the person already changed it. | device | apps/web/features/chat/hooks/use-new-chat-default-model.ts:22-38 |
| CLI --auto asks our servers for the plan tier with a 3 second limit, then resolves a managed route locally. | device and our servers | apps/cli/src/lib.rs:8004-8043 |
| VS Code with no chat open updates the global setting through the editor configuration API. | device | apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1199-1207 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| default-model preference { modelId } | Table user_settings, namespace default-model | Yes, account wide | Replaced on save; null means Last used |
| Routing profile (Web) | Browser key agi-model-store | No | Until browser data is cleared |
| CLI default.model | CLI config file (user or project) | No | Until edited |
| agiWorkforce.model (VS Code) | Editor user settings | By the editor's own settings sync if on [inferred] | Until edited |

**Models and providers.** Auto resolves through the shared routing package and registry, not through a named model in the UI. On the CLI Auto is allowed only for managed cloud; BYOK and Local need an explicit model (apps/cli/src/lib.rs:475-477).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web default needs sign-in to be saved (server preference). CLI --auto needs an AGI account session. |
| Permissions | none found in the code beyond sign-in and CSRF on the preferences route. |
| Subscription | Web Auto row only on a paid plan (ComposerFooter.tsx:1635); profile access is capped by plan through the router (packages/ai/routing/src/model-picker.ts:302). Mobile Cloud Auto uses canAccessAutoRoutingProfileForTier (ModelPickerSheet.tsx:322-324). VS Code Auto is locked when unreachable (modelConstants.ts:213). |
| Limits and metering | Metering for turns is outside this feature (SYS-subscriptions-entitlements-and-usage). |
| Feature flags | none found in the code for the Auto row. |
| Model compatibility | A saved default is skipped when the model is not on the plan (default-model-preference.ts:47-50; use-new-chat-default-model.ts:33). |
| Provider restrictions | CLI --auto conflicts with --model and --provider (apps/cli/src/lib.rs:477). |
| Local mode | Mobile local picker offers Auto on every plan because on-device routing costs nothing (ModelPickerSheet.tsx:316-326). CLI Local and BYOK need an explicit model. Web Desktop: Auto is a cloud choice; a local model overrides the label (ComposerFooter.tsx:1459). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Default loading or failed | Select disabled until ready; error with Try again on failure. | GeneralSection.tsx:402-403, 432-440; default-model-preference.ts:59-78 |
| Plan unknown | Default choices empty and the select disabled. | GeneralSection.tsx:368-369, 402 |
| Saved default not on plan | Shows 'Last used' with a hint; new chats use the last model. | GeneralSection.tsx:380-391 |
| Free plan with Auto stored | Replaced by the promoted or free default. | ComposerFooter.tsx:1346-1348 |
| Free promotion running | The promoted model wins over a saved Free default for every new chat. | use-new-chat-default-model.ts:28, 45-47; test useNewChatDefaultModel.free-model-promotion.test.tsx |
| CLI session expired with --auto | Prints a warning to run login and falls back to the free tier policy. | apps/cli/src/lib.rs:8012-8026 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/hooks/__tests__/useNewChatDefaultModel.free-model-promotion.test.tsx`: New Free chat: promoted model over saved default; not over a choice in the same chat; plan default after promotion.
- `packages/ai/routing/src/__tests__/model-picker.test.ts`: Auto first, registry label, continuity line, Auto not in selectable count.
- `apps/web/shared/stores/model-store.test.ts`: Auto routing profiles classified as managed cloud and canonical labels.
- `apps/extension/__tests__/managed-model-picker.test.ts`: Chrome Auto only before admission; reset of stale named Auto selections.
- `apps/extension-vscode/src/__tests__/modelPickerTierGate.test.ts`: Auto admitted on paid plan and off on Free.
- `apps/cli/src/lib.rs`: In-file test auto_rejects_direct_provider_or_model_overrides (line 10798).

**Test scenarios**

- **Auto on a paid plan (Web)**
  1. Sign in on a paid plan, open the picker, choose Auto.
  2. Send two messages of different kinds.
  - Expected: Trigger shows Auto; each answer discloses its serving model.
- **Default for new chats (Web)**
  1. Settings > General > Default model, pick a model on your plan.
  2. Open a new chat.
  - Expected: Composer starts on that model; a chat already open is unchanged.
- **Default off plan**
  1. Set a default, then downgrade or use an account without that plan.
  - Expected: Hint 'Your saved default is not on your plan ...' and the last used model is kept.
- **CLI auto**
  1. Run agi --auto 'hello' while signed in.
  - Expected: A managed model is chosen and named; with --model the command is refused.
- **VS Code default**
  1. Close any chat, run Code: Select Model, pick a model.
  - Expected: Message 'new chats now use <name>' and agiWorkforce.model changes.

**Where to look when it fails**

- Network: PUT /api/settings/preferences with namespace default-model.
- CLI stderr: 'AGI session expired, run `agi login` ...' (lib.rs:8013-8017).
- VS Code settings JSON key agiWorkforce.model.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/015-model-selector-interface.md](../../70-qa/test-plans/web/015-model-selector-interface.md)
- Desktop: [70-qa/test-plans/desktop/015-model-selector-interface.md](../../70-qa/test-plans/desktop/015-model-selector-interface.md)
- Mobile: [70-qa/test-plans/mobile/015-model-selector-interface.md](../../70-qa/test-plans/mobile/015-model-selector-interface.md)
- CLI: [70-qa/test-plans/cli/015-model-selector-interface.md](../../70-qa/test-plans/cli/015-model-selector-interface.md)
- VS Code: [70-qa/test-plans/vscode/015-model-selector-interface.md](../../70-qa/test-plans/vscode/015-model-selector-interface.md)
- Chrome: [70-qa/test-plans/chrome/015-model-selector-interface.md](../../70-qa/test-plans/chrome/015-model-selector-interface.md)

## 10. Gaps and dependencies

- **CLI /model overlay has no Auto row; Auto is reachable only by the launch flag.** Affects: CLI. Evidence: apps/cli/src/tui/widgets/model_picker.rs:126-193; apps/cli/src/lib.rs:470-478. Work needed: Add Auto to the overlay for managed sessions or document the flag.
- **No default-model setting on Mobile or Chrome.** Affects: Mobile and Chrome. Evidence: No setting found; Mobile restores per-mode last choice (store.ts:205-234); Chrome stored choice (side_panel.ts:11487-11500). Work needed: Decide if the last-choice behaviour satisfies S15.09 and update the brief.
- **The brief's CLI line references are stale.** Affects: Documentation. Evidence: apps/cli/src/lib.rs:461, 1194, 2264, 4317, 4350 are unrelated code. Work needed: Regenerate the brief's code column.
- **Whether /model choices in the CLI become the saved default is not established.** Affects: CLI. Evidence: apps/cli/src/tui/tui_app.rs:5073-5109 does not write config. Work needed: Confirm and, if intended, add a save step or a command.
- **Free Web users cannot use Auto even though a free routing option may be wanted by the product.** Affects: Free Web and Desktop users. Evidence: ComposerFooter.tsx:1346-1348. Work needed: Product decision; not a code defect if intended.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- SYS-api-and-contracts
- F015-01
- F015-05
- api:PUT /api/settings/preferences
- table:user_settings

## Unknown

- Whether Auto can be saved as the Web default model (membership of Auto in availableModels not checked).
- Whether CLI /model writes the default to the config file.
- How the server finally resolves Auto to a concrete model (request-processor route not traced).
- Whether the CLI onboarding choice 'Choose your default model' saves to the config (onboarding.rs:587 returns the choice; the save call was not found).
- Whether VS Code global setting sync is on.
