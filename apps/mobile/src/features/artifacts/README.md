# apps/mobile/src/features/artifacts

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile Artifacts gallery, received-artifact previews, local copy/share actions, and Desktop or future Cloud Managed artifact handoff.

## Routes

- `app/(app)/artifacts/index.tsx` wraps this feature for Expo Router.

## Rules

- Keep artifact display local-first and share through native OS share APIs.
- Do not add cloud upload or generation paths here without a feature flag and waitlist gate.
- Put reusable artifact preview data/types in this folder, not in route wrappers.
