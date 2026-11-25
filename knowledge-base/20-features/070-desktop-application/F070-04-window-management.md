---
id: "F070-04"
type: "feature"
title: "Window management"
aliases: ["Multiple windows", "Always on Top", "Move Conversation to New Window", "Open in New Window", "Window tiling", "Detachable panels", "Companion window", "S70.07", "S70.08", "S70.09", "S70.10"]
area: "70 Desktop application"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "partial", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S70.07", "S70.08", "S70.09", "S70.10"]
depends_on: ["surface:desktop", "file:apps/desktop/electron/appMenu.ts", "file:apps/desktop/electron/main.ts", "F070-01", "F070-02", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F070-04 Window management

The Window menu opens extra app windows, opens or moves a conversation into its own window, keeps the front window above others, and tiles windows. Two chat panels (Details and Research) can pop out into their own window. No separate companion window exists beyond the Quick Ask panel.

Area: [70. Desktop application](README.md). Requirement items: [S70.07](../../10-requirements/capabilities/070-desktop-application.md#s7007), [S70.08](../../10-requirements/capabilities/070-desktop-application.md#s7008), [S70.09](../../10-requirements/capabilities/070-desktop-application.md#s7009), [S70.10](../../10-requirements/capabilities/070-desktop-application.md#s7010).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person work with several app windows, pin one above all apps, snap windows to halves and quarters, and detach the Details and Research panels. (appMenu.ts:438-543, main.ts:1457-1493, panel-windows.ts:1-25)

**Why it exists.** Briefs S70.07 to S70.10 ask for a companion window, always on top, multiple windows and detachable panels.

**Who uses it.** Desktop users who keep a chat beside other apps or compare two conversations.

**Problems it solves**

- Keep an answer visible while working elsewhere (Always on Top).
- Read two conversations at once (New Window and Move Conversation).
- Arrange windows without OS tools (Move & Resize).

**Use cases**

- Choose Window > Always on Top while reading docs in another app.
- Choose Window > Move Conversation to New Window to split a chat out.
- Choose Window > Move & Resize > Left & Right to tile two app windows.
- Click 'Open Research in a new window' on the Research panel.

## 2. User experience

**Where to find it**

- Desktop only. Window menu items: 'New Window', 'Open in New Window', 'Move Conversation to New Window', 'Always on Top', Minimize, Zoom, 'Fill', 'Center', 'Move & Resize', 'Full Screen Tile' (appMenu.ts:447-516); Mac also 'Minimize All', 'Zoom All', 'Arrange in Front', 'Remove Window from Set' and a list of windows (appMenu.ts:472-540).
- Panel button label 'Open <panel> in a new window' or 'Move <panel> back to the main window' on the Details and Research panels (PanelWindow.tsx:39-41).

**Before you start**

- A front app window for Always on Top, Fill, Center and Move & Resize (main.ts:1487-1500).
- A conversation open in the front window for Open in New Window and Move Conversation (appMenu.ts:455-461).

**Screens and controls**

- Always on Top is a checkbox; disabled when no app window is in front (appMenu.ts:463-469).
- Move & Resize submenu: Halves (Left, Right, Top, Bottom), Quarters, Arrange layouts, 'Return to Previous Size' (appMenu.ts:477-509).
- Full Screen Tile: 'Left of Screen', 'Right of Screen' (appMenu.ts:510-516).
- Panel window 440 by 760, minimum 320 by 360 (windowPolicy.ts:237-243).

**Journey**

1. Choose Window > New Window: a window opens on a new chat, stepped off the front window on the same display (main.ts:1073-1087, :1457).
2. Open a conversation, choose Open in New Window: the same conversation opens in a second window and stays in the first, but a conversation lives in one window; the one that already held it keeps it (main.ts:1467-1471, windowRegistry.ts:37-50).
3. Choose Move Conversation to New Window: the first window returns to a new chat and a new window shows the conversation (main.ts:1473-1479).
4. Choose Always on Top: the window floats above others; unchecking turns it off (main.ts:1487-1490).
5. On the Research panel click the pop-out button; the panel moves to a small window and back (use-detachable-panels.ts, panel-windows.ts).

**What the person sees and gets**

- Menu checkmarks show Always on Top state; the menu is rebuilt when it changes (main.ts:1487-1490).
- Return to Previous Size is enabled only after a tile (appMenu.ts:503-507, main.ts:1527-1560).

**Settings**

- None found for always on top; it is not saved between launches [inferred from main.ts:1487-1490 where only the live window is changed].
- Primary window size and place are remembered; secondary windows are cascaded and not written (main.ts:1143-1150 comment).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- New Window, Open in New Window, Move Conversation to New Window, Always on Top and tiling are connected from the menu to main.ts functions (main.ts:2503-2560).
- Frame memory: only the primary window writes its frame; minimized, full-screen or zoomed readings are not stored as sizes, a zoomed frame is stored as maximized (windowState.ts:224-240, main.ts:1010-1055).
- Conversation clash: a window navigating onto a conversation another holds is sent back (windowRegistry.ts:37-86).
- Detachable Details and Research panels work on the desktop: the page opens a named popup the shell allows, sized 440 by 760 (panel-windows.ts:12-14, windowPolicy.ts:237-243, :318-327).
- A detached panel closes when its opener closes (windowPolicy.ts:277-282, :340-342).

**Incomplete**

- Brief S70.10 says detachable panels are missing; the code has detaching for two panels ('work' and 'research') only. Artifact and preview panels are not among DetachablePanel values (panel-windows.ts:7).
- Brief cites appMenu.ts:237 and :242 as companion window code; those lines are the Find menu. No companion window code was found; the Quick Ask panel comment is the only mention (quickAsk.ts:46).

**Present but disconnected or switched off**

- Detaching is offered only inside the desktop host (use-detachable-panels.ts uses useDesktopHost).

**Not available**

- A dedicated compact companion window: not found in the code.
- Detaching artifact, preview or other side panels: not found in the code.
- Windows are not restored after relaunch except the primary: not established.

## 4. Required behaviour

**Established requirements**

- A compact companion window can stay open beside other apps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.07)
- The user can keep an app window above all other windows. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.08)
- The user can open more than one app window and move a conversation into its own window. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.09)
- A panel (artifact, preview, side panel) can be popped out of the main window into its own window. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.10)
- A zoomed frame is not saved as a larger size. (source: task Should list; windowState.ts:224-240)
- With no conversation open, Move Conversation to New Window must not act. (source: task Should list; appMenu.ts:455-461)

**Acceptance criteria**

1. Window > New Window opens a second window on a new chat.
2. With a conversation open, Move Conversation to New Window leaves a new chat in the first window and shows the conversation in the second.
3. Always on Top keeps the chosen window above another app until unchecked.
4. With no conversation open the two conversation items are disabled.
5. Maximise then quit and relaunch: the window opens maximised, not enlarged beyond the screen.
6. Click the pop-out on the Research panel: the panel appears in its own window; click again and it returns.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Only one window holds a given conversation at a time [inferred from windowRegistry.ts:37-50].
- Always on Top is per window and per run [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide if the Quick Ask panel counts as the companion window and update the brief item.
- [proposed] Extend detaching to artifact and preview panels, or change the brief to say two panels.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | appMenu Window menu | `apps/desktop/electron/appMenu.ts` | Window menu items (appMenu.ts:438-543). |
| service | createShellWindow | `apps/desktop/electron/main.ts` | Creates primary and secondary windows (main.ts:1089-1330). |
| service | window actions | `apps/desktop/electron/main.ts` | Open, move, always on top, fill, center, tile (main.ts:1457-1530). |
| service | conversationWindow | `apps/desktop/electron/conversationWindow.ts` | Plan and public URL for opening a conversation elsewhere (conversationWindow.ts:1-20). |
| service | windowRegistry | `apps/desktop/electron/windowRegistry.ts` | Conversation clash, cascade offset, front window choice (windowRegistry.ts:28-118). |
| service | windowState | `apps/desktop/electron/windowState.ts` | Frame memory and restore (windowState.ts:151-300). |
| service | garnishCore tiling | `apps/desktop/electron/garnishCore.ts` | Tile and arrange geometry (garnishCore.ts:332-520). |
| service | windowPolicy detached panel | `apps/desktop/electron/windowPolicy.ts` | Allows agi-panel popups at 440 by 760 and locks their navigation (windowPolicy.ts:225-342). |
| service | panel-windows | `apps/web/features/desktop-host/lib/panel-windows.ts` | Opens, mirrors styles into and closes the detached panel windows. |
| hook | useDetachablePanels | `apps/web/features/desktop-host/hooks/use-detachable-panels.ts` | Exposes detach controls for Details and Research panels. |
| component | PanelWindowButton | `apps/web/features/desktop-host/components/PanelWindow.tsx` | The pop-out and move-back button (PanelWindow.tsx:36-60). |
| component | ResearchPanel and WorkSessionPanel | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Panels that carry the detach control (ResearchPanel.tsx:22-25, :455). |
| store | window state file | `apps/desktop/electron/shellWindowStore.ts` | Persists the primary frame (shellWindowStore.ts:19-29). |
| test | windowRegistry test | `apps/desktop/electron/__tests__/windowRegistry.test.ts` | Clash, front window, cascade. |
| test | conversationWindow test | `apps/desktop/electron/__tests__/conversationWindow.test.ts` | Copy URL and open in new window. |
| test | windowState test | `apps/desktop/electron/__tests__/windowState.test.ts` | Frame restore. |
| test | garnishCore test | `apps/desktop/electron/__tests__/garnishCore.test.ts` | Tile geometry. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A menu click calls the matching main-process function. | device | main.ts:2503-2560 |
| A new shell window loads a product route from the cloud origin in the shared session. | our servers | main.ts:1065, :1089-1115 |
| Always on Top sets the OS floating level on the front window. | device | main.ts:1487-1490 |
| A detach click calls window.open with an agi-panel name; the shell policy allows it and the page mirrors its own styles into it. | device | panel-windows.ts:15-16, windowPolicy.ts:318-327 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Primary window frame and maximised flag | window state file in user data | no sync found | Kept until app data is cleared |
| Previous size before a tile | memory only (previousWindowFrames map) | no | Lost on quit |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Windows open without an account; the product pages inside need sign-in. |
| Permissions | No OS permission needed. |
| Subscription | none found in the code |
| Limits and metering | none found in the code for window count. |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | Not applicable. |
| Local mode | Window behaviour is the same in Local mode; no plan is checked. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No conversation open | Open in New Window and Move Conversation are disabled. | appMenu.ts:455-461 |
| No front app window | Always on Top is disabled; tile and fill do nothing. | appMenu.ts:467, main.ts:1496-1500 |
| Conversation already in another window | The newcomer returns to its previous route. | windowRegistry.ts:37-86 |
| Display removed | Window is pulled onto the primary screen. | windowState.test.ts 'pulls the window onto the primary screen' |
| Opener closes | Detached panel window closes too. | windowPolicy.ts:277-282 |
| Account change | Other windows close. | main.ts:963-985 |
| Mac only items | Minimize All, Zoom All, Arrange in Front and window list are Mac only. | appMenu.ts:472-540 |
| Accessibility | Panel button has an aria-label and title. | PanelWindow.tsx:50-51 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/windowRegistry.test.ts`: Conversation clash, front window command target, detached panel not counted.
- `apps/desktop/electron/__tests__/conversationWindow.test.ts`: Copy URL and Open in New Window.
- `apps/desktop/electron/__tests__/windowState.test.ts`: Frame per display, restore, route rules.
- `apps/desktop/electron/__tests__/garnishCore.test.ts`: Tile and frame helpers.
- `apps/desktop/electron/__tests__/windowPolicy.test.ts`: Window open policy.
- `apps/desktop/electron/__tests__/appMenu.test.ts`: Window menu items.

**Test scenarios**

- **Move conversation**
  1. Open a conversation.
  2. Window > Move Conversation to New Window.
  - Expected: First window shows a new chat; second shows the conversation.
- **Always on top**
  1. Window > Always on Top.
  2. Focus another app.
  - Expected: The app window stays above it; unchecking restores normal order.
- **Frame memory**
  1. Maximise the window.
  2. Quit and relaunch.
  - Expected: Opens maximised; unmaximise shows the previous normal size.
- **Tile and return**
  1. Window > Move & Resize > Left.
  2. Window > Move & Resize > Return to Previous Size.
  - Expected: Window snaps to the left half then returns.
- **Pop out Research panel**
  1. Open a research panel in the desktop app.
  2. Click 'Open Research in a new window'.
  - Expected: A 440 by 760 window holds the panel; the main window shows it gone; moving back returns it.

**Where to look when it fails**

- No log line specific to this feature found; check the window state file in the user data folder.
- No run results recorded in files read.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/070-desktop-application.md](../../70-qa/test-plans/desktop/070-desktop-application.md)

## 10. Gaps and dependencies

- **No compact companion window exists apart from the Quick Ask panel.** Affects: Desktop users expecting a companion like leaders. Evidence: grep of electron files found 'companion' only at quickAsk.ts:46. Work needed: Decide scope and build or re-describe item S70.07.
- **Brief marks detachable panels missing but Details and Research detach today; artifact and preview do not.** Affects: Docs and users. Evidence: panel-windows.ts:7, PanelWindow.tsx:39-41. Work needed: Update brief; decide on other panels.
- **Always on Top is not remembered across launches and has no setting.** Affects: Desktop users. Evidence: main.ts:1487-1490. Work needed: Decide whether to persist.
- **Secondary windows are not restored after relaunch (not established).** Affects: Multi-window users. Evidence: main.ts:1143-1150. Work needed: Verify and document.

**Depends on**

- surface:desktop
- file:apps/desktop/electron/appMenu.ts
- file:apps/desktop/electron/main.ts
- F070-01
- F070-02
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design

## Unknown

- Whether secondary windows return after relaunch.
- Whether Always on Top should persist.
- Whether 'companion window' means the Quick Ask panel or a separate surface.
- Behaviour of the Mac window list when many windows are open.
- Whether ArtifactPanel is meant to be detachable (not found).
