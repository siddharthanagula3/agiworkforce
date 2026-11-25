---
id: "PLAN-desktop-049"
type: "test-plan"
title: "Desktop · 49. Dictation, transcription, and recording"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "49"
---
# Desktop · 49. Dictation, transcription, and recording

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S49.01 Composer dictation.

- **Expected:** A microphone control in the composer turns speech into text in the message field.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6942; apps/web/features/chat/hooks/use-dictation.ts:101 (quoted code not found in the file now); apps/web/features/chat/stores/voice-input-store.ts:150 (quoted code not found in the file now); apps/web/app/api/voice/transcribe/route.ts:29; apps/desktop/electron/permissionPolicy.ts:56
- **Where to find it:** Chat message box (composer) > Start voice input (microphone button beside the send button) (labels found in the code)
- **Needs:** a microphone; a browser that supports voice input (Chrome or Edge per the button hint)
- **Steps:**
  1. Sign in and open a new chat so the message box is visible.
  2. Click the microphone button labelled Start voice input.
  3. Speak one sentence; the strip shows a moving waveform and the Voice dictation group is visible.
  4. Click the square button labelled Stop recording and edit the transcript.
  5. Look: the spoken words appear as text in the message box, ready to edit.

## S49.02 Editable transcription before send.

- **Expected:** The dictated transcript lands in the message field where the user can edit it before sending.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/DictationStrip.tsx:20; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2033
- **Where to find it:** Chat message box (composer) > Start voice input > Stop recording and edit the transcript (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Click Start voice input and speak a sentence.
  2. Click Stop recording and edit the transcript (not Enter, which sends at once).
  3. Wait for the transcript to appear in the message box.
  4. Click into the text, change a word, and check the edit is kept.
  5. Look: the message is not sent until you press the send button; the edited text is what gets sent.

## S49.03 Dictation language selection.

- **Expected:** The user can choose the dictation language, and recognition uses it.
- **Code:** done. Evidence present: apps/web/features/settings/sections/VoiceSection.tsx:189; apps/web/features/chat/stores/voice-input-store.ts:229
- **Where to find it:** Settings > Voice > Dictation language (dropdown; the Settings path to the Voice section was not traced) (labels found in the code)
- **Needs:** a microphone; a second language you can speak
- **Steps:**
  1. Open Settings and go to the Voice section.
  2. Turn on the Dictation switch, which enables the language dropdown.
  3. Open the Dictation language dropdown and choose a different language.
  4. Go back to the chat, click Start voice input, speak in that language, then stop.
  5. Look: the transcript is written in the chosen language, as Expected.

## S49.05 Final transcript.

- **Expected:** When dictation ends, the final transcript is produced and delivered.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/DictationStrip.tsx:101; apps/web/features/chat/hooks/use-dictation.ts:139 (quoted code not found in the file now)
- **Where to find it:** Chat message box (composer) > Start voice input > Stop recording and edit the transcript (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Dictate a sentence with Start voice input.
  2. Click Stop recording and edit the transcript.
  3. Watch the strip show Transcribing with a spinner.
  4. Wait until the spinner stops.
  5. Look: the complete final transcript is in the message box, after any text that was already there.

## S49.06 Retry failed transcription.

- **Expected:** After a failed transcription the user can retry without starting over.
- **Code:** done. Evidence moved: apps/web/features/chat/stores/voice-input-store.ts:269 (quoted code not found in the file now); apps/web/features/chat/stores/voice-input-store.ts:278 (quoted code not found in the file now); apps/web/features/chat/hooks/use-dictation.ts:227; apps/web/features/desktop-host/hooks/use-desktop-voice-hotkey.ts:19
- **Where to find it:** Chat message box (composer) > Start voice input > Stop recording and edit the transcript > Try again (shown after an error) (labels found in the code)
- **Needs:** a microphone; a way to switch off the internet (for example Wi-Fi off)
- **Steps:**
  1. Click Start voice input and speak a sentence.
  2. Turn off the internet connection before stopping, so transcription fails.
  3. Click Stop recording and edit the transcript; wait for the red error text in the strip.
  4. Turn the connection back on and click Try again.
  5. Look: the transcript appears without recording again.

## S49.07 Discard recording.

- **Expected:** The user can discard a recording without inserting or sending anything.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/DictationStrip.tsx:18; apps/web/features/chat/hooks/use-dictation.ts:152 (quoted code not found in the file now)
- **Where to find it:** Chat message box (composer) > Start voice input > Discard recording (round X button at the left of the strip) (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Click Start voice input and speak a sentence.
  2. Click the X button labelled Discard recording.
  3. Look: the strip closes and the message box is unchanged, with no text added and nothing sent.

## S49.09 Batch transcription.

- **Expected:** A whole recording or file can be transcribed in one non-streaming (batch) request.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6942; apps/web/features/chat/hooks/use-dictation.ts:101 (quoted code not found in the file now); apps/web/features/chat/stores/voice-input-store.ts:150 (quoted code not found in the file now); apps/web/app/api/voice/transcribe/route.ts:29
- **Where to find it:** no screen of its own. The batch request is transcribeViaServer in apps/web/features/chat/stores/voice-input-store.ts, posting to apps/web/app/api/voice/transcribe/route.ts; I did not read the route body.
- **Needs:** a microphone
- **Steps:**
  1. Click Start voice input and speak a longer sentence.
  2. Click Stop recording and edit the transcript.
  3. Watch the Transcribing spinner; no text appears while speaking.
  4. Look: the whole transcript appears in one piece when transcription finishes.

## S49.10 Streaming transcription.

- **Expected:** Speech is transcribed as it streams, with text arriving during speech.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceComposer.tsx:146 (quoted code not found in the file now); apps/web/features/chat/lib/live-voice-session.ts:1011
- **Where to find it:** Chat message box (composer) with empty text > Start voice mode (voice entry button on the right) (labels found in the code)
- **Needs:** a microphone; a plan that allows voice mode (not checked)
- **Steps:**
  1. Leave the message box empty and click the button labelled Start voice mode.
  2. Speak a sentence slowly while the voice screen is open.
  3. Look: whether words appear as text while you are still speaking, as Expected.

## S49.17 Recording notice and consent interface.

- **Expected:** Before audio is captured, the user sees a notice of what is recorded and where it goes, and must agree.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/web/features/chat/components/Voice, apps/web/features/chat/components/Composer and VoiceSection.tsx for consent, recorded and notice; no pre-capture consent screen found. The only related text is the microphone purpose Dictation and voice conversations in packages/contracts/local-runtime/src/desktop-privacy.ts, which is a system permission review line, not a shown notice.
- **Needs:** a microphone; a fresh start of voice capture

## S49.25 Transcript export.

- **Expected:** The user can export a recording transcript as a file.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7934
- **Where to find it:** Open a conversation > conversation title menu > Export… (labels found in the code)
- **Needs:** a conversation with dictated text
- **Steps:**
  1. Open a conversation that contains dictated text.
  2. Open the conversation's title menu (the menu that holds Export…).
  3. Click Export….
  4. Choose a format in the Export Chat History dialog and click its export button.
  5. Look: a file downloads and contains the dictated text.

## S49.27 Retention and deletion controls.

- **Expected:** Recordings and transcripts have retention settings and can be deleted.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:6770; apps/web/app/api/chat/conversations/[id]/route.ts:592
- **Where to find it:** Open a conversation > conversation title menu > Delete (retention window is in the workspace policy settings and needs a workspace admin) (labels found in the code)
- **Needs:** a conversation; a workspace admin account to see retention settings
- **Steps:**
  1. Open a conversation that contains dictated text.
  2. Open the conversation's title menu and click Delete.
  3. Read and confirm any prompt that appears.
  4. Look: the conversation disappears from the sidebar and cannot be reopened.
  5. For the retention setting, go to the workspace policy section with the Retention window and Enforce retention fields and check they are shown.

## S49.30 Undo inserted text.

- **Expected:** Text inserted by dictation can be undone with the normal undo action.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Dictated text is added through appendComposerMessage in apps/web/features/chat/components/Composer/ChatComposerNew.tsx; I searched ChatComposerNew.tsx and use-dictation.ts for undo and found no dictation-specific undo handling, so Cmd+Z behaviour is unverified.
- **Needs:** a microphone; a chat message box
