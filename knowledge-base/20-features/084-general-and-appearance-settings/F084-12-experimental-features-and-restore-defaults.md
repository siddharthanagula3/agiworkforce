---
id: "F084-12"
type: "feature"
title: "Experimental features and restore defaults"
aliases: ["Experimental features", "Preview features", "Early access", "Restore defaults", "Reset settings", "Reset preferences", "S84.25", "S84.26"]
area: "84 General and appearance settings"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S84.25", "S84.26"]
depends_on: ["surface:web", "surface:desktop", "file:apps/web/shared/stores/web-settings-store.ts", "store:agiworkforce-web-settings", "F084-07", "SYS-shared-ui-and-design", "SYS-subscriptions-entitlements-and-usage"]
basis: "code inspection"
second_reader: "8 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F084-12 Experimental features and restore defaults

Neither a way to opt into experimental or preview features nor a reset-all-preferences action exists on any app. The only restore action is 'Restore defaults' in the Keyboard pane on web and Desktop, which resets shortcut switches and recorded keys only. The brief marks restore defaults as not applicable, which the code contradicts.

Area: [84. General and appearance settings](README.md). Requirement items: [S84.25](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8425), [S84.26](../../10-requirements/capabilities/084-general-and-appearance-settings.md#s8426).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Would let a person join preview features and put all preferences back to defaults. Today only the shortcut reset exists.

**Why it exists.** Leading assistants let people try early features and reset settings after experiments. The brief's S84.25 and S84.26 record both as expected.

**Who uses it.** Early adopters wanting previews; anyone whose settings are in a confusing state.

**Problems it solves**

- No way to return to a known state
- No opt-in path for preview features

**Use cases**

- A person undoes all shortcut changes with one press.
- A future opt-in toggle for a preview feature [proposed].
- A future reset of appearance and composer choices [proposed].

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, General, 'Keyboard shortcuts', 'View shortcuts', then 'Restore defaults' at the bottom of the Keyboard pane (apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx:330-340).
- The retained Tauri desktop code has its own separate, confirmed reset of custom keybindings (resetAllCustomKeybindings) in its keybindings settings (apps/desktop/src/features/settings/KeybindingsSettings.tsx:256-264).
- Experimental enrolment: not found on web, Desktop, mobile, VS Code or Chrome (searched settings code for 'experimental', 'early access', 'preview features').

**Before you start**

- None.

**Screens and controls**

- Button 'Restore defaults' (disabled while nothing is changed) and a live summary of how many shortcuts are off or changed.
- Confirmation 'Restore default shortcuts?' with text 'Every key combination you recorded goes back to its default and every shortcut turns back on. To use your own keys again you would record them again.' and button 'Restore defaults' (KeyboardShortcutsDialog.tsx:230-245). The confirmation is created with destructive:false, so it is shown as non-destructive although recorded chords are discarded (KeyboardShortcutsDialog.tsx:~238).

**Journey**

1. Open Settings, General, View shortcuts.
2. Change or switch off shortcuts.
3. Press Restore defaults.
4. Confirm if keys were recorded; if only switches were off, it resets without asking.

**What the person sees and gets**

- Summary text clears; keys show defaults; the button becomes disabled.

**Settings**

- disabledShortcutIds and shortcutBindings are the only values reset.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- restoreShortcutDefaults sets disabledShortcutIds and shortcutBindings to empty (apps/web/shared/stores/web-settings-store.ts:96, 158).
- The button is disabled when nothing differs from defaults, and asks before discarding recorded keys (KeyboardShortcutsDialog.tsx:206-245, 337).
- The retained Tauri desktop app has its own confirmed reset of custom keybindings (resetAllCustomKeybindings), separate from the web store [apps/desktop/src/features/settings/KeybindingsSettings.tsx:256-264, apps/desktop/src/stores/settingsStore.ts:201].

**Incomplete**

- The reset covers shortcuts only; it does not touch theme, text size, send key, sidebar items or notifications.
- The web store persist config has no partialize, so the whole store (including customCommands) lives in one localStorage key and the shortcut reset does not clear it [apps/web/shared/stores/web-settings-store.ts:209-212].

**Present but disconnected or switched off**

- nothing found

**Not available**

- Experimental or preview enrolment on all apps.
- Reset-all-preferences on all apps.
- Any reset on CLI, VS Code, Chrome (they use host or config file editing).

## 4. Required behaviour

**Established requirements**

- The user can opt into experimental or preview features from settings. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.25)
- Settings offer a restore-defaults action that resets preferences. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S84.26)
- An action a user cannot undo asks first and names the consequence; useConfirmAction is the surface. (source: AGENTS.md section 9; used at KeyboardShortcutsDialog.tsx:230)

**Acceptance criteria**

1. Restore defaults is disabled when shortcuts are at defaults.
2. After switching a shortcut off, Restore defaults is enabled and one press turns it back on without a dialog.
3. After recording keys, Restore defaults asks 'Restore default shortcuts?' before acting.
4. After confirming, recorded keys and switches are cleared and the summary text is empty.
5. Other preferences (send switch, theme, sidebar items) are unchanged by this button.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A general reset would need to clear account-synced fields too, or the next sync would restore them [inferred from CloudSettingsSync hydration].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether experimental opt-in is wanted; if so, add a section backed by feature flags and the account.
- [proposed] Add a 'Reset settings' action in General with a confirmation listing what changes, covering the appearance namespace and device stores.
- [proposed] Correct S84.26 from 'not applicable' to 'partial: shortcuts only'.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | KeyboardShortcutsPane (restore) | `apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx` | Restore defaults button and confirmation (lines 206-245, 330-340). |
| store | useSettingsStore.restoreShortcutDefaults | `apps/web/shared/stores/web-settings-store.ts` | Clears shortcut switches and chords (line 158). |
| hook | useConfirmAction | `packages/ui/ui/src` | Confirmation surface used by the dialog (exported from @agiworkforce/ui). |
| component | WebSettingsModal | `apps/web/features/settings/components/WebSettingsModal.tsx` | Hosts the keyboard pane (line 297). |
| component | KeybindingsSettings (Tauri desktop) | `apps/desktop/src/features/settings/KeybindingsSettings.tsx` | Retained Tauri desktop keybindings screen with its own confirmed reset of custom keybindings (lines 256-264). |
| store | settingsStore.resetAllCustomKeybindings | `apps/desktop/src/stores/settingsStore.ts` | Tauri desktop store action that resets custom keybindings (line 201), separate from the web store. |
| test | KeyboardShortcutsPane test | `apps/web/features/chat/components/dialogs/__tests__/KeyboardShortcutsPane.test.tsx` | Pane behaviour. |
| test | use-keyboard-shortcuts test | `apps/web/features/chat/hooks/use-keyboard-shortcuts.test.ts` | Binding logic. |
| config | surface feature matrix | `docs/product/surface-feature-matrix.md` | Project document that tracks surface features (no experimental row read). |
| config | area brief | `knowledge-base/data/area-briefs/084-general-and-appearance-settings.md` | States S84.25 and S84.26. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Restore defaults. | device | KeyboardShortcutsDialog.tsx:230 |
| If recorded keys exist, a confirmation opens; on confirm the store clears switches and chords. | device | KeyboardShortcutsDialog.tsx:231-244; web-settings-store.ts:158 |
| The store persists the whole state, including the emptied shortcut values, to localStorage via the zustand persist config (no partialize). | device | web-settings-store.ts:209-212 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| disabledShortcutIds and shortcutBindings | localStorage 'agiworkforce-web-settings' (whole store in one key, including customCommands, which the reset does not clear) | No (not part of the synced appearance fields) | Emptied by the action; no trash or archive is involved because the values are preferences. |

**Models and providers.** None.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not required. |
| Permissions | none found in the code |
| Subscription | No plan limit was seen. An experimental opt-in, if added, might use plan or flag rules [inferred, unknown]. |
| Limits and metering | none found in the code |
| Feature flags | none found for this feature. |
| Model compatibility | Not model dependent. |
| Provider restrictions | None. |
| Local mode | Works fully on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| At defaults | Button disabled. | KeyboardShortcutsDialog.tsx:211, 337 |
| Only switches off | Resets immediately without a dialog. | KeyboardShortcutsDialog.tsx:231-234 |
| Recorded keys present | Confirmation first; cancel keeps everything. The confirmation is non-destructive in style (destructive:false) although recorded chords are discarded. | KeyboardShortcutsDialog.tsx:235-244; ~238 |
| Older stored data | Missing keys read as empty. | KeyboardShortcutsDialog.tsx:201-203 |
| Experimental enrolment, general reset | not handled in the code | Searched web, mobile, desktop, extension and VS Code settings code; no match |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/dialogs/__tests__/KeyboardShortcutsPane.test.tsx`: Keyboard pane behaviour including restore.
- `apps/web/features/chat/hooks/use-keyboard-shortcuts.test.ts`: Binding and disable logic.

**Test scenarios**

- **Restore after switch-off**
  1. Switch one App shortcut off.
  2. Press Restore defaults.
  - Expected: Shortcut on again; no dialog.
- **Restore after recording**
  1. Record a new chord for a rebindable shortcut.
  2. Press Restore defaults.
  3. Confirm.
  - Expected: Dialog 'Restore default shortcuts?' then default chord.
- **Other preferences untouched**
  1. Turn Send with Enter off.
  2. Restore shortcut defaults.
  - Expected: Send with Enter still off.
- **No experimental control**
  1. Open each settings pane and search for 'experimental' or 'preview'.
  - Expected: No such control (known gap).

**Where to look when it fails**

- Browser localStorage key agiworkforce-web-settings, fields disabledShortcutIds and shortcutBindings.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/084-general-and-appearance-settings.md](../../70-qa/test-plans/web/084-general-and-appearance-settings.md)
- Desktop: [70-qa/test-plans/desktop/084-general-and-appearance-settings.md](../../70-qa/test-plans/desktop/084-general-and-appearance-settings.md)

## 10. Gaps and dependencies

- **No experimental or preview opt-in on any app.** Affects: All apps. Evidence: S84.25; search found nothing. Work needed: Owner decision on whether to build it; then flags, entitlements and per-app UI.
- **No general restore-defaults action; only shortcuts.** Affects: Web and Desktop (and others have nothing); the retained Tauri desktop has a separate keybinding-only reset. Evidence: web-settings-store.ts:158; apps/desktop/src/features/settings/KeybindingsSettings.tsx:256-264. Work needed: Define the reset scope, include synced appearance fields, add a confirmation.
- **The brief says restore defaults is not applicable, but a shortcut reset exists.** Affects: Brief accuracy. Evidence: KeyboardShortcutsDialog.tsx:330-340. Work needed: Correct S84.26.
- Not built on: Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- file:apps/web/shared/stores/web-settings-store.ts
- store:agiworkforce-web-settings
- F084-07
- SYS-shared-ui-and-design
- SYS-subscriptions-entitlements-and-usage

## Unknown

- Whether the owner wants experimental enrolment at all.
- Whether any feature flag service could back an opt-in (not searched beyond settings code).
- How a general reset should treat account-synced fields.
- No test was run here.

## Second reader's check

A second reader checked 11 statements of this page against the code: 8 correct, 2 wrong or partly wrong, 1 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 6):** "The store persists the empty values to localStorage (web-settings-store.ts:216-219)" The code shows: The file is only 214 lines, so 216-219 does not exist. Persistence is the zustand persist config at lines 209-212 (name 'agiworkforce-web-settings', createJSONStorage(localStorage)). It persists the whole store, with no partialize. (web-settings-store.ts:209-212). **Corrected:** The store persists the whole state, including the emptied shortcut values, to localStorage via persist (web-settings-store.ts:209-212).
- **Partly wrong (section 2/5):** "Restore defaults lives on Desktop too, via the same Settings, General, Keyboard pane (WebSettingsModal.tsx:297)" The code shows: WebSettingsModal.tsx:297 mounts KeyboardShortcutsPane for web (the Electron desktop shows hosted web, so this holds). However, the Tauri desktop source has its own separate reset, resetAllCustomKeybindings, wired in KeybindingsSettings.tsx:256 with a confirm, and the page does not mention it. (apps/desktop/src/features/settings/KeybindingsSettings.tsx:156,256-264; apps/desktop/src/stores/settingsStore.ts:201). **Corrected:** Add that the retained Tauri desktop code has its own keybinding reset (resetAllCustomKeybindings), separate from the web store.

**Facts the page missed**

- The retained Tauri desktop app has its own confirmed reset of custom keybindings (resetAllCustomKeybindings), separate from the web store: apps/desktop/src/features/settings/KeybindingsSettings.tsx:256-264, apps/desktop/src/stores/settingsStore.ts:201.
- The web store persist config has no partialize, so the whole store (including customCommands) lives in one localStorage key and the shortcut reset does not clear it: apps/web/shared/stores/web-settings-store.ts:209-212.
- The confirmation is created with destructive:false, so it is shown as non-destructive although recorded chords are discarded: KeyboardShortcutsDialog.tsx:~238.
