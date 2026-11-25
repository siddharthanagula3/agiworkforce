---
id: "PLAN-vscode-073"
type: "test-plan"
title: "VS Code · 73. VS Code and IDE extension"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "73"
---
# VS Code · 73. VS Code and IDE extension

30 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S73.01 Sidebar chat view.

- **Expected:** An AGI Workforce view in the VS Code sidebar hosts a chat that sends turns and streams replies.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:966; apps/extension-vscode/src/core/chatSetup.ts:62; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5386
- **Where to find it:** Activity Bar > AGI Code icon, then the box "Describe a task…" (labels found in the code)
- **Needs:** a signed-in AGI account or an API key (the code does not state this as a prerequisite; not verified)
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar (left edge of VS Code).
  2. Click the box that says "Describe a task…", type a short question and press Enter or click Send.
  3. Look for the reply appearing word by word under your message (it streams), and for the turn staying in the chat.

## S73.02 Editor-adjacent chat.

- **Expected:** Chat can open as an editor tab beside code (and @agi in VS Code native Chat).
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1130; apps/extension-vscode/src/providers/chatEditorPanel.ts:69; apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:669
- **Where to find it:** Command Palette > Code: Open Chat in Editor (also the editor title bar on a file tab) (labels found in the code)
- **Steps:**
  1. Open any code file.
  2. Press Cmd+Shift+P, type "Code: Open Chat in Editor", press Enter.
  3. Look for a new editor tab named "AGI Chat" next to the code, with the chat inside it and able to send a turn.
  4. Optional: in VS Code's Chat view type @agi and send a question; the reply should come from AGI Code.

## S73.03 Session picker.

- **Expected:** The user can list previous sessions (local and cloud) and reopen one.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1628; apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:100 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:1498
- **Where to find it:** AGI Code header > Sessions (clock icon) > Local tab; or Command Palette > Code: Show Sessions History (labels found in the code)
- **Needs:** at least one earlier local session and, for cloud, a signed-in account
- **Steps:**
  1. Click the clock icon with the tooltip "Sessions" in the AGI Code header.
  2. Check the "Local" tab lists earlier sessions; the "Cloud" tab lists cloud ones.
  3. Click one session row to reopen it.
  4. Compare: the chosen earlier session should open with its messages.

## S73.04 Repository/workspace association.

- **Expected:** Sessions are tied to the open workspace folder: the runtime runs in that folder and history is listed per folder.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2442 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5051
- **Where to find it:** no screen of its own. The code lists threads from every open workspace folder (conversationTreeProvider), so the check is that each row names its own folder.
- **Needs:** two local folders open in one window, with a session in each
- **Steps:**
  1. Open two folders in one VS Code window, start a session in each.
  2. Run Code: Show Sessions History from the Command Palette.
  3. Check that sessions from both open folders are listed and that each row's detail line shows its folder path after the model name.

## S73.05 Active-file context.

- **Expected:** The active editor file is attached to each turn as context (shown as a removable chip).
- **Code:** done. Evidence present: apps/extension-vscode/src/data/composerContext.ts:459; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5401
- **Where to find it:** Chat composer "Describe a task…": a file-name chip appears by itself when a file is open (labels found in the code)
- **Steps:**
  1. Open a code file in the editor and leave it active.
  2. Click into the box "Describe a task…" in the AGI Code sidebar.
  3. Look for a chip with the file's name above the box, and click its × to remove it.
  4. Ask "What file do you see?" and compare the answer with the file that is open.

## S73.06 Selected-code context.

- **Expected:** Selected code in the editor is attached to the turn (chip) and selection commands (Explain, Send Selection) exist.
- **Code:** done. Evidence present: apps/extension-vscode/src/data/composerContext.ts:587; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5393; apps/extension-vscode/src/core/commandSetup.ts:1145; apps/extension-vscode/src/data/contextExclusion.ts:89; apps/extension-vscode/src/__tests__/contextExclusion.test.ts:19
- **Where to find it:** Editor right-click > Code: Explain Selection (and Code: Send Selection to a New Chat) (labels found in the code)
- **Steps:**
  1. Select a few lines of code in an open file.
  2. Right-click the selection and choose "Code: Explain Selection" (shortcut Cmd+Shift+Alt+E).
  3. Look in the chat composer for a chip named "<file name> selection" and for an explanation of the selected lines.
  4. Compare: the explanation should refer to the selected code only.

## S73.07 Unsaved-buffer context.

- **Expected:** Unsaved edits in open buffers (including untitled files) reach the model rather than the stale saved file.
- **Code:** done. Evidence moved: apps/extension-vscode/src/data/composerContext.ts:163 (quoted code not found in the file now); apps/extension-vscode/src/data/composerContext.ts:572
- **Where to find it:** no screen of its own. Attaching a dirty or untitled buffer is automatic; the setting to save before send defaults to off, so the unsaved text is what is sent.
- **Needs:** a code file you can edit
- **Steps:**
  1. Open a file, type a new function near the top, and do not save it (no Cmd+S).
  2. In the AGI Code box ask "What is the first function in this file?".
  3. Compare the answer with the unsaved text; the saved file on disk does not contain it.

## S73.08 File mentions.

- **Expected:** Typing @ in the composer searches workspace files and attaches the chosen file content to the turn.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8545; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1554; apps/extension-vscode/src/features/chat-participant/promptReferences.ts:209
- **Where to find it:** Chat composer: type @ followed by a file name; the list is titled "Workspace files and symbols" (labels found in the code)
- **Needs:** a workspace with files
- **Steps:**
  1. Click the box "Describe a task…" and type @ then the first letters of a file name.
  2. Use the arrow keys to pick the file in the list and press Enter.
  3. Type a question about the file and send.
  4. Compare: the answer should use the content of the chosen file.

## S73.09 Symbol mentions.

- **Expected:** @ search also offers workspace symbols, attaching only the symbol's file range.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8545; apps/extension-vscode/src/data/mentionSearch.ts:106
- **Where to find it:** Chat composer: type @ then a function or class name; list items read "<name> · <kind> · <path>" (labels found in the code)
- **Needs:** a workspace whose language has a VS Code symbol provider (for example TypeScript); without one only files appear (per the code comment)
- **Steps:**
  1. In "Describe a task…" type @ and the name of a function or class from the project.
  2. Look for an item in the same list with a kind word such as function or class and a file path with line numbers.
  3. Pick it with Enter and send a question.
  4. Compare: the attached part should be only the lines of that symbol, not the whole file.

## S73.10 Diagnostics context.

- **Expected:** Editor diagnostics (problems) for the active file are attached as context, and errors can be explained or fixed from the editor.
- **Code:** done. Evidence present: apps/extension-vscode/src/data/composerContext.ts:333; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5393
- **Where to find it:** Chat composer chip "{count} problems" (appears by itself); editor right-click > Code: Explain Error (labels found in the code)
- **Needs:** a file with at least one error or warning
- **Steps:**
  1. Open a file that has a red error or yellow warning.
  2. Look above the chat box for a chip such as "1 problem" or "N problems".
  3. Right-click the line with the error in the editor and choose "Code: Explain Error" (shortcut Cmd+Shift+Alt+X).
  4. Compare: the reply should explain that error.

## S73.11 Inline suggestions.

- **Expected:** Ghost-text inline code suggestions appear while typing and can be accepted with Tab.
- **Code:** done. Evidence moved: apps/extension-vscode/package.json:66; apps/extension-vscode/src/core/providerSetup.ts:106; apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts:193 (quoted code not found in the file now)
- **Where to find it:** VS Code Settings (Cmd+,) > search "ghost-text inline completions" > turn on AGI Code inline completions (off by default); then type in any code file (labels found in the code)
- **Needs:** the setting turned on in your user settings, a signed-in account or AGI API key, and a trusted workspace
- **Steps:**
  1. Press Cmd+, and search "ghost-text inline completions".
  2. Tick the setting for AGI Code inline completions (it is off by default, user settings only).
  3. Sign in with Code: Sign In to AGI Cloud (or set a key with Code: Set API Key), open a code file, type a few lines and pause.
  4. Look for grey ghost text after the cursor, then press Tab to accept it.

## S73.12 Inline edits.

- **Expected:** Selecting code and running Fix/Refactor rewrites that code in place in the editor.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1150; apps/extension-vscode/src/platform/applyEdit.ts:50 (quoted code not found in the file now)
- **Where to find it:** Select code > right-click > Code: Fix Issue or Code: Refactor Code; then the notice button "Apply Inline" (labels found in the code)
- **Needs:** a trusted workspace and a signed-in account or key
- **Steps:**
  1. Select a function in an open file in a trusted workspace.
  2. Right-click the selection and choose "Code: Refactor Code", wait for the reply.
  3. When the notice appears, click "Apply Inline" (or "View in New Tab").
  4. Compare: the selected code in the editor should be replaced in place by the new version.

## S73.13 Native diff review.

- **Expected:** Proposed or applied changes can be reviewed in VS Code's own diff editor.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1928; apps/extension-vscode/src/features/path-links/index.ts:95
- **Where to find it:** Chat approval card > "Review change" (opens VS Code's diff editor); after a turn, "Review changes" (labels found in the code)
- **Needs:** a file the agent can edit, in a trusted workspace
- **Steps:**
  1. Ask the agent to edit a file in the chat (Ask or Auto mode) and wait for the approval card.
  2. Click "Review change" on the card.
  3. Look for VS Code's side-by-side diff editor showing the original and the proposed file.
  4. Compare the diff with the change described in chat; then use Accept or Reject from the editor.

## S73.14 Hunk acceptance.

- **Expected:** Individual hunks of a proposed change can be accepted or rejected separately.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7188; apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:90; apps/extension-vscode/src/features/permissions/proposedChangeReview.ts:142; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:3460
- **Where to find it:** Chat approval card > "Review change", then revert parts in VS Code's diff editor and approve (labels found in the code)
- **Needs:** an edit that has more than one separate block
- **Steps:**
  1. Click "Review change" on an approval card that proposes several edits.
  2. In the diff editor, use the revert control on one block to undo only that part (VS Code's own diff control).
  3. Approve the change in chat.
  4. Compare: the file should keep the edits you did not revert.

## S73.15 Apply patch.

- **Expected:** A suggested code block can be applied to the file as a reviewable patch and accepted.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2281; apps/extension-vscode/src/providers/diffDecorationProvider.ts:375
- **Where to find it:** Chat code block > "Apply" button (shows on hover); then the editor's "Accept" link above the change (labels found in the code)
- **Needs:** an open file in the editor (without one the chat shows a warning to open a file)
- **Steps:**
  1. Ask for a code change so the reply contains a code block, and hover over the block.
  2. Click "Apply" (the button is labelled Opening… while it works).
  3. Look in the open file for the highlighted change with an "Accept" link above it, and click "Accept".
  4. Compare: the file should now contain the suggested code.

## S73.16 Terminal integration.

- **Expected:** The extension works with the integrated terminal: run/suggest/explain commands and continue a session in a terminal.
- **Code:** done. Evidence present: apps/extension-vscode/src/providers/terminalProvider.ts:357; apps/extension-vscode/src/providers/terminalProvider.ts:144; apps/extension-vscode/src/core/commandSetup.ts:494
- **Where to find it:** Command Palette > Code: Run Terminal Command; terminal right-click > Code: Add Terminal Output to Chat; Code: Continue This Session in the Terminal (labels found in the code)
- **Needs:** a shell terminal (shell integration helps capture output)
- **Steps:**
  1. Press Cmd+Shift+P, type "Code: Run Terminal Command", press Enter, type "git status" and press Enter.
  2. Look for a terminal named "Code" that runs the command.
  3. Right-click in the terminal and choose "Code: Add Terminal Output to Chat"; check the output appears as a chip in the chat box.
  4. Optional: run "Code: Explain Terminal Output" from the Command Palette and read the reply.

## S73.17 Command-palette actions.

- **Expected:** Extension actions are available from the Command Palette.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:93; apps/extension-vscode/src/core/commandSetup.ts:1130
- **Where to find it:** Command Palette (Cmd+Shift+P) > type "Code:" (labels found in the code)
- **Steps:**
  1. Press Cmd+Shift+P.
  2. Type "Code:" and scroll the list of actions.
  3. Pick "Code: Open Chat" and press Enter.
  4. Compare: the AGI Code chat should open.

## S73.18 Keyboard bindings.

- **Expected:** Key actions have default keyboard shortcuts.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:1485; apps/extension-vscode/src/core/commandSetup.ts:1145
- **Where to find it:** Keyboard shortcuts: Cmd+K Cmd+S and search "Code:"; defaults include Cmd+Shift+A (Code: Open Chat) and Cmd+Shift+Alt+E (Code: Explain Selection) (labels found in the code)
- **Needs:** none (Explain needs a selection)
- **Steps:**
  1. Press Cmd+Shift+A anywhere in the editor and check the AGI Code chat opens.
  2. Select some code and press Cmd+Shift+Alt+E.
  3. Press Cmd+Shift+Alt+N and check a new conversation starts.
  4. Compare each result with the action named in the Keyboard Shortcuts list.

## S73.19 Status-bar indicators.

- **Expected:** A status-bar item shows the current model and agent mode and opens the model picker.
- **Code:** done. Evidence present: apps/extension-vscode/src/extension.ts:404; apps/extension-vscode/src/core/statusBar.ts:3
- **Where to find it:** Status bar, bottom right: the AGI item showing the model and mode; click it to open the model picker (Code: Select Model) (labels found in the code)
- **Steps:**
  1. Look at the bottom-right status bar for the AGI item with a model name and a mode word.
  2. Hover it and check the tooltip "click to change model".
  3. Click it, pick a different model in the list.
  4. Compare: the status bar text should show the new model name.

## S73.20 Model and permission controls.

- **Expected:** The user can pick the model and the agent permission mode (and effort) from the extension.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1302; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1037 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5398
- **Where to find it:** Chat composer: "Mode and reasoning effort" button (mode icon, left of the model name) and the model pill "Auto"; palette: Code: Choose Agent Mode, Code: Set Reasoning Effort, Code: Select Model (labels found in the code)
- **Needs:** a plan that allows the model choice; the effort list appears only for models that take it
- **Steps:**
  1. Click the "Mode and reasoning effort" button at the bottom of the composer.
  2. Under "Mode" pick "Plan" (or Ask, Auto, Bypass permissions) and check the button icon changes.
  3. Under "Reasoning effort" pick a level, if the model offers it.
  4. Click the model pill "Auto" and pick another model; check the status bar shows it.

## S73.21 Task and approval notifications.

- **Expected:** Pending approvals and finished tasks are signalled even when the chat view is hidden, and approvals can be answered.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:166; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:973 (quoted code not found in the file now)
- **Where to find it:** Switch to another app while a task runs; a system notice appears with "Allow once", "Deny" and "Open chat"; the Activity Bar icon also shows a badge (labels found in the code)
- **Needs:** a task that needs approval, and the VS Code window not focused
- **Steps:**
  1. Ask the agent for a task that needs a command approval; then click another app so VS Code is not focused.
  2. Wait for the notice "Code: Approval needed." to appear.
  3. Click "Allow once" or "Deny" on the notice.
  4. Compare: the chat should show the decision, and a finished task shows "Task finished" with "Open chat".

## S73.22 Project instructions.

- **Expected:** Project instruction files (AGENTS.md, CLAUDE.md, .agiworkforce/instructions.md) apply to turns in the session folder and can be viewed from the extension.
- **Code:** done. Evidence present: apps/extension-vscode/src/data/projectInstructions.ts:14; apps/extension-vscode/src/features/trees/contextPanelProvider.ts:149
- **Where to find it:** Command Palette > Code: Show Instructions; or Code: Open Settings > "Instructions & editor" (labels found in the code)
- **Needs:** a folder you can edit with AGENTS.md, CLAUDE.md or .agiworkforce/instructions.md
- **Steps:**
  1. Put an AGENTS.md or CLAUDE.md file in the folder with a short rule, and open that folder.
  2. Open Code: Open Settings and click "Instructions & editor"; look for the file name in the sources list.
  3. Run Code: Show Instructions from the Command Palette and check the same file is offered.
  4. Ask the chat a question that the rule should affect and compare the reply.

## S73.23 MCP/Skill/Plugin settings.

- **Expected:** The user can view and manage MCP servers, skills and plugins from the extension.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:793; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:841; apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:470
- **Where to find it:** More actions (…) in the AGI Code header > MCP servers / Skills / Plugins / Hooks; or Command Palette > Code: Show MCP Servers, Code: Show Skills, Code: Show Plugins, Code: Show Hooks (labels found in the code)
- **Needs:** none to view; adding a server, skill or plugin runs code, so only view it in testing
- **Steps:**
  1. Click the "More" (…) button in the AGI Code header.
  2. Choose "MCP servers" and read the list (the quick pick is titled "Code, MCP servers").
  3. Go back and choose "Skills" or "Plugins"; view the list only.
  4. Compare: the list should match what the AGI CLI has configured.

## S73.24 Shared session with CLI/desktop.

- **Expected:** A session can move between VS Code and the terminal CLI (continue a CLI session here; continue this chat in the terminal).
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1482; apps/extension-vscode/src/core/commandSetup.ts:608
- **Where to find it:** Command Palette > Code: Continue CLI Session Here (CLI session into VS Code); Command Palette > Code: Continue This Session in the Terminal (chat session into a terminal) (labels found in the code)
- **Needs:** the AGI CLI installed (Code: Install AGI CLI) and a session already started
- **Steps:**
  1. In a terminal run the AGI CLI (agi) and send one message so a session exists.
  2. In VS Code press Cmd+Shift+P and run "Code: Continue CLI Session Here"; choose that session.
  3. Check the session opens in the AGI Code chat with its earlier messages.
  4. Back in a chat with a sent message, run "Code: Continue This Session in the Terminal" and check a terminal opens that resumes it.

## S73.25 Remote workspace support.

- **Expected:** The extension works in Remote-SSH/tunnel workspaces by running on the remote host.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:19; apps/extension-vscode/src/platform/remoteEnvironment.ts:18; apps/extension-vscode/src/extension.ts:120; apps/extension-vscode/src/core/commandSetup.ts:959
- **Where to find it:** no screen of its own. extensionKind is workspace, so the extension runs on the remote host; the Remote-SSH connect step is VS Code's own and not verified here.
- **Needs:** an SSH host you can reach with Remote-SSH, with the AGI CLI installed there
- **Steps:**
  1. Connect the VS Code window to an SSH host with Remote-SSH (VS Code's own command, not in this repo).
  2. Open a folder on that host and press Cmd+Shift+P, run "Code: Check the CLI in This Environment".
  3. Read the message: it should say the CLI runs from a path "in the SSH host".
  4. Open AGI Code and send a message to check replies come from the host.

## S73.26 Container/WSL support where offered.

- **Expected:** The extension works in dev containers and WSL windows.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:19; apps/extension-vscode/src/platform/remoteEnvironment.ts:19; apps/extension-vscode/src/core/commandSetup.ts:959
- **Where to find it:** In a dev container window, Command Palette (Cmd+Shift+P) > Code: Check the CLI in This Environment. WSL is Windows only, so on a Mac only the dev container case applies. (labels found in the code)
- **Needs:** a dev container set up on this Mac (Docker or a container host) and the AGI CLI installed inside it
- **Steps:**
  1. Open the project in a dev container with VS Code's own Remote menu (bottom-left corner, Reopen in Container). This is not an AGI control.
  2. Press Cmd+Shift+P.
  3. Type Check the CLI in This Environment and choose Code: Check the CLI in This Environment.
  4. Read the message. It should name the place it runs (the dev container) and the CLI path there. Compare with Expected: the extension works in the container, not only on the Mac.

## S73.27 Workspace-trust experience.

- **Expected:** In an untrusted workspace the extension limits risky features, explains why, and links to Manage Trust.
- **Code:** done. Evidence moved: apps/extension-vscode/package.json:54; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3760; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:744 (quoted code not found in the file now)
- **Where to find it:** Open a folder in VS Code and choose Don't Trust in VS Code's Restricted Mode prompt (VS Code's own dialog). Then AGI Code sidebar view > Review this workspace first. > Manage trust. (labels found in the code)
- **Needs:** a folder opened as untrusted (Restricted Mode)
- **Steps:**
  1. Open a folder in VS Code and choose Don't Trust when VS Code asks about trust.
  2. Click the AGI Code icon in the Activity Bar to open the sidebar view.
  3. Look for the heading Review this workspace first. and the text saying AGI keeps project files and tools disabled while VS Code is in Restricted Mode.
  4. Click Manage trust and check that VS Code's workspace trust page opens. Compare with Expected: the extension explains why it is limited and links to Manage Trust.

## S73.28 Webview error and loading states.

- **Expected:** The chat webview shows loading, setup-needed and error states with a retry.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3123; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1509
- **Where to find it:** AGI Code sidebar view > Developer runtime needs setup (runtime status panel) > Open setup / Try again. The loading text is Checking the workspace developer runtime… (labels found in the code)
- **Needs:** no AGI CLI available for the folder, to reach the setup state; a network drop or sign-in failure is needed for an error state
- **Steps:**
  1. Click the AGI Code icon in the Activity Bar.
  2. Look for the status panel titled Developer runtime needs setup. Right after opening, it should show Checking the workspace developer runtime… while the check runs.
  3. Click Try again and watch the button change while the check runs.
  4. Click Open setup and check that a setup path opens. Compare with Expected: loading, setup-needed and error states, each with a retry.

## S73.29 Extension update flow.

- **Expected:** The extension tells users when an update is needed or available and what changed, and lets them update.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:174; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1913; apps/extension-vscode/src/core/hostNotices.ts:9
- **Where to find it:** VS Code Extensions view > AGI Code > Update (VS Code's own control), then reload the window. The notice reads as product name was updated to version, with a button What’s new. A required update appears as a chat error in AGI Code sidebar. (labels found in the code)
- **Needs:** an earlier AGI Code version installed before the newer one, and a browser for What’s new; the required-update case needs the server to reject the current client version
- **Steps:**
  1. Install an earlier AGI Code version first, then install the newer version from the VS Code Extensions view and reload the window.
  2. Look for the notice that says the product was updated to the new version, with a button What’s new.
  3. Click What’s new and check that release notes open in the browser.
  4. For the required-update case, the sidebar chat shows Update the extension to continue. Compare with Expected: the user is told an update is needed or available, what changed, and can update. The update button itself is VS Code's, not an AGI control.

## S73.30 IDE-version compatibility messaging.

- **Expected:** Users on an unsupported VS Code version (or a fork without needed APIs) are told what is incompatible.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/hostNotices.ts:28; apps/extension-vscode/src/extension.ts:427
- **Where to find it:** Shown once on startup in a VS Code build that has no native Chat view. The notice reads AGI Code: [app name] [version] has no native Chat view, so @agi is not available here. Chat runs in the AGI Code sidebar instead. Button: Open chat. (labels found in the code)
- **Needs:** a VS Code build or fork without the native Chat view; the notice shows only once per install
- **Steps:**
  1. Start VS Code on a build or fork that has no native Chat view (for example an older or modified build).
  2. Look for the notice that says the build has no native Chat view, so @agi is not available here.
  3. Click Open chat and check that the AGI Code sidebar opens.
  4. Start VS Code again and confirm the notice does not repeat. Compare with Expected: the user is told which part is incompatible and where chat runs instead.
