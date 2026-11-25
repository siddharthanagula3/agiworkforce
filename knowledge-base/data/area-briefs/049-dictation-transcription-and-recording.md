# Area 49. Dictation, transcription, and recording

30 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S49.01 Composer dictation.
- Should: A microphone control in the composer turns speech into text in the message field.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5170; apps/web/features/chat/hooks/use-dictation.ts:101; apps/web/features/chat/stores/voice-input-store.ts:150; apps/web/app/api/voice/transcribe/route.ts:29; apps/desktop/electron/permissionPolicy.ts:43; apps/mobile/src/features/chat/components/ChatInput.tsx:1134; apps/mobile/src/features/voice/components/VoiceInputButton.tsx:139; apps/mobile/src/features/voice/services/voiceInput.ts:293

## S49.02 Editable transcription before send.
- Should: The dictated transcript lands in the message field where the user can edit it before sending.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done
- Code: apps/web/features/chat/components/Composer/DictationStrip.tsx:19; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1613; apps/mobile/src/features/chat/components/ChatInput.tsx:1170; apps/mobile/src/features/chat/components/ChatInput.tsx:237; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956; apps/extension/src/side_panel.ts:10170; apps/extension/src/features/side-panel/voice.ts:96

## S49.03 Dictation language selection.
- Should: The user can choose the dictation language, and recognition uses it.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done, api done
- Code: apps/web/features/settings/sections/VoiceSection.tsx:114; apps/web/features/chat/stores/voice-input-store.ts:148; apps/mobile/src/features/voice/services/speechSettings.ts:17; apps/mobile/src/features/settings/voice-language/index.tsx:168; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956; apps/extension/src/side_panel.ts:7466; apps/extension/src/features/side-panel/voice.ts:82

## S49.04 Interim transcript.
- Should: While dictating, interim (partial) text appears before the recording ends.
- Status: not applicable anywhere

## S49.05 Final transcript.
- Should: When dictation ends, the final transcript is produced and delivered.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done, api done
- Code: apps/web/features/chat/components/Composer/DictationStrip.tsx:95; apps/web/features/chat/hooks/use-dictation.ts:139; apps/web/app/api/voice/transcribe/route.ts:29; apps/mobile/src/features/chat/components/ChatInput.tsx:1195; apps/mobile/src/features/voice/components/VoiceInputButton.tsx:160; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956; apps/extension/src/side_panel.ts:10170

## S49.06 Retry failed transcription.
- Should: After a failed transcription the user can retry without starting over.
- Status: web done, desktop done, mobile done, cli done, vscode missing
- Code: apps/web/features/chat/stores/voice-input-store.ts:269; apps/web/features/chat/stores/voice-input-store.ts:278; apps/web/features/chat/hooks/use-dictation.ts:166; apps/web/features/desktop-host/hooks/use-desktop-voice-hotkey.ts:19; apps/mobile/src/features/chat/components/ChatInput.tsx:595; apps/mobile/src/features/chat/components/ChatInput.tsx:1259; apps/cli/src/voice.rs:357

## S49.07 Discard recording.
- Should: The user can discard a recording without inserting or sending anything.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/DictationStrip.tsx:17; apps/web/features/chat/hooks/use-dictation.ts:152; apps/mobile/src/features/chat/components/ChatInput.tsx:924; apps/mobile/src/features/voice/components/VoiceInputButton.tsx:203; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S49.08 Audio-file upload.
- Should: The user can upload an existing audio file and get its transcript.
- Status: web missing, desktop missing, cli missing, vscode missing, chrome missing, api done
- Code: apps/web/app/api/llm/v1/audio/transcriptions/route.ts:590; apps/web/app/api/llm/v1/audio/transcriptions/route.ts:344

## S49.09 Batch transcription.
- Should: A whole recording or file can be transcribed in one non-streaming (batch) request.
- Status: web done, desktop done, mobile done, cli done, vscode missing, api done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5170; apps/web/features/chat/hooks/use-dictation.ts:101; apps/web/features/chat/stores/voice-input-store.ts:150; apps/web/app/api/voice/transcribe/route.ts:29; apps/mobile/app/(app)/voice.tsx:192; apps/mobile/src/features/voice/services/voiceInput.ts:431; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S49.10 Streaming transcription.
- Should: Speech is transcribed as it streams, with text arriving during speech.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing, api missing
- Code: apps/web/features/chat/components/Voice/VoiceComposer.tsx:146; apps/web/features/chat/lib/live-voice-session.ts:543; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:169; apps/mobile/src/features/voice/services/liveVoiceSession.ts:339

## S49.11 Timestamped transcript.
- Should: A transcript can carry timestamps per segment or word.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S49.12 Speaker labels.
- Should: A multi-speaker transcript labels who spoke each part.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S49.13 Speaker-name correction.
- Should: The user can correct or rename speaker labels in a transcript.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S49.14 Transcript search.
- Should: The user can search within a recording transcript.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S49.15 Click transcript to seek audio.
- Should: Clicking a transcript line seeks the audio to that moment.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S49.16 Meeting recording.
- Should: The user can record a meeting and get it transcribed.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S49.17 Recording notice and consent interface.
- Should: Before audio is captured, the user sees a notice of what is recorded and where it goes, and must agree.
- Status: web unverified, desktop unverified, mobile done, cli done, vscode missing, chrome missing
- Code: apps/mobile/src/features/voice/components/VoiceOnboardingSheet.tsx:57; apps/mobile/src/features/voice/components/VoiceInputButton.tsx:298; apps/cli/src/voice.rs:379

## S49.18 Pause and resume recording.
- Should: The user can pause and resume a recording in progress.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S49.19 Recording-duration display.
- Should: While recording, the elapsed duration is shown.
- Status: web missing, desktop missing, cli done, vscode missing, chrome missing
- Code: .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S49.20 Meeting summary.
- Should: A recorded meeting produces a summary.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S49.21 Action-item extraction.
- Should: Action items are extracted from a recording transcript.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S49.22 Decisions summary.
- Should: Decisions made are summarised from a recording transcript.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S49.23 Follow-up email draft.
- Should: A follow-up email draft is generated from a recording.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S49.24 Recording-to-Project association.
- Should: A recording and its transcript can be associated with a project.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S49.25 Transcript export.
- Should: The user can export a recording transcript as a file.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/lib/live-voice-session.ts:1; apps/web/features/chat/pages/WebChatPage.tsx:5851; apps/mobile/app/(app)/chat/[id].tsx:1599; apps/mobile/src/features/chat/components/ConversationExportSheet.tsx:96

## S49.26 Audio download.
- Should: The user can download the original recording audio.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S49.27 Retention and deletion controls.
- Should: Recordings and transcripts have retention settings and can be deleted.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/chat/stores/voice-input-store.ts:1; apps/web/features/chat/pages/WebChatPage.tsx:4999; apps/web/app/api/chat/conversations/[id]/route.ts:517; apps/mobile/app/(app)/chat/[id].tsx:1155

## S49.28 Desktop dictation into another application.
- Should: A global desktop shortcut dictates into whatever application is focused, not only the product window.
- Status: desktop missing, mobile missing, chrome missing

## S49.29 Spoken rewriting of selected text.
- Should: The user can select text and speak an instruction to rewrite it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S49.30 Undo inserted text.
- Should: Text inserted by dictation can be undone with the normal undo action.
- Status: web unverified, desktop unverified, mobile unverified, vscode missing, chrome unverified
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1606; apps/mobile/src/features/chat/components/ChatInput.tsx:237; apps/extension/src/features/side-panel/voice.ts:96
