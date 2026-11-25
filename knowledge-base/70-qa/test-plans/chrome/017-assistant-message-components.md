---
id: "PLAN-chrome-017"
type: "test-plan"
title: "Chrome · 17. Assistant-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "17"
---
# Chrome · 17. Assistant-message components

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S17.01 Assistant/model identity.

- **Expected:** Assistant turns are distinguishable from the user's visually and to assistive tech, ideally naming the assistant/model (R-n).
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:388; apps/extension/src/features/side-panel/bubbles.ts:463; apps/extension/src/features/side-panel/bubbles.ts:466
- **Where to find it:** Side panel: type in the box that says "How can I help you today?", press send, then look at the answer (labels found in the code)
- **Steps:**
  1. Type any question in the box that says "How can I help you today?" and send it.
  2. Wait until the answer stops typing.
  3. Compare the answer with your question: the answer is in its own bubble styled differently from your message.
  4. Look at the small line under the answer after it finishes: it shows the model name and the time taken.

## S17.02 Streaming answer body.

- **Expected:** The answer body renders incrementally as tokens arrive, with markdown formatting.
- **Code:** done. Evidence present: apps/extension/src/side_panel.ts:6373; apps/extension/src/side_panel.ts:16088
- **Where to find it:** Side panel: send a question that gets a long answer with formatting (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Type a question that asks for a list with bold text, for example a short guide, in the box that says "How can I help you today?".
  2. Send it and watch the answer while it is still arriving.
  3. Check that text keeps appearing piece by piece before the answer ends.
  4. When it ends, check that bold text, lists and code blocks are shown formatted, not as raw symbols.

## S17.03 Working indicator.

- **Expected:** While the assistant works and before/while text arrives, a visible (and announced) working indicator is shown.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:4443 (quoted code not found in the file now); apps/extension/src/side_panel.ts:6974
- **Where to find it:** Side panel: send a message and look under your message before the first words arrive (labels found in the code)
- **Steps:**
  1. Type a question in the box that says "How can I help you today?" and send it.
  2. Right after sending, look below your message for a small AGI mark with the word "Preparing".
  3. Check that the "Preparing" line disappears once the answer text starts to appear.
  4. Optionally, wait for the "Reading the page" wording on page-based requests (not verified how often it shows).

## S17.04 Reasoning-summary or activity-summary disclosure.

- **Expected:** An answer offers a collapsible summary of the model's reasoning and/or the work it did (steps, tools), expandable on demand.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:597 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:675 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5934
- **Where to find it:** Side panel: send a request that makes the assistant use tools (for example a web search), then click the collapsed line above the answer that starts with "Working for" or "Worked for" (labels found in the code)
- **Needs:** a request that makes the assistant use tools, such as a web search
- **Steps:**
  1. Send a request that needs a tool, for example a web search about today's news.
  2. While it works, look above the answer for a line starting with "Working for" plus the elapsed time.
  3. Click that line to expand it.
  4. When it finishes, check the expanded section lists the steps the assistant took, with the time and step count.

## S17.05 Tool-activity section.

- **Expected:** Tool calls made for the answer appear in a tool-activity section with each tool's name, status and result.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:320 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:693 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5934
- **Where to find it:** Side panel: after a request that used tools, expand the "Worked for" line above the answer, then click a step row (labels found in the code)
- **Needs:** a request that makes the assistant use tools, such as a web search
- **Steps:**
  1. Send a request that uses a tool, such as a web search.
  2. Expand the line above the answer that starts with "Working for" or "Worked for".
  3. Click a step row to open it.
  4. Check the row shows what the step was, its status (for example failed or cancelled), and under it the "Request" and "Result" sections.

## S17.06 Source citations.

- **Expected:** Claims in an answer carry citation markers that link to the sources the answer used.
- **Code:** done. Evidence present: apps/extension/src/features/cloud-bridge/freeTrialClient.ts:910; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1132; apps/extension/src/side_panel.ts:16057; apps/extension/src/features/side-panel/bubbles.ts:396; apps/extension/src/features/side-panel/bubbles.ts:402; apps/extension/src/features/side-panel/sources.ts:102
- **Where to find it:** Side panel: ask a question that needs web sources, then look for small site-name chips inside the answer text (labels found in the code)
- **Needs:** a question that makes the assistant use web sources
- **Steps:**
  1. Ask a question that needs current web information, for example a news question.
  2. When the answer finishes, look for small link chips with a site name (for example a domain) inside the answer text.
  3. Hover or focus one chip to see its source card.
  4. Check that the chip opens the source page in a new tab when clicked.

## S17.07 Sources footer.

- **Expected:** A finished answer that used sources ends with a sources footer/list the user can open.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/sources.ts:136; apps/extension/src/features/side-panel/bubbles.ts:770; apps/extension/src/features/side-panel/chat-state.ts:385
- **Where to find it:** Side panel: under a finished answer that used sources, click the "N sources" line to open the list (labels found in the code)
- **Needs:** a question that makes the assistant use web sources
- **Steps:**
  1. Send a question that uses web sources and wait for the answer to finish.
  2. Look under the answer for a line with a globe icon and the text "N sources".
  3. Click that line to expand the list.
  4. Check the list shows each source with its title, and that clicking one opens it in a new tab.

## S17.08 Generated-file cards.

- **Expected:** Files the assistant produced appear as cards on the answer with name/type and open/download.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/generatedFiles.ts:73; apps/extension/src/features/side-panel/generatedFiles.ts:317; apps/extension/src/features/side-panel/bubbles.ts:456 (quoted code not found in the file now)
- **Where to find it:** Side panel: ask the assistant to make a file (for example a text or spreadsheet file); the file card appears under the answer (labels found in the code)
- **Needs:** a request that makes the assistant produce a file
- **Steps:**
  1. Send a request that asks the assistant to create a downloadable file.
  2. When the answer finishes, look under it for a file card showing the file name and a type label (for example PDF) or the word File.
  3. Hover the open button to see the tooltip "Open <file name>"; click it.
  4. Hover and click the download button, labelled "Download <file name>", and check the file saves.

## S17.09 Artifact launch cards.

- **Expected:** An answer that created an artifact shows a card that opens the artifact viewer/panel.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/generatedFiles.ts:92; apps/extension/src/features/side-panel/generatedFiles.ts:288; apps/extension/src/features/side-panel/bubbles.ts:456 (quoted code not found in the file now)
- **Where to find it:** Side panel: ask for an artifact (for example a small web page); the artifact card appears under the answer, then click "Open" (labels found in the code)
- **Needs:** a request that makes the assistant create an artifact
- **Steps:**
  1. Send a request that asks for an artifact, for example a small web page or code file.
  2. When the answer finishes, look under it for a card showing the artifact title and a line that starts with "Artifact".
  3. Click the "Open" button on the card.
  4. Check the artifact panel opens beside the chat and the button now reads "Hide"; click "Hide" to close it.

## S17.10 Image results.

- **Expected:** Images the assistant generated or returned render inline in the answer (viewable/downloadable).
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/generatedFiles.ts:141; apps/extension/src/features/side-panel/generatedFiles.ts:408; apps/extension/src/features/side-panel/generatedFiles.ts:220 (quoted code not found in the file now)
- **Where to find it:** Side panel: ask the assistant to make an image; the image appears in the answer (labels found in the code)
- **Needs:** a request that makes the assistant produce an image
- **Steps:**
  1. Send a request that asks for a picture, for example a simple drawing.
  2. Wait for the text "Loading image…" to turn into the picture.
  3. Click the picture to open it in the viewer.
  4. Hover the download button, labelled "Download <file name>", and click it to save the image.

## S17.13 Interactive widgets.

- **Expected:** Answers can contain interactive widgets (cards with choices, maps, actions) the user operates in place.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:140 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:704 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5934
- **Where to find it:** Side panel: ask a question that the assistant answers with a card (for example places on a map); the card appears under the answer (labels found in the code)
- **Needs:** a request that makes the assistant return a card
- **Steps:**
  1. Send a request that returns a card, for example places near a location.
  2. Look under the answer for a card with a headline, text and a list or buttons.
  3. Click a card button and check it opens the link in a new tab.
  4. In a card that cannot take input in Chrome, check the text "This card is read-only in Chrome." appears.

## S17.15 Copy plain text.

- **Expected:** One action copies the whole answer's text to the clipboard.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:715 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:725 (quoted code not found in the file now); apps/extension/src/side_panel.ts:5934
- **Where to find it:** Side panel: under a finished answer, click the copy icon button labelled "Copy response" (labels found in the code)
- **Steps:**
  1. Wait for an answer to finish.
  2. Hover the copy icon under the answer to see the tooltip "Copy response".
  3. Click it, then paste into a text field elsewhere.
  4. Check the whole answer text is pasted.

## S17.19 Regenerate answer.

- **Expected:** A completed answer can be regenerated in place, producing a new attempt for the same prompt.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:567; apps/extension/src/features/side-panel/bubbles.ts:600; apps/extension/src/side_panel.ts:5925; apps/extension/src/side_panel.ts:9577
- **Where to find it:** Side panel: on the latest answer, click the icon button labelled "Try again" under it (labels found in the code)
- **Needs:** none for the basic button; a signed-in account for the model menu
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Hover the icon under the answer to see the tooltip "Try again".
  3. Click it.
  4. Check the answer is replaced by a new attempt for the same question, and that the old answer is gone.

## S17.20 Retry failed answer.

- **Expected:** A failed answer shows a Retry control that re-runs the turn and replaces the failure with the new outcome.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:317; apps/extension/src/side_panel.ts:9606; apps/extension/src/side_panel.ts:9530
- **Where to find it:** Side panel: when an answer fails, click the "Retry" button shown under the error text (labels found in the code)
- **Needs:** a way to make an answer fail (for example turn off the internet before sending)
- **Steps:**
  1. Send a question in a way that makes the answer fail, for example with the internet turned off before sending.
  2. Look under the answer for the error text and a "Retry" button.
  3. Turn the connection back on and click "Retry".
  4. Check the failed answer is replaced by the new outcome for the same question.

## S17.22 Rewrite with another model.

- **Expected:** From an answer, the user can regenerate it with a different model in one step.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:602; apps/extension/src/side_panel.ts:6035; apps/extension/src/side_panel.ts:9595; apps/extension/src/side_panel.ts:6017
- **Where to find it:** Side panel: on the latest answer, click the icon button labelled "Try again" to open the menu, then choose a model under "Try again with" (labels found in the code)
- **Needs:** a signed-in account, since the model list comes from the account
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Click the "Try again" icon under the answer.
  3. If a menu opens, check it has "Try again" and the heading "Try again with" followed by model names.
  4. Choose a different model and check a new answer for the same question appears, and the model name under it is the one you chose.

## S17.36 Actual-model and usage details.

- **Expected:** For each answer the user can see which model actually answered and its usage (tokens/cost/time).
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:463; apps/extension/src/side_panel.ts:9693
- **Where to find it:** Side panel: under a finished answer, read the small line with the model name and the time; hover it for the auto-pick reason (labels found in the code)
- **Steps:**
  1. Send a question and wait for the answer to finish.
  2. Look in the action row under the answer for the model name followed by the time taken.
  3. Hover the model name, if Auto picked the model, to see the tooltip "Auto chose this model: <reason>".
  4. If the model was switched, look for the line "Moved to <model>: <reason>" above the action row.

## S17.37 Partial-result state.

- **Expected:** When an answer fails after producing some output, the partial output is kept and visibly marked incomplete, with the reason.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/chat-state.ts:575; apps/extension/src/features/side-panel/bubbles.ts:316; apps/extension/src/side_panel.ts:5934
- **Where to find it:** Side panel: make an answer fail partway through, then look at the text already shown and the error footer under it (labels found in the code)
- **Needs:** a way to fail partway through an answer (for example losing the connection while text streams)
- **Steps:**
  1. Send a question that gives a long answer.
  2. While the text is still arriving, turn off the internet connection.
  3. Check the text that already arrived stays on screen.
  4. Check an error message appears under it with a "Retry" button, and that the answer is not shown as complete.

## S17.39 Interrupted state.

- **Expected:** An answer the user stopped (or that was interrupted) is marked as stopped, keeps what arrived, and offers to try again.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:357; apps/extension/src/side_panel.ts:7584; apps/extension/src/side_panel.ts:5934
- **Where to find it:** Side panel: while an answer is still arriving, click the stop button labelled "Stop generating" (labels found in the code)
- **Steps:**
  1. Send a question that gives a long answer.
  2. While the text is still arriving, click the stop button, whose tooltip reads "Stop generating".
  3. Check the text that arrived stays on screen.
  4. Check the word "Cancelled" appears under it with a "Retry" button.

## S17.40 Empty-output error state.

- **Expected:** A turn that returns nothing shows an explicit 'no response' error with retry, not an empty bubble.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/chat-state.ts:406; apps/extension/src/side_panel.ts:9699; apps/extension/src/side_panel.ts:9701
- **Where to find it:** Side panel: a turn that finishes with no text shows "No response was returned. Try again." with a "Retry" button (labels found in the code)
- **Needs:** a way to get an empty reply, which is hard to force on purpose
- **Steps:**
  1. Send a message and wait for the turn to finish.
  2. If the reply is empty, look for the text "No response was returned. Try again." with a "Retry" button in place of an empty bubble.
  3. Click "Retry" and check a new attempt replaces the error.
