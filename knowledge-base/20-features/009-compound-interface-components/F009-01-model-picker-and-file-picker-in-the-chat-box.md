---
id: "F009-01"
type: "feature"
title: "Model picker and file picker in the chat box"
aliases: ["Model picker", "Models menu", "Model catalogue", "Model sheet (mobile)", "/model picker (CLI)", "Select Model quick pick (VS Code)", "Files menu", "Composer files menu", "Library file picker", "Searchable resource picker (S9.01)", "Model picker (S9.02)"]
area: "9 Compound interface components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S9.01", "S9.02"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "SYS-local-inference", "SYS-execution-boundaries", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:own-key", "mode:cloud", "api:GET /api/library", "api:GET /api/models/catalogue"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F009-01 Model picker and file picker in the chat box

Lets a person choose which model answers and attach a file already stored in their library, narrowing long lists as they type. Web and Desktop share one menu; Mobile, CLI, VS Code and Chrome each have their own model picker. Only Web and Desktop have the stored-file picker, and it appears only in AGI Work mode.

Area: [9. Compound interface components](README.md). Requirement items: [S9.01](../../10-requirements/capabilities/009-compound-interface-components.md#s901), [S9.02](../../10-requirements/capabilities/009-compound-interface-components.md#s902).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Model picker: lists the models a person may use and switches the chat to the one they pick. A search box narrows the list. Models the plan cannot use are marked and lead to upgrade. Files menu (Web and Desktop only): shows the six most recent library files, searches the library as the person types, and attaches the chosen file to the message, or opens the device file dialog.

**Why it exists.** The product is model agnostic and has hundreds of catalogue entries, so a flat list is unusable. People also reuse files they uploaded or generated earlier and should not have to upload them again. Both pickers must tell the truth about plan limits (brief S9.01, S9.02; doc: docs/product/experience-contract.md:776).

**Who uses it.** Any signed-in or signed-out chat user choosing a model; paid users in AGI Work mode attaching stored files; testers checking plan locking.

**Problems it solves**

- Finding one model in a long list without scrolling.
- Knowing before sending that a model needs a higher plan, instead of failing after sending.
- Re-attaching a stored file without re-uploading it.
- Not being told a model 'requires upgrade' while the plan is still loading.

**Use cases**

- On Web, open the model menu in the chat box footer, type part of a name, click a result.
- On Mobile, open the model sheet, search, tap an on-device model that is not downloaded and confirm the download.
- In the CLI, run /model, type to filter, press Enter.
- On Web in AGI Work mode, open Files, type a file name, click it to attach.

## 2. User experience

**Where to find it**

- Web and Desktop (Desktop shows the hosted web app, doc: AGENTS.md section 5): model trigger in the chat box footer (ComposerFooter, heading 'Models') (apps/web/features/chat/components/Composer/ComposerFooter.tsx:206). Files button labelled 'Files' in the work bar under the chat box (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:367, :7113).
- Mobile: bottom sheet headed 'Models' opened from the chat screen (apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:725 area).
- CLI: '/model' with no argument opens the overlay 'Models' (apps/cli/src/tui/widgets/model_picker.rs:3).
- VS Code: command agi-workforce.selectModel, a quick pick titled 'Select Model' with the current model as placeholder (apps/extension-vscode/src/core/commandSetup.ts:1313-1326).
- Chrome: model selector button in the side panel (#sp-model-selector-btn); opening the full catalogue shows a 'Search models' field and a capability filter (apps/extension/src/side_panel.ts:11241-11330).

**Before you start**

- Web model picker: none to open it; locking depends on the plan once it is known (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1042).
- Web Files menu: billing policy loaded, not a free trial, the canUseAgiWork capability, and AGI Work mode switched on (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1062-1067, :2767-2768).
- Mobile cloud models: cloud access unlocked (waitlist) and a plan; on-device models need a download first (apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:473-545).
- VS Code and CLI: a resolved tier or route decides which rows are locked (apps/extension-vscode/src/features/model-picker/modelConstants.ts:182; apps/cli/src/tui/widgets/model_picker.rs:206).

**Screens and controls**

- Web model menu: short list with Auto row, recommended rows, a catalogue disclosure with 'Search models' field, 'Back to the short list', capability chips ('Filter by capability'), Favourites and Recent rails, 'Try again' on a failed catalogue (apps/web/features/chat/components/Composer/ModelCatalogue.tsx:27-45). Typing a letter in the short list opens the catalogue on that query (ComposerFooter.tsx:971-992). Short-list search shows 'Matching <query>' and 'No models match' (ComposerFooter.tsx:1601-1611).
- Web Files menu: search field labelled 'Search library files', rows labelled 'Attach <file name>', 'Browse all' link to /library, 'Upload from device' (ComposerFilesMenu.tsx:28-33, :300-345).
- Mobile sheet: 'Search models…' field with 'Clear search', filter chips, effort slider (cloud reasoning models), favourites, close button 'Close model picker' (ModelPickerSheet.tsx:806-819, :735).
- CLI overlay: search line 'type to filter by name or provider...', sections Local, Your key, Managed; Up/Down move, Tab jumps provider, Left/Right change effort, Enter selects, Esc closes (apps/cli/src/tui/widgets/model_picker.rs:693-830).
- VS Code quick pick: grouped rows, locked rows listed under what unlocks them (modelConstants.ts:130-230).

**Journey**

1. Web model: open the model trigger, optionally type to filter, click a row. If the row is locked for the plan, click opens the upgrade flow and does not switch. If the new model cannot handle something in the request, a switch notice appears with 'Keep <model>'; otherwise the model is saved for the conversation and the menu closes (ComposerFooter.tsx:1143-1190).
2. Web file: open Files, optionally type; after 200 ms the list refreshes from the server; click a row to fetch the file bytes and attach it; the menu closes on success.
3. Mobile: open sheet, type, tap a model. Locked cloud models open the plan screen (or the invite screen when cloud is not unlocked). A model not on the device asks for download confirmation, downloads, then selects (ModelPickerSheet.tsx:473-545).
4. CLI: type '/model', type letters (search is focused on open), arrow to a row, Enter. A banner 'Model changed to ...' follows (model_picker.rs:769-800).

**What the person sees and gets**

- Locked rows show a plan label such as '<plan> and above', a 'Coming soon' or 'Beta' label for unavailable models (ComposerFooter.tsx:214, :1215-1226).
- Files menu shows a spinner 'Loading files', 'No files in your library yet.', 'No library file matches that search.', 'The library could not be loaded.', and 'That file could not be added. Try again.' (ComposerFilesMenu.tsx:34-39, :313).
- A failed model save shows the toast 'Could not save the model for this conversation. The previous model remains active.' (ComposerFooter.tsx:1157).

**Settings**

- Favourites and recent models (useModelFavourites, useChatModelStore) (ComposerFooter.tsx:1201-1202, :1136).
- Mobile: allow cellular downloads setting read by the download prompt (ModelPickerSheet.tsx:303).
- Reasoning effort and fast mode controls beside the picker (ComposerFooter.tsx:1883, :2060).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop model menu with filtering, plan locking, upgrade click-through and compatibility notice on switch (apps/web/features/chat/components/Composer/ComposerFooter.tsx:671, :1171-1190, :1260-1269).
- Web unknown-plan rule: lock decisions use knownTier, which is null until billing policy is ready or the visitor is signed out, and modelLock treats a null tier as selectable (ComposerFooter.tsx:1042; apps/web/features/chat/lib/model-plan-admission.ts:25).
- Web Files menu: 200 ms debounce, abort of the earlier request, error copy, attach failure kept visible, query and error cleared on close (ComposerFilesMenu.tsx:45, :202-226, :251-257, :268).
- Mobile sheet search over name, provider, provider label, runtime label and id; download confirmation for models not on the device; selecting with an effort sets the effort (ModelPickerSheet.tsx:376-391, :516-546).
- CLI overlay with fuzzy filter by id, provider label and display name, grouped by Local, Your key, Managed (model_picker.rs:109-195).
- VS Code quick pick that files unreachable models under what would unlock them (modelConstants.ts:182-230; test apps/extension-vscode/src/__tests__/modelPickerTierGate.test.ts:82).
- Chrome side-panel catalogue search and capability filter (apps/extension/src/features/cloud-bridge/managedModelPicker.ts:249-266).

**Incomplete**

- Web has two search paths: the short list filters the bundled model list by name, provider and description, while the catalogue field filters catalogue entries (ComposerFooter.tsx:1260-1269; ModelCatalogue.tsx:381). Whether they always agree is not established.
- The Files menu is gated to AGI Work mode and a paid capability, so ordinary chat has no stored-file picker (ChatComposerNew.tsx:1062, :2768).

**Present but disconnected or switched off**

- Web: lockModelSelector is passed as false by the composer, so the 'locked slot' trigger branch exists in ComposerFooter but the composer never turns it on (ChatComposerNew.tsx:6739; ComposerFooter.tsx:1438).

**Not available**

- Stored-file picker in the chat box on Mobile, CLI, VS Code and Chrome: no code found in the files opened; the brief gives no code for them (brief S9.01). Mobile has a library folder with a picker-scope hook (apps/mobile/src/features/library/useLibraryPickerScope.ts) that was not opened.
- CLI model picker: locked managed rows are not blocked; Enter still selects them (model_picker.rs:199-205).

## 4. Required behaviour

**Established requirements**

- A picker lists selectable resources (files, projects, models, skills) and narrows the list as the user types a query. (source: brief S9.01)
- A control lists the available models and switches the conversation to the one the user picks. (source: brief S9.02)
- Picker eligibility agrees with the server's effective plan, deployment, model and route policy; catalogue failures settle into an error state with bounded retry; closing the picker cancels obsolete work. (source: doc: docs/product/experience-contract.md:776)
- Layout and display hacks must not own model facts; the model registry is the source of truth for model, capability, price and rollout. (source: doc: docs/product/experience-contract.md:100)
- A model the plan cannot use is shown locked with a label and clicking it opens upgrade (first-draft requirement, confirmed in Web code). (source: apps/web/features/chat/components/Composer/ComposerFooter.tsx:671-675)

**Acceptance criteria**

1. Typing in the Web model search narrows the list and shows 'No models match' when nothing matches.
2. With the plan still loading, no row is marked locked or labelled 'requires upgrade'.
3. On a Free plan, clicking a locked model opens the upgrade flow and the selected model does not change.
4. Web Files search sends one request about 200 ms after typing stops and aborts the earlier request; the query string carries q and limit=6.
5. If /api/library fails the Files menu shows 'The library could not be loaded.'; if the file fetch fails the error stays in the menu and the menu stays open.
6. Closing the Files menu or the model menu clears the typed text and any error.
7. On Mobile, choosing a model from an effort row sets that effort as well as the model.
8. In the CLI, typing after opening filters rows without pressing '/' first; '/' refocuses search after arrow navigation.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI should mark locked rows and warn before selecting them, since it keeps them selectable only to avoid an empty picker [inferred from model_picker.rs:199-205].
- Silent no-op on a locked Mobile tap when native purchases are unavailable should give a message [inferred from ModelPickerSheet.tsx:466].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Share one filter function between the Web short list and the catalogue so both rank the same way.
- [proposed] Add a stored-file picker to Mobile chat that reuses the library picker-scope hook.
- [proposed] Give the CLI the same locked-row notice that Web shows before sending.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerFilesMenu | `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx` | Files popover with debounced library search, attach, upload and Browse all. |
| hook | useLibraryFiles | `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx` | Debounces the query 200 ms, aborts stale requests, exposes items, loading, error. |
| component | ChatComposerNew (work bar and menu wiring) | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Shows the Files button only when AGI Work mode is active; passes handleFileDrop as onAttach. |
| component | ComposerFooter | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Model trigger, short list, search, locked rows, compatibility notice, model commit. |
| component | ModelCatalogue | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Full catalogue with search, developer rail, capability chips, retry. |
| hook | useModelCatalogue | `apps/web/features/chat/lib/use-model-catalogue.ts` | Fetches the model catalogue for the open picker. |
| service | modelLock | `apps/web/features/chat/lib/model-plan-admission.ts` | Decides tier, environment and coming-soon locks; null tier is selectable. |
| service | model-compatibility | `apps/web/features/chat/components/Composer/model-compatibility.ts` | Finds what a model cannot handle before a switch. |
| endpoint | GET /api/library | `apps/web/app/api/library/route.ts` | Lists library files with q, limit, sort; rate limited. |
| endpoint | GET /api/models/catalogue | `apps/web/app/api/models/catalogue/route.ts` | Returns catalogue entries for the caller's plan. |
| component | ModelPickerSheet | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | Mobile model sheet with search, lock handling, download prompt, effort. |
| component | ModelRow | `apps/mobile/src/features/model-picker/components/ModelRow.tsx` | Mobile row with locked, installed, effort display. |
| service | confirmModelDownload | `apps/mobile/src/features/model-picker/downloadConfirmation.ts` | Asks before downloading an on-device model. |
| store | useModelInstallStore | `apps/mobile/src/features/model-picker/installStore.ts` | Tracks installed and downloading on-device models. |
| component | model_picker overlay | `apps/cli/src/tui/widgets/model_picker.rs` | CLI model overlay: fuzzy filter, tier lock check, effort bar, Enter select. |
| command | agi-workforce.selectModel | `apps/extension-vscode/src/core/commandSetup.ts` | VS Code quick pick of models with lock offers. |
| service | buildGroupedQuickPickItems | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | Builds grouped rows and lock kinds (sign-in, upgrade, provider key). |
| service | filterManagedModelOptions | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | Chrome catalogue text and capability filter. |
| screen | Chrome side-panel model dropdown | `apps/extension/src/side_panel.ts` | Renders #sp-model-search and the capability select. |
| store | useModelStore | `apps/web/shared/stores/model-store.ts` | Holds the selected model id used by the composer (file path imported as @shared/stores/model-store; exact location not opened). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: person types in the model search; the short list filters the bundled model list in the browser. | device | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1260-1269 |
| Web: opening the picker loads the catalogue and provider availability from the server. | our servers | apps/web/features/chat/lib/use-model-catalogue.ts:84; ComposerFooter.tsx:923-929 |
| Web: choosing an allowed model saves it for the conversation through onModelChange and closes the menu; a failure shows a toast and keeps the old model. | device and our servers | ComposerFooter.tsx:1143-1165 |
| Web Files: after 200 ms of no typing the browser asks GET /api/library?q=...&limit=6&sort=...; an earlier unfinished request is aborted. | our servers | ComposerFilesMenu.tsx:82-90, :202-226; apps/web/app/api/library/route.ts:149-190 |
| Web Files: clicking a row downloads the file from its uri and wraps it as a File; the composer handles it like a dropped file. | our servers | ComposerFilesMenu.tsx:140-152; ChatComposerNew.tsx:7101 |
| Mobile: search filters the model list on the device; a locked model opens the plan or invite screen; a model not on the device asks for confirmation, downloads, then selects. | device | ModelPickerSheet.tsx:376-391, :473-545 |
| Mobile downloaded model file comes from the model's download URL. | outside service | apps/mobile/app/(public)/onboarding.tsx:369-376 shows the same download mechanism; the picker's own download call was not opened (prepareModel). |
| CLI: reads the cached subscription tier from disk (no network) and filters locally; Enter returns a Select action to the host. | device | apps/cli/src/tui/widgets/model_picker.rs:109-125, :769-800 |
| VS Code: resolves the tier, builds rows, shows a native quick pick; a locked pick triggers sign-in, upgrade or provider-key offers. | device and our servers | apps/extension-vscode/src/core/commandSetup.ts:1308-1345, :617-635 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Selected model id | Client model store; for a conversation it is saved through onModelChange (server side location not opened) | Conversation model is saved through the host callback; global store sync not established | unknown |
| Recent and favourite models | useChatModelStore and useModelFavourites on Web; Mobile useModelStore and useFavouritesSync | Mobile has a favourites sync hook (apps/mobile/src/features/model-picker/useFavouritesSync.ts); Web not opened | unknown |
| Typed query and attach error | Component state only | no | Cleared when the menu closes (ComposerFilesMenu.tsx:253-255; ComposerFooter.tsx:926-931) |
| Attached library file | Composer attachment list in the browser, then the message | Sent with the message | The library file itself is unchanged; retention is owned by the library feature, not covered here |

**Models and providers.** The picker lists models from the generated catalogue and does not name providers itself. Provider availability (degraded notices) is fetched when the picker opens (ComposerFooter.tsx:923-929). Whether a model is allowed depends on the plan through isModelAllowedForTier and getAllowedAutoModesForTier (apps/web/features/chat/lib/model-plan-admission.ts:21-30). Local models on Web/Desktop are chosen through a separate local selection path that says 'nothing leaves this Mac' (ComposerFooter.tsx:1274-1276). Own-key and managed routing is shown in CLI sections 'Your key' and 'Managed' (model_picker.rs:6-12).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web model picker opens for signed-out visitors too: a signed-out visitor is treated as Free (ComposerFooter.tsx:1038-1042). Files menu needs a signed-in account because /api/library resolves a user-scoped database (apps/web/app/api/library/route.ts:151). |
| Permissions | Files menu needs the canUseAgiWork capability and AGI Work mode (ChatComposerNew.tsx:1062-1067). /api/library only returns the caller's own files (route.ts:151, :166). |
| Subscription | Model locks come from the plan tier (modelLock, isModelAllowedForTier). The AGI Subscription decides eligible models; the picker shows a plan label and sends upgrade clicks to the host onUpgradeRequest. Mobile checks tier through useTierStore and the cloud waitlist (ModelPickerSheet.tsx:289-295). Chrome uses allowedAutoModes from managed access (managedModelPicker.ts:268-272). |
| Limits and metering | Library list is rate limited under the 'chat-conversation' bucket (route.ts:149). Attaching a file can be refused with a daily cap or burst limit, shown with the reset time (ComposerFilesMenu.tsx:117-138). Model rows may show a note that a model uses limits faster (ComposerFooter.tsx:692-694). |
| Feature flags | Free lane UI (useFreeLaneUiEnabled), free model promotion (useFreeModelPromotion) and free-quota models change what is locked (ComposerFooter.tsx:1049, :1203-1207). Mobile: NATIVE_PURCHASES_AVAILABLE decides whether a locked tap opens a plan screen (ModelPickerSheet.tsx:466). |
| Model compatibility | On switch, the Web picker checks the request against the target model and holds the switch behind a notice when something would be dropped (ComposerFooter.tsx:1180-1186). The mobile compatibility notice in the chat input is a separate feature. |
| Provider restrictions | VS Code: in own-key mode a model from a different provider than the route's key is locked with 'Add your <provider> key' (modelConstants.ts:182-205). CLI: Local and own-key rows are never tier locked (model_picker.rs:199-205). |
| Local mode | Local models are listed and selectable without a paid plan: CLI marks them never locked; Mobile lists on-device models with a download step; Web/Desktop local models use a local selection. Whether sign-in is needed to open the picker in Local mode on Mobile was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading (plan) | Web treats an unknown plan as unknown: no lock labels until billing policy is ready (ComposerFooter.tsx:1042; model-plan-admission.ts:25). | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1038-1043 |
| Loading (files) | Spinner and 'Loading files' while the list is empty. | ComposerFilesMenu.tsx:300-305 |
| Empty (files) | 'No files in your library yet.' or 'No library file matches that search.' | ComposerFilesMenu.tsx:313 |
| Error (files list) | 'The library could not be loaded.' An aborted request is ignored. | ComposerFilesMenu.tsx:213-221 |
| Error (attach) | Message stays in the menu; a 429 names the cap or wait time. | ComposerFilesMenu.tsx:117-138, :262-270 |
| Cancel | Closing clears query and error; the effect cleanup aborts the request. | ComposerFilesMenu.tsx:225, :253-256 |
| Catalogue failed | 'The model list could not be loaded.' with 'Try again'. | ModelCatalogue.tsx:36-38 |
| Model save failed | Toast; previous model stays active. | ComposerFooter.tsx:1157-1163 |
| Offline | not handled in the code beyond the error states above (no offline-specific branch found in files opened). | not handled in the code |
| Accessibility | Rows carry aria-labels naming lock and stage; search field labelled; Mobile search has role 'search' and an accessibilityValue; the picker keeps Tab inside the catalogue dialog. | ComposerFooter.tsx:678-700, :939-968; ModelPickerSheet.tsx:793-816 |
| App difference (locked) | Web and VS Code block a locked pick; Mobile opens plans or does nothing; CLI still selects it. | ComposerFooter.tsx:1297; ModelPickerSheet.tsx:466-485; model_picker.rs:199-205 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ComposerFilesMenu.test.tsx`: Library query string, file wrapping, 429 handling, glyphs, debounced search, attach, upload click, empty state, no fetch before open.
- `apps/web/features/chat/components/Composer/ComposerFooter.modelSwitch.test.tsx`: Model switch behaviour in the footer (file exists; cases not itemised here).
- `apps/web/features/chat/components/Composer/ComposerFooter.localModels.test.tsx`: Local model selection in the footer picker (not itemised).
- `apps/web/features/chat/components/Composer/ChatComposerNew.freeModelPromotionSearch.test.tsx`: Promoted free model with search (not itemised).
- `apps/web/features/chat/components/Composer/model-compatibility.test.ts`: Model compatibility findings.
- `apps/mobile/src/features/model-picker/__tests__/ModelPickerSearch.test.tsx`: Search matches, recent handling, 'nothing matches', query cleared on close and reopen.
- `apps/cli/src/tui/widgets/model_picker.rs`: Inline unit tests: rows keep ids for the filter, grouping by access mode, locked rows still listed, Local and own-key never locked.
- `apps/extension-vscode/src/__tests__/modelPickerTierGate.test.ts`: Unresolved tier reachable, locks for local/signed-out/Basic, unlock grouping, Auto gating.
- `apps/extension-vscode/src/__tests__/modelPickerReachability.test.ts`: Reachability of picker rows (not itemised).

**Test scenarios**

- **Plan still loading**
  1. Throttle the Web plan request.
  2. Open the model menu.
  - Expected: No row is labelled 'requires upgrade' until the plan resolves.
- **Locked model on Free**
  1. Sign in on a Free plan.
  2. Open the model menu and click a locked model.
  - Expected: Upgrade flow opens; the selected model does not change.
- **File search debounce and cancel**
  1. Enable AGI Work mode on a paid plan.
  2. Open Files and type quickly, then close the menu.
  - Expected: Only one /api/library call per pause; no call remains pending; reopening shows an empty query.
- **Attach failure**
  1. Block the file's /api/files request.
  2. Click a file row.
  - Expected: Error stays visible inside the menu; the file is not attached.
- **Mobile download choice**
  1. Open the sheet and tap an on-device model not downloaded.
  2. Confirm the prompt.
  - Expected: Model downloads then becomes the selected model; sheet closes.
- **CLI filter**
  1. Run /model and type part of a provider name.
  - Expected: Rows narrow immediately; Esc closes without a change.

**Where to look when it fails**

- Web: browser Network tab for /api/library (status, q, limit) and /api/models/catalogue.
- Web: toast text 'Could not save the model for this conversation.' points to onModelChange.
- API error shape 'library failed: <status>' thrown by fetchRecentLibraryFiles (ComposerFilesMenu.tsx:88).
- CLI: tier cache read in model_picker.rs rebuild_rows; stale cache shows cloud rows as locked.
- Mobile: tierGuard and installStore (apps/mobile/src/features/model-picker/).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/009-compound-interface-components.md](../../70-qa/test-plans/web/009-compound-interface-components.md)
- Desktop: [70-qa/test-plans/desktop/009-compound-interface-components.md](../../70-qa/test-plans/desktop/009-compound-interface-components.md)
- Mobile: [70-qa/test-plans/mobile/009-compound-interface-components.md](../../70-qa/test-plans/mobile/009-compound-interface-components.md)
- CLI: [70-qa/test-plans/cli/009-compound-interface-components.md](../../70-qa/test-plans/cli/009-compound-interface-components.md)
- VS Code: [70-qa/test-plans/vscode/009-compound-interface-components.md](../../70-qa/test-plans/vscode/009-compound-interface-components.md)
- Chrome: [70-qa/test-plans/chrome/009-compound-interface-components.md](../../70-qa/test-plans/chrome/009-compound-interface-components.md)

## 10. Gaps and dependencies

- **Stored-file picker exists only on Web/Desktop and only in AGI Work mode.** Affects: Free users and all users of Mobile, CLI, VS Code, Chrome. Evidence: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1062, :2768; brief S9.01 gives file-picker code only for Web. Work needed: Decide the intended scope, then add a library picker on the other surfaces or document it as Web only.
- **CLI lets a locked managed model be selected.** Affects: CLI users on a plan that cannot route the model. Evidence: apps/cli/src/tui/widgets/model_picker.rs:199-205. Work needed: Show a notice on selection and offer the upgrade path, like Web.
- **Mobile locked tap does nothing when native purchases are unavailable.** Affects: Mobile users on builds without purchases. Evidence: apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:466. Work needed: Show a plain message explaining the plan limit.
- **Web short-list search and catalogue search are two code paths.** Affects: Web and Desktop. Evidence: ComposerFooter.tsx:1260-1269; ModelCatalogue.tsx:381. Work needed: Confirm they agree or merge them.
- **Chrome and VS Code model search verified only by reading code; no Chrome test found for the filter.** Affects: Chrome. Evidence: apps/extension/src/features/cloud-bridge/managedModelPicker.ts:249. Work needed: Add a unit test for filterManagedModelOptions.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- SYS-local-inference
- SYS-execution-boundaries
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:own-key
- mode:cloud
- api:GET /api/library
- api:GET /api/models/catalogue

## Unknown

- Which database table backs the library listing (listLibraryAssets in apps/web/lib/server/media-assets was not opened).
- Where the Web selected model and favourites persist and whether they sync across devices.
- Whether Mobile Local mode needs sign-in to open the picker.
- Which file implements the Mobile prepareModel download and whether it uses an outside host.
- Whether the Mobile library picker-scope hook is a chat-box file picker.
- Test coverage detail of ComposerFooter.modelSwitch.test.tsx and ComposerFooter.localModels.test.tsx (names not listed).
