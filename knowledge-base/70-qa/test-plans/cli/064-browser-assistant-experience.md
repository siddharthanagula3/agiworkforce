---
id: "PLAN-cli-064"
type: "test-plan"
title: "CLI · 64. Browser-assistant experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "64"
---
# CLI · 64. Browser-assistant experience

9 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S64.01 Current-page context.

- **Expected:** The assistant reads the page open in the user's browser and answers with it as context.
- **Code:** done. Evidence present: apps/cli/src/platform/runtime/tool_catalog.rs:1048; apps/cli/src/features/exec/tools/mod.rs:2252; apps/cli/src/platform/runtime/tool_catalog.rs:201
- **Where to find it:** Terminal: run agi, then type /chrome. Or in Chrome, right-click the page background > Ask AGI about this page (side panel). (some labels not found in the code; trust the screen)
- **Needs:** AGI Desktop paired with Chrome through the extension, and a signed-in account
- **Steps:**
  1. Sign in to AGI Desktop, pair it with Chrome through the extension, and open a web page in Chrome.
  2. In a terminal run agi, then type /chrome and check that it says Chrome integration and Paired. This session can read and act in the browser you are looking at.
  3. At the prompt, ask a question such as: What is the page open in my Chrome about?
  4. Compare the answer with the open page: it should name the page's title and visible content.
  5. For the side-panel route: right-click the page background and choose Ask AGI about this page, then ask a question and check the answer uses the page.

## S64.02 Selected-text context.

- **Expected:** Text the user highlights on a web page reaches the assistant as context for a question.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:8675; apps/extension/src/side_panel.ts:16719
- **Where to find it:** Chrome: select text on a web page > right-click the selection > Send selected text to a local app… > Copy CLI command. Then paste the copied command in a terminal. (labels found in the code)
- **Needs:** a web page with text to select, the AGI Chrome extension, the AGI CLI installed
- **Steps:**
  1. On a web page, highlight some text.
  2. Right-click the highlighted text and choose Send selected text to a local app….
  3. In the preview titled Send selected context?, click Copy CLI command.
  4. Paste into a terminal and run it; the command starts with agi and passes an agi-context:// link to --context-url.
  5. Ask a question about the text at the prompt and check the answer uses the highlighted text and its source page.

## S64.06 Question about page.

- **Expected:** The user asks a free-form question and the answer uses the current page's content.
- **Code:** done. Evidence present: apps/cli/src/platform/runtime/tool_catalog.rs:1048; apps/cli/src/features/exec/tools/mod.rs:2252; apps/cli/src/platform/runtime/tool_catalog.rs:201
- **Where to find it:** Chrome: right-click the background of a web page > Ask AGI about this page, then type a question in the side panel. (labels found in the code)
- **Needs:** a Chrome with the AGI extension, a signed-in account
- **Steps:**
  1. Open a web page with clear content in Chrome.
  2. Right-click an empty part of the page and choose Ask AGI about this page.
  3. In the AGI side panel, type a free question about the page, such as: What are the main points of this page?
  4. Send it and wait for the answer.
  5. Compare the answer with the page: it should use what the page says, not general knowledge.

## S64.10 Open URL.

- **Expected:** The assistant opens a web address in the browser for the user.
- **Code:** done. Evidence present: apps/cli/src/platform/runtime/tool_catalog.rs:1048; apps/cli/src/features/exec/tools/mod.rs:2252; apps/cli/src/platform/runtime/tool_catalog.rs:201
- **Where to find it:** Terminal: run agi, then ask the assistant at the prompt to open a web address, for example: Open https://example.com in my browser. (labels found in the code)
- **Needs:** AGI Desktop paired with Chrome, a signed-in Chrome
- **Steps:**
  1. Pair AGI Desktop with Chrome, and run agi in a terminal.
  2. At the prompt type: Open https://example.com in my browser.
  3. When the permission prompt appears reading The agent wants to open an address in your signed-in Chrome., approve it.
  4. Look at the terminal line that starts with Open(https://example.com).
  5. Compare with Chrome: the address should open in a tab in the user's own Chrome.

## S64.14 Website search.

- **Expected:** The assistant runs a search on a website and reads the results back.
- **Code:** done. Evidence present: apps/cli/src/platform/runtime/tool_catalog.rs:53; apps/extension/src/features/content/pageElements.ts:144
- **Where to find it:** Terminal: run agi, then ask the assistant at the prompt to search a site, for example: Search the site for pricing and tell me the results. (labels found in the code)
- **Needs:** AGI Desktop paired with Chrome, a site with a search box
- **Steps:**
  1. Pair Chrome, open a site that has its own search box, and run agi.
  2. At the prompt ask the assistant to search that site for a term.
  3. Approve any permission prompts that appear for Find or Type actions.
  4. Watch the terminal lines such as Find(...) and Read the active tab.
  5. Compare the reply with the site's search results page: it should report the results shown there.

## S64.15 Form filling.

- **Expected:** The assistant fills in a web form on the user's behalf.
- **Code:** done. Evidence present: apps/cli/src/platform/runtime/tool_catalog.rs:56; apps/extension/src/features/content/pageElements.ts:225
- **Where to find it:** Terminal: run agi, then ask the assistant at the prompt to fill a form on the open page, for example: Fill in the form on this page with my name and email. (labels found in the code)
- **Needs:** AGI Desktop paired with Chrome, a web form open in a signed-in Chrome
- **Steps:**
  1. Pair Chrome, open a web form in Chrome, and run agi.
  2. At the prompt ask the assistant to fill in the fields it can see, giving the values.
  3. Approve the permission prompt that lists the tab and fields.
  4. Watch for the terminal line Fill in the form.
  5. Compare the form in Chrome: the fields should hold the values you gave, and the submit button should not have been pressed.

## S64.16 Multi-step website task.

- **Expected:** The user gives a goal and the assistant carries it out over several steps on websites.
- **Code:** done. Evidence present: apps/cli/src/platform/runtime/tool_catalog.rs:58; apps/extension/src/features/native-bridge/desktopCommands.ts:202
- **Where to find it:** Terminal: run agi, then type a multi-step goal at the prompt, for example: Open https://example.com, find the contact page and read me the email address. (labels found in the code)
- **Needs:** AGI Desktop paired with Chrome, a signed-in Chrome
- **Steps:**
  1. Pair Chrome with a tab open and run agi.
  2. At the prompt type a goal that needs several website steps.
  3. Approve each permission prompt as it appears.
  4. Watch the terminal lines for each step, such as Open(...), Find(...) and Read the active tab.
  5. Compare the final reply with the goal: it should say what was done across the steps.

## S64.18 Visible action timeline.

- **Expected:** Each browser action the assistant takes is listed for the user as it happens.
- **Code:** done. Evidence present: apps/cli/src/platform/runtime/tool_catalog.rs:201; apps/cli/src/features/exec/tools/mod.rs:2252
- **Where to find it:** Terminal: run agi, then give a browser task at the prompt; each browser action appears as a terminal line. (labels found in the code)
- **Needs:** AGI Desktop paired with Chrome, a signed-in Chrome
- **Steps:**
  1. Pair Chrome with a tab open and run agi.
  2. Ask for a browser task that takes at least two actions, such as: Open https://example.com and click the first link.
  3. Watch the terminal while it runs: each action should appear as its own line, such as Open(...) or Click(...), before the next action starts.
  4. Also check the AGI Desktop activity list, which the /chrome text says records each action.
  5. Compare: every action taken should have a line and nothing should be missing.

## S64.32 Browser-task result summary.

- **Expected:** When a browser task ends the assistant reports what it did and what still needs the user.
- **Code:** done. Evidence present: apps/cli/src/features/exec/tools/mod.rs:2252; apps/cli/src/platform/runtime/tool_catalog.rs:201
- **Where to find it:** Terminal: run agi, give a browser task at the prompt, and read the final reply after the task ends. (path not confirmed in the code; trust the screen)
- **Needs:** AGI Desktop paired with Chrome, a signed-in Chrome
- **Steps:**
  1. Pair Chrome and run agi.
  2. Give a browser task that is only partly possible, such as: Open https://example.com and submit the login form.
  3. Wait for the task to end, with the final reply shown in the terminal.
  4. Read the reply: it should say what was done and what still needs the user.
  5. Compare with the Chrome tab: the reply should match what actually happened.
