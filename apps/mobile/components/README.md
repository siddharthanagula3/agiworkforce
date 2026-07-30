# apps/mobile/components

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Legacy Expo-compatible import root retained only for shared UI primitives.

## Rules

- New product-domain UI belongs in `apps/mobile/src/features/<domain>/components`.
- Keep `components/ui` available while route and feature code still imports `@/components/ui`.
- Do not add feature folders back under `apps/mobile/components`.
