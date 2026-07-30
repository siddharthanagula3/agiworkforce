# Mobile Agent Rules

Status: Current
Owner: Mobile lead
Last updated: 2026-06-05

Read root `AGENTS.md`, then this file, then `apps/mobile/README.md`.

## Scope

`apps/mobile` owns small Local LLM onboarding, Cloud sign-in entry (public alpha, open by default, no invite/waitlist), mobile chat, capture, voice/camera, approvals, preview/share, store metadata, and mobile native modules. Mobile does not expose direct provider-key entry.

## Lane Contract

- Primary lanes: `mobile-app` and `mobile-native-store`.
- `mobile-app` owns Expo routes, Mobile feature domains, shared Mobile UI, remaining Mobile services/stores/storage/lib/hooks, and tests.
- `mobile-native-store` owns custom native modules (`apps/mobile/native/**`) and store listings. iOS project output is generated into the gitignored `apps/mobile/ios/` by prebuild (the tracked root `ios/` tree was deleted 2026-07-16); native changes go through config plugins, never hand-edits to generated output.
- Feature agents must not edit `apps/mobile/ios/**` (generated), `apps/mobile/native/**`, signing secrets, package manifests, or shared contracts without explicit lane reassignment.
- `pnpm check:mobile-hygiene` protects feature ownership and frozen root hook/lib drift.

## High-Risk Areas

- On-device data, SQLCipher/MMKV storage, Cloud sign-in/entitlement gating, model downloads, native modules, and store-review copy.
- Mobile should not become the heavy compute surface first. Generated-file and long-running compute requests should delegate to Desktop/local host or future managed/private compute.
- Do not route Local chats to Managed Cloud without explicit signed-in subscription/entitlement state, payload preview, and consent. Do not add Mobile direct provider-key entry without a new product decision.

## Verification

- Small change: `pnpm --filter @agiworkforce/mobile typecheck`
- Behavior change: `pnpm --filter @agiworkforce/mobile test`
- Native/store change: add manual verification notes and update store/release docs when relevant.
