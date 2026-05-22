# apps/mobile/src/features/edge-cases

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile offline, low-storage, thermal, battery, file-limit, image-limit, and first-run model-loading recovery UI.

## Rules

- Import edge-case UI through `@/src/features/edge-cases`.
- Keep user-facing recovery copy in `components/copy.ts`.
- Do not duplicate these modals in route screens; compose the domain components instead.
