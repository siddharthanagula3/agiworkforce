---
id: "F078-03"
type: "feature"
title: "Hidden and disabled controls"
aliases: ["Disabled but discoverable controls", "Locked model rows", "Hidden irrelevant controls", "Plan lock labels"]
area: "78 UI gating and adaptation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S78.17", "S78.18"]
depends_on: ["F078-01", "F078-05", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "api:GET /api/llm/v1/models"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F078-03 Hidden and disabled controls

A control that can never apply here is left out. A control that applies but is blocked by plan, sign-in, key, environment or release state stays visible, disabled or locked, with a reason. Examples are locked model rows on web, mobile, CLI and VS Code.

Area: [78. UI gating and adaptation components](README.md). Requirement items: [S78.17](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7817), [S78.18](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7818).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Separates hidden controls (cannot apply) from locked or disabled controls (applies, but blocked) and shows the reason for the second kind.

**Why it exists.** People discover what a plan would unlock, and nobody clicks a button that fails without a word.

**Who uses it.** Every person who opens a model picker or composer; support staff explaining a locked item.

**Problems it solves**

- A blocked model disappears and the person never learns it exists.
- A blocked button fails silently.
- A control that does nothing here clutters the screen.

**Use cases**

- Free-plan web user sees a locked model row with an Upgrade link.
- Mobile user signed out sees cloud models locked with 'Sign in to use AGI Cloud chat.'
- CLI user lists models and sees 'Locked on your <plan> plan' with the plan needed.
- VS Code user sees locked groups headed 'Upgrade your AGI plan'.

## 2. User experience

**Where to find it**

- Web and Desktop: model menu rows (apps/web/features/chat/components/Composer/ComposerFooter.tsx:633-810) and the full catalogue with tags 'Coming soon', 'Beta', 'Temporarily unavailable' (apps/web/features/chat/components/Composer/ModelCatalogue.tsx:36-41).
- Mobile: model rows in the model picker sheet (apps/mobile/src/features/model-picker/components/ModelRow.tsx:49-170).
- CLI: 'agi models' listing with sections 'Locked on your ... plan', 'Temporarily unavailable' (apps/cli/src/provider.rs:268-306).
- VS Code: model quick pick with locked group headings (apps/extension-vscode/src/features/model-picker/modelConstants.ts:140-148, 324-330).
- Chrome: premium models carry a plan lock label in the side panel picker (apps/extension/src/features/cloud-bridge/managedModelPicker.ts:141-143).

**Before you start**

- Model list loaded; plan known for plan labels.

**Screens and controls**

- Web row label '<Plan> and above' (ComposerFooter.tsx:214, 654) and an 'Upgrade' text when no label (ComposerFooter.tsx:805).
- Hard-disabled rows for environment or coming-soon models with title text (ComposerFooter.tsx:724, 740, 784-794).
- Mobile row opacity and accessibility hints for locked, downloading, unavailable, outage (ModelRow.tsx:148-170, 181).
- Web catalogue loading and failure texts 'Loading models…', 'The model list could not be loaded.', 'Try again' (ModelCatalogue.tsx:34-37).

**Journey**

1. 1. Person opens the picker.
2. 2. Rows the person can use are normal; rows blocked by plan, sign-in or environment are marked.
3. 3. Choosing a plan-locked row opens the upgrade request (web) or the upgrade or sign-in sheet (mobile); hard-disabled rows do nothing.
4. 4. The person picks another model or follows the upgrade path.

**What the person sees and gets**

- Lock label, reason text or tooltip on each blocked row.
- Screen reader label includes the reason, for example '<model> - requires upgrade' (ComposerFooter.tsx:677-683).

**Settings**

- Free-lane display setting changes slot text (ComposerFooter.tsx:1202-1206).
- No other setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web modelLock returns locked tier, environment or coming-soon states (apps/web/features/chat/lib/model-plan-admission.ts:34-51).
- Web plan-locked rows stay clickable and call onUpgradeRequest; environment and coming-soon rows are disabled buttons (ComposerFooter.tsx:671-674, 724, 736).
- Web picker marks a model temporarily unavailable using the models API list (ModelCatalogue.tsx:41, 319, 473; apps/web/app/api/llm/v1/models/route.ts:151-157, 216).
- Mobile model rows: locked rows open sign-in or upgrade; downloading, unavailable or outage rows are disabled (ModelRow.tsx:80, 101-109).
- Mobile lock reason and detail label come from service.ts: 'Sign in required', 'Upgrade required' or 'Not included in plan' (apps/mobile/src/features/model-picker/service.ts:186-193).
- CLI model list separates locked, temporarily unavailable and not offered by this deployment (apps/cli/src/provider.rs:268-306).
- VS Code picker marks locked items disabled and groups them by what unlocks them (modelConstants.ts:216-248, 297-330).
- Hidden: effort slider and thinking switch absent when the model has none (ComposerFooter.tsx:1320-1321); CLI effort bar only for reasoning models (model_picker.rs:295-301); web web-search control depends on useCapability('canUseWebSearch') (ChatComposerNew.tsx:1599).
- Chrome picker attaches a lock label to premium models and separates gated effort marks (managedModelPicker.ts:141-143, 337-339).

**Incomplete**

- Environment lock reason never clears because environmentAvailability always reports not configured (model-plan-admission.ts:19-21).
- The mobile and web lock copy for plan-gated rows changes with whether purchases are available (service.ts:65-72).

**Present but disconnected or switched off**

- nothing found

**Not available**

- The brief status for Chrome and VS Code disabled controls was not tested here beyond the files named.

## 4. Required behaviour

**Established requirements**

- Controls that cannot apply in the current context are hidden instead of shown broken. (source: brief S78.17)
- Restricted controls stay visible but disabled with the reason. (source: brief S78.18)
- A mutation fired straight from a button without confirming an irreversible action is a defect. (source: doc: AGENTS.md §9)

**Acceptance criteria**

1. A plan-locked model row on web shows a lock label and opens the upgrade path when chosen.
2. A coming-soon or environment-locked row on web cannot be selected and shows its reason as title and label.
3. A signed-out mobile user sees cloud rows locked with the sign-in reason, and pressing one opens sign-in.
4. A model with no effort ladder shows no slider.
5. CLI model list shows the plan name that unlocks each locked model.
6. When no model is allowed the list shows a reason, not a blank list.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- An empty allowed list on web falls back to the locked slot text and not a blank, but this was not confirmed in code [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the same reason text from the shared denial catalog on every app instead of per-app wording.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | modelLock | `apps/web/features/chat/lib/model-plan-admission.ts` | Lock decision per model. |
| component | ComposerFooter model row | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Renders locked and disabled rows. |
| component | ModelCatalogue | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Full list with Coming soon, Beta, Temporarily unavailable tags. |
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Returns models plus temporarily_unavailable ids. |
| service | model picker service (mobile) | `apps/mobile/src/features/model-picker/service.ts` | Builds model defs with availability and lockReason. |
| component | ModelRow (mobile) | `apps/mobile/src/features/model-picker/components/ModelRow.tsx` | Locked and disabled row behaviour and accessibility. |
| component | ChatInput (mobile) | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Uses useCapability to show or hide controls. |
| hook | useCapability (mobile) | `apps/mobile/src/lib/Capabilities.tsx` | Capability on or off for a control. |
| component | CLI model listing | `apps/cli/src/provider.rs` | Locked, temporarily unavailable and withheld lists. |
| service | CLI model catalog | `apps/cli/src/model_catalog.rs` | can_access_model_for_tier and managed_plan_needed. |
| component | CLI model picker | `apps/cli/src/tui/widgets/model_picker.rs` | Effort bar visibility rule. |
| service | VS Code modelConstants | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | Lock kinds and group headings. |
| service | Chrome managedModelPicker | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | Lock labels and gated efforts. |
| schema | Denial reason catalog | `packages/contracts/types/src/reason-codes.ts` | Shared titles, messages and suggestions per denial reason. |
| test | ComposerFooter env gating test | `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.env-gating.test.tsx` | Covers locked environment rows. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| App computes locks from plan and model data. | device | ComposerFooter.tsx:1212-1227; service.ts:185-193 |
| Web fetches model list and temporarily unavailable ids from the server. | our servers | apps/web/app/api/llm/v1/models/route.ts:151-160, 199-216 |
| CLI fetches managed catalog discovery then labels locked and withheld models. | our servers | apps/cli/src/provider.rs:236-307 |
| Choosing a locked row opens upgrade or sign-in; nothing is sent to a model. | device | ModelRow.tsx:104-107; ComposerFooter.tsx:671-674 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Favourites and recent models | Web favourites store | unknown | unknown |
| Lock state | Computed in memory, not stored | No | Recomputed on plan change |

**Models and providers.** Locks come from registry minimum tier per model and provider switches on the server. A provider the person turned off on mobile shows a note (ModelRow.tsx:82-84).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-out mobile users see cloud models locked with 'Sign in required' (service.ts:211-212). |
| Permissions | none found in the code. |
| Subscription | Plan decides which rows lock; wording depends on plan name from the pricing table (service.ts:62-72; ComposerFooter.tsx:214). |
| Limits and metering | none found in the code. |
| Feature flags | Operator kill switches can mark a model temporarily unavailable (apps/web/app/api/llm/v1/models/route.ts:119-123). |
| Model compatibility | Tags such as Coming soon follow model availability (model-plan-admission.ts:40-42). |
| Provider restrictions | Mobile provider outage and provider-turned-off states disable a row (ModelRow.tsx:79-84). |
| Local mode | Local models on mobile are listed under on-device rows and are not plan-locked in the code opened (service.ts:227). On web the 'On this device' section needs a grant to list local models (ComposerFooter.tsx:51-53). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading models (web catalogue) | Shows 'Loading models…' | ModelCatalogue.tsx:34 |
| Model list failed to load (web) | Shows failure text and 'Try again' | ModelCatalogue.tsx:35-37 |
| Plan list loading or failed (web picker) | Shows "Loading your plan's models…" or "Could not load your plan's models. Try again" | ComposerFooter.tsx:173-174 |
| No search match | Shows 'No models match' | ModelCatalogue.tsx:33 |
| Model download in progress (mobile) | Row disabled, cancel available | ModelRow.tsx:75-80, 122-125 |
| Provider outage (mobile) | Row disabled, hint carries the outage reason | ModelRow.tsx:79-80, 159-160 |
| Accessibility | Role button, state disabled, label and hint name the lock | ModelRow.tsx:148-171; ComposerFooter.tsx:677-693 |
| Empty allowed list | not handled in the code as a distinct message that I could find on web; CLI prints 'No models available to this CLI account tier.' | apps/cli/src/provider.rs:256-258 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.env-gating.test.tsx`: Environment-gated rows in the footer.
- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.picker-parity.test.tsx`: Picker parity.
- `apps/web/features/chat/components/Composer/__tests__/ModelCatalogue.dead-control.test.tsx`: No dead controls in the catalogue.
- `apps/mobile/__tests__/ModelRowProviderTurnedOff.test.tsx`: Provider turned-off row.
- `apps/mobile/__tests__/ModelRowCancelDownload.test.tsx`: Row during download.
- `apps/mobile/__tests__/SettingsModelRowOwnership.test.tsx`: Settings model row ownership.
- `apps/mobile/__tests__/CapabilitiesSettings.test.tsx`: Capability settings on mobile.

**Test scenarios**

- **Plan-locked row on web**
  1. Sign in on a Free plan.
  2. Open the model menu.
  3. Choose a locked row.
  - Expected: Row shows its plan label; choosing it opens the upgrade request; no turn is sent.
- **Signed-out mobile**
  1. Open mobile signed out.
  2. Open the model picker.
  3. Press a cloud row.
  - Expected: Row shows 'Sign in required'; the press opens sign-in.
- **CLI locked listing**
  1. Sign in the CLI on a lower plan.
  2. Run the model list command.
  - Expected: A 'Locked on your <plan> plan' section lists models with the plan needed.
- **Operator switches a model off**
  1. Close a model with the kill switch.
  2. Open the web catalogue.
  - Expected: The model shows 'Temporarily unavailable' and cannot be picked.
- **No effort ladder**
  1. Pick a model without effort levels.
  - Expected: No effort slider on web, mobile or CLI.

**Where to look when it fails**

- Models API field temporarily_unavailable.
- Mobile accessibility label on model-row-<id>.
- Web catalogue failure text.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md)
- Desktop: [70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md)
- Mobile: [70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md)
- CLI: [70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md)
- VS Code: [70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md)
- Chrome: [70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md)

## 10. Gaps and dependencies

- **Environment lock reason is permanent because the availability check is a stub.** Affects: Web, Mobile, VS Code. Evidence: model-plan-admission.ts:19-21. Work needed: Wire to real environment status.
- **Reason wording is per app, not read from the shared denial catalog everywhere.** Affects: All six apps. Evidence: service.ts:65-72 vs modelConstants.ts:140-165 vs provider.rs:289-299. Work needed: Decide the single owner of lock copy.
- **Empty-list reason on web was not found.** Affects: Web, Desktop. Evidence: ComposerFooter.tsx:1199-1206 only shows a locked slot. Work needed: Check and add a reason.
- **Plan-locked web rows are clickable, not disabled; the brief says disabled.** Affects: Web, Desktop. Evidence: ComposerFooter.tsx:671-674, 736. Work needed: Update the requirement text: locked-but-actionable is the shipped behaviour.

**Depends on**

- F078-01
- F078-05
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- api:GET /api/llm/v1/models

## Unknown

- What the web picker shows when no model is allowed.
- Where favourites are stored and whether they sync.
- Exact Chrome and Desktop-specific disabled states beyond the shared web composer.
- Whether desktop-only controls are hidden on the web build by a platform check (brief S78.17 names ChatComposerNew.tsx:886, not opened).
