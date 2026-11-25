---
id: "PLAN-web-017"
type: "test-plan"
title: "Web · 17. Assistant-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "17"
---
# Web · 17. Assistant-message components

31 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S17.01 Assistant/model identity.

- **Expected:** Assistant turns are distinguishable from the user's visually and to assistive tech, ideally naming the assistant/model (R-n).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2411; apps/web/features/chat/components/messages/MessageBubble.tsx:4127; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Earlier check in the running app:** PASS: E040 [PASS; live generated answer]: Follow-up on (model name).8-max-0902 returned exact LIVE_QA_20260926_OK; served route labeled via free pool. Renamed own conversation Browser QA, Chat and rendering. The earlier Retry click on failed activity did not visibly restart a request; fresh send succeeded. Sources panel opens empty, no research performed.
- **Where to find it:** Any answer in a chat > hover over the answer's bottom line (the small model name text, for example 'Auto chose ...' when Auto picked the model) (labels found in the code)
- **Needs:** a sent answer in a chat
- **Steps:**
  1. Sign in and open a chat that already has an answer, or send one question and wait for the answer.
  2. Move the mouse over the answer's bottom action line, under the answer text.
  3. Look for the small model text that appears on hover, for example 'Auto chose ...' or the model name, and compare with Expected: the answer is distinguishable from your message and names the model.

## S17.02 Streaming answer body.

- **Expected:** The answer body renders incrementally as tokens arrive, with markdown formatting.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:2884; apps/web/lib/hooks/useChatStream.ts:2573 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Earlier check in the running app:** BLOCKED: E039 [BLOCKED; default route overload]: Ordinary new chat has no Project chip or repeated training banner. OpenRouter Free Auto failed visibly with overloaded-upstream explanation and Retry. No assistant text generated.
- **Where to find it:** no screen of its own. Streaming is inner behaviour; the code that renders incrementally is in StreamingMarkdownContent. Whether it actually streams depends on the model route.
- **Needs:** a working model route that returns text
- **Steps:**
  1. Send any question in a chat.
  2. Watch the answer area below your message while the reply is generated.
  3. Check that the text grows piece by piece and that bold, lists and code blocks show as formatted text, as Expected says.

## S17.03 Working indicator.

- **Expected:** While the assistant works and before/while text arrives, a visible (and announced) working indicator is shown.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/TypingIndicator.tsx:17; apps/web/features/chat/components/messages/ChatMessageList.tsx:2008; apps/web/features/chat/components/messages/ChatMessageList.tsx:2090; apps/web/features/chat/components/messages/ChatMessageList.tsx:1350
- **Earlier check in the running app:** PASS: E036 [PASS; send and generating UI]: Model changed to an available free-pool route; sent project context question; user message persisted into new chat and Thinking state appeared. Project chip correctly names selected project.
- **Where to find it:** New chat > type a message > Send, then look below your message for 'Preparing' (labels found in the code)
- **Needs:** a working model route
- **Steps:**
  1. Open a new chat and type any question.
  2. Press Send.
  3. Look just below your message for a spinning mark with the word 'Preparing', and for the status phrase 'Generating response' (announced to screen readers only).
  4. Compare with Expected: a visible working indicator appears before or while the text arrives.

## S17.04 Reasoning-summary or activity-summary disclosure.

- **Expected:** An answer offers a collapsible summary of the model's reasoning and/or the work it did (steps, tools), expandable on demand.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3482; apps/web/features/chat/components/messages/MessageBubble.tsx:2664; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** A reasoning-capable answer > under the answer, click 'Thinking process (N steps)' (labels found in the code)
- **Needs:** a model that returns thinking steps
- **Steps:**
  1. Send a question to a model that produces reasoning (choose a reasoning model in the model picker).
  2. When the answer finishes, look under it for a row starting with 'Thinking process'.
  3. Click the row to expand it.
  4. Compare with Expected: a collapsible list of the reasoning steps appears and collapses again on a second click.

## S17.05 Tool-activity section.

- **Expected:** Tool calls made for the answer appear in a tool-activity section with each tool's name, status and result.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2557; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that used a tool > click the tool timeline row under the answer (labels found in the code)
- **Needs:** a request that makes the assistant use a tool
- **Steps:**
  1. Send a question that makes the assistant use a tool (for example a web search or a file tool).
  2. When the answer finishes, look for the tool timeline row under the answer.
  3. Click the row (its toggle is labelled 'Toggle tool timeline') to expand it.
  4. Compare with Expected: each tool's name, status and result appear inside.

## S17.06 Source citations.

- **Expected:** Claims in an answer carry citation markers that link to the sources the answer used.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2899; apps/web/features/chat/components/messages/MessageBubble.tsx:2887; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that used web search > click a numbered citation marker in the answer text (labels found in the code)
- **Needs:** web search or project files that produce citations
- **Steps:**
  1. Send a question that needs current information, such as a news question, with web search on.
  2. When the answer finishes, look for small numbered markers in the answer text.
  3. Click one marker.
  4. Compare with Expected: it opens or points to the source the claim came from.

## S17.07 Sources footer.

- **Expected:** A finished answer that used sources ends with a sources footer/list the user can open.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3595; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that used web search > the row under the answer > 'Show sources' button (tooltip 'Sources') (labels found in the code)
- **Needs:** a request that uses web search
- **Steps:**
  1. Send a question that uses web search and wait for the answer to finish.
  2. Look at the row under the answer, at the right side.
  3. Click the button labelled 'Show sources' (its tooltip says 'Sources').
  4. Compare with Expected: a list of the sources used opens and can be read and opened.

## S17.08 Generated-file cards.

- **Expected:** Files the assistant produced appear as cards on the answer with name/type and open/download.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3171; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that produced a file > the file card under the answer > 'Download generated file' (labels found in the code)
- **Needs:** a request that creates a file
- **Steps:**
  1. Ask AGI to create a file, for example a document.
  2. When the answer finishes, look for a file card under the answer, grouped with the label 'Files this session produced'.
  3. Click 'Download generated file' on the card (or 'Share generated file').
  4. Compare with Expected: the card shows the file name and type, and the download works.

## S17.09 Artifact launch cards.

- **Expected:** An answer that created an artifact shows a card that opens the artifact viewer/panel.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3207; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that created a web page, React component or SVG > click the artifact card under the answer (some labels not found in the code; trust the screen)
- **Needs:** a request that creates an artifact
- **Steps:**
  1. Ask for something that creates an artifact, for example a small web page or an SVG drawing.
  2. When the answer finishes, look for the card group labelled 'Artifacts' under the answer.
  3. Click one card.
  4. Compare with Expected: the artifact opens in the artifact panel or viewer.

## S17.10 Image results.

- **Expected:** Images the assistant generated or returned render inline in the answer (viewable/downloadable).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3288; apps/web/features/chat/pages/WebChatPage.tsx:7759; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that generated an image > click the image card in the answer > 'Download' (image card button labelled 'Download image') (labels found in the code)
- **Needs:** an account and model route that can generate images
- **Steps:**
  1. Ask for an image, for example 'draw a red bicycle'.
  2. Wait for the card labelled 'Generating image' to finish.
  3. Click the image to open it, then use the 'Download' control.
  4. Compare with Expected: the image shows inline in the answer and downloads.

## S17.12 Video results.

- **Expected:** Videos the assistant generated play inline in the answer with controls and download.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3444; apps/web/features/chat/pages/WebChatPage.tsx:7761; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer that generated a video > the video player in the answer > 'Download video' (labels found in the code)
- **Needs:** an account with video generation
- **Steps:**
  1. Ask for a video using video generation.
  2. Wait for the video in the answer to finish; a failure shows 'Video generation ended' or 'Video failed to load'.
  3. Press play on the video player labelled 'Generated video', then check the controls.
  4. Click 'Download video' and compare with Expected: the video plays inline with controls and downloads.

## S17.13 Interactive widgets.

- **Expected:** Answers can contain interactive widgets (cards with choices, maps, actions) the user operates in place.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx (text found, layout changed); apps/web/features/chat/components/messages/MessageBubble.tsx (text found, layout changed); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** not found in the code. InteractiveCardBlock.tsx renders model-produced cards, but the on-screen controls depend on the card kind and their visible words were not mapped. I searched apps/web/features/chat/components/messages for card components and found the fallback section only.
- **Needs:** a request that makes the model return a card

## S17.14 Follow-up suggestions.

- **Expected:** After an answer the product offers relevant follow-up prompts the user can pick.
- **Code:** partial. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:1093
- **Known to be unfinished:** switch-on (deploy step 'follow-ups on'): change FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT to true at apps/web/features/chat/components/messages/ChatMessageList.tsx:1048; generator and settings toggle are built
- **Where to find it:** Settings > General > 'Show follow-up suggestions in chats' (switch on), then look under an answer in a chat (labels found in the code)
- **Needs:** a settings toggle and a finished answer
- **Steps:**
  1. Open Settings and go to the General section.
  2. Turn on 'Show follow-up suggestions in chats'.
  3. Open a chat, send a question and wait for the answer to finish.
  4. Look under the answer for suggested follow-up prompts and click one; compare with Expected.

## S17.15 Copy plain text.

- **Expected:** One action copies the whole answer's text to the clipboard.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3751; apps/web/features/chat/components/messages/MessageBubble.tsx:1592 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Earlier check in the running app:** PASS: E041 [PASS; render, clipboard, and downloaded content]: Actual generated answer renders heading, bold/italic, lists, quote, inline/fenced code, table, link and math. Copied answer matched exact token and Copy code returned function. Markdown export downloaded to Downloads and inspected with all six messages, title, timestamps and formatting; browser download event missed this download (instrument gap). Strikethrough not tested.
- **Where to find it:** Any answer > action row under the answer > 'Copy message' (tooltip 'Copy') (labels found in the code)
- **Needs:** a finished answer
- **Steps:**
  1. Open a chat with a finished answer.
  2. Hover over the answer's action row and click 'Copy message' (the copy icon).
  3. Paste into a text field in another app, for example Notes.
  4. Compare with Expected: the whole answer text is pasted, and the button label changes to 'Message copied' briefly.

## S17.17 Read aloud.

- **Expected:** An answer can be read aloud with text-to-speech from a control on the answer.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3046 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:1596 (quoted code not found in the file now); apps/web/lib/hooks/useTTS.ts:141 (quoted code not found in the file now)
- **Where to find it:** Any answer > action row > 'More message actions' > 'Read message aloud' (labels found in the code)
- **Needs:** a finished answer and audio output
- **Steps:**
  1. Open a chat with a finished answer.
  2. Click the button labelled 'More message actions' in the answer's action row.
  3. Click 'Read message aloud'.
  4. Compare with Expected: the answer is spoken aloud.

## S17.18 Stop read-aloud playback.

- **Expected:** While an answer is being read aloud, the user can stop playback from the same place.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3982; apps/web/features/chat/components/messages/ChatMessageList.tsx:1250
- **Where to find it:** While an answer is being read aloud > 'More message actions' > 'Stop reading message' (labels found in the code)
- **Needs:** a finished answer and audio output
- **Steps:**
  1. Start 'Read message aloud' on an answer, as in S17.17.
  2. While it is speaking, open 'More message actions' on the same answer.
  3. Click 'Stop reading message'.
  4. Compare with Expected: the speech stops and the menu item returns to 'Read message aloud'.

## S17.19 Regenerate answer.

- **Expected:** A completed answer can be regenerated in place, producing a new attempt for the same prompt.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3884; apps/web/features/chat/pages/WebChatPage.tsx:5704; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Any finished answer > action row > 'Regenerate response' (circular arrow, tooltip 'Regenerate') (labels found in the code)
- **Needs:** a finished answer
- **Steps:**
  1. Open a chat with a finished answer.
  2. Hover over the action row and click 'Regenerate response'.
  3. Wait for the new attempt to appear for the same prompt.
  4. Compare with Expected: a new attempt for the same question replaces the answer in place.

## S17.20 Retry failed answer.

- **Expected:** A failed answer shows a Retry control that re-runs the turn and replaces the failure with the new outcome.
- **Code:** done. Evidence present: apps/web/lib/hooks/useChatStream.ts:6207; apps/web/lib/hooks/useChatStream.ts:6214; apps/web/lib/hooks/useChatStream.ts:5123
- **Earlier check in the running app:** PARTIAL: E037 [UI_ONLY; retry offered]: Plain text project question with no attachments failed: QwenCloud free models answer text prompts in Chat; turn off tools/remove attachments. Could not verify project instruction influence. Error restored text to composer and Retry offered; details panel shows failed state. | E038 [PARTIAL; retry interaction]: Retried same turn with OpenRouter Free Auto: alert says AGI Work requires Pro or higher. Transcript and details retain prior Qwen error, creating inconsistent failure explanation. Project chat creation succeeded, generation blocked.
- **Where to find it:** A failed answer > the notice under the answer > 'Retry' (labels found in the code)
- **Needs:** a way to make the turn fail
- **Steps:**
  1. Send a message that fails (for example when the model route is unavailable).
  2. Look at the notice below the failed answer and click 'Retry' (aria label 'Retry this response').
  3. Wait for the new outcome.
  4. Compare with Expected: the failure is replaced by the new result for the same turn.

## S17.21 Continue truncated answer.

- **Expected:** An answer cut off by the output limit offers Continue, which resumes the same answer.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:1944; apps/web/features/chat/components/messages/ChatMessageList.tsx:1356; apps/web/features/chat/pages/WebChatPage.tsx:7742
- **Where to find it:** A truncated answer > the button below it 'Continue generating' (labels found in the code)
- **Needs:** a request that hits the output limit
- **Steps:**
  1. Send a request that needs a long answer, for example 'write a long essay'.
  2. If the answer stops at the output limit, look below it for 'Continue generating'.
  3. Click it.
  4. Compare with Expected: the same answer resumes and continues from where it stopped.

## S17.22 Rewrite with another model.

- **Expected:** From an answer, the user can regenerate it with a different model in one step.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3895; apps/web/features/chat/pages/WebChatPage.tsx:4580 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Any finished answer > action row > 'Regenerate response' dropdown arrow > 'Try again with' > pick a model (labels found in the code)
- **Needs:** more than one model option available on the account
- **Steps:**
  1. Open a chat with a finished answer that has model options.
  2. Click the 'Regenerate response' control that has a dropdown.
  3. Under 'Try again with', click another model name.
  4. Compare with Expected: a new attempt is produced with that model in one step.

## S17.27 Branch from answer.

- **Expected:** From any answer, the user can branch a new conversation that keeps history up to that point and leaves the original unchanged.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3932; apps/web/features/chat/pages/WebChatPage.tsx:7752; apps/web/features/chat/hooks/use-conversation-branches.ts:69
- **Where to find it:** Any answer > action row > 'Branch conversation from here' (fork icon, tooltip 'Branch conversation: this chat stays unchanged') (labels found in the code)
- **Needs:** a chat with at least two exchanges
- **Steps:**
  1. Open a chat with several messages.
  2. Hover over an answer's action row and click 'Branch conversation from here'.
  3. Wait for 'Creating branch…' to finish.
  4. Compare with Expected: a new conversation holds the history up to that answer, and the original chat is unchanged.

## S17.28 Navigate answer variants.

- **Expected:** When an answer has several attempts, the user can page between them (e.g. '2 of 3').
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:994; apps/web/features/chat/pages/WebChatPage.tsx:7755; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** An answer with two or more attempts > the arrows beside the answer ('Previous response' / 'Next response') (labels found in the code)
- **Needs:** a regenerated answer
- **Steps:**
  1. Regenerate an answer (see S17.19) so the same question has two or more responses.
  2. Look for the small arrows beside the answer; the middle text reads 'Response N of M'.
  3. Click 'Next response' and 'Previous response' to page between attempts.
  4. Compare with Expected: the answer text changes to the other attempt and the count updates.

## S17.29 Positive feedback.

- **Expected:** A thumbs-up on an answer records positive feedback tied to that message.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3777; apps/web/features/chat/components/messages/MessageBubble.tsx:1022 (quoted code not found in the file now); apps/web/features/chat/components/messages/MessageBubble.tsx:976 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Any finished answer > action row > thumbs up 'Good response' (labels found in the code)
- **Needs:** a finished answer
- **Steps:**
  1. Open a chat with a finished answer.
  2. Hover over the action row and click the thumbs-up 'Good response'.
  3. Check that the button now shows 'Remove rating' and is pressed.
  4. Compare with Expected: positive feedback is recorded for that answer.

## S17.30 Negative feedback.

- **Expected:** A thumbs-down on an answer records negative feedback tied to that message.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageBubble.tsx:3806; apps/web/features/chat/components/messages/MessageBubble.tsx:1022 (quoted code not found in the file now); apps/web/features/chat/components/messages/MessageBubble.tsx:976 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Any finished answer > action row > thumbs down 'Bad response' (labels found in the code)
- **Needs:** a finished answer
- **Steps:**
  1. Open a chat with a finished answer.
  2. Hover over the action row and click the thumbs-down 'Bad response'.
  3. Check whether a details panel opens (ResponseRatingDetails) and whether the button shows 'Remove rating'.
  4. Compare with Expected: negative feedback is recorded for that answer.

## S17.31 Report answer.

- **Expected:** An answer can be reported (e.g. harmful/incorrect) to the trust-and-safety intake from the answer itself.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4072; apps/web/features/chat/components/messages/MessageBubble.tsx:1174; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Where to find it:** Any finished answer > action row > 'More message actions' > 'Report this response' (labels found in the code)
- **Needs:** a finished answer
- **Steps:**
  1. Open a chat with a finished answer.
  2. Click 'More message actions' in the action row.
  3. Click 'Report this response'.
  4. Compare with Expected: the item changes to 'Reporting…' and then 'Reported', and the report is filed for that answer.

## S17.32 Share answer or conversation.

- **Expected:** The user can share an answer or the conversation (link or system share sheet).
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7502; apps/web/features/chat/pages/WebChatPage.tsx:7916; apps/web/features/chat/hooks/use-share-conversation.ts:177 (quoted code not found in the file now)
- **Where to find it:** Top bar of a chat that has messages > "Share conversation" button (text "Share" shows on wide windows) > dialog "Share conversation" > "Create public link · 7 days" (or "Copy" once a link exists). Per answer: hover the answer, open "More message actions" > "Share answer". (labels found in the code)
- **Needs:** a signed-in account with a chat that has at least one message; the answer share uses the system share sheet where the browser provides one
- **Steps:**
  1. Open or start a chat and send one message so the chat has messages.
  2. Click the "Share conversation" button in the top bar (on wide windows it reads "Share").
  3. In the dialog "Share conversation", leave the expiry at 7 days and click "Create public link".
  4. Look for the link to appear with a "Copy" button and check it opens the same conversation.
  5. For one answer: hover it, click "More message actions", then click "Share answer" and look for the system share sheet or an error toast "This answer could not be shared".

## S17.36 Actual-model and usage details.

- **Expected:** For each answer the user can see which model actually answered and its usage (tokens/cost/time).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:4079; apps/web/features/chat/components/messages/MessageBubble.tsx:4127; apps/web/features/chat/components/messages/ChatMessageList.tsx:808
- **Earlier check in the running app:** PASS: E040 [PASS; live generated answer]: Follow-up on (model name).8-max-0902 returned exact LIVE_QA_20260926_OK; served route labeled via free pool. Renamed own conversation Browser QA, Chat and rendering. The earlier Retry click on failed activity did not visibly restart a request; fresh send succeeded. Sources panel opens empty, no research performed.
- **Where to find it:** Any answer > "More message actions" (the three-dot button under the answer) > the usage block at the bottom of the menu (tokens, model, request id, seconds). The model name is also shown under the answer on hover as the answered-by label. (labels found in the code)
- **Needs:** a completed answer from a route that sends token counts (not every provider sends them)
- **Steps:**
  1. Send a message and wait for the answer to finish.
  2. Hover the answer and look for the name of the model under it.
  3. Click the "More message actions" button under the answer.
  4. Scroll to the bottom of the menu, below the separator, and look for the token usage block and a time in seconds such as "2.4s".
  5. Compare the model shown there with the Expected: which model answered and its usage.

## S17.37 Partial-result state.

- **Expected:** When an answer fails after producing some output, the partial output is kept and visibly marked incomplete, with the reason.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:117; apps/web/features/chat/components/messages/ChatMessageList.tsx:1817; apps/web/features/chat/components/messages/MessageBubble.tsx:2700
- **Where to find it:** A chat whose answer fails after some text has already arrived > the answer keeps its text above a status line "Response failed" (with the reason after it), or "Response cancelled. Partial response saved.", or "Response finished with errors". (labels found in the code)
- **Needs:** a provider failure after output has started; this cannot be made on demand from the UI
- **Steps:**
  1. Send a message that a provider fails partway through (for example by a provider outage or a timeout).
  2. Look at the answer: the text that arrived should still be there, above a status line.
  3. Read the status line: it should say "Response failed" followed by the reason, or "Response finished with errors".
  4. Compare with Expected: the partial text must be kept and clearly marked incomplete, with the reason.

## S17.38 Refusal state.

- **Expected:** When the model/safety layer refuses, the answer shows a distinct refusal state (not a generic error or a normal answer), with a next step.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:1971; apps/web/features/chat/components/messages/ChatMessageList.tsx:1402
- **Where to find it:** An answer that the safety layer stops > the notice "The model declined to finish this response for safety reasons." with a "Report issue" button under it. (labels found in the code)
- **Needs:** a prompt that triggers a provider safety refusal; this cannot be forced from the UI
- **Steps:**
  1. Send a prompt that the model's safety layer refuses (the app cannot choose this on demand).
  2. Look under the answer for the notice "The model declined to finish this response for safety reasons."
  3. Check that it is not styled as an ordinary answer or a generic error.
  4. Click "Report issue" and look for the feedback dialog that opens for a safety appeal.
  5. Compare with Expected: a distinct refusal state with a next step.

## S17.39 Interrupted state.

- **Expected:** An answer the user stopped (or that was interrupted) is marked as stopped, keeps what arrived, and offers to try again.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ChatMessageList.tsx:1957; apps/web/features/chat/components/messages/ChatMessageList.tsx:1207 (quoted code not found in the file now)
- **Where to find it:** Send a message > click the stop control while the answer is still being written > the answer shows "Response stopped." with a "Try again" button under it. (labels found in the code)
- **Needs:** none for a Free account; a message with a long answer so you have time to press stop
- **Steps:**
  1. Send a message that gives a long answer.
  2. While the answer is still streaming, click the stop button (accessible name "Stop the current response").
  3. Look under the answer for "Response stopped." and check the text that already arrived is still shown.
  4. Click "Try again" and compare with Expected: the answer is marked stopped, keeps what arrived, and offers to try again.

## S17.40 Empty-output error state.

- **Expected:** A turn that returns nothing shows an explicit 'no response' error with retry, not an empty bubble.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/ChatMessageList.tsx:120; apps/web/lib/hooks/useChatStream.ts:1713; apps/web/features/chat/components/messages/MessageBubble.tsx:2700
- **Where to find it:** A turn that returns nothing > the answer row shows "Response failed: no response was returned." with a "Retry" button. (labels found in the code)
- **Needs:** a model route that returns an empty response; this cannot be forced from the UI
- **Steps:**
  1. Send a message to a model route that returns no text (the app cannot choose this on demand).
  2. Look for an explicit status line "Response failed" with the reason "no response was returned.", not an empty answer bubble.
  3. Check that a "Retry" button is shown with it.
  4. Click "Retry" and compare the new outcome with Expected: an explicit no-response error with retry, not an empty bubble.
