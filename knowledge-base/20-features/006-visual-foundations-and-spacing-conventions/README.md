---
id: "AREA-006"
type: "area"
title: "Visual foundations and spacing conventions"
features: ["F006-01", "F006-02", "F006-03", "F006-04", "F006-05", "F006-06", "F006-07", "F006-08", "F006-09", "F006-10", "F006-11", "F006-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 6. Visual foundations and spacing conventions

This area is the shared visual language: colours by role, one type scale, one spacing and radius set, one z-index (stacking) ladder, one motion set, and the light, dark, system, high-contrast and reduced-motion switches. A person gets a product that looks the same across apps, stays readable in every theme, and can be calmer or easier to read on their own terms. It matters because each value is named once, so a change lands everywhere and contrast can be checked against the named values.

**Who uses it.** Every user, on every app, as far as the code shows. The appearance controls I opened (web Appearance settings, mobile Appearance screen, CLI /theme and config keys, Chrome Options Appearance) have no plan gate and no admin gate in the files I read. Developers use the token files and the shared primitives. No paid-plan or workspace-admin rule was found.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F006-01](F006-01-colour-roles.md) | Colour roles | built | built | built | built | built | built |
| [F006-02](F006-02-type-scale-and-fonts.md) | Type scale and fonts | built | built | built | built | built | built |
| [F006-03](F006-03-reply-content-spacing.md) | Reply content spacing | built | built | built | built | built | built |
| [F006-04](F006-04-chat-layout-spacing.md) | Chat layout spacing | built | built | built | built | built | built |
| [F006-05](F006-05-row-menu-dialog-and-form-sizes.md) | Row, menu, dialog and form sizes | built | built | built | built | built | built |
| [F006-06](F006-06-buttons-and-icons.md) | Buttons and icons | built | built | built | n/a | built | built |
| [F006-07](F006-07-corners-shadows-and-stacking.md) | Corners, shadows and stacking | built | built | built | n/a | built | built |
| [F006-08](F006-08-motion-and-reduced-motion.md) | Motion and reduced motion | built | built | built | built | built | built |
| [F006-09](F006-09-light-dark-and-system-themes.md) | Light, dark and system themes | built | built | built | built | built | built |
| [F006-10](F006-10-high-contrast.md) | High contrast | built | built | built | built | built | built |
| [F006-11](F006-11-control-states.md) | Control states | built | built | built | built | built | built |
| [F006-12](F006-12-brand-marks-and-app-icons.md) | Brand marks and app icons | built | built | built | no | built | built |

Requirement items for this area: [10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md).

## How this area works in the code

1. **Person chooses an appearance value on the web Appearance screen.** Theme, motion, contrast, chat font, text size, accent and code options are controls in AppearanceSection. Each writes to the settings store through a setter. (`apps/web/features/settings/sections/AppearanceSection.tsx:24-26 (theme options)`, `apps/web/features/settings/sections/AppearanceSection.tsx:118-140 (motion)`, `apps/web/features/settings/sections/AppearanceSection.tsx:152-170 (contrast)`, `apps/web/features/settings/sections/AppearanceSection.tsx:176-200 (chat font)`, `apps/web/features/settings/sections/AppearanceSection.tsx:212-224 (chat text size)`)
2. **Store holds the value and saves it in browser storage.** The Zustand store keeps appearance values with defaults and saves them in localStorage under one key. (`apps/web/shared/stores/web-settings-store.ts:117-121 (defaults: text size default, motion system, chat font default)`, `apps/web/shared/stores/web-settings-store.ts:141-143 (text size, motion, font setters)`, `apps/web/shared/stores/web-settings-store.ts:179-180 (accent and contrast setters)`, `apps/web/shared/stores/web-settings-store.ts:210-211 (storage key agiworkforce-web-settings, localStorage)`)
3. **Light, dark and system go through the theme provider.** The theme choice uses next-themes. It sets a class on the page root and stores the choice under the key theme. (`apps/web/shared/components/ThemeProvider.tsx:13-16 (reads and sets the theme)`, `apps/web/shared/components/ThemeProvider.tsx:44-47 (class attribute, system allowed, storage key)`, `apps/web/shared/components/ThemeConstants.ts:3-5 (storage key theme, default system)`)
4. **AppearancePreferences copies values onto the page root.** A component mounted at app start watches the store and sets one attribute per value on the html element. No attribute means the default. (`apps/web/shared/components/AppearancePreferences.tsx:19-20 (data-chat-text-size)`, `apps/web/shared/components/AppearancePreferences.tsx:35-36 (data-accent)`, `apps/web/shared/components/AppearancePreferences.tsx:41-42 (data-contrast)`, `apps/web/shared/components/AppearancePreferences.tsx:51-52 (data-motion)`, `apps/web/shared/components/AppearancePreferences.tsx:57-58 (data-chat-font)`, `apps/web/app/AppRuntimeMounts.tsx:18 (mounts it)`)
5. **Stylesheets read the attributes and the OS settings.** CSS rules keyed on the attributes and on OS media queries change colours, sizes and motion. A blanket rule stops motion for the in-app setting. (`apps/web/app/globals.css:725-740 (accent swatches)`, `apps/web/app/globals.css:932-935 (chat text size for prose)`, `apps/web/app/globals.css:1271 (OS prefers-contrast)`, `apps/web/app/globals.css:1308 (in-app high contrast, dark)`, `apps/web/app/globals.css:1918-1945 (in-app reduced motion and OS reduced-motion rules)`)
6. **Components paint from the token layer.** Shared tokens define values per theme. Primitives use role classes, so a component never holds its own colour. (`packages/ui/design-tokens/src/foundation.css:163-213 (light semantic roles)`, `packages/ui/design-tokens/src/foundation.css:450-524 (dark semantic roles)`, `packages/ui/ui/src/primitives/Button.tsx:8-28 (button variants and sizes)`)
7. **Signed-in web copies the appearance to the account.** Appearance values are sent as a namespace to the settings sync endpoint, which stores and returns them so other devices get the same look. (`apps/web/features/settings/components/CloudSettingsSync.tsx:167 (write queue)`, `apps/web/features/settings/components/CloudSettingsSync.tsx:212 (reads stored values)`, `apps/web/features/settings/lib/appearance-namespace.ts:1-30 (namespace and fields)`, `apps/web/app/api/settings/sync/route.ts:14 (cloud-safe namespaces)`, `apps/web/app/api/settings/sync/route.ts:177-178 (GET and POST)`)
8. **Mobile resolves the theme from its own stores.** The mobile app stores the choice on the device or, in cloud mode, in the cloud store, then resolves palettes, high-contrast and motion checks. (`apps/mobile/stores/settings/localSettingsStore.ts:75-76 (themeMode system, accent neutral)`, `apps/mobile/stores/settings/localSettingsStore.ts:109-110 (MMKV storage, settings-store-local)`, `apps/mobile/stores/settings/cloudSettingsStore.ts:86 (setThemeMode in cloud mode)`, `apps/mobile/src/ui/theme/useTheme.ts:17-37 (picks store by app mode, resolves colours)`, `apps/mobile/src/ui/theme/useReduceMotion.ts:1-82 (OS reduce motion store)`)
9. **CLI stores the choice and paints from its palette.** The /theme command or picker stores the theme slug in the TOML config file and selects a palette index; reduced motion is a separate config key. (`apps/cli/src/repl/slash_commands.rs:575 (/theme command)`, `apps/cli/src/tui/widgets/theme_picker.rs:88-101 (slug parsing)`, `apps/cli/src/config.rs:1562-1570 (ui.theme set)`, `apps/cli/src/config.rs:1263-1264 (persist theme in project config)`, `apps/cli/src/tui/terminal_palette.rs:138-152 (set active theme, palette lookup)`, `apps/cli/src/tui/tui_app.rs:7122-7124 (reduced motion switch, plain output)`, `apps/cli/src/tui/motion.rs:4-6 (frame interval and still spinner)`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/design-tokens/src/foundation.css` | Canonical shared tokens: colour roles per theme (light :root and .dark), radii, spacing, gutters, z-index ladder, durations, curves, elevation, type roles. |
| `packages/ui/design-tokens/src/tailwind.css` | Maps the tokens to Tailwind names for type, radius and shadow utilities. |
| `packages/ui/design-tokens/src/chat.css` | Chat font stacks (sans, serif, mono, emoji fallbacks) and chat type sizes. |
| `apps/web/app/globals.css` | Web rules keyed on the appearance attributes, OS media queries, accent swatches, reduced-motion blanket rule. |
| `apps/web/shared/components/AppearancePreferences.tsx` | Turns saved appearance values into attributes on the html element. |
| `apps/web/features/settings/sections/AppearanceSection.tsx` | The web Appearance controls (theme, accent, motion, contrast, font, text size, code). |
| `apps/web/shared/stores/web-settings-store.ts` | Saves appearance values in browser storage under one key. |
| `packages/ui/ui/src/primitives/Button.tsx` | Shared web button with variants, sizes and focus ring. |
| `apps/mobile/src/ui/theme/tokens.ts` | Mobile palettes (light, dark, high contrast), accent swatches, type scale, radii, elevation. |
| `apps/mobile/src/ui/theme/useTheme.ts` | Mobile theme resolution from device or cloud store, accent and high contrast. |
| `apps/cli/src/tui/terminal_palette.rs` | CLI palettes (dark, light, ANSI, two high-contrast, colourblind) and the active-theme switch. |
| `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | VS Code sidebar CSS: host-theme colour policy, its own size and z-index variables, reduced-motion rule. |

## What is stored

- Web appearance settings (accent, motion, contrast, chat font, text size, code wrap, code theme): Browser localStorage key agiworkforce-web-settings (apps/web/shared/stores/web-settings-store.ts:210-211)
- Web theme choice (light, dark, system): Browser localStorage key theme (apps/web/shared/components/ThemeConstants.ts:3), written by next-themes (ThemeProvider.tsx:44-47)
- Signed-in web appearance copy so other devices match: Settings sync endpoint (apps/web/app/api/settings/sync/route.ts:177-178); the database table behind it was not identified
- Mobile theme and accent (device): Device MMKV storage, key settings-store-local (apps/mobile/stores/settings/localSettingsStore.ts:109-110)
- Mobile theme, accent and font (cloud mode): Device MMKV storage, key settings-store-cloud (apps/mobile/stores/settings/cloudSettingsStore.ts:124), filled from sync (apps/mobile/services/cloudSettingsMapping.ts:186-187)
- CLI theme slug and reduced-motion flag: User file ~/.agiworkforce/config.toml (apps/cli/src/config.rs:492); project file .agiworkforce/config.toml (config.rs:525); keys ui.theme and ui.reduced_motion (config.rs:146, 155)
- Chrome theme preference: chrome.storage.local key agi_theme_preference (apps/extension/src/features/appearance/themePreference.ts:3, 31)
- Desktop appearance preference: Desktop app preferences, written by saveSettings in apps/desktop/electron/main.ts:617 (the preferences module was not opened)
- VS Code appearance: Nothing stored by this area; the sidebar follows the host theme (see webviewContent.ts:116-130)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Theme: System, Light, Dark (web)**: Sets the page class and the theme preference; default System. (AppearanceSection.tsx:24-26; ThemeProvider.tsx:44-47; ThemeConstants.ts:5)
- **Accent colour (web)**: Sets data-accent on html; green, blue, violet and rose override accent tokens. (web-settings-store.ts:137; AppearancePreferences.tsx:35-36; globals.css:725-740)
- **Motion: System or Reduced (web)**: Sets data-motion=reduced; a blanket rule stops animations. (web-settings-store.ts:120; AppearancePreferences.tsx:51-52; globals.css:1918-1945)
- **Contrast: System or High (web)**: Sets data-contrast=more; high-contrast rules for dark mode. (web-settings-store.ts:138; AppearancePreferences.tsx:41-42; globals.css:1308)
- **Chat font (web)**: Sets data-chat-font; sans, serif, dyslexic families. (web-settings-store.ts:121; AppearancePreferences.tsx:57-58; globals.css:951-960)
- **Chat text size (web)**: Sets data-chat-text-size; small or large prose and code. (web-settings-store.ts:119; AppearancePreferences.tsx:19-20; globals.css:932-935)
- **Wrap long code lines (web)**: Sets data-code-block-wrap on. (AppearanceSection.tsx:232-240; AppearancePreferences.tsx:25-26; globals.css:978-980)
- **OS reduce motion, OS contrast (web, mobile, Chrome, VS Code)**: Media query or native setting changes motion and contrast without an in-app switch. (globals.css:986, 1373, 1739, 1939 (motion); globals.css:1271 (contrast); useReduceMotion.ts:1-82; useSystemHighContrast.ts:1-40; tokens.ts:36 (Chrome forced colours); webviewContent.ts:2774)
- **Theme (mobile)**: System, light or dark; picks the local or cloud store by app mode. (appearance/index.tsx:13-16; localSettingsStore.ts:75; useTheme.ts:17-37)
- **Theme and reduced motion (CLI)**: Theme slug picks one of seven choices; reduced motion stills the spinner; plain output also forces it. (theme_picker.rs:41-58, 88-101; config.rs:146, 155, 1464-1465, 1562-1577; tui_app.rs:7122-7124; motion.rs:6)
- **Theme (Chrome)**: System, light or dark via the options page. (themePreference.ts:3, 29-42; options appearance-section.ts:76-78)
- **Plan gate**: None found in the files opened for these controls. (Not found)

## Shared between apps

Shared: packages/ui/design-tokens (foundation.css, tailwind.css, chat.css and its TypeScript entry) is the token owner; web and the desktop window load it; the mobile theme imports agiMobileColors, agiMobileAccentSwatches and related exports from it (apps/mobile/src/ui/theme/tokens.ts:1-8); the Chrome extension imports agiExtensionCssVars and cssVarsToString (apps/extension/src/tokens.ts:1); the VS Code sidebar imports agiVsCodeCssVars (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:23). Shared UI primitives in packages/ui/ui (Button.tsx, Dialog.tsx, DropdownMenu.tsx, Sheet.tsx, SessionItem.tsx) serve web and desktop. Separate per app: mobile has its own Button and palettes; the CLI palettes are Rust code with their own RGB values (terminal_palette.rs); VS Code has its own :root variables and z-index values in webviewContent.ts; Chrome has its own side_panel.css and tokens.ts with a separate z-index and duration set.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Filler citation: the web root layout line is an import of the theme init script, not a spacing, colour or font rule. The brief cites it for 13 items. (apps/web/app/layout.tsx:5)
- Filler citation: the mobile root layout line is inside background-fetch cleanup code. The brief cites it for 15 items. (apps/mobile/app/_layout.tsx:719)
- Filler citation: the CLI line is inside clipboard image staging. The brief cites it for 10 items. (apps/cli/src/tui/tui_app.rs:917)
- Filler citation: the VS Code line sets webview options (resource roots and scripts). The brief cites it for 10 items. (apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:73)
- Filler citation: the web settings page line is an import; the brief's motion citation (S6.31) points at a read-aloud voice dropdown, not a motion rule. (apps/web/features/settings/sections/GeneralSection.tsx:47 and :1091)
- Wrong citation for list indentation: this line is an animation utility, not a list rule. The brief cites it for S6.14. (apps/web/app/globals.css:1156-1158)
- Wrong citation for page gutters: this line is inline code styling. The brief cites it for S6.20. (apps/web/app/globals.css:866-868)
- Wrong citation for VS Code reduced motion: this line is subagent row CSS. The real reduced-motion rule is further down. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2055-2058 (real rule at 2774-2781))
- Wrong citation for desktop theme: this line is the external-link handler, not theme code. The theme code is at lines 613-617 and 2604-2605. (apps/desktop/electron/main.ts:548-556)
- Heading rule not in the cited file: the brief cites the lint config for the heading scale, but this line is inside a list of lint-ignored model files and a Blob message rule. (eslint.config.mjs:54)
- Z-index ladder is not shared in VS Code. The sidebar defines its own numbers (dropdown 20, popover 30, overlay 50, sheet 60) and does not use the shared ladder (dropdown 50, popover 350), which contradicts S6.29. (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:220-224 vs packages/ui/design-tokens/src/foundation.css:329-336)
- Z-index ladder is not shared in Chrome: the side panel stylesheet defines its own values (dropdown 10, popover 20, modal 60, modal-raised 61). This contradicts S6.29. (apps/extension/src/side_panel.css:25-36)
- Icon sizes are not from a small set on mobile: the code uses literal sizes from 10 to 22 across many files, at least 12 distinct values. This contradicts S6.25. (apps/mobile/src/features/settings/appearance/index.tsx:39-60 (size 19, one example; repeated across apps/mobile))
- Mobile has no in-app text-size or font control in the Appearance screen, though the store holds a font preference. The brief marks S6.09 done for mobile, saying it respects the text-size preference where offered. (apps/mobile/src/features/settings/appearance/index.tsx:13-16 (theme options only); apps/mobile/stores/settings/localSettingsStore.ts:76)
- Two button size scales: web names default, xs, sm, lg, icon with heights 40, 28, 36, 44 px; mobile names sm, md, lg with minimum heights 36, 44, 52. There is no shared size scale across apps. (packages/ui/ui/src/primitives/Button.tsx:24-28; apps/mobile/components/ui/button.tsx:21-30)
- Two heading-3 sizes: chat uses 1.0625rem and the foundation scale uses 1.125rem. Two scales exist for the same role. (packages/ui/design-tokens/src/chat.css:52; packages/ui/design-tokens/src/foundation.css:383)
- The code-theme hint says code blocks are coloured only in dark mode and light mode keeps its high-contrast look. The brief says the whole surface, including code, follows the chosen theme (S6.32). (apps/web/features/settings/sections/AppearanceSection.tsx:251-252)
- The brief marks Chrome done for many items (for example S6.01 to S6.06, S6.13 to S6.20, S6.30 to S6.35) and cites no extension file for them. Chrome evidence found: tokens.ts, side_panel.css, options.ts and themePreference.ts only. (apps/extension/src/tokens.ts:1-40; apps/extension/src/side_panel.css:25-36)

## Not established

- Whether the 16 test cases in theme-contrast.test.ts actually run and pass. I read no test output and did not run any test (read-only task).
- Whether the in-app High contrast rule also has a light-mode version. I found the dark-mode rule at globals.css:1308 only.
- Whether the mobile accent colour screen (route under settings) and its swatches work. I saw the settings row that links to it (apps/mobile/src/features/settings/index.tsx:679-683) but did not open the screen file.
- Whether mobile has any in-app font-size control elsewhere. My search covered the Appearance screen and the personalization screen only.
- Whether the CLI palettes are generated from the design-tokens package or hand-copied. I found no generation step and did not search for one.
- Whether the shimmer effect in the CLI (apps/cli/src/tui/shimmer.rs) stops under reduced motion. I read only the spinner path (tui_app.rs:2127-2129).
- The brief's line references for most component rules (MessageBubble, ChatComposerNew, ChatMessageList, MarkdownContent table rules, mobile chat files, CLI markdown_renderer.rs, most of webviewContent.ts, Chrome options.ts and side_panel.ts) were not opened for those specific lines, so I could not confirm or refute them.
- Whether the sync endpoint's database table is the one storing appearance values. I read the route's namespace list and handlers only (route.ts:14, 177-178).
- Desktop preferences module: I saw the desktop theme IPC handler and the saved appearance value (main.ts:613-617, 2604) but did not open the preferences module.
- Chrome icons (apps/extension/src/assets/icons.ts) and the desktop icon sizes beyond electron-builder.yml:71 were not opened.
- Whether any environment variable or feature flag affects this area. I did not search for them.
- Plan gates: I found none in the files I opened, but did not search the whole repository for them.
- The icon family source (which library draws the 24px icon set): the grid and factory files do not name one and I did not find an import of a third-party icon package in packages/ui/icons/src.
- Exact line numbers for the VS Code font, the foundation dark elevation, and the safe-area rule in globals.css were not captured. Where a range is given, the line falls inside that range but I did not pin the exact line.
