# apps/mobile/src/features/model-picker

Status: Current
Owner role: Mobile lead
Last updated: 2026-06-05
Purpose: Mobile model selection, local catalog loading, on-device model preparation state, locked cloud row presentation, auto-routing mode display, provider logos, and model row presentation.

## Rules

- Import model-picker UI through `@/src/features/model-picker`.
- Import model picker state from `@/src/features/model-picker/store`.
- Import model download/readiness state from `@/src/features/model-picker/installStore`.
- Import chat/runtime model reference resolution from `@/src/features/model-picker/localModelRuntime`.
- Import local model catalog helpers from `@/src/features/model-picker/service`.
- Active selectable models must come from `@agiworkforce/local-llm`.
- Downloadable preset models are prepared through `react-native-executorch` and recorded in `storage/installedModels` with `format = 'pte'` and `local_path = null`.
- OS-resident models are ready only when native capability detection reports Foundation Models or AICore availability.
- Cloud provider rows may be shown only as locked Cloud Managed invite rows.
- Do not fetch `/api/models` or enable cloud sends from this feature until Mobile Cloud Managed access is enabled.
