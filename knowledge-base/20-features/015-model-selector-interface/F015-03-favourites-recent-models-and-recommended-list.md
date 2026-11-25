---
id: "F015-03"
type: "feature"
title: "Favourites, recent models and recommended list"
aliases: ["Favourites, recent models and recommended list", "Favorite models, Recently used models, Recommended models (brief S15.05, S15.06, S15.07)", "Favourites rail and Recent rail (Web catalogue)", "Recent and Favorites sections (Mobile)", "Recommended section (Web, Chrome)"]
area: "15 Model-selector interface"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S15.05", "S15.06", "S15.07"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-sync-and-continuity", "SYS-data-model-and-migrations", "SYS-authentication-and-identity", "F015-02", "F015-05", "api:PUT /api/settings/preferences", "api:GET /api/settings/preferences", "table:user_settings"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F015-03 Favourites, recent models and recommended list

Lets a person star models, see recently used models, and see a short recommended list, so they need not search each time. Web and Mobile have favourites and recents; Web and Chrome have recommended. The CLI and VS Code have none of these.

Area: [15. Model-selector interface](README.md). Requirement items: [S15.05](../../10-requirements/capabilities/015-model-selector-interface.md#s1505), [S15.06](../../10-requirements/capabilities/015-model-selector-interface.md#s1506), [S15.07](../../10-requirements/capabilities/015-model-selector-interface.md#s1507).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Keeps starred models and the last used models close to the top of the picker and adds a short curated list of recommended models.

**Why it exists.** Most people use a few models; a short top section avoids scanning a long catalogue. The founder decision keeps Recent and Favorites above provider rows on Mobile (doc: docs/decisions/2026-11-12-founder-decisions.md, D-2026-11-12-05).

**Who uses it.** Repeat users on Web, Desktop and Mobile; new users who need a starting point (Recommended).

**Problems it solves**

- Searching the same model every day.
- Not knowing which models to try first.
- Losing favourites when switching device.

**Use cases**

- Web user stars a model in the catalogue and finds it under Favourites in the short list.
- Mobile user long-presses a row to favourite it and sees it under Favorites.
- Chrome user reads the Recommended heading in the model menu.
- Web user opens the Recent rail to return to last week's model.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings are not needed. In the catalogue, each row has a star button 'Add <model> to favourites' or 'Remove <model> from favourites'; rails 'Favourites' and 'Recent' sit above the developer rails (apps/web/features/chat/components/Composer/ModelCatalogue.tsx:437-445, 585-600). In the short list the section labels are 'Recommended' and 'Favourites' (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1693-1715).
- Mobile: long-press a model row to toggle a favourite (apps/mobile/src/features/model-picker/components/ModelRow.tsx:111-115, 168-169); sections 'Recent' and 'Favorites' in the sheet (apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:923-929).
- Chrome: the 'Recommended' heading in the model menu (apps/extension/src/side_panel.ts:11228-11233).

**Before you start**

- Web short list: paid plan for Recommended and Favourites (ComposerFooter.tsx:1693, 1705).
- Favourites sync to the account only when signed in; on Web a failed save is undone with a message.
- Mobile: favourites sync only in Cloud mode and when signed in (apps/mobile/src/features/model-picker/useFavouritesSync.ts:62-67).

**Screens and controls**

- Web star toggle with aria-pressed (ModelCatalogue.tsx:585-600).
- Web rails: Favourites with a count, Recent with a count (ModelCatalogue.tsx:437-445).
- Mobile star icon shown on a favourite row (ModelRow.tsx:287-289).
- Web short list shows at most 3 favourites and 4 recommended rows (packages/ai/routing/src/model-picker.ts:26-27, 332-334, 363).

**Journey**

1. Open the picker.
2. Web: open All models, press the star on a model.
3. Close and reopen: the model appears under Favourites in the short list, up to 3.
4. Pick a model; it is added to recents and moves first in the Recent rail.
5. Mobile: long-press a row; a haptic tap fires and the row moves into Favorites.

**What the person sees and gets**

- Web error toast 'Your favourite models could not be saved. Try again.' and the star reverts (apps/web/features/chat/lib/use-model-favourites.ts:10, 119-124).
- Mobile star icon on favourite rows and the accessibility text ', favorite' (ModelRow.tsx:148).
- Web favourites beyond three stay in the Favourites rail of the catalogue but do not show in the short list (packages/ai/routing/src/model-picker.ts:363-364).

**Settings**

- None found in the code for turning favourites off.
- Web server preference namespace model-picker, key favouriteModelIds (packages/contracts/types/src/model-favourites.ts:1-2).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web favourites: device copy in browser storage key agi-model-picker-favourites, loaded first, then replaced by the saved account copy unless the person edited meanwhile (use-model-favourites.ts:9, 96-108); saved with PUT /api/settings/preferences (lines 31-47).
- Web recents: last 5 distinct models in the unified-chat store, saved in browser storage under chat-model-store; shown as the Recent rail (packages/ui/unified-chat/src/stores/modelStore.ts:183-187, 217-223; ModelCatalogue.tsx:384-385, 398-401).
- Web recommended: curated ids from the registry first, then one model per family ranked by the router order, capped at 4, excluding shown favourites (packages/ai/routing/src/model-picker.ts:312-334).
- Mobile favourites and recents: persisted in MMKV; recents capped at 5 (store.ts:121-123); favourites toggled by long press; Cloud favourites synced to the account preferences (useFavouritesSync.ts:40-67; store.ts:240-257).
- Mobile recents list only on-device models (ModelPickerSheet.tsx:396-404).
- Chrome recommended list built from the shared short-list function (managedModelPicker.ts:199-247).

**Incomplete**

- Stored favourites have no cap; only the short list is capped at 3 (model-picker.ts:363-364) [inferred from the missing cap in use-model-favourites.ts:110-127].
- Web recents are not account-synced (browser storage only) [inferred from modelStore.ts:217-223].
- The brief item for VS Code favourites says missing; the draft claim that the brief marks it done is wrong. No favourites code was found in apps/extension-vscode/src/features/model-picker.

**Present but disconnected or switched off**

- Chrome passes an empty favourites list to the shared builder, so Chrome favourites are switched off (managedModelPicker.ts:154, 214).

**Not available**

- Favourites and recents on CLI (no match for favourite or recent models in apps/cli/src beyond provider fetch code).
- Favourites and recents on VS Code.
- Recents on Chrome.
- Recommended on Mobile and CLI (brief S15.07 lists them missing or absent).

## 4. Required behaviour

**Established requirements**

- The user can mark models as favourites and see them together at the top. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.05)
- The selector lists the models the user used most recently. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.06)
- The selector highlights a short list of recommended models. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S15.07)
- Recent and Favorites stay above the provider rows on Mobile. (source: doc: docs/decisions/2026-11-12-founder-decisions.md (D-2026-11-12-05))
- Favourites are shared between surfaces through the account preference. (source: packages/contracts/types/src/model-favourites.ts:1-2 and apps/mobile/src/features/model-picker/useFavouritesSync.ts:40-67)

**Acceptance criteria**

1. On Web, starring a model adds it to the Favourites rail and the short-list Favourites section; reload keeps it.
2. If the favourites save request fails, the star reverts and the toast appears.
3. Starring four models shows three in the short list and all four in the Favourites rail.
4. Picking six different models leaves five in the Recent rail, newest first.
5. On Mobile, a favourite made in Cloud mode appears on another surface after a sync.
6. On Mobile in Local mode, a favourite never leaves the device.
7. Recommended never repeats a model shown under Favourites.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every surface with a picker should offer favourites; CLI, VS Code and Chrome do not [inferred from S15.05 and the parity requirement in doc: AGENTS.md section 10].
- Recents should follow the account like favourites do [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add favourites to Chrome by passing the account list instead of an empty list.
- [proposed] Add a /model favourites toggle in the CLI.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useModelFavourites | `apps/web/features/chat/lib/use-model-favourites.ts` | Loads, toggles and saves favourites; reverts on failure. |
| endpoint | PUT and GET /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Stores the model-picker namespace in public.user_settings. |
| table | user_settings | `apps/web/app/api/settings/preferences/route.ts` | Row per user with a settings JSON document (queries at lines 68-125). |
| config | MODEL_PICKER_PREFERENCES_NAMESPACE and FAVOURITE_MODEL_IDS_KEY | `packages/contracts/types/src/model-favourites.ts` | Shared names of the namespace and key. |
| store | useChatModelStore (recents) | `packages/ui/unified-chat/src/stores/modelStore.ts` | recentModelIds, capped at 5, persisted as chat-model-store. |
| service | buildModelPickerShortList | `packages/ai/routing/src/model-picker.ts` | Recommended and Favourites limits and ranking. |
| component | ModelCatalogue rails and star | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Favourites and Recent rails and the star toggle. |
| component | ComposerFooter short list sections | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Renders Recommended and Favourites; records recents on commit (lines 1141-1168, 1693-1715). |
| store | Mobile useModelStore | `apps/mobile/src/features/model-picker/store.ts` | favorites, favoriteChanges, recentModels, toggleFavorite. |
| service | startFavouritesSync | `apps/mobile/src/features/model-picker/useFavouritesSync.ts` | Merges device and account favourites in Cloud mode. |
| component | Mobile ModelRow long press | `apps/mobile/src/features/model-picker/components/ModelRow.tsx` | Long press toggles favourite; star icon shows state. |
| component | Mobile ModelPickerSheet sections | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | Recent and Favorites groups (lines 396-415, 923-929). |
| service | Chrome buildManagedModelPickerMenu | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | Recommended list; favourites empty (lines 199-247). |
| test | useModelFavourites test | `apps/web/features/chat/lib/useModelFavourites.test.tsx` | Cache isolation, save and revert. |
| test | model-favourites-sync test | `apps/mobile/__tests__/model-favourites-sync.test.ts` | Mobile device and account favourite sync cases. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web hook reads the device copy of favourites at once, then fetches the account copy with GET /api/settings/preferences?namespace=model-picker. | device and our servers | apps/web/features/chat/lib/use-model-favourites.ts:62-83, 96-108 |
| A star toggle updates state and the device copy immediately. | device | use-model-favourites.ts:110-118 |
| The new list is saved with PUT /api/settings/preferences and a CSRF token; on failure the old list returns and a toast shows. | device and our servers | use-model-favourites.ts:31-47, 119-124 |
| The server merges the namespace into public.user_settings.settings. | our servers | apps/web/app/api/settings/preferences/route.ts:68-125 |
| Choosing a model records it in recentModelIds, up to 5. | device | ComposerFooter.tsx:1141-1146; packages/ui/unified-chat/src/stores/modelStore.ts:183-187 |
| Mobile toggles in the MMKV store; in Cloud mode with a signed-in account it records a change and pushes it to account preferences. | device and our servers | apps/mobile/src/features/model-picker/store.ts:240-257; useFavouritesSync.ts:62-67 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Favourite model ids (Web) | Browser key agi-model-picker-favourites and server table user_settings, namespace model-picker, key favouriteModelIds | Yes across Web devices when signed in; Mobile Cloud favourites use the same namespace | Kept until the person removes them; no deletion path read |
| Recent model ids (Web) | Browser key chat-model-store | No | Until browser data is cleared |
| Favourites and recents (Mobile) | MMKV key model-store | Favourites of cloud models only, in Cloud mode; recents no; on-device favourites never sent (test apps/mobile/__tests__/model-favourites-sync.test.ts by title) | Device data until app data is cleared |

**Models and providers.** Lists hold model ids only. Mobile ids for on-device models are filtered out of any account sync (useFavouritesSync.ts:78-83). Recommended ids come from the registry through listPickerRecommendedModelIds (packages/ai/routing/src/model-picker.ts:312).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Favourites work signed out on Web with the device copy; the account copy needs sign-in (the PUT fails otherwise and the star reverts) [inferred from use-model-favourites.ts:31-47]. |
| Permissions | Saving uses a CSRF token and same-origin cookies (use-model-favourites.ts:33-37). |
| Subscription | Web short-list Recommended and Favourites render only for paid plans (ComposerFooter.tsx:1693, 1705). A locked model can still be starred in the catalogue (ModelCatalogue.tsx:585-600). |
| Limits and metering | 3 favourites and 4 recommended rows in the short list (model-picker.ts:26-27); 5 recents (modelStore.ts:185; store.ts:121-123). The preference route is rate limited (route.ts imports withRateLimit). |
| Feature flags | none found in the code. |
| Model compatibility | Mobile drops favourites that are no longer selectable for the plan or mode (store.ts:363-364). |
| Provider restrictions | none found in the code. |
| Local mode | Mobile: on-device favourites stay on the device and nothing is sent in Local mode (test apps/mobile/__tests__/model-favourites-sync.test.ts by title; useFavouritesSync.ts:62-67). Web Desktop: local models cannot be starred in the code read; the local section has no star (ComposerFooter.tsx:529-620) [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Save failure (Web) | Reverts the toggle and toasts. | use-model-favourites.ts:119-124 |
| Slow account read arrives after an edit | Ignored, the local edit wins. | use-model-favourites.ts:88, 102 |
| Account switch | invalidateModelFavouritesCache drops the previous account's promise. | use-model-favourites.ts:57-60; test useModelFavourites.test.tsx |
| No favourites or recents yet | Web rails show 0 counts and an empty list; short-list sections are omitted. Mobile omits empty groups. | ModelCatalogue.tsx:437-439; ComposerFooter.tsx:1705; ModelPickerSheet.tsx:115-118 |
| Offline (Mobile) | Keeps an unsaved star and retries on the next Cloud sync. | test apps/mobile/__tests__/model-favourites-sync.test.ts by title |
| Retired model in favourites | Not handled on Web in the code read; Mobile filters unselectable ids. | store.ts:363-364 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/lib/useModelFavourites.test.tsx`: Per-account cache, edits that beat a slow read, revert and message on failed save.
- `apps/mobile/__tests__/model-favourites-sync.test.ts`: Local mode sends nothing, first Cloud sync merge, stars from another surface, failed save kept for later, account isolation.
- `packages/ai/routing/src/__tests__/model-picker.test.ts`: Recommended rows lead with catalogue flags, no model in both Recommended and Favourites, Auto excluded.
- `apps/mobile/src/features/model-picker/__tests__/ModelPickerSearch.test.tsx`: Recent matches in search results.
- `apps/extension/__tests__/managed-model-picker.test.ts`: Recommended recommendations and pinning the selected model outside them.

**Test scenarios**

- **Star and persist (Web)**
  1. Sign in on a paid plan.
  2. Open All models and star two models.
  3. Reload and open the picker.
  - Expected: Both appear under Favourites; the Favourites rail shows count 2.
- **Failed save**
  1. Block PUT /api/settings/preferences.
  2. Press a star.
  - Expected: Star reverts and the toast 'Your favourite models could not be saved. Try again.' appears.
- **Recent cap**
  1. Pick six different models in turn.
  2. Open the Recent rail.
  - Expected: Five rows, latest first.
- **Cross-device favourites (Mobile to Web)**
  1. On Mobile in Cloud mode, long-press a cloud model.
  2. Wait for sync, open the Web picker with the same account.
  - Expected: Model is under Favourites on Web.
- **Local favourite stays on device (Mobile)**
  1. In Local mode, favourite an on-device model.
  2. Check network requests.
  - Expected: No preferences request is sent.

**Where to look when it fails**

- Web network: PUT /api/settings/preferences status and body.
- Browser storage keys agi-model-picker-favourites and chat-model-store.
- Mobile: favoriteChanges and favoritesSyncedAccountId in the model-store state.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/015-model-selector-interface.md](../../70-qa/test-plans/web/015-model-selector-interface.md)
- Desktop: [70-qa/test-plans/desktop/015-model-selector-interface.md](../../70-qa/test-plans/desktop/015-model-selector-interface.md)
- Mobile: [70-qa/test-plans/mobile/015-model-selector-interface.md](../../70-qa/test-plans/mobile/015-model-selector-interface.md)
- Chrome: [70-qa/test-plans/chrome/015-model-selector-interface.md](../../70-qa/test-plans/chrome/015-model-selector-interface.md)

## 10. Gaps and dependencies

- **CLI, VS Code and Chrome have no favourites, and CLI, VS Code and Chrome have no recents.** Affects: CLI, VS Code, Chrome. Evidence: managedModelPicker.ts:154, 214 (empty favourites); no favourite or recent code in apps/cli/src or apps/extension-vscode/src/features/model-picker. Work needed: Build favourites on each surface from the shared account namespace.
- **Web recents are device-only while favourites sync.** Affects: Web and Desktop users on several devices. Evidence: modelStore.ts:217-223. Work needed: Decide whether recents should sync; if so add a preference key.
- **Mobile recents list on-device models only.** Affects: Mobile Cloud users. Evidence: ModelPickerSheet.tsx:396-404. Work needed: Confirm that this is intended by decision D-2026-11-12-05, or list cloud recents.
- **Local models on Web and Desktop have no star.** Affects: Desktop users with local models. Evidence: ComposerFooter.tsx:529-620 (no toggle). Work needed: Decide if local models can be favourites; ids are not in the catalogue.
- **The three-favourite short-list cap hides the rest from the quick list.** Affects: Web and Desktop heavy users. Evidence: model-picker.ts:363-364 (favouritesOverflow is computed). Work needed: Show an 'N more' hint using favouritesOverflow.
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-model-catalog-and-routing
- SYS-sync-and-continuity
- SYS-data-model-and-migrations
- SYS-authentication-and-identity
- F015-02
- F015-05
- api:PUT /api/settings/preferences
- api:GET /api/settings/preferences
- table:user_settings

## Unknown

- Whether Desktop (Electron) uses the same browser storage as Web for favourites and recents (it loads the hosted web app, doc: AGENTS.md section 5).
- What happens on Web when a favourite model is retired.
- Whether the Web Recommended list on the free plan is intentionally hidden or only an effect of the paid-plan gate.
- Whether VS Code has any favourites setting outside the model-picker folder.
