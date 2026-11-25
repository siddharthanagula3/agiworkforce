---
id: "PLAN-mobile-048"
type: "test-plan"
title: "Mobile · 48. Voice conversation interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "48"
---
# Mobile · 48. Voice conversation interface

25 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S48.01 Voice entry from an existing chat.

- **Expected:** From an open existing chat, a control starts a voice conversation bound to that chat.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:1219 (quoted code not found in the file now); apps/mobile/app/(app)/chat/[id].tsx:1712; apps/mobile/src/features/voice/components/LiveVoiceComposer.tsx:30; apps/mobile/src/features/voice/services/liveVoiceSession.ts:211 (quoted code not found in the file now)
- **Where to find it:** Chat screen with an existing chat open > composer button "Start voice mode" (shown when the message box is empty) (labels found in the code)
- **Needs:** a signed-in account and a microphone
- **Steps:**
  1. Sign in and open an existing chat from the chat list.
  2. Leave the message box empty and find the round button on the right of the composer.
  3. Tap the button labelled "Start voice mode".
  4. Look for the voice bar with the status "Listening" or "Connecting live voice..." and the "End live voice" button, and confirm it is the chat you opened.

## S48.02 Start a new voice conversation.

- **Expected:** A control starts a brand-new voice conversation (a new chat is created for it).
- **Code:** done. Evidence moved: apps/mobile/app/(app)/(tabs)/chat.tsx:906 (quoted code not found in the file now); apps/mobile/app/(app)/(tabs)/chat.tsx:1090; apps/mobile/app/(app)/voice.tsx:252
- **Where to find it:** Chat screen (new chat, no conversation open) > composer button "Start voice mode" (labels found in the code)
- **Needs:** a signed-in account and a microphone
- **Steps:**
  1. Sign in and open a new chat so the message box is empty.
  2. Tap the button labelled "Start voice mode" on the right of the composer.
  3. If the first-time intro appears, tap "Continue" and then "Start voice".
  4. Look for the app moving to a chat that is created for the voice session, with the voice bar showing "Connecting live voice..." or "Listening".

## S48.03 Integrated voice-and-text layout.

- **Expected:** Voice runs inside the chat view: the transcript of spoken turns appears in the same message list as typed turns.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/chat/[id].tsx:2826; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:96 (quoted code not found in the file now)
- **Where to find it:** Chat screen > open a chat > "Start voice mode" > "Show captions" (labels found in the code)
- **Needs:** a signed-in account, a microphone, and a speaker
- **Steps:**
  1. Open a chat and tap "Start voice mode" in the composer.
  2. Tap "Show captions" in the top bar of the voice view.
  3. Say something and wait for a reply.
  4. Check that the spoken turns appear in a transcript above the voice orb, under the labels "YOU" and "AGI", and compare with Expected.

## S48.04 Separate full-screen voice layout.

- **Expected:** A separate full-screen voice layout exists (voice fills the view, transcript hidden or secondary).
- **Code:** done. Evidence moved: apps/mobile/app/(app)/voice.tsx:492; apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:101 (quoted code not found in the file now)
- **Where to find it:** Settings > Voice > "Open Voice Companion" (labels found in the code)
- **Needs:** a phone with on-device speech recognition and a microphone
- **Steps:**
  1. Open Settings and tap "Voice".
  2. Tap "Open Voice Companion" (this row only appears on phones that have on-device speech recognition).
  3. Look for a full-screen view with a large orb, the text "Tap to speak" and "Speech stays on this device", and a close button.
  4. Compare with Expected: voice fills the screen and no transcript is shown.

## S48.05 Listening indicator.

- **Expected:** While the assistant is listening, a visible (and announced) listening state is shown.
- **Code:** done. Evidence moved: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:179; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:134 (quoted code not found in the file now)
- **Where to find it:** Chat > open a chat > "Start voice mode" > status text under the orb (labels found in the code)
- **Needs:** a signed-in account and a microphone
- **Steps:**
  1. Open a chat and tap "Start voice mode".
  2. Wait for the connection to finish.
  3. Read the status text under the orb.
  4. Check it shows "Listening" and compare with Expected.

## S48.06 Speaking indicator.

- **Expected:** While the assistant speaks, a visible speaking state is shown.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:178; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:342
- **Where to find it:** Chat > open a chat > "Start voice mode" > status text under the orb while the reply plays (labels found in the code)
- **Needs:** a signed-in account, a microphone, and a speaker
- **Steps:**
  1. Start voice mode in a chat and ask a question that gets a spoken answer.
  2. While the reply is being spoken, read the status text under the orb.
  3. Check it shows "Speaking, talk any time to interrupt" and that the orb moves.
  4. Compare with Expected.

## S48.07 Thinking/working indicator.

- **Expected:** While the assistant is working (thinking or running a tool), a thinking/working state is shown.
- **Code:** done. Evidence moved: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:193 (quoted code not found in the file now); apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:142 (quoted code not found in the file now)
- **Where to find it:** Chat > open a chat > "Start voice mode" > ask for a task > "Working on your request" (labels found in the code)
- **Needs:** a signed-in account and a microphone
- **Steps:**
  1. Start voice mode in a chat and ask for something that needs work, such as a lookup.
  2. While the assistant is working, look at the step with the text "Working on your request" under the status area.
  3. Check that the "Stop the task" button appears next to it.
  4. Compare with Expected.

## S48.08 Waveform or amplitude visualization.

- **Expected:** A waveform or amplitude visual follows the live microphone or reply audio level during voice.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/voice.tsx:148; apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:179 (quoted code not found in the file now)
- **Where to find it:** Settings > Voice > "Open Voice Companion" (full-screen orb) ; also the orb in "Start voice mode" view (labels found in the code)
- **Needs:** a microphone and a speaker
- **Steps:**
  1. Open Settings > Voice > "Open Voice Companion".
  2. Speak and watch the orb while you talk.
  3. Then wait for the reply and watch the orb while it speaks.
  4. Compare with Expected: the orb should follow the sound level, not a fixed pattern.

## S48.09 Microphone mute.

- **Expected:** The user can mute and unmute the microphone without ending the voice conversation.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:726; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:538
- **Where to find it:** Chat > open a chat > "Start voice mode" > "Mute microphone" button (bottom right) (labels found in the code)
- **Needs:** a signed-in account and a microphone
- **Steps:**
  1. Start voice mode and wait for "Listening".
  2. Tap the button labelled "Mute microphone".
  3. Check the status changes to "Muted, tap the mic to talk" and the button now reads "Unmute microphone".
  4. Tap "Unmute microphone" and check the call is still running (the voice bar stays open).

## S48.10 End conversation.

- **Expected:** A control ends the voice conversation, closing the session (and settling its usage).
- **Code:** done. Evidence moved: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:746; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:114 (quoted code not found in the file now)
- **Where to find it:** Chat > open a chat > "Start voice mode" > "End live voice" button (X, bottom right) (labels found in the code)
- **Needs:** a signed-in account and a microphone
- **Steps:**
  1. Start voice mode and wait for "Listening".
  2. Tap the round button labelled "End live voice".
  3. Check the voice bar closes and you are back at the chat.
  4. Check that the chat shows no further voice activity (the session has ended).

## S48.12 Push-to-talk.

- **Expected:** A push-to-talk mode records only while a key or button is held and sends on release.
- **Code:** done. Evidence present: apps/mobile/app/(app)/voice.tsx:506; apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:323
- **Where to find it:** Settings > Voice > Mode > "Push to talk"; then Settings > Voice > "Open Voice Companion" (labels found in the code)
- **Needs:** a phone with on-device speech recognition and a microphone
- **Steps:**
  1. Open Settings > Voice and under "Mode" tap "Push to talk".
  2. Go back and tap "Open Voice Companion".
  3. Check the orb hint "Hold to talk, release to send" and the status "Hold to talk".
  4. Press and hold the orb, speak, release, and check the message is sent only after release.

## S48.13 Hands-free mode.

- **Expected:** A hands-free mode keeps listening across turns without a button press per turn.
- **Code:** done. Evidence moved: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:179; apps/mobile/src/features/voice/hooks/useVoiceConversation.ts:131 (quoted code not found in the file now)
- **Where to find it:** Settings > Voice > Mode > "Hands free"; then Settings > Voice > "Open Voice Companion" (labels found in the code)
- **Needs:** a phone with on-device speech recognition and a microphone
- **Steps:**
  1. Open Settings > Voice and under "Mode" tap "Hands free".
  2. Go back and tap "Open Voice Companion".
  3. Speak, wait for the reply, and speak again without pressing the orb.
  4. Check the app listens again on its own and compare with Expected.

## S48.14 Interruption/barge-in.

- **Expected:** Speaking while the assistant talks interrupts its spoken reply (barge-in).
- **Code:** unverified. Evidence present: apps/mobile/src/features/voice/services/liveVoiceSession.ts:731; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:177
- **Needs:** external-service
- **Where to find it:** no screen of its own. Barge-in is marked unverified in the plan and depends on the live service; the code was not run.
- **Needs:** a microphone, a speaker, and a signed-in account (the live voice service)
- **Steps:**
  1. Start voice mode and ask a question with a long spoken answer.
  2. While the reply is speaking, say something new.
  3. Check the status changes to "Go ahead" and the reply stops.
  4. Compare with Expected.

## S48.15 Voice picker.

- **Expected:** The user picks the assistant voice, and the chosen voice is the one the conversation speaks with.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:326; apps/mobile/src/features/voice/components/VoicePickerSheet.tsx:168; apps/mobile/src/features/voice/components/VoicePickerSheet.tsx:240; apps/mobile/src/features/settings/voice-language/index.tsx:305; apps/mobile/src/features/settings/voice-language/index.tsx:314; apps/mobile/stores/settingsStore.ts:152; packages/contracts/types/src/live-voices.ts:9; apps/web/app/api/voice/live/sessions/route.ts:264
- **Where to find it:** Settings > Voice > "Voice" > "Voice & Language" > "Voice mode" (list of voices) (labels found in the code)
- **Needs:** a phone with the voices available and a microphone
- **Steps:**
  1. Open Settings > Voice and tap the row "Voice".
  2. On the "Voice & Language" screen, find the group "Voice mode".
  3. Tap a different voice and go back.
  4. Start voice mode in a chat and check the conversation speaks with the chosen voice.

## S48.16 Voice preview.

- **Expected:** The user can hear a sample of a voice before choosing it.
- **Code:** partial. Evidence present: apps/mobile/src/features/voice/components/VoicePickerSheet.tsx:349
- **Known to be unfinished:** Play sample is built and reads the web manifest; same owner step as web: run scripts/generate-voice-samples.mjs and commit apps/web/public/voice-samples
- **Where to find it:** Chat > "Start voice mode" > first-time intro "Continue" > voice picker sheet > "Play sample" (labels found in the code)
- **Needs:** a microphone is not needed; a speaker and a phone that has not yet seen the voice intro
- **Steps:**
  1. Use "Start voice mode" in a chat (the first-time intro appears only the first time).
  2. Tap "Continue" on the intro, then select a voice in the picker.
  3. Tap "Play sample" under the voice.
  4. Listen and compare with Expected: a sample of the chosen voice plays.

## S48.17 Language selection.

- **Expected:** The user can choose the spoken language of the voice conversation, and it is applied to recognition.
- **Code:** done. Evidence moved: apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:143 (quoted code not found in the file now)
- **Where to find it:** Settings > Voice > "Speech language" (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Open Settings > Voice and tap "Speech language".
  2. Pick a language from the list (the first choice is "Uses your device language").
  3. Go back and start voice mode in a chat.
  4. Speak in the chosen language and check the app understands it.

## S48.21 Captions.

- **Expected:** Live captions of both speakers can be shown during voice.
- **Code:** done. Evidence moved: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:440; apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:85 (quoted code not found in the file now)
- **Where to find it:** Chat > open a chat > "Start voice mode" > "Show captions" (top bar of the voice view) (labels found in the code)
- **Needs:** a signed-in account, a microphone, and a speaker
- **Steps:**
  1. Start voice mode and have a short exchange.
  2. Tap "Show captions" in the top bar.
  3. Check a transcript appears with the labels "YOU" and "AGI" for both speakers.
  4. Tap "Hide captions" and check the transcript goes away.

## S48.22 Transcript display.

- **Expected:** A transcript of the voice conversation is displayed and kept with the chat.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:440; apps/mobile/stores/chat/chatMessageStore.ts:1199
- **Where to find it:** Chat > open a chat > "Start voice mode" > "Show captions"; then check the chat after ending (labels found in the code)
- **Needs:** a signed-in account and a microphone
- **Steps:**
  1. Start voice mode, turn on "Show captions", and have a short exchange.
  2. Tap "End live voice".
  3. Look at the chat and check the spoken turns are kept with it.
  4. Compare with Expected.

## S48.26 View tool results during Voice.

- **Expected:** Tool activity and results from a voice turn are viewable during the conversation.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:83
- **Where to find it:** Chat > open a chat > "Start voice mode" > ask for an action > "What the actions returned" (labels found in the code)
- **Needs:** a signed-in account and a microphone
- **Steps:**
  1. Start voice mode in a chat.
  2. Ask for something that uses a tool (for example a lookup or an image).
  3. When the result comes back, look for the section "What the actions returned" in the voice view.
  4. Check the tool name, output and any image are shown.

## S48.27 Approve an action during Voice.

- **Expected:** An action requested by voice that needs approval can be approved or denied without leaving voice.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/services/liveVoiceSession.ts:244; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:517
- **Where to find it:** Chat > open a chat > "Start voice mode" > ask for an action that needs approval > "Waiting for your approval" > "Allow" or "Deny" (labels found in the code)
- **Needs:** a signed-in account and a microphone; an action that needs approval
- **Steps:**
  1. Start voice mode and ask for an action that needs your approval.
  2. Look for the panel with the title "Waiting for your approval" and the summary of the action.
  3. Tap "Allow" or "Deny" without leaving the voice view.
  4. Check the request continues or stops and compare with Expected.

## S48.36 Reconnection state.

- **Expected:** When the voice connection drops, a reconnecting state is shown and the session reconnects (or says it could not).
- **Code:** done. Evidence present: apps/mobile/src/features/voice/hooks/useLiveVoiceSession.ts:400; apps/mobile/src/features/voice/services/liveVoiceSession.ts:614
- **Where to find it:** Chat > open a chat > "Start voice mode" > turn off Wi-Fi or mobile data > "Reconnecting live voice..." (labels found in the code)
- **Needs:** a phone you can switch networks on and off, a signed-in account
- **Steps:**
  1. Start voice mode and wait for "Listening".
  2. Turn off Wi-Fi and mobile data (or Airplane Mode) for a few seconds.
  3. Look for the status "Reconnecting live voice...".
  4. Turn the network back on and check the status returns to "Listening", or check for the error box with "Try again" if it does not reconnect.

## S48.37 Usage-limit notice.

- **Expected:** When voice usage is exhausted, the user sees a clear usage-limit notice in voice.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:380; apps/mobile/src/features/voice/services/liveVoiceSession.ts:163
- **Where to find it:** Chat > "Start voice mode" when the plan's voice allowance is used up > error box in the voice view (labels found in the code)
- **Needs:** a signed-in account whose voice usage is used up
- **Steps:**
  1. Use up the voice allowance on the account (or use an account that has none left).
  2. Tap "Start voice mode" in a chat.
  3. Look for the error box in the voice view with a message that names the limit and when it resets.
  4. Check the buttons "Try again" and "Use the keyboard" are shown.

## S48.38 Continue unfinished work in text.

- **Expected:** The user can leave voice and continue the same unfinished conversation by typing.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:704; apps/mobile/app/(app)/chat/[id].tsx:1779
- **Where to find it:** Chat > open a chat > "Start voice mode" > "Type instead" (bottom left of the voice view) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Start voice mode in a chat.
  2. Tap the bar labelled "Type instead" at the bottom left.
  3. Check the voice view closes and the message box is ready to type in.
  4. Type a message and send it, and check it continues the same chat.

## S48.39 Resume a previous voice conversation.

- **Expected:** The user can reopen a previous voice conversation and continue it by voice with its earlier turns as context.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ChatInput.tsx:1219 (quoted code not found in the file now); apps/mobile/src/features/voice/services/liveVoiceSession.ts:348
- **Where to find it:** Chat list > open an earlier voice chat > "Start voice mode" in the composer (labels found in the code)
- **Needs:** an earlier voice chat and a signed-in account
- **Steps:**
  1. Open a voice chat from earlier (one started by voice).
  2. Tap "Start voice mode" in the composer.
  3. Say something that refers to an earlier turn.
  4. Check the reply uses the earlier context and compare with Expected.

## S48.41 Separate spoken-response cancellation from task cancellation.

- **Expected:** The user can stop the spoken reply without cancelling the underlying task, and cancel the task separately.
- **Code:** done. Evidence present: apps/mobile/src/features/voice/services/liveVoiceSession.ts:448; apps/mobile/src/features/voice/components/LiveVoiceBar.tsx:675
- **Where to find it:** not found in the code. The button "Stop the task" (aria label "Stop the task and keep talking") in LiveVoiceBar.tsx cancels the task only; no separate on-screen control to stop just the spoken reply was found, so the tester cannot check this part from the UI.
- **Needs:** a signed-in account, a microphone, and a task that is running
