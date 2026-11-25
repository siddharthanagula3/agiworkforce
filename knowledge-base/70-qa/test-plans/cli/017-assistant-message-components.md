---
id: "PLAN-cli-017"
type: "test-plan"
title: "CLI · 17. Assistant-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "17"
---
# CLI · 17. Assistant-message components

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S17.01 Assistant/model identity.

- **Expected:** Assistant turns are distinguishable from the user's visually and to assistive tech, ideally naming the assistant/model (R-n).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2888; apps/cli/src/tui/tui_app.rs:2161
- **Where to find it:** agi (start the CLI), then type a message and press Enter; the answer starts after the "✦" marker (labels found in the code)
- **Steps:**
  1. Start the CLI with agi and type any short message, then press Enter.
  2. Look at the answer: its first line starts with the "✦" marker, while your message starts with ">".
  3. Compare with Expected: the marker separates assistant turns from yours, but the answer itself does not name the model; the model name appears only in the grey line under the answer (S17.36).

## S17.02 Streaming answer body.

- **Expected:** The answer body renders incrementally as tokens arrive, with markdown formatting.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:8163; apps/cli/src/tui/tui_app.rs:5144 (quoted code not found in the file now)
- **Where to find it:** agi, then type a message and press Enter; the answer text fills in below the "Thinking" line (labels found in the code)
- **Needs:** a working model account
- **Steps:**
  1. Start agi and type a question that needs a long answer, such as a short paragraph request.
  2. Press Enter and watch the answer area while the reply arrives.
  3. Compare with Expected: text should appear in pieces as it streams, with headings, lists and code formatted (the assistant turn uses the markdown renderer).

## S17.03 Working indicator.

- **Expected:** While the assistant works and before/while text arrives, a visible (and announced) working indicator is shown.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3013; apps/cli/src/tui/tui_app.rs:7896
- **Where to find it:** agi, then type a message and press Enter; the spinner line reads "Thinking… <seconds>" (labels found in the code)
- **Steps:**
  1. Start agi and type a message, then press Enter.
  2. Watch the line just above the input: a spinner with "Thinking…" and an elapsed time shows at once.
  3. Wait about 10 seconds before any text arrives: the line adds "still working".
  4. Compare with Expected: the indicator is visible from the start; the code does not show evidence that it is announced to a screen reader, which I did not check.

## S17.04 Reasoning-summary or activity-summary disclosure.

- **Expected:** An answer offers a collapsible summary of the model's reasoning and/or the work it did (steps, tools), expandable on demand.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1551 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:7945
- **Where to find it:** not found in the code. No reasoning-summary or collapsible reasoning disclosure found: searched apps/cli/src/tui for reasoning, thinking, collapse and expand. The closest control is Ctrl-O, which toggles full tool output (see S17.05).

## S17.05 Tool-activity section.

- **Expected:** Tool calls made for the answer appear in a tool-activity section with each tool's name, status and result.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:334; apps/cli/src/tui/tui_app.rs:7945
- **Where to find it:** agi, then type a request that needs a tool, such as reading a file; tool rows appear under the answer (labels found in the code)
- **Steps:**
  1. Start agi and type a request that makes the assistant read a file, for example "read the README in this folder", then press Enter.
  2. Look for rows under the answer: each has a glyph, a tool icon, the tool name in bold and a short summary.
  3. Look at the status glyph: a spinner while running, "✔" when complete, "✗" when failed, "⊘" when cancelled.
  4. Press Ctrl-O to show the full output, then Ctrl-O again to collapse it; compare with Expected: name, status and result should be visible.

## S17.08 Generated-file cards.

- **Expected:** Files the assistant produced appear as cards on the answer with name/type and open/download.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:8659
- **Where to find it:** not found in the code. No generated-file cards on an answer found. Searched apps/cli/src/tui for generated, download and file cards: only a one-line chip above the input for /image images (tui_app.rs:3304) and a "Files changed this turn" system line (tui_app.rs:8659).

## S17.10 Image results.

- **Expected:** Images the assistant generated or returned render inline in the answer (viewable/downloadable).
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:5612; apps/cli/src/tui/tui_app.rs:4676 (quoted code not found in the file now)
- **Where to find it:** agi, then type /image with a description and press Enter; then type /image open (labels found in the code)
- **Needs:** a signed-in account in Managed Cloud mode (/image is offered only there)
- **Steps:**
  1. In agi, type /image followed by a short picture description, then press Enter.
  2. Wait for the reply; a row appears above the input with the file name and "/image open to view".
  3. Type /image open and press Enter to open the newest generated image in a viewer.
  4. Compare with Expected: the image should be viewable; the code shows no inline image rendering in the terminal, only the viewer route.

## S17.15 Copy plain text.

- **Expected:** One action copies the whole answer's text to the clipboard.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5915; apps/cli/src/tui/tui_app.rs:5935
- **Where to find it:** agi, then type /copy and press Enter (labels found in the code)
- **Needs:** a clipboard the terminal can reach
- **Steps:**
  1. After an answer, type /copy and press Enter.
  2. Read the confirmation in the transcript; it should say the last response was copied with its line count.
  3. Paste into another app (for example a text editor) and check that the whole answer text is there.
  4. Type /copy code or /copy diff to copy the last code block or diff instead.

## S17.21 Continue truncated answer.

- **Expected:** An answer cut off by the output limit offers Continue, which resumes the same answer.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:185
- **Where to find it:** agi, then type /continue and press Enter after an answer that was cut off (labels found in the code)
- **Needs:** a model that can produce a long answer
- **Steps:**
  1. Ask for a very long answer, for example a long essay, so the answer reaches the model's length limit.
  2. When the notice appears under the answer, type /continue and press Enter.
  3. Compare with Expected: the new reply should pick up where the last one stopped without repeating it.

## S17.27 Branch from answer.

- **Expected:** From any answer, the user can branch a new conversation that keeps history up to that point and leaves the original unchanged.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:1950; apps/cli/src/lib.rs:2754 (quoted code not found in the file now)
- **Where to find it:** agi, then type /branch (or /fork) and press Enter (labels found in the code)
- **Needs:** a session that was not started with --no-session-persistence
- **Steps:**
  1. Have a conversation with at least one answer in it.
  2. Type /branch, optionally with a name, and press Enter.
  3. Read the confirmation in the transcript and check that the earlier messages are still in the new branch.
  4. Go back to the original conversation and check that it is unchanged.

## S17.35 Export answer.

- **Expected:** A single answer can be exported to a file (e.g. PDF, Markdown, text).
- **Code:** done. Evidence present: apps/cli/src/repl/registry.rs:586; apps/cli/src/repl/registry.rs:615
- **Where to find it:** agi, then type /export answer <file name> and press Enter (labels found in the code)
- **Steps:**
  1. After an answer, type /export answer notes.md and press Enter (use /export md <file> or /export json <file> for other formats).
  2. Read the confirmation; it should say the conversation was exported to a path.
  3. Open the file in a text editor and check that it holds the last answer (or the whole conversation for markdown or json).
  4. Type /export with a file name that already exists and check that nothing is overwritten.

## S17.36 Actual-model and usage details.

- **Expected:** For each answer the user can see which model actually answered and its usage (tokens/cost/time).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2133; apps/cli/src/tui/tui_app.rs:8650
- **Where to find it:** agi, then send a message; read the grey line under the answer (labels found in the code)
- **Steps:**
  1. Send any message and wait for the answer.
  2. Read the grey line under the answer: it shows the model name, input and output tokens, credits when paid, and the duration.
  3. Compare with Expected: the line names the model that answered and its usage; time and tokens are shown, cost only when it is not covered by a subscription.

## S17.37 Partial-result state.

- **Expected:** When an answer fails after producing some output, the partial output is kept and visibly marked incomplete, with the reason.
- **Code:** done. Evidence present: apps/cli/src/agent/chat.rs:2319; apps/cli/src/errors.rs:94
- **Where to find it:** not found in the code. Code keeps partial output on a cut or failed answer (chat.rs deliver_incomplete and the error path in tui_app.rs), but I did not confirm the incomplete marker is visible in the TUI: the cut-answer notice goes through output::print_warn.

## S17.38 Refusal state.

- **Expected:** When the model/safety layer refuses, the answer shows a distinct refusal state (not a generic error or a normal answer), with a next step.
- **Code:** done. Evidence present: apps/cli/src/agent/chat.rs:352; apps/cli/src/errors.rs:93; apps/cli/src/tui/tui_app.rs:1263
- **Where to find it:** agi, then type a message and press Enter; if the provider's safety layer refuses, a red ✗ row appears (labels found in the code)
- **Needs:** none (a refusal cannot be produced on demand)
- **Steps:**
  1. Type a message the model's safety layer would refuse and press Enter (this cannot be triggered on demand).
  2. Look for a red row starting with "✗" under your message, with the refusal sentence.
  3. Read the next step line below it, which tells you to rephrase and send again.
  4. Compare with Expected: the refusal should look different from a normal answer or a generic error.

## S17.39 Interrupted state.

- **Expected:** An answer the user stopped (or that was interrupted) is marked as stopped, keeps what arrived, and offers to try again.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:8731; apps/cli/src/tui/tui_app.rs:8721
- **Where to find it:** agi, then type a long request and press Enter; press Esc or Ctrl-C while the answer streams (labels found in the code)
- **Steps:**
  1. Type a request that gives a long answer and press Enter.
  2. While the answer streams, press Esc or Ctrl-C.
  3. Look for the "⊘ Stopped" line in the transcript, and check that the text that already arrived is still shown with a [stopped] marker in history.
  4. Compare with Expected: the code shows no "try again" offer after stopping; the text you typed in the input box returns only if you had queued messages.

## S17.40 Empty-output error state.

- **Expected:** A turn that returns nothing shows an explicit 'no response' error with retry, not an empty bubble.
- **Code:** done. Evidence present: apps/cli/src/agent/chat.rs:364; apps/cli/src/errors.rs:92; apps/cli/src/tui/tui_app.rs:1263
- **Where to find it:** agi, then type a message and press Enter; if the model returns nothing, a red ✗ row appears (labels found in the code)
- **Needs:** none (an empty reply cannot be produced on demand)
- **Steps:**
  1. Type a message and press Enter (an empty reply cannot be produced on demand).
  2. If the reply is empty, the app sends the turn once more by itself and shows the warning "Sending it once more.".
  3. If the second reply is also empty, look for the red ✗ row "The model returned no response for this turn." with the line "Send it again, or rephrase your message.".
  4. Compare with Expected: an explicit message should appear instead of an empty answer bubble; the retry is automatic, and there is no retry button.
