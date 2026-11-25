---
id: "F006-07"
type: "feature"
title: "Corners, shadows and stacking"
aliases: ["Corners, shadows and stacking", "Radius ladder", "Corner scale", "Elevation scale", "Shadow scale", "Z-index ladder", "Stacking order", "S6.27", "S6.28", "S6.29", "corner-* tokens", "elevation-* tokens", "--z-* tokens"]
area: "6 Visual foundations and spacing conventions"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S6.27", "S6.28", "S6.29"]
depends_on: ["SYS-shared-ui-and-design", "file:packages/ui/design-tokens/src/foundation.css", "file:packages/ui/design-tokens/src/tailwind.css", "file:apps/mobile/src/ui/theme/tokens.ts", "surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome"]
basis: "code inspection"
second_reader: "10 of 12 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F006-07 Corners, shadows and stacking

One shared set of named corner sizes, four named shadow levels (different values for light and dark) and one named stacking ladder, so dialogs, menus, toasts and tooltips sit in a fixed order and look consistent. Web and Desktop share the ladder. Mobile, VS Code and Chrome keep their own smaller copies.

Area: [6. Visual foundations and spacing conventions](README.md). Requirement items: [S6.27](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s627), [S6.28](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s628), [S6.29](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s629).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** It gives every surface named values for how round a corner is, how deep a shadow is, and which layer sits on top. Components pick a name such as corner-field, shadow-e3 or z-modal instead of a number. (packages/ui/design-tokens/src/foundation.css:270-279, 318-340, 358-361)

**Why it exists.** Without a shared ladder, each component invents its own number and layers collide (a menu hidden behind a dialog) or corners look uneven. The foundation file says the ladder exists so consumers never invent a numeric rung. (packages/ui/design-tokens/src/foundation.css:315-317)

**Who uses it.** Designers and engineers building UI on all apps that draw their own visuals (Web, Desktop, Mobile, VS Code, Chrome). End users never set it; they only see it. The CLI has no corners, shadows or layers.

**Problems it solves**

- Menus and popovers appearing behind dialogs.
- Corners and shadows that differ from screen to screen.
- Dark mode shadows that are too faint to see (dark theme has its own stronger shadow values). (foundation.css:524-527)
- Raw numeric z-index values creeping into components (a repo guard rejects them). (scripts/check-css-tokens.mjs:155-170)

**Use cases**

- A Dialog opens over the page at z-modal with the e4 shadow and large rounded corners. (packages/ui/ui/src/primitives/Dialog.tsx:28,115)
- A dropdown menu opens from inside a dialog and stays on top because the popover rung (350) is above the modal rung (300). (foundation.css:335-336; DropdownMenu.tsx:104)
- A mobile toast shows above screens at the notification layer. (apps/mobile/src/shared/components/Toast.tsx:181)
- A VS Code sidebar model menu opens on its own popover layer. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:222,1347)

## 2. User experience

**Where to find it**

- Web: seen on every dialog, menu, sheet and card. No setting.
- Desktop (Electron): same hosted web UI, so the same ladder. [inferred from AGENTS.md section 5: the public Desktop shows the hosted web app] (doc: AGENTS.md)
- Mobile: seen on cards, sheets, toasts, the app lock screen. No setting.
- VS Code: seen in the sidebar chat webview menus and popovers. No setting.
- Chrome: seen in the side panel menus, drawers and modals. No setting.
- CLI: not applicable; the brief lists no CLI entry for these items. (doc: knowledge-base/data/area-briefs/006-visual-foundations-and-spacing-conventions.md S6.27-S6.29)

**Before you start**

- None. Always on.

**Screens and controls**

- No control. Visible as rounded corners, soft shadows on dialogs and menus, and menus appearing above content.

**Journey**

1. Open a screen with a menu or dialog.
2. The overlay appears with rounded corners and a shadow.
3. A menu opened from a dialog shows above the dialog.
4. A toast or notification shows above everything except full-screen layers.

**What the person sees and gets**

- Visual only: corners, shadows and layer order.

**Settings**

- None. High contrast and theme settings change colours and borders, not the ladders. [inferred]

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop: ten radius rungs (corner-detail 2px, compact 4, control 6, field 8, menu 10, surface 12, panel 16, overlay 24, hero 32, pill 9999px). (foundation.css:270-279)
- Web: Tailwind radius names map onto the rungs (radius-xs to radius-pill). (packages/ui/design-tokens/src/tailwind.css:46-57)
- Web: four elevation levels, with separate light and dark values. (foundation.css:358-361, 524-527; tailwind.css:65-68)
- Web: one z-index ladder of 23 named rungs from behind-far (-2) to skip-link (10000); dropdown 50, modal 300, popover 350, tooltip 380, notification 400, fullscreen 9999. (foundation.css:318-340)
- Web: Dialog, AlertDialog and Sheet use z-modal; DropdownMenu content uses z-popover and shadow-e3/e2. (Dialog.tsx:28,115; AlertDialog.tsx:23,104; Sheet.tsx:26,36; DropdownMenu.tsx:104,137)
- Web: Tooltip uses z-tooltip (380) and Popover uses z-popover (350), so a tooltip sits above a popover, which sits above a dialog. (packages/ui/ui/src/primitives/Tooltip.tsx:25; packages/ui/ui/src/primitives/Popover.tsx:33)
- Web: the .dark block is the only theme switch for elevation; the radius and z ladders have no dark variants, so only shadows are theme-dependent on web. (foundation.css:433)
- Mobile: radii from the shared token package (sm to full), a 7-rung zIndex table (base 0, content 1, control 10, overlay 200, modal 300, notification 400, fullscreen 9999) and four elevation presets. (apps/mobile/src/ui/theme/tokens.ts:63-71, 117-125, 144-171)
- Mobile: the eight raw 'zIndex:' sites found in app code all use the zIndex table (no numeric literal). (grep over apps/mobile/src, app, components)
- VS Code: sidebar webview uses shared corner variables and defines its own z rungs content 1, dropdown 20, popover 30, overlay 50, sheet 60, and elevations 2 and 3 from the editor widget shadow. The sidebar model menu consumes them as named variables (var(--z-popover), --corner-field radius), not literals. (webviewContent.ts:215-224, 1347)
- Chrome: side panel defines its own z rungs dropdown 10, popover 20, sheet 30, drawer-backdrop 40, drawer 41, notice 50, modal 60, modal-raised 61 and uses shared corner and elevation variables. (apps/extension/src/side_panel.css:29-36; side_panel.ts:4321)
- Repo guard check-css-tokens rejects raw z-index in six portal overlay primitives (AlertDialog, Dialog, DropdownMenu, Popover, Select, Tooltip); check-web-ui-invariants flags arbitrary z-index utilities and CSS in web files. Mobile coverage is not shown at the cited lines. (scripts/check-css-tokens.mjs:155-170; scripts/check-web-ui-invariants.mjs:161-176)

**Incomplete**

- VS Code and Chrome do not use the web z ladder; each has a smaller private ladder with different numbers (VS Code popover 30, Chrome popover 20, web popover 350). (webviewContent.ts:220-224; side_panel.css:29-36; foundation.css:336)
- Chrome options page has a raw z-index: 20. (apps/extension/src/options.ts:1060)
- Mobile elevation presets are one fixed set (black shadow colour) and are not different per theme. (tokens.ts:144-171)

**Present but disconnected or switched off**

- Web DropdownMenu uses popover (350), not the dropdown rung (50). The z-dropdown rung is used by unified-chat components instead (SendPreview.tsx:98; AgentControl.tsx:48,114,227; ArtifactPanel.tsx:293, all under packages/ui/unified-chat/src/components/). (foundation.css:329; DropdownMenu.tsx:104)

**Not available**

- CLI: no corners, shadows or layers (terminal UI). Brief lists no CLI entry.

## 4. Required behaviour

**Established requirements**

- Corner radii come from one named radius ladder. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S6.27)
- Shadows come from a small named elevation scale per theme. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S6.28)
- Stacking order uses one named z-index ladder; components never invent numeric layers. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S6.29)
- Do not hardcode design values the repository already models; one design system across apps. (source: (doc: AGENTS.md sections 4 and 10))

**Acceptance criteria**

1. Every Web dialog, alert dialog and sheet sits on the modal layer and a menu opened inside it appears above it.
2. A tooltip appears above a popover, which appears above a dialog.
3. Changing a --corner-* value in foundation.css changes every component that uses the matching Tailwind radius name.
4. Light and dark themes show different shadow values for the same elevation name.
5. No component source file contains a raw numeric z-index in the guarded overlay primitives (check:css-tokens passes).
6. Mobile toasts show above screen content and below nothing except full-screen layers.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop (Electron) matches Web because it loads the hosted web app. [inferred]
- VS Code and Chrome may keep private ladders only because their stacking contexts are isolated webviews; no document states this. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build the VS Code and Chrome z ladders from the shared token names so numbers cannot drift.
- [proposed] Make mobile elevation theme-aware (darker shadow in dark mode) like the web scale.
- [proposed] Replace the raw z-index: 20 on the Chrome options page with a named rung.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | foundation.css radius, z and elevation tokens | `packages/ui/design-tokens/src/foundation.css` | Defines corner rungs (270-279), z ladder (318-340), light elevation (358-361) and dark elevation (524-527). |
| config | tailwind.css theme map | `packages/ui/design-tokens/src/tailwind.css` | Maps radius-*, shadow-e1..e4 and ease/duration names onto the tokens. |
| other | agiRadii / agiCornerCssVars / agiElevation | `packages/ui/design-tokens/src/index.ts` | TypeScript copies of radii and elevation used by mobile, VS Code and Chrome (lines 326-360, 543). |
| component | Dialog | `packages/ui/ui/src/primitives/Dialog.tsx` | z-modal layer, rounded-2xl, shadow-e4. |
| component | AlertDialog | `packages/ui/ui/src/primitives/AlertDialog.tsx` | z-modal layer, rounded-2xl, shadow-e4. |
| component | Sheet | `packages/ui/ui/src/primitives/Sheet.tsx` | z-modal layer, shadow-e3. |
| component | DropdownMenu | `packages/ui/ui/src/primitives/DropdownMenu.tsx` | z-popover layer, shadow-e3 and e2 for content and sub-content. |
| component | Tooltip | `packages/ui/ui/src/primitives/Tooltip.tsx` | z-tooltip layer (380) (line 25). |
| component | Popover | `packages/ui/ui/src/primitives/Popover.tsx` | z-popover layer (350) (line 33). |
| config | mobile tokens | `apps/mobile/src/ui/theme/tokens.ts` | radii (63), zIndex (117), elevation (144), cardRadius and sheetRadius (175-176). |
| component | Toast | `apps/mobile/src/shared/components/Toast.tsx` | Uses zIndex.notification. |
| component | AppLockOverlay | `apps/mobile/src/features/auth/components/AppLockOverlay.tsx` | Uses the fullscreen layer. |
| component | VS Code sidebar webview styles | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Private z ladder and elevation (215-224), uses shared corner variables. |
| component | Chrome side panel styles | `apps/extension/src/side_panel.css` | Private z ladder (29-36). |
| component | Chrome side panel script styles | `apps/extension/src/side_panel.ts` | Uses z and elevation variables inside injected CSS (2083, 2556, 4321). |
| component | Chrome options page | `apps/extension/src/options.ts` | Contains a raw z-index: 20 at line 1060. |
| command | check:css-tokens guard | `scripts/check-css-tokens.mjs` | Rejects raw z-index (z-N and zIndex:N patterns) in six portal overlay primitives (AlertDialog, Dialog, DropdownMenu, Popover, Select, Tooltip) and inline styles (155-170). |
| command | check:web-ui-invariants guard | `scripts/check-web-ui-invariants.mjs` | Flags arbitrary z-index utilities and CSS in web files (161-176). |
| component | unified-chat z-dropdown users | `packages/ui/unified-chat/src/components/SendPreview.tsx` | Uses the z-dropdown rung (line 98); AgentControl.tsx (48,114,227) and ArtifactPanel.tsx (293) also use it. |
| config | Desktop Tauri stylesheet | `apps/desktop/src/styles/globals.css` | Tauri build (internal) styles; separate from the hosted web app. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| At build time the design token CSS and TypeScript are compiled into each app's styles. | device | packages/ui/design-tokens/src/foundation.css; tailwind.css:1-80 (build-time activity; no server involved) [inferred] |
| A component renders with class names like z-[var(--z-modal)] and shadow-e4 that resolve to the token values. | device | packages/ui/ui/src/primitives/Dialog.tsx:28,115 |
| When the dark class is on the page, the dark elevation values replace the light ones. | device | foundation.css:433,524-527 |
| Mobile code reads the token objects directly and passes them to style props. | device | apps/mobile/src/ui/theme/tokens.ts:117-171 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Design tokens (static values) | Source files in the repository; shipped inside each app bundle | No sync; compiled into each app | Changed only by editing source and releasing |

**Models and providers.** No model or provider takes part. Nothing in this feature calls an AI model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code. Visuals do not need sign-in. |
| Permissions | None found in the code. |
| Subscription | None found in the code. No plan changes corners, shadows or layers. |
| Limits and metering | None found in the code. |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable; no model is involved. |
| Provider restrictions | Not applicable. |
| Local mode | Works the same in Local mode; everything is drawn on the device and needs no server. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Dark theme | Web uses stronger shadow values in the dark block. Mobile uses one preset set for both themes. | foundation.css:524-527; apps/mobile/src/ui/theme/tokens.ts:144-171 |
| Menu opened inside a dialog | Menu stays above because popover (350) is above modal (300). | foundation.css:335-336; DropdownMenu.tsx:104 |
| Windows forced colours | Chrome sets its panel shadow to transparent in forced colours. Web uses system colour keywords; web shadow detail not opened. | apps/extension/src/tokens.ts:36-60; apps/web/app/globals.css:1322 |
| Loading, empty, error, retry, offline | not handled in the code (static visual tokens; nothing to load). | packages/ui/design-tokens/src/foundation.css (no such states) |
| App differences | Web and Desktop share one ladder; Mobile, VS Code and Chrome each have their own numbers. | tokens.ts:117; webviewContent.ts:220-224; side_panel.css:29-36 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `scripts/check-css-tokens.mjs`: Guard script (not a test file) that rejects raw z-index in six portal overlay primitives (AlertDialog, Dialog, DropdownMenu, Popover, Select, Tooltip); web-wide coverage is in scripts/check-web-ui-invariants.mjs:161-176. Mobile coverage is not shown at the cited lines 155-170.
- `apps/web/shared/components/__tests__/theme-contrast.test.ts`: Listed by the brief for the radius item (line 1002 per brief); contents not opened, so what it asserts about radii is unknown.
- `apps/mobile/__tests__/theme-contrast.test.ts`: Text-on-surface readability for mobile colours; does not cover radii, shadows or layers.

**Test scenarios**

- **Menu above dialog**
  1. Open Web, open a dialog that has a dropdown (for example a settings dialog with a select menu).
  2. Open the dropdown.
  - Expected: The menu appears fully above the dialog and is not clipped.
- **Dark shadow**
  1. Open Web in light theme and open a dialog.
  2. Switch to dark theme and open the same dialog.
  - Expected: The dialog shadow is visible in both themes and uses a stronger value in dark.
- **Raw z-index guard**
  1. Add z-[999] to Dialog.tsx on a scratch branch.
  2. Run pnpm check:css-tokens.
  - Expected: The guard fails and names the file and line.
- **Mobile toast layer**
  1. On Mobile open a screen with a floating button.
  2. Trigger a toast.
  - Expected: The toast shows above the button.
- **Chrome modal over drawer**
  1. Open the Chrome side panel, open the drawer, then trigger a modal.
  - Expected: Modal (60) appears above drawer (41).

**Where to look when it fails**

- Run pnpm check:css-tokens and read the 'sets a raw z-index' message.
- Inspect the computed z-index of the overlay in browser devtools and compare with foundation.css:318-340.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md)
- Desktop: [70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md)
- Mobile: [70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md)
- VS Code: [70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md)
- Chrome: [70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md)

## 10. Gaps and dependencies

- **VS Code and Chrome use private z ladders with different numbers from the web ladder.** Affects: VS Code and Chrome extension users (low risk; separate webviews).. Evidence: webviewContent.ts:220-224; side_panel.css:29-36. Work needed: Decide whether to generate these from shared tokens, or document why they are separate.
- **Chrome options page has a raw z-index: 20.** Affects: Chrome extension options page.. Evidence: apps/extension/src/options.ts:1060. Work needed: Replace with a named rung and extend the guard to this file.
- **Mobile elevation is not different per theme.** Affects: Mobile users in dark theme.. Evidence: apps/mobile/src/ui/theme/tokens.ts:144-171. Work needed: Add a dark elevation set and choose by isDark.
- **CLI has no entry, and the brief marks no status.** Affects: CLI.. Evidence: (doc: area brief S6.27-S6.29). Work needed: Mark as not applicable in the brief.

**Depends on**

- SYS-shared-ui-and-design
- file:packages/ui/design-tokens/src/foundation.css
- file:packages/ui/design-tokens/src/tailwind.css
- file:apps/mobile/src/ui/theme/tokens.ts
- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome

## Unknown

- What apps/web/shared/components/__tests__/theme-contrast.test.ts asserts about radii (not opened).
- Whether Desktop Electron adds any layer rules of its own beyond the hosted web app.
- Why VS Code and Chrome keep separate z numbers (no document found).
- Chrome and VS Code radius usage beyond the shared corner variables (not fully checked).

## Second reader's check

A second reader checked 12 statements of this page against the code: 10 correct, 2 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3/10):** "Web DropdownMenu does not use z-dropdown; the rung exists but 'this primitive does not use it'; Unknown: whether any component uses z-dropdown" The code shows: DropdownMenu uses z-popover (correct), but z-dropdown is used by other web components, so the rung is not unused. (packages/ui/unified-chat/src/components/SendPreview.tsx:98; AgentControl.tsx:48,114,227; ArtifactPanel.tsx:293). **Corrected:** z-dropdown (50) is used by unified-chat components (SendPreview, AgentControl, ArtifactPanel); only the DropdownMenu primitive uses popover. Gap 'rung may be unused' and the Unknown entry should be dropped.
- **Partly wrong (section 3):** "Repo guard rejects raw z-index in portal overlay primitives and in mobile and web code (check-css-tokens.mjs:155-170)" The code shows: check-css-tokens.mjs:155-170 lists six PORTAL_OVERLAYS files plus patterns for z-N and zIndex:N; the cited lines show no mobile scope. Web-wide coverage is in check-web-ui-invariants.mjs:161-176. (scripts/check-css-tokens.mjs:155-170; scripts/check-web-ui-invariants.mjs:161-176). **Corrected:** check-css-tokens guards six portal overlay primitives (AlertDialog, Dialog, DropdownMenu, Popover, Select, Tooltip); web-ui-invariants flags arbitrary z-index in web files. Mobile coverage is not shown at the cited lines.

**Facts the page missed**

- Web tooltip is z-tooltip (380) and Popover is z-popover (350), which backs acceptance criterion 2 but is not cited: packages/ui/ui/src/primitives/Tooltip.tsx:25; Popover.tsx:33.
- Chrome side panel's model dropdown in VS Code uses z-popover 30 with shadow from --agi-ext elevation in Chrome; VS Code sidebar model menu uses var(--z-popover) with --corner-field radius (webviewContent.ts:1347 region), showing private rungs are consumed as named variables, not literals.
- The web .dark block (foundation.css:433) is the only theme switch for elevation; the radius and z ladders have no dark variants, so only shadows are theme-dependent on web.
