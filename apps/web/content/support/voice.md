---
id: voice
title: Talk to AGI: voice mode and dictation
path: /chat
category: voice
tags: voice, voice mode, dictation, microphone, speech to text, transcript, voices, marin, mute, microphone denied, speak
updated: 2026-09-19
scope: public
---

## Two different things

**Dictation** turns speech into text in the composer. On web, finishing a recording
sends its audio to AGI's transcription service. You review the resulting text
before sending it as a chat message. Cancel before finishing the recording to
discard it without requesting transcription.

**Voice mode** is a spoken conversation: AGI listens and answers out loud, and a
transcript of both sides appears as you go.

## Dictation

Turn it on in Settings, Voice: "Turn speech into composer text with the
microphone button. Review the transcript before sending." The same page sets the
language dictation transcribes into. Turning dictation off disables its microphone
button and language control, and discards any recording still in progress.

## Voice mode

Start it with the **Start voice mode** button in the composer. Voice settings
choose the spoken voice, how much intelligence a voice turn gets, and its
language, which can be left on **Auto-detect**. Choose from the voices available
in the voice settings.

## When voice will not start

The message names the cause:

- "Microphone access was denied. Allow the microphone to use voice mode."
  Grant the microphone permission in your browser's site settings and retry.
- "No microphone is available in this browser." No input device was found.
- "This browser cannot open a voice connection." The browser does not support
  the connection voice mode needs.
- "The voice connection could not be established." or "The voice connection
  dropped." A network problem; start the session again.

Some embedded surfaces cannot record audio at all because the host blocks
microphone access, so dictation and voice mode are unavailable there rather than
failing mid-session.
