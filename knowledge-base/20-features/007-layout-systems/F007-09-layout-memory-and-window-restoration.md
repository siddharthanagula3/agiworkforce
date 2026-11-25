---
id: "F007-09"
type: "feature"
title: "Layout memory and window restoration"
aliases: ["Layout restoration between visits", "Window-size and monitor-change restoration", "window-state.json", "agi-ui-store", "chat-ui-store", "Shell layout", "S7.30", "S7.31"]
area: "7 Layout systems"
available_on: ["web", "desktop", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S7.30", "S7.31"]
depends_on: ["surface:web", "surface:desktop", "surface:vscode", "SYS-shared-ui-and-design", "SYS-sync-and-continuity", "store:window-state.json", "store:localStorage agi-ui-store", "file:apps/desktop/electron/windowState.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F007-09 Layout memory and window restoration

The app reopens as it was left. Web saves sidebar state and panel width in browser storage. Desktop saves them, and the window frame per display set-up, in its own window-state file, and puts the window back on screen if the monitor changed. VS Code restores its chat editor panel.

Area: [7. Layout systems](README.md). Requirement items: [S7.30](../../10-requirements/capabilities/007-layout-systems.md#s730), [S7.31](../../10-requirements/capabilities/007-layout-systems.md#s731).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Web: remembers whether the sidebar is collapsed and how wide the side panel is (apps/web/shared/stores/layout-store.ts:101-117; packages/ui/unified-chat/src/stores/uiStore.ts:77-85). Desktop: the shell stores sidebar state, panel width, window frame per display arrangement and the last route (apps/desktop/electron/windowState.ts:27-37).

**Why it exists.** Brief S7.30 and S7.31: layout choices should come back, and the desktop window should reopen at its last size and position and stay on screen when monitors change.

**Who uses it.** Web and Desktop users, and VS Code users who keep a chat editor open.

**Problems it solves**

- No need to collapse the sidebar again every visit.
- A window never reopens off screen after unplugging a monitor.
- A second Desktop window opens on the same layout as the first.

**Use cases**

- Collapse the sidebar on web, reload, still collapsed.
- Resize the side panel on Desktop, quit, reopen at that width.
- Unplug the external monitor, launch the app, window appears on the laptop screen.
- Reload VS Code and see the AGI Chat editor panel return.

## 2. User experience

**Where to find it**

- Web and Desktop: the sidebar collapse control and the draggable edge of the side panel; no separate settings screen was found for layout memory.
- Desktop: the window itself (move, resize, maximise).
- VS Code: the editor tab titled 'AGI Chat' or 'AGI Chat 2' and so on (apps/extension-vscode/src/providers/chatEditorPanel.ts:66-69).

**Before you start**

- Web: browser storage available.
- Desktop: the Electron shell host; the window-state file in the app's user data folder (apps/desktop/electron/shellWindowStore.ts:15-17).
- Window route restore: the same account as when the route was saved (windowState.ts:117-119).

**Screens and controls**

- Sidebar collapse control (state sidebarCollapsed).
- Side panel drag handle (state artifactPanelWidth, default 400).
- The OS window frame.

**Journey**

1. Change the layout: collapse the sidebar, drag a panel edge, resize or move the window.
2. Close the app.
3. Reopen it; the stores rehydrate, or on Desktop the hook reads the shell's saved layout once and the main process opens the window at the restored frame.

**What the person sees and gets**

- The layout appears as left; no message is shown.
- Desktop: a restored route that no longer exists sends the window to a new chat (windowState.ts:195-201).

**Settings**

- No setting found to turn layout memory on or off or to reset it (not found in the code I opened).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web sidebar flag persisted under 'agi-ui-store', version 2, only sidebarCollapsed (apps/web/shared/stores/layout-store.ts:101-117).
- Web chat store persists sidebarCollapsed, themeMode and artifactPanelWidth under 'chat-ui-store' (packages/ui/unified-chat/src/stores/uiStore.ts:77-85); the width is clamped on set (uiStore.ts:63).
- Desktop hook adopts the shell's layout once on mount, then writes each change and does not write while adopting (apps/web/features/desktop-host/hooks/use-shell-layout.ts:14-58).
- Shell stores layout in window-state.json (shellWindowStore.ts:15-54) and the dispatcher serves read and write (apps/desktop/electron/runtime/dispatcher.ts:2429-2431).
- Panel width is clamped to 220-720 in the shell (windowState.ts:42-43, 104-108).
- Window frames are kept per display arrangement, keyed by work-area size and position (windowState.ts:62-65; 22-32).
- Launch restore picks the frame of an attached display, otherwise pulls the newest frame onto the primary display and clamps it with at least 80 pixels visible (windowState.ts:34-78, 143-164).
- A frame is written 400 ms after resize or move, and on close; minimised, full-screen and zoomed windows are not stored as ordinary sizes (apps/desktop/electron/main.ts:1010-1062; windowState.ts:101-111).
- A legacy single frame in preferences seeds the new store once (main.ts:943-964).
- Route restore is limited to product pages and to the same account (windowState.ts:95-102, 117-119, 143-164).
- VS Code: the chat editor panel keeps its webview when hidden and registers a panel serializer (apps/extension-vscode/src/providers/chatEditorPanel.ts:69-72, 142-143).

**Incomplete**

- Two stores both persist sidebarCollapsed on web: 'agi-ui-store' and 'chat-ui-store' (layout-store.ts:112-114; uiStore.ts:79-81). Which one a given screen reads was not fully traced.
- Desktop uses the shell file only when the host exists; the brief's note that the window frame follows 'main.ts:945-1040' is right for the legacy seed and persist but the actual window creation is at main.ts:1089-1146.
- Open panels (which panel is open) are not restored; only sidebar and panel width were found, although the brief S7.30 asks for 'open panels' (no persistence code seen).
- The window is not moved live when a monitor is unplugged while the app runs; no display-removed or display-metrics listener exists in the Electron main files (searched apps/desktop/electron).
- Detached panel windows are not restored (see F007-07).

**Present but disconnected or switched off**

- Desktop hook does nothing outside the shell (use-shell-layout.ts:16; ShellLayout.test.tsx:134).
- The older preferences windowFrame is still written on every persist beside the new store (main.ts:1020).

**Not available**

- Mobile, CLI, Chrome: not listed in the brief and no layout-memory code was checked for them (n/a).
- VS Code: no own code for window size or monitor changes; the editor handles that [inferred].

## 4. Required behaviour

**Established requirements**

- Layout choices the user made (sidebar collapsed, panel widths, open panels) come back on the next visit. (source: S7.30 (brief))
- The desktop window reopens at its last size and position and stays on screen when the monitor arrangement changes. (source: S7.31 (brief))
- Web stores sidebar state under 'agi-ui-store'; panel width and theme under 'chat-ui-store'; desktop reads the layout once on mount and writes each change; panel width is clamped 220 to 720; the frame is restored against current displays and moved on screen if needed; VS Code uses retainContextWhenHidden. (source: brief Should lines for S7.30, S7.31)

**Acceptance criteria**

1. On web, collapse the sidebar, reload: still collapsed.
2. On web, change the side panel width, reload: same width.
3. On Desktop, collapse the sidebar in one window and open a second window: it opens collapsed.
4. On Desktop, set the panel width to 100 or 900: stored value is 220 or 720.
5. On Desktop, move the window to a second monitor, quit, relaunch: it opens there; with that monitor gone it opens fully visible on the primary display.
6. A maximised window relaunches maximised and does not grow on each launch.
7. Another account signing in does not reopen the previous account's last route.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Layout memory should be per device and not synced with the account [inferred from storage in browser or local file].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide whether open panels should be restored, as the brief item says.
- [proposed] Add a display-change listener to bring a live window back on screen.
- [proposed] Keep one persisted copy of the sidebar flag on web.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | useUIStore (agi-ui-store) | `apps/web/shared/stores/layout-store.ts` | Web sidebar and task dock state; persists sidebarCollapsed only. |
| store | useChatUIStore (chat-ui-store) | `packages/ui/unified-chat/src/stores/uiStore.ts` | Shared chat UI state; persists sidebar, theme and artifact panel width. |
| hook | useShellLayout (desktop host) | `apps/web/features/desktop-host/hooks/use-shell-layout.ts` | Reads once and writes changes to the shell. |
| component | DesktopHostMount | `apps/web/features/desktop-host/components/DesktopHostMount.tsx` | Calls the hook with the host (line 43). |
| service | runtime-client layout calls | `apps/web/features/desktop-host/lib/runtime-client.ts` | readShellLayout and writeShellLayout bridge calls (lines 262-266). |
| service | dispatcher layout commands | `apps/desktop/electron/runtime/dispatcher.ts` | Serves layout read and write in the shell (lines 2429-2431). |
| store | shellWindowStore | `apps/desktop/electron/shellWindowStore.ts` | Reads and patches window-state.json; builds the layout object. |
| store | window-state.json | `apps/desktop/electron/windowState.ts` | Schema, normalising, per-display frames, clamp, restore, route and account rules, file read and write. |
| service | createShellWindow and followWindowFrame | `apps/desktop/electron/main.ts` | Applies the restored bounds and maximised flag at creation (1089-1146) and follows frame changes (1010-1062). |
| service | loadWindowState legacy seed | `apps/desktop/electron/main.ts` | Seeds from the older single frame in preferences (943-964). |
| service | adoptReportedAccount | `apps/desktop/electron/main.ts` | Drops the saved route when the account changes (981-998). |
| component | WebChatPage layout wiring | `apps/web/features/chat/pages/WebChatPage.tsx` | Reads the sidebar and panel stores in the chat page. |
| component | ChatEditorPanel | `apps/extension-vscode/src/providers/chatEditorPanel.ts` | VS Code chat editor panel with retained context and a serializer. |
| test | windowState.test.ts | `apps/desktop/electron/__tests__/windowState.test.ts` | Frame, display, route, account, width and file tests. |
| test | shellWindowStore.test.ts | `apps/desktop/electron/__tests__/shellWindowStore.test.ts` | Layout round trip and width clamp. |
| test | ShellLayout.test.tsx | `apps/web/features/desktop-host/__tests__/ShellLayout.test.tsx` | The hook adopts, writes, stops and stays quiet outside the shell. |
| test | layout-store.test.ts | `apps/web/shared/stores/layout-store.test.ts` | Web layout store tests including rehydrate. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: Zustand persist writes the partial state to browser storage on each change and reads it on load. | device | apps/web/shared/stores/layout-store.ts:101-117; uiStore.ts:77-85 |
| Desktop: on mount the hook asks the shell for the saved layout and applies sidebar and width if they are not null. | device | use-shell-layout.ts:21-30 |
| Each later change is sent to the shell, which clamps the width and patches window-state.json. | device | use-shell-layout.ts:36-51; shellWindowStore.ts:41-54 |
| The main process follows the window, and 400 ms after a resize or move it stores the frame under the current display key, and also writes the older preferences frame. | device | main.ts:1010-1062 |
| On launch the saved state and the attached displays decide the bounds, maximised flag and route. | device | windowState.ts:143-164; main.ts:966-968, 1089-1146 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| sidebarCollapsed (web) | store:localStorage key agi-ui-store and key chat-ui-store | no | stays until browser storage is cleared; reset action returns defaults on sign-out (layout-store.ts:93-97) |
| artifactPanelWidth, themeMode | store:localStorage key chat-ui-store | no | as above |
| Desktop layout, window frames, last route and account fingerprint | store:window-state.json in the app's user data folder | no | The account is stored as a hash, not the address (windowState.ts:114-126). A corrupt or missing file gives an empty state (windowState.ts:214-220). No deletion path seen. |
| Legacy window frame | app preferences (saveSettings windowFrame) | no | still rewritten on persist (main.ts:1020) |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account is needed for the layout stores. Route restore on Desktop is tied to the account fingerprint (windowState.ts:117-119, 170-180). |
| Permissions | Desktop writes a file in the user data folder; web uses browser storage. No other permission found. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code; only the panel width range 220 to 720 (windowState.ts:42-43). |
| Feature flags | none found in the code. |
| Model compatibility | not applicable; no model is used. |
| Provider restrictions | none found in the code. |
| Local mode | Works fully on the device, with no network needed, in all three ways of running; the layout files are local (shellWindowStore.ts:15-17). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Browser storage blocked or empty (web) | Defaults apply (sidebar expanded). The store has no explicit error handling in these lines beyond the library's. | layout-store.ts:101-117 |
| Shell layout unreadable | Hook ignores the error and keeps the page defaults. | use-shell-layout.ts:31; ShellLayout.test.tsx:123 |
| Corrupt window-state.json | Opens on defaults: centred 1280 by 800 at most. | windowState.ts:214-220, 127-136 |
| Display gone | Newest frame is clamped onto the primary work area. | windowState.ts:57-78 |
| Window smaller than minimum or off edge | Raised to the minimum size and kept with 80 pixels visible. | windowState.ts:34-49 |
| Maximised, minimised or full screen | Stored as maximised; minimised and full-screen readings are ignored. | windowState.ts:101-111 |
| Account changes | Saved route dropped; other windows close; kept window goes to new chat if on a conversation. | main.ts:981-998; windowState.ts:170-180 |
| Restored route returns an error 4xx | Window falls back to the app root. | windowState.ts:195-201 |
| Monitor changes while the app runs | not handled in the code (no display change listener found). | grep of apps/desktop/electron found display-removed only in runtime/skillCapture.ts |
| Write failure of window-state.json | Logged as a warning, not retried. | windowState.ts:222-228 |
| Second Desktop window | Only the primary window writes the frame; secondary windows open stepped off the requester. | main.ts:1070-1087, 1139-1148 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/windowState.test.ts`: Display key, restore across displays, restorable routes, panel width clamp, state file round trip and corruption, account and route rules, launch bounds.
- `apps/desktop/electron/__tests__/shellWindowStore.test.ts`: Layout read after write, change one value only, clamp the width.
- `apps/web/features/desktop-host/__tests__/ShellLayout.test.tsx`: Adopt shell layout, no write while adopting, write on collapse and resize, stop after host gone, unreadable shell, no touch outside the shell.
- `apps/web/shared/stores/layout-store.test.ts`: Defaults, setSidebarCollapsed, task dock, reset, rehydrate keeping sidebarCollapsed.
- `apps/web/shared/components/layout/__tests__/sidebar-collapse-preference.test.ts`: Sidebar collapse preference (not read in detail).
- `apps/desktop/src/__tests__/windowStatePersistence.test.ts`: Fullscreen and maximise persistence in the Tauri desktop source (not checked whether the Electron app uses it).

**Test scenarios**

- **Web sidebar memory**
  1. Open the web chat; collapse the sidebar.
  2. Reload the page.
  - Expected: Sidebar stays collapsed.
- **Desktop width memory**
  1. Drag the side panel to a new width.
  2. Quit and relaunch.
  - Expected: Panel opens at that width, within 220 to 720.
- **Monitor removed**
  1. Place the window on a second monitor and quit.
  2. Disconnect the monitor and launch.
  - Expected: Window appears fully on the primary display.
- **Zoom stays stable**
  1. Maximise the window; quit; relaunch three times.
  - Expected: Opens maximised each time and the restore size does not grow.
- **Account change**
  1. Open a conversation; sign out; sign in as another account; relaunch.
  - Expected: Opens on a new chat, not the earlier conversation.
- **VS Code panel**
  1. Open AGI Chat in an editor tab.
  2. Reload the VS Code window.
  - Expected: The chat panel is restored by the serializer.

**Where to look when it fails**

- Console warning '[window-state] could not persist window-state.json:' (windowState.ts:226).
- Inspect window-state.json in the app user data folder: keys frames, lastRoute, secondaryPanelWidth, sidebarCollapsed.
- Desktop events recorded with domain local_store_migration for the legacy seed (main.ts:950-957).
- Browser storage keys agi-ui-store and chat-ui-store.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/007-layout-systems.md](../../70-qa/test-plans/web/007-layout-systems.md)
- Desktop: [70-qa/test-plans/desktop/007-layout-systems.md](../../70-qa/test-plans/desktop/007-layout-systems.md)
- VS Code: [70-qa/test-plans/vscode/007-layout-systems.md](../../70-qa/test-plans/vscode/007-layout-systems.md)

## 10. Gaps and dependencies

- **Open panels are not restored although the brief asks for them.** Affects: Web and Desktop. Evidence: Only sidebarCollapsed and width are persisted (layout-store.ts:112-114; uiStore.ts:79-81; windowState.ts:27-37). Work needed: Owner decision, then persist which panel is open.
- **No live move back on screen when a monitor is removed while the app runs.** Affects: Desktop. Evidence: No display-change listener in apps/desktop/electron (other than skillCapture). Work needed: Listen for display changes and re-clamp the window.
- **Sidebar flag is stored twice on web.** Affects: Web. Evidence: layout-store.ts:112-114 and uiStore.ts:79-81. Work needed: Pick one owner and remove the copy, after tracing readers.
- **Legacy preferences frame is still written beside the new store.** Affects: Desktop. Evidence: main.ts:1020. Work needed: Remove once the seed is no longer needed.
- **Brief line pointers are stale for the window frame code.** Affects: Readers of the brief. Evidence: main.ts:945-1040 vs actual 943-1062 and 1089-1146. Work needed: Refresh the brief.
- **No setting to reset the layout.** Affects: All users. Evidence: none found. Work needed: Optional; decide with the owner.

**Depends on**

- surface:web
- surface:desktop
- surface:vscode
- SYS-shared-ui-and-design
- SYS-sync-and-continuity
- store:window-state.json
- store:localStorage agi-ui-store
- file:apps/desktop/electron/windowState.ts

## Unknown

- Whether Mobile, CLI or Chrome remember layout (brief lists none).
- Which of the two web sidebar stores each screen reads.
- Whether the retained Tauri app's windowStatePersistence code is used by any shipped build.
- How VS Code restores the panel's content after reload beyond the serializer (not traced).
- Behaviour on Windows and Linux for the display key (tests use geometry only).
