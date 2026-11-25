# Area 50. Audio overviews, speech generation, and music

32 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S50.01 Text-to-speech playback.
- Should: An assistant reply can be played aloud as speech.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing, api missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:3049; apps/web/features/chat/components/messages/ChatMessageList.tsx:1596; apps/web/lib/hooks/useTTS.ts:175; apps/mobile/src/features/chat/components/MessageBubble.tsx:1165; apps/mobile/src/features/voice/services/tts.ts:39

## S50.02 Voice and language selection.
- Should: The user can choose the voice and language used for spoken playback.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing, api missing
- Code: apps/web/features/settings/sections/GeneralSection.tsx:1349; apps/web/lib/hooks/useTTS.ts:154; apps/mobile/app/(app)/chat/[id].tsx:1589; apps/mobile/src/features/settings/voice-language/index.tsx:168

## S50.03 Speaking-rate control where supported.
- Should: Where supported, the user can set the speaking rate of playback.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing, api missing
- Code: apps/web/features/settings/sections/GeneralSection.tsx:1266; apps/web/lib/hooks/useTTS.ts:148; apps/mobile/src/features/settings/voice/index.tsx:405; apps/mobile/app/(app)/chat/[id].tsx:1589

## S50.04 Download generated speech.
- Should: Generated speech can be downloaded as an audio file.
- Status: not applicable anywhere

## S50.05 Source-to-audio overview.
- Should: The user turns chosen sources into a spoken audio overview.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.06 Single-narrator overview.
- Should: An overview can be generated with a single narrator.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.07 Multi-host overview.
- Should: An overview can be generated as a multi-host conversation.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.08 Brief versus detailed overview.
- Should: The user chooses a brief or detailed overview length.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.09 Source-selection controls.
- Should: The user selects which sources the overview covers.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.10 Overview instructions.
- Should: The user gives instructions that shape the overview.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.11 Audio transcript.
- Should: A transcript of the audio overview is available.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.12 Source-linked transcript references.
- Should: Transcript lines link back to the sources they draw on.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.13 Regenerate overview.
- Should: The user can regenerate an overview.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.14 Interactive interruption where offered.
- Should: Where offered, the user can interrupt the overview hosts and ask a question.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.15 Original music generation.
- Should: The user can generate an original piece of music.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.16 Vocal/instrumental choice.
- Should: The user chooses vocal or instrumental output.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.17 Genre controls.
- Should: The user sets the genre of generated music.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.18 Mood controls.
- Should: The user sets the mood of generated music.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.19 Instrumentation controls.
- Should: The user sets instrumentation for generated music.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.20 Tempo guidance.
- Should: The user gives tempo guidance (BPM or feel).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.21 Lyrics input.
- Should: The user supplies lyrics for generated music.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.22 Song-structure guidance.
- Should: The user guides song structure (verse, chorus, bridge).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.23 Short/long generation modes.
- Should: The user chooses short or long generation mode.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.24 Music templates.
- Should: Music templates are offered as starting points.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.25 Remix starters.
- Should: Remix starters let the user vary an existing track.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.26 Cover-art generation.
- Should: Cover art is generated for a track.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.27 Track title and metadata.
- Should: A generated track has a title and metadata.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.28 Playback and seek controls.
- Should: Generated music has playback and seek controls.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.29 Download and sharing.
- Should: Generated music can be downloaded and shared.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing

## S50.30 Music-service playback integration as a separate capability.
- Should: A music-streaming service (e.g. Spotify) can be connected to play music, as a capability separate from generation.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S50.31 Custom-voice creation as a separately governed product.
- Should: Custom voices (cloned or designed) are a separate, governed product with its own consent and access rules.
- Status: not applicable anywhere

## S50.32 Voice-consent and deletion management.
- Should: Voice-likeness consent is recorded and the user can revoke it and delete the voice.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing, api missing
