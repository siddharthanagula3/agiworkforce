---
id: "PLAN-mobile-050"
type: "test-plan"
title: "Mobile · 50. Audio overviews, speech generation, and music"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "50"
---
# Mobile · 50. Audio overviews, speech generation, and music

3 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S50.01 Text-to-speech playback.

- **Expected:** An assistant reply can be played aloud as speech.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/MessageBubble.tsx:3168; apps/mobile/src/features/voice/services/tts.ts:83
- **Where to find it:** Chat > any assistant reply > Read aloud (Read aloud button in the reply's action row; it changes to Stop reading aloud while playing) (labels found in the code)
- **Needs:** a device with sound output; a chat with a finished assistant reply
- **Steps:**
  1. Sign in and open a chat that already has an assistant reply.
  2. Find the action row under the assistant reply (Copy, Read aloud, Regenerate response, More message actions).
  3. Tap Read aloud.
  4. Look for the reply being spoken aloud, and for the button label changing to Stop reading aloud. Compare with Expected: the reply plays as speech.

## S50.02 Voice and language selection.

- **Expected:** The user can choose the voice and language used for spoken playback.
- **Code:** done. Evidence moved: apps/mobile/app/(app)/chat/[id].tsx:1589 (quoted code not found in the file now); apps/mobile/src/features/settings/voice-language/index.tsx:197
- **Where to find it:** Settings > Voice > Voice & Language (open the Voice row, then the Voice row again; Speech language is the row above it) (labels found in the code)
- **Needs:** none (a Free account works; voice-mode list only appears when live voice is available for the account)
- **Steps:**
  1. Open the side menu and tap Settings.
  2. Tap Voice.
  3. Tap the Speech language row and pick a language in the sheet, then close it.
  4. Tap the Voice row to open the Voice & Language screen.
  5. Look at the Speaking style list and the installed voice list, tap a voice, and compare what is shown as selected with Expected.

## S50.03 Speaking-rate control where supported.

- **Expected:** Where supported, the user can set the speaking rate of playback.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/voice/index.tsx:441; apps/mobile/app/(app)/chat/[id].tsx:1589 (quoted code not found in the file now)
- **Where to find it:** Settings > Voice > Speed (slider with value shown as 0.50x to 2.00x) (labels found in the code)
- **Needs:** a device with sound output; a chat with an assistant reply
- **Steps:**
  1. Open the side menu and tap Settings.
  2. Tap Voice.
  3. Drag the slider labelled Speed to a different value (range 0.5x to 2x, steps of 0.05).
  4. Tap Read aloud on an assistant reply in a chat, then listen and compare with Expected: the speed of spoken playback changes with the slider.
