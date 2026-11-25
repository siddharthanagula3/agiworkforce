---
id: "PLAN-web-048"
type: "test-plan"
title: "Web · 48. Voice conversation interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "48"
---
# Web · 48. Voice conversation interface

28 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S48.01 Voice entry from an existing chat.

- **Expected:** From an open existing chat, a control starts a voice conversation bound to that chat.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6956; apps/web/features/chat/pages/WebChatPage.tsx:5778 (quoted code not found in the file now); apps/web/features/chat/hooks/use-voice-session.ts:837; apps/web/app/api/voice/live/sessions/route.ts:331 (quoted code not found in the file now)
- **Where to find it:** Open an existing chat from the sidebar > empty message box > round button 'Start voice mode' (waveform icon, right end of the box) (labels found in the code)
- **Needs:** a signed-in account with voice access; a microphone; a cloud model selected
- **Steps:**
  1. Sign in and open an existing chat that already has messages.
  2. Leave the message box empty and make sure the selected model is a cloud model.
  3. Click the round waveform button named 'Start voice mode' at the right end of the message box.
  4. Look: the message box is replaced by the voice bar, and the chat you opened is still on screen. Compare with Expected: voice starts bound to that chat.

## S48.02 Start a new voice conversation.

- **Expected:** A control starts a brand-new voice conversation (a new chat is created for it).
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:5670 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:4959 (quoted code not found in the file now); apps/web/app/api/voice/live/sessions/route.ts:331 (quoted code not found in the file now)
- **Where to find it:** Sidebar > 'New chat' > empty message box > round button 'Start voice mode' (right end of the box) (labels found in the code)
- **Needs:** a signed-in account with voice access; a microphone; a cloud model selected
- **Steps:**
  1. Click 'New chat' in the sidebar.
  2. Leave the message box empty.
  3. Click 'Start voice mode'.
  4. Look: a voice call starts on the new chat. Compare with Expected: a brand-new chat is created for the call.

## S48.03 Integrated voice-and-text layout.

- **Expected:** Voice runs inside the chat view: the transcript of spoken turns appears in the same message list as typed turns.
- **Code:** done. Evidence moved: apps/web/features/chat/pages/WebChatPage.tsx:7794; apps/web/features/chat/pages/WebChatPage.tsx:6739; apps/web/features/chat/pages/WebChatPage.tsx:5002 (quoted code not found in the file now)
- **Where to find it:** Open a chat that already has messages > round button 'Start voice mode' (right end of the message box) (labels found in the code)
- **Needs:** a microphone; a signed-in account with voice access
- **Steps:**
  1. Open a chat with several earlier messages.
  2. Click 'Start voice mode'.
  3. Look at the header: the word 'Voice' appears next to the logo.
  4. Speak one sentence and wait for the reply.
  5. Look: your words and the reply appear in the same list as the typed messages, above the voice bar. Compare with Expected.

## S48.04 Separate full-screen voice layout.

- **Expected:** A separate full-screen voice layout exists (voice fills the view, transcript hidden or secondary).
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:244 (quoted code not found in the file now); apps/web/features/chat/pages/WebChatPage.tsx:7717; apps/web/features/chat/stores/voice-session-store.ts:190
- **Where to find it:** Voice view > round orb in the middle of the screen (its name is 'Hide the transcript and focus the orb') (labels found in the code)
- **Needs:** a microphone; a signed-in account with voice access
- **Steps:**
  1. Start a voice call (see S48.01).
  2. Click the orb in the middle of the screen.
  3. Look: the transcript fades and the orb is the focus of the view.
  4. Click the orb again and look for the name 'Show the transcript again' on it.
  5. Compare with Expected: a separate full-screen voice layout.

## S48.05 Listening indicator.

- **Expected:** While the assistant is listening, a visible (and announced) listening state is shown.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/VoiceOrb.tsx:268; packages/ui/unified-chat/src/voice/voice-session-machine.ts:234; apps/web/features/chat/hooks/use-voice-session.ts:269 (quoted code not found in the file now)
- **Where to find it:** Voice view > round orb in the middle of the screen (labels found in the code)
- **Needs:** a microphone; a signed-in account with voice access
- **Steps:**
  1. Start a voice call (see S48.01) and wait until the call is idle and waiting for you.
  2. Look at the orb: it shows its listening state.
  3. Optional: with VoiceOver on, listen for the announcement 'Listening'.
  4. Compare with Expected: a visible and announced listening state.

## S48.06 Speaking indicator.

- **Expected:** While the assistant speaks, a visible speaking state is shown.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/VoiceOrb.tsx:268; packages/ui/unified-chat/src/voice/voice-session-machine.ts:236; apps/web/features/chat/lib/live-voice-session.ts:955
- **Where to find it:** Voice view > round orb in the middle of the screen (labels found in the code)
- **Needs:** a microphone; a speaker or headphones; a signed-in account with voice access
- **Steps:**
  1. Start a voice call and ask a short question.
  2. Wait for the assistant's reply to start playing.
  3. Look at the orb: it changes while the reply plays.
  4. Optional: with VoiceOver on, listen for 'Assistant is speaking'.
  5. Compare with Expected: a visible speaking state.

## S48.07 Thinking/working indicator.

- **Expected:** While the assistant is working (thinking or running a tool), a thinking/working state is shown.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceOrb.tsx:27; apps/web/features/chat/components/Voice/voice-announcements.ts:8; apps/web/features/chat/lib/live-voice-session.ts:648 (quoted code not found in the file now)
- **Where to find it:** Voice view > line with a spinner under the orb reading 'Working on your request' (with a 'Stop the task' button) (labels found in the code)
- **Needs:** a microphone; a signed-in account with voice access
- **Steps:**
  1. Start a voice call.
  2. Ask for something that needs a tool or a lookup.
  3. Look under the orb for a spinner and the text 'Working on your request', with a 'Stop the task' button beside it.
  4. Compare with Expected: a visible thinking or working state while the assistant works.

## S48.08 Waveform or amplitude visualization.

- **Expected:** A waveform or amplitude visual follows the live microphone or reply audio level during voice.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/VoiceOrb.tsx:192; apps/web/features/chat/lib/live-voice-session.ts:436
- **Where to find it:** Voice view > round orb in the middle of the screen (path not confirmed in the code; trust the screen)
- **Needs:** a microphone; a speaker or headphones; a signed-in account with voice access
- **Steps:**
  1. Start a voice call.
  2. Speak a long sentence at normal volume.
  3. Look at the orb: it grows and shrinks with your voice.
  4. Wait for a reply and look at the orb again.
  5. Compare with Expected: a visual follows the live audio level.

## S48.09 Microphone mute.

- **Expected:** The user can mute and unmute the microphone without ending the voice conversation.
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceComposer.tsx:118; apps/web/features/chat/lib/live-voice-session.ts:786
- **Where to find it:** Voice view > bottom voice bar > round microphone button (named 'Turn off microphone') (labels found in the code)
- **Needs:** a microphone; a signed-in account with voice access
- **Steps:**
  1. Start a voice call.
  2. Click the round microphone button in the bottom bar.
  3. Look: the icon changes to a crossed-out microphone, the button turns red, and its name becomes 'Turn on microphone'.
  4. Look at the call timer: it keeps running.
  5. Click the button again and check the microphone is back on. Compare with Expected: mute without ending the call.

## S48.10 End conversation.

- **Expected:** A control ends the voice conversation, closing the session (and settling its usage).
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceComposer.tsx:138; apps/web/features/chat/hooks/use-voice-session.ts:504; apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts:165
- **Where to find it:** Voice view > bottom voice bar > round X button named 'End voice session' (right end) (labels found in the code)
- **Needs:** a microphone; a signed-in account with voice access
- **Steps:**
  1. Start a voice call and talk for a moment.
  2. Click the X button 'End voice session'.
  3. Look: the voice bar closes, the normal message box comes back, and the call timer stops.
  4. Compare with Expected: the call is closed.

## S48.11 Pause/resume.

- **Expected:** The user can pause the whole voice conversation (mic and assistant) and resume it later without ending it.
- **Code:** done. Evidence moved: apps/web/features/chat/hooks/use-voice-session.ts:942; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:445 (quoted code not found in the file now)
- **Where to find it:** Voice view > round '+' button at the left of the bottom bar > menu 'In this chat' > 'Pause call' (labels found in the code)
- **Needs:** a microphone; a signed-in account with voice access
- **Steps:**
  1. Start a voice call.
  2. Click the round '+' button at the left of the bottom bar.
  3. Click 'Pause call' under the menu heading 'In this chat'. Hmm: the item sits under the heading 'This call'.
  4. Look: a notice says the call is paused and a 'Resume' button appears.
  5. Click 'Resume' and check the call comes back without starting over. Compare with Expected.

## S48.13 Hands-free mode.

- **Expected:** A hands-free mode keeps listening across turns without a button press per turn.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:607; apps/web/features/chat/hooks/use-voice-session.ts:269 (quoted code not found in the file now); apps/web/features/chat/lib/live-voice-session.ts:1011
- **Where to find it:** no screen of its own. No hands-free switch was found in the code. The check is only whether a second turn needs no tap.
- **Needs:** a microphone; a speaker or headphones; a signed-in account with voice access
- **Steps:**
  1. Start a voice call.
  2. Say one thing and wait for the reply to finish.
  3. Say a second thing without touching any button.
  4. Look: the orb returns to listening and takes the second turn without a tap.

## S48.14 Interruption/barge-in.

- **Expected:** Speaking while the assistant talks interrupts its spoken reply (barge-in).
- **Code:** unverified. Evidence moved: apps/web/app/api/voice/live/sessions/route.ts:339 (quoted code not found in the file now)
- **Needs:** external-service
- **Where to find it:** no screen of its own. Unverified in the code. It depends on the external voice service, so the result may vary by session.
- **Needs:** a microphone; a speaker or headphones; a signed-in account with voice access; a live voice service
- **Steps:**
  1. Start a voice call and ask for a long answer.
  2. While the orb shows the speaking state and the reply is playing, start talking over it.
  3. Look: the spoken reply stops and the orb moves to listening. Compare with Expected.

## S48.15 Voice picker.

- **Expected:** The user picks the assistant voice, and the chosen voice is the one the conversation speaks with.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceHeaderLabel.tsx:28; apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx:231; apps/web/features/chat/lib/live-voice-session.ts:359 (quoted code not found in the file now); apps/web/app/api/voice/live/sessions/[sessionId]/settings/route.ts:94
- **Where to find it:** Voice view > gear button 'Voice settings' (next to 'Voice' in the header) > voice name between the arrows 'Previous voice' and 'Next voice' (labels found in the code)
- **Needs:** a microphone; a speaker or headphones; a signed-in account with voice access
- **Steps:**
  1. Start a voice call.
  2. Click the gear button 'Voice settings'.
  3. Click 'Next voice' and look at the name in the middle change.
  4. Click the voice name dots below, if shown, to pick another voice.
  5. Close the dialog, let the assistant speak, and check the voice matches the name you chose. Compare with Expected.

## S48.16 Voice preview.

- **Expected:** The user can hear a sample of a voice before choosing it.
- **Code:** partial. Evidence present: apps/web/public/voice-samples/manifest.json:2
- **Known to be unfinished:** owner: run OPENAI_API_KEY=<server key> node scripts/generate-voice-samples.mjs from the repo root and commit apps/web/public/voice-samples (the manifest is empty, so Play sample stays hidden)
- **Where to find it:** Voice view > gear button 'Voice settings' > under the voice name, button 'Play sample' (labels found in the code)
- **Needs:** a signed-in account with voice access; a speaker or headphones
- **Steps:**
  1. Start a voice call and open 'Voice settings'.
  2. Look under the voice name and arrows for the button 'Play sample'.
  3. Click 'Play sample' and listen.
  4. Compare with Expected: a sample of the voice plays before you choose it.

## S48.17 Language selection.

- **Expected:** The user can choose the spoken language of the voice conversation, and it is applied to recognition.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceSettingsModal.tsx:297; apps/web/features/chat/lib/live-voice-session.ts:363 (quoted code not found in the file now); apps/web/app/api/voice/live/sessions/route.ts:340 (quoted code not found in the file now)
- **Where to find it:** Voice view > gear button 'Voice settings' > 'Language' picker (first option 'Auto-detect') (labels found in the code)
- **Needs:** a microphone; a speaker or headphones; a signed-in account with voice access
- **Steps:**
  1. Start a voice call and open 'Voice settings'.
  2. Click the 'Language' picker and choose a language other than 'Auto-detect'.
  3. Close the dialog and speak in that language.
  4. Compare with Expected: the spoken language is used for recognition. Check the transcript and reply.

## S48.19 Output-device selection.

- **Expected:** The user can choose which speaker (output device) voice plays through.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceComposer.tsx:139 (quoted code not found in the file now); apps/web/features/chat/components/Voice/AudioRoutePicker.tsx:90
- **Where to find it:** Voice view > gear button 'Voice settings' > 'Audio output' button (shows 'System default' or a device name) (labels found in the code)
- **Needs:** a browser that can switch speaker output (the code checks for this); a second audio output device
- **Steps:**
  1. Start a voice call and open 'Voice settings'.
  2. Click the 'Audio output' button and open its list.
  3. Choose a different speaker from the list.
  4. Let the assistant speak and check the sound comes from the chosen speaker. Compare with Expected.

## S48.21 Captions.

- **Expected:** Live captions of both speakers can be shown during voice.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceComposer.tsx:146 (quoted code not found in the file now); apps/web/features/chat/components/Voice/VoiceCaptions.tsx:26; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:176
- **Where to find it:** Voice view > round '+' button at the left of the bottom bar > 'This call' > 'Captions' (labels found in the code)
- **Needs:** a microphone; a speaker or headphones; a signed-in account with voice access
- **Steps:**
  1. Start a voice call.
  2. Click the round '+' button at the left of the bottom bar.
  3. Click 'Captions' under the heading 'This call'.
  4. Speak, and let the assistant reply.
  5. Look for lines labelled 'You' and 'Assistant' appearing as text. Compare with Expected: captions of both speakers.

## S48.22 Transcript display.

- **Expected:** A transcript of the voice conversation is displayed and kept with the chat.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:6739; apps/web/features/chat/pages/WebChatPage.tsx:6770
- **Where to find it:** Open the chat after the voice call (the voice turns are saved as messages in that chat) (labels found in the code)
- **Needs:** a microphone; a speaker or headphones; a signed-in account with voice access
- **Steps:**
  1. Make a short voice call with two spoken turns.
  2. Click the X button 'End voice session' to finish the call.
  3. Look at the chat: your spoken turns and the replies appear as messages in order.
  4. Reload the page and check the same messages are still there. Compare with Expected.

## S48.26 View tool results during Voice.

- **Expected:** Tool activity and results from a voice turn are viewable during the conversation.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:271 (quoted code not found in the file now); apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:304 (quoted code not found in the file now); apps/web/features/chat/hooks/use-voice-session.ts:392 (quoted code not found in the file now)
- **Where to find it:** Voice view > tool row above the orb after a tool runs; then, in the chat above, the 'Stopped thinking' or 'Thought for' link under an assistant reply opens 'Activity' (labels found in the code)
- **Needs:** a microphone; a signed-in account with voice access; a task that uses a tool
- **Steps:**
  1. Start a voice call and ask for a task that uses a tool.
  2. Look above the orb for the tool row with the tool name and result.
  3. Scroll up in the chat while the call stays open and click the link under an assistant reply.
  4. Look: the 'Activity' panel opens and lists the steps. Press Escape to close it. Compare with Expected.

## S48.27 Approve an action during Voice.

- **Expected:** An action requested by voice that needs approval can be approved or denied without leaving voice.
- **Code:** done. Evidence moved: apps/web/features/chat/lib/live-voice-session.ts:409; apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:258 (quoted code not found in the file now)
- **Where to find it:** Voice view > card above the orb for an action that needs approval, with buttons such as 'Allow once', 'Allow for this chat' and 'Deny' (labels found in the code)
- **Needs:** a microphone; a signed-in account with voice access; a task that asks for approval
- **Steps:**
  1. Start a voice call.
  2. Ask for an action that needs approval, such as one that changes something.
  3. Look for the approval card in the voice view.
  4. Click 'Allow once' or 'Deny'.
  5. Look: the card closes and the call continues without leaving voice. Compare with Expected.

## S48.28 Open a generated document from Voice.

- **Expected:** A document generated during voice can be opened from the voice view.
- **Code:** done. Evidence moved: apps/web/lib/voice/live-voice-tool-runner.ts:128 (quoted code not found in the file now); apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:502
- **Where to find it:** Voice view > under the tool row, a link 'Open' followed by the file name (images show as a picture link) (labels found in the code)
- **Needs:** a microphone; a signed-in account with voice access; a task that creates a file
- **Steps:**
  1. Start a voice call and ask for a task that creates a document.
  2. Look under the tool row for 'Open' with a file name.
  3. Click the link.
  4. Look: the file opens in a new browser tab. Compare with Expected.

## S48.36 Reconnection state.

- **Expected:** When the voice connection drops, a reconnecting state is shown and the session reconnects (or says it could not).
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:306; apps/web/features/chat/hooks/use-voice-session.ts:241
- **Where to find it:** Voice view > a line 'Reconnecting, attempt N of M' above the orb when the connection drops (labels found in the code)
- **Needs:** a microphone; a signed-in account with voice access; a way to drop the connection (for example Wi-Fi off)
- **Steps:**
  1. Start a voice call.
  2. Turn off Wi-Fi for a few seconds.
  3. Look above the orb for 'Reconnecting, attempt' with a spinner and a count.
  4. Turn Wi-Fi back on and look again: the line goes away and the call continues, or an error with 'Try again' appears. Compare with Expected.

## S48.37 Usage-limit notice.

- **Expected:** When voice usage is exhausted, the user sees a clear usage-limit notice in voice.
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:349; apps/web/features/chat/lib/live-voice-session.ts:72; apps/web/app/api/voice/live/sessions/route.ts:370
- **Where to find it:** Voice view > notice with 'Upgrade' and 'Continue in text' when voice usage runs out (labels found in the code)
- **Needs:** an account whose voice usage is used up
- **Steps:**
  1. Use voice until the voice allowance is used up.
  2. Look in the voice view for the usage notice with the buttons 'Upgrade' and 'Continue in text'.
  3. Click 'Continue in text' and check you return to the text message box in the same chat. Compare with Expected.

## S48.38 Continue unfinished work in text.

- **Expected:** The user can leave voice and continue the same unfinished conversation by typing.
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceComposer.tsx:138; apps/web/features/chat/pages/WebChatPage.tsx:7670; apps/web/features/chat/pages/WebChatPage.tsx:6770
- **Where to find it:** Voice view > X button 'End voice session' at the right end of the bottom bar (or Escape), then the normal message box (labels found in the code)
- **Needs:** a signed-in account with voice access; a microphone
- **Steps:**
  1. In a call on a chat that has messages, click the X button 'End voice session'.
  2. Look: the normal message box returns in the same chat, with the earlier voice turns above it.
  3. Type a message and send it.
  4. Compare with Expected: the send goes into the same unfinished conversation.

## S48.39 Resume a previous voice conversation.

- **Expected:** The user can reopen a previous voice conversation and continue it by voice with its earlier turns as context.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6956; apps/web/app/api/voice/live/sessions/route.ts:494
- **Where to find it:** Open an earlier chat from the sidebar, then with the message field empty click Start voice mode (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Sign in and open a chat that already has a voice conversation or earlier turns.
  2. Leave the message field empty so the round button on the right shows its voice icon.
  3. Click the button labelled Start voice mode.
  4. Check that the voice view opens for that same chat and that the assistant answers with the earlier turns in mind (ask it what you talked about before).

## S48.40 Remote coding-session voice control.

- **Expected:** The user can steer a remote coding session (running on another device) by voice.
- **Code:** done. Evidence moved: apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:365; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:331 (quoted code not found in the file now); apps/web/features/code/components/CodeComposer.tsx:2109
- **Where to find it:** not found in the code. The remote coding page is at the route apps/web/app/code/computer/page.tsx, with a Task box that has a Start voice input button (dictation) and a Send to computer button, but RemoteComputerLink, which should link to it, has no caller in apps or features, so I could not confirm a menu path; the page offers dictated task text, not a voice conversation.
- **Needs:** a computer paired with the Desktop app

## S48.41 Separate spoken-response cancellation from task cancellation.

- **Expected:** The user can stop the spoken reply without cancelling the underlying task, and cancel the task separately.
- **Code:** done. Evidence present: apps/web/features/chat/components/Voice/VoiceModeSurface.tsx:595
- **Where to find it:** Start voice mode, then while a task is running click Stop the task (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Open a chat, leave the message field empty and click Start voice mode.
  2. Ask for an action that takes a while, such as a web search.
  3. While the status line with a spinner is showing, click Stop the task.
  4. Check that the status line goes away, the call stays open and the voice conversation still works. The task should stop without ending the call.
