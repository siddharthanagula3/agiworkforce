# apps/mobile/src/features/voice

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile voice conversation UI, recording/review controls, waveform display, on-device STT, and on-device TTS helpers.

## Public API

- `index.ts` is the domain import surface.
- `components/` owns voice UI.
- `services/` owns voice input, output, and TTS orchestration.

## Rules

- Import voice code through `@/src/features/voice`.
- Keep v1 voice local-first unless explicitly gated behind `FEATURES.cloudChat`.
- Cloud STT/TTS calls must remain feature-flagged and privacy-reviewed.
