---
id: "PLAN-vscode-034"
type: "test-plan"
title: "VS Code · 34. Search experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "34"
---
# VS Code · 34. Search experiences

7 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S34.02 Search conversation history.

- **Expected:** The user can search past conversations by title and message text and open a matching chat; only conversations the user can see in history are returned.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6480; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2649; apps/extension-vscode/src/features/trees/sessionPickers.ts:89; apps/extension-vscode/src/features/trees/conversationTreeProvider.ts:323
- **Where to find it:** Command Palette > "Code: Show Sessions History", then type in the box titled "Sessions history" (labels found in the code)
- **Needs:** a past conversation with a known word in its title or messages
- **Steps:**
  1. Press Cmd+Shift+P and type "Code: Show Sessions History". Press Enter.
  2. In the box that opens, read the placeholder "Search sessions by title or message text".
  3. Type a word from the title or from a message of a past chat that you know exists.
  4. Wait a moment for the list to update, then check that the matching chat is listed and that unrelated chats are not.
  5. Click or press Enter on the matching row to open it, and check that the chat opens.

## S34.03 Search Projects.

- **Expected:** The user can search their Projects by name or description and open a match.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** Command Palette > "Code: Show Projects", then type in the box that says "Open a project…" (labels found in the code)
- **Needs:** an account with at least one project
- **Steps:**
  1. Press Cmd+Shift+P and type "Code: Show Projects". Press Enter.
  2. Read the placeholder "Open a project…" in the box that opens.
  3. Type a project name you created on the web.
  4. Check that the matching project is listed.
  5. Press Enter on the match and check that the project opens.

## S34.05 Search artifacts.

- **Expected:** The user can search their artifacts by title/content and open a match.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** Command Palette > "Code: Show Artifacts", then type in the box that says "Open an artifact…" (labels found in the code)
- **Needs:** an account with at least one artifact
- **Steps:**
  1. Press Cmd+Shift+P and type "Code: Show Artifacts". Press Enter.
  2. Read the placeholder "Open an artifact…" in the box that opens.
  3. Type a word from an artifact's title.
  4. Check that the matching artifact is listed and unrelated ones are not.
  5. Press Enter on the match and check that the artifact opens.

## S34.06 Search connected company sources.

- **Expected:** The assistant can search the user's connected work sources (Drive, Slack, Notion...) during a chat once they are connected.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:787
- **Where to find it:** not found in the code. The search happens on the server when a chat request is made (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts). The extension has a start-screen group named "Connected apps" with an "Ask with it" action (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts), but I found no control in the extension to connect Drive, Slack or Notion. I searched for "connector", "knowledge" and "collection" in apps/extension-vscode/src.
- **Needs:** a work source connected to the account, such as Drive, Slack or Notion

## S34.07 Public web search.

- **Expected:** A chat can search the public web and answer from the results.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:343; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4755
- **Where to find it:** Sidebar chat > "+" button (title "Attach or use tools") > "Browse the web" (labels found in the code)
- **Needs:** a search key if the account is in Local or BYOK mode ("Set up web search" in the same menu)
- **Steps:**
  1. Open the chat sidebar and click the "+" button under "Attach or use tools".
  2. Click "Browse the web" so it is checked.
  3. Check that the strip "Browse the web for current sources" appears above the input.
  4. Type a question that needs current information, such as today's news on a topic, and send it.
  5. Check that the answer uses web results and that sources are listed under the answer.

## S34.19 User-selected source collections.

- **Expected:** The user can put chosen sources into a named collection (e.g. a project's knowledge) and have chats search only/also that collection.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5403; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5358; apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:602; apps/extension-vscode/src/features/instructions/customInstructions.ts:104
- **Where to find it:** not found in the code. I found no control in apps/extension-vscode to put chosen sources into a named collection or to limit a chat's search to one. The only related screen is the read-only "Knowledge files" list in a project (apps/extension-vscode/src/features/projects/projectActions.ts), whose description reads "Knowledge files are added and removed there", meaning on the web. I searched for "collection", "knowledge" and "source" in apps/extension-vscode/src.
- **Needs:** a project with knowledge files, if testing project knowledge

## S34.27 Open original source.

- **Expected:** From a citation or source card the user can open the original page/document.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4755; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4769; apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:449
- **Where to find it:** Sidebar chat > an answer's "{count} sources" disclosure > click a source link (labels found in the code)
- **Needs:** a web-sourced answer with at least one source ("Browse the web" turned on)
- **Steps:**
  1. Ask a question that gets a web-sourced answer, using "Browse the web" if needed.
  2. Under the answer, find the disclosure labelled "{count} sources" and click it to open the list.
  3. Hover a source link to check its full address.
  4. Click the source link and check that the original page opens in the browser.
