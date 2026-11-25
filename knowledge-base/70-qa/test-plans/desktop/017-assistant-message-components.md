---
id: "PLAN-desktop-017"
type: "test-plan"
title: "Desktop · 17. Assistant-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "17"
---
# Desktop · 17. Assistant-message components

31 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S17.01 Assistant/model identity.

- **Expected:** Assistant turns are distinguishable from the user's visually and to assistive tech, ideally naming the assistant/model (R-n).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2411; apps/web/features/chat/components/messages/MessageBubble.tsx:4127; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Any answer > the "More message actions" button (the three dots under the answer). The top of that menu shows which model answered. (labels found in the code)
- **Steps:**
  1. Send any question in a new chat and wait for the answer.
  2. Click the "More message actions" button under the answer.
  3. Look at the label at the top of the menu: it should name the model that answered, and the answer should look different from your own message.

## S17.02 Streaming answer body.

- **Expected:** The answer body renders incrementally as tokens arrive, with markdown formatting.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2884; apps/web/lib/hooks/useChatStream.ts:2573 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** no screen of its own. No single control; the streaming render is in MessageBubble.tsx and useChatStream.ts. Not verified in a browser.
- **Steps:**
  1. Send a question that needs a longer answer.
  2. Watch the answer area while it is being written.
  3. Check that text appears in pieces as it arrives and that markdown (bold, lists, code) is formatted once it shows.

## S17.03 Working indicator.

- **Expected:** While the assistant works and before/while text arrives, a visible (and announced) working indicator is shown.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/TypingIndicator.tsx:17; apps/web/features/chat/components/messages/ChatMessageList.tsx:2008; apps/web/features/chat/components/messages/ChatMessageList.tsx:2090; apps/web/features/chat/components/messages/ChatMessageList.tsx:1350
- **Where to find it:** no screen of its own. The announced status is set in ChatMessageList.tsx; I did not confirm the screen-reader announcement itself.
- **Steps:**
  1. Send a question and look at the answer area right away.
  2. Check for the "Preparing" or "Generating response…" text before text appears.

## S17.04 Reasoning-summary or activity-summary disclosure.

- **Expected:** An answer offers a collapsible summary of the model's reasoning and/or the work it did (steps, tools), expandable on demand.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3482; apps/web/features/chat/components/messages/MessageBubble.tsx:2664; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that has thinking > "Thought process" row (or "Thought for <time>") > click to expand. (path not confirmed in the code; trust the screen)
- **Needs:** a model that returns reasoning (which models do this depends on the plan)
- **Steps:**
  1. Use a model that shows reasoning and send a hard question.
  2. Find the "Thought process" row under or above the answer.
  3. Click the row and check that the reasoning text and step summary open, and that clicking again closes it.

## S17.05 Tool-activity section.

- **Expected:** Tool calls made for the answer appear in a tool-activity section with each tool's name, status and result.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2557; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that used a tool > "Used tools" section above the answer text ("Used N tools" when there are several). (labels found in the code)
- **Needs:** a prompt that makes the assistant call a tool
- **Steps:**
  1. Send a question that needs a tool, for example a question that needs a web search.
  2. Find the "Used tools" section on the answer.
  3. Open the section and check each tool's name, its status and its result.

## S17.06 Source citations.

- **Expected:** Claims in an answer carry citation markers that link to the sources the answer used.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2899; apps/web/features/chat/components/messages/MessageBubble.tsx:2887; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that used web sources > numbered citation markers in the text > click a marker. (labels found in the code)
- **Needs:** a prompt that triggers a web search
- **Steps:**
  1. Send a question that needs current web information.
  2. Find the small numbered markers inside the answer text.
  3. Click or hover a marker and check that it names the source and opens its link.

## S17.07 Sources footer.

- **Expected:** A finished answer that used sources ends with a sources footer/list the user can open.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3595; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** A finished answer that used sources > "View N sources" control at the end of the answer. (labels found in the code)
- **Needs:** a prompt that uses web sources
- **Steps:**
  1. Send a question that uses web sources and wait until the answer finishes.
  2. Find the "View N sources" control at the bottom of the answer.
  3. Click it and check that the source list opens and each source link can be opened.

## S17.08 Generated-file cards.

- **Expected:** Files the assistant produced appear as cards on the answer with name/type and open/download.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3171; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that produced a file > file card under the answer > "Download". (labels found in the code)
- **Needs:** a prompt that makes the assistant produce a file
- **Steps:**
  1. Ask the assistant for a file, for example a spreadsheet or a text document.
  2. Find the file card under the answer, with the file name and type.
  3. Click "Download" and check that the file saves with the name shown on the card.

## S17.09 Artifact launch cards.

- **Expected:** An answer that created an artifact shows a card that opens the artifact viewer/panel.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3207; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that created an artifact > "Open artifact: <title>" card under the answer > click it. (labels found in the code)
- **Needs:** a prompt that makes the assistant create an artifact
- **Steps:**
  1. Ask for a document, a code file or a web page.
  2. Find the artifact card under the answer.
  3. Click the card and check that the artifact panel opens with the artifact shown.

## S17.10 Image results.

- **Expected:** Images the assistant generated or returned render inline in the answer (viewable/downloadable).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3288; apps/web/features/chat/pages/WebChatPage.tsx:7759; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that generated an image > the image shows inline in the answer > open or download it from the image card. (path not confirmed in the code; trust the screen)
- **Needs:** a prompt that makes the assistant create an image
- **Steps:**
  1. Ask the assistant to create an image.
  2. Look for the image inline in the answer.
  3. Open or download the image from its card and check that it matches the picture shown.

## S17.12 Video results.

- **Expected:** Videos the assistant generated play inline in the answer with controls and download.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3444; apps/web/features/chat/pages/WebChatPage.tsx:7761; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Composer > switch to video generation (the video mode) > send a prompt > the video plays in the answer > "Download video". (labels found in the code)
- **Needs:** a plan and deployment that allow video generation
- **Steps:**
  1. Turn on video generation in the composer and type a short prompt.
  2. Send it and wait for the video to appear in the answer.
  3. Press the play control on the video, then click "Download video" and check that the video plays with controls and downloads.

## S17.13 Interactive widgets.

- **Expected:** Answers can contain interactive widgets (cards with choices, maps, actions) the user operates in place.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx (text found, layout changed); apps/web/features/chat/components/messages/MessageBubble.tsx (text found, layout changed); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that shows interactive blocks (cards with choices, tables, buttons) > operate them inside the answer. (path not confirmed in the code; trust the screen)
- **Needs:** a prompt that makes the assistant build interactive answer blocks
- **Steps:**
  1. Ask for options laid out as cards or a choice list, for example "show my options as cards with buttons".
  2. Find the cards in the answer.
  3. Click a choice or button and check that the answer responds in place.

## S17.14 Follow-up suggestions.

- **Expected:** After an answer the product offers relevant follow-up prompts the user can pick.
- **Code:** partial. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:1093
- **Known to be unfinished:** switch-on (deploy step 'follow-ups on'): change FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT to true at apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; generator and settings toggle are built
- **Where to find it:** Settings > General > "Show follow-up suggestions in chats" (switch on). (labels found in the code)
- **Needs:** a Free or paid account
- **Steps:**
  1. Open Settings and go to General.
  2. Turn on "Show follow-up suggestions in chats".
  3. Send a question, wait for the answer, and check that suggested follow-up prompts appear below it and can be clicked.

## S17.15 Copy plain text.

- **Expected:** One action copies the whole answer's text to the clipboard.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3751; apps/web/features/chat/components/messages/MessageBubble.tsx:1592 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Under any answer > the copy icon (tooltip "Copy"). (labels found in the code)
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Click the copy icon under the answer.
  3. Paste into a text app and check that the full answer text is pasted, and that the icon briefly changes to "Message copied".

## S17.17 Read aloud.

- **Expected:** An answer can be read aloud with text-to-speech from a control on the answer.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3046 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:1596 (quoted code not found in the file now); apps/web/lib/hooks/useTTS.ts:141 (quoted code not found in the file now)
- **Where to find it:** Under an answer > "More message actions" (three dots) > "Read message aloud". (labels found in the code)
- **Needs:** none (a speaker is needed to hear it)
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Click "More message actions" under the answer.
  3. Click "Read message aloud" and check that the answer is spoken.

## S17.18 Stop read-aloud playback.

- **Expected:** While an answer is being read aloud, the user can stop playback from the same place.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3982; apps/web/features/chat/components/messages/ChatMessageList.tsx:1250
- **Where to find it:** Under an answer > "More message actions" > "Stop reading message" (shown while the answer is being read aloud). (labels found in the code)
- **Needs:** none (a speaker is needed to hear it)
- **Steps:**
  1. Start read-aloud as in S17.17.
  2. While it speaks, click "More message actions" under the answer again.
  3. Click "Stop reading message" and check that the speech stops.

## S17.19 Regenerate answer.

- **Expected:** A completed answer can be regenerated in place, producing a new attempt for the same prompt.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3884; apps/web/features/chat/pages/WebChatPage.tsx:5704; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Under a finished answer > the regenerate icon (tooltip "Regenerate"); with several models available it opens a menu with "Try again". (labels found in the code)
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Click the regenerate icon under the answer (aria "Regenerate response").
  3. Check that a new attempt replaces the answer and that the variant pager (see S17.28) now shows two attempts.

## S17.20 Retry failed answer.

- **Expected:** A failed answer shows a Retry control that re-runs the turn and replaces the failure with the new outcome.
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:6207; apps/web/lib/hooks/useChatStream.ts:6214; apps/web/lib/hooks/useChatStream.ts:5123
- **Where to find it:** A failed answer > "Retry" button on the notice under it (aria "Retry this response"). (labels found in the code)
- **Needs:** a way to make a turn fail, such as a dropped connection
- **Steps:**
  1. Make an answer fail, for example by losing the connection during a send or by a refusal notice.
  2. Find the "Retry" button on the failure notice.
  3. Click "Retry" and check that the failure is replaced by a new answer for the same question.

## S17.21 Continue truncated answer.

- **Expected:** An answer cut off by the output limit offers Continue, which resumes the same answer.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:1944; apps/web/features/chat/components/messages/ChatMessageList.tsx:1356; apps/web/features/chat/pages/WebChatPage.tsx:7742
- **Where to find it:** An answer cut off by the length limit > "Continue generating" button under the answer. (labels found in the code)
- **Needs:** a prompt long enough to reach the output limit
- **Steps:**
  1. Ask for a very long answer, for example a long report.
  2. Wait for the answer to stop part way.
  3. Click "Continue generating" and check that the same answer carries on from where it stopped.

## S17.22 Rewrite with another model.

- **Expected:** From an answer, the user can regenerate it with a different model in one step.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3895; apps/web/features/chat/pages/WebChatPage.tsx:4580 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Under a finished answer > regenerate icon ("Regenerate") > "Try again with" > choose a model. (labels found in the code)
- **Needs:** an account with more than one model available
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Open the regenerate menu under the answer.
  3. Choose a model under "Try again with" and check that a new attempt from that model replaces or joins the answer.

## S17.27 Branch from answer.

- **Expected:** From any answer, the user can branch a new conversation that keeps history up to that point and leaves the original unchanged.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3932; apps/web/features/chat/pages/WebChatPage.tsx:7752; apps/web/features/chat/hooks/use-conversation-branches.ts:69
- **Where to find it:** Under an answer > the branch icon (tooltip "Branch conversation: this chat stays unchanged"); also in "More message actions" on your own messages. (labels found in the code)
- **Needs:** a conversation with several messages
- **Steps:**
  1. Have a conversation with at least two exchanges.
  2. Click the branch icon under an earlier answer.
  3. Check that a new conversation opens with history up to that answer, and that the original conversation is unchanged.

## S17.28 Navigate answer variants.

- **Expected:** When an answer has several attempts, the user can page between them (e.g. '2 of 3').
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:994; apps/web/features/chat/pages/WebChatPage.tsx:7755; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Under an answer that has several attempts > the pager "Previous response" / "Next response" with the position text "Response 2 of 3". (labels found in the code)
- **Needs:** an answer with at least two attempts
- **Steps:**
  1. Regenerate an answer (see S17.19) so it has two attempts.
  2. Find the pager under the answer, which shows the position.
  3. Click the next and previous buttons and check the answer changes and the text reads "Response N of M".

## S17.29 Positive feedback.

- **Expected:** A thumbs-up on an answer records positive feedback tied to that message.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3777; apps/web/features/chat/components/messages/MessageBubble.tsx:1022 (quoted code not found in the file now); apps/web/features/chat/components/messages/MessageBubble.tsx:976 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Under a finished answer > thumbs-up icon (aria "Good response"; tooltip "Good response", or "Remove rating" once rated). (labels found in the code)
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Click the thumbs-up icon under the answer.
  3. Check that the icon shows as selected with tooltip "Remove rating", and that clicking again removes the rating.

## S17.30 Negative feedback.

- **Expected:** A thumbs-down on an answer records negative feedback tied to that message.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3806; apps/web/features/chat/components/messages/MessageBubble.tsx:1022 (quoted code not found in the file now); apps/web/features/chat/components/messages/MessageBubble.tsx:976 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Under a finished answer > thumbs-down icon (aria "Bad response"; tooltip "Bad response", or "Remove rating" once rated). (labels found in the code)
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Click the thumbs-down icon under the answer.
  3. Check the rating is recorded on that answer (selected icon, tooltip "Remove rating") and, if the details panel opens, that it can be filled in.

## S17.31 Report answer.

- **Expected:** An answer can be reported (e.g. harmful/incorrect) to the trust-and-safety intake from the answer itself.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4072; apps/web/features/chat/components/messages/MessageBubble.tsx:1174; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Under an answer > "More message actions" (three dots) > "Report this response". (labels found in the code)
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Click "More message actions" under the answer.
  3. Click "Report this response" and check the menu item changes to "Reporting…" then "Reported", with the toast "Reported. Thank you: our trust and safety team will review it."

## S17.32 Share answer or conversation.

- **Expected:** The user can share an answer or the conversation (link or system share sheet).
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7502; apps/web/features/chat/pages/WebChatPage.tsx:7916; apps/web/features/chat/hooks/use-share-conversation.ts:177 (quoted code not found in the file now)
- **Where to find it:** Open a chat that has messages > top bar "Share" button (its label is "Share conversation") > dialog titled "Share conversation". For one answer: hover the answer > "More message actions" > "Share answer". (labels found in the code)
- **Needs:** a signed-in account with a chat that has messages
- **Steps:**
  1. Sign in and open a chat that already has at least one question and answer.
  2. Click the "Share" button in the top bar (on narrow windows only the icon shows; hover it to read "Share conversation").
  3. In the "Share conversation" dialog, read the text and look for a link or workspace option that can be copied or shared.
  4. To share one answer: hover the answer, click "More message actions", then click "Share answer".
  5. Compare: the conversation dialog opens with its own title and a shareable link; the answer action opens the system share sheet, or shows "This answer could not be shared" if it fails.

## S17.36 Actual-model and usage details.

- **Expected:** For each answer the user can see which model actually answered and its usage (tokens/cost/time).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4079; apps/web/features/chat/components/messages/MessageBubble.tsx:4127; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Hover an answer > "More message actions" > the usage block at the bottom of the menu (tokens and time). The model name shows under "Sent at" in the answer header. (labels found in the code)
- **Needs:** a signed-in account and a finished answer
- **Steps:**
  1. Sign in, send a message and wait until the answer has finished.
  2. Hover the answer and click "More message actions".
  3. Scroll to the bottom of the menu and read the token usage block and the duration line.
  4. Look at the answer header: find the "Sent at" time and read the model name shown just below it.
  5. Compare: the menu shows usage for that answer and the header names the model that answered.

## S17.37 Partial-result state.

- **Expected:** When an answer fails after producing some output, the partial output is kept and visibly marked incomplete, with the reason.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:117; apps/web/features/chat/components/messages/ChatMessageList.tsx:1817; apps/web/features/chat/components/messages/MessageBubble.tsx:2700
- **Where to find it:** no screen of its own. The network-drop step is an untested guess at a trigger; the code shows the reason text but not which failure produces it.
- **Needs:** a signed-in account and a way to drop the connection during an answer
- **Steps:**
  1. Start a long answer.
  2. While text is still arriving, interrupt the connection (for example turn off Wi-Fi briefly).
  3. Look under the partly written answer for a row starting "Response failed:" followed by the reason.
  4. Compare: the text that arrived stays visible above the row and the row gives the reason it stopped.

## S17.38 Refusal state.

- **Expected:** When the model/safety layer refuses, the answer shows a distinct refusal state (not a generic error or a normal answer), with a next step.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:1971; apps/web/features/chat/components/messages/ChatMessageList.tsx:1402
- **Where to find it:** Send a prompt the model refuses; the notice "The model declined to finish this response for safety reasons." appears under the last answer, with a "Retry" action. (labels found in the code)
- **Needs:** a signed-in account; a refusal cannot be forced on demand
- **Steps:**
  1. Sign in and send a prompt that the safety layer is likely to refuse.
  2. When the answer ends, look under it for the notice "The model declined to finish this response for safety reasons."
  3. Read the "Retry" action and the report/appeal control next to it (its text was not found in the code).
  4. Compare: the refusal is shown as its own notice, not as a normal answer or a generic error.

## S17.39 Interrupted state.

- **Expected:** An answer the user stopped (or that was interrupted) is marked as stopped, keeps what arrived, and offers to try again.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ChatMessageList.tsx:1957; apps/web/features/chat/components/messages/ChatMessageList.tsx:1207 (quoted code not found in the file now)
- **Where to find it:** Send a message, then press the stop control while the answer is still being written. The notice "Response stopped." appears with a "Try again" button. (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Sign in, send a message that gives a long answer.
  2. While the answer is still being written, press the stop control in the message box.
  3. Look for the notice "Response stopped." under the partial answer and keep the text that arrived.
  4. Click "Try again" and compare: a new attempt for the same question replaces the stopped one.

## S17.40 Empty-output error state.

- **Expected:** A turn that returns nothing shows an explicit 'no response' error with retry, not an empty bubble.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:120; apps/web/lib/hooks/useChatStream.ts:1713; apps/web/features/chat/components/messages/MessageBubble.tsx:2700
- **Where to find it:** Only when a reply comes back empty: a row starting "Response failed:" with the reason "no response was returned." and a "Retry" action, shown in place of an empty bubble. (labels found in the code)
- **Needs:** a signed-in account; an empty reply cannot be forced on demand
- **Steps:**
  1. Sign in and send a message.
  2. If the reply comes back empty, look for a row starting "Response failed:" under the question.
  3. Read the reason "no response was returned." and the "Retry" action beside it.
  4. Compare: there is no empty answer bubble, and Retry sends the turn again.
