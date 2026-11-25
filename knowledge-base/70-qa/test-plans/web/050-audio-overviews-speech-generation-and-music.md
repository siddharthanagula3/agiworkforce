---
id: "PLAN-web-050"
type: "test-plan"
title: "Web · 50. Audio overviews, speech generation, and music"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "50"
---
# Web · 50. Audio overviews, speech generation, and music

3 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S50.01 Text-to-speech playback.

- **Expected:** An assistant reply can be played aloud as speech.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3982; apps/web/features/chat/components/messages/ChatMessageList.tsx:1773; apps/web/lib/hooks/useTTS.ts:379
- **Where to find it:** Chat, under an assistant reply > More message actions > Read message aloud (labels found in the code)
- **Needs:** a browser that supports speech synthesis, with at least one system voice
- **Steps:**
  1. Sign in to the AGI Web app and open a conversation that has an assistant reply.
  2. Move the pointer over the assistant reply, then click the button labelled More message actions.
  3. Click Read message aloud in the menu.
  4. Look for the reply being spoken aloud, and for the same menu item now reading Stop reading message while it plays.

## S50.02 Voice and language selection.

- **Expected:** The user can choose the voice and language used for spoken playback.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1349 (quoted code not found in the file now); apps/web/lib/hooks/useTTS.ts:361
- **Where to find it:** Settings > General > Preferences > Backup read-aloud voice (labels found in the code)
- **Needs:** a browser with at least one system voice; the row shows a message instead if the browser has no voices
- **Steps:**
  1. Sign in, open Settings, and choose the General tab.
  2. Scroll to the Preferences heading and find the row Backup read-aloud voice.
  3. Open the drop-down labelled Backup read-aloud voice and choose a voice; each option shows its name and language code in brackets, and Browser default is the first option.
  4. Click Preview next to the drop-down and listen; compare the voice and language with what you chose.

## S50.03 Speaking-rate control where supported.

- **Expected:** Where supported, the user can set the speaking rate of playback.
- **Code:** done. Evidence moved: apps/web/features/settings/sections/GeneralSection.tsx:1266 (quoted code not found in the file now); apps/web/lib/hooks/useTTS.ts:355
- **Where to find it:** Settings > General > Preferences > Read-aloud speed (labels found in the code)
- **Needs:** a browser with speech synthesis support; the row is hidden when speech is not supported
- **Steps:**
  1. Sign in, open Settings, and choose the General tab.
  2. Scroll to the Preferences heading and find the row Read-aloud speed.
  3. Click Slow, Normal or Fast; the chosen button is shown as pressed.
  4. Open an assistant reply, use Read message aloud, and compare the pace with the Normal setting.
