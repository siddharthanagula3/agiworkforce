# Area 48. Voice conversation interface

41 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S48.01 Voice entry from an existing chat.
- Should: From an open existing chat, a control starts a voice conversation bound to that chat.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5184; apps/web/features/chat/pages/WebChatPage.tsx:5778; apps/web/features/chat/hooks/use-voice-session.ts:380; apps/web/app/api/voice/live/sessions/route.ts:331; apps/desktop/electron/permissionPolicy.ts:43; apps/mobile/src/features/chat/components/ChatInput.tsx:1219; apps/mobile/app/(app)/chat/[id].tsx:975; apps/mobile/src/features/voice/components/LiveVoiceComposer.tsx:22

## S48.02 Start a new voice conversation.
- Should: A control starts a brand-new voice conversation (a new chat is created for it).
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5670; apps/web/features/chat/pages/WebChatPage.tsx:4959; apps/web/app/api/voice/live/sessions/route.ts:331; apps/desktop/electron/permissionPolicy.ts:43; apps/mobile/app/(app)/(tabs)/chat.tsx:906; apps/mobile/app/(app)/(tabs)/chat.tsx:687; apps/mobile/app/(app)/voice.tsx:135; .github/workflows/release-cli.yml:229

## S48.03 Integrated voice-and-text layout.
- Should: Voice runs inside the chat view: the transcript of spoken turns appears in the same message list as typed turns.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5772; apps/web/features/chat/pages/WebChatPage.tsx:4978; apps/web/features/chat/pages/WebChatPage.tsx:5002; apps/mobile/app/(app)/chat/[id].tsx:1589; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:96; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S48.04 Separate full-screen voice layout.
- Should: A separate full-screen voice layout exists (voice fills the view, transcript hidden or secondary).
- Status: web done, desktop done, mobile done
- Code: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:244; apps/web/features/chat/pages/WebChatPage.tsx:5709; apps/web/features/chat/stores/voice-session-store.ts:111; apps/mobile/app/(app)/voice.tsx:256; apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:101

## S48.05 Listening indicator.
- Should: While the assistant is listening, a visible (and announced) listening state is shown.
- Status: web done, desktop done, mobile done, cli done
- Code: packages/ui/unified-chat/src/components/VoiceOrb.tsx:257; packages/ui/unified-chat/src/voice/voice-session-machine.ts:234; apps/web/features/chat/hooks/use-voice-session.ts:269; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:45; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:134; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S48.06 Speaking indicator.
- Should: While the assistant speaks, a visible speaking state is shown.
- Status: web done, desktop done, mobile done
- Code: packages/ui/unified-chat/src/components/VoiceOrb.tsx:257; packages/ui/unified-chat/src/voice/voice-session-machine.ts:236; apps/web/features/chat/lib/live-voice-session.ts:507; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:44; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:138

## S48.07 Thinking/working indicator.
- Should: While the assistant is working (thinking or running a tool), a thinking/working state is shown.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/chat/components/Voice/VoiceOrb.tsx:24; apps/web/features/chat/components/Voice/voice-announcements.ts:8; apps/web/features/chat/lib/live-voice-session.ts:648; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:193; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:142; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S48.08 Waveform or amplitude visualization.
- Should: A waveform or amplitude visual follows the live microphone or reply audio level during voice.
- Status: web done, desktop done, mobile done, cli done
- Code: packages/ui/unified-chat/src/components/VoiceOrb.tsx:192; apps/web/features/chat/lib/live-voice-session.ts:316; apps/web/features/chat/pages/WebChatPage.tsx:6244; apps/desktop/electron/permissionPolicy.ts:43; apps/mobile/app/(app)/voice.tsx:109; apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:179; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S48.09 Microphone mute.
- Should: The user can mute and unmute the microphone without ending the voice conversation.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/chat/components/Voice/VoiceComposer.tsx:124; apps/web/features/chat/lib/live-voice-session.ts:393; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:226; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:213

## S48.10 End conversation.
- Should: A control ends the voice conversation, closing the session (and settling its usage).
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/chat/components/Voice/VoiceComposer.tsx:162; apps/web/features/chat/hooks/use-voice-session.ts:222; apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts:213; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:246; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:114; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S48.11 Pause/resume.
- Should: The user can pause the whole voice conversation (mic and assistant) and resume it later without ending it.
- Status: web done, desktop done
- Code: apps/web/features/chat/hooks/use-voice-session.ts:640; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:445; apps/web/features/chat/pages/WebChatPage.tsx:6244

## S48.12 Push-to-talk.
- Should: A push-to-talk mode records only while a key or button is held and sends on release.
- Status: web missing, desktop missing, mobile done, cli done
- Code: apps/mobile/app/(app)/voice.tsx:268; apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:249; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S48.13 Hands-free mode.
- Should: A hands-free mode keeps listening across turns without a button press per turn.
- Status: web done, desktop done, mobile done, cli missing
- Code: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:293; apps/web/features/chat/hooks/use-voice-session.ts:269; apps/web/features/chat/lib/live-voice-session.ts:543; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:45; apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:131

## S48.14 Interruption/barge-in.
- Should: Speaking while the assistant talks interrupts its spoken reply (barge-in).
- Status: web unverified, desktop unverified, mobile unverified
- Code: apps/web/app/api/voice/live/sessions/route.ts:339; apps/mobile/src/features/voice/services/liveVoiceSession.ts:393; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:43

## S48.15 Voice picker.
- Should: The user picks the assistant voice, and the chosen voice is the one the conversation speaks with.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/chat/components/Voice/VoiceHeaderLabel.tsx:29; apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx:266; apps/web/features/chat/lib/live-voice-session.ts:359; apps/web/app/api/voice/live/sessions/[sessionId]/settings/route.ts:104; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:152; apps/mobile/src/features/voice/components/VoicePickerSheet.tsx:84; apps/mobile/src/features/voice/components/VoicePickerSheet.tsx:110; apps/mobile/src/features/settings/voice-language/index.tsx:261

## S48.16 Voice preview.
- Should: The user can hear a sample of a voice before choosing it.
- Status: web partial, desktop partial, mobile partial
- Code: apps/web/public/voice-samples/manifest.json:2; apps/mobile/src/features/voice/components/VoicePickerSheet.tsx:270
- Unfinished: web: owner: run OPENAI_API_KEY=<server key> node scripts/generate-voice-samples.mjs from the repo root and commit apps/web/public/voice-samples (the manifest is empty, so Play sample stays hidden) | desktop: owner: run OPENAI_API_KEY=<server key> node scripts/generate-voice-samples.mjs from the repo root and commit apps/web/public/voice-samples (the manifest is empty, so Play sample stays hidden) | mobile: Play sample is built and reads the web manifest; same owner step as web: run scripts/generate-voice-samples.mjs and commit apps/web/public/voice-samples

## S48.17 Language selection.
- Should: The user can choose the spoken language of the voice conversation, and it is applied to recognition.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx:310; apps/web/features/chat/lib/live-voice-session.ts:363; apps/web/app/api/voice/live/sessions/route.ts:340; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:143; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S48.18 Input-device selection.
- Should: The user can choose which microphone (input device) voice uses.
- Status: web missing, desktop missing, cli missing

## S48.19 Output-device selection.
- Should: The user can choose which speaker (output device) voice plays through.
- Status: web done, desktop done
- Code: apps/web/features/chat/components/Voice/VoiceComposer.tsx:139; apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:90

## S48.20 Speaker/Bluetooth routing.
- Should: On devices with a speaker and Bluetooth, the user can route voice audio between speaker, earpiece/headset and Bluetooth.
- Status: not applicable anywhere

## S48.21 Captions.
- Should: Live captions of both speakers can be shown during voice.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/chat/components/Voice/VoiceComposer.tsx:146; apps/web/features/chat/components/Voice/VoiceCaptions.tsx:26; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:76; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:169; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:85; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S48.22 Transcript display.
- Should: A transcript of the voice conversation is displayed and kept with the chat.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:4978; apps/web/features/chat/pages/WebChatPage.tsx:4999; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:169; apps/mobile/stores/chat/chatMessageStore.ts:680; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S48.23 Transcript editing where appropriate.
- Should: Where appropriate, the user can correct a spoken turn's transcript before or after it is acted on.
- Status: not applicable anywhere

## S48.24 Type while speaking.
- Should: During a voice conversation the user can also type a message into the same conversation.
- Status: not applicable anywhere

## S48.25 View images and maps during Voice.
- Should: Voice replies can put images or maps on screen during the conversation.
- Status: web missing, desktop missing, mobile missing
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5772; apps/web/features/chat/lib/live-voice-session.ts:546; apps/mobile/app/(app)/chat/[id].tsx:1589; apps/mobile/src/features/voice/services/liveVoiceSession.ts:342
- Unfinished: web: The chat stays visible during voice, but spoken replies are speech plus transcript text only; give the voice turn a way to return images or maps. | desktop: Same as web. | mobile: Messages stay visible above the live bar, but voice replies carry transcript text only.

## S48.26 View tool results during Voice.
- Should: Tool activity and results from a voice turn are viewable during the conversation.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:271; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:304; apps/web/features/chat/hooks/use-voice-session.ts:392; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:316; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:349; apps/web/features/chat/hooks/use-voice-session.ts:425; apps/web/features/chat/pages/WebChatPage.tsx:6244; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:51

## S48.27 Approve an action during Voice.
- Should: An action requested by voice that needs approval can be approved or denied without leaving voice.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/chat/lib/live-voice-session.ts:283; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:258; apps/mobile/src/features/voice/services/liveVoiceSession.ts:185; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:200; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S48.28 Open a generated document from Voice.
- Should: A document generated during voice can be opened from the voice view.
- Status: web done, desktop done, mobile missing, cli done
- Code: apps/web/lib/voice/live-voice-tool-runner.ts:128; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:331; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:376; apps/desktop/electron/windowPolicy.ts:169; apps/desktop/electron/windowPolicy.ts:121; apps/desktop/electron/windowPolicy.ts:130; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S48.29 Attach image during Voice.
- Should: The user can attach an image to the conversation while voice continues.
- Status: web missing, desktop missing

## S48.30 Camera sharing.
- Should: The user can share the camera with the assistant during voice.
- Status: not applicable anywhere

## S48.31 Screen sharing.
- Should: The user can share their screen with the assistant during voice.
- Status: web missing, desktop missing, mobile missing

## S48.32 Camera switching.
- Should: While sharing the camera, the user can switch between front and back cameras.
- Status: web missing, desktop missing, mobile missing

## S48.33 Picture-in-picture.
- Should: Voice can continue in a picture-in-picture window while the user uses other screens or apps.
- Status: web missing, desktop missing, mobile missing

## S48.34 Background-conversation preference.
- Should: The user can choose whether voice keeps running in the background when they leave the app or tab.
- Status: web missing, desktop missing, mobile missing

## S48.35 Lock-screen controls.
- Should: Voice can be controlled (mute, end) from the device lock screen or system media controls.
- Status: web missing, desktop missing, mobile missing

## S48.36 Reconnection state.
- Should: When the voice connection drops, a reconnecting state is shown and the session reconnects (or says it could not).
- Status: web done, desktop done, mobile done
- Code: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:179; apps/web/features/chat/hooks/use-voice-session.ts:136; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:196; apps/mobile/src/features/voice/services/liveVoiceSession.ts:364

## S48.37 Usage-limit notice.
- Should: When voice usage is exhausted, the user sees a clear usage-limit notice in voice.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:190; apps/web/features/chat/lib/live-voice-session.ts:32; apps/web/app/api/voice/live/sessions/route.ts:246; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:115; apps/mobile/src/features/voice/services/liveVoiceSession.ts:107

## S48.38 Continue unfinished work in text.
- Should: The user can leave voice and continue the same unfinished conversation by typing.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/chat/components/Voice/VoiceComposer.tsx:162; apps/web/features/chat/pages/WebChatPage.tsx:5776; apps/web/features/chat/pages/WebChatPage.tsx:4999; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:204; apps/mobile/app/(app)/chat/[id].tsx:1022; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S48.39 Resume a previous voice conversation.
- Should: The user can reopen a previous voice conversation and continue it by voice with its earlier turns as context.
- Status: web done, desktop done, mobile done, cli done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5184; apps/web/app/api/voice/live/sessions/route.ts:307; apps/mobile/src/features/chat/components/ChatInput.tsx:1219; apps/mobile/src/features/voice/services/liveVoiceSession.ts:216; .github/workflows/release-cli.yml:229; apps/cli/src/voice.rs:956

## S48.40 Remote coding-session voice control.
- Should: The user can steer a remote coding session (running on another device) by voice.
- Status: web done, desktop done, mobile missing
- Code: apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:311; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:331; apps/web/features/code/components/CodeComposer.tsx:1561

## S48.41 Separate spoken-response cancellation from task cancellation.
- Should: The user can stop the spoken reply without cancelling the underlying task, and cancel the task separately.
- Status: web done, desktop done, mobile done
- Code: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:294; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:339; apps/web/features/chat/pages/WebChatPage.tsx:6244; apps/mobile/src/features/voice/services/liveVoiceSession.ts:275; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:304
