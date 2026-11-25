---
id: "PLAN-vscode-007"
type: "test-plan"
title: "VS Code · 7. Layout systems"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "7"
---
# VS Code · 7. Layout systems

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S7.01 Centered new-chat layout.

- **Expected:** An empty new chat shows its start view (greeting, prompt entry or suggestions) centred in the available area rather than an empty transcript.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2147; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2369 (quoted code not found in the file now); apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code (sidebar) > New chat (+) button in the header (labels found in the code)
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar to open the sidebar.
  2. If the transcript already has messages, click the New chat (+) button in the header.
  3. Look at the empty transcript area: the headline 'Start a conversation' and the line 'Ask about your code or describe a change.' should sit in the middle of the area, above the composer.
  4. Resize the window and check the start view stays centred.

## S7.02 Reading-width conversation layout.

- **Expected:** Message text is constrained to a readable column width that stays centred when the window is wide.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:520 (quoted code not found in the file now)
- **Where to find it:** AGI Code (sidebar) > Sessions (clock icon in the header) > open a conversation that has replies (labels found in the code)
- **Needs:** a conversation with at least one reply
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar.
  2. Click the Sessions button (clock icon, hover title 'Sessions') in the header.
  3. Click a conversation that already has replies.
  4. Widen the VS Code window a lot, then narrow it.
  5. Look that the message text stays in one centred column of about 768 px, with empty space on both sides when wide.

## S7.04 Conversation plus artifact split view.

- **Expected:** An artifact opens in its own pane beside the conversation so both are visible and usable at once.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/artifacts/artifactActions.ts:135; apps/extension-vscode/src/core/commandSetup.ts:2645
- **Where to find it:** Command Palette > Code: Show Artifacts > choose an artifact under 'Open an artifact…' (labels found in the code)
- **Needs:** a conversation that has produced an artifact
- **Steps:**
  1. Open a conversation that has produced an artifact (AGI Code sidebar or Code: Open Chat in Editor).
  2. Press Cmd+Shift+P, type 'Code: Show Artifacts' and press Enter.
  3. Choose an artifact from the list under 'Open an artifact…'.
  4. Look whether the artifact opens in its own tab beside the conversation, with both visible and usable at once.

## S7.07 Conversation plus code workspace.

- **Expected:** A coding session shows the conversation alongside the code workspace (changes, diffs, terminal or editor) in one view.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/chatSetup.ts:62; apps/extension-vscode/src/core/commandSetup.ts:1130
- **Where to find it:** AGI Code (sidebar) beside the editor, or Command Palette > Code: Open Chat in Editor, with Code: Git Diff for changes (labels found in the code)
- **Needs:** a project folder open in VS Code, optionally a git repository with changes
- **Steps:**
  1. Open a project folder in VS Code and open a file in the editor.
  2. Click the AGI Code icon in the Activity Bar so the chat shows beside the editor.
  3. Optionally press Cmd+Shift+P, type 'Code: Git Diff' and press Enter to show changes.
  4. Look that the conversation, the editor and any diff are visible together in one window.

## S7.08 Multi-session tiled layout.

- **Expected:** Two or more live sessions are visible side by side in one window, each independently usable.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1130; apps/extension-vscode/src/providers/chatEditorPanel.ts:68
- **Where to find it:** Command Palette > Code: Open Chat in Editor (run twice), then drag one 'AGI Chat' tab to the side of the other (labels found in the code)
- **Needs:** a signed-in account to send messages
- **Steps:**
  1. Press Cmd+Shift+P, type 'Code: Open Chat in Editor' and press Enter.
  2. Repeat step 1 so a second chat tab opens (the second is titled 'AGI Chat 2').
  3. Drag one chat tab to the right edge of the editor area so both sit side by side.
  4. Send a short message in each chat and look that both stay visible and usable.

## S7.09 Stacked-session layout.

- **Expected:** Several live sessions can be stacked one above another in one window, each independently usable.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1130; apps/extension-vscode/src/providers/chatEditorPanel.ts:68
- **Where to find it:** Command Palette > Code: Open Chat in Editor (run twice), then drag one 'AGI Chat' tab to the bottom edge of the editor area (labels found in the code)
- **Needs:** a signed-in account to send messages
- **Steps:**
  1. Press Cmd+Shift+P, type 'Code: Open Chat in Editor' and press Enter.
  2. Repeat step 1 to open a second chat tab.
  3. Drag one chat tab to the bottom edge of the editor area so it sits below the other.
  4. Send a short message in each chat and look that both stay visible and usable.

## S7.12 Collapsible secondary navigation.

- **Expected:** Secondary navigation (conversation list, menus) can be collapsed out of the way and reopened.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2928; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3005; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6455
- **Where to find it:** AGI Code (sidebar) > Sessions (clock icon in the header) > Close (labels found in the code)
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar.
  2. Click the Sessions button in the header (clock icon, hover title 'Sessions').
  3. Click the Close button (hover title 'Close') at the top of the Sessions panel.
  4. Look that the Sessions panel hides and the transcript comes back.
  5. Click Sessions again and look that it reopens.

## S7.13 Dockable panels.

- **Expected:** Panels can be moved to a different edge or region of the window (docked) and stay there.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/chatSetup.ts:62; apps/extension-vscode/package.json:953; apps/extension-vscode/src/core/commandSetup.ts:1130
- **Where to find it:** AGI Code in the Activity Bar > drag the AGI Code panel to the right side bar or the bottom panel (labels found in the code)
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar.
  2. Drag the AGI Code view to the right edge of the window (Secondary Side Bar) or to the bottom panel area.
  3. Look that the view now sits in the new edge.
  4. Quit and reopen VS Code and look whether the view is still in the new place.

## S7.14 Detachable desktop panels.

- **Expected:** A panel of the desktop app can be torn off into its own OS window and used there.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/chatSetup.ts:62; apps/extension-vscode/package.json:953; apps/extension-vscode/src/core/commandSetup.ts:1130
- **Where to find it:** Command Palette > Code: Open Chat in Editor, then right-click the 'AGI Chat' tab and move it to a new window using VS Code's tab menu (labels found in the code)
- **Needs:** a signed-in account to send messages
- **Steps:**
  1. Press Cmd+Shift+P, type 'Code: Open Chat in Editor' and press Enter.
  2. Right-click the 'AGI Chat' tab.
  3. Choose VS Code's option that moves the editor into a new window.
  4. Look that the chat opens in its own OS window and can still send a message.

## S7.15 Full-screen editor.

- **Expected:** An editor (prompt, document or source) can take over the whole screen for focused editing and return to the chat.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/artifacts/artifactActions.ts:135; apps/extension-vscode/src/core/commandSetup.ts:2645
- **Where to find it:** not found in the code. Searched apps/extension-vscode for 'Full screen', 'Fullscreen', 'Maximi' and 'Expand' in package.json and src; no extension command or control for a full-screen editor was found, only VS Code's own window or Zen Mode.

## S7.20 Persistent bottom composer.

- **Expected:** The composer stays anchored at the bottom of the chat while the transcript scrolls above it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:592; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3292; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** AGI Code (sidebar) > the 'Describe a task…' box at the bottom (labels found in the code)
- **Needs:** a conversation with enough messages to scroll
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar.
  2. Open or make a conversation with enough messages to scroll.
  3. Scroll the transcript up with the mouse wheel or trackpad.
  4. Look that the 'Describe a task…' box stays anchored at the bottom while the messages scroll above it.

## S7.21 Composer expansion for long prompts.

- **Expected:** The composer grows (or opens a larger editor) as a long prompt is typed, instead of staying one line.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5140; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3344
- **Where to find it:** AGI Code (sidebar) > the 'Describe a task…' box at the bottom (labels found in the code)
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar.
  2. Click into the 'Describe a task…' box.
  3. Type or paste a long prompt of several lines.
  4. Look that the box grows taller as lines are added, up to about 140 px, then scrolls inside itself.

## S7.22 Scrollable transcript independent from side panels.

- **Expected:** The transcript scrolls in its own region, so scrolling it does not move side panels, header or composer (and vice versa).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:592; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5140
- **Where to find it:** AGI Code (sidebar) > open a conversation with many messages > scroll the transcript (labels found in the code)
- **Needs:** a conversation with many messages
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar.
  2. Click Sessions in the header (clock icon) and open a long conversation, then close Sessions with Close.
  3. Scroll the transcript with the mouse wheel.
  4. Look that only the transcript moves, while the header and the 'Describe a task…' box stay in place.
  5. Scroll over the header or composer and look that the transcript does not move.

## S7.30 Layout restoration between visits.

- **Expected:** Layout choices the user made (sidebar collapsed, panel widths, open panels) come back on the next visit.
- **Code:** done. Evidence present: apps/extension-vscode/src/providers/chatEditorPanel.ts:143; apps/extension-vscode/src/extension.ts:366; apps/extension-vscode/src/providers/chatEditorPanel.ts:69
- **Where to find it:** AGI Code (sidebar) > the usage banner's 'Collapse meter' button (×), then reload VS Code (labels found in the code)
- **Needs:** a signed-in account that shows the usage banner
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar and find the usage banner.
  2. Click its × button (hover title 'Collapse meter'); look that it shrinks to a 'Usage' pill.
  3. Quit and reopen VS Code in the same folder, or run Developer: Reload Window from the Command Palette.
  4. Look that the usage banner is still collapsed to the 'Usage' pill.
  5. Optionally run Code: Open Chat in Editor, reload, and look whether the AGI Chat tab comes back.
