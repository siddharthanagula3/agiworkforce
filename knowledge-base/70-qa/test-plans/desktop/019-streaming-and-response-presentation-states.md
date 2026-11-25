---
id: "PLAN-desktop-019"
type: "test-plan"
title: "Desktop · 19. Streaming and response-presentation states"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "19"
---
# Desktop · 19. Streaming and response-presentation states

28 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S19.01 Request accepted.

- **Expected:** Right after sending, the surface shows that the request was accepted and work has started (before any output).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/TypingIndicator.tsx:17; apps/web/features/chat/components/messages/ChatMessageList.tsx:1350; apps/web/features/chat/components/messages/ChatMessageList.tsx:2090
- **Where to find it:** Chat > type a message > click the Send message button (up-arrow) > look at the reply area (labels found in the code)
- **Steps:**
  1. Sign in and open a new chat.
  2. Type any short message in the composer.
  3. Click the Send message button (up-arrow icon at the right of the composer).
  4. Look just under your message: the words Preparing with a spinning mark should show before any answer text appears.

## S19.02 Waiting in queue.

- **Expected:** A request that cannot start yet (queued behind a running turn or a server queue) is shown as waiting/queued.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/SendButton.tsx:114; apps/web/features/chat/components/Composer/SendButton.tsx:25
- **Where to find it:** Chat > while a reply is still running, type a message > click the Add message to queue button (clock icon) > look at the composer (labels found in the code)
- **Needs:** a message that produces a long reply
- **Steps:**
  1. Send a message that gets a long answer.
  2. While the answer is still arriving, type a second message in the composer.
  3. Click the clock-icon button (title: Queue message, will send after current response finishes).
  4. Look for the Queued chip beside the send control and the Queued messages list above the composer, and compare with Expected.

## S19.03 Preparing context.

- **Expected:** Before the model answers, the surface shows it is preparing (reading context/attachments/memory).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/TypingIndicator.tsx:17; apps/web/features/chat/components/messages/ChatMessageList.tsx:1350
- **Where to find it:** Chat > type a message > click the Send message button > look under your message (labels found in the code)
- **Needs:** a file to upload (optional)
- **Steps:**
  1. Open a chat and attach a file or type a message that refers to earlier context.
  2. Click the Send message button.
  3. Look for the Preparing label with a spinning mark before the answer starts.
  4. Compare with Expected: the label should show the app is preparing before the model answers.

## S19.04 Searching sources.

- **Expected:** While the assistant searches sources, the surface shows a searching state (ideally with the query).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:143; packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:210; apps/web/lib/hooks/useChatStream.ts:2204
- **Where to find it:** Chat > ask a question that needs current web sources > look at the Agent activity section under the reply > Searching the web (labels found in the code)
- **Needs:** a Free or paid account with web search available
- **Steps:**
  1. Turn on web search if your plan shows it, or ask about a current news topic.
  2. Send the question.
  3. Look under the reply for the Agent activity section and expand it if it is folded.
  4. Look for the words Searching the web and the search query, and compare with Expected.

## S19.05 Running code.

- **Expected:** While code runs, the surface shows a running-code state for that step.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/CodeExecutionBlock.tsx:76; apps/web/features/chat/components/messages/MessageBubble.tsx:2799; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Chat > ask for a calculation or chart that needs Python > look under the reply for Running Python… (labels found in the code)
- **Steps:**
  1. Send a request that needs code, such as a calculation or a chart from numbers you give.
  2. Watch the message area while the code runs.
  3. Look for the line Running Python… under the code block.
  4. Compare with Expected: the running-code line should disappear when the code finishes and output should appear.

## S19.06 Calling a connected service.

- **Expected:** While a connected service (connector/MCP tool) is called, the surface names the service and shows the call in progress.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:392 (quoted code not found in the file now); apps/web/features/chat/components/messages/MessageBubble.tsx:2664; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** not found in the code. I searched AgentActivityTimeline.tsx and connector-step-sentence.ts for a visible in-progress word for a connector call and found no fixed label, only the connector name from the summary; no screen text was confirmed.
- **Needs:** a connected service (connector)

## S19.07 Waiting for approval.

- **Expected:** When a step needs the user's approval, the turn visibly pauses in a waiting-for-approval state with approve/deny controls.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:341; apps/web/features/chat/components/messages/ChatMessageList.tsx:1152; apps/web/features/chat/components/messages/ChatMessageList.tsx:1744
- **Where to find it:** Chat > send a request that needs a tool approval > look at the Agent activity section under the reply > Needs approval (labels found in the code)
- **Needs:** a request that needs tool approval
- **Steps:**
  1. Send a request that makes the assistant use a tool needing your permission.
  2. Watch the reply area until the turn stops.
  3. Look for the words Needs approval or Approval needed in the agent activity row.
  4. Look for the words Waiting for approval under the reply and check that approve and deny controls are shown.

## S19.08 Waiting for user input.

- **Expected:** When the assistant needs information from the user mid-task, it shows a waiting-for-input state with a way to answer.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:110; apps/web/features/chat/components/messages/MessageBubble.tsx (text found, layout changed)
- **Where to find it:** Chat > ask a question the assistant needs answered mid-task > look for the Waiting for your input line and the answer card (labels found in the code)
- **Needs:** a request that makes the assistant ask a question
- **Steps:**
  1. Send a request that is vague or needs a choice, so the assistant asks a question.
  2. Look for the Waiting for your input line in the agent activity row.
  3. Look for the answer card with the choices or a text box under the reply.
  4. Answer the card and check that the turn continues, as Expected says.

## S19.09 Receiving first output.

- **Expected:** The moment the first output arrives, the waiting indicator gives way to the answer.
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:2362; apps/web/features/chat/components/messages/ChatMessageList.tsx:1350
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Send a message.
  2. Watch the Preparing line; it should give way to the answer text as soon as the first words arrive.

## S19.10 Streaming text.

- **Expected:** Text appears progressively while the model streams.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2884; apps/web/lib/hooks/useChatStream.ts:2573 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Send a message that asks for a long answer.
  2. Watch the reply: its text should grow word by word while the Generating response line is still shown.

## S19.11 Streaming structured output.

- **Expected:** Structured output (markdown lists, tables, code blocks) renders correctly while it is still streaming.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2884; apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/lib/hooks/useChatStream.ts:2573 (quoted code not found in the file now)
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Send a request for a list, a table and a code block in one answer.
  2. Watch the reply while it streams; the list, table and code block should show correctly before the answer finishes.

## S19.12 Building an artifact.

- **Expected:** While an artifact/file is being produced, the surface shows it is being built.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2136 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808; apps/web/features/chat/components/messages/MessageBubble.tsx:2979
- **Where to find it:** Chat > ask for a document or code file > look for the Creating line above the file card (labels found in the code)
- **Steps:**
  1. Send a request such as Write a short document about a topic.
  2. Watch the reply area while the file is produced.
  3. Look for the words Creating followed by the file name.
  4. Compare with Expected: the Creating line should turn into a finished file card when the file is ready.

## S19.13 Generating media.

- **Expected:** While an image/video is generated, the surface shows generation progress.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3290; apps/web/features/chat/pages/WebChatPage.tsx:7760; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Chat > ask for an image (image generation) > look for the Generating image card (labels found in the code)
- **Needs:** a plan that includes image generation
- **Steps:**
  1. Send a request such as Create an image of a red bicycle.
  2. Watch the reply area while the image is produced.
  3. Look for the card with the words Generating image and Generating with followed by the model name.
  4. Compare with Expected: the card should give way to the image when it is ready.

## S19.15 Completed.

- **Expected:** A finished turn is clearly shown as completed (indicator stops; completion is announced/labelled).
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ChatMessageList.tsx:1052 (quoted code not found in the file now); packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:353; apps/web/features/chat/components/messages/ChatMessageList.tsx:1750
- **Where to find it:** Chat > send a message > wait until the reply stops > look at the Agent activity line under the reply (labels found in the code)
- **Steps:**
  1. Send any message and wait for the answer to finish.
  2. Check that the spinning mark and Generating response line have stopped.
  3. Look for the Worked for line or the Done label in the agent activity section.
  4. Compare with Expected: a finished turn should be clearly marked as complete.

## S19.16 Partially completed.

- **Expected:** A run that finished with some steps failed is shown as partially completed, distinct from success and failure.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:335 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:1164; apps/web/features/chat/components/messages/MessageBubble.tsx:2664
- **Where to find it:** not found in the code. The wording Finished with errors is in AgentActivityTimeline.tsx and ChatMessageList.tsx, but I did not find a reliable way for a tester to trigger a partly failed run.
- **Needs:** a run where some steps fail

## S19.17 Cancel requested.

- **Expected:** After the user presses stop, the surface shows the stop is in progress until it takes effect.
- **Code:** done. Evidence present: apps/web/features/chat/lib/cancel-cloud-run.ts:7; apps/web/lib/hooks/useChatStream.ts:5417; apps/web/lib/hooks/useChatStream.ts:5406; apps/web/features/chat/components/messages/StreamPhaseNotice.tsx:14
- **Where to find it:** Chat > send a message > click the Stop the current response button (square icon) while the reply runs > look under the reply (labels found in the code)
- **Needs:** a message that gives a long answer
- **Steps:**
  1. Send a message that gives a long answer.
  2. Click the square Stop button (title: Stop generation) in the composer.
  3. Look under the reply for the words Stopping the Cloud task…, if a Cloud task is running.
  4. Compare with Expected: the stop should show as in progress until it takes effect.

## S19.18 Cancelled.

- **Expected:** A stopped turn ends in a clear cancelled/stopped state that keeps what arrived.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ChatMessageList.tsx:1957; apps/web/features/chat/components/messages/ChatMessageList.tsx:1207 (quoted code not found in the file now)
- **Where to find it:** Chat > send a message > click the Stop the current response button while the reply runs > look under the reply for Response stopped. (labels found in the code)
- **Needs:** a message that gives a long answer
- **Steps:**
  1. Send a message that gives a long answer.
  2. Click the Stop button in the composer while text is arriving.
  3. Look under the reply for the words Response stopped. with a Try again button.
  4. Check that the text that already arrived is still shown, as Expected says.

## S19.19 Reconnecting.

- **Expected:** When the connection drops mid-turn, the surface shows it is reconnecting and resumes when possible.
- **Code:** done. Evidence present: apps/web/features/chat/stores/stream-phase-store.ts:3; apps/web/lib/hooks/useChatStream.ts:3043; apps/web/features/chat/components/messages/StreamPhaseNotice.tsx:15; apps/web/features/chat/components/messages/MessageBubble.tsx:3620
- **Where to find it:** Chat > send a message > turn off the internet connection during the reply > look under the reply for Reconnecting… (labels found in the code)
- **Needs:** a way to cut the network, such as Wi-Fi off
- **Steps:**
  1. Send a message that gives a long answer.
  2. Turn off Wi-Fi or the network while text is arriving.
  3. Look under the reply for the words Reconnecting… with a spinning mark.
  4. Turn the network back on and compare with Expected: the reply should resume when possible.

## S19.20 Resuming existing work.

- **Expected:** Work that was already running is picked up again (after reconnect/reopen) and shown as resuming rather than restarting.
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:3118; apps/web/lib/hooks/useChatStream.ts:3041; apps/web/features/chat/components/messages/MessageBubble.tsx:2664
- **Where to find it:** Chat > a video still being generated > click Resume checking (labels found in the code)
- **Needs:** a plan that includes video generation
- **Steps:**
  1. Start a video generation request and leave the chat while it runs.
  2. Come back to the conversation.
  3. Look for the words Your video is still being generated with the Resume checking button.
  4. Click Resume checking and watch the card, comparing with Expected: the work should continue, not restart.

## S19.21 Rate-limited.

- **Expected:** A rate-limited turn says so, with when to retry if known.
- **Code:** done. Evidence present: apps/web/features/chat/lib/turn-error-notice.ts:118; apps/web/features/chat/lib/turn-error-notice.ts:84
- **Where to find it:** Chat > send a message while the provider is rate-limited > read the error text under the reply (labels found in the code)
- **Needs:** a condition that causes a rate limit
- **Steps:**
  1. Send messages quickly until the model reports too many requests.
  2. Look under the reply for the rate-limit text.
  3. Compare with Expected: the text should say the model is busy and when to retry if the provider stated a time.

## S19.22 Budget exhausted.

- **Expected:** A turn blocked by an exhausted budget/plan limit says so and points to the fix (upgrade/usage).
- **Code:** done. Evidence present: apps/web/features/chat/lib/turn-error-notice.ts:145; apps/web/features/chat/lib/turn-error-notice.ts:110
- **Where to find it:** Chat > send a message after the usage limit is reached > read the error text under the reply (labels found in the code)
- **Needs:** a Free account that has reached its limit
- **Steps:**
  1. Use the account until its usage limit is reached.
  2. Send a new message.
  3. Look under the reply for the usage-limit text.
  4. Compare with Expected: the text should point to Usage to see when it resets.

## S19.23 Authentication expired.

- **Expected:** A turn that fails because sign-in expired says so and offers to sign in again.
- **Code:** done. Evidence present: apps/web/features/chat/lib/turn-error-notice.ts:143; apps/web/features/chat/lib/turn-error-notice.ts:109
- **Where to find it:** Chat > send a message after the sign-in has expired > read the error text under the reply (labels found in the code)
- **Needs:** an account whose sign-in has expired
- **Steps:**
  1. Let the sign-in expire, or sign out in another window, and keep the chat open.
  2. Send a message.
  3. Look under the reply for the words Your session ended before this turn finished.
  4. Compare with Expected: the text should say to sign in again, then retry.

## S19.24 Required device unavailable.

- **Expected:** When a step needs a device that is offline (e.g. the user's desktop or local runtime), the turn shows it is waiting for / cannot reach that device.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:379; apps/web/features/chat/components/messages/MessageBubble.tsx:2664
- **Where to find it:** Chat > ask for a step that uses your desktop > read the Agent activity line under the reply (labels found in the code)
- **Needs:** the desktop app closed or offline
- **Steps:**
  1. Send a request that needs a step on your own computer while the desktop app is closed or offline.
  2. Look in the agent activity section under the reply.
  3. Look for the words Waiting for your desktop.
  4. Compare with Expected: the turn should say it cannot reach the device.

## S19.25 Provider unavailable.

- **Expected:** When the model provider is down/unavailable, the turn says so and offers retry or another model.
- **Code:** done. Evidence present: apps/web/features/chat/lib/turn-error-notice.ts:120; apps/web/features/chat/lib/turn-error-notice.ts:88
- **Where to find it:** Chat > send a message while the model provider is down > read the error text under the reply, then use Retry (labels found in the code)
- **Needs:** a provider outage (hard to trigger on demand)
- **Steps:**
  1. Send a message when the provider is unavailable.
  2. Look under the reply for the words The model provider is temporarily unreachable.
  3. Read the offered choices: Retry, or another model.
  4. Compare with Expected: the turn should offer a retry or another model.

## S19.26 Failed with recoverable input.

- **Expected:** A turn that fails because of the user's input (too long, bad attachment) explains what to change so the user can fix and resend.
- **Code:** done. Evidence present: apps/web/features/chat/lib/turn-error-notice.ts:126; apps/web/features/chat/lib/turn-error-notice.ts:97
- **Where to find it:** Chat > attach a file the model cannot read, or send a very long message > read the error text under the reply (labels found in the code)
- **Needs:** a file to upload that the model cannot read, or a very long message
- **Steps:**
  1. Attach a file type the selected model cannot read, or paste a very long message.
  2. Send it.
  3. Look under the reply for the words This model could not read one of the attachments or This message is too long for the selected model.
  4. Compare with Expected: the text should say what to remove or shorten so the user can resend.

## S19.27 Failed after useful partial output.

- **Expected:** A turn that fails after producing useful output keeps that output and marks the failure.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:117; apps/web/features/chat/components/messages/ChatMessageList.tsx:1817
- **Where to find it:** Chat screen > send a long message > if the reply stops part way, read the notice under the reply > click "Retry" (labels found in the code)
- **Needs:** a Free or paid account and a way to make the reply fail after it starts (for example a dropped network connection)
- **Steps:**
  1. Open the chat and send a long request that asks for a long answer.
  2. Wait until the reply has started to appear, then cut the connection or wait for the provider to stop the reply part way (this is hard to force on demand).
  3. Look for the notice "The response stopped part way through. The part that arrived is kept above. Retry to get a complete answer." under the reply.
  4. Check the partial text is still on the screen above the notice, and that the "Retry" button is beside it.
  5. Click "Retry" and check a complete answer replaces the failed turn.

## S19.28 Session restored after app restart.

- **Expected:** After the app restarts, the conversation and each turn's final state (done/failed/stopped) come back as they were.
- **Code:** done. Evidence present: packages/ui/ui/src/sidebar/SessionItem.tsx:266; apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:200
- **Where to find it:** Sidebar > Recents > click the conversation (after the app is closed and opened again) (labels found in the code)
- **Needs:** a signed-in account with at least one finished conversation and one stopped turn
- **Steps:**
  1. Open a conversation and let a reply finish, so the turn ends as done.
  2. Start another turn and let it finish or stop it with the stop control, so one turn ends as stopped.
  3. Quit the app completely and open it again.
  4. Find the same conversation under "Recents" in the sidebar and open it.
  5. Check the messages and the end state of each turn (done, failed or stopped) match what you saw before the restart.

## S19.29 Background work continuing after UI closure.

- **Expected:** Work keeps running after the UI is closed and its result is there (or resumes) when the user returns.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/route.ts:642; apps/web/lib/hooks/useChatStream.ts:3118; apps/web/features/chat/components/messages/MessageBubble.tsx:2664
- **Where to find it:** Chat screen > send a long task > close the browser tab or window > open the app again > Recents > click the conversation (labels found in the code)
- **Needs:** a signed-in account and a task long enough to still be running when the window is closed
- **Steps:**
  1. Send a long task that takes more than a minute to finish.
  2. Look under the reply for the notice "This task is running in this tab, not in the background." If it shows, the task stops when the page closes, so do not expect it to continue.
  3. If the notice does not show, close the tab or window while the reply is still running.
  4. Wait a few minutes, then open the app again and find the conversation under "Recents".
  5. Check the finished result is there, or the task has picked up again, rather than starting over.
