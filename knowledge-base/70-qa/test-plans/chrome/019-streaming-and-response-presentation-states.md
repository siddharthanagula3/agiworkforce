---
id: "PLAN-chrome-019"
type: "test-plan"
title: "Chrome · 19. Streaming and response-presentation states"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "19"
---
# Chrome · 19. Streaming and response-presentation states

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S19.01 Request accepted.

- **Expected:** Right after sending, the surface shows that the request was accepted and work has started (before any output).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6974; apps/extension/src/side_panel.ts:4443 (quoted code not found in the file now)
- **Where to find it:** Open the AGI side panel in Chrome, then in the composer (placeholder "How can I help you today?") type a message and press the send button (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Open the AGI side panel in Chrome.
  2. Type any short message in the composer and press send.
  3. Look at the answer area right after pressing send and compare with Expected.

## S19.02 Waiting in queue.

- **Expected:** A request that cannot start yet (queued behind a running turn or a server queue) is shown as waiting/queued.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:8701; apps/extension/src/side_panel.ts:8734; apps/extension/src/side_panel.ts:15317
- **Where to find it:** Open the AGI side panel, send a message, then type and send a second message while the first answer is still streaming (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Send a message that gets a long answer.
  2. While it is still answering, type a second message.
  3. Look at the composer placeholder and the queued list above it: the second message should show as queued with Edit and Cancel.

## S19.03 Preparing context.

- **Expected:** Before the model answers, the surface shows it is preparing (reading context/attachments/memory).
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:6339; apps/extension/src/side_panel.ts:9221
- **Where to find it:** Open the AGI side panel, attach or use the current page as context, then send a message (labels found in the code)
- **Needs:** a signed-in account and a normal web page open
- **Steps:**
  1. Open a normal web page and open the AGI side panel.
  2. Send a message that uses the page as context.
  3. Look for the thinking label before the answer starts.

## S19.04 Searching sources.

- **Expected:** While the assistant searches sources, the surface shows a searching state (ideally with the query).
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:597 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:866; apps/extension/src/side_panel.ts:5934
- **Where to find it:** Open the AGI side panel and ask a question that needs browsing history, for example 'What did I read about X yesterday?' (labels found in the code)
- **Needs:** a signed-in account and browsing-history access granted to the extension
- **Steps:**
  1. Ask a question that needs the browsing history.
  2. Watch the step row under the answer while it works.
  3. Look for 'Searching browsing history' and, when sources are used, 'Sources for <query>'.

## S19.05 Running code.

- **Expected:** While code runs, the surface shows a running-code state for that step.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:822; apps/extension/src/features/side-panel/bubbles.ts:320 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5934
- **Where to find it:** Open the AGI side panel and ask for something that makes the assistant run code, for example 'Use code to add 1234 and 5678' (labels found in the code)
- **Needs:** a signed-in account; code execution must be available on the chosen route
- **Steps:**
  1. Send a request that needs code to be run.
  2. Watch the answer while the code step is running.
  3. Look for the 'Running code…' label, then the finished code block.

## S19.06 Calling a connected service.

- **Expected:** While a connected service (connector/MCP tool) is called, the surface names the service and shows the call in progress.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:597 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5934
- **Where to find it:** Open the AGI side panel, ask for something that uses a connected service, then open the activity row under the answer ('Working for <time>') and expand the step (labels found in the code)
- **Needs:** a connected service (connector or MCP tool) and a signed-in account
- **Steps:**
  1. Connect a service in the AGI account and ask for something that uses it.
  2. While it works, open the activity row under the answer.
  3. Expand the step and look for the service name in the step summary and the 'Request' heading while the call is in progress.

## S19.07 Waiting for approval.

- **Expected:** When a step needs the user's approval, the turn visibly pauses in a waiting-for-approval state with approve/deny controls.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:609 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:954; apps/extension/src/side_panel.ts:4430 (quoted code not found in the file now)
- **Where to find it:** Open the AGI side panel and send a request that needs a tool approval; in the activity row under the answer, expand the step with 'Needs your approval · <time>' (labels found in the code)
- **Needs:** a signed-in account and a tool that needs approval
- **Steps:**
  1. Send a request that needs a tool approval.
  2. Open the activity row labelled 'Needs your approval · <time>' under the answer.
  3. Expand the step and look for the approval text with the Approve and Decline buttons, and for the 'Allow for this chat' choice.

## S19.08 Waiting for user input.

- **Expected:** When the assistant needs information from the user mid-task, it shows a waiting-for-input state with a way to answer.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/connectorInputForm.ts:309; apps/extension/src/features/side-panel/bubbles.ts:1142; apps/extension/src/side_panel.ts:5717; apps/extension/src/background.ts:5378; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:1315; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:2104
- **Where to find it:** Open the AGI side panel and send a request where the assistant needs information; the activity row under the answer shows 'Needs your input · <time>' and an input form (labels found in the code)
- **Needs:** a signed-in account and a connector that asks for input
- **Steps:**
  1. Send a request that needs a detail from you.
  2. Open the activity row labelled 'Needs your input · <time>'.
  3. Expand the step and look for the '<server> needs your input' heading and the form with a Submit button.

## S19.09 Receiving first output.

- **Expected:** The moment the first output arrives, the waiting indicator gives way to the answer.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:2016; apps/extension/src/side_panel.ts:16082
- **Where to find it:** no screen of its own. There is no control for this. The thinking indicator is removed when the first content arrives (side_panel.ts removeThinking).
- **Needs:** a signed-in account
- **Steps:**
  1. Send any message.
  2. Watch the 'Preparing' indicator under the composer.
  3. Look for it to disappear as soon as the first answer text appears.

## S19.10 Streaming text.

- **Expected:** Text appears progressively while the model streams.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:6373; apps/extension/src/side_panel.ts:16088
- **Where to find it:** no screen of its own. A rendering behaviour with no control of its own.
- **Needs:** a signed-in account
- **Steps:**
  1. Send a message that gets a long answer.
  2. Watch the answer bubble while it is still answering.
  3. Look for the text to grow line by line instead of appearing all at once.

## S19.11 Streaming structured output.

- **Expected:** Structured output (markdown lists, tables, code blocks) renders correctly while it is still streaming.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:4460 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10828 (quoted code not found in the file now)
- **Where to find it:** no screen of its own. A rendering behaviour with no control of its own. Whether the model produces a table depends on the answer.
- **Needs:** a signed-in account
- **Steps:**
  1. Ask for an answer that has a list, a table and a code block.
  2. Watch the answer while it is still streaming.
  3. Look for the list, table and code block to render correctly before the answer finishes.

## S19.14 Saving results.

- **Expected:** After output completes, the surface shows results being saved/synced and when they are saved.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:674; apps/extension/src/side_panel.ts:701
- **Where to find it:** Click 'Recent chats' in the side panel, then look at the badge on each chat row (labels found in the code)
- **Needs:** a signed-in account for the account copy; without it only 'Saved on this device' appears
- **Steps:**
  1. Send a message and wait for the answer to finish.
  2. Click the 'Recent chats' button in the side panel.
  3. Look at the badge on the chat row: 'Syncing to your account' while it saves, then 'Saved to your account'; for a browser-only chat it says 'Saved on this device'.

## S19.15 Completed.

- **Expected:** A finished turn is clearly shown as completed (indicator stops; completion is announced/labelled).
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:612 (quoted code not found in the file now); apps/extension/src/side_panel.ts:9692
- **Where to find it:** Send a request that uses steps (for example a browser or tool step); when it ends, the activity row under the answer reads 'Worked for <time>' (labels found in the code)
- **Needs:** a signed-in account and a request that uses steps
- **Steps:**
  1. Send a request that uses at least one tool or browser step.
  2. Wait for the answer to finish.
  3. Look at the activity row under the answer: it should read 'Worked for <time>' and the streaming indicator should stop.

## S19.16 Partially completed.

- **Expected:** A run that finished with some steps failed is shown as partially completed, distinct from success and failure.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:1168; apps/extension/src/features/side-panel/bubbles.ts:847 (quoted code not found in the file now)
- **Where to find it:** Send a request where one step fails but others succeed; the activity row under the answer reads 'Finished with errors · <time>' (labels found in the code)
- **Needs:** a signed-in account and a run where some steps fail
- **Steps:**
  1. Send a request with several steps where one is expected to fail.
  2. Wait for the run to finish.
  3. Look at the activity row: 'Finished with errors · <time>', or 'Worked for <time>' with failed attempts, which is distinct from 'Worked for' alone.

## S19.17 Cancel requested.

- **Expected:** After the user presses stop, the surface shows the stop is in progress until it takes effect.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:7645; apps/extension/src/side_panel.ts:9907; apps/extension/__tests__/side-panel-stop.test.ts:675; apps/extension/__tests__/side-panel-stop.test.ts:792
- **Where to find it:** Send a message, then while the answer is streaming press the send button, which now reads 'Stop generating' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Send a message that gets a long answer.
  2. While it is still streaming, press the button labelled 'Stop generating'.
  3. Look at the button and the answer: it should show 'Stopping…' and stay disabled until the stop takes effect.

## S19.18 Cancelled.

- **Expected:** A stopped turn ends in a clear cancelled/stopped state that keeps what arrived.
- **Code:** done. Evidence present: apps/extension/src/background.ts:5467; apps/extension/src/features/cloud-bridge/managedRunControl.ts:470; apps/extension/__tests__/side-panel-stop.test.ts:760; apps/extension/__tests__/managed-chat-cancellation.test.ts:298; apps/web/lib/workflows/cloud-agent-workflow.liveness.test.ts:297
- **Where to find it:** Stop a running answer with 'Stop generating'; the activity row under the answer reads 'Cancelled after <time>' (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Send a message with steps, then press 'Stop generating' while it runs.
  2. Wait until the stop takes effect.
  3. Look at the activity row: 'Cancelled after <time>', and check the text that already arrived is still shown.

## S19.19 Reconnecting.

- **Expected:** When the connection drops mid-turn, the surface shows it is reconnecting and resumes when possible.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:7002; apps/extension/src/side_panel.ts:15887; apps/extension/src/features/side-panel/bubbles.ts:652
- **Where to find it:** Send a message, then lose the connection while it is answering; the bubble shows 'Reconnecting…' (labels found in the code)
- **Needs:** a signed-in account and the ability to drop the connection
- **Steps:**
  1. Send a message that gets a long answer.
  2. Turn off the network connection briefly while it is answering, then turn it back on.
  3. Look for the 'Reconnecting…' status in the answer bubble, and check the answer continues when the connection returns.

## S19.20 Resuming existing work.

- **Expected:** Work that was already running is picked up again (after reconnect/reopen) and shown as resuming rather than restarting.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:1707; apps/extension/src/side_panel.ts:7016; apps/extension/src/features/side-panel/bubbles.ts:597 (quoted code not found in the file now)
- **Where to find it:** Close and reopen the AGI side panel while an answer is still running; the bubble shows 'Reconnecting…' and resumes (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Send a message that gets a long answer.
  2. Close the side panel while it is still answering.
  3. Reopen the side panel and look at the answer: it should show 'Reconnecting…' and keep going, not start over.

## S19.21 Rate-limited.

- **Expected:** A rate-limited turn says so, with when to retry if known.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/chat-state.ts:233 (quoted code not found in the file now); apps/extension/src/side_panel.ts:871
- **Where to find it:** Send a message on a model that is rate limited; the answer bubble shows 'The model is busy right now.' with a 'Try again in <time>.' line when a wait is known (labels found in the code)
- **Needs:** a model with a rate limit at the time of the test
- **Steps:**
  1. Send a message on a model that is rate limited.
  2. Wait for the error in the answer bubble.
  3. Look for 'The model is busy right now.' and the 'Try again in' time, and the Retry button.

## S19.22 Budget exhausted.

- **Expected:** A turn blocked by an exhausted budget/plan limit says so and points to the fix (upgrade/usage).
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10698 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:316
- **Where to find it:** Send a message when the account's usage allowance is used up; the answer bubble shows the limit text with an 'Upgrade' button (also 'Add credits' or 'Manage usage' when offered) (labels found in the code)
- **Needs:** a Free account with its allowance used up, or an account with an exhausted limit
- **Steps:**
  1. Use up the usage allowance on a Free account, or use an account with an exhausted limit.
  2. Send a message.
  3. Look for the limit text in the answer bubble and the 'Upgrade' button below it, and check it leads to the upgrade or usage page.

## S19.23 Authentication expired.

- **Expected:** A turn that fails because sign-in expired says so and offers to sign in again.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:15917; apps/extension/src/features/side-panel/bubbles.ts:316
- **Where to find it:** Send a message after your sign-in has expired; the panel shows 'Sign in to use AGI Cloud chat.' with a 'Sign in' button (labels found in the code)
- **Needs:** a signed-in account whose sign-in can be expired
- **Steps:**
  1. Let the sign-in expire, or sign out in the AGI account, then open the side panel.
  2. Send a message.
  3. Look for the error text 'Sign in to AGI Cloud to send messages.' and the 'Sign in' button that offers to sign in again.

## S19.24 Required device unavailable.

- **Expected:** When a step needs a device that is offline (e.g. the user's desktop or local runtime), the turn shows it is waiting for / cannot reach that device.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:1162; apps/extension/src/features/side-panel/bubbles.ts:1163
- **Where to find it:** Send a request that needs your desktop (or a paired device) while that device is offline; the activity row shows 'Waiting for your desktop · <time>' or 'Waiting for <device> · <time>' (labels found in the code)
- **Needs:** a paired device that can be turned off
- **Steps:**
  1. Turn off the paired device or desktop app.
  2. Send a request that needs it.
  3. Open the activity row under the answer and look for 'Waiting for your desktop' or 'Waiting for <device>', and in the step 'Waiting for <device> to run this step.'

## S19.25 Provider unavailable.

- **Expected:** When the model provider is down/unavailable, the turn says so and offers retry or another model.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:9771; apps/extension/src/features/side-panel/bubbles.ts:168 (quoted code not found in the file now)
- **Where to find it:** Send a message when the chosen model is unavailable; the answer bubble shows the error with 'Retry' and 'Switch model' buttons (labels found in the code)
- **Needs:** a model that is unavailable at the time of the test
- **Steps:**
  1. Send a message on a model that is unavailable (for example a retired or down model).
  2. Wait for the error in the answer bubble.
  3. Look for 'The model is not available right now.' or 'The selected model is not available.', then the 'Retry' and 'Switch model' buttons.

## S19.26 Failed with recoverable input.

- **Expected:** A turn that fails because of the user's input (too long, bad attachment) explains what to change so the user can fix and resend.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:340; apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:390; apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:433; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:669; apps/extension/src/features/side-panel/bubbles.ts:317; apps/extension/src/side_panel.ts:9771
- **Where to find it:** Send a message with an attachment too large for the model, or a very long chat; the answer bubble explains what to change (labels found in the code)
- **Needs:** a file too large for the model, or a very long conversation
- **Steps:**
  1. Attach a file that is too large, or keep a chat until it is too long for the model.
  2. Send the message.
  3. Look for 'An attachment is too large for the selected model.' or 'This conversation is too long for the selected model.' and the suggested fix, then check you can change it and send again with the Retry button.

## S19.27 Failed after useful partial output.

- **Expected:** A turn that fails after producing useful output keeps that output and marks the failure.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/chat-state.ts:575; apps/extension/src/features/side-panel/bubbles.ts:316; apps/extension/src/side_panel.ts:5934
- **Where to find it:** Send a message, let some answer text arrive, then make the answer fail; the partial text stays with the error and a 'Retry' button below it (labels found in the code)
- **Needs:** a signed-in account and a way to fail mid-answer
- **Steps:**
  1. Send a message that starts to answer.
  2. Cause a failure after some text has arrived (for example lose the connection and keep it off).
  3. Look at the answer: the text that arrived should still be there, with the error text and the 'Retry' button under it.

## S19.28 Session restored after app restart.

- **Expected:** After the app restarts, the conversation and each turn's final state (done/failed/stopped) come back as they were.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:1707; apps/extension/src/side_panel.ts:6730 (quoted code not found in the file now)
- **Where to find it:** Recent chats (clock button in the side panel header) > click the chat's row (labels found in the code)
- **Needs:** an account (signed in) and a Chrome restart
- **Steps:**
  1. Sign in, start a chat, send a message and let the answer finish.
  2. Send a second message and press the stop button while the answer is still arriving, so that turn ends stopped.
  3. Close the side panel and quit Chrome completely, then open Chrome again and open the AGI side panel.
  4. Click the clock button whose tooltip is Recent chats, then click the chat's row.
  5. Compare with Expected: the earlier answer and the partial stopped answer are both there, and the stopped turn shows its Cancelled footer.

## S19.29 Background work continuing after UI closure.

- **Expected:** Work keeps running after the UI is closed and its result is there (or resumes) when the user returns.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:1707; apps/extension/src/side_panel.ts:7016; apps/extension/src/features/side-panel/bubbles.ts:597 (quoted code not found in the file now)
- **Where to find it:** More (the three-dot button in the side panel header) > Tasks (labels found in the code)
- **Needs:** an account (signed in) and a task that runs for a while, such as a Cloud agent run
- **Steps:**
  1. Sign in and start a task that runs for a while, such as a Cloud agent run from the composer.
  2. Close the side panel while the task is still running.
  3. Wait a minute, then open the AGI side panel again.
  4. Click the More button, then click Tasks.
  5. Compare with Expected: the task is listed with its progress or result, the sheet intro reads Tasks AGI is running or has run for you, from every app, and the chat shows the finished result or resumes it instead of starting over.
