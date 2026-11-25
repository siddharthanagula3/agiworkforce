---
id: "AREA-084"
type: "area"
title: "General and appearance settings"
features: ["F084-01", "F084-02", "F084-03", "F084-04", "F084-05", "F084-06", "F084-07", "F084-08", "F084-09", "F084-10", "F084-11", "F084-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 84. General and appearance settings

This area holds the settings that decide how AGI Workforce looks and behaves for one person: theme, accent colour, text size, motion, code display, display language, what a new chat starts with, how the Enter key sends, notifications and quiet hours, and a few desktop launch options. A person gets an app that matches their eyes, their language and their habits, and on web and mobile those choices follow them to other devices after sign-in. It matters because the same preferences are read in six different apps, so a setting that is saved but not read by an app looks like a broken control to the user.

**Who uses it.** Every user on every surface, as far as the code shows. Only signed-in users get their choices copied to the account on web and mobile (CloudSettingsSync.tsx:194-199 stops when no one is signed in); signed-out users keep device-only values. Some defaults are plan-gated: on web, models above the user's plan show "Upgrade to use" and higher reasoning-effort levels are shown disabled (GeneralSection.tsx:361, 460). Workspace admins and developers have no separate path in this area. Desktop uses the same web settings screens, because the desktop window shows the hosted web app.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F084-01](F084-01-theme-light-dark-or-system.md) | Theme (light, dark or system) | built | built | built | built | n/a | built |
| [F084-02](F084-02-accent-colour.md) | Accent colour | built | built | built | no | no | no |
| [F084-03](F084-03-chat-text-size-interface-density-and-motion.md) | Chat text size, interface density and motion | partly | partly | no | built | n/a | partly |
| [F084-04](F084-04-code-blocks-syntax-theme-and-line-wrapping.md) | Code blocks: syntax theme and line wrapping | built | built | no | no | n/a | no |
| [F084-05](F084-05-display-language.md) | Display language | built | built | n/a | no | no | n/a |
| [F084-06](F084-06-new-chat-defaults-model-reasoning-effort-mode-and.md) | New chat defaults: model, reasoning effort, mode and workspace | partly | partly | partly | partly | partly | partly |
| [F084-07](F084-07-send-key-and-keyboard-shortcuts.md) | Send key and keyboard shortcuts | built | built | n/a | partly | partly | partly |
| [F084-08](F084-08-sound-effects-and-haptics.md) | Sound effects and haptics | no | partly | partly | no | no | no |
| [F084-09](F084-09-notifications-quiet-hours-and-timezone.md) | Notifications, quiet hours and timezone | built | built | built | n/a | no | no |
| [F084-10](F084-10-sidebar-items-and-layout-reset.md) | Sidebar items and layout reset | partly | partly | no | n/a | n/a | n/a |
| [F084-11](F084-11-desktop-launch-and-quick-access.md) | Desktop launch and quick access | no | partly | no | n/a | no | no |
| [F084-12](F084-12-experimental-features-and-restore-defaults.md) | Experimental features and restore defaults | partly | partly | no | n/a | no | no |

Requirement items for this area: [10-requirements/capabilities/084-general-and-appearance-settings.md](../../10-requirements/capabilities/084-general-and-appearance-settings.md).

## How this area works in the code

1. **The person changes a setting on a screen.** On web, the Appearance screen shows theme, accent, contrast, motion, font, text size, code wrap and code theme. The General screen shows display language, defaults, composer and sidebar rows. Each control reads and writes one value through a hook or store. (`apps/web/features/settings/sections/AppearanceSection.tsx:44`, `apps/web/features/settings/sections/AppearanceSection.tsx:210`, `apps/web/features/settings/sections/GeneralSection.tsx:361`, `apps/web/features/settings/sections/GeneralSection.tsx:526`)
2. **The value is saved in the web settings store on the device.** Most web appearance and composer values are fields of one zustand store that is persisted to browser storage under one key. Each field has a setter. (`apps/web/shared/stores/web-settings-store.ts:52-114`, `apps/web/shared/stores/web-settings-store.ts:116-143`, `apps/web/shared/stores/web-settings-store.ts:209-213`)
3. **Theme is handled by the theme provider.** The theme hook calls the theme library, which stores the value under the key 'theme' and sets the theme class on the page. The provider then sets data-theme and data-theme-preference on the page root. A stored value that is not valid falls back to dark. (`apps/web/shared/hooks/useAppTheme.ts:12-21`, `apps/web/shared/components/ThemeProvider.tsx:18-26`, `apps/web/shared/components/ThemeProvider.tsx:41-50`, `apps/web/shared/components/ThemeConstants.ts:3`)
4. **Stored values become page attributes.** A component mounted at the root of the settings and app runtime reads the store and sets or removes one attribute per setting on the page root. It also hands the code theme to the syntax highlighter. (`apps/web/shared/components/AppearancePreferences.tsx:8-62`, `apps/web/app/settings/SettingsRuntimeProviders.tsx:26`, `apps/web/app/settings/SettingsRuntimeProviders.tsx:37-42`)
5. **Stylesheets apply the attributes.** CSS rules keyed on those attributes change the accent colour, text size, font, contrast, code wrapping and motion. The reduced-motion rule for the OS setting is separate. (`apps/web/app/globals.css:722-760`, `apps/web/app/globals.css:932-972`, `apps/web/app/globals.css:979`, `apps/web/app/globals.css:1298`, `apps/web/app/globals.css:1928`)
6. **Signed-in users: the values are copied to the account.** A sync component reads the values, builds one appearance record, and after a 400 ms pause writes the changed fields to the server. Language and custom commands are written the same way. Nothing syncs when no one is signed in. On sign-in it pulls the account copy and applies it to the store. (`apps/web/features/settings/components/CloudSettingsSync.tsx:37`, `apps/web/features/settings/components/CloudSettingsSync.tsx:61-111`, `apps/web/features/settings/components/CloudSettingsSync.tsx:192-273`, `apps/web/features/settings/components/CloudSettingsSync.tsx:300-311`)
7. **Names are mapped between apps.** The web and mobile names for accent and font are translated to one shared vocabulary. Unknown names from another app are ignored on load. (`apps/web/features/settings/lib/appearance-namespace.ts:56-85`, `apps/web/features/settings/lib/appearance-namespace.ts:109-127`, `apps/web/features/settings/lib/appearance-namespace.ts:137-138`)
8. **The server stores the namespace.** The preferences route validates the patch with a schema, then writes the namespace inside a database transaction with a version check. The client calls the path defined in the shared contract package. Rows live in the user settings table as a JSON column. (`apps/web/app/api/settings/preferences/route.ts:27-36`, `apps/web/app/api/settings/preferences/route.ts:66-72`, `apps/web/app/api/settings/preferences/route.ts:97-120`, `packages/contracts/cloud-contracts/src/managed-cloud-settings-client.ts:15`)
9. **Display language is applied at once.** The language selector calls the i18n library. The library stores the choice in a cookie and in browser storage, and sets the document language and direction. (`apps/web/features/settings/components/LanguageSelector.tsx:10-22`, `apps/web/app/i18n/index.ts:21`, `apps/web/app/i18n/index.ts:56-66`, `apps/web/app/i18n/index.ts:72-76`)
10. **Desktop and Chrome keep their own copies.** The desktop shell stores its window theme and launch options in a settings file in the app data folder. Chrome stores the theme in extension storage and follows changes to it. (`apps/desktop/electron/settingsStore.ts:17-19`, `apps/desktop/electron/settingsStore.ts:55-60`, `apps/desktop/electron/main.ts:606-618`, `apps/extension/src/features/appearance/themePreference.ts:29-43`)
11. **CLI reads its config at startup.** The CLI keeps theme and reduced-motion values in its config. The theme is restored before the first frame and applied to the palette. Reduced motion, or plain output, turns off animation. (`apps/cli/src/config.rs:146`, `apps/cli/src/config.rs:155`, `apps/cli/src/tui/tui_app.rs:650-657`, `apps/cli/src/tui/terminal_palette.rs:134-139`, `apps/cli/src/tui/tui_app.rs:7123`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/settings/sections/AppearanceSection.tsx` | Web Appearance screen: theme, accent, contrast, motion, font, text size, code wrap and code theme controls. |
| `apps/web/features/settings/sections/GeneralSection.tsx` | Web General screen: display language, default model, effort, mode, composer send key, sidebar items, read-aloud and shortcuts link. |
| `apps/web/shared/stores/web-settings-store.ts` | The persisted store that holds most web appearance and composer values, under one browser storage key. |
| `apps/web/shared/components/AppearancePreferences.tsx` | Turns stored values into page attributes that the stylesheet reads, and sets the code theme. |
| `apps/web/features/settings/components/CloudSettingsSync.tsx` | Copies signed-in users' appearance, language, sidebar and composer values to the account and back. |
| `apps/web/features/settings/lib/appearance-namespace.ts` | Maps web and mobile names for accent and font to one shared vocabulary. |
| `apps/web/app/api/settings/preferences/route.ts` | Server read and write for account settings namespaces, with a version check and a database transaction. |
| `apps/web/features/settings/sections/NotificationsSection.tsx` | Per-event notification channel choices, with channels hidden when a surface is not released. |
| `apps/web/features/settings/sections/TimeFocusSection.tsx` | Quiet hours form (days, start and end, save) and the read-only timezone line. |
| `apps/mobile/src/features/settings/appearance/index.tsx` | Mobile Appearance screen: theme choice for the current mode (Local or Cloud). |
| `apps/desktop/electron/main.ts` | Desktop preference writes: window theme, launch at login, shortcut changes and menu-bar choice. |
| `apps/cli/src/tui/tui_app.rs` | CLI startup: restores the saved theme and applies reduced motion. |
| `apps/extension/src/features/options/appearance-section.ts` | Chrome Options page Theme select with load and save status text. |

## What is stored

- Web appearance, composer, sidebar, shortcut, voice-speed and custom-command values: Browser local storage, key 'agiworkforce-web-settings' (web-settings-store.ts:210)
- Web theme choice (light, dark or system): Browser local storage, key 'theme' (ThemeConstants.ts:3, ThemeProvider.tsx:46)
- Web display language choice: Cookie and browser local storage, key 'agiworkforce-language' (i18n/index.ts:21, 56-66)
- Web reasoning effort (on/off and level): Browser local storage, key 'agi-thinking-store' (thinking-store.ts:120); this is per device and not in the account sync list
- Account appearance, language, custom commands, notifications, quiet hours and default model: Server table public.user_settings, JSON column, one namespace each: appearance, language, notifications, time-focus, default-model (route.ts:66-72; CloudSettingsSync.tsx:208-210; default-model-preference.ts:18)
- Quiet-hours reminder dismissal for the current window: Browser session storage (TimeFocusReminder.tsx:32, 162)
- Desktop window theme, launch at login, menu-bar choice, shortcuts, zoom, window position and agent alerts: Settings file settings.json in the app data folder (settingsStore.ts:17-19, 55-60; garnishCore.ts:528-560)
- Chrome theme choice: Extension local storage, key 'agi_theme_preference' (themePreference.ts:3)
- Chrome last reasoning effort: Extension local storage, key 'agi_reasoning_effort' (policy.ts:196)
- CLI theme and reduced-motion values: The CLI config file, ui section (config.rs:146, 155); the file path was not opened
- Mobile theme, accent, haptics, default effort and app mode: Mobile device storage through zustand stores (settingsStore.ts:45-144; appModeStore.ts:3 uses MMKV); the exact stores for the Local and Cloud appearance values were not opened
- VS Code default model, default mode, default effort and send key: VS Code user settings declared in apps/extension-vscode/package.json:1219, 1251, 1404, 1428

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Default model plan gate**: Models above the person's plan show 'Upgrade to use' and cannot be saved as the default. (apps/web/features/settings/sections/GeneralSection.tsx:361 (choices built from isModelOnPlan and upgradePlanFor); apps/web/features/chat/lib/default-model-preference.ts:47)
- **Reasoning effort plan gate**: Effort levels above the plan cap are shown disabled; the server clamps them too. (apps/web/features/settings/sections/GeneralSection.tsx:460-478 (splitEffortsByEntitlement); the server side is named in that comment)
- **New chats start in plan hint**: Shows the plan note for Work mode. (apps/web/features/settings/sections/GeneralSection.tsx:583-588)
- **Sidebar hideable flag**: Only destinations marked hideable appear in Sidebar items; Chat is never hideable. (apps/web/features/settings/sections/GeneralSection.tsx:540-548 (APP_NAV_DESTINATIONS filter))
- **Mobile feature flags for App language and Browser**: Both rows are hidden in v1 because the flags are false. (apps/mobile/lib/v1FeatureFlags.ts:36 (appLanguage false), :38 (linkBrowser false); read at apps/mobile/src/features/settings/general/index.tsx:45)
- **Surface release status**: Channels for surfaces that are not released (desktop, cli, mobile, vscode, chrome) are hidden in notification choices. Web is the only 'Available now' surface. (apps/web/lib/surface-status.ts:6-13; read at apps/web/features/settings/sections/NotificationsSection.tsx:121)
- **Launch at login**: Turns the desktop login item on or off; the system answer is what is shown. Turning on asks for confirmation. (apps/desktop/electron/launchAtLogin.ts:12-28; apps/desktop/electron/appMenu.ts:28; apps/desktop/electron/main.ts:2060, 2185-2190; default false in apps/desktop/electron/garnishCore.ts:565)
- **Haptic feedback setting**: When off, button presses, copy and approval actions skip the haptic pulse. (apps/mobile/src/features/settings/general/index.tsx:143 (switch); read at apps/mobile/components/ui/Button.tsx:54-58, apps/mobile/src/shared/hooks/useCopyAction.ts:31, apps/mobile/src/shared/components/ApprovalModal.tsx:63)
- **OS reduced-motion preference**: Turns off animation through CSS media queries, with no in-app override needed. (apps/web/app/globals.css:986, 1373, 1739; apps/extension/src/side_panel.ts:4622; apps/extension/src/options.ts:246, 1214-1215)
- **CLI reduced motion and plain output**: Reduced motion (config) or plain mode (--plain or AGI_PLAIN) turns off animation in the terminal UI. (apps/cli/src/tui/tui_app.rs:7123; apps/cli/src/config.rs:155, 1668 (AGI_PLAIN); apps/cli/src/output.rs:41)
- **Send key behaviour (VS Code)**: Chooses whether Enter, a modifier, or Enter-when-single-line sends a prompt. (apps/extension-vscode/package.json:1251-1266; read at apps/extension-vscode/src/platform/config.ts:282; reacts at apps/extension-vscode/src/extension.ts:504)
- **Desktop shortcut writes**: A page may only set a shortcut from the listed choices; the shell refuses one the system will not take. (apps/desktop/electron/main.ts:2159-2181; apps/desktop/electron/shortcuts.ts:150)

## Shared between apps

Shared across apps: the web settings screens and stores (apps/web) are the source for web and desktop, since the desktop window shows the hosted web app. Shared packages used by these screens: @agiworkforce/types (time-focus preferences, effort labels, cloud work modes), @agiworkforce/cloud-contracts (the preferences path and sync schemas), @agiworkforce/unified-chat/shiki-highlighter (code themes), @agiworkforce/i18n (languages). The web and mobile appearance namespace is one shared vocabulary, written as a comment in appearance-namespace.ts:53-55. Separate per app: mobile has its own settings screens and stores (apps/mobile/src/features/settings and apps/mobile/stores); the CLI keeps its own config and terminal palette in Rust (apps/cli/src/config.rs, apps/cli/src/tui); Chrome has its own options page and theme module (apps/extension/src/options.ts, apps/extension/src/features/appearance); the desktop shell has its own Electron code for window theme, launch at login, menus and shortcuts (apps/desktop/electron); VS Code declares its own settings in its package.json.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The brief's web line numbers point past the end of the file. GeneralSection.tsx is 881 lines, but the brief cites lines 1017, 1058, 1095, 1186, 1206 and 1228. Lines 822 and 850 point inside the read-aloud voice row, not the theme or language controls. Theme and accent now live in AppearanceSection.tsx and the language row is at GeneralSection.tsx:526. (apps/web/features/settings/sections/GeneralSection.tsx:808-859 (read-aloud row that the brief's 822 and 850 land in))
- The desktop Sound Effects switch saves soundEnabled, but nothing reads it. The brief says desktop sound is missing, yet the switch is shown and writes a value that has no effect. (apps/desktop/src/features/settings/NotificationsSettings.tsx:122-129; the only other references are the type at packages/client/desktop-command-client/src/notifications.ts:46 and defaults at apps/desktop/src/features/settings/SettingsPanel.tsx:78)
- The brief says VS Code send-key behaviour is missing, but the extension declares composer.enterBehavior with three modes and reads it. (apps/extension-vscode/package.json:1251-1266; apps/extension-vscode/src/platform/config.ts:282)
- The brief says sidebar behaviour includes collapsed by default and auto-hide. The code only shows or hides each item. (apps/web/features/settings/sections/GeneralSection.tsx:540-581; apps/web/shared/stores/web-settings-store.ts:162-169)
- The brief says the send key can choose which modifier sends. The code has only an on/off switch, and the hint text hard-codes Cmd or Ctrl plus Enter. (apps/web/features/settings/sections/GeneralSection.tsx:607-624)
- The brief marks timezone as not applicable, but quiet hours show the browser's timezone as a read-only line. The person cannot change it. (apps/web/features/settings/sections/TimeFocusSection.tsx:41-43 and :375)
- Quiet hours are described as holding notifications, but the footer says they apply only on the Website. No code that suppresses email or mobile push by quiet hours was found in the places searched. (apps/web/features/settings/sections/TimeFocusSection.tsx:375; apps/web/features/time-focus/TimeFocusReminder.tsx:158-162)
- The brief marks mobile push as done, but the web notification screen only shows it when the mobile surface is released, and the surface status says mobile is 'Coming soon'. The brief's desktop, CLI, VS Code and Chrome 'done' statuses also conflict with 'Coming soon' in the same file. (apps/web/lib/surface-status.ts:6-13; apps/web/features/settings/sections/NotificationsSection.tsx:60-61, 121)
- Accent colours differ between apps. Web has five colours and mobile has ten. A mobile-only colour name is ignored when web loads the account value, so web keeps its own colour and the two devices can disagree. (apps/web/shared/stores/web-settings-store.ts:13-19; apps/mobile/src/features/settings/accent-color/index.tsx:13-24; apps/web/features/settings/lib/appearance-namespace.ts:137-138)
- Reasoning effort is saved on the device only. It is not in the account sync list, while the default model is saved to the account. The brief does not say which should apply. (apps/web/shared/stores/thinking-store.ts:120; apps/web/features/settings/components/CloudSettingsSync.tsx:66-78 (no effort field))
- The web settings store reads and writes browser storage directly with no guard. A browser that blocks storage can throw here and take the settings screens down. (apps/web/shared/stores/web-settings-store.ts:209-212)
- Before the theme is known, the Appearance screen shows Dark as the selected theme, so the wrong button is highlighted for a moment on a light or system device. (apps/web/features/settings/sections/AppearanceSection.tsx:37)
- The brief's companion-window and Chrome reduced-motion code references do not match the code. The side panel lines cited for companion window are approval UI, and the line cited for reduced motion is a CSS comment. The real reduced-motion rule is at side_panel.ts:4622. (apps/extension/src/side_panel.ts:4622 (real rule); side_panel.ts:4786 is a CSS comment in the autonomy chip style)
- The brief's mobile default-mode reference is the Local or Cloud mode toggle in the drawer, not a default-mode setting. The mobile default mode value lives in a store with no settings control found. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:635; apps/mobile/stores/agentControlStore.ts:10-14)
- The brief's mobile accent reference (settings/index.tsx:470) is the profile photo button. The accent screen is reached by a route that was not traced from the settings list. (apps/mobile/src/features/settings/index.tsx:462-480)
- The brief says restore defaults is not applicable anywhere. The code has a restore action, but it only resets keyboard shortcuts. (apps/web/shared/stores/web-settings-store.ts:96 and :158; apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx:207-241)
- The quick-ask (companion) window has a shortcut setting on desktop, but no setting to turn it on or off, or to choose where it appears, which the brief lists. (apps/desktop/electron/garnishCore.ts:47; apps/desktop/electron/appMenu.ts:183-186)

## Not established

- No build, test, server or install was run, because this was a read-only task.
- The mobile Local and Cloud appearance and accent stores (localSettingsStore and cloudSettingsStore) were not opened, so where mobile keeps theme values on the device is unconfirmed.
- The CLI config file path and the command name that sets config values were not opened. The line apps/cli/src/config.rs:1562-1570 handles the 'theme' key in a setter, but the public command was not traced.
- Whether CLI keybindings can be changed (apps/cli/src/keybindings.rs:117 per the brief) was not opened.
- The list of selectable display languages (SELECTABLE_LANGUAGES in the i18n package) and the code theme list (CODE_THEMES) were not opened.
- Whether quiet hours suppress email or push delivery on the server was not established. The search found only the web reminder.
- Whether mobile has a default-mode control was not established. The default mode value exists in a store but no settings control was found.
- Whether the chrome default model exists was not established. No default-model setting was found in the extension code searched.
- The mobile default model is the selected model in a store; how it is saved was not traced.
- Whether the desktop Sound Effects value is read by a native notification path outside the code searched was not established.
- The Chrome side panel's reasoning effort remembered value (side_panel.ts:11501 and :11111) was read but not fully traced.
- Whether the Keyboard shortcuts sheet on web and the desktop menu accelerators stay in step was not traced beyond the lines cited.
- Plan limits for notification channels, quiet hours and sidebar items were not seen in the code read.
- Environment values that change any of these settings were not searched for.
