---
id: "PLAN-desktop-048"
type: "test-plan"
title: "Desktop · 48. Voice conversation interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "48"
---
# Desktop · 48. Voice conversation interface

28 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S48.01 Voice entry from an existing chat.

- **Expected:** From an open existing chat, a control starts a voice conversation bound to that chat.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6956; apps/web/features/chat/pages/WebChatPage.tsx:5778 (quoted code not found in the file now); apps/web/features/chat/hooks/use-voice-session.ts:837; apps/web/app/api/voice/live/sessions/route.ts:331 (quoted code not found in the file now); apps/desktop/electron/permissionPolicy.ts:56
- **Where to find it:** Open an existing chat > bottom composer, with the text field empty > "Start voice mode" button at the right end of the composer (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Sign in and open an existing chat from the sidebar.
  2. Leave the message box empty and look at the right end of the composer.
  3. Click the button labelled "Start voice mode".
  4. Check that the voice view opens in this chat and that the chat's earlier messages are still there.

## S48.02 Start a new voice conversation.

- **Expected:** A control starts a brand-new voice conversation (a new chat is created for it).
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:5670 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:4959 (quoted code not found in the file now); apps/desktop/electron/permissionPolicy.ts:56
- **Where to find it:** New chat > bottom composer, with the text field empty > "Start voice mode" button (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Sign in and click New chat in the sidebar.
  2. Leave the message box empty and find the "Start voice mode" button at the right end of the composer.
  3. Click it and check that voice starts in a new chat.

## S48.03 Integrated voice-and-text layout.

- **Expected:** Voice runs inside the chat view: the transcript of spoken turns appears in the same message list as typed turns.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:7794; apps/web/features/chat/pages/WebChatPage.tsx:6739
- **Where to find it:** Open a chat > "Start voice mode" button in the composer > voice view (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Open a chat and click "Start voice mode" with the text field empty.
  2. Speak one turn, then type one message in the "Type a message to send as a normal turn" field.
  3. Look at the chat's message list and check that spoken and typed turns appear in the same list.

## S48.04 Separate full-screen voice layout.

- **Expected:** A separate full-screen voice layout exists (voice fills the view, transcript hidden or secondary).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:244 (quoted code not found in the file now); apps/web/features/chat/stores/voice-session-store.ts:190
- **Where to find it:** Open a chat > "Start voice mode" button in the composer > voice view fills the window (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Click "Start voice mode" from the composer of any chat.
  2. Check whether the voice view fills the window, with the orb in the centre.
  3. Check whether the transcript is hidden or shown in a smaller area.

## S48.05 Listening indicator.

- **Expected:** While the assistant is listening, a visible (and announced) listening state is shown.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/VoiceOrb.tsx:268; packages/ui/unified-chat/src/voice/voice-session-machine.ts:234
- **Where to find it:** not found in the code. The listening state is drawn by VoiceOrb (packages/ui/unified-chat/src/components/VoiceOrb.tsx) and the state machine (packages/ui/unified-chat/src/voice/voice-session-machine.ts), but I did not find a visible word for the listening state, so I could not give the exact path to it.
- **Needs:** a signed-in account with voice access and a microphone

## S48.06 Speaking indicator.

- **Expected:** While the assistant speaks, a visible speaking state is shown.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/VoiceOrb.tsx:268; apps/web/features/chat/lib/live-voice-session.ts:955
- **Where to find it:** not found in the code. The speaking state is drawn by VoiceOrb and live-voice-session.ts, but I did not find its visible words; the "Tap to hear the assistant" text is a different state (audio blocked).
- **Needs:** a signed-in account with voice access and a microphone

## S48.07 Thinking/working indicator.

- **Expected:** While the assistant is working (thinking or running a tool), a thinking/working state is shown.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceOrb.tsx:27; apps/web/features/chat/lib/live-voice-session.ts:648 (quoted code not found in the file now)
- **Where to find it:** Start voice mode > ask a question that needs a tool or a long answer > the status line while the reply is working (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Start voice mode from a chat.
  2. Ask for something that needs a tool, such as a search.
  3. While the reply is still working, look for the status text "Working on your request".
  4. Compare it with the orb's thinking or working look.

## S48.08 Waveform or amplitude visualization.

- **Expected:** A waveform or amplitude visual follows the live microphone or reply audio level during voice.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/VoiceOrb.tsx:192; apps/web/features/chat/lib/live-voice-session.ts:436; apps/web/features/chat/pages/WebChatPage.tsx:7665; apps/desktop/electron/permissionPolicy.ts:56
- **Where to find it:** no screen of its own. The visual follows audio level in VoiceOrb.tsx; it has no control of its own.
- **Needs:** a microphone
- **Steps:**
  1. Start voice mode and speak.
  2. Watch the orb while you talk and while the reply plays.
  3. Check that the orb's shape changes with the loudness of the sound.

## S48.09 Microphone mute.

- **Expected:** The user can mute and unmute the microphone without ending the voice conversation.
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceComposer.tsx:118; apps/web/features/chat/lib/live-voice-session.ts:786
- **Where to find it:** Start voice mode > bottom bar of the voice view > microphone button labelled "Turn off microphone" (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Start voice mode from a chat.
  2. Click the microphone button in the bottom bar; its label is "Turn off microphone".
  3. Check that the button changes to "Turn on microphone" and the call stays open.
  4. Click again and check the microphone is back on without the call ending.

## S48.10 End conversation.

- **Expected:** A control ends the voice conversation, closing the session (and settling its usage).
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceComposer.tsx:138; apps/web/features/chat/hooks/use-voice-session.ts:504
- **Where to find it:** Start voice mode > bottom bar of the voice view > "End voice session" button (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Start voice mode from a chat.
  2. Click the button labelled "End voice session" in the bottom bar.
  3. Check that the voice view closes and the call stops.
  4. Check the chat still shows the conversation.

## S48.11 Pause/resume.

- **Expected:** The user can pause the whole voice conversation (mic and assistant) and resume it later without ending it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:445 (quoted code not found in the file now); apps/web/features/chat/hooks/use-voice-session.ts:942; apps/web/features/chat/pages/WebChatPage.tsx:7665
- **Where to find it:** Start voice mode > "Open this chat panel" button > "Pause call" item (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Start voice mode from a chat.
  2. Click the "Open this chat panel" button in the voice bottom bar.
  3. In the menu labelled "In this chat", click "Pause call".
  4. Check the screen shows "Paused." text with a "Resume" button, then click "Resume" and check the call continues.

## S48.13 Hands-free mode.

- **Expected:** A hands-free mode keeps listening across turns without a button press per turn.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:607; apps/web/features/chat/hooks/use-voice-session.ts:269 (quoted code not found in the file now)
- **Where to find it:** not found in the code. I searched apps/web/features/chat/components/Voice, the voice hook and packages/ui/unified-chat/src/voice for hands-free and found no visible control or label for it.
- **Needs:** a signed-in account with voice access and a microphone

## S48.14 Interruption/barge-in.

- **Expected:** Speaking while the assistant talks interrupts its spoken reply (barge-in).
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** external-service
- **Where to find it:** no screen of its own. Barge-in is a threshold rule (BARGE_IN_LEVEL_THRESHOLD) in packages/ui/unified-chat/src/voice/voice-session-machine.ts and has no control; I did not confirm it runs in the browser.
- **Needs:** a microphone and an external voice service
- **Steps:**
  1. Start voice mode and ask a question with a long answer.
  2. While the assistant is speaking, speak loudly for a moment.
  3. Check that the spoken reply stops and the app starts listening to you.

## S48.15 Voice picker.

- **Expected:** The user picks the assistant voice, and the chosen voice is the one the conversation speaks with.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceHeaderLabel.tsx:28; apps/web/features/chat/lib/live-voice-session.ts:359 (quoted code not found in the file now)
- **Where to find it:** Start voice mode > "Voice settings" button at the top of the voice view > "Voice" carousel (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Start voice mode from a chat.
  2. Click the "Voice settings" link at the top of the voice view.
  3. In the dialog titled "Voice settings", use the arrows in the "Voice" section to change the voice.
  4. Start a reply and check that the chosen voice is the one speaking.

## S48.16 Voice preview.

- **Expected:** The user can hear a sample of a voice before choosing it.
- **Code:** partial. Evidence present: apps/web/public/voice-samples/manifest.json:2
- **Known to be unfinished:** owner: run OPENAI_API_KEY=<server key> node scripts/generate-voice-samples.mjs from the repo root and commit apps/web/public/voice-samples (the manifest is empty, so Play sample stays hidden)
- **Where to find it:** Start voice mode > "Voice settings" > voice carousel > "Play sample" button (labels found in the code)
- **Needs:** a signed-in account with voice access
- **Steps:**
  1. Open "Voice settings" from the top of the voice view.
  2. Look at the voice carousel for a "Play sample" button.
  3. Click "Play sample" and check that a short sample plays in that voice.

## S48.17 Language selection.

- **Expected:** The user can choose the spoken language of the voice conversation, and it is applied to recognition.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx:297; apps/web/features/chat/lib/live-voice-session.ts:363 (quoted code not found in the file now)
- **Where to find it:** Start voice mode > "Voice settings" > "Language" picker (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Open "Voice settings" from the top of the voice view.
  2. Find the "Language" section and pick a different language.
  3. Start a new turn in voice and check the spoken language matches the choice.

## S48.19 Output-device selection.

- **Expected:** The user can choose which speaker (output device) voice plays through.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceComposer.tsx:139 (quoted code not found in the file now); apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:90
- **Where to find it:** Start voice mode > "Voice settings" > "Audio output" menu (labels found in the code)
- **Needs:** a signed-in account with voice access, a microphone, and a second speaker or headphones
- **Steps:**
  1. Open "Voice settings" from the top of the voice view.
  2. Find the "Audio output" control and open it.
  3. Check the menu titled "Audio output device" lists "System default" and the other speakers.
  4. Pick a speaker and check the next reply plays through it.

## S48.21 Captions.

- **Expected:** Live captions of both speakers can be shown during voice.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceComposer.tsx:146 (quoted code not found in the file now); apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:176
- **Where to find it:** Start voice mode > "Open this chat panel" button > "Captions" item (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Start voice mode from a chat.
  2. Click "Open this chat panel" and then "Captions".
  3. Check a region labelled "Voice captions" appears.
  4. Speak and let the assistant reply, then check both speakers' lines appear.

## S48.22 Transcript display.

- **Expected:** A transcript of the voice conversation is displayed and kept with the chat.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:6739; apps/web/features/chat/pages/WebChatPage.tsx:6770
- **Where to find it:** Start voice mode > speak a few turns > end the call > open the same chat and read the message list (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Start voice mode from a chat and have a short spoken exchange.
  2. End the call with "End voice session".
  3. Read the same chat's message list.
  4. Check the spoken turns appear as a transcript kept with the chat.

## S48.26 View tool results during Voice.

- **Expected:** Tool activity and results from a voice turn are viewable during the conversation.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:316 (quoted code not found in the file now); apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:349 (quoted code not found in the file now); apps/web/features/chat/hooks/use-voice-session.ts:425 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7665
- **Where to find it:** Start voice mode > "Activity" panel during a voice turn that uses a tool (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Start voice mode and ask for something that uses a tool.
  2. Open the activity view during the turn (the "Activity" panel).
  3. Check the tool steps and results are listed, and that the panel closes with "Close the activity panel".

## S48.27 Approve an action during Voice.

- **Expected:** An action requested by voice that needs approval can be approved or denied without leaving voice.
- **Code:** done. Evidence moved: apps/web/features/chat/lib/live-voice-session.ts:409; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:258 (quoted code not found in the file now)
- **Where to find it:** Start voice mode > ask for an action that needs approval > approval card in the voice view > "Approve" button (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Start voice mode and ask for an action that needs approval.
  2. When the approval card appears in the voice view, read its summary.
  3. Click the approve button labelled "Approve" with the action name.
  4. Check the reply continues without leaving the voice view.

## S48.28 Open a generated document from Voice.

- **Expected:** A document generated during voice can be opened from the voice view.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:502; apps/web/lib/voice/live-voice-tool-runner.ts:128 (quoted code not found in the file now); apps/desktop/electron/windowPolicy.ts:332; apps/desktop/electron/windowPolicy.ts:262; apps/desktop/electron/windowPolicy.ts:271
- **Where to find it:** Start voice mode > ask for a document > the file card in the voice view > "Open" button (labels found in the code)
- **Needs:** a signed-in account with voice access, a microphone, and a voice turn that creates a file
- **Steps:**
  1. Start voice mode and ask the assistant to create a document.
  2. When the file appears in the voice view, click its "Open" button (its label includes the file name).
  3. Check the document opens.

## S48.36 Reconnection state.

- **Expected:** When the voice connection drops, a reconnecting state is shown and the session reconnects (or says it could not).
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:306; apps/web/features/chat/hooks/use-voice-session.ts:241
- **Where to find it:** Start voice mode > the connection drops (for example, turn off Wi-Fi for a moment) > "Reconnecting, attempt" notice (labels found in the code)
- **Needs:** a signed-in account with voice access, a microphone, and the ability to drop the network
- **Steps:**
  1. Start voice mode and speak once.
  2. Turn Wi-Fi off for a few seconds, then back on.
  3. Look for the "Reconnecting, attempt" notice with the count of attempts.
  4. Check that the call reconnects or shows that it could not.

## S48.37 Usage-limit notice.

- **Expected:** When voice usage is exhausted, the user sees a clear usage-limit notice in voice.
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:349; apps/web/features/chat/lib/live-voice-session.ts:72
- **Where to find it:** Start voice mode > when voice usage runs out > usage notice with "Upgrade" button (labels found in the code)
- **Needs:** an account whose voice usage is used up (a Free account)
- **Steps:**
  1. Start voice mode on an account whose voice usage is used up.
  2. Look for the usage-limit notice in the voice view.
  3. Click "Upgrade" and check the upgrade page opens.

## S48.38 Continue unfinished work in text.

- **Expected:** The user can leave voice and continue the same unfinished conversation by typing.
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceComposer.tsx:138; apps/web/features/chat/pages/WebChatPage.tsx:6770
- **Where to find it:** Start voice mode > "Continue in text" button in the voice view (labels found in the code)
- **Needs:** a signed-in account with voice access and a microphone
- **Steps:**
  1. Start voice mode and have a spoken turn.
  2. Click "Continue in text" in the voice view.
  3. Type a message in the "Type a message to send as a normal turn" field and send it.
  4. Check the reply continues in the same chat's text conversation.

## S48.39 Resume a previous voice conversation.

- **Expected:** The user can reopen a previous voice conversation and continue it by voice with its earlier turns as context.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6956; apps/web/app/api/voice/live/sessions/route.ts:494
- **Where to find it:** Open an existing chat from the sidebar > leave the message box empty > Start voice mode (labels found in the code)
- **Needs:** a Free account or a paid account, a microphone, an existing chat with earlier messages
- **Steps:**
  1. Sign in and open an existing chat that already has earlier messages, from the sidebar.
  2. Leave the message box empty. The round button at the right end of the message box shows Start voice mode (it is replaced by Send once you type).
  3. Click Start voice mode and speak. The voice view opens in the same chat.
  4. Ask about something said earlier in the chat by text. Compare: the reply should use the earlier turns, and the spoken turns should be added to the same chat, not a new one.

## S48.40 Remote coding-session voice control.

- **Expected:** The user can steer a remote coding session (running on another device) by voice.
- **Code:** done. Evidence moved: apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:365; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:331 (quoted code not found in the file now); apps/web/features/code/components/CodeComposer.tsx:2109
- **Where to find it:** Code > Your computer > Connected to ... > Task box > Start voice input (labels found in the code)
- **Needs:** a paid or Free account that can use Remote Control, a paired Desktop computer that accepts tasks, a microphone
- **Steps:**
  1. Sign in on the web app and pair a Desktop computer first (Desktop: Settings, Capabilities, Remote Control, Pair a phone, Copy link for a browser; then paste it under Your computer).
  2. Open Code in the sidebar, then click Your computer in the rail.
  3. Under the heading Connected to ..., click inside the Task box, then click the microphone button with the label Start voice input.
  4. Speak the task, then use the controls on the dictation strip to stop or send. Compare: the spoken words should appear as the task you send to the computer, and no reply is spoken back.

## S48.41 Separate spoken-response cancellation from task cancellation.

- **Expected:** The user can stop the spoken reply without cancelling the underlying task, and cancel the task separately.
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:595; apps/web/features/chat/pages/WebChatPage.tsx:7665
- **Where to find it:** not found in the code. Found only half of the item. During a voice call, a Stop the task button appears in the status line while an action runs (apps/web/features/chat/components/Voice/VoiceModeSurface.tsx, line 596 cancelBackendWork, hint Stops the running action and keeps the call open.). No separate control to stop only the spoken reply was found in VoiceModeSurface.tsx, VoiceComposer, use-voice-session.ts or live-voice-session.ts. Searched for Stop, interrupt, cancel and response.cancel in those files.
- **Needs:** a microphone, a voice task that starts a running action
