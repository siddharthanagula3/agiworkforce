---
id: "F007-03"
type: "feature"
title: "Code workspace and several sessions at once"
aliases: ["Conversation plus code workspace", "Multi-session tiled layout", "Stacked-session layout", "Dockable panels", "Code panes", "Session pane", "useCodePanes", "S7.07", "S7.08", "S7.09", "S7.13"]
area: "7 Layout systems"
available_on: ["web", "desktop", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "n/a", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S7.07", "S7.08", "S7.09", "S7.13"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "surface:vscode", "SYS-agents-tools-and-automation", "SYS-api-and-contracts", "file:apps/web/features/code/hooks/use-code-panes.ts", "file:apps/web/features/code/CloudCodePage.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F007-03 Code workspace and several sessions at once

The Code page shows a coding session with a session list rail, and up to three sessions side by side (tiled) or one above another (stacked). Cmd or Ctrl click a session to add a pane. In VS Code the chat is a sidebar view or an editor tab you can dock with the editor's own tools. The CLI can show git changes beside the chat.

Area: [7. Layout systems](README.md). Requirement items: [S7.07](../../10-requirements/capabilities/007-layout-systems.md#s707), [S7.08](../../10-requirements/capabilities/007-layout-systems.md#s708), [S7.09](../../10-requirements/capabilities/007-layout-systems.md#s709), [S7.13](../../10-requirements/capabilities/007-layout-systems.md#s713).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person work on several coding sessions in one window and see a session's chat together with its code work (changes, diffs, terminal). VS Code uses the editor's own layout for docking; the CLI shows a workspace pane for git changes.

**Why it exists.** Coding work runs in parallel and needs the conversation next to the code. The contract describes a code workspace with session navigation and draggable chat, diff, terminal, editor and browser panes (doc: docs/product/experience-contract.md:187).

**Who uses it.** Developers using the Code surface on web or desktop, VS Code, or the CLI.

**Problems it solves**

- Switching tabs to follow two agent sessions.
- Losing the chat while reviewing a diff.
- Having the chat only in a side bar when it needs an editor-sized area (VS Code).

**Use cases**

- Compare two running sessions side by side.
- Stack three sessions on a wide monitor.
- In VS Code open the chat in an editor tab next to the file being changed.
- In the CLI show changes since the last commit beside the chat.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): the Code page with the session rail (apps/web/features/code/CloudCodePage.tsx:2423).
- Layout toggle labels 'Stack panes' and 'Place panes side by side'; close label 'Close pane'; each extra pane is a region named 'Session pane' (apps/web/features/code/components/CodePanes.tsx:11, apps/web/features/code/components/CodePanes.tsx:14).
- VS Code: activity bar container 'AGI Code' with the sidebar view; command 'Code: Open Chat in Editor' and an editor title button (apps/extension-vscode/package.json:953, apps/extension-vscode/package.json:93, apps/extension-vscode/package.json:1036).
- CLI: slash command '/diff panel' toggles the workspace pane (apps/cli/src/tui/tui_app.rs:5902).
- Mobile and Chrome: not applicable per the brief.

**Before you start**

- Web: window wider than 900 pixels and not itself a pane (apps/web/features/code/CloudCodePage.tsx:1801, apps/web/features/code/code-surface.ts:83).
- Sessions in the rail (cloud sessions, and local sessions on the desktop app).
- CLI: a window at least 90 columns wide (apps/cli/src/tui/tui_app.rs:2665).

**Screens and controls**

- Rail rows: plain click opens a session; Cmd or Ctrl click asks to split (apps/web/features/code/components/CodeRail.tsx:530).
- Pane header tools: layout toggle and close button (apps/web/features/code/components/CodePanes.tsx:11).
- Keyboard: Cmd or Ctrl plus backslash closes the focused pane, or the main pane if it is focused (apps/web/features/code/hooks/use-code-panes.ts:28, apps/web/features/code/hooks/use-code-panes.ts:105).
- VS Code setting 'agiWorkforce.chat.lockEditorGroups' keeps chat editors in their own group (apps/extension-vscode/src/platform/config.ts:235).

**Journey**

1. Open the Code page and select a session.
2. Cmd or Ctrl click a second session in the rail; it opens in a new pane.
3. Click inside a pane to focus it; the focused pane header shows a ring.
4. Use the layout button to switch between side by side and stacked.
5. Close a pane with its close button or Cmd or Ctrl plus backslash.

**What the person sees and gets**

- Focused pane shows an inset ring under its header (apps/web/features/code/CloudCodePage.module.css:2639).
- Stacked layout divides rows by pane count 2 or 3 (apps/web/features/code/CloudCodePage.module.css:2644, apps/web/features/code/CloudCodePage.module.css:2648).

**Settings**

- Tiled or stacked choice: held in component state only; not persisted (apps/web/features/code/hooks/use-code-panes.ts:41).
- VS Code: 'chatLocation' (sidebar or editor) and chat.lockEditorGroups (apps/extension-vscode/src/platform/config.ts:231, apps/extension-vscode/src/platform/config.ts:235).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: hook useCodePanes holds panes, focus and layout (starts 'tiled'), limit 3 including the main pane (apps/web/features/code/hooks/use-code-panes.ts:27, apps/web/features/code/hooks/use-code-panes.ts:41).
- Selecting a session that is the main or already open focuses it; split adds a pane when fewer than 3 are open; otherwise a focused extra pane is replaced; otherwise it returns false and the caller opens the session in the main pane (apps/web/features/code/hooks/use-code-panes.ts:73, apps/web/features/code/hooks/use-code-panes.ts:86, apps/web/features/code/hooks/use-code-panes.ts:93, apps/web/features/code/CloudCodePage.tsx:1850).
- Closing the main pane promotes the first extra pane (apps/web/features/code/hooks/use-code-panes.ts:59).
- Each extra pane is a full CloudCodePage in pane mode (apps/web/features/code/CloudCodePage.tsx:2914).
- The surface sets data-pane-layout and data-pane-count; CSS defines grid rows for stacked mode (apps/web/features/code/CloudCodePage.tsx:2423, apps/web/features/code/CloudCodePage.module.css:2644).
- Panes are disabled in narrow mode, under 900 pixels (apps/web/features/code/CloudCodePage.tsx:1801, apps/web/features/code/code-surface.ts:83).
- CLI: workspace pane shows git changes since the last commit beside the chat at 58/42 when the window is 90 columns or more (apps/cli/src/tui/tui_app.rs:2737, apps/cli/src/tui/tui_app.rs:2742, apps/cli/src/tui/tui_app.rs:5902).
- VS Code: the sidebar webview is registered with retained context; a separate editor panel titled 'AGI Chat' can be opened (apps/extension-vscode/src/core/chatSetup.ts:62, apps/extension-vscode/src/providers/chatEditorPanel.ts:63).

**Incomplete**

- Split is only reachable by Cmd or Ctrl click; I found no visible split button in the rail (apps/web/features/code/components/CodeRail.tsx:530).
- Pane layout and open panes are lost on reload; not persisted (apps/web/features/code/hooks/use-code-panes.ts:41).
- When three panes are open and the main pane is focused, a Cmd or Ctrl click does not replace anything; the session replaces the main one (apps/web/features/code/hooks/use-code-panes.ts:93).
- Dockable panels on web and desktop: the brief says missing (doc: knowledge-base/data/area-briefs/007-layout-systems.md); the layout is a fixed rail plus grid.

**Present but disconnected or switched off**

- Local sessions have their own panel (LocalSessionPanel) with its own side tools; whether local sessions can be split panes was not established.

**Not available**

- Mobile and Chrome have no code workspace layout (brief: not listed).
- Dockable panels on web, desktop (brief: missing).
- Tiled or stacked sessions on CLI (not applicable per the brief).

## 4. Required behaviour

**Established requirements**

- A coding session shows the conversation alongside the code workspace (S7.07). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.07)
- Two or more live sessions are visible side by side, each independently usable (S7.08). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.08)
- Several live sessions can be stacked one above another (S7.09). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.09)
- Panels can be docked to a different edge and stay there (S7.13); only VS Code is marked done. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.13)
- Code workspace layout: session navigation plus draggable chat, diff, terminal, editor and browser panes. (source: doc: docs/product/experience-contract.md:187)

**Acceptance criteria**

1. Cmd or Ctrl click on a second session opens a second pane; a third click opens a third; a fourth does not add a fourth.
2. The layout button toggles between tiled and stacked and the label changes.
3. Cmd or Ctrl plus backslash closes the focused pane; with the main pane focused the next pane becomes main.
4. Selecting a session already open focuses it rather than duplicating it.
5. Under 900 pixels wide no split pane appears.
6. In the CLI, '/diff panel' shows the changes beside the chat at 90 columns or more and '/diff panel' again closes it.
7. VS Code 'Code: Open Chat in Editor' opens the chat as an editor tab that can be moved with the editor's own docking.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Panes are independent: each is its own page instance with its own state (apps/web/features/code/CloudCodePage.tsx:2914) [inferred].
- VS Code docking is provided by VS Code itself, not by extension code [inferred; no dock code found in the files read].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a visible split control to the rail rows.
- [proposed] Remember layout and open panes per window.
- [proposed] Add tests for useCodePanes.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useCodePanes | `apps/web/features/code/hooks/use-code-panes.ts` | Pane list, focus, layout, limit of 3 and close shortcut. |
| screen | CloudCodePage | `apps/web/features/code/CloudCodePage.tsx` | Code page; wires panes, rail and nested pane pages. |
| component | CodePanes (frame and tools) | `apps/web/features/code/components/CodePanes.tsx` | CodePageFrame, CodePaneTools and the label strings. |
| component | CodeRail | `apps/web/features/code/components/CodeRail.tsx` | Session list; Cmd or Ctrl click triggers a split. |
| config | CloudCodePage styles | `apps/web/features/code/CloudCodePage.module.css` | Tiled and stacked grid rules and focus ring. |
| config | CODE_SIZES | `apps/web/features/code/code-surface.ts` | narrowViewport = 900. |
| component | CodeChangesPanel | `apps/web/features/code/components/CodeChangesPanel.tsx` | Changes view next to the chat for cloud sessions. |
| test | LocalSessionPanel panes test | `apps/web/features/code/components/LocalSessionPanel.panes.test.tsx` | Tests for local session side tools (the panel file is beside it). |
| screen | TUI render_chat | `apps/cli/src/tui/tui_app.rs` | Splits chat and workspace pane 58/42 (line 2742). |
| command | /diff panel | `apps/cli/src/tui/tui_app.rs` | Toggles the workspace pane (line 5902); content from workspace_pane_lines. |
| service | setupChat | `apps/extension-vscode/src/core/chatSetup.ts` | Registers the sidebar webview view. |
| component | ChatEditorPanel | `apps/extension-vscode/src/providers/chatEditorPanel.ts` | Chat as an editor tab titled 'AGI Chat'; optional group lock. |
| command | agi-workforce.openChatInEditor | `apps/extension-vscode/src/core/commandSetup.ts` | Command registration (line 1130). |
| config | VS Code contributions | `apps/extension-vscode/package.json` | viewsContainers, views, command and editor title button. |
| config | Config.chatLocation and lockChatEditorGroups | `apps/extension-vscode/src/platform/config.ts` | Where the chat opens and group locking. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A rail row click passes split=true when Cmd or Ctrl is held. | device | (apps/web/features/code/components/CodeRail.tsx:530) |
| leaveLocalEdits guards unsaved local edits, then panes.select decides to focus, add, replace or open as main. | device | (apps/web/features/code/CloudCodePage.tsx:1850) |
| Each extra pane mounts its own CloudCodePage and loads its session from the cloud code service. | device and our servers | (apps/web/features/code/CloudCodePage.tsx:2914) session data service not read in detail |
| CLI: /diff panel reads the git diff locally and draws it beside the chat after each turn. | device | (apps/cli/src/tui/tui_app.rs:2665) |
| VS Code creates a webview panel for the editor chat and keeps its context while hidden. | device | (apps/extension-vscode/src/providers/chatEditorPanel.ts:71) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Open panes, focus and layout | React component state | no | Lost on reload |
| Session content | Cloud code sessions on our servers; local sessions on the machine | cloud sessions yes (details in the code feature) | not read |

**Models and providers.** Layout is model independent. Which model a session uses is chosen per session by the code feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud sessions need an account; local sessions run on the desktop app. Exact gates were not read. |
| Permissions | none found in the code for the layout |
| Subscription | Code usage components exist (apps/web/features/code/components/CodeUsageDashboard.tsx) but their rules were not read: unknown. The layout has no entitlement check found. |
| Limits and metering | Three panes is a constant limit (apps/web/features/code/hooks/use-code-panes.ts:27). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Local sessions are a separate panel on the desktop app; whether they can be tiled was not established. CLI workspace pane reads local git only. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Limit reached | No fourth pane; a focused extra pane is replaced, else the main session changes. | (apps/web/features/code/hooks/use-code-panes.ts:86) |
| Session already open | It is focused, not duplicated. | (apps/web/features/code/hooks/use-code-panes.ts:73) |
| Main session also open as a pane | The duplicate pane is removed. | (apps/web/features/code/hooks/use-code-panes.ts:59) |
| Narrow window | Panes disabled; rail becomes a sheet. | (apps/web/features/code/CloudCodePage.tsx:1801) |
| Unsaved local edits | The select handler asks first through leaveLocalEdits. | (apps/web/features/code/CloudCodePage.tsx:1850) |
| Git diff fails (CLI) | The pane shows the error message. | (apps/cli/src/tui/tui_app.rs:2665) |
| CLI window too narrow | Pane is not drawn under 90 columns. | (apps/cli/src/tui/tui_app.rs:2665) |
| Offline, timeout | not handled in the layout code | use-code-panes.ts holds only local state (apps/web/features/code/hooks/use-code-panes.ts:41) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalSessionPanel.panes.test.tsx`: The iOS Simulator tool pane of a local session (opens beside the session, floats, expands). Not the multi-session panes.
- `apps/web/features/code/CloudCodePage.test.tsx`: Code page tests; no test for split panes found by searching 'metaKey', 'Close pane', 'Session pane', 'Stack panes'.

**Test scenarios**

- **Add panes**
  1. Open the Code page at 1440 wide with three sessions.
  2. Click session A, then Cmd or Ctrl click B and C.
  - Expected: Three panes show; the new pane is focused.
- **Toggle layout**
  1. With three panes click 'Stack panes'.
  - Expected: Rows replace columns and the button says 'Place panes side by side'.
- **Close focused pane**
  1. Focus pane B.
  2. Press Cmd or Ctrl plus backslash.
  - Expected: Pane B closes; main pane stays.
- **Narrow window**
  1. Resize to 800 wide.
  - Expected: Panes are off and the rail becomes a drawer.
- **CLI workspace pane**
  1. Run '/diff panel' in a 120 column terminal inside a git repo with changes.
  - Expected: Changes appear on the right; running it again closes the pane.
- **VS Code editor chat**
  1. Run 'Code: Open Chat in Editor'.
  2. Drag the tab to a side group.
  - Expected: Chat shows in the editor area and keeps its state when hidden.

**Where to look when it fails**

- No error names or logs found for panes; inspect data-pane-layout and data-pane-count on the surface element.
- CLI: the notice text 'The workspace pane now shows...' confirms the toggle.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/007-layout-systems.md](../../70-qa/test-plans/web/007-layout-systems.md)
- Desktop: [70-qa/test-plans/desktop/007-layout-systems.md](../../70-qa/test-plans/desktop/007-layout-systems.md)
- CLI: [70-qa/test-plans/cli/007-layout-systems.md](../../70-qa/test-plans/cli/007-layout-systems.md)
- VS Code: [70-qa/test-plans/vscode/007-layout-systems.md](../../70-qa/test-plans/vscode/007-layout-systems.md)

## 10. Gaps and dependencies

- **No test for useCodePanes or the split shortcut.** Affects: Web and Desktop. Evidence: Search found none. Work needed: Add unit tests for select, close and limits.
- **Split is hidden behind a modifier click with no visible control.** Affects: Web and Desktop users. Evidence: (apps/web/features/code/components/CodeRail.tsx:530). Work needed: Add a visible control and hint.
- **Layout not remembered.** Affects: Web and Desktop. Evidence: (apps/web/features/code/hooks/use-code-panes.ts:41). Work needed: Persist per window if wanted.
- **Dockable panels missing on web and desktop.** Affects: Web and Desktop. Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md). Work needed: Product decision.
- **Brief lines for VS Code docking (package.json:786, chatSetup.ts:60) do not match what the code shows.** Affects: Documentation accuracy. Evidence: (apps/extension-vscode/package.json:953). Work needed: Update the brief.

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- SYS-agents-tools-and-automation
- SYS-api-and-contracts
- file:apps/web/features/code/hooks/use-code-panes.ts
- file:apps/web/features/code/CloudCodePage.tsx

## Unknown

- Whether local sessions can be split into panes.
- How VS Code docking is wired beyond the editor's own tools.
- Access rules for cloud code sessions and their plan limits.
- Whether the CLI TUI has any other side-by-side layout.
- Whether the desktop Electron app adds anything on top of the hosted Code page.
