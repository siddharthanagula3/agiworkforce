# apps/mobile/src/features/model-picker

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile v1 local-first model selection, local catalog loading, locked cloud row presentation, auto-routing mode display, provider logos, and model row presentation.

## Rules

- Import model-picker UI through `@/src/features/model-picker`.
- Import model picker state from `@/src/features/model-picker/store`.
- Import local-first model catalog helpers from `@/src/features/model-picker/service`.
- Active selectable models must come from `@agiworkforce/local-llm`.
- Cloud provider rows may be shown only as locked Cloud Managed/BYOK-disabled rows.
- Do not fetch `/api/models` or enable BYOK/cloud sends from this feature while Mobile v1 is local-only.
