---
id: "PLAN-web-019"
type: "test-plan"
title: "Web · 19. Streaming and response-presentation states"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "19"
---
# Web · 19. Streaming and response-presentation states

28 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S19.01 Request accepted.

- **Expected:** Right after sending, the surface shows that the request was accepted and work has started (before any output).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/TypingIndicator.tsx:17; apps/web/features/chat/components/messages/ChatMessageList.tsx:1350; apps/web/features/chat/components/messages/ChatMessageList.tsx:2090
- **Earlier check in the running app:** PASS: E036 [PASS; send and generating UI]: Model changed to an available free-pool route; sent project context question; user message persisted into new chat and Thinking state appeared. Project chip correctly names selected project.
- **Where to find it:** Composer: type a message and press Send message; the chat then shows Preparing before the answer (labels found in the code)
- **Steps:**
  1. Open a new chat in the web app.
  2. Type any short question in the composer.
  3. Press the Send message button.
  4. Look for the Preparing line with the spinning mark under your message, before any answer text appears.

## S19.02 Waiting in queue.

- **Expected:** A request that cannot start yet (queued behind a running turn or a server queue) is shown as waiting/queued.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/SendButton.tsx:114; apps/web/features/chat/components/Composer/SendButton.tsx:25
- **Where to find it:** Composer: send a second message while the first reply is still running; a Queued chip appears beside the send button (labels found in the code)
- **Steps:**
  1. Send a question that gives a long answer.
  2. While it is still answering, type a second message in the composer.
  3. Press Send message.
  4. Look for the Queued chip next to the send button (with a count if more than one is queued).

## S19.03 Preparing context.

- **Expected:** Before the model answers, the surface shows it is preparing (reading context/attachments/memory).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/TypingIndicator.tsx:17; apps/web/features/chat/components/messages/ChatMessageList.tsx:1350
- **Where to find it:** Composer: send a message with an attachment; the chat shows Preparing before the model answers (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Open a new chat.
  2. Attach a file with the attachment control in the composer.
  3. Type a question about the file and press Send message.
  4. Look for Preparing while the file is read, before the answer starts.

## S19.04 Searching sources.

- **Expected:** While the assistant searches sources, the surface shows a searching state (ideally with the query).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:143; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:210; apps/web/lib/hooks/useChatStream.ts:2204
- **Where to find it:** Composer: send a question that needs web search; the activity timeline shows Searching the web (labels found in the code)
- **Needs:** a turn that uses web search
- **Steps:**
  1. Send a question that needs current information from the web.
  2. Look at the activity timeline above the answer while it runs.
  3. Look for Searching the web, followed by the search summary if one is shown.

## S19.05 Running code.

- **Expected:** While code runs, the surface shows a running-code state for that step.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:76; apps/web/features/chat/components/messages/MessageBubble.tsx:2799; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Composer: ask the model to run Python code; the code block shows Running Python while it runs (labels found in the code)
- **Needs:** a model route that runs code
- **Steps:**
  1. Ask the model to calculate something by running Python code.
  2. Look for the code execution block in the answer.
  3. Look for Running Python while the step is executing, then the Output section when it finishes.

## S19.06 Calling a connected service.

- **Expected:** While a connected service (connector/MCP tool) is called, the surface names the service and shows the call in progress.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:392 (quoted code not found in the file now); apps/web/features/chat/components/messages/MessageBubble.tsx:2664; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Composer: send a request that uses a connected connector; the activity step names the connector with Using (labels found in the code)
- **Needs:** a connected connector account
- **Steps:**
  1. Connect a service in the app's connectors settings, then open a new chat.
  2. Ask for something that needs that service.
  3. Look at the activity timeline for a step that names the service with Using.
  4. Check that the step shows the call in progress until it finishes.

## S19.07 Waiting for approval.

- **Expected:** When a step needs the user's approval, the turn visibly pauses in a waiting-for-approval state with approve/deny controls.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:341; apps/web/features/chat/components/messages/ChatMessageList.tsx:1152; apps/web/features/chat/components/messages/ChatMessageList.tsx:1744
- **Where to find it:** Composer: send a request that needs approval for a tool step; the turn shows Needs approval (labels found in the code)
- **Needs:** a tool that asks for approval
- **Steps:**
  1. Send a request that triggers a tool needing approval.
  2. Look for the Needs approval label in the activity timeline.
  3. Look for the note Waiting for approval. This response is partial; review the tool request to continue.
  4. Check that approve and deny controls appear on the tool step.

## S19.08 Waiting for user input.

- **Expected:** When the assistant needs information from the user mid-task, it shows a waiting-for-input state with a way to answer.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:110; apps/web/features/chat/components/messages/MessageBubble.tsx (text found, layout changed)
- **Where to find it:** Composer: send a task where the assistant asks a question mid-task; the activity shows Waiting for your input (labels found in the code)
- **Needs:** a task that makes the assistant ask a question
- **Steps:**
  1. Send a task that is vague, so the assistant needs a detail from you.
  2. Look for the Waiting for your input label in the activity timeline.
  3. Find the question card in the answer and type a reply into it.
  4. Check that the turn continues after you reply.

## S19.09 Receiving first output.

- **Expected:** The moment the first output arrives, the waiting indicator gives way to the answer.
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:2362; apps/web/features/chat/components/messages/ChatMessageList.tsx:1350
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Send a question in a new chat.
  2. Watch the Generating response line under your message.
  3. As soon as the first words appear, check that the Generating response line is gone and the answer text is shown.

## S19.10 Streaming text.

- **Expected:** Text appears progressively while the model streams.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2884; apps/web/lib/hooks/useChatStream.ts:2573 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Composer: send any question; the answer text appears word by word in the chat thread (labels found in the code)
- **Steps:**
  1. Open a new chat and type a question that gives a longer answer.
  2. Press Send message.
  3. Watch the answer grow in the chat thread while it is still running.
  4. Check that the text grows in pieces, not all at once when the answer finishes.

## S19.11 Streaming structured output.

- **Expected:** Structured output (markdown lists, tables, code blocks) renders correctly while it is still streaming.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2884; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/lib/hooks/useChatStream.ts:2573 (quoted code not found in the file now)
- **Where to find it:** Composer: ask for a list, a table or a code block; check it while the answer is still streaming (labels found in the code)
- **Steps:**
  1. Send a request such as Make a table of three fruits with their colours, or Write a short Python function.
  2. Watch the answer while it is still streaming.
  3. Check that the table, list or code block is drawn correctly before the answer finishes.
  4. Check that the finished answer shows the same structure.

## S19.12 Building an artifact.

- **Expected:** While an artifact/file is being produced, the surface shows it is being built.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2136 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/messages/MessageBubble.tsx:2979
- **Where to find it:** Composer: ask for a file or document; the chat shows Creating while it is built, then Created a file (labels found in the code)
- **Steps:**
  1. Ask the assistant to create a document or a small file.
  2. Look at the artifact row in the answer while it is being made.
  3. Look for the word Creating and the Show the code being written action.
  4. Check that the row changes to Created a file when it is done.

## S19.13 Generating media.

- **Expected:** While an image/video is generated, the surface shows generation progress.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3290; apps/web/features/chat/pages/WebChatPage.tsx:7760; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Composer: ask for an image or a video; the media card shows generation progress (labels found in the code)
- **Needs:** a model route that generates images
- **Steps:**
  1. Ask the assistant to generate an image of a simple object.
  2. Look at the media card in the answer while it generates.
  3. Check that a progress or generating state is shown before the picture appears.

## S19.15 Completed.

- **Expected:** A finished turn is clearly shown as completed (indicator stops; completion is announced/labelled).
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ChatMessageList.tsx:1052 (quoted code not found in the file now); packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:353; apps/web/features/chat/components/messages/ChatMessageList.tsx:1750
- **Earlier check in the running app:** PASS: Ordinary Qwen and temporary Qwen requests completed. Free Auto text/file requests failed upstream overload; completion is route-specific. | E039 [BLOCKED; default route overload]: Ordinary new chat has no Project chip or repeated training banner. OpenRouter Free Auto failed visibly with overloaded-upstream explanation and Retry. No assistant text generated. | E040 [PASS; live generated answer]: Follow-up on (model name).8-max-0902 returned exact LIVE_QA_20260926_OK; served route labeled via free pool. Renamed own conversation Browser QA, Chat and rendering. The earlier Retry click on failed activity did not visibly restart a request; fresh send succeeded. Sources panel opens empty, no research performed. | E104 [PASS; synthetic temporary response completed]: Temporary request returned exact TEMP_QA_8402_OK. Conversation URL 20c45353-c2e3-4606-a039-692504921dcf and temporary status visible. This establishes inference in temporary mode, not retention enforcement.
- **Where to find it:** Chat thread: a finished turn shows no loading line and its state is named for screen readers (labels found in the code)
- **Steps:**
  1. Send a short question and wait for the answer to finish.
  2. Check that the Generating response line and the Preparing line are gone.
  3. Check that the answer is marked complete for screen readers, for example with the Response complete announcement.

## S19.16 Partially completed.

- **Expected:** A run that finished with some steps failed is shown as partially completed, distinct from success and failure.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:335 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:1164; apps/web/features/chat/components/messages/MessageBubble.tsx:2664
- **Where to find it:** Chat thread or activity timeline: a run with some failed steps shows Finished with errors (labels found in the code)
- **Needs:** a multi-step turn where one step fails
- **Steps:**
  1. Send a request that uses several steps, such as a search plus a tool call.
  2. Let one step fail, or wait for a run where a step fails.
  3. Look for Finished with errors in the activity timeline or the Response finished with errors line under the answer.
  4. Check that it is not shown as Response complete or Response failed.

## S19.17 Cancel requested.

- **Expected:** After the user presses stop, the surface shows the stop is in progress until it takes effect.
- **Code:** done. Evidence present: apps/web/features/chat/lib/cancel-cloud-run.ts:7; apps/web/features/chat/components/messages/StreamPhaseNotice.tsx:14; apps/web/lib/hooks/useChatStream.ts:5417; apps/web/lib/hooks/useChatStream.ts:5418; apps/web/lib/hooks/useChatStream.test.tsx:1788
- **Where to find it:** Composer: while an answer is running, press Stop generation; the chat shows Stopping the Cloud task (labels found in the code)
- **Steps:**
  1. Send a question that gives a long answer.
  2. Press the stop button in the composer (its tooltip says Stop generation).
  3. Look for the Stopping the Cloud task line in the answer, below the text.
  4. Check that the line stays until the run has stopped.

## S19.18 Cancelled.

- **Expected:** A stopped turn ends in a clear cancelled/stopped state that keeps what arrived.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ChatMessageList.tsx:1957; apps/web/features/chat/components/messages/ChatMessageList.tsx:1207 (quoted code not found in the file now); apps/web/lib/hooks/useChatStream.ts:5422; apps/web/lib/hooks/useChatStream.test.tsx:2167; apps/web/lib/workflows/cloud-agent-workflow.liveness.test.ts:297
- **Where to find it:** Chat thread: after Stop, the answer keeps the text that arrived and shows Response stopped. with Try again (labels found in the code)
- **Steps:**
  1. Send a long question and press Stop generation partway.
  2. Check that the text that arrived is still shown above.
  3. Look for the line Response stopped. with a Try again button.
  4. Look for Response cancelled. Partial response saved. in the message status if shown.

## S19.19 Reconnecting.

- **Expected:** When the connection drops mid-turn, the surface shows it is reconnecting and resumes when possible.
- **Code:** done. Evidence present: apps/web/features/chat/stores/stream-phase-store.ts:3; apps/web/lib/hooks/useChatStream.ts:3043; apps/web/features/chat/components/messages/StreamPhaseNotice.tsx:15; apps/web/features/chat/components/messages/MessageBubble.tsx:3620
- **Where to find it:** Chat thread: if the network drops during a turn, the line Reconnecting... shows until it resumes (labels found in the code)
- **Needs:** a way to drop the network connection
- **Steps:**
  1. Send a long question.
  2. Turn off Wi-Fi on the Mac while the answer is running.
  3. Look for the Reconnecting… line under the answer.
  4. Turn Wi-Fi back on and check whether the answer continues.

## S19.20 Resuming existing work.

- **Expected:** Work that was already running is picked up again (after reconnect/reopen) and shown as resuming rather than restarting.
- **Code:** done. Evidence moved: apps/web/lib/hooks/useChatStream.ts:3118; apps/web/lib/hooks/useChatStream.ts:3041; apps/web/features/chat/components/messages/MessageBubble.tsx:2664; apps/web/lib/hooks/useChatStream.ts:3670 (quoted code not found in the file now); apps/web/lib/hooks/useChatStream.ts:4107; apps/web/lib/hooks/useChatStream.test.tsx:1852; apps/web/lib/hooks/useChatStream.test.tsx:1875
- **Where to find it:** no screen of its own. No visible Resuming word was found; the effect is seen only through the answer continuing.
- **Needs:** a turn that is still running when the tab is closed
- **Steps:**
  1. Send a long question in a chat.
  2. Close the browser tab while the answer is still running.
  3. Open the same chat again from the sidebar.
  4. Check that the answer continues from where it was, and that the text does not start again from the top.

## S19.21 Rate-limited.

- **Expected:** A rate-limited turn says so, with when to retry if known.
- **Code:** done. Evidence present: apps/web/features/chat/lib/turn-error-notice.ts:118; apps/web/features/chat/lib/turn-error-notice.ts:84
- **Where to find it:** Chat thread: a rate-limited turn shows the rate-limit notice under the failed reply, with Retry (labels found in the code)
- **Needs:** a provider rate limit, which is hard to make happen on demand
- **Steps:**
  1. Send a message to a model that is receiving too many requests.
  2. Look for the notice under the reply.
  3. Check that it says to wait and retry, and names another model if your plan has one.

## S19.22 Budget exhausted.

- **Expected:** A turn blocked by an exhausted budget/plan limit says so and points to the fix (upgrade/usage).
- **Code:** done. Evidence present: apps/web/features/chat/lib/turn-error-notice.ts:145; apps/web/features/chat/lib/turn-error-notice.ts:110
- **Where to find it:** Chat thread: a turn blocked by an account usage limit shows the usage notice with Usage (labels found in the code)
- **Needs:** an account at its usage limit
- **Steps:**
  1. Use an account that has reached its usage limit.
  2. Send a message.
  3. Look for the notice: You have reached a usage limit on your account.
  4. Check that it points to Usage to see when it resets.

## S19.23 Authentication expired.

- **Expected:** A turn that fails because sign-in expired says so and offers to sign in again.
- **Code:** done. Evidence present: apps/web/features/chat/lib/turn-error-notice.ts:143; apps/web/features/chat/lib/turn-error-notice.ts:109
- **Where to find it:** Chat thread: a turn that fails because sign-in expired shows the session notice (labels found in the code)
- **Needs:** an expired session
- **Steps:**
  1. Let the session expire, or sign out in another tab, then send a message.
  2. Look for the notice: Your session ended before this turn finished.
  3. Check whether a Sign in again control is offered next to the notice.

## S19.24 Required device unavailable.

- **Expected:** When a step needs a device that is offline (e.g. the user's desktop or local runtime), the turn shows it is waiting for / cannot reach that device.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:379; apps/web/features/chat/components/messages/MessageBubble.tsx:2664
- **Where to find it:** Activity timeline: when a step needs your desktop and it is offline, the step shows Waiting for your desktop (labels found in the code)
- **Needs:** the desktop app linked and then offline
- **Steps:**
  1. Start a task that needs the desktop app, with the desktop app closed.
  2. Look at the activity timeline in the chat.
  3. Look for Waiting for your desktop, with the device name if one is shown.

## S19.25 Provider unavailable.

- **Expected:** When the model provider is down/unavailable, the turn says so and offers retry or another model.
- **Code:** done. Evidence present: apps/web/features/chat/lib/turn-error-notice.ts:120; apps/web/features/chat/lib/turn-error-notice.ts:88
- **Earlier check in the running app:** PASS: E039 [PASS; provider failure surfaced]: Ordinary new chat has no Project chip or repeated training banner. OpenRouter Free Auto failed visibly with overloaded-upstream explanation and Retry. No assistant text generated.
- **Where to find it:** Chat thread: when the model provider is unavailable the notice offers Retry or another model (labels found in the code)
- **Needs:** a provider outage, or a free route that is overloaded
- **Steps:**
  1. Send a message to a model whose provider is down or overloaded.
  2. Look for the notice under the reply.
  3. Check that it says the provider is temporarily unreachable and offers Retry or another model.

## S19.26 Failed with recoverable input.

- **Expected:** A turn that fails because of the user's input (too long, bad attachment) explains what to change so the user can fix and resend.
- **Code:** done. Evidence present: apps/web/features/chat/lib/turn-error-notice.ts:126; apps/web/features/chat/lib/turn-error-notice.ts:97
- **Earlier check in the running app:** PASS: E037 [PASS; visible error and details]: Plain text project question with no attachments failed: QwenCloud free models answer text prompts in Chat; turn off tools/remove attachments. Could not verify project instruction influence. Error restored text to composer and Retry offered; details panel shows failed state.
- **Where to find it:** Chat thread: a message that is too long or an attachment the model cannot read shows the fix to make, with Retry (labels found in the code)
- **Needs:** a very long message or an unsupported attachment
- **Steps:**
  1. Paste a very long message, or attach a file the model cannot read.
  2. Send it.
  3. Look for the notice that names the problem, such as This message is too long for the selected model.
  4. Check that the text is put back in the composer so you can fix and resend.

## S19.27 Failed after useful partial output.

- **Expected:** A turn that fails after producing useful output keeps that output and marks the failure.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:117; apps/web/features/chat/components/messages/ChatMessageList.tsx:1817
- **Where to find it:** Chat > send a message > the answer stops part way through > look for the "Retry" button under the failed turn (labels found in the code)
- **Needs:** a way to make the provider fail mid-answer (no reliable on-demand trigger found in the code); a Free account can reach the fallback route
- **Steps:**
  1. Sign in and open a new chat from the first screen.
  2. Send a long request, such as "Write a detailed 2000-word guide", so the answer runs for a while.
  3. Wait for the connection or provider to fail while text is still arriving (this is not something a tester can force on demand; if it does not happen, mark it unsure).
  4. Check that the text that already arrived stays on the page, and that the message says the response stopped part way through and the part that arrived is kept above.
  5. Check that a "Retry" button is offered, and that the failed state is shown in the turn's activity details.

## S19.28 Session restored after app restart.

- **Expected:** After the app restarts, the conversation and each turn's final state (done/failed/stopped) come back as they were.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:266; apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:200
- **Where to find it:** Sidebar > Recents > open a conversation that ended as failed or stopped, after quitting and reopening the app (labels found in the code)
- **Needs:** a signed-in account that can produce a failed or stopped turn
- **Steps:**
  1. Start a chat and let one turn finish as failed (for example a provider error) or stop it with the stop control.
  2. Note the turn's final state: the failure text, or the stopped state.
  3. Quit the app completely and open it again, then sign in if asked.
  4. Find the same conversation under Recents in the sidebar and open it.
  5. Compare the conversation and that turn's final state (failed or stopped) with what you noted before the restart.

## S19.29 Background work continuing after UI closure.

- **Expected:** Work keeps running after the UI is closed and its result is there (or resumes) when the user returns.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/route.ts:642; apps/web/lib/hooks/useChatStream.ts:3118; apps/web/features/chat/components/messages/MessageBubble.tsx:2664
- **Where to find it:** no screen of its own. This is server-side behaviour in apps/web/app/api/llm/v1/chat/completions/route.ts (durable run start near line 642) with the resume logic in apps/web/lib/hooks/useChatStream.ts near line 3118; whether the run keeps going after a tab closes was not confirmed by reading the code alone.
- **Needs:** a signed-in account; desktop notification permission for the notification part
- **Steps:**
  1. Start a long answer in a chat.
  2. Close the browser tab or window while the answer is still generating.
  3. Wait a minute or two, then open the app or the same conversation again from Recents.
  4. Check that the answer is complete or still being produced, and that a desktop notification titled "Your reply is ready" appeared when the app was in the background.
