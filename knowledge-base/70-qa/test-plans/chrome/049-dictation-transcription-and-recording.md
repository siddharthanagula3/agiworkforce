---
id: "PLAN-chrome-049"
type: "test-plan"
title: "Chrome · 49. Dictation, transcription, and recording"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "49"
---
# Chrome · 49. Dictation, transcription, and recording

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S49.01 Composer dictation.

- **Expected:** A microphone control in the composer turns speech into text in the message field.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10170 (quoted code not found in the file now); apps/extension/src/features/side-panel/voice.ts:81 (quoted code not found in the file now)
- **Where to find it:** Side panel > composer at the bottom of the chat > microphone button labelled "Voice input" (path not confirmed in the code; trust the screen)
- **Needs:** a microphone and Chrome microphone permission for the extension. The button is hidden unless the account's voice capability allows it; that capability source was not in apps/extension, so a Free or other plan may not show it.
- **Steps:**
  1. Sign in and open the side panel on a chat.
  2. Find the small microphone icon button in the composer bar, next to the message field. Its accessible name is "Voice input".
  3. Click it. If a "Before you dictate" notice appears, click "Continue", then allow the microphone in Chrome's prompt.
  4. Look for the button to pulse and its tooltip to change to "Listening… click to stop". Speak a short sentence.
  5. Click the microphone again to stop. Compare: the spoken words should appear as text in the message field.

## S49.02 Editable transcription before send.

- **Expected:** The dictated transcript lands in the message field where the user can edit it before sending.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10170 (quoted code not found in the file now); apps/extension/src/features/side-panel/voice.ts:96 (quoted code not found in the file now)
- **Where to find it:** Side panel > composer at the bottom of the chat > microphone button labelled "Voice input" (path not confirmed in the code; trust the screen)
- **Needs:** a microphone and Chrome microphone permission
- **Steps:**
  1. Start dictation with the "Voice input" microphone button in the composer bar.
  2. Speak a sentence, then click the microphone again to stop.
  3. Compare: the transcript is added to the message field and is not sent to the chat.
  4. Click inside the message field and type or delete a word to edit the transcript.
  5. Compare: the edit stays in the field until you press send yourself.

## S49.03 Dictation language selection.

- **Expected:** The user can choose the dictation language, and recognition uses it.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7466 (quoted code not found in the file now); apps/extension/src/features/side-panel/voice.ts:82 (quoted code not found in the file now)
- **Where to find it:** Side panel > More button > "Extension settings" (opens the options page) > left navigation "Options" > "Dictation" row, select box below it (path not confirmed in the code; trust the screen)
- **Needs:** none (a microphone only to test that recognition uses the chosen language)
- **Steps:**
  1. Open the side panel and click the "More" button.
  2. Click "Extension settings". A settings tab opens.
  3. In the left navigation, click "Options". Scroll down to the "Dictation" row.
  4. Open the select box in that row and pick a different language.
  5. Compare: the status line "Dictation language saved." appears. Then open the side panel, click "Voice input" and check its tooltip shows the new language name.

## S49.05 Final transcript.

- **Expected:** When dictation ends, the final transcript is produced and delivered.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:10170 (quoted code not found in the file now); apps/extension/src/features/side-panel/voice.ts:81 (quoted code not found in the file now)
- **Where to find it:** Side panel > composer at the bottom of the chat > microphone button labelled "Voice input" (path not confirmed in the code; trust the screen)
- **Needs:** a microphone and Chrome microphone permission
- **Steps:**
  1. Click the "Voice input" microphone button and wait for it to pulse.
  2. Speak a full sentence, then click the microphone again to stop.
  3. Compare: the final transcript appears in the message field once dictation ends.
  4. Click the microphone, stay silent until it stops by itself.
  5. Compare: the notice "No speech was heard. Try again and speak after the button starts pulsing." appears above the composer.

## S49.30 Undo inserted text.

- **Expected:** Text inserted by dictation can be undone with the normal undo action.
- **Code:** unverified. Evidence moved: apps/extension/src/features/side-panel/voice.ts:96 (quoted code not found in the file now)
- **Needs:** live-web
- **Where to find it:** Side panel > composer at the bottom of the chat > microphone button "Voice input" > then click into the message field and press Command+Z (path not confirmed in the code; trust the screen)
- **Needs:** a microphone and Chrome microphone permission
- **Steps:**
  1. Dictate a sentence with the "Voice input" microphone button and stop it.
  2. Click into the message field so it has focus.
  3. Press Command+Z (the browser's normal undo).
  4. Compare: the dictated text is removed. Press Command+Z again to check that earlier typing is handled normally.
