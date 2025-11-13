# AGI Workforce Desktop – Settings & Windowing Audit

_Date: 2025-11-12_

## Scope

Focused review of the recent stability regressions reported while running the desktop shell:

- Desktop window sizing/docking
- Settings persistence and the Settings panel
- Provider/model defaults shared between Rust settings APIs and the React store

## Findings & Fixes

| #   | Finding                                                                                                                                                                                                                | Impact                                                                          | Fix                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `settings_load` returned snake_case structs missing newly added providers (xAI, DeepSeek, Qwen, Mistral). `SettingsPanel` attempted to read `llmConfig.defaultModels.openai` on `undefined`, crashing the UI.          | Settings dialog unusable; API key/configuration flows broken.                   | Normalised the Rust structs to `#[serde(rename_all = "camelCase")]`, extended `DefaultModels` to include every provider, and aligned defaults with the React store (`apps/desktop/src-tauri/src/commands/settings.rs`). |
| 2   | Historical settings stored in `localStorage` lacked the new provider keys, so even after fixing the backend the frontend would still dereference missing fields.                                                       | Users with old state files would continue to crash.                             | Added defensive merging in `useSettingsStore.loadSettings()` so saved configs are overlayed onto a complete default shape before hitting the UI (`apps/desktop/src/stores/settingsStore.ts`).                           |
| 3   | Frontend constants/tests were out of sync with the new defaults (`llama3.3`, `grok-4`, `qwen-max`, `mistral-large-latest`). This produced inconsistent dropdowns, context-window calculations, and failing unit tests. | Model selectors displayed stale options; tests did not cover the real defaults. | Synced `MODEL_PRESETS`/`MODEL_CONTEXT_WINDOWS`, updated the Vitest suite, and re-ran `pnpm vitest run src/__tests__/stores/settingsStore.test.ts` (passes with mocked warnings).                                        |
| 4   | Desktop window manager still forced frameless+docking behaviour, causing awkward resolutions on startup.                                                                                                               | Users could not use a regular resizable window.                                 | Reconfigured `apps/desktop/src-tauri/src/window/mod.rs` and tray commands to disable docking, restore OS decorations, and treat previous docked geometries as standard window bounds.                                   |

## Verification

- `cargo check -p agiworkforce-desktop`
- `pnpm vitest run src/__tests__/stores/settingsStore.test.ts` (from `apps/desktop`)

Both commands complete successfully (Vitest emits expected mock warnings about simulated failures).

## Open Risks / Follow-ups

- Existing SQLite settings rows still only include four providers. A schema/data migration will be needed if we want those written back to disk.
- Consider migrating old `window_state.json` files to drop obsolete docking fields so future startups skip the additional reset logic.
