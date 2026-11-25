---
id: "F006-12"
type: "feature"
title: "Brand marks and app icons"
aliases: ["Brand marks and app icons", "AGI mark", "App icon", "Favicon", "Manifest icons", "Adaptive icon", "S6.35", "agi-symbol"]
area: "6 Visual foundations and spacing conventions"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "missing", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S6.35"]
depends_on: ["F006-08", "SYS-shared-ui-and-design", "file:apps/web/app/manifest.ts", "file:apps/desktop/electron-builder.yml", "file:apps/mobile/app.config.js", "file:apps/extension/manifest.json", "file:apps/extension-vscode/package.json", "surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "surface:cli"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F006-12 Brand marks and app icons

The AGI mark and app icons at the sizes each platform needs: web manifest and favicon, the macOS desktop icon, phone app and adaptive icons, VS Code marketplace and chat icons, and Chrome extension icons. The mark has a moving shine that stops under reduced motion. People cannot change it.

Area: [6. Visual foundations and spacing conventions](README.md). Requirement items: [S6.35](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s635).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** It ships the product mark and icons so each app is recognisable in its install surface and in-app. (apps/web/app/manifest.ts:14-30; apps/mobile/app.config.js:143-160,295-296)

**Why it exists.** Each platform requires icons at specific sizes; a missing size gives a blank or blurry icon in stores, home screens and the toolbar. [inferred]

**Who uses it.** Everyone sees it; release engineers must supply the right files.

**Problems it solves**

- Blurry or missing icons when installing the web app or extension.
- Inconsistent brand across apps.
- Motion in the mark bothering people who asked for less.

**Use cases**

- Install the web app to a home screen and get a 192/512 icon.
- Install the desktop app and see the app icon in the Dock.
- Install the VS Code extension and see the icon in the marketplace and activity bar.
- Pin the Chrome extension and see the 16 and 32 px toolbar icon.

## 2. User experience

**Where to find it**

- Web: sidebar wordmark with the AGI mark, browser tab icon, install-to-home-screen icon. (apps/web/shared/components/layout/SidebarBrandRow.tsx:6-17; apps/web/app/manifest.ts)
- Desktop: macOS Dock and app bundle icon. (apps/desktop/electron-builder.yml:70-71; electron/main.ts:2592-2593)
- Mobile: home screen icon, Android adaptive icon, notification icon, loading mark. (apps/mobile/app.config.js:143,159,295-296)
- VS Code: marketplace icon and chat icon. (apps/extension-vscode/package.json:84; src/__tests__/brandAssets.test.ts)
- Chrome: toolbar and extension page icons. (apps/extension/manifest.json:54-65)
- CLI: no brand asset found in the code I opened; the brief lists none.

**Before you start**

- None.

**Screens and controls**

- No control. The mark is shown, no setting to change it.

**Journey**

1. Install or open the app.
2. See the icon on the home screen, Dock, toolbar or marketplace.
3. Inside the app, see the mark in the sidebar or loading screen.

**What the person sees and gets**

- Visual only.

**Settings**

- Reduced motion hides the mark ribbon and stops the shine (web and mobile). (foundation.css:585-592; AgiMark.tsx:82-94)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web manifest uses PRODUCT_BRAND for name and lists 192, 512 and 180 pixel icons; background and theme colour near black. (apps/web/app/manifest.ts:4-30)
- Web files present: logo-192.png, logo-512.png, apple-touch-icon.png, app/icon.png, favicon.ico. (apps/web/public listing; apps/web/app listing)
- Web sidebar shows AgiMark with the wordmark. (SidebarBrandRow.tsx:5-17; shared/components/agi/SidebarWordmark.tsx:5,14)
- Shared mark has a moving shine, paused by data-paused, hidden ribbon and no animation under OS reduced motion. (foundation.css:540-592)
- Desktop mac build uses electron/resources/icon.icns; Dock icon set from assets/app-icon.png when present. (electron-builder.yml:70-71; main.ts:2592-2593)
- Mobile config sets icon, Android adaptive icon (background colour #070B14) and notification icon. (app.config.js:143,159,295-296 and notification plugin block)
- Mobile AgiMark component renders a symbol image and an animated ribbon, static under reduce motion. (apps/mobile/components/ui/AgiMark.tsx:20-94)
- VS Code package uses media/icon.png; test checks 128px icon, 32px chat icon, 512px symbol. (package.json:84; brandAssets.test.ts:17-40)
- Chrome manifest lists 16, 32, 48, 128 px icons; test checks each size. (manifest.json:54-65; __tests__/brand-icons.test.ts:29-36)

**Incomplete**

- Desktop packaging config has only a macOS section with an icon; Windows and Linux icon entries not found in electron-builder.yml. (electron-builder.yml top-level keys: directories, files, protocols, mac, dmg)
- Mobile app name in config is 'Mobile'; the visible name on devices is not verified here. (app.config.js:143-145)

**Present but disconnected or switched off**

- nothing found

**Not available**

- CLI: no brand icon or mark found in the code opened.
- VS Code and Chrome: no in-app mark animation control.

## 4. Required behaviour

**Established requirements**

- The surface ships its brand mark and application icons at the sizes the platform needs. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S6.35)
- Product and company names come from the product-names registry. (source: (doc: AGENTS.md section 4); web manifest uses PRODUCT_BRAND (apps/web/app/manifest.ts:2,6-7))

**Acceptance criteria**

1. Web manifest serves 192 and 512 pixel PNG icons that exist and have the stated size.
2. Installing the web app shows the AGI icon, not a blank tile.
3. macOS build contains the icns icon.
4. Mobile builds include icon and adaptive icon files.
5. VS Code package icon is 128px and chat icon is 32px.
6. Chrome manifest declares 16, 32, 48 and 128 icons and the files exist.
7. With reduced motion on, the web mark does not shine.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Windows and Linux Desktop builds need icons if shipped. [inferred from platform rules]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a test that reads electron-builder.yml and checks the icon file exists.
- [proposed] Add a CLI brand banner decision to the brief or mark it not applicable.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | web manifest | `apps/web/app/manifest.ts` | Name, colours and three icon sizes. |
| other | web icon files | `apps/web/public/logo-512.png` | Install icons (also logo-192.png, apple-touch-icon.png, app/icon.png, app/favicon.ico). |
| component | SidebarBrandRow | `apps/web/shared/components/layout/SidebarBrandRow.tsx` | Sidebar wordmark and bell. |
| component | SidebarWordmark | `apps/web/shared/components/agi/SidebarWordmark.tsx` | Draws AgiMark with the wordmark. |
| component | AgiMark (web) | `apps/web/shared/components/agi/AgiMark.tsx` | Re-exports AgiMark from packages/ui. |
| config | mark animation CSS | `packages/ui/design-tokens/src/foundation.css` | agi-mark-shine and ribbon styles; reduced-motion rule (540-592). |
| config | mark geometry tokens | `packages/ui/design-tokens/src/index.ts` | agiSymbolPalette, agiSymbolShineBand, agiSymbolShinePath (366-394). |
| config | electron-builder | `apps/desktop/electron-builder.yml` | mac icon icns (71). |
| other | desktop icon file | `apps/desktop/electron/resources/icon.icns` | macOS app icon. |
| service | Electron dock icon | `apps/desktop/electron/main.ts` | Sets dock icon from assets/app-icon.png (2592-2593). |
| config | mobile app config | `apps/mobile/app.config.js` | icon, adaptiveIcon, notification icon. |
| other | mobile assets | `apps/mobile/assets/icon.png` | App icon (also adaptive-icon.png, agi-symbol.png, notification-icon.png). |
| component | Mobile AgiMark | `apps/mobile/components/ui/AgiMark.tsx` | Animated mark; static under reduce motion. |
| config | VS Code package | `apps/extension-vscode/package.json` | icon media/icon.png (84). |
| other | VS Code media | `apps/extension-vscode/media/icon.png` | Marketplace icon (also icon-chat.png, agi-symbol.png). |
| config | Chrome manifest | `apps/extension/manifest.json` | icons and action icons 16/32/48/128 (54-65). |
| other | Chrome icons | `apps/extension/icons/icon128.png` | Icon files (also icon16, icon32, icon48, agi-symbol.png). |
| test | web brand asset test | `apps/web/app/brand-assets.test.ts` | Symbol artwork and multi-resolution favicon. |
| test | Chrome brand icon test | `apps/extension/__tests__/brand-icons.test.ts` | Manifest icon sizes. |
| test | VS Code brand asset test | `apps/extension-vscode/src/__tests__/brandAssets.test.ts` | Icon sizes. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| At build, icon files are copied into the bundle or package using the config. | device | electron-builder.yml:71; app.config.js:143; package.json:84; manifest.json:61-65 (build step [inferred]) |
| Web: the browser fetches manifest and icon files from our servers on install. | our servers | apps/web/app/manifest.ts:14-30 |
| In app, the mark is drawn from local image and SVG data; shine runs as a CSS animation unless reduced. | device | foundation.css:562-592; AgiMark.tsx:67-94 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Icon files and mark data | Repository, then each app bundle or web public folder | No sync | Changed only by release |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code. |
| Permissions | None found in the code. |
| Subscription | None found in the code. |
| Limits and metering | None found in the code. |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Icons and mark are bundled on the device, so they appear in Local mode with no network. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Reduced motion | Ribbon hidden and shine animation off (web); static mark (mobile). | foundation.css:585-592; AgiMark.tsx:82-94 |
| Paused mark | data-paused pauses the shine. | foundation.css:572-574 |
| Desktop icon missing | Dock icon is only set when the image is not empty. | main.ts:2592-2593 |
| Narrow sidebar (web) | Brand row is the container the wordmark measures so the name steps aside before the bell. | SidebarBrandRow.test.tsx:11 |
| Offline, error, loading | not handled in the code for icons (static files). | apps/web/app/manifest.ts (static list only) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/brand-assets.test.ts`: Browser icon uses the symbol artwork; favicon is multi-resolution.
- `apps/web/shared/components/layout/__tests__/SidebarBrandRow.test.tsx`: Wordmark container measuring.
- `apps/extension/__tests__/brand-icons.test.ts`: Symbol artwork present and 16, 32, 48, 128 px manifest icons.
- `apps/extension-vscode/src/__tests__/brandAssets.test.ts`: Symbol 512px, icon 128px, chat icon 32px, removed placeholder files.
- `apps/extension/__tests__/manifest-contract.test.ts`: Manifest contract (detail not opened).

**Test scenarios**

- **Web install**
  1. Open Web in Chrome and choose Install app.
  - Expected: A 512 icon appears in the prompt and on the app shortcut.
- **Manifest check**
  1. Open the web manifest URL in a browser.
  - Expected: Three icons with correct sizes load with HTTP 200.
- **Reduced motion mark**
  1. Turn on reduced motion.
  2. View the Web sidebar.
  - Expected: The mark does not shine.
- **Desktop bundle**
  1. Build the macOS app (by owner).
  2. Open the app.
  - Expected: Dock shows the AGI icon.
- **Extension**
  1. Load the Chrome extension and the VS Code extension.
  - Expected: Toolbar and marketplace icons are sharp.

**Where to look when it fails**

- Check the Lighthouse installability report for manifest icon errors.
- Inspect network for 404 on icon paths.
- Run the three brand asset tests.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md)
- Desktop: [70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md)
- Mobile: [70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md)
- VS Code: [70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md)
- Chrome: [70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md)

## 10. Gaps and dependencies

- **Desktop packaging has only a macOS icon entry.** Affects: Windows and Linux Desktop builds, if shipped.. Evidence: electron-builder.yml (no win or linux key). Work needed: Confirm which platforms ship; add icons or document.
- **CLI has no brand asset or mark found, but the brief says done.** Affects: CLI.. Evidence: Brief S6.35 lists no CLI code. Work needed: Verify or correct the brief.
- **No test checks the Desktop or Mobile icon files exist and have correct sizes.** Affects: Desktop, Mobile releases.. Evidence: No matching test files found. Work needed: Add tests.
- **Mobile config name is 'Mobile'; displayed name unverified.** Affects: Mobile.. Evidence: app.config.js:143. Work needed: Check the native app name on a device.
- Not built on: CLI (from the capability ledger).

**Depends on**

- F006-08
- SYS-shared-ui-and-design
- file:apps/web/app/manifest.ts
- file:apps/desktop/electron-builder.yml
- file:apps/mobile/app.config.js
- file:apps/extension/manifest.json
- file:apps/extension-vscode/package.json
- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- surface:cli

## Unknown

- Whether the CLI has any brand mark (none found).
- Which Desktop platforms ship and their icons.
- Display name of the mobile app on devices.
- Whether the web app/layout.tsx declares icons (brief cites layout.tsx:5; file-convention icons exist instead).
- Size and content of the Desktop icns and mobile PNG files (not measured).
