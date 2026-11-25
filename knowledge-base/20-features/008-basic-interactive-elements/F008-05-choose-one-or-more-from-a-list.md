---
id: "F008-05"
type: "feature"
title: "Choose one or more from a list"
aliases: ["Select", "Dropdown select", "Combobox", "Searchable list", "Model picker search", "Multiselect", "Chip input", "Token input", "Tag input", "useCombobox", "ChipInput"]
area: "8 Basic interactive elements"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S8.18", "S8.19", "S8.20", "S8.21"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "SYS-inference-providers", "mode:local", "mode:own-key", "mode:cloud", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F008-05 Choose one or more from a list

Ways to pick values from a list: single-select menus, search-as-you-type comboboxes, multiselect lists and removable chips. Web has all four (chips only in two policy screens); CLI and VS Code have pickers; mobile has a searchable model picker but no multiselect or chips found.

Area: [8. Basic interactive elements](README.md). Requirement items: [S8.18](../../10-requirements/capabilities/008-basic-interactive-elements.md#s818), [S8.19](../../10-requirements/capabilities/008-basic-interactive-elements.md#s819), [S8.20](../../10-requirements/capabilities/008-basic-interactive-elements.md#s820), [S8.21](../../10-requirements/capabilities/008-basic-interactive-elements.md#s821).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person choose one or many values. The shared useCombobox hook wires arrow keys, Enter, Escape and listbox ids for a search box with options (packages/ui/ui/src/primitives/useCombobox.ts:1-106). ChipInput turns typed entries into removable chips with limits and validation (packages/ui/ui/src/primitives/ChipInput.tsx:33-241).

**Why it exists.** Long lists (models, skills, apps) need search; sets of values (policy domains) need add and remove.

**Who uses it.** Everyone choosing models, skills, agents, apps or policy values.

**Problems it solves**

- Find an item in a long list by typing.
- Pick many items and see what is chosen.
- Add several values fast.

**Use cases**

- Search models in the picker (apps/web/features/chat/components/Composer/ModelCatalogue.tsx:340-360).
- Choose skills for an agent with a multi-selectable list (apps/web/features/agents/components/AgentSkillSelection.tsx:245-262).
- Add allowed values as chips in workspace policy (WorkspacePolicySection.tsx).
- Tick tools for a session in a VS Code multi-pick (capabilityManagement.ts:1145).

## 2. User experience

**Where to find it**

- Web: model catalogue in the composer model picker; agent skill selection; refuse-app picker (apps/web/features/desktop-host/components/RefuseAppPicker.tsx:71); workspace policy screens with chips; command palette (CommandPalette.tsx, brief S8.19).
- Desktop: web app in the public Desktop [inferred from doc: AGENTS.md section 5].
- Mobile: model picker sheet with search (ModelPickerSheet.tsx, brief S8.19).
- CLI: model picker with search text, effort picker, elicitation multi-select (model_picker.rs:108-125; elicitation_overlay.rs:60-66).
- VS Code: 'Select Model' quick pick and 'Tools for this session' multi-pick (commandSetup.ts:1321-1326; capabilityManagement.ts:1145).
- Chrome: menu popovers; combobox missing per brief.

**Before you start**

- Paid plan affects which model rows are selectable on web and mobile (see access).

**Screens and controls**

- Web chip input: text field plus chips, each with a remove button named 'Remove <value>' (ChipInput.tsx:174-190).
- Web skill list: search field, listbox 'Skills' with aria-multiselectable (AgentSkillSelection.tsx:245-248).
- CLI multi-select: Left/Right move, Space toggle (elicitation_overlay.rs:560).

**Journey**

1. 1. Open the list or focus the search field.
2. 2. Type to filter; Down/Up move, Home/End jump, Enter selects, Escape closes (useCombobox.ts; test at useCombobox.test.tsx).
3. 3. For chips: type a value, press Enter or comma (ChipInput.tsx:131-135), or paste several separated by space, comma or semicolon (ChipInput.tsx:11, :158-164).
4. 4. Remove a chip with its X, or Backspace/Delete on a focused chip (ChipInput.tsx:137-150).
5. 5. Errors show under the field.

**What the person sees and gets**

- Chip error text with role alert: 'This list holds at most {{count}} entries.' or '{{value}} was not added. {{reason}}' (ChipInput.tsx:76-87, :221-227).
- Rejected text stays in the input (ChipInput.tsx:105).

**Settings**

- Model favourites and recents on the web catalogue (ModelCatalogue.tsx:335-336).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Radix Select wrapper (Select.tsx:4).
- useCombobox with IME-safe keys (useCombobox.ts:50).
- Web multi-selectable skill list with a max of 200 (AgentSkillSelection.tsx:247; packages/contracts/cloud-contracts/src/agents.ts:24).
- ChipInput: commit on Enter, comma, paste containing separators, and blur; duplicates dropped silently; maxItems and validate supported (ChipInput.tsx:61-130, :158-168).
- CLI model picker filters by lowercased search and groups by access mode Local, BYOK, Cloud (model_picker.rs:108-125).
- CLI multi-select field kind (elicitation_overlay.rs:60-66).
- VS Code single pick with description match and a multi-pick (commandSetup.ts:1321-1326; capabilityManagement.ts:1145).

**Incomplete**

- ChipInput does not commit on a typed space or semicolon; those split only pasted, blurred or Enter-committed text (ChipInput.tsx:131-135, :158-164).
- Skill multiselect: no separate remove control found; items toggle in the list (grep of AgentSkillSelection.tsx).
- ChipInput used in two web screens only (WorkspacePolicySection.tsx, WorkspaceConnectorPolicy.tsx).

**Present but disconnected or switched off**

- None found.

**Not available**

- Mobile multiselect and chips: none found (brief missing).
- Chrome combobox, multiselect, chips: brief missing.
- VS Code chips: brief missing; VS Code multiselect exists as a quick pick although the brief says missing.

## 4. Required behaviour

**Established requirements**

- Single-select menu chooses one value from a list. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.18)
- Searchable combobox filters as typed with listbox semantics or keyboard navigation. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.19)
- Multiselect shows each selection and lets it be removed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.20)
- Token input turns typed entries into removable chips. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.21)
- Routing weighs capability and cost; routing metadata is central, never inlined at a call site. (source: (doc: AGENTS.md section 7))
- Nothing silently routes a Local chat to BYOK or managed cloud; moves are explicit with a visible provider label. (source: (doc: AGENTS.md section 6))

**Acceptance criteria**

1. Typing in a combobox narrows the list; Down and Enter pick the active item.
2. Escape closes the list.
3. Enter or comma in the chip input adds a chip; the chip's X removes it.
4. With maxItems set, adding past the limit shows the 'holds at most N entries' text.
5. An invalid chip value is rejected and stays in the field with a reason.
6. The model picker never offers a Cloud row as selectable when the plan does not allow it.
7. Multiselect shows selected items as checked and respects the maximum.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Chips should commit on a typed separator the way the draft says; code only does Enter and comma [inferred from ChipInput.tsx:131-135].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a chips area to the skill multiselect so each choice can be removed.
- [proposed] Build a mobile multiselect sheet reusing the model picker list.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useCombobox | `packages/ui/ui/src/primitives/useCombobox.ts` | Keyboard and ARIA wiring for searchable lists |
| component | Select | `packages/ui/ui/src/primitives/Select.tsx` | Single-select menu on Radix |
| component | ChipInput | `packages/ui/ui/src/primitives/ChipInput.tsx` | Chips with limit, validation, paste |
| component | ModelCatalogue | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Web model list with search query |
| component | ComposerFooter model picker | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Model rows gated by paid plan |
| component | AgentSkillSelection | `apps/web/features/agents/components/AgentSkillSelection.tsx` | Multiselect combobox list |
| component | RefuseAppPicker | `apps/web/features/desktop-host/components/RefuseAppPicker.tsx` | Combobox for apps |
| component | CommandPalette | `apps/web/shared/components/CommandPalette/CommandPalette.tsx` | Searchable command list (brief S8.19) |
| component | WorkspacePolicySection | `apps/web/features/settings/sections/WorkspacePolicySection.tsx` | Uses ChipInput |
| component | WorkspaceConnectorPolicy | `apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx` | Uses ChipInput |
| component | ModelPickerSheet | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | Mobile model picker with search and cloud gating |
| component | ModelPicker (CLI) | `apps/cli/src/tui/widgets/model_picker.rs` | CLI filtered model list grouped by access mode |
| component | ElicitationOverlay | `apps/cli/src/tui/widgets/elicitation_overlay.rs` | CLI enum and multi-enum fields |
| command | Select Model quick pick | `apps/extension-vscode/src/core/commandSetup.ts` | VS Code single pick |
| command | Session tools multi-pick | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | VS Code canPickMany |
| config | AGENT_SELECTION_MAX | `packages/contracts/cloud-contracts/src/agents.ts` | Limit 200 for selections |
| test | useCombobox test | `packages/ui/ui/src/primitives/__tests__/useCombobox.test.tsx` | Keys and ARIA |
| test | ChipInput IME test | `packages/ui/ui/src/primitives/__tests__/ChipInput.imeComposition.test.tsx` | IME Enter keeps draft |
| test | AgentSkillSelection test | `apps/web/features/agents/__tests__/AgentSkillSelection.test.tsx` | Multiselect, empty, error states |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Typing filters the list in memory on the device. | device | model_picker.rs:108-112; AgentSkillSelection.tsx:79-90 |
| Picking a model sets the conversation model; row availability depends on plan and sign-in. | device | ComposerFooter.tsx:1651-1700 (paidPlan gating); ModelPickerSheet.tsx deps list (subscriptionTier, cloudUnlocked) |
| The CLI reads the cached user tier without network to mark Cloud rows. | device | model_picker.rs:114-122 |
| Skill and agent lists may load from our servers (loading and error states exist). | our servers | AgentSkillSelection.tsx:73-78 (list.loading, list.error) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chip values | owner component state until the caller saves; save path not traced | unknown | unknown |
| Favourite and recent models | unknown | unknown | unknown |

**Models and providers.** The model pickers choose among catalogue models by access mode Local, BYOK and Cloud (model_picker.rs:118-125). Model identifiers come from the catalogue (SYS-model-catalog-and-routing), not from this control.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI picker falls back to Free when the tier is unknown and marks Cloud rows for signed-out users (model_picker.rs:114-122). |
| Permissions | Skill multiselect marks items unavailable once the maximum is reached (AgentSkillSelection.tsx:251-253). |
| Subscription | Web and mobile model rows depend on plan: paidPlan gating in ComposerFooter.tsx:1651-1700; mobile sheet uses subscriptionTier and cloudUnlocked (ModelPickerSheet.tsx deps). Details of each plan not traced. |
| Limits and metering | Chip maxItems per use; skills max 200 (agents.ts:24). |
| Feature flags | none found in the code read. |
| Model compatibility | Effort choices depend on the model supporting adaptive reasoning (ComposerFooter.tsx:1320). |
| Provider restrictions | Rows grouped by provider and access mode in the CLI (model_picker.rs:118-125). |
| Local mode | Local models appear in their own group in the CLI picker (model_picker.rs:118-125); whether Local rows need sign-in on each app is not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Skill list shows loading; combobox is closed until ready | AgentSkillSelection.tsx:73-78 |
| Error | Recoverable catalog error that keeps the saved selection | AgentSkillSelection.test.tsx it 'exposes a recoverable catalog error...' |
| Empty / no match | Explicit empty and no-match states | AgentSkillSelection.test.tsx it 'keeps empty and no-match states explicit' |
| Limit reached (chip) | Input disabled, message shown | ChipInput.tsx:60, :201, :226-229 |
| IME composing | Enter does not commit during composition | ChipInput.tsx:131; useCombobox.ts:50 |
| Duplicate chip | Dropped without a message | ChipInput.tsx:68 |
| Offline/timeout | not handled in the primitives | not handled in the code (looked in useCombobox.ts and ChipInput.tsx) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/primitives/__tests__/useCombobox.test.tsx`: Combobox wiring, arrows/Home/End clamped, Enter, IME, Escape
- `packages/ui/ui/src/primitives/__tests__/ChipInput.imeComposition.test.tsx`: Enter that confirms an IME candidate keeps the draft
- `apps/web/features/agents/__tests__/AgentSkillSelection.test.tsx`: Radio keyboard nav, inherited null vs empty, multi-select with arrows and Enter, unavailable saved IDs, catalog error, empty states
- `apps/web/features/models/__tests__/ModelCatalogueBrowser.filters.test.tsx`: Model catalogue browser filters (contents not opened)
- `apps/web/shared/components/CommandPalette/CommandPalette.test.tsx`: Command palette (contents not opened)
- `apps/mobile/__tests__/ModelPicker.test.tsx`: Mobile model picker (contents not opened)
- `apps/cli/src/tui/widgets/model_picker.rs`: In-file test module at line 835

**Test scenarios**

- **Combobox keys**
  1. Open the web skill list.
  2. Type a few letters, press Down twice, Enter, then Escape.
  - Expected: List narrows, item toggles, search clears.
- **Chip add and remove**
  1. Open workspace policy on web.
  2. Type 'a.com' and Enter; type 'b.com,'; click X on the first chip.
  - Expected: Two chips added, first removed.
- **Chip limit**
  1. Fill a chip field up to its maximum.
  2. Try one more.
  - Expected: Input is disabled and says the list holds at most N entries.
- **Model picker gating**
  1. Open the model picker on a free account in web and mobile.
  2. Try a Cloud-only row.
  - Expected: Row is marked or leads to upgrade; not silently selected.
- **VS Code multi-pick**
  1. Run the session tools command.
  2. Untick a tool and confirm.
  - Expected: Unticked tools become disallowed from the next message.

**Where to look when it fails**

- CLI: model picker snapshot tests.
- Web: aria-activedescendant in the accessibility tree.
- Not found: log names for picker failures.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/008-basic-interactive-elements.md](../../70-qa/test-plans/web/008-basic-interactive-elements.md)
- Desktop: [70-qa/test-plans/desktop/008-basic-interactive-elements.md](../../70-qa/test-plans/desktop/008-basic-interactive-elements.md)
- Mobile: [70-qa/test-plans/mobile/008-basic-interactive-elements.md](../../70-qa/test-plans/mobile/008-basic-interactive-elements.md)
- CLI: [70-qa/test-plans/cli/008-basic-interactive-elements.md](../../70-qa/test-plans/cli/008-basic-interactive-elements.md)
- VS Code: [70-qa/test-plans/vscode/008-basic-interactive-elements.md](../../70-qa/test-plans/vscode/008-basic-interactive-elements.md)
- Chrome: [70-qa/test-plans/chrome/008-basic-interactive-elements.md](../../70-qa/test-plans/chrome/008-basic-interactive-elements.md)

## 10. Gaps and dependencies

- **No mobile multiselect or chip input** Affects: Mobile. Evidence: Brief S8.20, S8.21 missing. Work needed: Build when a mobile screen needs them.
- **Chip input commit keys differ from the draft** Affects: Web, desktop. Evidence: ChipInput.tsx:131-135. Work needed: Decide whether typed space or semicolon should commit.
- **Brief cites CodeChangesPanel for multiselect, which shows static chips** Affects: Documentation. Evidence: CodeChangesPanel.tsx:205-225. Work needed: Point the brief to AgentSkillSelection.
- **VS Code multiselect exists though brief says missing** Affects: VS Code. Evidence: capabilityManagement.ts:1145. Work needed: Update brief.
- **Skill multiselect has no remove control** Affects: Web. Evidence: No remove in AgentSkillSelection.tsx. Work needed: Add removable selected list.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- SYS-inference-providers
- mode:local
- mode:own-key
- mode:cloud
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome

## Unknown

- Plan rules for each model row.
- Where chip values and favourites are saved.
- Mobile model picker search line and keyboard behaviour (not opened).
- Desktop-specific variants beyond the web app.
- How Chrome selects models (menu popovers only seen as role names).
