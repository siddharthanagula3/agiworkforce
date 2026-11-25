---
id: "F084-02"
type: "feature"
title: "Accent colour"
aliases: ["Accent colour", "Accent Color", "accentColor", "AGI amber (web default)", "Neutral (mobile default)", "S84.04"]
area: "84 General and appearance settings"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S84.04"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "F084-01", "SYS-shared-ui-and-design", "SYS-sync-and-continuity", "SYS-api-and-contracts", "table:user_settings", "store:agiworkforce-web-settings", "api:GET /api/settings/sync", "mode:local", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F084-02 Accent colour

Lets a person pick the colour used on selected controls and highlights. Web and Desktop offer five colours, Mobile offers ten. Web and Mobile Cloud mode share the choice through the account for the colours both know. CLI, VS Code and Chrome have no accent setting.

Area: [84. General and appearance settings](README.md). Requirement items: [S84.04](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8404).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Recolours the highlight colour of the interface. Web and Desktop set one attribute on the page root and the style sheet does the rest. Mobile replaces its main highlight colour at run time.

**Why it exists.** Personal colour is a common appearance control in the leading chat apps, and the product requirement lists Accent colour under Appearance (doc: docs/product/requirements.md section 16.1).

**Who uses it.** People on Web, Desktop and Mobile who want a colour other than the default.

**Problems it solves**

- Highlight colour that clashes with taste or with a theme.
- Having to set the same colour twice on two devices (shared through the account where names match).

**Use cases**

- Pick Violet on Web; the buttons and highlights turn violet.
- Pick Lime on Mobile in Cloud mode; Local mode keeps Neutral.
- Return to AGI amber to reset to the brand colour.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Appearance, row 'Accent colour' with round swatches (apps/web/features/settings/sections/AppearanceSection.tsx:87-114).
- Mobile: Settings, group 'Device', row 'Accent Color', screen 'Accent Color' (apps/mobile/src/features/settings/index.tsx:678-684; apps/mobile/src/features/settings/accent-color/index.tsx:39).
- CLI, VS Code, Chrome: none.

**Before you start**

- None. Account sync needs a sign-in (Web) or Cloud mode (Mobile).

**Screens and controls**

- Web: five round swatches, each with a tooltip and the label '<name> accent', a check on the active one, a 44 px touch area on touch screens (AppearanceSection.tsx:94-110). Names: AGI amber, Green, Blue, Violet, Rose (apps/web/shared/stores/web-settings-store.ts:13-19).
- Mobile: a list of ten rows with a swatch circle, name and check: Neutral, Blue, Cyan, Green, Lime, Yellow, Orange, Rose, Magenta, Violet (accent-color/index.tsx:13-24, 46-81). Intro text: 'Colors selected controls and highlights. Neutral is the default.' (accent-color/index.tsx:42).

**Journey**

1. Open the settings screen.
2. Press a swatch (Web) or tap a row (Mobile).
3. The interface recolours at once.
4. The value is saved on the device and, when signed in, sent to the account.

**What the person sees and gets**

- The chosen swatch or row shows a check and a pressed or selected state.
- Mobile settings root shows the current accent name as the row value (apps/mobile/src/features/settings/index.tsx:681).
- Web shows the sync alert with Retry if the account save fails (SettingsPreferenceRow.tsx:8-26).

**Settings**

- Web: accentColor in the web settings store, persisted under 'agiworkforce-web-settings' (web-settings-store.ts:86, 137, 210).
- Account: appearance.accentColor with web 'default' written as 'amber' (appearance-namespace.ts:56-62).
- Mobile: accentColor in the Local and Cloud settings stores, default 'neutral' (localSettingsStore.ts:76; cloudSettingsStore.ts:72).
- Related: Contrast, Motion and Chat font rows on Web (AppearanceSection.tsx:75-78).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: AppearancePreferences sets or clears data-accent on the page root (apps/web/shared/components/AppearancePreferences.tsx:33-37). The style sheet maps each value to colour variables (apps/web/app/globals.css:725-760).
- Web: accent is a field of the account appearance namespace and is saved with the rest (appearance-namespace.ts:109-127; CloudSettingsSync.tsx:66, 259-298).
- Web: a colour name web does not know, such as mobile's neutral, is skipped when the account value is loaded, so Web keeps its own colour (appearance-namespace.ts:53-55, 137-138).
- Mobile: each mode has its own accent; the theme hook replaces the highlight colours with the chosen swatch for the current light or dark scheme (apps/mobile/src/ui/theme/useTheme.ts:20-34, 52-55). Neutral and high-contrast mode leave the base colours.
- Mobile: Cloud accent is part of the settings sync (apps/mobile/services/cloudSettingsMapping.ts:130-137, 180-188).
- Mobile: an unknown value becomes neutral (apps/mobile/src/ui/theme/tokens.ts:28-32).

**Incomplete**

- The vocabularies differ: Web has AGI amber and no Neutral, Mobile has Neutral and no amber. Web 'amber' reaches Mobile as an unknown token and becomes neutral (tokens.ts:28-32; keys in packages/ui/design-tokens/src/index.ts:939-953) [inferred]. Cyan, Lime, Yellow, Orange and Magenta from Mobile are ignored on Web (appearance-namespace.ts:64-70).
- Web 'Green', 'Blue', 'Violet', 'Rose' match Mobile names and travel both ways (appearance-namespace.ts:56-70).

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI: no accent setting found in the CLI config keys listed at apps/cli/src/config.rs:1619.
- VS Code: no accent setting found in apps/extension-vscode/package.json.
- Chrome: no accent row in the Options Appearance section, which holds only Theme (apps/extension/src/features/options/appearance-section.ts:36-70).

## 4. Required behaviour

**Established requirements**

- Where offered, the user can pick an accent colour that recolours the interface. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.04)
- Accent colour is on the Appearance page. (source: docs/product/requirements.md section 16.1)
- Web and Mobile share one account vocabulary; an unknown name must not repaint the other surface. (source: apps/web/features/settings/lib/appearance-namespace.ts:53-55)

**Acceptance criteria**

1. On Web each of the five swatches changes the highlight colour and sets data-accent on <html> (none for AGI amber).
2. Reload keeps the colour.
3. On Mobile each of the ten rows changes the highlight colour in light and dark.
4. Picking Green on Web, then signing in on Mobile Cloud mode, shows Green.
5. Picking Lime on Mobile does not change Web.
6. In Local mode on Mobile, the accent does not reach the account.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The two apps should agree on one list or document the difference [inferred from the mismatch in vocabularies].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add 'amber' to the Mobile vocabulary or map it to a named Mobile accent so the default round-trips.
- [proposed] Offer accent in the CLI with ANSI-safe colours if wanted.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AccentColorRow | `apps/web/features/settings/sections/AppearanceSection.tsx` | Web swatch row |
| store | useSettingsStore (accentColor, ACCENT_COLORS) | `apps/web/shared/stores/web-settings-store.ts` | Holds the five Web colours and persists them in localStorage |
| component | AppearancePreferences | `apps/web/shared/components/AppearancePreferences.tsx` | Stamps data-accent on <html> |
| other | globals.css accent rules | `apps/web/app/globals.css` | Maps data-accent values to colour variables (lines 725-760) |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Reads and writes the account value |
| service | appearance-namespace | `apps/web/features/settings/lib/appearance-namespace.ts` | Maps default to amber and ignores unknown names |
| component | AppRuntimeMounts | `apps/web/app/AppRuntimeMounts.tsx` | Mounts AppearancePreferences and CloudSettingsSync in the app (lines 18-20) |
| component | SettingsRuntimeProviders | `apps/web/app/settings/SettingsRuntimeProviders.tsx` | Mounts the same two on the settings route |
| screen | AccentColorScreen | `apps/mobile/src/features/settings/accent-color/index.tsx` | Mobile accent list |
| hook | useTheme | `apps/mobile/src/ui/theme/useTheme.ts` | Applies the accent to the colour set |
| config | accentTokenFrom / AccentToken | `apps/mobile/src/ui/theme/tokens.ts` | The ten Mobile tokens; unknown becomes neutral |
| config | agiMobileAccentSwatches | `packages/ui/design-tokens/src/index.ts` | Light and dark colour for each Mobile accent |
| store | localSettingsStore and cloudSettingsStore | `apps/mobile/stores/settings/localSettingsStore.ts` | Per-mode accentColor; Cloud store at apps/mobile/stores/settings/cloudSettingsStore.ts |
| service | cloudSettingsMapping | `apps/mobile/services/cloudSettingsMapping.ts` | Maps accent to and from the account |
| service | cloudSyncEngine | `apps/mobile/services/cloudSyncEngine.ts` | Pushes and pulls settings (lines 905-972) |
| endpoint | api:GET/POST /api/settings/sync | `apps/web/app/api/settings/sync/route.ts` | Cloud-safe namespaces including 'appearance' (lines 14-25) |
| endpoint | api:PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Web write path |
| table | public.user_settings | `apps/web/app/api/settings/preferences/route.ts` | Where the appearance JSON lives |
| screen | Settings root rows | `apps/mobile/src/features/settings/index.tsx` | Row 'Accent Color' under 'Device' (lines 678-684) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses a swatch; the store value changes and the attribute on <html> is set or removed. | device | AppearanceSection.tsx:100; AppearancePreferences.tsx:33-37 |
| The style sheet recolours the interface from the attribute. | device | apps/web/app/globals.css:725-760 |
| Signed-in Web sends the changed key (amber, green, blue, violet or rose) to the account after 400 ms. | device and our servers | CloudSettingsSync.tsx:259-298; appearance-namespace.ts:56-62 |
| Mobile taps a row; the Local or Cloud store for the current mode is updated and the theme hook recolours. | device | accent-color/index.tsx:28-36, 51; useTheme.ts:20-34 |
| Mobile Cloud mode includes the accent in the settings push. | device and our servers | cloudSettingsMapping.ts:130-137; cloudSyncEngine.ts:913-925 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web accent | localStorage 'agiworkforce-web-settings' | Yes, to account namespace 'appearance' when signed in | Kept until changed or browser data cleared |
| Mobile accent | MMKV settings stores (Local and Cloud) | Cloud store only | Kept on device |
| Account accent | public.user_settings.settings.appearance.accentColor | Read by Web and Mobile | unknown deletion rule beyond account deletion |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not needed for the device value. Account sync needs sign-in (Web) or Cloud mode (Mobile). |
| Permissions | none found in the code. |
| Subscription | No plan limit seen on Web or Mobile; no entitlement check in the rows. |
| Limits and metering | Settings endpoints are rate limited (preferences/route.ts:136, 180). Nothing is metered. |
| Feature flags | none found in the code. |
| Model compatibility | Not related to any model. |
| Provider restrictions | none found in the code. |
| Local mode | Works in Local mode on Mobile with its own value and no account sync (accent-color/index.tsx:28-36). On Web and Desktop it works signed out. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown account value on Web | Ignored; Web keeps its colour. | appearance-namespace.ts:137-138 |
| Unknown stored value on Mobile | Becomes neutral. | apps/mobile/src/ui/theme/tokens.ts:28-32 |
| High contrast on Mobile (device setting) | The accent is not applied. | apps/mobile/src/ui/theme/useTheme.ts:34 |
| Account save fails | Alert with Retry; device keeps the colour. | SettingsPreferenceRow.tsx:8-26 |
| Touch screens | Swatches get a larger touch area. | AppearanceSection.tsx:93, 105 |
| Accessibility | Swatches carry aria-pressed and a label; Mobile rows carry selected state and 'Set accent color to X'. | AppearanceSection.tsx:102-104; accent-color/index.tsx:52-54 |
| Offline, retry, timeout, cancel | not handled in the code beyond the failed-save alert. | CloudSettingsSync.tsx:182-186 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/AppearanceSection.test.tsx`: Offers every registered accent, marks the active one, writes the choice to the store, keeps swatches round with a 44 px touch area, carries the swatch attribute.
- `apps/web/shared/components/AppearancePreferences.test.tsx`: No attribute for the default; data-accent stamped for green, blue, violet, rose; cleared on return.
- `apps/web/features/settings/lib/__tests__/appearance-namespace.test.ts`: AGI amber maps both ways; a phone value Web cannot render leaves Web alone; round trip of every Web value.
- `apps/mobile/__tests__/SettingsStore.test.tsx`: A settings store test file exists; accent cases not opened.

**Test scenarios**

- **Web swatch**
  1. Open Settings, Appearance.
  2. Press Violet.
  - Expected: Highlights turn violet and <html> has data-accent=violet; reload keeps it.
- **Return to default**
  1. Press AGI amber.
  - Expected: data-accent is removed and the brand colour returns.
- **Shared name across apps**
  1. On Web signed in, press Rose.
  2. On Mobile, sign in, switch to Cloud mode, wait for sync, open Accent Color.
  - Expected: Rose is selected on Mobile.
- **Name Web cannot show**
  1. On Mobile Cloud mode pick Lime and sync.
  2. Open Web signed in.
  - Expected: Web keeps its own colour and does not change.
- **Local versus Cloud on Mobile**
  1. In Local mode pick Blue.
  2. Switch to Cloud mode.
  - Expected: Cloud shows its own accent (Neutral by default).

**Where to look when it fails**

- Check the data-accent attribute on <html> in Web.
- Check appearance.accentColor in public.user_settings.
- Mobile: the sync engine functions pushSettings and applyCloudSettings (apps/mobile/services/cloudSyncEngine.ts:905, apps/mobile/services/cloudSettingsMapping.ts:180).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/084-general-and-appearance-settings.md](../../70-qa/test-plans/web/084-general-and-appearance-settings.md)
- Desktop: [70-qa/test-plans/desktop/084-general-and-appearance-settings.md](../../70-qa/test-plans/desktop/084-general-and-appearance-settings.md)
- Mobile: [70-qa/test-plans/mobile/084-general-and-appearance-settings.md](../../70-qa/test-plans/mobile/084-general-and-appearance-settings.md)

## 10. Gaps and dependencies

- **Web default 'amber' becomes Neutral on Mobile and Mobile's five extra colours are ignored on Web.** Affects: Web and Mobile users with both. Evidence: appearance-namespace.ts:53-70; tokens.ts:28-32. Work needed: Agree one list or map the default.
- **No accent on CLI, VS Code or Chrome.** Affects: CLI, VS Code, Chrome. Evidence: Absent from apps/cli/src/config.rs:1619 key list, apps/extension-vscode/package.json and appearance-section.ts. Work needed: Decide whether these surfaces need it ('where offered' in the brief) and record it.
- **Desktop (Electron) accent is the hosted page's; no desktop-specific check was made.** Affects: Desktop. Evidence: AGENTS.md section 5 (doc). Work needed: Verify in the running Desktop app.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- F084-01
- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- SYS-api-and-contracts
- table:user_settings
- store:agiworkforce-web-settings
- api:GET /api/settings/sync
- mode:local
- mode:cloud

## Unknown

- How the Desktop app behaves on first launch for accent (only the hosted page path was read).
- Whether Mobile Local mode accent is ever offered to the account (code shows Local is device only).
- Retention of the account value after account deletion.
