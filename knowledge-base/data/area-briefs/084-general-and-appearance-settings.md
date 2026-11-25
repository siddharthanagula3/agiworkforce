# Area 84. General and appearance settings

26 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S84.01 Display language.
- Should: The user can choose the interface display language and the UI switches to it.
- Status: web done, desktop done, cli missing, vscode missing
- Code: apps/web/features/settings/sections/GeneralSection.tsx:850; apps/web/features/settings/components/LanguageSelector.tsx:10

## S84.02 Timezone.
- Should: The user can see and set the timezone used for schedules, reminders and quiet hours.
- Status: not applicable anywhere

## S84.03 Theme.
- Should: The user can choose light, dark or system theme and it applies and persists.
- Status: web done, desktop done, mobile done, cli done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:822; apps/web/features/settings/sections/GeneralSection.tsx:168; apps/mobile/src/features/settings/appearance/index.tsx:10; apps/mobile/src/features/settings/appearance/index.tsx:20; apps/cli/src/tui/tui_app.rs:3719; apps/cli/src/tui/tui_app.rs:3755; apps/cli/src/tui/tui_app.rs:4708; apps/extension/src/features/options/appearance-section.ts:89

## S84.04 Accent color where offered.
- Should: Where offered, the user can pick an accent colour that recolours the interface.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/GeneralSection.tsx:1017; apps/web/shared/components/AppearancePreferences.tsx:10; apps/mobile/src/features/settings/index.tsx:470; apps/mobile/src/features/settings/accent-color/index.tsx:24

## S84.05 Text size.
- Should: The user can change the chat text size and it applies across messages.
- Status: web done, desktop done, chrome missing
- Code: apps/web/features/settings/sections/GeneralSection.tsx:1186; apps/web/shared/components/AppearancePreferences.tsx:8

## S84.06 Interface density.
- Should: The user can switch interface density (compact / comfortable).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S84.07 Reduced motion.
- Should: The user can reduce animation (in-app setting or honouring the OS reduce-motion preference).
- Status: web done, desktop done, cli done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:1095; apps/web/shared/components/AppearancePreferences.tsx:40; apps/cli/src/output.rs:29; apps/cli/src/output.rs:37; apps/extension/src/side_panel.ts:4786

## S84.08 Code theme.
- Should: The user can choose the syntax-highlighting theme for code blocks.
- Status: web done, desktop done, mobile missing, cli missing, chrome missing
- Code: apps/web/features/settings/sections/AppearanceSection.tsx:251; apps/web/features/settings/sections/AppearanceSection.tsx:81

## S84.09 Code line wrapping.
- Should: The user can turn line wrapping for code blocks on or off.
- Status: web done, desktop done, mobile missing, chrome missing
- Code: apps/web/features/settings/sections/GeneralSection.tsx:1206; apps/web/shared/components/AppearancePreferences.tsx:9

## S84.10 Default model.
- Should: The user can set a default model that new conversations start with.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:925; apps/web/features/settings/sections/GeneralSection.tsx:918; apps/mobile/app/(app)/models.tsx:200; apps/mobile/app/(app)/models.tsx:100; apps/cli/src/lib.rs:1195; apps/cli/src/lib.rs:2264; apps/extension-vscode/package.json:997; apps/extension-vscode/src/core/commandSetup.ts:1097

## S84.11 Default effort.
- Should: The user can set a default reasoning effort used for new turns.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:976; apps/web/features/settings/sections/GeneralSection.tsx:994; apps/mobile/stores/agentControlStore.ts:51; apps/mobile/src/features/model-picker/components/EffortSlider.tsx:53; apps/cli/src/tui/tui_app.rs:4255; apps/cli/src/config.rs:776; apps/extension-vscode/package.json:1103; apps/extension-vscode/src/features/settings/SettingsPanel.ts:180

## S84.12 Default mode.
- Should: The user can choose the default mode new conversations start in (e.g. chat vs agent/work, ask vs auto).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:589; apps/web/features/settings/sections/GeneralSection.tsx:307; apps/mobile/src/features/drawer/components/DrawerContent.tsx:635; apps/mobile/src/features/chat/store/appModeStore.ts:1; apps/mobile/src/features/chat/store/appModeStore.ts:16; apps/cli/src/lib.rs:2881; apps/cli/src/onboarding.rs:663; apps/extension-vscode/package.json:1085

## S84.13 Default workspace.
- Should: The user can choose which workspace the app opens in by default.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S84.14 Send-key behavior.
- Should: The user can choose whether Enter sends or inserts a newline (and which modifier sends).
- Status: web done, desktop done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/GeneralSection.tsx:614; apps/web/features/settings/sections/GeneralSection.tsx:325

## S84.15 Keyboard shortcuts.
- Should: Settings let the user view and customise (disable or rebind) keyboard shortcuts.
- Status: web done, desktop done, cli done, vscode done, chrome done
- Code: apps/web/features/settings/sections/GeneralSection.tsx:1228; apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx:34; apps/desktop/electron/settingsStore.ts:30; apps/desktop/electron/appMenu.ts:100; apps/cli/src/tui/tui_app.rs:4078; apps/cli/src/keybindings.rs:117; apps/extension-vscode/package.json:1140; apps/extension-vscode/src/core/commandSetup.ts:1097

## S84.16 Sound effects.
- Should: The user can turn interface sound effects on or off.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S84.17 Haptics.
- Should: On devices with haptics, the user can turn haptic feedback on or off.
- Status: mobile done
- Code: apps/mobile/src/features/settings/general/index.tsx:40; apps/mobile/src/features/settings/general/index.tsx:27

## S84.18 Notification channels.
- Should: The user can choose which channels (push, email, in-app/browser) deliver each notification category.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/settings/sections/NotificationsSection.tsx:38; apps/web/features/settings/sections/NotificationsSection.tsx:145; apps/mobile/src/features/settings/notifications/NotificationCategoryDetailScreen.tsx:35; apps/mobile/services/pushPreferenceSync.ts:1

## S84.19 Quiet hours.
- Should: The user can set quiet hours during which notifications are held.
- Status: web done, desktop done, mobile done, vscode missing, chrome missing
- Code: apps/web/features/settings/sections/TimeFocusSection.tsx:78; apps/web/features/settings/sections/TimeFocusSection.tsx:88; apps/mobile/src/features/settings/notifications/index.tsx:186; apps/mobile/src/features/settings/notifications/index.tsx:370

## S84.20 Startup destination.
- Should: The user can choose what the app opens to on launch (new chat, last conversation, a project).
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S84.21 Launch-at-login preference.
- Should: The desktop app can be set to launch at login.
- Status: desktop done
- Code: apps/desktop/electron/appMenu.ts:125; apps/desktop/electron/launchAtLogin.ts:15

## S84.22 Companion-window preference.
- Should: The user can configure the companion/quick-access window (enable, shortcut, where it appears).
- Status: desktop done, chrome done
- Code: apps/desktop/electron/appMenu.ts:100; apps/desktop/electron/settingsStore.ts:30; apps/extension/src/side_panel.ts:7392; apps/extension/src/side_panel.ts:7386

## S84.23 Sidebar behavior.
- Should: The user can configure sidebar behaviour (which items show, collapsed by default, auto-hide).
- Status: web done, desktop done, mobile missing
- Code: apps/web/features/settings/sections/GeneralSection.tsx:1058; apps/web/features/settings/sections/GeneralSection.tsx:1048

## S84.24 Layout reset.
- Should: The user can reset panel sizes and layout to defaults.
- Status: web missing, desktop missing

## S84.25 Experimental-feature enrollment.
- Should: The user can opt into experimental or preview features from settings.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S84.26 Restore defaults.
- Should: Settings offer a restore-defaults action that resets preferences.
- Status: not applicable anywhere
