---
id: "F006-06"
type: "feature"
title: "Buttons and icons"
aliases: ["Buttons and icons", "Button sizes and density", "Icon sizes and stroke", "icon grid", "Button.tsx", "createIcon"]
area: "6 Visual foundations and spacing conventions"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S6.25", "S6.26"]
depends_on: ["SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "mode:local", "F006-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F006-06 Buttons and icons

Web buttons come from one component in fixed sizes, with a 2px focus ring. Web icons come from one family on a 24px grid with a 2px stroke, but many screens still import another icon set. Mobile has its own button sizes and uses lucide icons. The CLI has none.

Area: [6. Visual foundations and spacing conventions](README.md). Requirement items: [S6.25](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s625), [S6.26](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s626).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Web: one Button with variants default, destructive, outline, secondary, ghost, link and sizes default h-10, xs h-7, sm h-9, lg h-11, icon h-10 w-10 (packages/ui/ui/src/primitives/Button.tsx:12-28). Icons: createIcon draws every glyph on a 24px grid, stroke 2, round caps and joins (packages/ui/icons/src/grid.ts:1-13; CreateIcon.tsx:11-40).

**Why it exists.** So every screen's buttons and icons look and feel alike, with large enough targets and a visible focus ring.

**Who uses it.** Everyone who clicks; engineers choosing a button size or icon.

**Problems it solves**

- Mixed button heights
- Icons with different weights
- Focus not visible on buttons

**Use cases**

- Click Send or Cancel in a dialog.
- Use an icon-only button in a toolbar.
- Tab through buttons and see the focus ring.
- Tap a mobile button of size md.

## 2. User experience

**Where to find it**

- Web and desktop: all screens built from @agiworkforce/ui Button and @agiworkforce/icons.
- Mobile: apps/mobile/components/ui/button.tsx.
- VS Code: .icon-btn and codicons in the sidebar (webviewContent.ts:369-376).
- Chrome: side panel and Options, with its own icon set (apps/extension/src/assets/icons.ts).
- CLI: not applicable (no buttons or icons; brief lists none).

**Before you start**

- None.

**Screens and controls**

- Button sizes and variants; icon-only buttons need an accessible name (Button.test.tsx:22-31).

**Journey**

1. Tab or click a button.
2. See hover and active states (active:scale 0.98).
3. Disabled buttons ignore the pointer and dim.

**What the person sees and gets**

- 2px focus ring with offset on keyboard focus (Button.tsx:9).
- Loading buttons set aria-busy and a hidden message (Button.test.tsx:14-20).

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web Button: cva with the variants and sizes above; focus-visible ring 2px; disabled: no pointer events and opacity 50 (Button.tsx:9-28).
- Web icon contract: size 24, viewBox 0 0 24 24, stroke currentColor, strokeWidth 2, round cap and join; absoluteStrokeWidth scales stroke with size (grid.ts:1-13; CreateIcon.tsx:11-18); every glyph is tested against the grid and straight-segment rule (IconContract.test.tsx:115-196).
- Mobile Button: sizes sm (36 min height), md (44), lg (52), touch slop up to 44, haptic tap if enabled (apps/mobile/components/ui/button.tsx:21-45).
- VS Code: --control-sm 24, md 28 and lg 32 (webviewContent.ts:225-227), icon buttons at control-md (:369-376); codicons loaded (:178 region).
- Chrome: icons in one file with stroke-width 1.75 (apps/extension/src/assets/icons.ts:3); control sizes 30, 32, 34 and 44 (side_panel.css:35-38).

**Incomplete**

- Web uses two icon families: lucide-react is imported in 273 files and @agiworkforce/icons in 116 files across apps/web and packages/ui (counted by search). The Appearance page itself imports lucide icons (AppearanceSection.tsx:4).
- Mobile icons come from lucide-react-native in 677 files, not from a small shared set (counted by search).
- The web Appearance page builds its buttons from raw button elements instead of Button (AppearanceSection.tsx:49-70,98-112).
- Web, mobile, VS Code and Chrome use different size scales and names (Button.tsx vs button.tsx vs --control-*).

**Present but disconnected or switched off**

- none found

**Not available**

- Buttons and icons on CLI.

## 4. Required behaviour

**Established requirements**

- Icons come from one family with a fixed grid and stroke width, sized from a small set. (source: S6.25 (brief))
- Buttons come in a defined set of sizes and densities from one component. (source: S6.26 (brief))
- Interactive controls show distinct selected, focused, hovered, pressed and disabled states. (source: S6.34 (brief, related))

**Acceptance criteria**

1. Every web Button renders one of the five sizes.
2. Keyboard focus on a web button shows a 2px ring with a 2px offset.
3. Every glyph in @agiworkforce/icons renders with viewBox 0 0 24 24, stroke 2, and coordinates inside 3..21 (IconContract.test.tsx).
4. An icon-only button has an accessible name.
5. A mobile Button of size sm has a 44px touch area.
6. No new web screen imports lucide-react once the family is complete.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Using two icon families on web is a migration in progress [inferred from 116 versus 273 files and the IconContract note 'accepts the lucide prop surface'].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a lint rule that bans lucide-react in web and packages/ui once the shared family covers the glyphs used.
- [proposed] Convert the Appearance page buttons to Button.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Button | `packages/ui/ui/src/primitives/Button.tsx` | cva button with variants and sizes (:8-28) |
| config | icon grid | `packages/ui/icons/src/grid.ts` | ICON_GRID and ICON_GEOMETRY |
| component | createIcon | `packages/ui/icons/src/CreateIcon.tsx` | Draws every glyph on the grid; stroke scaling |
| config | icon glyph modules | `packages/ui/icons/src/glyphs` | Navigation, Actions, RowActions, Indicators, Composer, Media, Files, Account, Knowledge |
| config | icon index | `packages/ui/icons/src/index.ts` | Public exports |
| component | message action row sizes | `apps/web/features/chat/components/messages/messageActionRow.ts` | Icon 4.5 units and button sizes |
| component | mobile Button | apps/mobile/components/ui/button.tsx (not found) | sm, md, lg sizes and touch slop |
| component | mobile PressableBox | `apps/mobile/components/ui/PressableBox.tsx` | Pressable base used by settings rows |
| component | VS Code icon buttons | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | .icon-btn and control sizes (:369-376) |
| component | Chrome icons | `apps/extension/src/assets/icons.ts` | Inline SVG icons with stroke 1.75 |
| config | Chrome control sizes | `apps/extension/src/side_panel.css` | --control-* tokens |
| component | AppearanceSection | `apps/web/features/settings/sections/AppearanceSection.tsx` | Example screen using lucide icons and raw buttons |
| test | IconContract test | `packages/ui/icons/src/__tests__/IconContract.test.tsx` | Grid, stroke, coordinate and name-uniqueness checks |
| test | Button test | `packages/ui/ui/src/primitives/__tests__/Button.test.tsx` | Loading, accessible name, text detection |
| test | Chrome brand icons test | `apps/extension/__tests__/brand-icons.test.ts` | File exists; contents not read |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A screen renders Button with a variant and size; cva picks the classes. | device | packages/ui/ui/src/primitives/Button.tsx:8-28 |
| An icon component calls createIcon, which sets the svg attributes from ICON_GRID. | device | packages/ui/icons/src/CreateIcon.tsx:26-40 |
| Keyboard focus applies the ring classes. | device | Button.tsx:9 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data created | none | No | Not applicable |

**Models and providers.** None.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code |
| Local mode | Identical in Local mode; assets ship with the app. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Disabled button | No pointer events and 50 percent opacity | Button.tsx:9 |
| Loading button | aria-busy, disabled, hidden status message | Button.test.tsx:14-20 |
| Icon-only button without a name | Falls back to a visually hidden label | Button.test.tsx:31 |
| Small mobile button | Hit area extended to 44 | apps/mobile/components/ui/button.tsx:32-35 |
| Forced colours | Buttons get a system border | apps/web/app/globals.css:1336 region |
| Error, offline | not handled in the code for these primitives | none found in the files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/icons/src/__tests__/IconContract.test.tsx`: Each glyph: displayName, shared svg contract, no per-element fill, straight segments, coordinates inside the grid, lucide-like props, absolute stroke scaling; unique names
- `packages/ui/ui/src/primitives/__tests__/Button.test.tsx`: Plain render, loading state, accessible names for icon-only buttons
- `apps/extension/__tests__/brand-icons.test.ts`: Chrome brand icons (contents not read)

**Test scenarios**

- **Sizes**
  1. Render each Button size in a story or page
  2. Measure heights
  - Expected: 40, 28, 36, 44 and 40 by 40
- **Focus ring**
  1. Tab to a button on web
  - Expected: 2px ring with offset visible
- **Icon contract**
  1. Run the icons package tests
  - Expected: All glyph checks pass (to be run)
- **Icon family count**
  1. Search apps/web and packages/ui for lucide-react imports
  - Expected: Today many; target zero once migrated
- **Mobile target**
  1. Render Button sm on a phone
  2. Measure the touch area
  - Expected: 44px

**Where to look when it fails**

- Search imports of lucide-react and @agiworkforce/icons.
- IconContract test failures name the glyph.
- Devtools computed height of a button.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md)
- Desktop: [70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md)
- Mobile: [70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md)
- VS Code: [70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md)
- Chrome: [70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md)

## 10. Gaps and dependencies

- **Two icon families on web, a third on mobile and a fourth in Chrome** Affects: All apps. Evidence: 273 lucide-react files versus 116 @agiworkforce/icons files; mobile 677 lucide-react-native files; Chrome icons.ts uses stroke 1.75 (icons.ts:3). Work needed: Plan migration and add a lint guard; align Chrome stroke
- **Button sizes differ in name and scale per app** Affects: Mobile, VS Code, Chrome. Evidence: Button.tsx:23-27 vs button.tsx:21-25 vs --control-*. Work needed: Document the mapping or share a token set
- **Appearance page uses raw buttons and a non-shared icon family** Affects: Web, desktop. Evidence: AppearanceSection.tsx:4,49-70. Work needed: Use Button and the shared icons
- **Disabled opacity 50 percent** Affects: Web, desktop. Evidence: Button.tsx:9. Work needed: Confirm acceptable for disabled controls

**Depends on**

- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- mode:local
- F006-05

## Unknown

- Whether any lint rule or guard stops new lucide-react imports (I searched eslint.config.mjs for lucide and found nothing in the first lines read).
- Chrome's icon set versus the shared grid beyond stroke 1.75.
- Whether mobile has a shared icon size scale; I did not open its icon usages.
- Whether the web hover, active and disabled states meet S6.34 in every variant; only read Button.tsx.
- Whether any verification has been run: no file records a run.
