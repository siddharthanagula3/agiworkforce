---
id: "PLAN-cli-048"
type: "test-plan"
title: "CLI · 48. Voice conversation interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "48"
---
# CLI · 48. Voice conversation interface

16 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S48.01 Voice entry from an existing chat.

- **Expected:** From an open existing chat, a control starts a voice conversation bound to that chat.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** agi, then /voice typed in the composer of an open chat (labels found in the code)
- **Needs:** a microphone and a build with voice support
- **Steps:**
  1. Run agi in the terminal and open an existing chat from the chat list.
  2. Type /voice in the composer and press Enter.
  3. Look for the voice prompt "[SPACE to record, ESC to exit]" in the same chat session, compare with Expected: voice should run bound to the chat that was open.

## S48.02 Start a new voice conversation.

- **Expected:** A control starts a brand-new voice conversation (a new chat is created for it).
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** not found in the code. No voice-specific control creates a new chat. /new ("Started new conversation.") clears the chat, and /voice can then be typed, but the code does not create a new chat for voice. Searched apps/cli/src/voice.rs and apps/cli/src/tui/tui_app.rs for new-conversation and voice handling.
- **Needs:** a microphone and a build with voice support

## S48.03 Integrated voice-and-text layout.

- **Expected:** Voice runs inside the chat view: the transcript of spoken turns appears in the same message list as typed turns.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** agi, then /voice in an open chat, then ESC; the spoken turns appear in the chat after voice ends (labels found in the code)
- **Needs:** a microphone and a build with voice support
- **Steps:**
  1. Open an existing chat in agi and type /voice, then Enter.
  2. Press SPACE, say a sentence, press ENTER to stop, then ENTER to send.
  3. Press ESC to exit voice mode.
  4. Look in the chat list for the spoken message marked "(spoken)" and the line "Voice session ended.", and compare with Expected.

## S48.05 Listening indicator.

- **Expected:** While the assistant is listening, a visible (and announced) listening state is shown.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** /voice, then press SPACE to start recording (labels found in the code)
- **Needs:** a microphone and a build with voice support
- **Steps:**
  1. Type /voice and press Enter in an open chat.
  2. Press SPACE and watch the line that starts with "REC".
  3. Compare with Expected: a listening state should be visible while recording. Only the REC label and the elapsed seconds are shown.

## S48.07 Thinking/working indicator.

- **Expected:** While the assistant is working (thinking or running a tool), a thinking/working state is shown.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** /voice, then SPACE to record, then ENTER to stop and ENTER to send (labels found in the code)
- **Needs:** a microphone and a build with voice support
- **Steps:**
  1. Type /voice and press Enter in an open chat.
  2. Press SPACE, say a short sentence, then press ENTER to stop.
  3. Read the transcript line "You said:" and press ENTER to send.
  4. Watch for the spinner text "Thinking..." while the reply is produced, and compare with Expected.

## S48.08 Waveform or amplitude visualization.

- **Expected:** A waveform or amplitude visual follows the live microphone or reply audio level during voice.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** /voice, then SPACE to record; the level bar appears next to REC (labels found in the code)
- **Needs:** a microphone and a build with voice support
- **Steps:**
  1. Type /voice and press Enter in an open chat.
  2. Press SPACE and speak; watch the bar in brackets next to "REC".
  3. Stop with ENTER and compare the bar with Expected: it should move with your voice level.

## S48.10 End conversation.

- **Expected:** A control ends the voice conversation, closing the session (and settling its usage).
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** /voice, then ESC at the "[SPACE to record, ESC to exit]" prompt (labels found in the code)
- **Needs:** a microphone and a build with voice support
- **Steps:**
  1. Type /voice and press Enter in an open chat.
  2. Press ESC at the prompt "[SPACE to record, ESC to exit]".
  3. Look for "Exited voice mode." and, back in the chat, "Voice session ended.", and compare with Expected.

## S48.12 Push-to-talk.

- **Expected:** A push-to-talk mode records only while a key or button is held and sends on release.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** /voice, then hold SPACE to record and release it to stop (labels found in the code)
- **Needs:** a microphone and a build with voice support
- **Steps:**
  1. Type /voice and press Enter in an open chat.
  2. Hold SPACE, speak, and release SPACE.
  3. Check that recording stops and the transcript "You said:" appears, compare with Expected: it sends on release.
  4. Press ENTER to send the transcript.

## S48.17 Language selection.

- **Expected:** The user can choose the spoken language of the voice conversation, and it is applied to recognition.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** /voice es (or /voice fr, etc.) in the composer, or agi --voice-lang es at launch (labels found in the code)
- **Needs:** a microphone and a build with voice support
- **Steps:**
  1. Type /voice es and press Enter in an open chat (use another supported code such as fr).
  2. Read the line "Language:" that shows the code and its name.
  3. Speak and compare the transcript with Expected: the chosen language should be used for recognition.

## S48.21 Captions.

- **Expected:** Live captions of both speakers can be shown during voice.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** not found in the code. No live captions were found. Searched apps/cli/src/voice.rs and apps/cli/src/tui/tui_app.rs for caption; the closest things are the "You said:" line and the streamed reply text.
- **Needs:** a microphone and a build with voice support

## S48.22 Transcript display.

- **Expected:** A transcript of the voice conversation is displayed and kept with the chat.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** /voice, speak, send, ESC to exit, then read the chat list (labels found in the code)
- **Needs:** a microphone and a build with voice support
- **Steps:**
  1. Type /voice and press Enter in an open chat, then send one spoken turn.
  2. Press ESC to exit voice mode.
  3. Read the chat: the spoken message should be marked "(spoken)" and kept in the chat, compare with Expected.

## S48.26 View tool results during Voice.

- **Expected:** Tool activity and results from a voice turn are viewable during the conversation.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** not found in the code. The voice loop prints only streamed reply text, with no tool activity line found in apps/cli/src/voice.rs. Tool results may appear in the chat after ESC, but this was not traced. Searched voice.rs and tui_app.rs for tool output handling during voice.
- **Needs:** a microphone and a build with voice support

## S48.27 Approve an action during Voice.

- **Expected:** An action requested by voice that needs approval can be approved or denied without leaving voice.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** not found in the code. No approval prompt handling exists in apps/cli/src/voice.rs (search for approv returned nothing). Whether the shared session shows approval prompts during a voice turn was not traced.
- **Needs:** a microphone and a build with voice support

## S48.28 Open a generated document from Voice.

- **Expected:** A document generated during voice can be opened from the voice view.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** not found in the code. No document-open action is linked to voice in apps/cli/src/voice.rs or tui_app.rs. A general documents module exists (apps/cli/src/documents.rs) but was not tied to voice.
- **Needs:** a microphone and a build with voice support

## S48.38 Continue unfinished work in text.

- **Expected:** The user can leave voice and continue the same unfinished conversation by typing.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** /voice, ESC to exit, then type in the composer and press Enter (labels found in the code)
- **Needs:** a microphone and a build with voice support
- **Steps:**
  1. Type /voice and press Enter in an open chat, speak one turn, then press ESC.
  2. Look for "Voice session ended." in the chat.
  3. Type a message in the composer and press Enter.
  4. Check that the reply continues the same chat with the earlier spoken turns, compare with Expected.

## S48.39 Resume a previous voice conversation.

- **Expected:** The user can reopen a previous voice conversation and continue it by voice with its earlier turns as context.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** not found in the code. No voice-specific resume was found. /resume exists in apps/cli/src/tui/tui_app.rs for general chats, but nothing marks a voice conversation or reopens voice mode. Searched voice.rs and tui_app.rs for resume.
- **Needs:** a microphone and a build with voice support
