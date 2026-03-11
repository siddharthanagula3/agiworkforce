---
description: "Rust coding style for AGI Workforce Tauri v2 backend"
globs: ["**/*.rs"]
alwaysApply: false
---
# Rust Coding Style

## Tauri v2 Patterns

- All IPC handlers use `#[tauri::command]` and are registered in `lib.rs`
- State is passed via Tauri's managed state: `State<'_, T>`
- Use `app.manage(StateWrapper)` for state initialization
- Degraded state constructors for optional features: `MemoryState::degraded()`

## Error Handling

```rust
// Use Result<T, E> with descriptive errors
#[tauri::command]
async fn my_command(state: State<'_, AppState>) -> Result<String, String> {
    let result = do_something().map_err(|e| format!("Failed to do something: {}", e))?;
    Ok(result)
}
```

## Lint Rules (STRICT)

Cargo.toml denies these — all warnings are errors:
- `unsafe_code`
- `dead_code`
- `unused_imports`
- `unused_variables`
- `unused_mut`

`clippy::await_holding_lock` is allowed.

## Module Organization

```
src-tauri/src/
  core/       — AI engine (LLM, agents, MCP, embeddings, skills)
  sys/        — System services (commands, security, billing)
  automation/ — Desktop automation (screen, input, browser, OCR)
  features/   — Domain features (terminal, speech, calendar)
  integrations/ — External services (cloud sync, APIs)
  data/       — Data layer (SQLite, settings, cache)
  ui/         — Native UI (tray, windows, overlay)
  models/     — Shared data model structs
```

## Feature Flags

```toml
default = ["shell", "updater"]
# Optional: ocr, local-llm, vad, local-whisper, remote-databases, devtools
```

Use `#[cfg(feature = "...")]` guards for optional features.

## Build Verification

```bash
cargo check    # Fast type check
cargo clippy   # Lint (0 warnings required)
cargo test     # Unit tests
```
