---
id: "PLAN-desktop-050"
type: "test-plan"
title: "Desktop · 50. Audio overviews, speech generation, and music"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "50"
---
# Desktop · 50. Audio overviews, speech generation, and music

3 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S50.01 Text-to-speech playback.

- **Expected:** An assistant reply can be played aloud as speech.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3982; apps/web/features/chat/components/messages/ChatMessageList.tsx:1773; apps/web/lib/hooks/useTTS.ts:379
- **Where to find it:** Open a chat with an assistant reply > hover the reply and click the "More message actions" button > "Read message aloud" (labels found in the code)
- **Needs:** a browser or desktop app with speech support (a system voice); an account with a chat that has an assistant reply
- **Steps:**
  1. Sign in and open a chat that has at least one assistant reply.
  2. Hover over an assistant reply and click the "More message actions" button (three-dot button).
  3. Click "Read message aloud" in the menu.
  4. Check that the reply is spoken aloud, and that the menu item changes to "Stop reading message" while it plays. Click it again to stop.

## S50.02 Voice and language selection.

- **Expected:** The user can choose the voice and language used for spoken playback.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1349 (quoted code not found in the file now); apps/web/lib/hooks/useTTS.ts:361
- **Where to find it:** Settings > General > Preferences > "Backup read-aloud voice" (labels found in the code)
- **Needs:** a browser or desktop app that lists system voices (if it lists none, the row says "This browser has no voices, so read-aloud has no backup.")
- **Steps:**
  1. Open Settings and choose the "General" section.
  2. Scroll to the "Preferences" heading and find the "Backup read-aloud voice" row.
  3. Open the drop-down. It starts at "Browser default"; pick another voice from the list, which shows each voice name and its language in brackets.
  4. Click "Preview" and listen. The voice is used for read-aloud when it falls back to this voice. Compare with Expected: the chosen voice and language are used for spoken playback.

## S50.03 Speaking-rate control where supported.

- **Expected:** Where supported, the user can set the speaking rate of playback.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1266 (quoted code not found in the file now); apps/web/lib/hooks/useTTS.ts:355
- **Where to find it:** Settings > General > Preferences > "Read-aloud speed" (labels found in the code)
- **Needs:** a browser or desktop app with speech support; a chat with an assistant reply
- **Steps:**
  1. Open Settings and choose the "General" section.
  2. Scroll to the "Preferences" heading and find the "Read-aloud speed" row, just below "Backup read-aloud voice".
  3. Click "Slow", "Normal" or "Fast" (the selected one is pressed).
  4. Click "Read message aloud" on an assistant reply (see S50.01) and listen. Compare with Expected: the speech speed changes with the setting.
