# apps/mobile/src/features/video

Status: Current
Owner role: Mobile lead
Last updated: 2026-08-07
Purpose: Mobile video generation — starting a Cloud video task, polling it to completion, and surfacing progress to the chat turn that requested it.

## Rules

- Import video generation from `@/src/features/video`.
- Video is Cloud-only. Local Mode runs entirely on-device and never reaches
  these services; admission is decided by
  `@/src/features/chat/actions/resolveMobileVideoGenerationRequest` before
  anything here is called.
- A video task runs for a minute or more behind `/api/media/video/status`, so
  callers must pass `shouldCancel` and check the account epoch on every poll,
  not only at the end. A sign-out midway through must stop writing into a
  conversation the previous account owned — see `runVideoGenerationTurn`.
- The model comes from the catalog the user chose in Add to chat, resolved by
  `resolveMediaModelId('video')`. Never hardcode a model id here; the
  `video_generation` routing slot is the default.
- Inline playback is not available. The app has no video playback dependency
  (`expo-video`, `expo-av` and `react-native-video` are all absent) and adding
  one is a native module needing a new dev-client build, so `GeneratedVideo`
  renders the poster frame and says "Open in browser" rather than showing a
  play triangle that does something else.
