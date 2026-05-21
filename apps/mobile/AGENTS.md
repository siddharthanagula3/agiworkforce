# Mobile Agent Rules

Status: Current
Owner: Mobile lead
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then `apps/mobile/README.md`.

## Scope

`apps/mobile` owns Local/BYOK onboarding, mobile chat, capture, voice/camera, approvals, preview/share, store metadata, and mobile native modules.

## High-Risk Areas

- On-device data, SQLCipher/MMKV storage, HealthKit/Health Connect, BYOK consent, provider-key storage, model downloads, native modules, store-review copy, and Local -> BYOK handoff.
- Mobile should not become the heavy compute surface first. Generated-file and long-running compute requests should delegate to Desktop/local host or future managed/private compute.
- Do not route Local chats to BYOK or Managed without explicit fork, payload preview, and consent.

## Verification

- Small change: `pnpm --filter @agiworkforce/mobile typecheck`
- Behavior change: `pnpm --filter @agiworkforce/mobile test`
- Native/store change: add manual verification notes and update store/release docs when relevant.
