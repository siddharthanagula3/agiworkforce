# apps/mobile/src/features/model-picker

Status: Current
Owner role: Mobile lead
Last updated: 2026-05-21
Purpose: Mobile model selection, model catalog loading, auto-routing mode display, provider logos, and model row presentation.

## Rules

- Import model-picker UI through `@/src/features/model-picker`.
- Import model picker state from `@/src/features/model-picker/store`.
- Import model catalog I/O from `@/src/features/model-picker/service`.
- Keep provider-switch gate logic in `@/src/features/model-picker/tierGuard`.
- Paywall and plan messaging should come from the paywall/billing domains.
