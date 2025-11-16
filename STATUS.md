# AGI Workforce Desktop � Current Status

**Last Updated:** November 15, 2025
**Branch:** main

---

## Build & Runtime Health

| Check                       | Result | Notes                                                                                                                                      |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `cargo check` / `cargo run` | ?      | Clean builds with `#![deny(warnings)]`.                                                                                                    |
| `pnpm dev:desktop`          | ?      | Vite + Tauri boot. Kill `agiworkforce-desktop.exe` after testing (`taskkill /IM agiworkforce-desktop.exe /F`) to avoid file-lock warnings. |
| Database migrations         | ?      | Auto-drops stale `permissions` table if schema is missing the `name` column.                                                               |

---

## Recent Highlights

1. **Messaging reliability** � Teams client tracks OAuth expiry and refreshes automatically. Commands mutate the client in-place, satisfying Tauri�s `Send` requirements.
2. **MCP runtime stability** � Client/session/transport stacks now hold `Arc` handles instead of `parking_lot::MutexGuard`s, eliminating cross-thread `*mut ()` panics.
3. **Search & embeddings** � Indexing progress is serializable and no longer holds the embedded service lock across awaits. Hook execution stats are public so the `hooks_get_stats` command compiles.
4. **Migrations & auth** � The `permissions` table is recreated if legacy instances lack the `name` column. AI Employee commands no longer keep `MutexGuard`s across `.await`.
5. **DX polish** � JPEG optimization honors the `JPEG_QUALITY` constant, Ollama drops multimodal payloads for non-vision models, and Drive/WhatsApp logging improved for diagnostics.

---

## Next Steps

1. Keep `cargo check`, `cargo run --bin agiworkforce-desktop`, and `pnpm dev:desktop` in your pre-flight checklist.
2. If `pnpm dev:desktop` fails with �Access is denied,� terminate lingering `agiworkforce-desktop.exe` processes (Task Manager or `taskkill /IM agiworkforce-desktop.exe /F`) and rerun.
3. Revisit the backend report docs (`RUST_COMPILATION_ERRORS.md`, `docs/rust_backend_error_report.md`, `CRITICAL_FIXES_SUMMARY.md`) whenever introducing new Rust changes to keep operators informed.
