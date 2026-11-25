---
id: "F015-02"
type: "feature"
title: "Browse and search the model list"
aliases: ["Browse and search the model list", "Provider label, Model-family grouping, Searchable model list, Model description (brief S15.02, S15.03, S15.04, S15.11)", "Short list and All models catalogue (Web, Desktop)", "ModelPickerSheet (Mobile)", "Models overlay opened by /model (CLI)", "Select Model quick pick and model popover (VS Code)", "All models dropdown (Chrome)"]
area: "15 Model-selector interface"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S15.02", "S15.03", "S15.04", "S15.11"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-api-and-contracts", "SYS-subscriptions-entitlements-and-usage", "SYS-local-inference", "SYS-shared-ui-and-design", "F015-01", "F015-03", "F015-05", "api:GET /api/models/catalogue"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F015-02 Browse and search the model list

Opens a list of models from the model label. Each row shows who makes the model and, on most apps, a short purpose line. Models of one line sit together. A search field narrows the list. Web and Desktop show a short list first and a full catalogue behind 'All models'.

Area: [15. Model-selector interface](README.md). Requirement items: [S15.02](../../10-requirements/capabilities/015-model-selector-interface.md#s1502), [S15.03](../../10-requirements/capabilities/015-model-selector-interface.md#s1503), [S15.04](../../10-requirements/capabilities/015-model-selector-interface.md#s1504), [S15.11](../../10-requirements/capabilities/015-model-selector-interface.md#s1511).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 4) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built (this page lists unfinished parts) | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person open the model list, see the provider mark or name beside each model, read a short purpose phrase where the app has one, and type to narrow the list.

**Why it exists.** A catalogue with many models and providers is unusable without grouping, labels and search. The founder wants provider logos on rows (doc: docs/decisions/2026-11-12-founder-decisions.md, D-2026-11-12-06) and fewer descriptions on Mobile (D-2026-11-12-05).

**Who uses it.** Anyone choosing a model, on every app.

**Problems it solves**

- Finding one model among many.
- Telling providers apart.
- Seeing which versions belong to one line.
- Seeing at a glance what a model is for.

**Use cases**

- Web user types a letter with the short list open and lands in the catalogue filtered on it.
- Mobile user opens the sheet and types a provider name.
- CLI user presses / to refocus search, types, then moves with Up and Down.
- Chrome user opens All models, searches, and filters by a capability.

## 2. User experience

**Where to find it**

- Web and Desktop: click the model trigger in the composer footer. The short list opens; the row 'All models' (with a count) opens the catalogue (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1731-1750).
- Mobile: tap the model button above the input; a bottom sheet opens with the search field 'Search models…' (apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:791-819).
- CLI: run /model (or /m); the overlay titled 'Models' opens (apps/cli/src/tui/tui_app.rs:5553-5560; apps/cli/src/tui/widgets/model_picker.rs:369-380).
- VS Code: command 'Code: Select Model' opens a quick pick titled '<product>, Select Model' (apps/extension-vscode/package.json:187-190; apps/extension-vscode/src/core/commandSetup.ts:1321-1326); the sidebar pill opens a model popover (webviewContent.ts:3288).
- Chrome: the model selector button in the side panel, then 'All models' (apps/extension/src/side_panel.ts:11238-11263).

**Before you start**

- None to open the list. Chrome lists more than Auto only for a signed-in managed account (apps/extension/src/side_panel.ts:11234-11236).
- Web Free plan: type-ahead into the catalogue is off (ComposerFooter.tsx:971-973).
- CLI Cloud rows are listed for everyone but marked when the plan cannot use them (apps/cli/src/tui/widgets/model_picker.rs:196-214).

**Screens and controls**

- Web and Desktop short list: section labels 'Recommended' and 'Favourites', 'On this device' (local), 'All models' row (ComposerFooter.tsx:1693-1750).
- Web and Desktop catalogue: back button 'Back to the short list'; search field 'Search models'; left rail of developers with counts, plus 'Favourites' and 'Recent' rails; capability chips Vision, Reasoning, Tools, Search, Code execution and further image, video and audio chips; an 'Open weight' chip; a star control and an 'About <model>' button per row (apps/web/features/chat/components/Composer/ModelCatalogue.tsx:21-45, 585-608, 625-710).
- Web and Desktop rows show a provider logo, the name, and the developer label under it (ModelCatalogue.tsx:507-518). Short-list rows show a one-line purpose phrase from the shared guidance map: 'For your hardest problems', 'For the most demanding work', 'For everyday work', 'For quick answers' (packages/ai/routing/src/model-picker.ts:55-60, 162-164).
- Mobile: search field with a clear control, a filter chip row for cloud models, sections Recent, Favorites, On device, then lines of cloud models with a 'More <line> models' disclosure (ModelPickerSheet.tsx:893-966).
- CLI: a search line starting with '/ ' and the placeholder 'type to filter by name or provider...', a list grouped by access mode and provider, and one detail line for the highlighted model (model_picker.rs:470-498, 424-468).
- VS Code quick pick: separator rows for each provider, rows with a provider icon, a description of capability, thinking and speed, and a detail line of the id and context and output limits (modelConstants.ts:284-303, 317-320).
- Chrome: heading 'Recommended' (localised), 'All models (<n>)' button, a search input, a capability select, and rows grouped under provider headings (side_panel.ts:11228-11300, 11349-11373).

**Journey**

1. Open the picker from the label.
2. Read the sections: Auto and routing profiles first (F015-04), then the current model, Recommended and Favourites on paid Web plans.
3. To search on Web, click 'All models' or just type a letter: the catalogue opens with the typed text in 'Search models'.
4. Move with arrow keys (Web, CLI), swipe or scroll (Mobile).
5. Open 'About <model>' on Web for a card with facts and capabilities.
6. Choose a row (F015-05) or close with Escape, swipe down (Mobile) or the back control.

**What the person sees and gets**

- Web short list while the plan is loading: 'Loading your plan's models…'; if it fails: 'Could not load your plan's models. Try again' (ComposerFooter.tsx:173-174).
- Web catalogue: 'Loading models…', 'The model list could not be loaded.' with 'Try again', and 'No models match' for an empty result (ModelCatalogue.tsx:32-35, 713-736).
- Web short-list search branch also shows 'No models match' (ComposerFooter.tsx:1601-1612).
- Mobile: 'Loading models…', 'No models matching “<text>”', 'No models match these filters.', 'No models are available right now.' (ModelPickerSheet.tsx:879-884, 989, 1010-1012).
- Chrome: 'no match' note from the localised key spModelsNoMatch (side_panel.ts:11343-11345).
- CLI: no message; see gaps.

**Settings**

- Web and Desktop: favourites and recents shape the lists (F015-03).
- CLI: none for the list; Local, Your key and Managed sections are always the order (model_picker.rs:126).
- Mobile: filter chips only on non-local scope (ModelPickerSheet.tsx:327).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop: short list built by buildModelPickerShortList; catalogue built from the server projection with rails, chips, search and an About card (packages/ai/routing/src/model-picker.ts:272-372; apps/web/features/chat/components/Composer/ModelCatalogue.tsx:349-745).
- Web catalogue search matches model name, developer label and family, not the description (ModelCatalogue.tsx:387-389). The short-list search branch matches name, provider and description (ComposerFooter.tsx:1260-1270).
- Web catalogue groups versions of one model line together under a derived line label, newest first (ModelCatalogue.tsx:80-106; packages/ai/routing/src/model-picker.ts:232-245).
- Mobile search matches name, provider, provider label, runtime label and id (ModelPickerSheet.tsx:381-391); lines grouped with groupByModelLine (ModelPickerSheet.tsx:422-428); sheet closes by pan down (line 699).
- CLI search is a fuzzy match on id, provider label and display name, and starts focused; '/' refocuses it; Up and Down leave search to walk the list; models are grouped by family inside each provider (model_picker.rs:99, 153-155, 163-177, 707, 743-757).
- CLI detail line shows 'Best for ...', a status word for preview, beta or experimental, and a deprecation date (model_picker.rs:438-468).
- VS Code quick pick filters on label, description and detail (commandSetup.ts:1324-1325); rows grouped by provider (modelConstants.ts:253-321).
- Chrome search, capability filter and provider grouping exist in code and in tests (apps/extension/src/side_panel.ts:11265-11300, 11342-11373; apps/extension/__tests__/managed-model-picker.test.ts by title).

**Incomplete**

- The area brief marks Chrome search as missing, but the code has a search field and a test; the brief is out of date (side_panel.ts:11265-11280).
- Mobile shows no description line on rows by founder decision, so the brief item S15.11 is not applicable there (doc: docs/decisions/2026-11-12-founder-decisions.md, D-2026-11-12-05).
- VS Code sidebar popover has no search field in the code read; only the quick pick filters (webviewContent.ts:3288; ChatStateManager.ts:1997-2030).
- CLI rows show a capability label and context size, not the purpose phrase; the purpose is in the detail line only for the highlighted row (model_picker.rs:547-593, 424-468).

**Present but disconnected or switched off**

- CLI environment gate always hides models that require an environment (environment_available returns false) (apps/cli/src/tui/widgets/model_picker.rs:41-44, 145-148).
- Web hides type-ahead for Free plans (ComposerFooter.tsx:971-973).

**Not available**

- Description lines on Mobile rows (by decision).
- Search in the VS Code sidebar popover (not found).

## 4. Required behaviour

**Established requirements**

- Each model in the selector shows which provider or developer makes it. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.02)
- Models are grouped by family so related models sit side by side. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.03)
- The user can type to filter the list by name. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.04)
- Each model has a short description of what it is good for. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.11)
- A model row shows the provider logo; Mobile rows carry a name only and one row per provider with a control to open more. (source: doc: docs/decisions/2026-11-12-founder-decisions.md (D-2026-11-12-05, D-2026-11-12-06))
- The selector reads generated catalogue output, shows only effective options and gives a disabled reason; no surface owns a model list. (source: doc: docs/product/experience-contract.md section 7.3)
- The Mobile selector reads catalogue or route metadata with no invented ids, and gated routes are labelled. (source: doc: docs/product/requirements.md section 10.8 (M-MODEL-001, M-MODEL-003))

**Acceptance criteria**

1. On Web, open the picker, type one letter: the catalogue opens with that text in the search field and only matching rows.
2. On Web, a query with no match shows 'No models match'.
3. On Mobile, a query with no match shows 'No models matching “<query>”' and clearing it restores the Recent section.
4. On the CLI, typing 'xyz' that matches nothing leaves the picker still operable and tells the person nothing matched (currently fails, see gaps).
5. On Web the catalogue groups versions of one line under one heading and lists the newest first.
6. Every row on Web, Mobile and Chrome shows a provider mark or the provider name.
7. On VS Code, typing in the quick pick filters by name, capability words and id.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Search should behave the same on all apps: name, provider and family, with an empty-state message [inferred from S15.04 and D-2026-11-12-05].
- The CLI should show an empty-state line, since the overlay is hidden when no rows remain [inferred from model_picker.rs:348].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a search field to the VS Code sidebar popover.
- [proposed] Show a 'No models match' line in the CLI overlay.
- [proposed] Make the Web catalogue search also match the purpose phrase, as the short-list search does.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerFooter picker | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Short list, type-ahead (971-992), search branch (1260-1270, 1601-1612), All models row (1731-1750). |
| component | ModelCatalogue | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Full catalogue with rails, chips, search, line grouping, About card. |
| service | buildModelPickerShortList and guidance | `packages/ai/routing/src/model-picker.ts` | Short list, guidance phrases, model line labels, plan lock labels. |
| hook | useModelCatalogue | `apps/web/features/chat/lib/use-model-catalogue.ts` | Fetches /api/models/catalogue and groups developers; retry (lines 70-109). |
| endpoint | GET /api/models/catalogue | `apps/web/app/api/models/catalogue/route.ts` | Returns the plan-aware model projection with rate limit and private cache (lines 80-103). |
| service | buildCatalogueEntries | `apps/web/lib/server/model-catalogue.ts` | Decides admitted, temporarilyUnavailable, minimumPlanLabel and deprecatedOn per model (lines 240-284). |
| component | ModelPickerSheet | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | Mobile bottom sheet with search, sections and lines. |
| component | ModelRow (Mobile) | `apps/mobile/src/features/model-picker/components/ModelRow.tsx` | Row with provider mark, state text and long-press favourite. |
| service | modelLines | `apps/mobile/src/features/model-picker/modelLines.ts` | Groups cloud models by model line for Mobile. |
| component | CLI model picker widget | `apps/cli/src/tui/widgets/model_picker.rs` | State, rows, fuzzy search, family grouping, key handling and rendering. |
| service | available_picker_models | `apps/cli/src/tui/tui_app.rs` | Joins catalogue, OpenRouter cache, gateway models and discovered local models (lines 3367-3378). |
| service | buildGroupedQuickPickItems | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | Builds the VS Code quick pick rows (lines 209-332). |
| command | agi-workforce.selectModel | `apps/extension-vscode/src/core/commandSetup.ts` | Opens the quick pick with filtering on description and detail (lines 1302-1326). |
| service | managedModelPicker | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | Chrome option list, menu and search filter (lines 199-266). |
| component | Chrome renderModelDropdown | `apps/extension/src/side_panel.ts` | Chrome dropdown, search input, capability select, provider headings (lines 11215-11375). |
| test | ModelPickerSearch test | `apps/mobile/src/features/model-picker/__tests__/ModelPickerSearch.test.tsx` | Mobile search, recent merge and reset on close. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web opens the picker; useModelCatalogue calls GET /api/models/catalogue once when opened. | device and our servers | apps/web/features/chat/lib/use-model-catalogue.ts:70-109 |
| The server reads the viewer plan, applies the person's provider training opt-out, builds the model projection and returns it with a short private cache. | our servers | apps/web/app/api/models/catalogue/route.ts:80-103 |
| The browser filters, groups by line and renders rows; search is local string matching. | device | apps/web/features/chat/components/Composer/ModelCatalogue.tsx:379-424 |
| Mobile builds the list from bundled local model data and, in Cloud mode with Free quota, from a Free catalogue store refreshed when the sheet opens. | device and our servers | ModelPickerSheet.tsx:288-293, 368-374 |
| CLI rebuilds rows on each keystroke from the in-process catalogue, the OpenRouter cache, gateway models and discovered local servers. | device | apps/cli/src/tui/tui_app.rs:3367-3378; apps/cli/src/tui/widgets/model_picker.rs:109-194 |
| The CLI refreshes the OpenRouter model cache when stale before listing. | outside service | apps/cli/src/tui/tui_app.rs:3369 (refresh_cache_if_stale) |
| VS Code reads the tier, the active route and host model list, then shows the quick pick. | device | apps/extension-vscode/src/core/commandSetup.ts:1305-1326 |
| Chrome builds the menu from the managed account's admitted model list held in memory. | device | apps/extension/src/side_panel.ts:11217-11223 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Catalogue projection (list of models with admitted, unavailable, deprecation fields) | In memory in the browser for the open picker; server response cached privately for 15 seconds | Fetched from our servers | Dropped when the page closes |
| Search text | Component state only | No | Cleared when the picker closes (ComposerFooter.tsx:932-936; ModelPickerSheet.tsx:580-584) |

**Models and providers.** Rows come from the shared model catalogue and registry. CLI Local rows come from discovered local servers and BYOK rows include the OpenRouter list (apps/cli/src/tui/tui_app.rs:3367-3378). No model is called while browsing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Browsing needs no account. The catalogue endpoint serves signed-out visitors an anonymous plan view (apps/web/app/api/models/catalogue/route.ts: resolveViewer falls back to an anonymous tier). |
| Permissions | Training opt-out hides models whose provider keeps inputs for training, except Auto (route.ts:80-90). |
| Subscription | Rows the plan cannot use are shown with the plan that unlocks them (see F015-05 for selection). Web Recommended, Favourites and Auto rows appear for paid plans only (ComposerFooter.tsx:1635, 1693, 1705). |
| Limits and metering | The catalogue endpoint is rate limited under the name model-catalog (route.ts:80-84 region). The per-row price band and credit estimates come from shared helpers (ModelCatalogue.tsx:14-17). |
| Feature flags | CLI environment gate hides environment-bound models (model_picker.rs:41-44). Web promotion and event flags add a free tag (ModelCatalogue.tsx:555-563). |
| Model compatibility | Rows tagged Coming soon, Beta (environment), Temporarily unavailable or Not available in this app are disabled (ModelCatalogue.tsx:449-458). |
| Provider restrictions | Developer jurisdiction filter can drop models from the picker list (packages/ai/routing/src/model-picker.ts:126-134). |
| Local mode | Web and Desktop: the 'On this device' section is drawn only when the plan is not Free and a local server is reachable (ComposerFooter.tsx:1721, 1766) [inferred conflict with the requirement that local inference needs no paid plan]. Mobile local scope lists on-device models and no filter chips (ModelPickerSheet.tsx:327, 344-347). CLI Local rows come first and are never locked (model_picker.rs:196-214). VS Code lists host local models (commandSetup.ts:1311). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading (Web catalogue) | 'Loading models…' while entries are empty and status is not ready. | ModelCatalogue.tsx:729-732 |
| Error and retry (Web catalogue) | 'The model list could not be loaded.' with a Try again button; retry refetches until a load succeeds. | ModelCatalogue.tsx:713-728; use-model-catalogue.ts:75-78 |
| Plan not loaded (Web short list) | Shows a loading row, or a retry row when the plan request failed. | ComposerFooter.tsx:173-174, 482-491, 1721 region |
| Empty search | Web and Mobile and Chrome show a message. CLI hides the whole overlay because render returns when rows are empty; typing Backspace brings it back. | ModelCatalogue.tsx:733-736; ModelPickerSheet.tsx:1010-1012; side_panel.ts:11343-11345; model_picker.rs:348, 816-824 |
| Keyboard | Web: arrow keys through useMenuKeyboard, Tab cycles inside the catalogue, Escape closes the catalogue first. CLI: Up, Down, Tab (next provider), Esc. | ComposerFooter.tsx:995-1002; apps/web/features/chat/components/Composer/__tests__/ComposerFooter.keyboard-contract.test.tsx (by title); model_picker.rs:701-757 |
| Offline | Web catalogue shows the load-failed state; Mobile and CLI use stored data. Behaviour of Chrome offline not handled in the code read. | ModelCatalogue.tsx:713-728 |
| Small screens (Web) | The picker becomes a drawer sheet when pickerLayout is mobile. | ComposerFooter.tsx (Drawer branch near lines 1790-1830) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.picker-parity.test.tsx`: Row layout, new badge dates, plan label, All models opening, typed query opening the catalogue, one guidance phrase per profile.
- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.keyboard-contract.test.tsx`: Arrow keys, Tab, Escape and focus return in the short list and catalogue.
- `apps/web/features/chat/components/Composer/__tests__/ModelCatalogue.dead-control.test.tsx`: Rows that cannot be held are refused with a reason; chips are toggles with a group label.
- `apps/web/features/chat/components/Composer/__tests__/ModelCatalogue.rail-count.test.tsx`: Developer rail counts include locked rows.
- `apps/web/features/chat/lib/__tests__/useModelCatalogue.test.tsx`: The catalogue hook (name only; contents not read).
- `packages/ai/routing/src/__tests__/model-picker.test.ts`: Line labels and the short list: Auto first, recommended rows, no duplicates.
- `apps/mobile/src/features/model-picker/__tests__/ModelPickerSearch.test.tsx`: Mobile search, recents merge, empty message and reset on close.
- `apps/extension/__tests__/managed-model-picker.test.ts`: Chrome Auto-only before admission, search and capability filter.
- `apps/extension-vscode/src/__tests__/modelPickerTierGate.test.ts`: Quick pick tier gating.
- `apps/cli/src/tui/widgets/model_picker.rs`: In-file tests for grouping by access mode, empty sections skipped, row format and tier marking.

**Test scenarios**

- **Type-ahead search (Web)**
  1. Open the picker on a paid plan.
  2. Press a letter key without clicking the search field.
  3. Type a second letter.
  - Expected: Catalogue opens with both letters once in 'Search models'; rows narrow.
- **Empty result (Web, Mobile, Chrome, CLI)**
  1. Open the picker.
  2. Type a string that matches nothing.
  - Expected: Web, Mobile and Chrome show a no-match message. The CLI result is the thing to record.
- **Catalogue error retry (Web)**
  1. Block /api/models/catalogue in dev tools.
  2. Open All models.
  3. Unblock and press Try again.
  - Expected: Error text first, list after retry.
- **Family grouping**
  1. Open the catalogue and pick a developer with several versions.
  - Expected: Versions of one line are adjacent with newest first.
- **CLI search**
  1. Run /model.
  2. Type part of a provider name.
  3. Press Down, then '/' and edit the text.
  - Expected: Rows filter by fuzzy match, focus moves to list then back to search.

**Where to look when it fails**

- Server log lines 'Model catalogue projection served' with modelCount and planTier, and 'Failed to serve the model catalogue projection' (apps/web/app/api/models/catalogue/route.ts:80-103).
- API error body code INTERNAL_ERROR with message 'Failed to load the model catalogue'.
- Browser network tab for GET /api/models/catalogue.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/015-model-selector-interface.md](../../70-qa/test-plans/web/015-model-selector-interface.md)
- Desktop: [70-qa/test-plans/desktop/015-model-selector-interface.md](../../70-qa/test-plans/desktop/015-model-selector-interface.md)
- Mobile: [70-qa/test-plans/mobile/015-model-selector-interface.md](../../70-qa/test-plans/mobile/015-model-selector-interface.md)
- CLI: [70-qa/test-plans/cli/015-model-selector-interface.md](../../70-qa/test-plans/cli/015-model-selector-interface.md)
- VS Code: [70-qa/test-plans/vscode/015-model-selector-interface.md](../../70-qa/test-plans/vscode/015-model-selector-interface.md)
- Chrome: [70-qa/test-plans/chrome/015-model-selector-interface.md](../../70-qa/test-plans/chrome/015-model-selector-interface.md)

## 10. Gaps and dependencies

- **The CLI overlay disappears when a search matches nothing and shows no message.** Affects: CLI. Evidence: apps/cli/src/tui/widgets/model_picker.rs:348. Work needed: Render the search bar and a no-match line when rows are empty.
- **The brief says Chrome search is missing, but it exists.** Affects: Documentation and Chrome. Evidence: apps/extension/src/side_panel.ts:11265-11280. Work needed: Update the brief; add a Chrome search entry to the surface matrix.
- **VS Code sidebar popover has no search; only the quick pick filters.** Affects: VS Code. Evidence: webviewContent.ts:3288; ChatStateManager.ts:1997-2030. Work needed: Add a search field or document that the quick pick is the searchable path.
- **Web catalogue search does not match the purpose phrase, while the short-list search does.** Affects: Web and Desktop. Evidence: ModelCatalogue.tsx:387-389 versus ComposerFooter.tsx:1260-1270. Work needed: Pick one matching rule and share it.
- **Web and Desktop hide the on-device section on the Free plan, against the rule that local inference needs no paid plan.** Affects: Free Desktop and Web users with local models. Evidence: ComposerFooter.tsx:1721, 1766 [inferred conflict]. Work needed: Decide if local models must be listed on Free and remove the plan gate.
- **CLI rows have no per-row purpose phrase; Mobile has none by decision.** Affects: CLI and Mobile. Evidence: model_picker.rs:547-593; D-2026-11-12-05. Work needed: Record the brief item S15.11 as not applicable on Mobile; decide for CLI.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-api-and-contracts
- SYS-subscriptions-entitlements-and-usage
- SYS-local-inference
- SYS-shared-ui-and-design
- F015-01
- F015-03
- F015-05
- api:GET /api/models/catalogue

## Unknown

- Whether the Free-plan Web user can open the All models catalogue (the row is not plan-gated in the code read, but an effect closes the catalogue when the plan becomes Free).
- Exact labels of the image, video and audio capability chips on Web.
- Whether Chrome and VS Code show family grouping (Chrome keeps families together in the 'more' list only: managedModelPicker.ts:113-124).
- How the Tauri Desktop picker behaves.
