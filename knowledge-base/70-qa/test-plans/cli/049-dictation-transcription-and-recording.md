---
id: "PLAN-cli-049"
type: "test-plan"
title: "CLI · 49. Dictation, transcription, and recording"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "49"
---
# CLI · 49. Dictation, transcription, and recording

9 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S49.01 Composer dictation.

- **Expected:** A microphone control in the composer turns speech into text in the message field.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** agi, then type /dictate in the message box (labels found in the code)
- **Needs:** a microphone, and a transcription route (a signed-in account, OPENAI_API_KEY, or the whisper program on PATH)
- **Steps:**
  1. Start agi and wait for the message box.
  2. Type /dictate and press Enter.
  3. Press SPACE, say a short sentence, then press ENTER to stop.
  4. Look at the message box: the spoken words should appear there as text.

## S49.02 Editable transcription before send.

- **Expected:** The dictated transcript lands in the message field where the user can edit it before sending.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** agi, then type /dictate in the message box (labels found in the code)
- **Needs:** a microphone, and a transcription route (a signed-in account, OPENAI_API_KEY, or the whisper program on PATH)
- **Steps:**
  1. Type /dictate, press Enter, then SPACE, say a sentence, and press ENTER.
  2. Read the notice that appears after the text is added.
  3. Move the cursor with the left arrow key and change a word in the message box.
  4. Press Enter to send and check the sent message contains your edit, not the raw transcript.

## S49.03 Dictation language selection.

- **Expected:** The user can choose the dictation language, and recognition uses it.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** agi --voice-lang <code> at startup, or type /dictate <code> in the message box (labels found in the code)
- **Needs:** a microphone, and a transcription route (a signed-in account, OPENAI_API_KEY, or the whisper program on PATH)
- **Steps:**
  1. Start agi with agi --voice-lang fr (or another code such as es or de).
  2. Type /dictate and press Enter, then SPACE, speak in that language, and press ENTER.
  3. Check the transcript comes back in that language in the message box.
  4. Type /dictate xx with an unsupported code and check the error 'Dictation failed:' appears before any recording.

## S49.05 Final transcript.

- **Expected:** When dictation ends, the final transcript is produced and delivered.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** agi, then type /dictate in the message box (labels found in the code)
- **Needs:** a microphone, and a transcription route (a signed-in account, OPENAI_API_KEY, or the whisper program on PATH)
- **Steps:**
  1. Type /dictate and press Enter.
  2. Press SPACE, say a sentence, then press ENTER.
  3. Wait for the spinner 'Transcribing...' to finish.
  4. Check the final text is in the message box and the notice 'dictation added to the composer, Enter to send' appears.

## S49.06 Retry failed transcription.

- **Expected:** After a failed transcription the user can retry without starting over.
- **Code:** done. Evidence present: apps/cli/src/voice.rs:357
- **Where to find it:** agi, then type /dictate in the message box (labels found in the code)
- **Needs:** a microphone, and a way to make transcription fail such as no network
- **Steps:**
  1. Type /dictate, press Enter, then SPACE, say something, and press ENTER.
  2. Make transcription fail, for example by turning off the network.
  3. When 'Transcription failed:' appears, press R.
  4. Check the same recording is transcribed again and the text appears without recording again.

## S49.07 Discard recording.

- **Expected:** The user can discard a recording without inserting or sending anything.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** agi, then type /dictate in the message box (labels found in the code)
- **Needs:** a microphone, and a transcription route (a signed-in account, OPENAI_API_KEY, or the whisper program on PATH)
- **Steps:**
  1. Type /dictate and press Enter, then press SPACE, say a few words, and press ESC before pressing ENTER.
  2. Check the notice 'dictation cancelled' appears.
  3. Check the message box is still empty, so nothing was inserted.
  4. Optionally, press ESC right after /dictate before SPACE to see the same notice.

## S49.09 Batch transcription.

- **Expected:** A whole recording or file can be transcribed in one non-streaming (batch) request.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** no screen of its own. The code sends each whole recording as one upload (transcribe_managed and transcribe_openai_api in apps/cli/src/voice.rs), and recording stops at 120 seconds. No batch control is shown to the user.
- **Needs:** a microphone, and a transcription route (a signed-in account, OPENAI_API_KEY, or the whisper program on PATH)
- **Steps:**
  1. Type /dictate, press Enter, then SPACE, speak for 10 to 20 seconds, and press ENTER.
  2. Watch the spinner 'Transcribing...' while it waits.
  3. Check the full text appears in one piece, with no partial words during the wait.

## S49.17 Recording notice and consent interface.

- **Expected:** Before audio is captured, the user sees a notice of what is recorded and where it goes, and must agree.
- **Code:** done. Evidence present: apps/cli/src/voice.rs:379
- **Where to find it:** agi, then type /dictate in the message box (first use only) (labels found in the code)
- **Needs:** a microphone, and a transcription route (a signed-in account, OPENAI_API_KEY, or the whisper program on PATH)
- **Steps:**
  1. Type /dictate and press Enter.
  2. Read the notice that says the microphone records only after SPACE and that each recording is sent to a named destination.
  3. Press ESC instead of ENTER and check 'dictation cancelled' appears with nothing recorded.
  4. Run /dictate again and press ENTER to agree, then check that SPACE starts recording.

## S49.19 Recording-duration display.

- **Expected:** While recording, the elapsed duration is shown.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** agi, then type /dictate in the message box (labels found in the code)
- **Needs:** a microphone, and a transcription route (a signed-in account, OPENAI_API_KEY, or the whisper program on PATH)
- **Steps:**
  1. Type /dictate, press Enter, then press SPACE.
  2. Watch the line that starts with REC: the seconds count up.
  3. Speak for about 5 seconds, then press ENTER to stop.
  4. Check the count stopped near the time you spoke and the line is gone or replaced.
