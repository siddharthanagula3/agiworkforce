---
id: "GAPS-AREA-084"
type: "gap-list"
title: "Gaps: General and appearance settings"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 84. General and appearance settings

93 open gaps that touch this area. Area page: [20-features/084-general-and-appearance-settings](../../20-features/084-general-and-appearance-settings/README.md).

## CMP-C533

**Plugins can ship output styles and color themes**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F084-04](../../20-features/084-general-and-appearance-settings/F084-04-code-blocks-syntax-theme-and-line-wrapping.md)
- Detail: Ours plugins cannot contribute themes or output styles; the theme list is fixed.
- Evidence: searched: themes, output-styles, plugin theme in apps/cli/src/features/plugins, tui/widgets/theme_picker.rs

## CMP-C604

**Unbind a default shortcut by setting its action to null**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F011-02](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md), [F084-07](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Detail: ui.keybindings can rebind a fixed set of actions to another key; there is no way to remove a default key.
- Evidence: apps/cli/src/config.rs:171,1480; searched: unbind, null in apps/cli/src/keybindings.rs (0 hits)

## CMP-CP299

**Custom color themes and colorblind presets**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F084-04](../../20-features/084-general-and-appearance-settings/F084-04-code-blocks-syntax-theme-and-line-wrapping.md)
- Detail: No user theme files or .tmTheme syntax themes Built-in themes include auto, dark, light, ansi, high-contrast and colorblind; no user theme files or .tmTheme syntax themes.
- Evidence: apps/cli/src/config.rs:142-146

## CMP-CP301

**Desktop notifications when a turn finishes or needs input**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md), [F084-09](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Detail: No desktop notification option Ours can ring the terminal bell when a turn finishes; no desktop notification option.
- Evidence: apps/cli/src/config.rs:158; apps/cli/src/tui/tui_app.rs:8613

## CMP-CP50

**Colorblind-safe themes (light and dark)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F084-04](../../20-features/084-general-and-appearance-settings/F084-04-code-blocks-syntax-theme-and-line-wrapping.md)
- Detail: Ours has one colorblind theme plus two high-contrast themes, with no separate light colorblind theme Ours has one colorblind theme plus two high-contrast themes, with no separate light colorblind theme.
- Evidence: apps/cli/src/tui/terminal_palette.rs:133,842; apps/cli/src/config.rs:142

## CMP-DP113

**Quick chat shortcut: double-tap a key or Option+Space**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F084-11](../../20-features/084-general-and-appearance-settings/F084-11-desktop-launch-and-quick-access.md)
- Detail: Option+Space and double-tap Option are not offered Our default is Option+Shift+Space; Option+Space and double-tap Option are not offered.
- Evidence: packages/contracts/local-runtime/src/host-bridge.ts:162 (quickAsk choices); apps/desktop/electron/shortcuts.ts

## CMP-DP125

**Set a custom shortcut combination**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F084-11](../../20-features/084-general-and-appearance-settings/F084-11-desktop-launch-and-quick-access.md)
- Detail: You pick from three preset chords per shortcut, or none You pick from three preset chords per shortcut, or none; the shell refuses any other chord from the page on purpose.
- Evidence: apps/desktop/electron/garnishCore.ts:192 pageMayWriteShortcut; apps/web/features/desktop-host/components/DesktopSettingsSection.tsx:170 choicesFor

## CMP-DP24

**Menus, tray and system dialogs in the app language**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: The menus, tray, notifications and dialogs are fixed English text and the build keeps English locale files only Hosted pages follow the web language, but the menus, tray, notifications and dialogs are fixed English text and the build keeps English locale files only.
- Evidence: apps/desktop/electron-builder.yml:13-14 (electronLanguages: en); apps/desktop/electron/appMenu.ts (literal English labels)

## CMP-M58

**Language of the app**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: The app-language picker is switched off, so the app shows English only. English and Spanish catalogs sit behind it.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:36; apps/mobile/src/features/settings/general/index.tsx:107; packages/ui/i18n/src/languages.ts:28

## CMP-MP43

**Interface languages**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: The app shows English only The app shows English only; the language picker is switched off, with English and Spanish catalogs ready behind it.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:36; packages/ui/i18n/src/languages.ts:28; apps/mobile/src/i18n/index.ts:30

## CMP-WP114

**Interface languages**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: Two languages (English, Spanish) can be selected Two languages (English, Spanish) can be selected.
- Evidence: packages/ui/i18n/src/languages.ts:28

## CMP-WP252

**Display language**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: There is no auto-detect option Only English and Spanish can be chosen; there is no auto-detect option.
- Evidence: packages/ui/i18n/src/languages.ts:28; apps/web/features/settings/sections/GeneralSection.tsx:526

## CMP-WP257

**Code appearance: code theme and wrap long lines**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F084-04](../../20-features/084-general-and-appearance-settings/F084-04-code-blocks-syntax-theme-and-line-wrapping.md)
- Detail: No code font or separate light and dark themes Code theme and wrap long code lines exist; no code font or separate light and dark themes.
- Evidence: apps/web/features/settings/sections/AppearanceSection.tsx:235-262

## CMP-X22

**Language submenu**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: Only English ships; no language menu.
- Evidence: apps/extension/_locales (only en); searched: setLocale, language submenu

## GAP-AREA084-LW07

**Quiet hours are described as holding notifications, but the footer says they apply only on the Website. No code that suppresses email or mobile push by quiet hours was found in the places searched.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-084
- Detail: Area 84. General and appearance settings
- Evidence: apps/web/features/settings/sections/TimeFocusSection.tsx:375; apps/web/features/time-focus/TimeFocusReminder.tsx:158-162

## GAP-AREA084-LW09

**Accent colours differ between apps. Web has five colours and mobile has ten. A mobile-only colour name is ignored when web loads the account value, so web keeps its own colour and the two devices can disagree.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-084
- Detail: Area 84. General and appearance settings
- Evidence: apps/web/shared/stores/web-settings-store.ts:13-19; apps/mobile/src/features/settings/accent-color/index.tsx:13-24; apps/web/features/settings/lib/appearance-namespace.ts:137-138

## GAP-AREA084-LW11

**The web settings store reads and writes browser storage directly with no guard. A browser that blocks storage can throw here and take the settings screens down.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-084
- Detail: Area 84. General and appearance settings
- Evidence: apps/web/shared/stores/web-settings-store.ts:209-212

## GAP-AREA084-LW12

**Before the theme is known, the Appearance screen shows Dark as the selected theme, so the wrong button is highlighted for a moment on a light or system device.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-084
- Detail: Area 84. General and appearance settings
- Evidence: apps/web/features/settings/sections/AppearanceSection.tsx:37

## GAP-CAP-settings-01

**Color theme (light, dark, system): None known on web. The web scorecards note the artifact preview stays light in dark mode and a terms toast looks wrong in dark.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F084-01](../../20-features/084-general-and-appearance-settings/F084-01-theme-light-dark-or-system.md)
- Requirement items: S84.03
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-settings-02

**Accent color: CLI, VS Code and Chrome have no accent choice. Whether they must is not decided.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F084-02](../../20-features/084-general-and-appearance-settings/F084-02-accent-colour.md)
- Requirement items: S84.04
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-settings-04

**Text size and zoom: Chrome extension has no text size control. The web comparison marks both leaders as No for a text-size setting, which differs from the Windows help page; AGI is ahead of Claude on this by the catalogue.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F011-05](../../20-features/011-accessibility-and-localization-components/F011-05-text-size-zoom-and-long-text-layout.md), [F084-03](../../20-features/084-general-and-appearance-settings/F084-03-chat-text-size-interface-density-and-motion.md)
- Requirement items: S11.12, S11.13, S84.05
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-CAP-settings-06

**Code theme, color-blind themes and custom themes: No custom-theme files, no theme sharing, no plugin themes; mobile and Chrome lack code theme.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F084-04](../../20-features/084-general-and-appearance-settings/F084-04-code-blocks-syntax-theme-and-line-wrapping.md)
- Requirement items: S84.08, S84.09
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-settings-07

**Interface language: Selectable languages are English and Spanish; leaders offer 11 to about 60. This follows the owner decision but is a competitive gap. Desktop menus and tray stay English (electronLanguages: en). Mobile and Chrome offer no selector.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F011-10](../../20-features/011-accessibility-and-localization-components/F011-10-languages-and-translated-messages.md), [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Requirement items: S11.25, S84.01
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-settings-11

**Time zone: No time zone setting; locale-aware dates exist (S11.22) except CLI.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F011-11](../../20-features/011-accessibility-and-localization-components/F011-11-locale-aware-dates-numbers-and-money.md), [F084-09](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Requirement items: S11.22, S84.02
- Detail: Claude yes, ChatGPT unknown; AGI not built

## GAP-CAP-settings-12

**Keyboard shortcut customization: CLI: no null-unbind. The web comparison says no Claude chat page documents rebinding.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F011-02](../../20-features/011-accessibility-and-localization-components/F011-02-keyboard-operation-of-menus-dialogs-and-focus.md), [F084-07](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Requirement items: S11.26, S84.15
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-settings-13

**Shortcut list overlay: Document, slide and design editor shortcuts missing (W138).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F084-07](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Requirement items: S84.15
- Detail: Claude partly, ChatGPT yes; AGI built

## GAP-CAP-settings-14

**Global quick-access shortcut (desktop): Custom combinations are only partial (DP125).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F084-11](../../20-features/084-general-and-appearance-settings/F084-11-desktop-launch-and-quick-access.md)
- Requirement items: S84.22
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-settings-16

**Notification settings: No channel choice in VS Code and Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F084-09](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Requirement items: S84.18, S84.19
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-settings-17

**Composer and response behavior defaults: Send-key missing on CLI, VS Code, Chrome; startup destination, default workspace and layout reset missing (S84.13, S84.20, S84.24).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F084-06](../../20-features/084-general-and-appearance-settings/F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md), [F084-07](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Requirement items: S84.10, S84.11, S84.12, S84.14
- Detail: Claude partly, ChatGPT yes; AGI built

## GAP-F084-01-01

**VS Code has no theme setting and no stated rule that it follows the editor theme.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-01](../../20-features/084-general-and-appearance-settings/F084-01-theme-light-dark-or-system.md)
- Detail: Affects: VS Code. Work needed: Decide and document; if wanted, add a setting or note.
- Evidence: No theme key in apps/extension-vscode/package.json (only the banner at line 26).

## GAP-F084-01-02

**CLI picker and /theme save only to the project folder, so another folder starts on Dark again.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-01](../../20-features/084-general-and-appearance-settings/F084-01-theme-light-dark-or-system.md)
- Detail: Affects: CLI. Work needed: Save at user level or fall back to the user value.
- Evidence: apps/cli/src/config.rs:1263-1266; slash_commands.rs:793-799

## GAP-F084-01-03

**Chrome theme is not synced to the account.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-01](../../20-features/084-general-and-appearance-settings/F084-01-theme-light-dark-or-system.md)
- Detail: Affects: Chrome. Work needed: Add an account namespace read and write, or record the decision to keep it per device.
- Evidence: themePreference.ts:29-43 uses chrome.storage.local only

## GAP-F084-01-04

**The Web repair sends invalid values to dark while the default is System; Chrome repairs to System.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-01](../../20-features/084-general-and-appearance-settings/F084-01-theme-light-dark-or-system.md)
- Detail: Affects: Web, Chrome. Work needed: Pick one fallback for both (product decision).
- Evidence: ThemeConstants.ts:5-9 vs themePreference.ts:11-13

## GAP-F084-01-05

**No retry queue when offline; only manual Retry.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-01](../../20-features/084-general-and-appearance-settings/F084-01-theme-light-dark-or-system.md)
- Detail: Affects: Web. Work needed: Retry on reconnect.
- Evidence: CloudSettingsSync.tsx:182-186

## GAP-F084-02-01

**Web default 'amber' becomes Neutral on Mobile and Mobile's five extra colours are ignored on Web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-02](../../20-features/084-general-and-appearance-settings/F084-02-accent-colour.md)
- Detail: Affects: Web and Mobile users with both. Work needed: Agree one list or map the default.
- Evidence: appearance-namespace.ts:53-70; tokens.ts:28-32

## GAP-F084-02-02

**No accent on CLI, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-02](../../20-features/084-general-and-appearance-settings/F084-02-accent-colour.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Decide whether these surfaces need it ('where offered' in the brief) and record it.
- Evidence: Absent from apps/cli/src/config.rs:1619 key list, apps/extension-vscode/package.json and appearance-section.ts

## GAP-F084-02-03

**Desktop (Electron) accent is the hosted page's; no desktop-specific check was made.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-02](../../20-features/084-general-and-appearance-settings/F084-02-accent-colour.md)
- Detail: Affects: Desktop. Work needed: Verify in the running Desktop app.
- Evidence: AGENTS.md section 5 (doc)

## GAP-F084-02-NOTBUILT

**Accent colour: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F084-02](../../20-features/084-general-and-appearance-settings/F084-02-accent-colour.md)
- Requirement items: S84.04
- Detail: CLI: S84.04; VS Code: S84.04; Chrome: S84.04

## GAP-F084-03-01

**Interface density has no control or code on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-03](../../20-features/084-general-and-appearance-settings/F084-03-chat-text-size-interface-density-and-motion.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome. Work needed: Decide scope; if kept, design values and add the setting and style rules.
- Evidence: Brief S84.06 status missing; no density row in AppearanceSection.tsx

## GAP-F084-03-02

**Mobile has no text size or motion control, only the device settings, and the code was not checked to confirm it honours them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-03](../../20-features/084-general-and-appearance-settings/F084-03-chat-text-size-interface-density-and-motion.md)
- Detail: Affects: Mobile. Work needed: Verify device text scale and reduce-motion handling on Mobile.
- Evidence: appearance/index.tsx has only theme; decision doc says follow the device

## GAP-F084-03-03

**Chrome has no text size control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-03](../../20-features/084-general-and-appearance-settings/F084-03-chat-text-size-interface-density-and-motion.md)
- Detail: Affects: Chrome. Work needed: Add or record as not planned.
- Evidence: Options Appearance holds only Theme (appearance-section.ts:36-70)

## GAP-F084-03-04

**The requirements page lists Contrast and Chat font beside these, but the brief does not track them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-03](../../20-features/084-general-and-appearance-settings/F084-03-chat-text-size-interface-density-and-motion.md)
- Detail: Affects: Web. Work needed: Add brief items for Contrast and Chat font.
- Evidence: docs/product/requirements.md section 16.1; AppearanceSection.tsx:155-208

## GAP-F084-03-NOTBUILT

**Chat text size, interface density and motion: not built on Web, Desktop, Mobile, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, Chrome
- Features: [F084-03](../../20-features/084-general-and-appearance-settings/F084-03-chat-text-size-interface-density-and-motion.md)
- Requirement items: S84.05, S84.06
- Detail: Web: S84.06; Desktop: S84.06; Mobile: S84.06; Chrome: S84.05, S84.06

## GAP-F084-04-01

**No code theme or wrap control on Mobile, CLI or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-04](../../20-features/084-general-and-appearance-settings/F084-04-code-blocks-syntax-theme-and-line-wrapping.md)
- Detail: Affects: Mobile, CLI, Chrome. Work needed: Decide per surface and record.
- Evidence: Brief S84.08 and S84.09 mark them missing; no control found in the apps

## GAP-F084-04-02

**Desktop was not separately verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-04](../../20-features/084-general-and-appearance-settings/F084-04-code-blocks-syntax-theme-and-line-wrapping.md)
- Detail: Affects: Desktop. Work needed: Drive the running Desktop app.
- Evidence: Hosted page (AGENTS.md section 5, doc)

## GAP-F084-04-NOTBUILT

**Code blocks: syntax theme and line wrapping: not built on Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, Chrome
- Features: [F084-04](../../20-features/084-general-and-appearance-settings/F084-04-code-blocks-syntax-theme-and-line-wrapping.md)
- Requirement items: S84.08, S84.09
- Detail: Mobile: S84.08, S84.09; CLI: S84.08; Chrome: S84.08, S84.09

## GAP-F084-05-01

**Only two languages are selectable and settings screens stay English.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: Affects: Web, Desktop. Work needed: Finish and review more catalogues and the settings strings.
- Evidence: packages/ui/i18n/src/languages.ts:28; locales/en/settings.json:65

## GAP-F084-05-02

**Mobile App language row is off, though the 2026-11-13 decision wants it on.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: Affects: Mobile. Work needed: Turn the flag on or amend the decision.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:35; docs/decisions/2026-11-13-founder-decisions.md D-2026-11-13-04

## GAP-F084-05-03

**CLI and VS Code have no display language setting.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: Affects: CLI, VS Code. Work needed: Decide scope.
- Evidence: Brief S84.01

## GAP-F084-05-04

**Mobile language is not synced to the account.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Detail: Affects: Mobile. Work needed: Decide whether to sync.
- Evidence: toCloudSettings in apps/mobile/services/cloudSettingsMapping.ts sends only speechLanguage under 'language' (lines 139-141)

## GAP-F084-05-NOTBUILT

**Display language: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F084-05](../../20-features/084-general-and-appearance-settings/F084-05-display-language.md)
- Requirement items: S84.01
- Detail: CLI: S84.01; VS Code: S84.01

## GAP-F084-06-01

**Default workspace is not offered anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-06](../../20-features/084-general-and-appearance-settings/F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md)
- Detail: Affects: Web, Desktop, Mobile, CLI, VS Code, Chrome. Work needed: Define what 'workspace' means per surface, then build or record not planned.
- Evidence: Brief S84.13 status missing on all six; no row in GeneralSection.tsx

## GAP-F084-06-02

**Web effort is not saved to the account, so it does not follow the person across browsers, unlike model and start mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-06](../../20-features/084-general-and-appearance-settings/F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md)
- Detail: Affects: Web, Desktop. Work needed: Add effort to an account namespace.
- Evidence: thinking-store.ts persists to localStorage; no effort key in appearance-namespace.ts:17-33

## GAP-F084-06-03

**The default model is not in the cloud-safe namespaces of the settings sync, so Mobile cannot read it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-06](../../20-features/084-general-and-appearance-settings/F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md)
- Detail: Affects: Mobile. Work needed: Decide the Mobile behaviour and add the namespace if wanted.
- Evidence: apps/web/app/api/settings/sync/route.ts:14-25

## GAP-F084-06-04

**Mobile has no Chat or Work default; its 'mode' is Local or Cloud and its model default is the last used.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-06](../../20-features/084-general-and-appearance-settings/F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md)
- Detail: Affects: Mobile. Work needed: Confirm the intended meaning and record it.
- Evidence: appModeStore.ts:5; model-picker/store.ts:179-191

## GAP-F084-06-05

**Chrome has no default model or effort setting in Options.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-06](../../20-features/084-general-and-appearance-settings/F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md)
- Detail: Affects: Chrome. Work needed: Add Options rows or record the decision.
- Evidence: Effort memory only in side_panel.ts:11111, 11501

## GAP-F084-06-06

**The decision document for default model storage is out of date.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-06](../../20-features/084-general-and-appearance-settings/F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md)
- Detail: Affects: Maintainers. Work needed: Update the document.
- Evidence: docs/decisions/wire-or-cut.md says model-store; code uses the 'default-model' namespace

## GAP-F084-06-07

**Whether Desktop Local models can be a default is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-06](../../20-features/084-general-and-appearance-settings/F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md)
- Detail: Affects: Desktop. Work needed: Check the model list used on Desktop.
- Evidence: Not traced

## GAP-F084-06-NOTBUILT

**New chat defaults: model, reasoning effort, mode and workspace: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F084-06](../../20-features/084-general-and-appearance-settings/F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md)
- Requirement items: S84.13
- Detail: Web: S84.13; Desktop: S84.13; Mobile: S84.13; CLI: S84.13; VS Code: S84.13; Chrome: S84.13

## GAP-F084-07-01

**Brief says send-key modifier choice; web offers only on/off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-07](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Detail: Affects: Web and Desktop users. Work needed: Decide whether to add a three-way choice like VS Code, then wire it to the composer handler and the appearance namespace.
- Evidence: GeneralSection.tsx:607-624; S84.14

## GAP-F084-07-02

**Shortcut customisation is not synced across devices.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-07](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Detail: Affects: Web and Desktop users who sign in on several devices. Work needed: Add fields to the namespace mapping and tests.
- Evidence: CloudSettingsSync.tsx:73-90 lacks shortcut fields

## GAP-F084-07-03

**Only four shortcuts can be rebound.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-07](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Detail: Affects: Web and Desktop. Work needed: Make printed hints read the effective chord, then allow more ids.
- Evidence: use-keyboard-shortcuts.ts:69-74

## GAP-F084-07-04

**Chrome side panel and CLI have no send-key choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-07](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Detail: Affects: Chrome and CLI users. Work needed: Add a setting and tests, or record the decision to keep it fixed.
- Evidence: side_panel.ts:14574; tui_app.rs:4072-4090

## GAP-F084-07-05

**Brief marks VS Code send key as missing but the code has it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-07](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Detail: Affects: The brief's accuracy. Work needed: Correct the brief row.
- Evidence: package.json:1251

## GAP-F084-07-06

**Chrome shows shortcuts read-only and sends users to the browser page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-07](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Detail: Affects: Chrome users. Work needed: None needed if the browser page is the intended owner [inferred].
- Evidence: keyboard-shortcut-rows.ts:90-95

## GAP-F084-07-NOTBUILT

**Send key and keyboard shortcuts: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F084-07](../../20-features/084-general-and-appearance-settings/F084-07-send-key-and-keyboard-shortcuts.md)
- Requirement items: S84.14
- Detail: CLI: S84.14; VS Code: S84.14; Chrome: S84.14

## GAP-F084-08-01

**No general interface sound effects setting exists; only notification sound.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-08](../../20-features/084-general-and-appearance-settings/F084-08-sound-effects-and-haptics.md)
- Detail: Affects: All apps. Work needed: Decide scope; update S84.16 and the brief.
- Evidence: Only agentNotifications.sound and soundEnabled found

## GAP-F084-08-02

**Brief and draft say the desktop switch does nothing; code shows it is read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-08](../../20-features/084-general-and-appearance-settings/F084-08-sound-effects-and-haptics.md)
- Detail: Affects: Documentation accuracy. Work needed: Correct the brief rows.
- Evidence: notification_center.rs:615; agentNotifications.ts:279

## GAP-F084-08-03

**Tauri switch text promises more than the code does.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-08](../../20-features/084-general-and-appearance-settings/F084-08-sound-effects-and-haptics.md)
- Detail: Affects: Retained Tauri build. Work needed: Reword or implement.
- Evidence: NotificationsSettings.tsx:124-126 vs notification_center.rs:608-617

## GAP-F084-08-04

**Haptics do not follow the account.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-08](../../20-features/084-general-and-appearance-settings/F084-08-sound-effects-and-haptics.md)
- Detail: Affects: People with several phones. Work needed: Decide if it should sync.
- Evidence: cloudSettingsMapping.ts has no haptics

## GAP-F084-08-05

**No web or other app sound setting.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-08](../../20-features/084-general-and-appearance-settings/F084-08-sound-effects-and-haptics.md)
- Detail: Affects: Web, CLI, VS Code, Chrome. Work needed: Only if product wants it (CLI has a bell option in config, config.rs:1355-1359, outside this item).
- Evidence: No controls found

## GAP-F084-08-NOTBUILT

**Sound effects and haptics: not built on Web, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Mobile, CLI, VS Code, Chrome
- Features: [F084-08](../../20-features/084-general-and-appearance-settings/F084-08-sound-effects-and-haptics.md)
- Requirement items: S84.16
- Detail: Web: S84.16; Mobile: S84.16; CLI: S84.16; VS Code: S84.16; Chrome: S84.16

## GAP-F084-09-01

**No timezone control; the brief's 'set the timezone' is unmet.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-09](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Detail: Affects: Web, Desktop, Mobile people who travel or use a different zone. Work needed: Add a select bound to quietHours.timezone, validated by isValidIanaTimeZone.
- Evidence: TimeFocusSection.tsx:41-43, 375

## GAP-F084-09-02

**Footer says 'currently apply on the Website', but servers and mobile also apply quiet hours.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-09](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Detail: Affects: All people reading the text. Work needed: Reword.
- Evidence: TimeFocusSection.tsx:375; job-handlers.ts:111; pushPreferenceSync.ts

## GAP-F084-09-03

**Quiet hours missing on VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-09](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Detail: Affects: VS Code and Chrome users. Work needed: Decide scope.
- Evidence: Brief S84.19

## GAP-F084-09-04

**Web Mobile push channel hidden until release.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-09](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Detail: Affects: Web users who use the phone app. Work needed: Update the surface status when mobile ships (owner call).
- Evidence: surface-status.ts:10

## GAP-F084-09-05

**Desktop Electron has no quiet hours for its own agent notifications.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-09](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Detail: Affects: Desktop users. Work needed: Confirm and decide.
- Evidence: agentNotifications.ts has no quiet-hours input [inferred]

## GAP-F084-09-NOTBUILT

**Notifications, quiet hours and timezone: not built on VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code, Chrome
- Features: [F084-09](../../20-features/084-general-and-appearance-settings/F084-09-notifications-quiet-hours-and-timezone.md)
- Requirement items: S84.19
- Detail: VS Code: S84.19; Chrome: S84.19

## GAP-F084-10-01

**No layout reset control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-10](../../20-features/084-general-and-appearance-settings/F084-10-sidebar-items-and-layout-reset.md)
- Detail: Affects: Web and Desktop. Work needed: Add a confirmed action; define what 'layout' includes.
- Evidence: layout-store.ts:52-58 (sign-out only)

## GAP-F084-10-02

**Collapsed by default and auto-hide are not implemented.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-10](../../20-features/084-general-and-appearance-settings/F084-10-sidebar-items-and-layout-reset.md)
- Detail: Affects: Web and Desktop. Work needed: Decide if needed; update the brief.
- Evidence: No code found

## GAP-F084-10-03

**Sidebar items not on mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-10](../../20-features/084-general-and-appearance-settings/F084-10-sidebar-items-and-layout-reset.md)
- Detail: Affects: Mobile. Work needed: Decide scope.
- Evidence: Brief S84.23 'mobile missing'

## GAP-F084-10-04

**List may include items the person cannot see.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-10](../../20-features/084-general-and-appearance-settings/F084-10-sidebar-items-and-layout-reset.md)
- Detail: Affects: Web and Desktop non-admins. Work needed: Filter by availability.
- Evidence: GeneralSection.tsx:549 vs WebChatPage.tsx:7001

## GAP-F084-10-NOTBUILT

**Sidebar items and layout reset: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F084-10](../../20-features/084-general-and-appearance-settings/F084-10-sidebar-items-and-layout-reset.md)
- Requirement items: S84.23, S84.24
- Detail: Web: S84.24; Desktop: S84.24; Mobile: S84.23

## GAP-F084-11-01

**Startup destination has no control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-11](../../20-features/084-general-and-appearance-settings/F084-11-desktop-launch-and-quick-access.md)
- Detail: Affects: All apps. Work needed: Decide scope and design; implement per app.
- Evidence: S84.20; no code found

## GAP-F084-11-02

**Quick Ask has no on/off or placement option.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-11](../../20-features/084-general-and-appearance-settings/F084-11-desktop-launch-and-quick-access.md)
- Detail: Affects: Desktop. Work needed: Add settings if wanted.
- Evidence: quickAsk.ts:140-142 fixed placement

## GAP-F084-11-03

**Brief says Chrome companion is done, but the cited code is the approval UI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-11](../../20-features/084-general-and-appearance-settings/F084-11-desktop-launch-and-quick-access.md)
- Detail: Affects: Brief accuracy. Work needed: Correct the brief row.
- Evidence: side_panel.ts:7380-7392

## GAP-F084-11-04

**Shortcut choices limited to a short list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-11](../../20-features/084-general-and-appearance-settings/F084-11-desktop-launch-and-quick-access.md)
- Detail: Affects: Desktop. Work needed: Only if owner wants free recording; the shell rule exists for safety.
- Evidence: host-bridge.ts:161-170; garnishCore.ts:192

## GAP-F084-11-05

**Turning launch at login off is not asked about, by decision.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-11](../../20-features/084-general-and-appearance-settings/F084-11-desktop-launch-and-quick-access.md)
- Detail: Affects: Desktop. Work needed: None.
- Evidence: main.ts:2052 comment

## GAP-F084-11-NOTBUILT

**Desktop launch and quick access: not built on Web, Desktop, Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, VS Code, Chrome
- Features: [F084-11](../../20-features/084-general-and-appearance-settings/F084-11-desktop-launch-and-quick-access.md)
- Requirement items: S84.20, S84.21, S84.22
- Detail: Web: S84.20; Desktop: S84.20; Mobile: S84.20; VS Code: S84.20; Chrome: S84.20, S84.21, S84.22

## GAP-F084-12-01

**No experimental or preview opt-in on any app.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-12](../../20-features/084-general-and-appearance-settings/F084-12-experimental-features-and-restore-defaults.md)
- Detail: Affects: All apps. Work needed: Owner decision on whether to build it; then flags, entitlements and per-app UI.
- Evidence: S84.25; search found nothing

## GAP-F084-12-02

**No general restore-defaults action; only shortcuts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-12](../../20-features/084-general-and-appearance-settings/F084-12-experimental-features-and-restore-defaults.md)
- Detail: Affects: Web and Desktop (and others have nothing). Work needed: Define the reset scope, include synced appearance fields, add a confirmation.
- Evidence: web-settings-store.ts:158

## GAP-F084-12-03

**The brief says restore defaults is not applicable, but a shortcut reset exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F084-12](../../20-features/084-general-and-appearance-settings/F084-12-experimental-features-and-restore-defaults.md)
- Detail: Affects: Brief accuracy. Work needed: Correct S84.26.
- Evidence: KeyboardShortcutsDialog.tsx:330-340

## GAP-F084-12-NOTBUILT

**Experimental features and restore defaults: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F084-12](../../20-features/084-general-and-appearance-settings/F084-12-experimental-features-and-restore-defaults.md)
- Requirement items: S84.25
- Detail: Mobile: S84.25; VS Code: S84.25; Chrome: S84.25
