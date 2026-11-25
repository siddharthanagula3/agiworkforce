---
id: "PLAN-vscode-012"
type: "test-plan"
title: "VS Code · 12. New-chat experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "12"
---
# VS Code · 12. New-chat experience

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S12.01 Empty conversation canvas.

- **Expected:** Opening a new chat shows an empty conversation area (no prior messages) with a ready composer.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3168; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4669; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Open the AGI sidebar view, then click the button titled "New chat" in the sidebar header. The empty screen shows "Start a conversation". (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the AGI sidebar view.
  2. Click the "New chat" button (icon button at the top of the sidebar).
  3. Look for an empty conversation area with no earlier messages and the composer ready at the bottom, with the headline "Start a conversation" and the line "Ask about your code or describe a change."

## S12.03 Neutral greeting when personalization is disabled.

- **Expected:** When personalization is off (or no name is known), the new-chat greeting is neutral and shows no personal details.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2367 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3207 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** not found in the code. I searched webviewContent.ts for a greeting, a personal name and personalization and found none; the new-chat headline is fixed text ("Start a conversation"), so there is no personal greeting to compare with the Expected rule.

## S12.06 Recent Project shortcuts.

- **Expected:** The new-chat screen offers shortcuts to the user's recent projects that open the project or start a chat in it.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:9348; apps/extension-vscode/src/features/sidebar-webview/startSuggestions.ts:17
- **Where to find it:** Sidebar > New chat > Projects group > a project name row (button "Use in this chat"). (labels found in the code)
- **Needs:** a signed-in account with at least one project
- **Steps:**
  1. Sign in and make sure you have at least one project.
  2. Open the AGI sidebar and click "New chat".
  3. Look for the "Projects" heading with up to three project rows, each with the detail "Use in this chat".
  4. Click a project row and compare: the chat should open for that project, and the project should show in the "Active project" strip above the composer.

## S12.07 Recent-file suggestions.

- **Expected:** When starting a chat the user is offered their recently used files to attach in one step.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3214; apps/extension-vscode/src/data/composerContext.ts:373; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** not found in the code. I found no recently-used-files group in startSuggestions.ts or the new-chat markup. The only file attach options are in the "+" menu ("Attach workspace files", "Open editors"), which is not a recent-file suggestion.

## S12.08 Recommended Skills.

- **Expected:** The new-chat screen recommends Skills relevant to the user, which can be applied to the next message.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:9353; apps/extension-vscode/src/features/sidebar-webview/startSuggestions.ts:28
- **Where to find it:** Sidebar > New chat > Skills group > a skill name row. (labels found in the code)
- **Needs:** at least one enabled and consented Skill
- **Steps:**
  1. Make sure at least one skill is enabled and consented.
  2. Open the AGI sidebar and click "New chat".
  3. Look for the "Skills" heading with up to three skill rows, each showing the skill's description.
  4. Click a skill row and compare: the composer should fill with "Use the <skill name> skill to " ready for your request.

## S12.09 Recommended connected apps.

- **Expected:** The new-chat screen recommends apps/connectors worth connecting or using for the next message.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:9358; apps/extension-vscode/src/features/sidebar-webview/startSuggestions.ts:37
- **Where to find it:** Sidebar > New chat > Connected apps group > an app name row (detail "Ask with it"). (labels found in the code)
- **Needs:** a signed-in account with at least one connected app
- **Steps:**
  1. Connect at least one app or connector and sign in.
  2. Open the AGI sidebar and click "New chat".
  3. Look for the "Connected apps" heading with rows whose detail reads "Ask with it".
  4. Click an app row and compare: the composer should fill with "Using <app name>, " ready for your request.

## S12.10 Search entry.

- **Expected:** From the new-chat screen the user can explicitly start a web search for the next message.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3267; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3987; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2437; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2462; apps/extension-vscode/src/features/surfaces/cliCapabilities.ts:189
- **Where to find it:** Sidebar > composer "+" button (title "Attach or use tools") > "Browse the web". (labels found in the code)
- **Needs:** a signed-in account; a search key for Local or BYOK (see "Set up web search" in the same menu)
- **Steps:**
  1. Open the AGI sidebar and click "New chat".
  2. Click the "+" button at the bottom left of the composer, then click "Browse the web".
  3. Look for the chip "Browse the web for current sources" above the composer and the check state on "Browse the web".
  4. Type a question that needs current information, send it, and compare: the web search should be used for that message only.

## S12.15 Agentic-work entry.

- **Expected:** From the new-chat screen the user can start agentic (multi-step, tool-using) work rather than a plain chat.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3549 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6939; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Sidebar > composer "Mode and reasoning effort" button > choose "Auto" (or "Plan" from the "+" menu as "Plan mode"). (labels found in the code)
- **Steps:**
  1. Open the AGI sidebar and click "New chat".
  2. Click the button titled "Mode and reasoning effort" in the composer bottom row.
  3. Choose "Auto" (or "Plan", or "Plan mode" from the "+" menu) and close the menu.
  4. Send a task that needs several steps, such as "find and fix a failing test", and compare: it should run tool steps rather than a single plain answer.

## S12.16 Coding entry.

- **Expected:** From the new-chat surface the user can start a coding session (a repository/workspace-aware coding agent).
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2367 (quoted code not found in the file now); apps/extension-vscode/src/core/commandSetup.ts:2593; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** not found in the code. I found no labelled coding-session entry on the new-chat screen or in commandSetup.ts; the nearest text is "Choose a folder to establish the developer-session scope" (webviewContent.ts), which is not a coding-session start control.

## S12.18 Default-model display.

- **Expected:** The new-chat screen shows which model the next message will use before the user sends.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3361; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4406; apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:80; apps/extension-vscode/src/core/chatSetup.ts:62
- **Where to find it:** Sidebar > New chat > composer bottom row > model pill (default text "Auto"). (labels found in the code)
- **Steps:**
  1. Open the AGI sidebar and click "New chat".
  2. Look at the composer bottom row for the pill with the text "Auto" (its title is "Model").
  3. Click the pill and compare: the list should show the model the next message will use.

## S12.20 Default-Project selection.

- **Expected:** Before sending, the user can pick the project a new chat will be created in.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5204; apps/cli/src/agent/chat.rs:879
- **Where to find it:** Sidebar > New chat > Projects group > "Use in this chat" on a project; the chosen project shows in the "Active project" strip. (labels found in the code)
- **Needs:** a signed-in account with at least one project
- **Steps:**
  1. Sign in and open the AGI sidebar, then click "New chat".
  2. Under "Projects", click the row for the project you want.
  3. Look at the strip above the composer labelled "Active project" and confirm it shows that project's name.
  4. Send a message and compare: the new chat should be created in that project.

## S12.21 Mode explanation and examples.

- **Expected:** The new-chat screen explains the available modes and gives examples of what each is for.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1749 (quoted code not found in the file now)
- **Where to find it:** Sidebar > New chat > "Mode and reasoning effort" button (mode list shows "Ask", "Auto", "Plan", "Bypass permissions"). Command palette: the "Modes" picker. (labels found in the code)
- **Steps:**
  1. Open the AGI sidebar and click "New chat".
  2. Click the button titled "Mode and reasoning effort".
  3. Read the description under each mode: "Ask", "Auto", "Plan", "Bypass permissions".
  4. Open the mode picker from the Command Palette and compare: the "Ask" entry should show the example "Example: AGI can read parseDate while preparing a test, then asks before writing the file."

## S12.22 First-use feature education.

- **Expected:** First-time users are shown a short introduction to the product's key features before or at their first chat.
- **Code:** done. Evidence present: apps/extension-vscode/package.json:818; apps/extension-vscode/src/core/commandSetup.ts:1111
- **Where to find it:** First open of the AGI sidebar on a fresh profile: onboarding steps "Work with your code", "Follow cloud tasks", "Review changes in your editor", "Choose how actions are approved" (button "Skip intro"). (labels found in the code)
- **Needs:** a fresh VS Code profile (first use)
- **Steps:**
  1. Use a fresh VS Code profile, or clear the stored onboarding flag, so the intro has not been seen.
  2. Open the AGI sidebar view.
  3. Read the step titled "Work with your code" and move through the steps; the progress reads "Setup · 1 of 4".
  4. Compare: the steps should introduce the key features, and "Skip intro" should close the intro.

## S12.23 Resumption of an unsent draft.

- **Expected:** An unsent draft typed in a new chat is restored when the user returns (after navigation or reload).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5957; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5994
- **Where to find it:** Sidebar > New chat > type text in the composer without sending, then reload the window or move away and back. (labels found in the code)
- **Steps:**
  1. Open the AGI sidebar and click "New chat".
  2. Type a sentence in the composer but do not send it.
  3. Run a reload (for example, "Developer: Reload Window") or switch to another view and come back to the AGI sidebar.
  4. Look at the composer and compare: the typed sentence should still be there.
