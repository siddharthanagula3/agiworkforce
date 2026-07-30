# apps/mobile/src/features/model-picker

Status: Current
Owner role: Mobile lead
Last updated: 2026-07-14
Purpose: Mobile model selection, local catalog loading, on-device model preparation state, registry-admitted Managed Cloud rows, auto-routing mode display, provider presentation metadata, and model row presentation.

## Rules

- Import model-picker UI through `@/src/features/model-picker`.
- Import model picker state from `@/src/features/model-picker/store`.
- Import model download/readiness state from `@/src/features/model-picker/installStore`.
- Import chat/runtime model reference resolution from `@/src/features/model-picker/localModelRuntime`.
- Import local model catalog helpers from `@/src/features/model-picker/service`.
- Active selectable models must come from `@agiworkforce/local-llm`.
- Managed Cloud rows must come from the shared model registry through
  `getPickerModelsForRuntimeProfile('mobile/cloud-chat')`. Do not maintain a
  Mobile provider roster, model list, default model, or capability map.
- Downloadable preset models are prepared through `react-native-executorch` and recorded in `storage/installedModels` with `format = 'pte'` and `local_path = null`.
- OS-resident models are ready only when native capability detection reports Foundation Models or AICore availability.
- Managed Cloud is public alpha and open by default after sign-in. Rows are
  locked only by authentication, subscription entitlement, runtime-profile
  admission, lifecycle, or an honest environment requirement.
- The model picker does not fetch `/api/models`; registry compilation and
  generated-code drift checks keep its catalog aligned with the server.
- Model identity must remain visible. Tier and mode labels must never replace a
  selected model's canonical display name or provider provenance.
- Local auto modes must remain on-device. Managed Cloud routing belongs to the
  canonical router and server authority, not to model-picker conditionals.
