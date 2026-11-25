---
id: "PLAN-web-049"
type: "test-plan"
title: "Web · 49. Dictation, transcription, and recording"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "49"
---
# Web · 49. Dictation, transcription, and recording

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S49.01 Composer dictation.

- **Expected:** A microphone control in the composer turns speech into text in the message field.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6942; apps/web/features/chat/hooks/use-dictation.ts:101 (quoted code not found in the file now); apps/web/features/chat/stores/voice-input-store.ts:150 (quoted code not found in the file now); apps/web/app/api/voice/transcribe/route.ts:29
- **Earlier check in the running app:** UI_ONLY: E027 [UI_ONLY; scoped settings observation]: Dictation switch and language selector visible; no microphone recording.
- **Where to find it:** Message box > microphone button (no visible text; its label is "Start voice input"), then "Stop recording and edit the transcript" (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Sign in and open a chat with an empty message box.
  2. Click the microphone button next to the message box, labelled "Start voice input".
  3. Say a short sentence while the recording strip is shown.
  4. Click "Stop recording and edit the transcript" (the square button).
  5. Wait for "Transcribing" to disappear, then look at the message box: the spoken words should appear there, as in Expected.

## S49.02 Editable transcription before send.

- **Expected:** The dictated transcript lands in the message field where the user can edit it before sending.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/DictationStrip.tsx:20; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2033
- **Where to find it:** Message box > microphone button "Start voice input", then "Stop recording and edit the transcript" (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Start dictation with the "Start voice input" microphone button and say a sentence.
  2. Click "Stop recording and edit the transcript".
  3. When "Transcribing" finishes, click into the message box.
  4. Edit a word in the transcript, then check that the text changed and nothing has been sent yet.

## S49.03 Dictation language selection.

- **Expected:** The user can choose the dictation language, and recognition uses it.
- **Code:** done. Evidence present: apps/web/features/settings/sections/VoiceSection.tsx:189; apps/web/features/chat/stores/voice-input-store.ts:229
- **Earlier check in the running app:** UI_ONLY: E027 [UI_ONLY; scoped settings observation]: Dictation switch and language selector visible; no microphone recording.
- **Where to find it:** Settings > Voice > "Dictation language" (dropdown under the Dictation switch) (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Open Settings and click "Voice".
  2. Make sure the "Dictation" switch is on.
  3. Open the "Dictation language" dropdown and choose a different language.
  4. Close Settings, click "Start voice input", and speak in the chosen language.
  5. Check that the transcript comes back in that language, as in Expected.

## S49.05 Final transcript.

- **Expected:** When dictation ends, the final transcript is produced and delivered.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/DictationStrip.tsx:101; apps/web/features/chat/hooks/use-dictation.ts:139 (quoted code not found in the file now); apps/web/app/api/voice/transcribe/route.ts:29
- **Where to find it:** Message box > "Start voice input" microphone button, then "Stop recording and edit the transcript" (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Click "Start voice input", say a sentence, then click "Stop recording and edit the transcript".
  2. Watch the strip show "Transcribing".
  3. When the strip goes away, look at the message box for the final transcript.
  4. Compare the text with what you said.

## S49.06 Retry failed transcription.

- **Expected:** After a failed transcription the user can retry without starting over.
- **Code:** done. Evidence moved: apps/web/features/chat/stores/voice-input-store.ts:269 (quoted code not found in the file now); apps/web/features/chat/stores/voice-input-store.ts:278 (quoted code not found in the file now); apps/web/features/chat/hooks/use-dictation.ts:227
- **Where to find it:** Message box > "Start voice input" microphone button; on failure the strip shows "Try again" (labels found in the code)
- **Needs:** a microphone; a way to make transcription fail (the code does not say how a tester should cause a failure)
- **Steps:**
  1. Click "Start voice input", say a sentence, then click "Stop recording and edit the transcript".
  2. If transcription fails, the strip shows an error with a "Try again" button (or "Dismiss voice input error" to close it).
  3. Click "Try again" and check that the transcript is produced without recording again.
  4. Compare with Expected.

## S49.07 Discard recording.

- **Expected:** The user can discard a recording without inserting or sending anything.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/DictationStrip.tsx:18; apps/web/features/chat/hooks/use-dictation.ts:152 (quoted code not found in the file now)
- **Where to find it:** Message box > "Start voice input" microphone button, then the round "Discard recording" button at the left of the strip (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Click "Start voice input" and say a sentence.
  2. Click "Discard recording" (the X button at the left of the strip).
  3. Check that the strip closes and the message box is unchanged, with no transcript added.
  4. Optional: repeat and press Escape instead of clicking the X; the recording should be discarded the same way.

## S49.09 Batch transcription.

- **Expected:** A whole recording or file can be transcribed in one non-streaming (batch) request.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6942; apps/web/features/chat/hooks/use-dictation.ts:101 (quoted code not found in the file now); apps/web/features/chat/stores/voice-input-store.ts:150 (quoted code not found in the file now); apps/web/app/api/voice/transcribe/route.ts:29
- **Where to find it:** no screen of its own. The transcription handler file does not name its mode; batch behaviour is inferred from the single POST and the Transcribing state, not verified against a running request.
- **Needs:** a microphone
- **Steps:**
  1. Click "Start voice input", say a longer sentence, then click "Stop recording and edit the transcript".
  2. Watch the strip: no partial text appears while speaking; "Transcribing" shows until the whole transcript is ready.
  3. Compare with Expected: the full transcript arrives in one piece after the recording stops.

## S49.10 Streaming transcription.

- **Expected:** Speech is transcribed as it streams, with text arriving during speech.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceComposer.tsx:146 (quoted code not found in the file now); apps/web/features/chat/lib/live-voice-session.ts:1011
- **Where to find it:** Message box (empty) > "Start voice mode" button, then the live call screen with "End voice session" (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Sign in, open a chat and leave the message box empty.
  2. Click the button labelled "Start voice mode" (it appears next to the message box when there is no text).
  3. Allow the microphone and speak; watch whether your words appear as text while you are still talking.
  4. Click "End voice session" when done.

## S49.17 Recording notice and consent interface.

- **Expected:** Before audio is captured, the user sees a notice of what is recorded and where it goes, and must agree.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/web for notice, agree, consent and recorded in the voice, composer, dictation and live-voice files; found no recording notice. The only consent code is for named model providers (apps/web/features/models), which is unrelated.
- **Needs:** a microphone

## S49.25 Transcript export.

- **Expected:** The user can export a recording transcript as a file.
- **Code:** done. Evidence present: apps/web/features/chat/lib/live-voice-session.ts:1
- **Where to find it:** not found in the code. No transcript-only export found. The nearest is "Export…" in the conversation title menu (apps/web/features/chat/components/ConversationTitleMenu.tsx), which exports the whole conversation, not a recording transcript.
- **Needs:** a conversation with dictated or voice text

## S49.27 Retention and deletion controls.

- **Expected:** Recordings and transcripts have retention settings and can be deleted.
- **Code:** done. Evidence present: apps/web/features/chat/stores/voice-input-store.ts:1
- **Where to find it:** not found in the code. No retention or delete control for voice recordings or transcripts found. The only retention control is the workspace "Retention window" in apps/web/features/settings/sections/WorkspacePolicySection.tsx, which is not shown to be about voice. The store has an internal clearTranscript (apps/web/features/chat/stores/voice-input-store.ts), with no button found.

## S49.30 Undo inserted text.

- **Expected:** Text inserted by dictation can be undone with the normal undo action.
- **Code:** unverified. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2026
- **Needs:** live-web
- **Where to find it:** no screen of its own. Dictated text is added with appendText (ChatComposerNew.tsx ~line 1996), and clear and setText purge undo history (ChatComposerNew.tsx ~line 1968); whether this insert joins undo history was not verified in a running app.
- **Needs:** a microphone
- **Steps:**
  1. Click "Start voice input", say a sentence, then click "Stop recording and edit the transcript" and wait for the text to land in the message box.
  2. Click into the message box and press Cmd+Z.
  3. Compare with Expected: the dictated text should be removed by the normal undo.
