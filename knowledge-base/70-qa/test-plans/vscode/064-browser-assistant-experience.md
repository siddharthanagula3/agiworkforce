---
id: "PLAN-vscode-064"
type: "test-plan"
title: "VS Code · 64. Browser-assistant experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "64"
---
# VS Code · 64. Browser-assistant experience

10 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S64.01 Current-page context.

- **Expected:** The assistant reads the page open in the user's browser and answers with it as context.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8805; apps/extension-vscode/src/integrations/localRuntimeClient.ts:948 (quoted code not found in the file now); apps/cli/src/agent/chat.rs:1152; apps/cli/src/agent/mod.rs:1110; apps/cli/src/features/exec/tools/mod.rs:565 (quoted code not found in the file now)
- **Where to find it:** Chat composer > plus menu > Web page (the link box says "Attach a web page") (labels found in the code)
- **Steps:**
  1. Open the AGI chat panel in VS Code and click the plus button in the composer to open the plus menu.
  2. Click "Web page" and paste a full https:// link into the box that opens.
  3. Click OK in the box. The page is read once from that link and its text is attached to the next message.
  4. Type a question about the page and send it. Compare: the answer uses the text of the pasted link, not the page open in your browser tab.

## S64.02 Selected-text context.

- **Expected:** Text the user highlights on a web page reaches the assistant as context for a question.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/context-handoff/index.ts:322; apps/extension/src/side_panel.ts:16711
- **Where to find it:** Chrome extension side panel > select text on a web page > send it to "VS Code" (the VS Code chat composer then gets the text) (labels found in the code)
- **Needs:** a Chrome browser with the AGI extension, and VS Code open with the AGI extension
- **Steps:**
  1. In Chrome with the AGI extension, highlight some text on a web page.
  2. Send the selection from the AGI extension to the "VS Code" destination; the dialog says it opens the AGI composer in VS Code via a vscode:// link.
  3. In VS Code, the AGI chat composer opens with a draft that starts "Selected in the browser, from" followed by the page address and the highlighted text.
  4. Type a question after it and send. Compare: the answer uses the highlighted text as context.

## S64.06 Question about page.

- **Expected:** The user asks a free-form question and the answer uses the current page's content.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8805; apps/extension-vscode/src/integrations/localRuntimeClient.ts:948 (quoted code not found in the file now); apps/cli/src/agent/chat.rs:1152; apps/cli/src/agent/mod.rs:1110; apps/cli/src/features/exec/tools/mod.rs:565 (quoted code not found in the file now)
- **Where to find it:** Chat composer > plus menu > Web page, then type a free-form question (labels found in the code)
- **Steps:**
  1. Open the AGI chat panel in VS Code and click the plus button in the composer.
  2. Click "Web page" and paste a link to a page with known text.
  3. Type a free-form question about that text (for example a fact that appears only on the page) and send.
  4. Compare: the answer uses the content of the pasted page.

## S64.10 Open URL.

- **Expected:** The assistant opens a web address in the browser for the user.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8805; apps/extension-vscode/src/integrations/localRuntimeClient.ts:948 (quoted code not found in the file now); apps/cli/src/agent/chat.rs:1152; apps/cli/src/agent/mod.rs:1110; apps/cli/src/features/exec/tools/mod.rs:565 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No control in the VS Code chat lets the assistant open a web address. Searched apps/extension-vscode/src for openExternal (only used for app links such as upgrade, help and artifact pages) and found browser_navigate only in apps/cli/src/platform/runtime/tool_catalog.rs, which is not part of the VS Code panel.

## S64.14 Website search.

- **Expected:** The assistant runs a search on a website and reads the results back.
- **Code:** done. Evidence present: apps/cli/src/platform/runtime/tool_catalog.rs:53; apps/extension/src/features/content/pageElements.ts:144
- **Where to find it:** not found in the code. No website search control was found in the VS Code app. The nearest control is the plus menu item "Browse the web" (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts), which is a general web search through the CLI and not a search on a site. Website search tools (browser_find in apps/cli/src/platform/runtime/tool_catalog.rs) are not in the VS Code panel.

## S64.15 Form filling.

- **Expected:** The assistant fills in a web form on the user's behalf.
- **Code:** done. Evidence present: apps/cli/src/platform/runtime/tool_catalog.rs:56; apps/extension/src/features/content/pageElements.ts:225
- **Where to find it:** not found in the code. No form-filling control found in apps/extension-vscode/src. browser_fill_form exists only in the CLI tool list (apps/cli/src/platform/runtime/tool_catalog.rs) and the Chrome extension, not the VS Code panel.

## S64.16 Multi-step website task.

- **Expected:** The user gives a goal and the assistant carries it out over several steps on websites.
- **Code:** done. Evidence present: apps/cli/src/platform/runtime/tool_catalog.rs:58; apps/extension/src/features/native-bridge/desktopCommands.ts:202
- **Where to find it:** not found in the code. No multi-step website task control found in apps/extension-vscode/src. The browser tool list (browser_navigate, browser_click, browser_type and others) is in apps/cli/src/platform/runtime/tool_catalog.rs, not the VS Code panel. Searched apps/extension-vscode/src for browser and web terms.

## S64.18 Visible action timeline.

- **Expected:** Each browser action the assistant takes is listed for the user as it happens.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8805; apps/extension-vscode/src/integrations/localRuntimeClient.ts:948 (quoted code not found in the file now); apps/cli/src/agent/chat.rs:1152; apps/cli/src/agent/mod.rs:1110; apps/cli/src/features/exec/tools/mod.rs:565 (quoted code not found in the file now)
- **Where to find it:** Chat panel > send a message that makes the assistant use a tool > tool rows in the reply (path not confirmed in the code; trust the screen)
- **Needs:** a working local runtime, and a request that uses a browser tool, which depends on the runtime and route
- **Steps:**
  1. Open the AGI chat panel in VS Code and send a request that needs a tool.
  2. Watch the reply while it runs: each tool call appears as its own row in the chat as it starts and ends.
  3. Compare: each row shows the tool's name and a summary; a web action appears with a globe icon (the icon map lists browser and web fetch tools as globe).

## S64.25 Pause/stop.

- **Expected:** The user can pause or stop the assistant's browser task at any moment.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1049
- **Where to find it:** Chat panel > send a message > Stop response button shown at the composer while the reply is running (labels found in the code)
- **Steps:**
  1. Open the AGI chat panel in VS Code and send a request that takes a while.
  2. While the reply is still being written, click the square "Stop response" button beside the composer.
  3. Compare: the reply stops and the button changes to "Stopping" until the stop finishes.
  4. Optional: turn on the setting "Stop the active response when Escape is pressed in the composer" and press Escape in the composer while a reply runs.

## S64.32 Browser-task result summary.

- **Expected:** When a browser task ends the assistant reports what it did and what still needs the user.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8805; apps/extension-vscode/src/integrations/localRuntimeClient.ts:948 (quoted code not found in the file now); apps/cli/src/agent/chat.rs:1152; apps/cli/src/agent/mod.rs:1110; apps/cli/src/features/exec/tools/mod.rs:565 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No browser-task summary screen found in apps/extension-vscode/src. The turn ends with the normal reply in the chat. The closest summary code is the session receipt (apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts), which lists file changes and approvals, not browser actions.
