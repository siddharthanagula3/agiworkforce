# apps/mobile/src/features

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Canonical Mobile product-domain root for Expo/React Native feature code.

## Rules

- New Mobile product features land in a top-level domain folder here.
- Route screens import feature APIs through each domain barrel.
- Legacy `components/`, `services/`, and `stores/` paths are migrated one domain at a time.
- Heavy local primitives stay in `src/platform`, `src/integrations`, `src/storage`, or `src/ui` when they are not feature-owned.
