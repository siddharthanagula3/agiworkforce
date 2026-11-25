---
id: "PLAN-vscode-017"
type: "test-plan"
title: "VS Code · 17. Assistant-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "17"
---
# VS Code · 17. Assistant-message components

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S17.01 Assistant/model identity.

- **Expected:** Assistant turns are distinguishable from the user's visually and to assistive tech, ideally naming the assistant/model (R-n).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4886; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6833
- **Where to find it:** AGI Code sidebar (activity bar icon "AGI Code") > type a question and press Send > look at the answer (labels found in the code)
- **Needs:** an account or local runtime that can answer
- **Steps:**
  1. Open the AGI Code view from the activity bar and type a short question in the composer.
  2. Press Send and wait for the answer to finish.
  3. Look for the model name shown with the answer (hover the answer's small meta line for the token detail).
  4. Turn on VoiceOver and move to the answer: it should announce the answer as from AGI with the model name, not as your message.
  5. Compare with Expected: the answer must look and sound different from your own message, and name the model.

## S17.02 Streaming answer body.

- **Expected:** The answer body renders incrementally as tokens arrive, with markdown formatting.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7852; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051 (quoted code not found in the file now)
- **Where to find it:** AGI Code sidebar > type a question and press Send > watch the answer area while it is still arriving (labels found in the code)
- **Needs:** an account or local runtime that can answer
- **Steps:**
  1. Ask for a longer answer that uses a list, bold text and a code block, for example 'Explain a sorting algorithm with a code example'.
  2. Watch the answer while it arrives, without clicking anything.
  3. Check that text appears a little at a time, not all at once at the end.
  4. Check that the list, bold words and code block are formatted as they arrive.
  5. Compare with Expected: the answer must fill in gradually with formatting shown on the way.

## S17.03 Working indicator.

- **Expected:** While the assistant works and before/while text arrives, a visible (and announced) working indicator is shown.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5031; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4661
- **Where to find it:** AGI Code sidebar > type a question and press Send > watch the space under your message before the text arrives (labels found in the code)
- **Needs:** an account or local runtime that can answer
- **Steps:**
  1. Send a question that takes a few seconds to answer.
  2. Look straight after you press Send, before any text appears, for the small AGI mark that appears as the answer's placeholder.
  3. Turn on VoiceOver and move to that mark: it should be announced as 'AGI is responding'.
  4. Look for the 'Activity' row with 'Starting…' if the answer uses tools.
  5. Compare with Expected: a working indicator must show before and during the answer, and be announced.

## S17.04 Reasoning-summary or activity-summary disclosure.

- **Expected:** An answer offers a collapsible summary of the model's reasoning and/or the work it did (steps, tools), expandable on demand.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:8989; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:6109 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7943
- **Where to find it:** AGI Code sidebar > send a message that makes AGI use a tool (for example 'Read the README in this workspace') > click the 'Activity' row above the answer (labels found in the code)
- **Needs:** an account or local runtime that can answer, and a workspace folder
- **Steps:**
  1. Ask a question that needs AGI to read a file or run a tool.
  2. When the answer shows an 'Activity' row above it, click that row.
  3. Check that the row opens and closes, showing its steps and a chevron.
  4. Press Tab to the row and press Return or Space to open and close it with the keyboard.
  5. Compare with Expected: the summary of work must collapse and expand on demand. The model's reasoning text itself was not found in this screen.

## S17.05 Tool-activity section.

- **Expected:** Tool calls made for the answer appear in a tool-activity section with each tool's name, status and result.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7946; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7961
- **Where to find it:** AGI Code sidebar > send a message that makes AGI use a tool > click the 'Activity' row > expand one tool step (labels found in the code)
- **Needs:** an account or local runtime that can answer, and a workspace folder
- **Steps:**
  1. Ask for something that uses a tool, such as 'List the files in this folder'.
  2. Wait for the 'Activity' row to appear above the answer and click it open.
  3. Click one of the tool steps to expand it.
  4. Check that each step shows the tool's name, a status (running, done or error) and its result.
  5. Compare with Expected: each tool call must show its name, status and result.

## S17.15 Copy plain text.

- **Expected:** One action copies the whole answer's text to the clipboard.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:656; apps/extension-vscode/package.json:891; apps/extension-vscode/src/core/chatSetup.ts:48
- **Where to find it:** AGI Code sidebar > send a message > hover the answer > click the copy icon (tooltip 'Copy') (labels found in the code)
- **Needs:** an account or local runtime that can answer
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Move the pointer over the answer to show its action icons.
  3. Click the copy icon, the first one, whose tooltip is 'Copy'.
  4. Paste into a text editor (Cmd+V) to see the copied text.
  5. Compare with Expected: the whole answer's text must be on the clipboard, and the icon should briefly show 'Copied'.

## S17.19 Regenerate answer.

- **Expected:** A completed answer can be regenerated in place, producing a new attempt for the same prompt.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4819; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1811
- **Where to find it:** AGI Code sidebar > send a message > wait for the answer to finish > hover the latest answer > click the refresh icon (tooltip 'Regenerate') (labels found in the code)
- **Needs:** an account or local runtime that can answer
- **Steps:**
  1. Send a question and wait until the answer is complete.
  2. Hover over the latest answer and find the refresh icon, tooltip 'Regenerate'.
  3. Click it.
  4. Check that a new answer replaces the previous attempt for the same question in the same place.
  5. Compare with Expected: a new attempt for the same prompt must appear, not a copy of the old one.

## S17.20 Retry failed answer.

- **Expected:** A failed answer shows a Retry control that re-runs the turn and replaces the failure with the new outcome.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3343 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4666
- **Where to find it:** AGI Code sidebar > cause a failed answer (for example, turn off the internet and press Send) > click 'Retry' in the error block (labels found in the code)
- **Needs:** a way to make the next answer fail (for example, turn off the internet)
- **Steps:**
  1. Turn off the internet connection, or otherwise make the next answer fail.
  2. Send a question and wait for the error block to appear.
  3. Read the error block and find the 'Retry' button.
  4. Turn the internet back on, then click 'Retry'.
  5. Compare with Expected: the failure must be replaced by the new outcome; the error block should disappear and the new answer should appear.

## S17.27 Branch from answer.

- **Expected:** From any answer, the user can branch a new conversation that keeps history up to that point and leaves the original unchanged.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4053 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:5540
- **Where to find it:** AGI Code sidebar > send a message > hover an answer > click the fork icon 'Branch from here' (labels found in the code)
- **Needs:** an account or local runtime that can answer
- **Steps:**
  1. Send two or more messages so there is an earlier answer.
  2. Hover an earlier answer and click the fork icon, tooltip 'Branch from here'.
  3. Check that a new session opens with the conversation up to that answer.
  4. Go back to the original session and check it still has all its messages.
  5. Compare with Expected: the new session keeps history up to that answer and the original is unchanged.

## S17.29 Positive feedback.

- **Expected:** A thumbs-up on an answer records positive feedback tied to that message.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:680; apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:282; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4713; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2130; apps/extension-vscode/src/features/feedback/submitFeedback.ts:97
- **Where to find it:** AGI Code sidebar > send a message > hover the answer > click the thumbs-up icon 'Good response' (labels found in the code)
- **Needs:** an account or local runtime that can answer
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Hover the answer and click the thumbs-up icon, tooltip 'Good response'.
  3. Check that the icon fills in and reads as pressed.
  4. Click it again and check the tooltip changes to 'Remove rating' and the icon clears.
  5. Compare with Expected: a thumbs-up must record positive feedback for that answer; the UI shows only the pressed state, so the record itself cannot be seen here.

## S17.30 Negative feedback.

- **Expected:** A thumbs-down on an answer records negative feedback tied to that message.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:680; apps/extension-vscode/src/features/feedback/answerRating.ts:103; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4713; apps/extension-vscode/src/features/feedback/answerRating.ts:75; apps/extension-vscode/src/features/feedback/submitFeedback.ts:97
- **Where to find it:** AGI Code sidebar > send a message > hover the answer > click the thumbs-down icon 'Bad response' (labels found in the code)
- **Needs:** an account or local runtime that can answer
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Hover the answer and click the thumbs-down icon, tooltip 'Bad response'.
  3. Check that the icon fills in and reads as pressed.
  4. Click it again and check the tooltip changes to 'Remove rating' and the icon clears.
  5. Compare with Expected: a thumbs-down must record negative feedback for that answer; the UI shows only the pressed state, so the record itself cannot be seen here.

## S17.36 Actual-model and usage details.

- **Expected:** For each answer the user can see which model actually answered and its usage (tokens/cost/time).
- **Code:** done. Evidence present: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4941; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6833
- **Where to find it:** AGI Code sidebar > send a message > look at the small line under the answer (the model name), then hover it (labels found in the code)
- **Needs:** an account or local runtime that can answer
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Look at the small text line under the answer; it shows the model that answered.
  3. Hover that line to see the token details (input and output tokens).
  4. If the answer used prompt caching, look for the 'Prompt cache' line below it.
  5. Compare with Expected: the model that actually answered and its token usage must be visible. No cost figure was found in this area.

## S17.37 Partial-result state.

- **Expected:** When an answer fails after producing some output, the partial output is kept and visibly marked incomplete, with the reason.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:318 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7980
- **Where to find it:** AGI Code sidebar > send a message > the answer stops partway (for example, the connection drops while it streams) > read the error block below the partial answer (labels found in the code)
- **Needs:** a way to cut the connection while an answer streams (for example, turn off the internet)
- **Steps:**
  1. Send a long question that streams for a while.
  2. Turn off the internet while the answer is still arriving.
  3. Look at the partial text that already arrived; it should stay on screen.
  4. Read the error block below it for the words about the stop and its reason.
  5. Compare with Expected: the partial answer must stay and be marked incomplete, with the reason shown in the error block.

## S17.38 Refusal state.

- **Expected:** When the model/safety layer refuses, the answer shows a distinct refusal state (not a generic error or a normal answer), with a next step.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:324 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7980
- **Where to find it:** AGI Code sidebar > send a message that the safety system refuses > read the error block (labels found in the code)
- **Needs:** a request the safety system refuses
- **Steps:**
  1. Send a request that the safety system is likely to refuse.
  2. Wait for the error block to appear under the turn.
  3. Read the words in the error block.
  4. Compare with Expected: it must say a safety refusal with a next step ('Rephrase the request, or try a different model.'), not a generic error.

## S17.39 Interrupted state.

- **Expected:** An answer the user stopped (or that was interrupted) is marked as stopped, keeps what arrived, and offers to try again.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:330 (quoted code not found in the file now); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7980
- **Where to find it:** AGI Code sidebar > send a message > click the 'Stop response' button while the answer streams > read the note on the answer (labels found in the code)
- **Needs:** an account or local runtime that can answer
- **Steps:**
  1. Send a long question.
  2. While the answer is still arriving, click the 'Stop response' button.
  3. Check that the answer stops and keeps the text that already arrived.
  4. Look for the 'Stopped' marker or the note about the stopped turn, and whether a Retry option is offered.
  5. Compare with Expected: the answer must be marked stopped, keep what arrived, and offer to try again. The exact words shown after a user stop were not confirmed in the code.

## S17.40 Empty-output error state.

- **Expected:** A turn that returns nothing shows an explicit 'no response' error with retry, not an empty bubble.
- **Code:** done. Evidence moved: apps/cli/src/errors.rs:140; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:316 (quoted code not found in the file now)
- **Where to find it:** AGI Code sidebar > send a message that gets no reply from the model > read the error block (labels found in the code)
- **Needs:** a turn that returns no output (hard to trigger on demand)
- **Steps:**
  1. Send a message that the model answers with nothing (this depends on the provider; it may be hard to trigger).
  2. Wait for the error block under the turn.
  3. Read the words: they should say the provider could not answer.
  4. Check whether a 'Retry' button is offered.
  5. Compare with Expected: an explicit error with retry must appear, not an empty bubble.
