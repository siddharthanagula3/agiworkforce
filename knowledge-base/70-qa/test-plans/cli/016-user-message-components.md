---
id: "PLAN-cli-016"
type: "test-plan"
title: "CLI · 16. User-message components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "16"
---
# CLI · 16. User-message components

9 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S16.01 User identity/avatar.

- **Expected:** The author of each turn is distinguishable visually (avatar, name, alignment/bubble style or terminal marker) AND announced to assistive tech (R-n).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2882; apps/cli/src/tui/tui_app.rs:8147; apps/cli/src/lib.rs:8321
- **Where to find it:** agi (the chat screen), then type a message and press Enter (labels found in the code)
- **Steps:**
  1. Start the app with `agi`.
  2. Type a short message and press Enter.
  3. Look at your message in the transcript: it starts with a '  > ' marker. There is no avatar or name in the code; compare with Expected, which also asks for a screen-reader announcement (none was found in the code).

## S16.02 Message text.

- **Expected:** The text the user sent is shown in their message in the transcript.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2939; apps/cli/src/tui/tui_app.rs:8148; apps/cli/src/lib.rs:8321
- **Where to find it:** agi (the chat screen), then type a message and press Enter (labels found in the code)
- **Steps:**
  1. Start the app with `agi`.
  2. Type a unique sentence, such as 'test line one', and press Enter.
  3. Look at the transcript: the sentence appears under the '  > ' marker, indented four spaces, as the text you sent.

## S16.03 Attachment group.

- **Expected:** Files and images sent with a user turn are listed on that message (thumbnail or named chip) after sending.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:5676 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Staged files show as a chip above the composer ('📎 ... · /attach remove to drop', apps/cli/src/tui/tui_app.rs:3280) and /attach prints 'Attached {label}.'. The transcript renderer (apps/cli/src/tui/tui_app.rs around lines 2880-2945) draws only message text, so no file list on a sent turn was found. Searched apps/cli/src/tui/tui_app.rs for attach, chip and attachment.
- **Needs:** a file to upload

## S16.04 Source and context chips.

- **Expected:** A sent user message shows chips for the non-file context it carried (quoted text, connector/MCP resources, page, editor selection, @mentions).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4545; apps/cli/src/tui/tui_app.rs:8152
- **Where to find it:** not found in the code. Searched apps/cli/src for chip rendering on sent user messages. Only composer chips were found (apps/cli/src/tui/tui_app.rs:3277-3291); turn_context at apps/cli/src/tui/tui_app.rs:4545 is not rendered as chips. The cited line 8152 is a Detail role, not a chip.

## S16.09 Resend action.

- **Expected:** A sent user message can be re-sent unchanged from the message itself to get a fresh reply.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4169
- **Where to find it:** not found in the code. Searched apps/cli/src for resend, re-send and retry in the TUI and slash commands; no resend action on a user message was found. apps/cli/src/tui/tui_app.rs:4169 is the End key, not resend. /rewind (apps/cli/src/tui/tui_app.rs:6045) is a checkpoint picker, not a resend.

## S16.10 Branch-from-message action.

- **Expected:** From a chosen user message the user can start a new branch conversation that contains the thread up to that message.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:1946; apps/cli/src/lib.rs:2766 (quoted code not found in the file now); apps/cli/src/lib.rs:5747
- **Where to find it:** not found in the code. Found /fork and /branch (apps/cli/src/tui/tui_app.rs:6014), which fork the whole session, and a turn-index fork in apps/cli/src/lib.rs:1949 ('Turn index to fork at'). No action on a chosen user message was found. /rewind (apps/cli/src/tui/tui_app.rs:6045) opens a checkpoint picker, not verified as a branch.
- **Needs:** a Free account

## S16.15 Delivery-failed state.

- **Expected:** When a user message fails to deliver, the transcript shows a clear failed state for that turn.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:1263; apps/cli/src/tui/tui_app.rs:2901; apps/cli/src/lib.rs:8321
- **Where to find it:** not found in the code. Only separate Error lines exist (apps/cli/src/tui/tui_app.rs:1263 and 2901, ChatRole::Error, '  ✗ '). No failed state on a user turn was found, and no failed-delivery text was found in apps/cli/src.

## S16.19 Voice-transcript attribution.

- **Expected:** A user message that came from speech is marked as a voice transcript (e.g. mic badge or "Transcribed").
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4469
- **Where to find it:** agi, then type /voice (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Start the app with `agi`.
  2. Type /voice and press Enter, then speak one sentence.
  3. End the voice session when the app offers it (the exact key was not checked in the code).
  4. Look at your message after 'Voice session ended.': it starts with '(spoken)'. Compare with Expected: no 'Transcribed' text or mic badge was found.

## S16.20 Imported-message attribution.

- **Expected:** Messages brought in from elsewhere (another product, a shared link, another device) are marked with where they came from.
- **Code:** done. Evidence present: apps/cli/src/sessions.rs:135; apps/cli/src/tui/tui_app.rs:696
- **Where to find it:** not found in the code. The attribution line exists: 'The messages below came from {origin}.' (apps/cli/src/tui/tui_app.rs:696), with origin set to 'your AGI account' (apps/cli/src/sessions.rs:771) or by import_hosted_session (apps/cli/src/sessions.rs:662). The user command or screen that brings in a hosted conversation was not found; searched apps/cli/src for import_hosted_session and adopt.
- **Needs:** an outside account (Google)
