---
id: "F015-08"
type: "feature"
title: "Speed, status and plan labels"
aliases: ["Plan lock label", "Upgrade to use", "Coming soon", "Beta (environment lock)", "Leaving <date> / Retires <date>", "Preview / Experimental / Beta / Alpha stage label", "Unavailable right now", "Temporarily unavailable", "Instant filter", "Fastest / Balanced / Most capable"]
area: "15 Model-selector interface"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (2 of 5)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S15.16", "S15.18", "S15.19", "S15.20", "S15.21"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-observability-and-operations", "SYS-authentication-and-identity", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "plan:free", "file:apps/web/features/chat/lib/model-plan-admission.ts", "api:GET /api/models", "store:providerAvailability"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F015-08 Speed, status and plan labels

Tells a person what state a model row is in. Rows say which plan unlocks a locked model, mark preview models, warn 30 days before a model leaves, and show when a provider is down. Web and Desktop carry all of these. Mobile has lock, outage, retirement and an Instant filter. CLI, VS Code and Chrome cover parts.

Area: [15. Model-selector interface](README.md). Requirement items: [S15.16](../../10-requirements/capabilities/015-model-selector-interface.md#s1516), [S15.18](../../10-requirements/capabilities/015-model-selector-interface.md#s1518), [S15.19](../../10-requirements/capabilities/015-model-selector-interface.md#s1519), [S15.20](../../10-requirements/capabilities/015-model-selector-interface.md#s1520), [S15.21](../../10-requirements/capabilities/015-model-selector-interface.md#s1521).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | partly seen (2 of 5) |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns catalogue and health facts into short labels on picker rows: the plan needed, 'Coming soon', 'Beta' for a missing environment, a preview stage, a leaving date, an outage notice, and a speed hint.

**Why it exists.** A person must not pick a model that will fail, and should know why a model is locked and what unlocks it. The product contract lists 'Runtime availability', 'Plan/credit lock', 'Rollout status' and 'Disabled reason' as selector content (doc: docs/product/experience-contract.md section 7.3). Mobile requires locked cloud models to be labelled so the user 'cannot accidentally start Cloud' (doc: docs/product/requirements.md, M-MODEL-003).

**Who uses it.** Anyone choosing a model, especially Free and lower-plan users deciding whether to upgrade.

**Problems it solves**

- Tapping a model that the plan cannot run and getting a failed turn.
- Not knowing which plan unlocks a model.
- Being surprised when a model is retired.
- Choosing a model whose provider is down.

**Use cases**

- A Free user opens the Web menu and sees a locked row marked with the plan name and 'and above', and clicks it to reach the upgrade page.
- A model retires in 12 days; its Web row says 'Leaving <date>' and Mobile says 'Retires <date>'.
- A provider degrades; the Mobile row greys out with 'Unavailable' and the reason.
- A CLI user on Free sees 'needs <plan>' beside a cloud model.

## 2. User experience

**Where to find it**

- Web and Desktop short list: lock badge text '<plan> and above' (ComposerFooter.tsx:214,637-641,780-790); catalogue: 'Upgrade to use · <plan>' (ModelCatalogue.tsx:574-579); footer link 'What each plan includes' (ComposerFooter.tsx:204,1789).
- Web labels 'New', top-plan name, stage ('Preview', 'Experimental', 'Beta', 'Alpha'), 'Coming soon', 'Beta' for environment (ComposerFooter.tsx:676-690,730-790; packages/ai/routing/src/model-picker.ts:166-205).
- Web 'Leaving <short date>' in the row text and 'Leaving on <full date>' in the accessibility label (ComposerFooter.tsx:323-355,346-353,684-691).
- Mobile row badges 'Sign in', 'Upgrade' or 'Not included', lock icon, 'Unavailable', and a 'Retires <date>' line (apps/mobile/src/features/model-picker/components/ModelRow.tsx:241-285).
- Mobile filter 'Instant' (modelFilters.ts:13-17) and 'Economy' (modelFilters.ts:18-22).
- CLI picker: tier word 'Fastest', 'Balanced', 'Most capable' or 'needs <plan>' (apps/cli/src/tui/widgets/model_picker.rs:527-540,627-633; design_system.rs:353-385); detail line with status and 'deprecated, leaves <date>' (model_picker.rs:438-468).
- VS Code quick pick: plan text on every row, locked rows grouped under 'Sign in to AGI Cloud' or 'Upgrade your AGI plan' (apps/extension-vscode/src/features/model-picker/modelConstants.ts:112-123,140-148,303-327); speed words 'Fastest', 'Fast', 'Medium speed', 'Slower' (334-339).
- Chrome: locked rows show the plan label and open the pricing page in a new tab; speed words in the sublabel (apps/extension/src/side_panel.ts:10967-11046,1116-1130).

**Before you start**

- Web: plan must be resolved; while it is unknown the menu shows 'Loading your plan's models…' or a retry row instead of guessing a lock (ComposerFooter.tsx:475-495,1042-1049).
- Mobile: signed in to AGI Cloud for plan locks; otherwise 'Sign in' (ModelRow.tsx:69,275-279).
- CLI: tier read from a cache, fail-closed to Free (model_picker.rs:116-125).

**Screens and controls**

- Locked Web row is a button that opens the upgrade flow for plan locks and is disabled for 'Coming soon' and 'Beta' locks (ComposerFooter.tsx:1296; ModelRow disabled flag at 629-770).
- Web catalogue row: disabled for coming soon, environment, temporarily unavailable, or not offered in this app; plan-locked rows stay clickable to upgrade (ModelCatalogue.tsx:454-458,492-496).
- Mobile row: tap a locked model opens sign-in or billing; when the build has no store purchases the tap does nothing (ModelPickerSheet.tsx:465-471,660; storePurchases.json nativePurchases false).

**Journey**

1. Open the picker.
2. Read each row's label.
3. Tap a locked row to start sign-in or upgrade (where available), or pick an unlocked row.
4. If a provider is down, pick another model; Mobile will not let you tap the row.

**What the person sees and gets**

- Web short-list outage row shows 'Unavailable right now' and a tooltip with the provider reason (ComposerFooter.tsx:346-353,697-699).
- Mobile outage adds text 'Unavailable right now: <reason>' (ModelRow.tsx:295-305).
- Mobile chat whose model was retired shows a notice naming the replacement or telling the user to pick another model (apps/mobile/src/features/model-picker/retirement.ts:30-39; app/(app)/chat/[id].tsx:1362).

**Settings**

- None found. Mobile provider-routing consent can turn a provider off per account: the row says 'Turned off for your account. You can turn it on when you send.' (ModelRow.tsx:31,82-84,306-315).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web plan lock label from resolvePlanLockLabel, formatted '<plan> and above' (ComposerFooter.tsx:214,1212-1227; model-picker.ts:247-251).
- Web coming-soon and environment locks come from modelLock (apps/web/features/chat/lib/model-plan-admission.ts:32-51).
- Web catalogue marks a model temporarily unavailable when every route is degraded and refuses the click (apps/web/lib/server/model-catalogue.ts toCatalogueEntry; ModelCatalogue.tsx:554-568; test ModelCatalogue.supply-and-event.test.tsx).
- Web short-list provider outage text from GET /api/models (ComposerFooter.tsx:223-232).
- Web deprecation window of 30 days (ComposerFooter.tsx:317-340); retired models are dropped by isCurrentModel (packages/contracts/types/src/model-catalog.ts:2009-2013).
- Release stage label from model id or name words preview, exp, experimental, beta, alpha (model-picker.ts:166-205).
- Mobile outage disables the row and shows a badge (ModelRow.tsx:79-80,270,295-305; providerAvailabilityStore.ts:20-60, 60 second cache).
- Mobile retirement line within 30 days (retirement.ts:7-28; ModelRow.tsx:85,241-249; test retirement.test.ts).
- Mobile 'Instant' filter uses catalogue speed 'very-fast' (modelFilters.ts:16).
- CLI plan label and deprecated text (model_picker.rs:627-633,438-468) and preview, beta or experimental text in the detail line.
- VS Code lock grouping and unlock offers (modelConstants.ts:182-200; commandSetup.ts:850-866); non-live models are skipped (modelConstants.ts, availability check inside buildGroupedQuickPickItems).
- Chrome lock label and pricing link; speed label (side_panel.ts:10967-11046).

**Incomplete**

- Web short list: a degraded provider's row shows text but is not disabled; only the catalogue row is refused (ComposerFooter.tsx:629-770 isHardDisabled covers env and coming soon only).
- Web catalogue does not show the leaving date although the server sends deprecatedOn (apps/web/lib/server/model-catalogue.ts toCatalogueEntry; ModelCatalogue.tsx has no use of it).
- Web has no per-row speed label; the closest text is a guidance line such as 'For quick answers' that comes from quality tier, not speed (model-picker.ts:151-164).
- CLI 'speed' is the quality tier word, not the catalogue speed field (design_system.rs:361-385).
- Mobile lock badge never names the plan (ModelRow.tsx:271-285).
- VS Code shows no deprecation or preview marks; Chrome drops deprecated models silently and shows no preview mark (managedModelPicker.ts:85).

**Present but disconnected or switched off**

- Environment lock: environmentAvailability always returns not configured on Web and Mobile, so any model needing an environment shows 'Beta' and is disabled (model-plan-admission.ts:20-22; apps/mobile/src/features/model-picker/service.ts:78-80). The CLI hides such models entirely (model_picker.rs:41-46,133-141).

**Not available**

- CLI and VS Code: no provider outage state found (brief S15.21 marks them missing).
- Mobile: no preview or stage badge found in ModelRow.tsx.
- Chrome: no outage, preview or retirement notice found in the code read.

## 4. Required behaviour

**Established requirements**

- Models the plan cannot use are marked with the plan that unlocks them. (source: brief S15.18)
- Preview or experimental models carry a visible badge. (source: brief S15.19 (status web, desktop, cli done))
- A model scheduled for retirement shows a notice with its leaving date before it disappears. (source: brief S15.20 (status web, desktop, cli done; mobile marked missing but code has it))
- A temporarily unavailable model is marked and cannot be picked by mistake. (source: brief S15.21 (status web, desktop, mobile done; cli, vscode, chrome missing))
- The selector tells the user which models are faster or slower. (source: brief S15.16)
- Locked cloud models on Mobile are labelled so the user cannot accidentally start Cloud. (source: doc: docs/product/requirements.md, M-MODEL-003)
- The selector shows runtime availability, plan lock, rollout status and a disabled reason. (source: doc: docs/product/experience-contract.md section 7.3)

**Acceptance criteria**

1. On Free, a model the plan cannot run shows its unlocking plan on Web as '<plan> and above' and clicking it opens the upgrade flow.
2. A coming-soon model is disabled on Web with the label 'Coming soon' and cannot be selected by keyboard Enter.
3. A model whose retirement date is 31 or more days away shows no leaving label; at 30 days or fewer it shows 'Leaving <date>' on Web and 'Retires <date>' on Mobile; after the date it is gone from the list.
4. When the degraded-provider signal is present, Mobile disables the row and shows 'Unavailable', and the Web catalogue marks it 'Temporarily unavailable' and refuses the click.
5. A model whose id or name contains a stage word shows that stage label on Web.
6. Mobile 'Instant' keeps only catalogue models with speed 'very-fast'.
7. On the CLI, a cloud model above the cached tier shows 'needs <plan>' and the row is dimmed.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief says Web shows a degraded-provider notice on rows (ComposerFooter.tsx:1295); the code does, but selection stays possible, which differs from the 'cannot be picked by mistake' wording [inferred].
- The Mobile lock needs a plan name or a link to match the 'marked with the plan' wording [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Disable or warn on short-list rows of a degraded provider on Web.
- [proposed] Show leaving dates in the Web catalogue using deprecatedOn.
- [proposed] Name the unlocking plan on Mobile when store purchases are off, as plain text without a button.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerFooter ModelRow and rowGuidance | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Short-list lock, stage, New, top-plan, outage and deprecation labels (214,223,323,346,629). |
| component | ModelCatalogue renderEntry | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Catalogue lock tags, disabled logic and aria labels (447-583). |
| service | modelLock | `apps/web/features/chat/lib/model-plan-admission.ts` | Decides coming_soon, tier and env locks (32-51). |
| service | resolvePlanLockLabel and release stages | `packages/ai/routing/src/model-picker.ts` | Plan label (247), stage words (166-205), lock overrides in buildModelPickerShortList (272-300). |
| service | catalogue admission and health | `apps/web/lib/server/model-catalogue.ts` | Computes admitted, temporarilyUnavailable, minimumPlanLabel, availability, deprecatedOn. |
| endpoint | GET /api/models | `apps/web/app/api/models/route.ts` | Per-model availability including degraded provider state (lines 35-105,127-185). |
| component | Mobile ModelRow | `apps/mobile/src/features/model-picker/components/ModelRow.tsx` | Lock, outage, retirement and consent labels (79-316). |
| store | providerAvailabilityStore | `apps/mobile/src/features/model-picker/providerAvailabilityStore.ts` | Fetches /api/models, keeps outages for 60 seconds (store:providerAvailability). |
| service | retirement helpers | `apps/mobile/src/features/model-picker/retirement.ts` | 30-day label and retired-chat notice. |
| service | Mobile model service | `apps/mobile/src/features/model-picker/service.ts` | Lock reasons and environment gate (65-96,177-218). |
| component | CLI picker | `apps/cli/src/tui/widgets/model_picker.rs` | Locked rows, 'needs <plan>', detail line with status and deprecation (206-214,424-468,627-633). |
| service | CLI capability tier | `apps/cli/src/design_system.rs` | Fastest, Balanced, Most capable words (353-385). |
| service | VS Code lock logic | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | ModelLock, headings, reasons, speed labels (112-200,334-339). |
| command | VS Code offerModelUnlock | `apps/extension-vscode/src/core/commandSetup.ts` | Sign-in or upgrade offer when a locked row is picked (850-866,1353-1357). |
| service | Chrome managed picker | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | Locked options with plan label (126-175); drops deprecated models (85). |
| screen | Chrome side panel rows | `apps/extension/src/side_panel.ts` | Lock text, pricing link, speed label (10967-11046,1116-1130). |
| test | deprecation warning test | `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.deprecation-warning.test.tsx` | Covers the 'Leaving <date>' window. |
| test | environment gating test | `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.env-gating.test.tsx` | Covers 'Beta' environment lock. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server computes per-model admission, health and retirement date for the caller's plan. | our servers | apps/web/lib/server/model-catalogue.ts toCatalogueEntry; catalogue/route.ts:80-86 |
| Web fetches /api/models when the menu opens to learn which providers are degraded. | device and our servers | ComposerFooter.tsx:922-928; apps/web/app/api/models/route.ts:127-185 |
| Browser computes locks for the short list from the known plan and the catalogue, then renders labels. | device | ComposerFooter.tsx:1212-1272 |
| Mobile reads outages from /api/models (60 s cache) and plan locks from its tier store. | device and our servers | providerAvailabilityStore.ts:20-60; service.ts:177-218 |
| CLI reads the cached tier from disk and decides locks without a network call. | device | model_picker.rs:116-125,206-214 |
| Tap on a plan lock opens the upgrade or billing page. | outside service | ComposerFooter.tsx:1789 (openUpgrade); side_panel.ts:11041-11046 (opens pricing in a new tab) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Plan tier and lock decisions | Web billing store in memory; Mobile tier store; CLI tier cache file | Fetched from the server; not written back | Refreshed on plan change; cache semantics for the CLI tier file not read |
| Provider outage list | Mobile memory store (checkedAtMs, outages) | No | Refetched after 60 seconds |

**Models and providers.** Locks depend on the model's minimum plan and route health, not on the model's maker. Outage state is keyed by provider key (ComposerFooter.tsx:223-232; providerAvailabilityStore.ts:25-35). The catalogue never exposes the supplier name.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Plan locks need a resolved plan: Web treats a signed-out visitor as Free and an unresolved plan as unknown, never as Free (ComposerFooter.tsx:1036-1042 comment). Mobile and VS Code show 'Sign in' locks when signed out (ModelRow.tsx:69; modelConstants.ts:176-180). |
| Permissions | none found in the code. |
| Subscription | Locks come from catalogue minimum tiers and plan policy (model-picker.ts:247-251; packages/contracts/types/src/model-catalog.ts getMinimumRequiredTier). Event and free-model promotions can unlock a model temporarily with a 'Free during event' or promotion label (ModelCatalogue.tsx:555-563). |
| Limits and metering | none found in the code for labels. Outage cache is 60 seconds on Mobile (providerAvailabilityStore.ts:6). |
| Feature flags | Free lane UI gate changes the locked slot text on Web (ComposerFooter.tsx resolveFreeLaneUiEnabled). Native store purchases flag decides whether Mobile upgrade taps do anything (apps/mobile/src/features/billing/storePurchases.json). |
| Model compatibility | A model with availability other than 'live' is locked as coming soon (model-plan-admission.ts:41-43); VS Code skips it (modelConstants.ts). |
| Provider restrictions | Mobile can mark a provider turned off for the account through the routing consent ledger (ModelRow.tsx:82-84). Web catalogue hides models with no executable route (model-catalogue.ts). |
| Local mode | Local models are never plan-locked: CLI states local and own-key rows are never gated (model_picker.rs:196-214); Mobile local rows show install states instead (ModelRow.tsx:253-269). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Plan unknown | Web shows a spinner row 'Loading your plan's models…', or a retry row 'Could not load your plan's models. Try again'. | ComposerFooter.tsx:475-495 |
| Outage | Web short list text only; Web catalogue and Mobile disable the row. | ComposerFooter.tsx:346-353; ModelCatalogue.tsx:554-568; ModelRow.tsx:80 |
| Retired model in an existing chat | Mobile shows a notice; Web drops retired models from the list and resets a no-longer-valid selection to Auto. | retirement.ts:30-39; ComposerFooter.tsx:1340-1360 |
| Store purchases off | Mobile lock reads 'Not included' and tapping does nothing. | ModelRow.tsx:277-279; ModelPickerSheet.tsx:465-466 |
| Accessibility | Web labels carry the lock and outage reason; Mobile accessibility label and hint name the state. | ComposerFooter.tsx:661-695; ModelRow.tsx:148-170 |
| Offline or request failure | Web ignores a failed availability request and shows no outage; Mobile marks the check time and shows none. | ComposerFooter.tsx:925-927; providerAvailabilityStore.ts:50-55 |
| Timeout or retry | not handled in the code beyond the failure handling above. | Searched ComposerFooter.tsx, providerAvailabilityStore.ts and ModelRow.tsx; no timeout or retry logic found for label data |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.deprecation-warning.test.tsx`: No badge without a date, badge inside the window, none outside it.
- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.env-gating.test.tsx`: Environment-gated model shows 'Beta', is natively disabled, not an upgrade path.
- `apps/web/features/chat/components/Composer/__tests__/ModelCatalogue.supply-and-event.test.tsx`: Temporarily unavailable marking, refused click, screen-reader text, event badge, no supplier names.
- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.picker-parity.test.tsx`: Top-plan mark, New mark, plan name on a locked catalogue row.
- `packages/ai/routing/src/__tests__/model-picker.test.ts`: Lock label with the catalogue plan name and caller overrides.
- `apps/mobile/src/features/model-picker/__tests__/retirement.test.ts`: Retirement warning window and retired-chat notice.
- `apps/mobile/__tests__/model-picker-cloud-labels.test.ts`: Cloud model labels (file exists; titles not read).
- `apps/extension-vscode/src/__tests__/modelPickerTierGate.test.ts`: Tier reachability and filing locked models under what unlocks them.
- `apps/extension/__tests__/managed-model-picker.test.ts`: Chrome admission, locked roster and selection reset.

**Test scenarios**

- **Free user locked row**
  1. Sign in on Free on Web.
  2. Open the menu and find a locked model.
  3. Click it.
  - Expected: Row shows '<plan> and above'; click opens the upgrade flow; the model is not selected.
- **Retirement window**
  1. Use a test catalogue with retirement 10 days ahead.
  2. Open Web menu; then Mobile sheet.
  - Expected: Web 'Leaving <date>'; Mobile 'Retires <date>'.
- **Provider outage**
  1. Make /api/models report a degraded provider.
  2. Open Mobile sheet; open Web short list and catalogue.
  - Expected: Mobile row disabled with 'Unavailable'; Web short list shows 'Unavailable right now'; Web catalogue row says 'Temporarily unavailable' and ignores clicks.
- **Instant filter**
  1. Open Mobile cloud picker.
  2. Press 'Instant'.
  - Expected: Only models with speed 'very-fast' remain.
- **CLI Free tier**
  1. Clear the signed-in tier cache.
  2. Run /model.
  - Expected: Cloud rows show 'needs <plan>' and are dimmed.

**Where to look when it fails**

- Web: GET /api/models response, availability.state values 'available' or 'degraded' (ComposerFooter.tsx:216-232).
- Mobile: providerAvailabilityStore outages and checkedAtMs.
- Server: route health marks drive temporarilyUnavailable (model-catalogue.ts comment above CatalogueEntry fields).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/015-model-selector-interface.md](../../70-qa/test-plans/web/015-model-selector-interface.md)
- Desktop: [70-qa/test-plans/desktop/015-model-selector-interface.md](../../70-qa/test-plans/desktop/015-model-selector-interface.md)
- Mobile: [70-qa/test-plans/mobile/015-model-selector-interface.md](../../70-qa/test-plans/mobile/015-model-selector-interface.md)
- CLI: [70-qa/test-plans/cli/015-model-selector-interface.md](../../70-qa/test-plans/cli/015-model-selector-interface.md)
- VS Code: [70-qa/test-plans/vscode/015-model-selector-interface.md](../../70-qa/test-plans/vscode/015-model-selector-interface.md)
- Chrome: [70-qa/test-plans/chrome/015-model-selector-interface.md](../../70-qa/test-plans/chrome/015-model-selector-interface.md)

## 10. Gaps and dependencies

- **Web short-list rows of a degraded provider stay selectable.** Affects: Web and Desktop. Evidence: ComposerFooter.tsx:629-770 (isHardDisabled excludes outage). Work needed: Treat outage as a soft lock or add a confirmation; add a test.
- **Web catalogue shows no leaving date although the data is present.** Affects: Web and Desktop. Evidence: apps/web/lib/server/model-catalogue.ts (deprecatedOn); ModelCatalogue.tsx. Work needed: Render 'Leaving <date>' in catalogue rows.
- **No dedicated speed label on Web; CLI uses the quality tier as speed.** Affects: Web, Desktop, CLI. Evidence: model-picker.ts:151-164; design_system.rs:361-385. Work needed: Read the catalogue speed field like VS Code and Chrome do.
- **Mobile lock names no plan and has no preview badge; with store purchases off the tap is a dead end.** Affects: Mobile. Evidence: ModelRow.tsx:271-285; ModelPickerSheet.tsx:465-466. Work needed: Add the plan name in text; add the stage label.
- **Environment-gated models are always locked everywhere because availability is hard-coded to not configured.** Affects: Web, Desktop, Mobile, CLI. Evidence: model-plan-admission.ts:20-22; service.ts:78-80; model_picker.rs:41-46. Work needed: Wire a real environment signal or remove the dead gate.
- **CLI, VS Code and Chrome have no outage state; VS Code and Chrome have no deprecation or preview marks.** Affects: CLI, VS Code, Chrome. Evidence: model_picker.rs:511-594; modelConstants.ts; managedModelPicker.ts:85. Work needed: Share the outage signal and retirement date.
- **The brief lists Mobile retirement as missing but the code has it; brief cites are stale.** Affects: Documentation readers. Evidence: ModelRow.tsx:85,241-249. Work needed: Update the brief statuses.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-observability-and-operations
- SYS-authentication-and-identity
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- plan:free
- file:apps/web/features/chat/lib/model-plan-admission.ts
- api:GET /api/models
- store:providerAvailability

## Unknown

- Whether Mobile handles non-live availability like 'coming soon' (not seen in ModelRow.tsx).
- How the CLI tier cache expires (tier_cache.rs not read).
- Where Mobile's Economy filter tier values come from (service.ts tier field not traced).
- Whether the CLI shows any outage text from a provider call failure beyond the fallback banner.
- The exact rendered lock text for Chrome plan labels (comes from the catalogue plan label, not read per plan).
