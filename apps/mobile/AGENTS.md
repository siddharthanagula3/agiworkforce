# Mobile Agent Rules

Status: Current
Owner: Mobile lead
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then `apps/mobile/README.md`.

## Scope

`apps/mobile` owns Local/BYOK onboarding, mobile chat, capture, voice/camera, approvals, preview/share, store metadata, and mobile native modules.

## Lane Contract

- Primary lanes: `mobile-app` and `mobile-native-store`.
- `mobile-app` owns Expo routes, Mobile feature domains, shared Mobile UI, remaining Mobile services/stores/storage/lib/hooks, and tests.
- `mobile-native-store` owns custom native modules, store listings, and root `ios/` changes.
- Feature agents must not edit `ios/**`, `apps/mobile/native/**`, signing secrets, package manifests, or shared contracts without explicit lane reassignment.
- `pnpm check:mobile-hygiene` protects feature ownership and frozen root hook/lib drift.

## High-Risk Areas

- On-device data, SQLCipher/MMKV storage, HealthKit/Health Connect, BYOK consent, provider-key storage, model downloads, native modules, store-review copy, and Local -> BYOK handoff.
- Mobile should not become the heavy compute surface first. Generated-file and long-running compute requests should delegate to Desktop/local host or future managed/private compute.
- Do not route Local chats to BYOK or Managed without explicit fork, payload preview, and consent.

## Verification

- Small change: `pnpm --filter @agiworkforce/mobile typecheck`
- Behavior change: `pnpm --filter @agiworkforce/mobile test`
- Native/store change: add manual verification notes and update store/release docs when relevant.
