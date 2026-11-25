---
id: "F084-07"
type: "feature"
title: "Send key and keyboard shortcuts"
aliases: ["Send with Enter", "Send key", "Composer enter behavior", "composer.enterBehavior", "Keyboard shortcuts", "View shortcuts", "Keyboard (settings pane)", "Shortcut rebinding", "Restore defaults (shortcuts)", "[ui.keybindings]", "S84.14", "S84.15"]
area: "84 General and appearance settings"
available_on: ["web", "desktop", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "seen failing", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S84.14", "S84.15"]
depends_on: ["surface:web", "surface:desktop", "surface:vscode", "surface:cli", "surface:chrome", "file:apps/web/shared/stores/web-settings-store.ts", "file:apps/web/features/chat/hooks/use-keyboard-shortcuts.ts", "api:PUT /api/settings/preferences", "table:user_settings", "store:agiworkforce-web-settings", "SYS-shared-ui-and-design", "SYS-api-and-contracts", "SYS-sync-and-continuity"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F084-07 Send key and keyboard shortcuts

Lets a person choose how the message box sends (Enter or Cmd/Ctrl+Enter) and see, switch off or rebind keyboard shortcuts. Web and Desktop offer an on/off send switch and a shortcut sheet. VS Code has a three-way send setting. CLI uses a config file. Chrome lists its two shortcuts and opens the browser's own page.

Area: [84. General and appearance settings](README.md). Requirement items: [S84.14](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8414), [S84.15](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8415).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | seen failing |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Web and Desktop (the Desktop window shows the hosted web app): a 'Send with Enter' switch decides whether Enter sends or adds a new line, and a 'Keyboard' pane lists shortcuts, lets the person record a new key combination for four of them, switch app shortcuts off, and restore defaults. VS Code has the setting agiWorkforce.composer.enterBehavior with three values. The CLI reads [ui.keybindings] in config.toml for seven global actions. Chrome shows its two browser commands read-only and links to chrome://extensions/shortcuts.

**Why it exists.** People type in different ways. Some want Enter to add a line and a modifier to send, for long prompts, or for IME (input method) typing. Some shortcut keys clash with other tools, so they need to be moved or turned off. The brief's S84.14 and S84.15 say the user can choose the send key and view and customise shortcuts.

**Who uses it.** Keyboard-heavy chat users, developers in VS Code or the CLI, people typing in languages that use an input method editor, and people whose browser or OS already uses a default shortcut.

**Problems it solves**

- Accidental send when Enter is pressed to add a line
- Shortcut clashes with other apps or the browser
- Not knowing which shortcuts exist
- Needing to undo many custom keys at once

**Use cases**

- A person writing long multi-paragraph prompts turns Send with Enter off so Enter adds a line and Cmd/Ctrl+Enter sends.
- A person whose copy-last-message shortcut clashes with another tool records a new combination in the Keyboard pane.
- A VS Code user sets Cmd/Ctrl+Enter as the send key.
- A CLI user moves the cycle-model action to another chord in config.toml.

## 2. User experience

**Where to find it**

- Web: Settings, General, section 'Composer', row 'Send with Enter' (apps/web/features/settings/sections/GeneralSection.tsx:325, 607).
- Web: Settings, General, row 'Keyboard shortcuts' with link 'View shortcuts' (GeneralSection.tsx:720-731) opens the 'Keyboard' pane (apps/web/features/settings/components/WebSettingsModal.tsx:297). The pane also opens as a dialog titled 'Keyboard Shortcuts' (KeyboardShortcutsDialog.tsx) with a tip to press Cmd/Ctrl+/ (show-shortcuts, default chord named in apps/desktop/electron/appMenu.ts, PAGE_KEYBOARD_SHORTCUTS_ACCELERATOR).
- Desktop (Electron): the same Settings modal, since the window shows the hosted web app (AGENTS.md section 5 and apps/web/features/settings/components/WebSettingsModal.tsx:250). Desktop adds a read-only group 'Desktop app' in the Keyboard pane (KeyboardShortcutsDialog.tsx, section id shortcut-group-desktop).
- VS Code: setting agiWorkforce.composer.enterBehavior (apps/extension-vscode/package.json:1251) and the AGI settings panel, row 'Send key' (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1451, 2300). VS Code's own Keyboard Shortcuts editor changes extension key bindings (package.json contributes.keybindings; helpMenu.ts opens workbench.action.openGlobalKeybindings).
- CLI: [ui.keybindings] table in config.toml (apps/cli/src/keybindings.rs:1-8, apps/cli/src/config.rs:171).
- Chrome: Options page, section 'Keyboard shortcuts' (apps/extension/src/features/options/destinations.ts:69-71; locale key optKeyboardTitle).
- Mobile: not applicable (brief marks it n/a for send key and shortcuts).

**Before you start**

- Web and Desktop: no account is needed to change either control; values are saved in the browser or window store. Sync to the account happens only when signed in, and only for the send switch (apps/web/features/settings/components/CloudSettingsSync.tsx:73, 285).
- Desktop menu chords are fixed by the shell and cannot be recorded here (KeyboardShortcutsDialog.tsx comment on the Desktop app group).
- VS Code and CLI: edit settings or config files.

**Screens and controls**

- Switch 'Send with Enter' with hint 'Off: Enter starts a new line and Cmd + Enter sends.' (Ctrl + Enter on non-Mac) (GeneralSection.tsx:607-624).
- Keyboard pane: heading 'Keyboard', instruction 'To change a shortcut, select its keys, then press the new combination.', search box 'Search shortcuts', groups 'App', 'Composer', 'Code', 'Desktop app' (KeyboardShortcutsDialog.tsx:193-330).
- Each rebindable row has a button of key badges; while recording it shows 'Press keys'. App-scope rows have a switch. Composer and Code rows have no switch.
- Footer: live summary such as '1 shortcut turned off', and button 'Restore defaults' (disabled when nothing is changed).
- VS Code select 'Send key' with options 'Enter', 'Enter, or Cmd/Ctrl+Enter with several lines', 'Cmd/Ctrl+Enter'.
- Chrome: list of commands with key caps or 'Not assigned', and a 'Configure' button on the open-side-panel row.

**Journey**

1. Send key on web: open Settings, then General, then Composer; toggle Send with Enter; type in the message box and press Enter or Cmd/Ctrl+Enter to check.
2. Shortcut change on web: open Settings, then General, then View shortcuts; find the shortcut; select its keys; press a new combination (it must include Cmd or Ctrl); the new keys show at once.
3. If the combination is reserved or taken, an alert line appears under the row and nothing is saved.
4. Switch off: use the row's switch (App group only).
5. Restore: press Restore defaults; if any key was recorded a confirmation titled 'Restore default shortcuts?' appears; confirm.
6. VS Code: open Settings, pick Send key, choose a value; the composer updates when the setting changes (extension.ts:504).
7. CLI: add a binding under [ui.keybindings] in config.toml and restart the full-screen CLI.
8. Chrome: open Options, read the shortcut list, press Configure to open chrome://extensions/shortcuts and change keys there.

**What the person sees and gets**

- Immediate change of key behaviour in the composer.
- Row error text under the recorded combination, for example 'Hold Cmd, and Shift if you like, while you press one key.' or '<keys> is already used by <name>.'
- Summary text in the footer; confirmation dialog on restore.
- Chrome shows 'Not assigned' when no chord is set, and an error line if the list cannot load.

**Settings**

- Send with Enter (web store key sendWithEnter, default true)
- Shortcut switches (disabledShortcutIds) and recorded chords (shortcutBindings)
- agiWorkforce.composer.enterBehavior (VS Code, default enter)
- agiWorkforce.composer.escapeStops (VS Code, related)
- followUpBehavior (web, Enter during a running reply: queue or steer), related to Enter semantics

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web composer: Enter sends when sendWithEnter is true or Cmd/Ctrl is held; Shift+Enter always adds a line; no send while a slash menu is open or an input method is composing (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4652-4660).
- Web store defaults sendWithEnter to true and persists the store in localStorage under 'agiworkforce-web-settings' (apps/web/shared/stores/web-settings-store.ts:133, 216-219).
- sendWithEnter is part of the account 'appearance' preference namespace and is read back and written with a 400 ms debounce when signed in (apps/web/features/settings/components/CloudSettingsSync.tsx:37, 73, 285; apps/web/features/settings/lib/appearance-namespace.ts:26, 119, 157).
- Only four shortcut ids accept a recorded combination: focus-composer, copy-last-message, regenerate-last-message, toggle-artifacts, because other chords are printed from fixed values elsewhere (apps/web/features/chat/hooks/use-keyboard-shortcuts.ts:69-79).
- A recorded combination is rejected when it needs no modifier or clashes with a reserved or existing shortcut (use-keyboard-shortcuts.ts:190, 264-282; KeyboardShortcutsDialog.tsx:81-92). Recording the default again removes the override (KeyboardShortcutsDialog.tsx:119-125).
- Switching an App shortcut off stops it firing: the key handler skips ids in disabledShortcutIds (use-keyboard-shortcuts.ts:321, 336-342).
- Restore defaults clears disabledShortcutIds and shortcutBindings together; with recorded keys it first asks for confirmation (web-settings-store.ts:96, 158; KeyboardShortcutsDialog.tsx:230-245).
- Desktop menu shortcuts are listed read-only from the shell (KeyboardShortcutsDialog.tsx Desktop app group; apps/web/features/desktop-host/hooks/use-host-shortcuts.ts:41).
- VS Code: three send modes exist in the manifest, config reader, settings panel and composer script (package.json:1251-1266; apps/extension-vscode/src/platform/config.ts:282; settingsProtocol.ts:117; sidebar-webview/webviewContent.ts:5088-5097). The brief lists VS Code send key as missing, which the code contradicts.
- CLI: seven configurable actions (quit, cycle_mode, cycle_model, redraw, clear_chat, clear_input, open_palette) with defaults, validated, bad config falls back to defaults (apps/cli/src/keybindings.rs:13-60, 108-122). Enter sends and Shift+Enter or Alt+Enter adds a line, fixed (apps/cli/src/tui/tui_app.rs:4072-4090).
- Chrome: Options lists commands from chrome.commands.getAll and opens chrome://extensions/shortcuts (apps/extension/src/features/options/keyboard-shortcut-rows.ts:38-95; manifest.json commands _execute_action and capture_page).

**Incomplete**

- Web offers only an on/off send choice; the brief's 'which modifier sends' is not offered (GeneralSection.tsx:607-624).
- Only four shortcuts can be rebound; the rest are fixed (use-keyboard-shortcuts.ts:69).
- Recorded shortcuts and switched-off shortcuts are not part of the synced fields; only device storage holds them (CloudSettingsSync.tsx:73-90 lists the synced fields and omits shortcut state).
- CLI has no viewing screen for bindings beyond start-view hints and config printing (tui_app.rs:2714; config.rs:1361).

**Present but disconnected or switched off**

- Desktop menu chords appear in the sheet but cannot be recorded or switched off from the page (KeyboardShortcutsDialog.tsx Desktop app comment).

**Not available**

- Send key choice: Chrome side panel (Enter sends, Shift+Enter adds a line, fixed; apps/extension/src/side_panel.ts:14574) and CLI (fixed).
- Mobile: not applicable.
- Shortcut recording in VS Code, CLI and Chrome: the host's own tool or the config file is used instead.

## 4. Required behaviour

**Established requirements**

- The user can choose whether Enter sends or inserts a newline, and which modifier sends. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.14)
- Settings let the user view and customise (disable or rebind) keyboard shortcuts. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.15)
- With Send with Enter off, Enter starts a new line and Cmd+Enter (Mac) or Ctrl+Enter sends. (source: apps/web/features/settings/sections/GeneralSection.tsx:607-624)
- A shortcut the user switched off must stop firing, and Composer keys have no off switch. (source: apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx (comment above the switch))
- Turning launch-at-login on and clearing the chosen CLI from the page are the actions the desktop asks about; shortcut writes from the page accept only listed choices. (source: docs/decisions/wire-or-cut.md:759)

**Acceptance criteria**

1. Web: with Send with Enter on, Enter sends and Shift+Enter adds a line; with it off, Enter adds a line and Cmd (Mac) or Ctrl sends with Enter.
2. Web: Enter does nothing to the message while an input method is composing or the slash menu is open.
3. Web: recording a combination on a rebindable shortcut changes it at once and the Keyboard pane shows the new keys; recording one already used shows the clash message and keeps the old keys.
4. Web: a switched-off App shortcut does not fire; Restore defaults re-enables it and clears recorded keys (after the confirmation when keys were recorded).
5. Reload the page: send switch, recorded keys and switch-off state are still set; sign in on another browser: only the send switch follows the account.
6. VS Code: each of the three enterBehavior values changes which key sends.
7. CLI: an invalid [ui.keybindings] value does not break start-up; defaults apply.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The send choice should be the same on every surface that has a rich composer [inferred from the brief's 'which modifier sends' wording].
- Shortcut customisation should follow the person across devices, as the other appearance choices do [inferred from CloudSettingsSync syncing sendWithEnter but not shortcuts].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer the VS Code three-way send choice on web and Desktop, so 'Enter sends a one-line prompt only' is available there.
- [proposed] Sync disabledShortcutIds and shortcutBindings through the appearance namespace.
- [proposed] Offer a send-key choice in the Chrome side panel.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SendWithEnterRow | `apps/web/features/settings/sections/GeneralSection.tsx` | Switch 'Send with Enter' (line 607) shown under 'Composer' (line 325). |
| component | KeyboardShortcutsRow | `apps/web/features/settings/sections/GeneralSection.tsx` | Row with the 'View shortcuts' link to the keyboard pane (line 720). |
| component | KeyboardShortcutsPane / KeyboardShortcutsDialog | `apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx` | Lists shortcuts, records new chords, switches, Restore defaults, Desktop app group. |
| hook | useKeyboardShortcuts and helpers | `apps/web/features/chat/hooks/use-keyboard-shortcuts.ts` | Matches key events, applies disabled ids and recorded chords, checks reserved and clashing chords, defines the four rebindable ids. |
| store | useSettingsStore | `apps/web/shared/stores/web-settings-store.ts` | Holds sendWithEnter, disabledShortcutIds, shortcutBindings; restoreShortcutDefaults; persisted in localStorage 'agiworkforce-web-settings'. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Key handler that applies sendWithEnter (line 4652-4660). |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Syncs sendWithEnter to the account 'appearance' namespace when signed in. |
| service | appearance-namespace mapping | `apps/web/features/settings/lib/appearance-namespace.ts` | Maps store fields to and from the stored namespace. |
| endpoint | GET and PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Reads and writes the namespace in table user_settings (CSRF and rate limit). |
| hook | useHostShortcuts | `apps/web/features/desktop-host/hooks/use-host-shortcuts.ts` | Supplies the Desktop app menu chords for the read-only group. |
| config | HOST_MENU_SHORTCUTS and appMenu accelerators | `apps/desktop/electron/appMenu.ts` | Desktop menu chords, shared with the sheet through the contract (hostAccelerator). |
| config | WebSettingsModal sections | `apps/web/features/settings/components/WebSettingsModal.tsx` | Routes 'general' and 'keyboard' panes (lines 262, 297). |
| config | shortcut registry | `packages/ui/unified-chat/src/lib/shortcutRegistry.ts` | Shared definitions of chat shortcuts (CHAT_SHORTCUTS). |
| config | agiWorkforce.composer.enterBehavior | `apps/extension-vscode/package.json` | VS Code setting and keybinding contributions (line 1251; keybindings from 1485). |
| service | Config.composerEnterBehavior | `apps/extension-vscode/src/platform/config.ts` | Reads and validates the VS Code setting (line 282). |
| component | VS Code composer script | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Applies enter, modifierIfMultiline or modifier (line 5088-5097). |
| component | VS Code settings panel | `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` | Row 'Send key' (line 1451). |
| service | Keybindings | `apps/cli/src/keybindings.rs` | CLI configurable global actions, parsing and validation. |
| component | CLI input handler | `apps/cli/src/tui/tui_app.rs` | Fixed Enter and Shift/Alt+Enter handling (line 4072-4090). |
| component | createKeyboardShortcutRows | `apps/extension/src/features/options/keyboard-shortcut-rows.ts` | Chrome Options shortcut list and Configure button. |
| config | manifest commands | `apps/extension/manifest.json` | Chrome commands _execute_action and capture_page with suggested keys. |
| test | Keyboard pane and hook tests | `apps/web/features/chat/components/dialogs/__tests__/KeyboardShortcutsPane.test.tsx` | Test of the pane (see verification). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person flips the Send with Enter switch; the store updates sendWithEnter. | device | apps/web/features/settings/sections/GeneralSection.tsx:607-624; web-settings-store.ts:175 |
| The store persists to localStorage. | device | web-settings-store.ts:216-219 |
| The composer key handler reads sendWithEnter on each keydown and sends or inserts a line. | device | ChatComposerNew.tsx:4652-4660 |
| When signed in, CloudSettingsSync compares the projected values with the last acknowledged ones and writes the changed fields after 400 ms to the 'appearance' namespace. | device and our servers | CloudSettingsSync.tsx:37, 237-262; route.ts PUT |
| The server stores the namespace in the user_settings row (with CSRF check and rate limit). | our servers | apps/web/app/api/settings/preferences/route.ts:177-181; readSettings select on public.user_settings |
| Rebinding: the dialog turns a key press into a chord, checks it against reserved and existing chords, then writes shortcutBindings in the store; the key handler uses the bound chords. | device | KeyboardShortcutsDialog.tsx:81-125; use-keyboard-shortcuts.ts:90-99, 321-340 |
| VS Code: the setting is read by Config and sent to the sidebar webview state; a change event refreshes it. | device | config.ts:282, 353; ChatStateManager.ts:2778; extension.ts:504 |
| CLI: config.toml is read at start and the bindings are parsed. | device | apps/cli/src/tui/tui_app.rs:746; keybindings.rs:113-122 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| sendWithEnter, disabledShortcutIds, shortcutBindings | Browser or Desktop window localStorage key agiworkforce-web-settings | No for shortcut state. sendWithEnter yes, to table user_settings, namespace appearance, when signed in. | Kept until site data is cleared; Restore defaults clears shortcut state; no sign-out clean-up found for this store (unknown). |
| agiWorkforce.composer.enterBehavior | VS Code settings | By VS Code settings sync if the person enables it (VS Code behaviour, not code in this repo) [inferred] | Kept until changed. |
| [ui.keybindings] | CLI config.toml (project config can override, config.rs:968) | No | Kept until edited. |

**Models and providers.** None. No model or provider takes part in the send key or shortcuts.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and Desktop: not required to use; sign-in is needed only to sync sendWithEnter (CloudSettingsSync.tsx:155-160). VS Code, CLI, Chrome: no account needed for these settings. |
| Permissions | Browser keyboard events only. Desktop: menu chords belong to the shell. Chrome: key changes happen in the browser's own page. |
| Subscription | No plan limit was seen in any file read for this feature; no entitlement check applies (SYS-subscriptions-entitlements-and-usage not involved). |
| Limits and metering | none found in the code |
| Feature flags | none found in the code for the send key or the shortcut pane. The Keyboard pane is a normal member of WEB_SETTINGS_CONTENT_SECTIONS (apps/web/features/settings/lib/web-settings-sections.ts:35). |
| Model compatibility | Not model dependent. |
| Provider restrictions | None. Works the same in Local, own key and Cloud modes. |
| Local mode | Works fully: values live on the device and nothing needs a server. Only the optional account sync of the send switch needs sign-in and our servers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Input method composing | Enter never sends while composing (composing flag). | ChatComposerNew.tsx:4652-4657 |
| Slash menu open | Enter is left to the menu and does not send. | ChatComposerNew.tsx:4656 |
| Recorded chord has no modifier | Rejected with 'Hold Cmd/Ctrl ...' text. | KeyboardShortcutsDialog.tsx:81-92 |
| Recorded chord clashes | Rejected with '<keys> is already used by <name>.' | KeyboardShortcutsDialog.tsx:90-92; use-keyboard-shortcuts.ts:272 |
| Escape or Tab while recording | Recording stops without a change. | KeyboardShortcutsDialog.tsx:105-114 |
| Nothing changed | Restore defaults is disabled. | KeyboardShortcutsDialog.tsx:211, 337 |
| Older stored data without the new keys | Store reads are coalesced to empty lists so the pane does not crash. | KeyboardShortcutsDialog.tsx:201-203 |
| Search with no match | Shows 'No shortcuts match' status line. | KeyboardShortcutsDialog.tsx:277-281 |
| Account sync fails | A status message with retry is set; the local value stays. | CloudSettingsSync.tsx:107-117 |
| Sync read fails | Nothing is written until a read succeeds, so this device does not overwrite the account. | CloudSettingsSync.tsx:219-226 |
| Accessibility | Recording buttons have labels such as 'Change keys for ...'; errors use role alert; touch targets grow on coarse pointers. | KeyboardShortcutsDialog.tsx:130-150, 176 |
| Offline | Local changes work; sync retried later is not handled beyond the retry action (unknown whether automatic). | CloudSettingsSync.tsx:107-117 |
| Invalid CLI binding | Whole custom set ignored, defaults used. | apps/cli/src/keybindings.rs:113-118 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/dialogs/__tests__/KeyboardShortcutsPane.test.tsx`: Keyboard pane behaviour (record, switch, restore).
- `apps/web/features/chat/components/dialogs/__tests__/KeyboardShortcutsDialog.registry.test.tsx`: Dialog lists registry shortcuts.
- `apps/web/features/chat/components/dialogs/__tests__/KeyboardShortcutsDialog.narrow-layout.test.tsx`: Narrow layout of the dialog.
- `apps/web/features/chat/hooks/use-keyboard-shortcuts.test.ts`: Matching, disabling and binding logic of the shortcut hook.
- `apps/web/features/settings/sections/GeneralSection.test.tsx`: General section including the send switch (file mentions sendWithEnter).
- `apps/web/features/chat/components/Composer/ChatComposerNew.test.tsx`: Composer behaviour that references sendWithEnter.
- `apps/web/features/settings/components/__tests__/CloudSettingsSync.test.tsx`: Account sync including sendWithEnter.
- `apps/web/features/settings/lib/__tests__/appearance-namespace.test.ts`: Namespace mapping of sendWithEnter.
- `apps/extension-vscode/src/__tests__/followUpBehavior.webview.test.ts`: VS Code composer script including enterBehavior.
- `apps/extension-vscode/src/__tests__/configDefaults.test.ts`: VS Code defaults including enterBehavior.
- `apps/cli/src/keybindings.rs`: 12 unit tests inside the CLI keybindings module.

**Test scenarios**

- **Send switch off on web**
  1. Open Settings, General, Composer.
  2. Turn Send with Enter off.
  3. Type text and press Enter.
  4. Press Cmd (Mac) or Ctrl plus Enter.
  - Expected: Enter adds a line; the modified Enter sends.
- **Rebind a shortcut**
  1. Open View shortcuts.
  2. Select the keys of 'Focus composer' (or another of the four).
  3. Press a new combination with Cmd/Ctrl.
  4. Use the new keys in the chat.
  - Expected: New keys work, old keys do not, the pane shows them.
- **Clash refused**
  1. Record a combination used by another shortcut.
  - Expected: Alert text names the other shortcut; binding unchanged.
- **Restore defaults**
  1. Switch an App shortcut off and rebind another.
  2. Press Restore defaults and confirm.
  - Expected: Both are back at default and the summary text clears.
- **VS Code modifier mode**
  1. Set Send key to Cmd/Ctrl+Enter.
  2. Press Enter in the composer.
  3. Press Cmd/Ctrl+Enter.
  - Expected: Enter adds a line; modified Enter sends.
- **Account sync of the send switch**
  1. Sign in on browser A, turn the switch off, wait one second.
  2. Sign in on browser B.
  - Expected: Browser B shows the switch off; recorded shortcuts do not follow.

**Where to look when it fails**

- Browser console and the settings sync status line text 'Your settings did not reach your account.' (CloudSettingsSync.tsx:117).
- Server: PUT /api/settings/preferences responses; table user_settings, namespace appearance.
- CLI: invalid key binding errors from validate_config at start-up (config.rs:1437).
- Desktop: no log found specific to this feature.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/084-general-and-appearance-settings.md](../../70-qa/test-plans/web/084-general-and-appearance-settings.md)
- Desktop: [70-qa/test-plans/desktop/084-general-and-appearance-settings.md](../../70-qa/test-plans/desktop/084-general-and-appearance-settings.md)
- CLI: [70-qa/test-plans/cli/084-general-and-appearance-settings.md](../../70-qa/test-plans/cli/084-general-and-appearance-settings.md)
- VS Code: [70-qa/test-plans/vscode/084-general-and-appearance-settings.md](../../70-qa/test-plans/vscode/084-general-and-appearance-settings.md)
- Chrome: [70-qa/test-plans/chrome/084-general-and-appearance-settings.md](../../70-qa/test-plans/chrome/084-general-and-appearance-settings.md)

## 10. Gaps and dependencies

- **Brief says send-key modifier choice; web offers only on/off.** Affects: Web and Desktop users. Evidence: GeneralSection.tsx:607-624; S84.14. Work needed: Decide whether to add a three-way choice like VS Code, then wire it to the composer handler and the appearance namespace.
- **Shortcut customisation is not synced across devices.** Affects: Web and Desktop users who sign in on several devices. Evidence: CloudSettingsSync.tsx:73-90 lacks shortcut fields. Work needed: Add fields to the namespace mapping and tests.
- **Only four shortcuts can be rebound.** Affects: Web and Desktop. Evidence: use-keyboard-shortcuts.ts:69-74. Work needed: Make printed hints read the effective chord, then allow more ids.
- **Chrome side panel and CLI have no send-key choice.** Affects: Chrome and CLI users. Evidence: side_panel.ts:14574; tui_app.rs:4072-4090. Work needed: Add a setting and tests, or record the decision to keep it fixed.
- **Brief marks VS Code send key as missing but the code has it.** Affects: The brief's accuracy. Evidence: package.json:1251. Work needed: Correct the brief row.
- **Chrome shows shortcuts read-only and sends users to the browser page.** Affects: Chrome users. Evidence: keyboard-shortcut-rows.ts:90-95. Work needed: None needed if the browser page is the intended owner [inferred].

**Depends on**

- surface:web
- surface:desktop
- surface:vscode
- surface:cli
- surface:chrome
- file:apps/web/shared/stores/web-settings-store.ts
- file:apps/web/features/chat/hooks/use-keyboard-shortcuts.ts
- api:PUT /api/settings/preferences
- table:user_settings
- store:agiworkforce-web-settings
- SYS-shared-ui-and-design
- SYS-api-and-contracts
- SYS-sync-and-continuity

## Unknown

- Whether sign-out clears the localStorage settings store (not checked).
- Whether recorded shortcuts matter on touch-only web.
- Whether CLI has a command that prints active bindings besides config summary and start hints.
- No test was run; nothing here claims a pass.
