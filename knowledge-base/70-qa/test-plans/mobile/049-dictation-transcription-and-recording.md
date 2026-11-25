---
id: "PLAN-mobile-049"
type: "test-plan"
title: "Mobile · 49. Dictation, transcription, and recording"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "49"
---
# Mobile · 49. Dictation, transcription, and recording

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S49.01 Composer dictation.

- **Expected:** A microphone control in the composer turns speech into text in the message field.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:2245; apps/mobile/src/features/voice/components/VoiceInputButton.tsx:139 (quoted code not found in the file now); apps/mobile/src/features/voice/services/voiceInput.ts:438
- **Where to find it:** Settings > Voice > turn on "Voice Input"; then open any chat and tap the microphone button in the message field (labels found in the code)
- **Needs:** a microphone, phone width or Mac/iPhone with mic permission; the mic button only appears when Voice Input is on and the on-device recognizer is available
- **Steps:**
  1. Open Settings, then Voice, and turn on "Voice Input" (it is a toggle row).
  2. Open any chat so the message field and its controls show.
  3. Tap the microphone button (idle label "Tap to record, hold for push-to-talk").
  4. Speak a short sentence, then tap "Stop recording" (the square).
  5. Compare: the spoken words should appear as text in the message field.

## S49.02 Editable transcription before send.

- **Expected:** The dictated transcript lands in the message field where the user can edit it before sending.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:2363; apps/mobile/src/features/chat/components/ChatInput.tsx:237 (quoted code not found in the file now)
- **Where to find it:** Open a chat > microphone button > "Stop recording" (square); the text lands in the message field (labels found in the code)
- **Needs:** a microphone; phone width recommended
- **Steps:**
  1. Open any chat with Voice Input turned on in Settings > Voice.
  2. Tap the microphone button and speak a sentence with a mistake in it.
  3. Tap "Stop recording" (the square, not the arrow).
  4. Tap inside the message field and edit a word, then compare: the transcript should be there and editable, and nothing should be sent yet.

## S49.03 Dictation language selection.

- **Expected:** The user can choose the dictation language, and recognition uses it.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/services/speechSettings.ts:17; apps/mobile/src/features/settings/voice-language/index.tsx:197
- **Where to find it:** Settings > Voice > "Speech language" (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Open Settings, then Voice.
  2. Tap the row labelled "Speech language" and pick a different language from the list.
  3. Turn on Voice Input if it is off, open a chat, and dictate a sentence in the new language.
  4. Compare: the transcript should be in that language. The choice is stored per Local and Cloud mode.

## S49.05 Final transcript.

- **Expected:** When dictation ends, the final transcript is produced and delivered.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:2386; apps/mobile/src/features/voice/components/VoiceInputButton.tsx:160 (quoted code not found in the file now)
- **Where to find it:** Open a chat > microphone button > speak > "Stop recording"; the final transcript appears in the message field (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Turn on Voice Input, open a chat, and tap the microphone button.
  2. Speak one full sentence, then tap "Stop recording".
  3. Wait for the processing state to finish.
  4. Compare: the full sentence should appear once as the final text. If nothing was heard, the alert "Didn't catch that" appears instead.

## S49.06 Retry failed transcription.

- **Expected:** After a failed transcription the user can retry without starting over.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ChatInput.tsx:1377; apps/mobile/src/features/chat/components/ChatInput.tsx:2257
- **Where to find it:** Open a chat > microphone button > stay silent or fail > alert "Didn't catch that" > "Try again" (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Turn on Voice Input, open a chat, and tap the microphone button.
  2. Stay silent for a few seconds, or speak so it cannot be heard, then tap "Stop recording".
  3. When the alert "Didn't catch that" appears, tap "Try again".
  4. Compare: recording starts again straight away without you retyping anything. The alert says the audio is not saved, so you must speak again.

## S49.07 Discard recording.

- **Expected:** The user can discard a recording without inserting or sending anything.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:1948; apps/mobile/src/features/voice/components/VoiceInputButton.tsx:203 (quoted code not found in the file now)
- **Where to find it:** Open a chat > microphone button > while recording tap "Cancel recording" (the X) (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Turn on Voice Input, open a chat, and type a few words so you can see the field's current text.
  2. Tap the microphone button and speak a sentence.
  3. Tap "Cancel recording" (the X button on the left of the recording bar).
  4. Compare: the recording stops, nothing is added to the message field, and nothing is sent.

## S49.09 Batch transcription.

- **Expected:** A whole recording or file can be transcribed in one non-streaming (batch) request.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/voice.tsx:192 (quoted code not found in the file now); apps/mobile/src/features/voice/services/voiceInput.ts:495
- **Where to find it:** not found in the code. Found the batch path: TranscribeIntent.swift (title "Transcribe with AGI") hands an audio file to the app, and app/_layout.tsx (case 'transcribe') opens app/(app)/voice.tsx, which calls transcribeAudioFile in one request (voice.tsx lines 324-358, voiceInput.ts non-streaming path). I could not confirm from the code how a person starts that intent on the phone (the Shortcuts app or the Share sheet), so the path is left empty. Searched: rg for audioUri, transcribe and Transcribe with AGI in apps/mobile.
- **Needs:** an iPhone with a short audio recording saved in the Files app

## S49.10 Streaming transcription.

- **Expected:** Speech is transcribed as it streams, with text arriving during speech.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:440; apps/mobile/src/features/voice/services/liveVoiceSession.ts:663
- **Where to find it:** Settings > Voice > turn on "Voice Input"; open a chat > microphone button > speak; words appear in the field before you stop (labels found in the code)
- **Needs:** a microphone; an iPhone with on-device speech recognition for the live text
- **Steps:**
  1. Turn on Voice Input in Settings > Voice, open a chat.
  2. Tap the microphone button (the label becomes "Tap to stop recording").
  3. Speak slowly for several seconds without tapping anything.
  4. Compare: words should appear in the message field while you are still speaking, before "Stop recording" is tapped.

## S49.17 Recording notice and consent interface.

- **Expected:** Before audio is captured, the user sees a notice of what is recorded and where it goes, and must agree.
- **Code:** done. Evidence moved: apps/mobile/src/features/voice/components/VoiceOnboardingSheet.tsx:67; apps/mobile/src/features/voice/components/VoiceInputButton.tsx:298 (quoted code not found in the file now)
- **Where to find it:** Settings > Voice > turn on "Voice Input"; open a chat > tap the microphone button the first time > "Dictation" sheet > "Continue" (labels found in the code)
- **Needs:** a microphone; the sheet only appears the first time, so use an account or device that has not seen dictation yet
- **Steps:**
  1. Turn on Voice Input in Settings > Voice, then open a chat.
  2. Tap the microphone button for the first time (the sheet only appears once on this account or device).
  3. Read the sheet: title "Dictation", the line "Speak instead of typing. Your words appear as text in your message.", and the disclosure line.
  4. Compare: the disclosure should say where audio goes. Tap "Continue" to start recording; the sheet's X closes it without starting.

## S49.25 Transcript export.

- **Expected:** The user can export a recording transcript as a file.
- **Code:** done. Evidence present: apps/mobile/app/(app)/chat/[id].tsx:2837; apps/mobile/src/features/chat/components/ConversationExportSheet.tsx:129
- **Where to find it:** Open a chat that has a dictated message > the chat's action menu > "Export" > "Export as Text" or "Export as Markdown" or "Export as PDF" (labels found in the code)
- **Needs:** a chat with at least one message
- **Steps:**
  1. Open a chat that contains a message written with dictation.
  2. Open the chat's action menu and tap "Export".
  3. Tap "Export as Markdown" (or "Export as Text").
  4. Compare: the share sheet opens with a file that contains the dictated words in the conversation.

## S49.27 Retention and deletion controls.

- **Expected:** Recordings and transcripts have retention settings and can be deleted.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/chat/[id].tsx:1155 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No recording or dictation retention or delete control was found. Audio is not kept (ChatInput.tsx: "Audio isn't saved, so say it again."). Transcripts are chat messages, so they follow chat deletion. The only "Data retention" row is cloud-only (src/features/settings/cloud-privacy/index.tsx:44). Searched rg for retention, recording delete and transcript delete in apps/mobile/app and src.

## S49.30 Undo inserted text.

- **Expected:** Text inserted by dictation can be undone with the normal undo action.
- **Code:** unverified. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:237 (quoted code not found in the file now)
- **Needs:** device
- **Where to find it:** not found in the code. Searched rg -i undo in apps/mobile/src/features/chat/components/ChatInput.tsx and apps/mobile/src/features/voice: no match. The dictated text is inserted by the app's own state update, so whether the normal undo action reverts it was not verified from code.
- **Needs:** a device
