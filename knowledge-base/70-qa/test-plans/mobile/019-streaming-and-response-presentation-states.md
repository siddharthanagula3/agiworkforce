---
id: "PLAN-mobile-019"
type: "test-plan"
title: "Mobile · 19. Streaming and response-presentation states"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "19"
---
# Mobile · 19. Streaming and response-presentation states

27 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S19.01 Request accepted.

- **Expected:** Right after sending, the surface shows that the request was accepted and work has started (before any output).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:861 (quoted code not found in the file now); apps/mobile/src/features/chat/components/StreamingIndicator.tsx:4 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > type in the message box > Send message (labels found in the code)
- **Steps:**
  1. Open the Chat tab and tap the message box.
  2. Type a short question.
  3. Tap the round Send message button.
  4. Look right under your message for the spinner with the word Preparing (or Working...) before any answer text appears. Compare with Expected: the app shows the request was accepted and work has started.

## S19.02 Waiting in queue.

- **Expected:** A request that cannot start yet (queued behind a running turn or a server queue) is shown as waiting/queued.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2240; apps/mobile/src/features/chat/components/ChatInput.tsx:490
- **Where to find it:** Chat tab > turn Wi-Fi and mobile data off > type in the message box > Send (labels found in the code)
- **Needs:** phone width, ability to switch off network
- **Steps:**
  1. Turn off Wi-Fi and mobile data on the phone.
  2. Type a message in the composer.
  3. Tap Send.
  4. Look at the composer placeholder and at your message bubble for the small queued tag. Compare with Expected: the request is shown as waiting in the queue.

## S19.03 Preparing context.

- **Expected:** Before the model answers, the surface shows it is preparing (reading context/attachments/memory).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2507
- **Where to find it:** Chat tab > attach a file or photo > Send (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Open the Chat tab and attach a file or photo with the attach control.
  2. Type a short question about it.
  3. Tap Send.
  4. Look under your message for the Preparing spinner before the answer starts. Compare with Expected: the app shows it is reading the context before the answer.

## S19.04 Searching sources.

- **Expected:** While the assistant searches sources, the surface shows a searching state (ideally with the query).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/WebSearchToolCard.tsx:87; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:341; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > ask a question that needs current web sources > the tool step row (labels found in the code)
- **Needs:** a network connection; a question that triggers web search
- **Steps:**
  1. Open the Chat tab.
  2. Ask a question that needs current web information, such as today's news on a topic.
  3. While the answer is loading, look at the tool step row under the message.
  4. Compare with Expected: the row shows Searching for with the query in quotes.

## S19.05 Running code.

- **Expected:** While code runs, the surface shows a running-code state for that step.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2432; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > ask for a calculation or chart that runs Python > the code block (labels found in the code)
- **Needs:** a request that triggers code execution
- **Steps:**
  1. Open the Chat tab.
  2. Ask for something that needs code to run, such as a calculation or a chart.
  3. While the code block is working, look for the label Running Python.
  4. Compare with Expected: the code step shows it is running.

## S19.06 Calling a connected service.

- **Expected:** While a connected service (connector/MCP tool) is called, the surface names the service and shows the call in progress.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2432; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > send a request that uses a connected connector > the tool step row under the answer (labels found in the code)
- **Needs:** a connected service account (outside account may be needed)
- **Steps:**
  1. Connect a service first in the app's connectors screen (apps/mobile/app/(app)/connectors).
  2. Open the Chat tab and ask for something that uses that service.
  3. Open the tool step row under the answer while the call is in progress.
  4. Compare with Expected: the row shows Running and names the service.

## S19.07 Waiting for approval.

- **Expected:** When a step needs the user's approval, the turn visibly pauses in a waiting-for-approval state with approve/deny controls.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:845 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > send a request that needs a tool approval > the approval row under the step (labels found in the code)
- **Needs:** a request that triggers an approval
- **Steps:**
  1. Open the Chat tab and send a request that needs a tool the app asks permission for.
  2. Look for the Needs approval line in the activity row.
  3. Read the choices: Allow once, Allow for this chat, Always allow, and Deny.
  4. Compare with Expected: the turn waits and shows approve and deny controls.

## S19.08 Waiting for user input.

- **Expected:** When the assistant needs information from the user mid-task, it shows a waiting-for-input state with a way to answer.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1077
- **Where to find it:** Chat tab > send a request where the assistant needs a detail > the question card (labels found in the code)
- **Needs:** a request that triggers a clarifying question
- **Steps:**
  1. Open the Chat tab and send a vague request, such as asking for a plan without details.
  2. When a question card appears in the answer, read the questions.
  3. Pick an option or type in the Something else... box and answer.
  4. Compare with Expected: the turn shows it is waiting for your answer and lets you reply.

## S19.09 Receiving first output.

- **Expected:** The moment the first output arrives, the waiting indicator gives way to the answer.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:859 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Send a message in the Chat tab.
  2. Watch the Preparing or Working spinner under your message.
  3. Compare with Expected: when the first words arrive, the spinner row is replaced by the answer text.

## S19.10 Streaming text.

- **Expected:** Text appears progressively while the model streams.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:859 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2534 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Send a question that needs a long answer.
  2. Watch the answer bubble while the spinner is still showing.
  3. Compare with Expected: text grows in the bubble before the answer is complete.

## S19.11 Streaming structured output.

- **Expected:** Structured output (markdown lists, tables, code blocks) renders correctly while it is still streaming.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:658 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2534 (quoted code not found in the file now)
- **Where to find it:** no screen of its own.
- **Steps:**
  1. Ask for an answer that includes a bulleted list, a table or a code block.
  2. Watch the answer while it is still streaming.
  3. Compare with Expected: the list, table and code block show in their formatted form before the answer ends.

## S19.13 Generating media.

- **Expected:** While an image/video is generated, the surface shows generation progress.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2513; apps/mobile/src/features/chat/components/MessageBubble.tsx:2558; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > select image mode in the composer > type a description > Send (some labels not found in the code; trust the screen)
- **Needs:** an account that can create images
- **Steps:**
  1. Open the Chat tab and switch the composer to image mode.
  2. Type a description, such as a simple picture of a cat.
  3. Tap Send.
  4. Look for the Generating Image... card and its Stop generating button. Compare with Expected: generation progress is shown.

## S19.15 Completed.

- **Expected:** A finished turn is clearly shown as completed (indicator stops; completion is announced/labelled).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:265; apps/mobile/src/features/chat/components/MessageBubble.tsx:3146; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > send a request that uses steps > the activity row under the answer (labels found in the code)
- **Needs:** a request that uses tool steps
- **Steps:**
  1. Open the Chat tab and send a request that uses tool steps.
  2. Wait until the answer ends.
  3. Look at the activity row under the answer for the words Worked for and a time.
  4. Compare with Expected: the spinner has stopped and the turn is shown as completed.

## S19.16 Partially completed.

- **Expected:** A run that finished with some steps failed is shown as partially completed, distinct from success and failure.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:111 (quoted code not found in the file now); apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:948
- **Where to find it:** Chat tab > send a request with several steps where one step fails > the activity row (labels found in the code)
- **Needs:** a request that makes some steps fail (not controlled by the tester)
- **Steps:**
  1. Open the Chat tab and send a request that runs several steps.
  2. Wait for a run where some steps fail while others succeed.
  3. Look at the activity row under the answer.
  4. Compare with Expected: the row says Finished with errors, which is distinct from Worked for and from Failed.

## S19.17 Cancel requested.

- **Expected:** After the user presses stop, the surface shows the stop is in progress until it takes effect.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1021 (quoted code not found in the file now)
- **Where to find it:** Chat tab > send a message > tap Stop generating (square button) (labels found in the code)
- **Steps:**
  1. Send a long request in the Chat tab.
  2. While the answer streams, tap the square Stop generating button.
  3. Look at the composer and the answer for a stopping state.
  4. Compare with Expected: the surface shows the stop is in progress until it takes effect.

## S19.18 Cancelled.

- **Expected:** A stopped turn ends in a clear cancelled/stopped state that keeps what arrived.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2931
- **Where to find it:** Chat tab > send a long request > tap Stop generating (labels found in the code)
- **Steps:**
  1. Send a long request in the Chat tab.
  2. Tap the Stop generating square button while the answer streams.
  3. Wait for the turn to end.
  4. Look for the notice Response stopped. with a Try again button under the partial answer, and check the text that arrived is kept.

## S19.19 Reconnecting.

- **Expected:** When the connection drops mid-turn, the surface shows it is reconnecting and resumes when possible.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1021 (quoted code not found in the file now)
- **Where to find it:** Chat tab > send a long request > turn off Wi-Fi and mobile data during the answer (labels found in the code)
- **Needs:** phone width, ability to switch off network
- **Steps:**
  1. Send a long request in the Chat tab.
  2. While the answer streams, turn off Wi-Fi and mobile data on the phone.
  3. Look at the spinner under the answer for the words Reconnecting.
  4. Turn the network back on and compare with Expected: the turn resumes when possible.

## S19.20 Resuming existing work.

- **Expected:** Work that was already running is picked up again (after reconnect/reopen) and shown as resuming rather than restarting.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:469
- **Where to find it:** no screen of its own. No visible resuming word was found for chat turns; the research plan card shows Starting... while a resume runs (apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx).
- **Steps:**
  1. Send a long request in the Chat tab.
  2. While it streams, close the app fully and reopen it.
  3. Open the same chat again and look for the answer continuing, not starting over.
  4. Compare with Expected: the work is picked up and shown as resuming rather than restarting.

## S19.21 Rate-limited.

- **Expected:** A rate-limited turn says so, with when to retry if known.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/utils/messageStreamError.ts:186; apps/mobile/src/features/chat/utils/messageStreamError.ts:152
- **Where to find it:** Chat tab > send a message after the rate limit is reached > the failure notice under the turn (path not confirmed in the code; trust the screen)
- **Needs:** an account that hits a rate limit
- **Steps:**
  1. Send messages in the Chat tab until a rate limit is reached (the app cannot force this).
  2. Read the failure notice under the turn.
  3. Look for the words Try again in and a time.
  4. Compare with Expected: the notice says the turn was rate-limited and when to retry.

## S19.22 Budget exhausted.

- **Expected:** A turn blocked by an exhausted budget/plan limit says so and points to the fix (upgrade/usage).
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2852; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > send a message after the plan's usage is used up > the paywall sheet (labels found in the code)
- **Needs:** a Free account at its limit
- **Steps:**
  1. Use up the plan's usage in the Chat tab (or use an account at its limit).
  2. Send another message.
  3. Read the sheet that opens.
  4. Compare with Expected: the sheet says the feature is not included and points to Upgrade or Choose a plan.

## S19.23 Authentication expired.

- **Expected:** A turn that fails because sign-in expired says so and offers to sign in again.
- **Code:** done. Evidence moved: apps/mobile/stores/chat/chatExecutionStore.ts:2294; apps/mobile/stores/chat/chatExecutionStore.ts:1170 (quoted code not found in the file now)
- **Where to find it:** Chat tab > choose a cloud model > send after the sign-in has expired (labels found in the code)
- **Needs:** a Clerk sign-in that can expire
- **Steps:**
  1. Sign in, then let the sign-in expire (or sign out in another place).
  2. Open the Chat tab, choose a cloud model and send a message.
  3. Read the error that shows under the composer or the turn.
  4. Compare with Expected: the error says sign in is needed and offers to sign in again.

## S19.24 Required device unavailable.

- **Expected:** When a step needs a device that is offline (e.g. the user's desktop or local runtime), the turn shows it is waiting for / cannot reach that device.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:102 (quoted code not found in the file now); apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:375; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:947
- **Where to find it:** Chat tab > send a request that needs your desktop > the activity row (labels found in the code)
- **Needs:** a paired desktop that is offline
- **Steps:**
  1. Pair a desktop and then turn it off or let it go offline.
  2. In the Chat tab, send a request that needs that desktop.
  3. Open the activity row under the answer.
  4. Compare with Expected: the row says Waiting for followed by the desktop name.

## S19.25 Provider unavailable.

- **Expected:** When the model provider is down/unavailable, the turn says so and offers retry or another model.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:1956; apps/mobile/src/features/chat/components/MessageBubble.tsx:2155
- **Where to find it:** Chat tab > send a message while the model provider is down > the failure notice under the turn > Retry or Switch model (labels found in the code)
- **Needs:** a provider outage (not controlled by the tester)
- **Steps:**
  1. Send a message in the Chat tab while the provider is unavailable (the tester cannot force this).
  2. Read the failure notice under the turn.
  3. Look for the Retry button and the Switch model button.
  4. Compare with Expected: the turn says the provider is unavailable and offers retry or another model.

## S19.26 Failed with recoverable input.

- **Expected:** A turn that fails because of the user's input (too long, bad attachment) explains what to change so the user can fix and resend.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2848; apps/mobile/src/features/chat/utils/messageStreamError.ts:32; apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:342; apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:392; apps/web/app/api/llm/v1/chat/completions/lib/upstream-error-copy.ts:436
- **Where to find it:** Chat tab > send a message that is too long or has a bad attachment > the failure notice under the turn (labels found in the code)
- **Needs:** a file to upload that the service rejects
- **Steps:**
  1. Send a message that is too long, or attach a file the app cannot use.
  2. Read the failure notice under the turn.
  3. Look for the text Tap to try again and the Try again action.
  4. Compare with Expected: the notice explains what to change so you can fix it and send again.

## S19.27 Failed after useful partial output.

- **Expected:** A turn that fails after producing useful output keeps that output and marks the failure.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/utils/messageStreamError.ts:68; apps/mobile/src/features/chat/utils/messageStreamError.ts:181
- **Where to find it:** Chat tab > send a request > connection fails after some answer text has arrived > the answer stays (labels found in the code)
- **Needs:** a way to cut the network during an answer
- **Steps:**
  1. Send a long request in the Chat tab.
  2. Turn off the network after some answer text appears, and keep it off until the turn gives up.
  3. Read the answer text that is still shown.
  4. Compare with Expected: the text that arrived is kept and the failure is marked with Response may be incomplete.

## S19.28 Session restored after app restart.

- **Expected:** After the app restarts, the conversation and each turn's final state (done/failed/stopped) come back as they were.
- **Code:** done. Evidence present: apps/mobile/stores/chat/chatMessageStore.ts:1729; apps/mobile/app/(app)/chat/[id].tsx:2577
- **Where to find it:** Open the drawer (menu button, top left) > Recent chats > tap a chat, or Drawer > See all chats > Chats > tap a chat (labels found in the code)
- **Needs:** a Free account or a paid account; a chat with at least one finished answer; for the stopped case, a chat stopped before quitting the app
- **Steps:**
  1. Sign in, open a chat that has a finished answer and, if you can, one that was stopped part way.
  2. Force-quit the app completely (swipe it away in the app switcher) and open it again.
  3. Open the drawer and tap the same chat in Recent chats, or tap See all chats and then the chat in the Chats list.
  4. Check that the messages are still there and that each answer shows the same final state as before the restart (finished, failed or stopped). An answer that was still streaming when the app closed should show as stopped, not as still running.

## S19.29 Background work continuing after UI closure.

- **Expected:** Work keeps running after the UI is closed and its result is there (or resumes) when the user returns.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** device
- **Where to find it:** not found in the code. Searched apps/mobile for background, resume, reopen, keeps running and in the background. The only background code found is background fetch for alerts (apps/mobile/app/_layout.tsx around lines 710-740, apps/mobile/services/backgroundFetch) and the upload message 'Upload stopped in the background' (apps/mobile/src/features/chat/upload/uploadLifecycle.ts:52). app.config.js gates background tasks on v1Feature('dispatch'). No visible control or label for a chat turn continuing after the UI closes was found, so the Expected behaviour could not be tied to a screen. Code location in the plan is unverified.
- **Needs:** a device; a long-running turn started on the phone, then the app closed or sent to the background
