---
id: "F015-11"
type: "feature"
title: "Local and own-key routes"
aliases: ["On this device section", "Local models", "Own-key route", "Bring your own key (BYOK)", "Local-model selection", "Local scope sheet", "Your key", "Needs setup on this machine"]
area: "15 Model-selector interface"
available_on: ["mobile", "cli", "vscode"]
implementation: {web: "n/a", desktop: "missing", mobile: "built", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S15.27", "S15.28"]
depends_on: ["SYS-local-inference", "SYS-execution-boundaries", "SYS-inference-providers", "SYS-security-and-privacy", "SYS-authentication-and-identity", "SYS-sync-and-continuity", "mode:local", "mode:own-key", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "provider:ollama", "provider:lmstudio", "store:local-model-selection", "file:apps/desktop/electron/runtime/dispatcher.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F015-11 Local and own-key routes

Lets a person run a model on their own device or send turns through their own provider key. CLI has Local, Your key and Managed sections and discovers Ollama and LM Studio models. Mobile has an on-device model sheet with downloads. VS Code is route-aware. Public Desktop (Electron) refuses local inference. Chrome is cloud-only.

Area: [15. Model-selector interface](README.md). Requirement items: [S15.27](../../10-requirements/capabilities/015-model-selector-interface.md#s1527), [S15.28](../../10-requirements/capabilities/015-model-selector-interface.md#s1528).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Offers non-managed routes in the picker: models that run on the device, and models called with the person's own provider key, kept apart from the managed cloud.

**Why it exists.** Local inference must stay free of any paid plan and private; own-key use keeps the key and billing with the person. Local, own-key and managed are separate trust boundaries and nothing may silently cross them (AGENTS.md section 6).

**Who uses it.** Privacy-minded users, developers, people without a paid plan, and people with their own provider accounts.

**Problems it solves**

- Using AI without a subscription or network.
- Keeping a chat on the device.
- Paying a provider directly instead of through the AGI plan.

**Use cases**

- On Mobile, open the sheet in local scope, download an on-device model and chat offline.
- In the CLI, run /model and pick a model under 'Local' discovered from Ollama.
- In VS Code, pick a model whose provider key is missing and be offered 'Add your <provider> key'.
- On the internal Tauri desktop build, open 'On this device' and pick a model from LM Studio.

## 2. User experience

**Where to find it**

- Web (only inside the internal Tauri shell; the public Electron Desktop does not show it): composer model menu section 'On this device' with a 'Local' badge (apps/web/features/chat/components/Composer/ComposerFooter.tsx:194-196,529-620,1721-1726); footer row 'Manage local models' (1766-1781).
- Mobile: model sheet with scope local, cloud or all; local models show 'Ready', 'Download', 'Retry', 'Device' badges and file size (apps/mobile/src/features/model-picker/components/ModelRow.tsx:87-95,253-269; ModelPickerSheet.tsx:256-270,320-352).
- CLI: /model sections 'Local · on-device · private · free', 'Bring your own key · your own provider keys', 'Cloud subscription · managed by AGI subscription' (apps/cli/src/design_system.rs:146-177; apps/cli/src/tui/widgets/model_picker.rs:80-168).
- VS Code: Select Model quick pick with sections by provider, locked groups 'Add your <provider> key', and 'Needs setup on this machine' (apps/extension-vscode/src/features/model-picker/modelConstants.ts:140-200; features/model-picker/reachability.ts:36).
- Chrome: not present.

**Before you start**

- Web local section: a Tauri shell (hostHasLocalMode, packages/contracts/local-runtime/src/host-bridge.ts:690-692), a reachable Ollama or LM Studio, a non-Free plan (the section is hidden on Free, ComposerFooter.tsx:1721,1766), and a one-time grant 'Use models on this device'.
- Mobile local: the device must meet the model's memory and platform needs (tests model-picker-ram-gate.test.ts, model-picker-env-gate.test.ts).
- CLI own key: provider credentials stored through the auth store (apps/cli/src/auth.rs:209-225).
- VS Code own key: route trust mode byok with a provider (modelConstants.ts:182-200).

**Screens and controls**

- Web grant button 'Use models on this device' with text 'Asks once, then lists what Ollama and LM Studio have loaded' (ComposerFooter.tsx:196-200,553-570).
- Web local rows grouped by server; row label '<model> - <server>, runs on this device' (ComposerFooter.tsx:575-606).
- Web trigger receipt '<server> on this device · nothing leaves this Mac' (1274-1275).
- Mobile 'Cancel download' under a downloading row (ModelRow.tsx:318-335).
- CLI picker header badge 'Local · Your key · Managed' (model_picker.rs:372-380).

**Journey**

1. Open the picker.
2. Find the local or own-key section.
3. Web: grant access once, then pick a model. Mobile: tap a model, confirm download if needed, wait for Ready. CLI: pick a row under Local or Bring your own key. VS Code: pick a row; if a key is missing, follow the offer.
4. Send a message; the answer is computed on the device or by the provider the key belongs to.
5. Web: to return to a cloud model after local turns, confirm the fork dialog.

**What the person sees and gets**

- Web fork dialog: title 'Start a new chat for a cloud model?', button 'Start a new chat' (apps/web/features/chat/hooks/useLeaveLocalModel.tsx:10-12,36-58).
- Web hidden-model note when a model is below the minimum size (LocalHiddenModels, ComposerFooter.tsx:497-509; test ComposerFooter.localModels.test.tsx:184).
- CLI session-total notes 'no cost, local model', 'billed by your provider', 'included in your plan' (design_system.rs:138-144).
- VS Code modal text when a switch crosses a trust boundary: 'this chat keeps its work inside one trust boundary...' (commandSetup.ts:1334-1340).

**Settings**

- Web local model settings section (LOCAL_MODELS_SETTINGS_SECTION, ComposerFooter.tsx:1766-1781).
- Mobile download over cellular setting (allowCellularDownloads, ModelPickerSheet.tsx, store read near line 300).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI: models grouped Local, Your key, Cloud; Local first (design_system.rs:109-113); Local and own-key rows are never plan-gated (model_picker.rs:196-214); Ollama and LM Studio models discovered by a background probe and added to the picker (tui_app.rs:3361-3410,7110-7125).
- CLI: credentials file written with owner-only mode and refused if other accounts can read it (apps/cli/src/auth.rs:209-225).
- CLI: a managed (Cloud) pick starts a managed session; a cross-mode cycle is refused (tui_app.rs:5073-5100; next_cycle_model comment around 5110-5125).
- Mobile: local sheet is the default scope (ModelPickerSheet.tsx:270); on-device Auto is offered on every plan because on-device routing costs nothing (ModelPickerSheet.tsx:316-326 comment); downloads, cancel, retry (ModelRow.tsx:253-335).
- VS Code: route-aware locks and boundary refusal (modelConstants.ts:182-200; commandSetup.ts:1302-1345); host reachability sections (reachability.ts:36-110).
- Web (Tauri shell only): local list, grant, selection not persisted, fork dialog on leaving (use-local-models.ts:33-80; local-model-selection.ts; useLeaveLocalModel.tsx).

**Incomplete**

- Web local section is hidden on the Free plan, which conflicts with local inference being free of any paid plan (ComposerFooter.tsx:1721,1766).
- CLI discovered local models have context 0 and default capability flags (tui_app.rs:3384-3410).
- Mobile has no own-key route; Chrome neither.

**Present but disconnected or switched off**

- Public Desktop (Electron): every local inference command returns 'unsupported-platform' with the text that Desktop answers every conversation in the cloud (apps/desktop/electron/runtime/dispatcher.ts:3236-3244,3366-3368). The device heartbeat reports localModels false (dispatcher.ts:2298). The Web section is therefore not shown there because hostHasLocalMode is true only for the Tauri shell (host-bridge.ts:690-692; apps/web/features/desktop-host/lib/host.ts:42-48).

**Not available**

- Chrome: no local or own-key route (docs/decisions/README.md item on Chrome cloud-only; brief marks missing).
- Web in a normal browser: no local models (ComposerFooter.localModels.test.tsx:116).

## 4. Required behaviour

**Established requirements**

- The user can pick a model that runs on their own device. (source: brief S15.27 (desktop, mobile, cli, vscode done; chrome missing))
- The user can choose to send turns through their own provider key. (source: brief S15.28 (cli, vscode done; chrome missing))
- Nothing may silently route a Local chat, file or session to own-key or managed cloud; a Local-to-own-key move is an explicit fork with consent and a visible provider label. (source: AGENTS.md section 6)
- BYOK routes are provider-labelled and gated; key and consent state is visible before use. (source: doc: docs/product/requirements.md, M-MODEL-004)
- Local models show availability: installed, downloadable, unavailable or offline are distinct. (source: doc: docs/product/requirements.md, M-MODEL-002)
- The public Desktop is the Electron shell and its chat is Cloud-only; Tauri is retained internal code. (source: apps/desktop/electron/runtime/dispatcher.ts:3236-3241 comment; doc: docs/decisions/README.md (D-2026-09-15-04))
- Local inference on mobile and desktop is free of any paid subscription. (source: product requirement given for this knowledge base)

**Acceptance criteria**

1. On Mobile in local scope with no sign-in, the sheet lists on-device models and Auto and no cloud rows are selectable.
2. A Mobile model in 'Download' state starts a download only after the user confirms, and 'Cancel download' stops it.
3. On CLI, /model lists Local before Your key before Cloud; selecting a Local row sends nothing to the AGI cloud.
4. On CLI, a cloud row above the cached tier is dimmed with 'needs <plan>' while Local and own-key rows are never dimmed.
5. On the Tauri build, a chat that holds local answers asks 'Start a new chat for a cloud model?' before switching to a cloud model, and Cancel keeps the local model.
6. On public Desktop (Electron), no 'On this device' section is shown and local commands return unsupported-platform.
7. In VS Code, a model needing another provider's key is filed under 'Add your <provider> key' and picking it offers to open configuration.
8. A Free user can reach local models on every surface that supports them.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because local inference must be free of paid plans, hiding the Web local section on Free is a defect on any shell that supports local mode [inferred].
- The Electron refusal is deliberate, so a Desktop local requirement conflicts with the recorded Cloud-only decision; the owner must decide [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the Web local section to Free users on shells that support it.
- [proposed] Record in the brief that public Desktop has no local route and reclassify S15.27 for Desktop.
- [proposed] Show provider label and key state on own-key rows in the CLI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LocalModelSection | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Local section, grant button, groups by server (529-620); usage at 1721 and 1766. |
| hook | useLocalModels | `apps/web/features/desktop-host/hooks/use-local-models.ts` | Reads status, grants, lists models (33-80). |
| store | useLocalModelSelection | `apps/web/features/desktop-host/lib/local-model-selection.ts` | In-memory, not persisted selection (store:local-model-selection). |
| hook | useLeaveLocalModel | `apps/web/features/chat/hooks/useLeaveLocalModel.tsx` | Fork dialog when leaving a local model. |
| service | runtime-client local commands | `apps/web/features/desktop-host/lib/runtime-client.ts` | local_model_servers, local_model_list calls (582-588). |
| service | hostHasLocalMode | `packages/contracts/local-runtime/src/host-bridge.ts` | True only for the tauri shell (690-692). |
| config | LOCAL_INFERENCE_COMMANDS | `packages/contracts/local-runtime/src/inference.ts` | List of local commands, local: id prefix (3-40). |
| service | Electron dispatcher refusal | `apps/desktop/electron/runtime/dispatcher.ts` | Refuses local commands (3236-3244,3366-3368); heartbeat localModels false (2298). |
| component | Mobile ModelPickerSheet | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | Scope local, cloud, all; on-device list; downloads (256-352). |
| component | Mobile ModelRow | `apps/mobile/src/features/model-picker/components/ModelRow.tsx` | Install badges, cancel, consent note (87-335). |
| store | model install store | `apps/mobile/src/features/model-picker/installStore.ts` | Download jobs and installed ids (store:modelInstall). |
| component | CLI picker access modes | `apps/cli/src/tui/widgets/model_picker.rs` | Sections and locking rules (80-214). |
| service | CLI local discovery | `apps/cli/src/tui/tui_app.rs` | DISCOVERED_LOCAL_MODELS and available_picker_models (3361-3410). |
| service | CLI auth store | `apps/cli/src/auth.rs` | Credential file with owner-only mode (209-225). |
| service | VS Code route locks | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | ModelRoute and ModelLock (127-200). |
| service | VS Code reachability | `apps/extension-vscode/src/features/model-picker/reachability.ts` | HostModel trust modes, 'Needs setup on this machine', boundary refusal (1-110). |
| command | VS Code selectModel | `apps/extension-vscode/src/core/commandSetup.ts` | Picker flow, unreachable offer, boundary refusal (1302-1345). |
| test | Web local model tests | `apps/web/features/chat/components/Composer/ComposerFooter.localModels.test.tsx` | Local section rules. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web asks the host for local server status and, after the person grants access, lists local models. | device | use-local-models.ts:33-65; runtime-client.ts:582-588 |
| Selecting a local model sets an in-memory selection and sends the turn to the local server; the cloud is not called. | device | ComposerFooter.tsx:1131-1140; lib/hooks/useChatStream.ts:4473-4500 (runLocalTurn) |
| Leaving a local model after local turns asks to fork into a new chat. | device | useLeaveLocalModel.tsx:36-58 |
| Mobile runs an on-device model from stored files; a missing model file is downloaded from a model host only after the person confirms. | device | ModelRow.tsx:253-335; installStore.ts; localModelRuntime.ts (not read in detail) |
| CLI probes Ollama and LM Studio on the machine in the background and adds the results to the picker. | device | tui_app.rs:3361-3410,7110-7125 |
| CLI own-key turns call the provider directly with the stored key. | outside service | auth.rs:209-225; AccessMode Byok in design_system.rs:100-133 |
| VS Code asks the local runtime host which models are reachable and files the rest under setup or lock headings. | device | commandSetup.ts:1302-1330; reachability.ts:59-110 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Local model list and selection | Web memory only (local-model-selection.ts comment: not persisted) | No | Cleared on reload |
| On-device model files | Mobile app storage via the install store | No | Removal path not read |
| Provider keys | CLI credential file with owner-only mode (auth.rs:209-225); VS Code secret storage via context.secrets (commandSetup.ts uses context.secrets) | No sync found | Kept until sign-out or removal; deletion flow not read |

**Models and providers.** Local models come from the user's own Ollama or LM Studio (Web, CLI) or bundled and downloadable on-device models (Mobile). Own-key rows come from the provider catalogue and are reached directly. Registry membership never authorizes a cross-boundary route (AGENTS.md section 6).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Mobile local and CLI local and own-key need no AGI plan. Web local needs a shell with local mode and a non-Free plan today (ComposerFooter.tsx:1721). Sign-in rules for local on Mobile: the local scope is the default and no sign-in gate was found for it (ModelPickerSheet.tsx:270). |
| Permissions | Web needs a one-time grant 'local.inference' ('answer chats with a model running on this Mac', apps/desktop/electron/runtime/permissionManager.ts:269) before names are listed (use-local-models.ts comment). |
| Subscription | Local inference is not metered by the plan: CLI says local costs nothing and own-key is 'billed by your provider' (design_system.rs:138-144). Web hides the local section for Free (contradiction recorded as a gap). |
| Limits and metering | No AGI usage metering for local or own-key turns was found in the files read; the CLI cost note says so. |
| Feature flags | Mobile native purchases flag affects upgrade prompts only (storePurchases.json). |
| Model compatibility | Local models below a minimum size are hidden with a reason (use-local-models.ts:62-63; ComposerFooter.localModels.test.tsx:184). Local models cannot attach files or join projects on Web (LOCAL_MODEL_PROJECT_REFUSAL, ChatComposerNew.tsx near 5300; test ChatComposerNew.localAttachments.test.tsx). |
| Provider restrictions | VS Code refuses a model that would cross the chat's trust boundary (commandSetup.ts:1334-1340); CLI refuses a Fast or cycle move into another access mode (agent/mod.rs:2951-2958). |
| Local mode | Local models are never sent to the cloud; leaving forks the chat with consent (useLeaveLocalModel.tsx:10-12). CLI Local rows are never gated by plan (model_picker.rs:196-214). Public Desktop refuses local inference (dispatcher.ts:3236-3244). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No local server running | Web shows no 'On this device' section. | ComposerFooter.localModels.test.tsx:129; ComposerFooter.tsx:536 |
| Not yet granted | Web shows the grant row and lists nothing. | ComposerFooter.localModels.test.tsx:136; ComposerFooter.tsx:553-570 |
| Grant refused | Message 'Local models stay off until you allow them.' | use-local-models.ts:24,56-58 |
| No local models | 'No models loaded on this device yet.' | ComposerFooter.tsx:200,572-578 |
| Download in progress, failed, unavailable | Mobile shows percent, 'Retry' badge or 'Device' badge and the error text. | ModelRow.tsx:253-346 |
| Selected local model gone | Mobile chat text 'This Local Mode chat uses a model that is no longer available on this device. Open Models and pick a local model to continue.' | apps/mobile/stores/chat/chatExecutionStore.ts:1296-1297 |
| Offline | Local and own-key CLI sessions need no AGI network; Web local needs the host only. Offline cloud behaviour is not handled here. | model_picker.rs:196-214 |
| Accessibility | Local rows carry labels '<model> - <server>, runs on this device'. | ComposerFooter.tsx:575-606 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ComposerFooter.localModels.test.tsx`: No section in a browser or cloud-only shell or with no server; grant first; grouping and Local mark; settings link; hidden small models.
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Dispatcher tests (local-inference refusal coverage not confirmed).
- `apps/mobile/__tests__/model-picker-ram-gate.test.ts`: Memory gate for local models.
- `apps/mobile/__tests__/model-picker-env-gate.test.ts`: Environment gate in the Mobile picker.
- `apps/mobile/src/features/model-picker/__tests__/downloadConfirmationWording.test.ts`: Download confirmation wording.
- `apps/extension-vscode/src/__tests__/modelPickerReachability.test.ts`: Reachable first, unreachable under one section, boundary refusal.
- `apps/extension-vscode/src/__tests__/modelPickerTierGate.test.ts`: Byok and local tiers, locks filed by unlock action.
- `apps/cli/src/tui/widgets/model_picker.rs`: Inline picker tests (from line ~836).

**Test scenarios**

- **Public Desktop has no local section**
  1. Open the Electron Desktop.
  2. Open the model menu.
  - Expected: No 'On this device' section; calling a local command returns unsupported-platform.
- **Tauri local flow**
  1. Run the internal Tauri build with Ollama running.
  2. Open the menu; press 'Use models on this device'; pick a model; send a message; then pick a cloud model.
  - Expected: Local row marked Local; fork dialog appears; 'Start a new chat' opens a new chat.
- **Mobile offline local chat**
  1. Download an on-device model.
  2. Turn on airplane mode.
  3. Send a message.
  - Expected: Answer produced on the device; no network calls.
- **CLI own key**
  1. Sign in with a provider key.
  2. Run /model; pick a row under 'Bring your own key'.
  - Expected: Banner 'Model changed to <id> (...)'; session total reads 'billed by your provider'.
- **VS Code missing key**
  1. Use a BYOK route with one provider key.
  2. Open Select Model; pick a model from another provider.
  - Expected: Message ending 'Add your <provider> key to use it' with that action button.

**Where to look when it fails**

- Dispatcher refusal text 'AGI Desktop answers every conversation in the cloud...' (built from the product name) with code unsupported-platform.
- CLI: 'Model switch failed:' message; credential file error 'holds credentials in the clear and is readable by other accounts' (auth.rs:215-225).
- Mobile install store job status and error text.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/015-model-selector-interface.md](../../70-qa/test-plans/mobile/015-model-selector-interface.md)
- CLI: [70-qa/test-plans/cli/015-model-selector-interface.md](../../70-qa/test-plans/cli/015-model-selector-interface.md)
- VS Code: [70-qa/test-plans/vscode/015-model-selector-interface.md](../../70-qa/test-plans/vscode/015-model-selector-interface.md)

## 10. Gaps and dependencies

- **Public Desktop (Electron) cannot use local models; the brief marks Desktop done.** Affects: Desktop users; requirement that local inference be free of paid plans on desktop. Evidence: dispatcher.ts:3236-3244,3366-3368,2298; host-bridge.ts:690-692. Work needed: Owner decision: reverse the Cloud-only decision or reclassify; if reversed, route local commands in Electron.
- **Web local section is hidden for the Free plan.** Affects: Free users on shells with local mode. Evidence: ComposerFooter.tsx:1721,1766. Work needed: Remove the plan condition for local models.
- **CLI local rows show no context or capability.** Affects: CLI. Evidence: tui_app.rs:3384-3410. Work needed: Fill facts from the local server where available.
- **Own-key route is absent on Web, Mobile and Chrome and its key state is not shown in the CLI picker.** Affects: Those apps. Evidence: Picker files read; docs/product/requirements.md M-MODEL-004. Work needed: Decide per surface; show key state on own-key rows.
- **No test confirms the Electron refusal of local commands.** Affects: Desktop. Evidence: apps/desktop/electron/__tests__/dispatcher.test.ts grep for the refusal text not done. Work needed: Add or confirm a test.
- **Brief cites for this feature point to unrelated code (dispatcher.ts:799, VS Code capabilityManagement.ts:1106, localRuntimeClient.ts:1479).** Affects: Documentation readers. Evidence: Files opened at those lines. Work needed: Refresh cites.
- Not built on: Desktop, Chrome (from the capability ledger).

**Depends on**

- SYS-local-inference
- SYS-execution-boundaries
- SYS-inference-providers
- SYS-security-and-privacy
- SYS-authentication-and-identity
- SYS-sync-and-continuity
- mode:local
- mode:own-key
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- provider:ollama
- provider:lmstudio
- store:local-model-selection
- file:apps/desktop/electron/runtime/dispatcher.ts

## Unknown

- How Mobile on-device inference runs end to end (localModelRuntime.ts not read).
- Whether Mobile local scope needs any sign-in for first use (no gate found; onboarding uses local scope).
- Where VS Code stores own keys and how they are removed (context.secrets used; removal flow not read).
- Whether the CLI stores provider keys in an OS keychain or the owner-only file (secure_store.rs not read).
- Whether any test covers the Electron local refusal.
- Whether Web own-key routes exist outside the picker (none found in the picker).
