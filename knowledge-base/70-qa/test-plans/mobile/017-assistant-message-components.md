---
id: "PLAN-mobile-017"
type: "test-plan"
title: "Mobile · 17. Assistant-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "17"
---
# Mobile · 17. Assistant-message components

31 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S17.01 Assistant/model identity.

- **Expected:** Assistant turns are distinguishable from the user's visually and to assistive tech, ideally naming the assistant/model (R-n).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1129; apps/mobile/src/features/chat/components/MessageBubble.tsx:676 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > send a message and let the answer finish > read the line under the answer (provider · model) (labels found in the code)
- **Steps:**
  1. Open the Chat tab and send any message.
  2. Wait until the answer stops streaming.
  3. Look at the line under the answer: it shows the provider and model name.
  4. Compare with your own message: your message is not labelled this way and the answer is.
  5. Optional: the action button under the answer is named 'More message actions for <model name>' for screen readers (VoiceOver/TalkBack).

## S17.02 Streaming answer body.

- **Expected:** The answer body renders incrementally as tokens arrive, with markdown formatting.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:861 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2534 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > send a message > watch the answer text appear (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Open the Chat tab and send a message that needs a long answer, such as 'Write five paragraphs about rivers'.
  2. Watch the answer area while the reply is produced.
  3. Check that text grows word by word, not all at once.
  4. Check that headings, bold text and lists look formatted when they arrive.

## S17.03 Working indicator.

- **Expected:** While the assistant works and before/while text arrives, a visible (and announced) working indicator is shown.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/StreamingIndicator.tsx:4 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:861 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > send a message > a working indicator appears above the answer (labels found in the code)
- **Steps:**
  1. Send a message in the Chat tab.
  2. Before the first words appear, look for the working indicator.
  3. Check that it is shown and disappears or changes when text arrives.
  4. Optional: with a screen reader, the indicator is announced as 'Generating response'.

## S17.04 Reasoning-summary or activity-summary disclosure.

- **Expected:** An answer offers a collapsible summary of the model's reasoning and/or the work it did (steps, tools), expandable on demand.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2177; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > send a message to a model that supports thinking > tap the thinking chip above the answer labelled 'Show reasoning' (labels found in the code)
- **Needs:** a model that supports thinking
- **Steps:**
  1. Pick a model that supports reasoning (see the model list) and send a message.
  2. Look above the answer for the thinking chip showing 'Thinking for' and a time.
  3. Tap the chip (screen-reader name 'Show reasoning').
  4. Check that a sheet opens with the reasoning steps.
  5. Tap 'Dismiss reasoning' to close it.

## S17.05 Tool-activity section.

- **Expected:** Tool calls made for the answer appear in a tool-activity section with each tool's name, status and result.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2432; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > send a message that uses a tool (for example web search) > tap the tool activity row under the answer (labels found in the code)
- **Needs:** a Cloud or tool-enabled account (tools must be available)
- **Steps:**
  1. Send a question that makes the assistant use a tool, such as a web search.
  2. When the answer is done, find the tool activity row above or under the answer.
  3. Tap the row to open the tool timeline.
  4. Check each tool name, its status (for example completed or failed) and the result.
  5. Tap a tool step to view its full output (screen-reader name 'View full output for <tool>').

## S17.06 Source citations.

- **Expected:** Claims in an answer carry citation markers that link to the sources the answer used.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1003 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > ask a question that needs web sources > tap a numbered citation marker in the answer (labels found in the code)
- **Needs:** a web-search capable account
- **Steps:**
  1. Ask a question that needs current web information, such as 'What is the latest version of Node.js?'
  2. Wait for the answer; look for small numbered markers in the text.
  3. Tap a marker.
  4. Check that it opens or highlights the matching source (screen-reader name 'Source <number>: <title>').

## S17.07 Sources footer.

- **Expected:** A finished answer that used sources ends with a sources footer/list the user can open.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1003 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:2753; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > finished answer that used sources > tap the 'Sources' row under the answer (labels found in the code)
- **Needs:** a web-search capable account
- **Steps:**
  1. Send a question that uses sources (see S17.06) and wait for the answer to finish.
  2. Look under the answer for a row titled 'Sources'.
  3. Tap the row to expand it.
  4. Check that each source shows its title and host name.
  5. Tap a source to open it.

## S17.08 Generated-file cards.

- **Expected:** Files the assistant produced appear as cards on the answer with name/type and open/download.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:1247; apps/mobile/src/features/chat/components/MessageBubble.tsx:2807; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Cloud chat > ask for a file (for example a PDF) > tap the file card on the answer (path not confirmed in the code; trust the screen)
- **Needs:** a Cloud account
- **Steps:**
  1. Switch to Cloud mode and ask the assistant to create a file.
  2. Wait for the answer to finish.
  3. Look for a file card attached to the answer with the file name.
  4. Tap the card to open it, or use its open control (screen-reader name 'Open <session label>').
  5. Check the file name and type on the card.

## S17.09 Artifact launch cards.

- **Expected:** An answer that created an artifact shows a card that opens the artifact viewer/panel.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2810; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > ask for a document or code > tap the artifact card under the answer (labels found in the code)
- **Steps:**
  1. Ask for a document, for example 'Write a one-page project plan as a document'.
  2. Wait for the answer; look for a card on the answer with a type label.
  3. Tap the card.
  4. Check that the artifact viewer or panel opens with the content.
  5. Close the viewer and check the card is still there.

## S17.10 Image results.

- **Expected:** Images the assistant generated or returned render inline in the answer (viewable/downloadable).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2534; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > ask for an image > tap the image in the answer (opens full screen) > use 'Save to Photos' or 'Share image' (labels found in the code)
- **Needs:** an account that can generate images
- **Steps:**
  1. Ask the assistant to make an image, for example 'Draw a red bicycle on a beach'.
  2. Wait for the image to appear inside the answer.
  3. Tap the image to open it full screen.
  4. Use 'Save to Photos', 'Copy image' or 'Share image' from its menu.
  5. Check that the image saves or shares and matches the picture on the answer.

## S17.12 Video results.

- **Expected:** Videos the assistant generated play inline in the answer with controls and download.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2596; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab > ask for a video > the video plays inside the answer; if generation fails, tap 'Retry video generation' (labels found in the code)
- **Needs:** an account that can generate video
- **Steps:**
  1. Ask the assistant to make a short video.
  2. Wait for the answer; look for the video inside it.
  3. Press play and check that the controls work.
  4. Look for a download control on the video.
  5. If generation fails, tap 'Retry video generation' and compare the result with the first attempt.

## S17.13 Interactive widgets.

- **Expected:** Answers can contain interactive widgets (cards with choices, maps, actions) the user operates in place.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2459; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Chat tab in Cloud mode > ask for a place or a choice > use the card in the answer (labels found in the code)
- **Needs:** a Cloud account
- **Steps:**
  1. Switch to Cloud mode.
  2. Ask a question that returns a card, for example a place search or a choice.
  3. Look for the card inside the answer.
  4. Read the caption under a map card: 'Opens a provider search. Confirm the place before navigating.'
  5. Tap a choice or action on the card and check the result.

## S17.15 Copy plain text.

- **Expected:** One action copies the whole answer's text to the clipboard.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1149 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Under a finished answer > tap the copy icon (screen-reader name 'Copy') > paste somewhere else (labels found in the code)
- **Steps:**
  1. Open a finished answer.
  2. Tap the copy icon in the row under the answer.
  3. Check that the icon or label changes to 'Copied'.
  4. Paste into the message box or Notes.
  5. Compare the pasted text with the whole answer.

## S17.17 Read aloud.

- **Expected:** An answer can be read aloud with text-to-speech from a control on the answer.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:3168; apps/mobile/src/features/chat/components/MessageBubble.tsx:427 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Under a finished answer > tap the speaker icon (screen-reader name 'Read aloud') (labels found in the code)
- **Needs:** a sound output (speaker or headphones)
- **Steps:**
  1. Open a finished answer.
  2. Find the speaker icon in the row under the answer.
  3. Tap it.
  4. Listen for the answer being read aloud.
  5. Compare the spoken text with the answer.

## S17.18 Stop read-aloud playback.

- **Expected:** While an answer is being read aloud, the user can stop playback from the same place.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:3169; apps/mobile/src/features/chat/components/MessageBubble.tsx:427 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Under an answer that is being read aloud > tap the stop icon (screen-reader name 'Stop reading aloud') (labels found in the code)
- **Needs:** a sound output
- **Steps:**
  1. Start Read aloud on an answer (see S17.17).
  2. While it is speaking, find the same control; its icon changes to a square.
  3. Tap it (name 'Stop reading aloud').
  4. Check that the speech stops at once.
  5. Check that the control returns to the speaker icon.

## S17.19 Regenerate answer.

- **Expected:** A completed answer can be regenerated in place, producing a new attempt for the same prompt.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:3180; apps/mobile/app/(app)/chat/[id].tsx:1085 (quoted code not found in the file now); apps/mobile/stores/chat/chatExecutionStore.ts:2931 (quoted code not found in the file now)
- **Where to find it:** Under a finished answer > tap the refresh icon (screen-reader name 'Regenerate response') (labels found in the code)
- **Steps:**
  1. Open a finished answer with no unsaved edits.
  2. Tap the refresh icon in the row under the answer.
  3. If a warning appears about unsaved edits, read it and choose to continue or cancel.
  4. Wait for a new answer to the same question.
  5. Compare the new answer with the old one and check the page shows '2 / 2' style paging.

## S17.20 Retry failed answer.

- **Expected:** A failed answer shows a Retry control that re-runs the turn and replaces the failure with the new outcome.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1045 (quoted code not found in the file now); apps/mobile/app/(app)/chat/[id].tsx:1982
- **Where to find it:** A failed answer > the red failure notice under the answer > tap 'Retry' (labels found in the code)
- **Needs:** a way to make a turn fail (for example going offline)
- **Steps:**
  1. Trigger a failed answer (for example by going offline before sending, then reconnecting, or use a turn that fails).
  2. Read the red failure notice under the answer.
  3. Tap 'Retry' in the notice (hint 'Tap to try again').
  4. Wait for the new attempt.
  5. Check the failure notice is replaced by the new answer or a new outcome.

## S17.21 Continue truncated answer.

- **Expected:** An answer cut off by the output limit offers Continue, which resumes the same answer.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/utils/continuableAnswer.ts:36; apps/mobile/stores/chat/chatExecutionStore.ts:3897 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:2966
- **Where to find it:** A cut-off answer > tap 'Continue generating' under the answer (labels found in the code)
- **Steps:**
  1. Ask for a very long answer, for example 'Write a 3000-word story'.
  2. When it stops mid-sentence, look below the answer.
  3. Tap 'Continue generating'.
  4. Check that the same answer continues from where it stopped and is not a new answer.
  5. Check the button disappears when the answer is complete.

## S17.22 Rewrite with another model.

- **Expected:** From an answer, the user can regenerate it with a different model in one step.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:1664
- **Where to find it:** Long-press a finished answer > 'Retry with Another Model' (or the dots button 'More message actions for <model>' > 'Retry with Another Model') (labels found in the code)
- **Needs:** a second model available to the account
- **Steps:**
  1. Open a finished answer.
  2. Long-press the answer text, or tap the dots button under it.
  3. Tap 'Retry with Another Model' in the list.
  4. Pick a different model in the model picker that opens.
  5. Check that a new answer comes from the new model and the model name under it changes.

## S17.26 Revise selected text.

- **Expected:** The user can select part of an answer and ask for that span to be revised or asked about.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/SelectTextSheet.tsx:123
- **Where to find it:** Long-press a finished answer > 'Select Text' > select words > 'Quote in reply' (labels found in the code)
- **Steps:**
  1. Open a finished answer and long-press it.
  2. Tap 'Select Text'.
  3. Select part of the text in the box that opens.
  4. Read the line that shows your selection.
  5. Tap 'Quote in reply' and check the quote appears in the message box.

## S17.28 Navigate answer variants.

- **Expected:** When an answer has several attempts, the user can page between them (e.g. '2 of 3').
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:3133
- **Where to find it:** Under an answer that has more than one attempt > the pager between the copy and read-aloud icons (shows '2 / 3' style) (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Regenerate an answer at least twice (see S17.19).
  2. Find the pager under the answer, showing a count such as '2 / 3'.
  3. Tap the left arrow (screen-reader name 'Previous response') and then the right arrow ('Next response').
  4. Check the answer text changes to each attempt and the count updates.
  5. Check the arrow is disabled at the first and last attempt.

## S17.29 Positive feedback.

- **Expected:** A thumbs-up on an answer records positive feedback tied to that message.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1188 (quoted code not found in the file now); apps/mobile/stores/chat/chatMessageStore.ts:597 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Long-press a finished answer > 'Good Response'; or double-tap the answer (labels found in the code)
- **Steps:**
  1. Open a finished answer and long-press it.
  2. Tap 'Good Response'.
  3. Check the menu now offers 'Remove Good Response' for that answer.
  4. Close and reopen the menu to confirm the state is kept.
  5. Optional: double-tap the answer text; it also records a good response.

## S17.30 Negative feedback.

- **Expected:** A thumbs-down on an answer records negative feedback tied to that message.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1194 (quoted code not found in the file now); apps/mobile/stores/chat/chatMessageStore.ts:597 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Long-press a finished answer > 'Bad Response' (labels found in the code)
- **Steps:**
  1. Open a finished answer and long-press it.
  2. Tap 'Bad Response'.
  3. Check the menu now offers 'Remove Bad Response' for that answer.
  4. Reopen the menu and check the state is kept.
  5. Compare with the good response state: only one should be chosen at a time.

## S17.31 Report answer.

- **Expected:** An answer can be reported (e.g. harmful/incorrect) to the trust-and-safety intake from the answer itself.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1126 (quoted code not found in the file now); apps/mobile/src/features/chat/components/ReportFlagButton.tsx:32; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Long-press a finished answer > 'Report…' > choose a category > send (some labels not found in the code; trust the screen)
- **Steps:**
  1. Open a finished answer and long-press it.
  2. Tap 'Report…'.
  3. Read the sheet title 'Report this response'.
  4. Choose a category and add a note, then send.
  5. Check the result text, such as 'Report submitted for review' or 'Report saved on this device'.

## S17.32 Share answer or conversation.

- **Expected:** The user can share an answer or the conversation (link or system share sheet).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1172 (quoted code not found in the file now); apps/mobile/src/features/chat/components/FileExportButton.tsx:112; apps/mobile/src/features/chat/components/MessageList.tsx:377
- **Where to find it:** Long-press a finished answer > 'Export Message…' > 'Share Text' or 'Share...'; for the whole chat: chat menu > 'Share link' (labels found in the code)
- **Steps:**
  1. Open a finished answer and long-press it, then tap 'Export Message…'.
  2. In the sheet, tap 'Share Text' to send the answer as text, or 'Share...' to export as PDF and open the system share sheet.
  3. Check the system share sheet appears with the content.
  4. For the whole conversation, open the chat's menu and tap 'Share link' (menu button not confirmed by label).
  5. Compare the shared content with the answer.

## S17.35 Export answer.

- **Expected:** A single answer can be exported to a file (e.g. PDF, Markdown, text).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/FileExportButton.tsx:39; apps/mobile/src/features/chat/components/FileExportButton.tsx:111; apps/mobile/src/features/chat/components/MessageBubble.tsx:3259
- **Where to find it:** Long-press the answer, or tap the "More message actions" icon under it > Export Message… > Export as PDF / Export as Text (labels found in the code)
- **Needs:** a finished assistant answer with text
- **Steps:**
  1. Sign in and get a finished answer from the assistant that has text in it.
  2. Long-press the answer, or tap the three-dot icon under it (its label starts "More message actions").
  3. Tap "Export Message…" in the menu. A sheet titled "Export Message" opens.
  4. Tap "Export as PDF". A share sheet opens with a PDF of the answer.
  5. Reopen the sheet and tap "Export as Text". Check that a plain text file is offered to share, then compare with Expected.

## S17.36 Actual-model and usage details.

- **Expected:** For each answer the user can see which model actually answered and its usage (tokens/cost/time).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:618
- **Where to find it:** Sign in > send a message in a chat > wait for the answer to finish > look at the small grey lines under the answer (labels found in the code)
- **Steps:**
  1. Sign in and open a new chat.
  2. Send a short question and wait until the answer stops streaming.
  3. Look at the small grey line under the answer. It shows a token count and a time, for example "N tokens · 2.3s".
  4. Look at the line below it. It shows the provider and model that answered, separated by " · ".
  5. Compare with Expected. The code shows tokens and time only; no cost figure is shown.

## S17.37 Partial-result state.

- **Expected:** When an answer fails after producing some output, the partial output is kept and visibly marked incomplete, with the reason.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/utils/messageStreamError.ts:68; apps/mobile/src/features/chat/utils/messageStreamError.ts:181; apps/mobile/src/features/chat/components/MessageBubble.tsx:2155
- **Where to find it:** Sign in > send a long question in a chat > if the answer stops with a provider error after some text, look under the partial text for the notice "Response may be incomplete" with "Retry" (labels found in the code)
- **Needs:** a way to make the provider fail partway through an answer; no button triggers this
- **Steps:**
  1. Sign in and open a new chat.
  2. Send a prompt that gets a long answer.
  3. If the answer stops partway with an error, the partial text stays on screen.
  4. Look directly under the partial text for a red-tinted box that starts "Response may be incomplete" and includes the provider's error detail.
  5. If the box shows "Retry", tap it and check that the answer is re-run. Compare with Expected.

## S17.38 Refusal state.

- **Expected:** When the model/safety layer refuses, the answer shows a distinct refusal state (not a generic error or a normal answer), with a next step.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:530
- **Where to find it:** Sign in > send a message in a chat > if the model declines, look under the answer for the notice "The model declined to finish this response for safety reasons." with "Switch model" and "Report" (labels found in the code)
- **Needs:** a model that declines a message; the tester cannot choose this on purpose
- **Steps:**
  1. Sign in and open a new chat.
  2. Send a message that the model is expected to decline.
  3. When the answer shows the refusal, look for the box under it with the shield icon and the words "The model declined to finish this response for safety reasons."
  4. Tap "Switch model" to check that it offers another model, or tap "Report" to check that the feedback screen opens.
  5. Compare with Expected: a separate refusal box, not a generic error or a normal answer.

## S17.39 Interrupted state.

- **Expected:** An answer the user stopped (or that was interrupted) is marked as stopped, keeps what arrived, and offers to try again.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:2931
- **Where to find it:** Sign in > send a long question in a chat > tap "Stop generating" while the answer is streaming > look at the answer (labels found in the code)
- **Steps:**
  1. Sign in and open a new chat.
  2. Send a question that gives a long answer.
  3. While the answer is still streaming, tap the send button, which changes to "Stop generating".
  4. Look under the partial answer for the notice "Response stopped." Kept text stays on screen.
  5. If no text had arrived, tap "Try again" to check that the turn is re-run. Compare with Expected.

## S17.40 Empty-output error state.

- **Expected:** A turn that returns nothing shows an explicit 'no response' error with retry, not an empty bubble.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/utils/messageStreamError.ts:62; apps/mobile/stores/chat/chatExecutionStore.ts:3799
- **Where to find it:** Sign in > send a message in a chat > if the model returns nothing, look under the answer area for the notice "The model finished without returning a response. Try again." (labels found in the code)
- **Needs:** a provider that returns an empty stream; no button triggers this
- **Steps:**
  1. Sign in and open a new chat.
  2. Send a message and wait for the turn to end.
  3. If the turn ends with no text, no tool output and no files, look for the box with the text "The model finished without returning a response. Try again."
  4. Tap the box, which is labelled "Tap to try again." for screen readers, and check that the turn is re-run.
  5. Compare with Expected: an explicit message with retry, not an empty bubble.
