# Remediation Log - 2026-05-20

## Changed Files

- `apps/desktop/src-tauri/src/integrations/native_messaging/mod.rs`
  - Added optional request/response MAC fields, response `session_secret`, HMAC-SHA256 signing, and a regression test.

- `apps/desktop/src-tauri/src/integrations/native_messaging/host.rs`
  - Generated a per-process native messaging session secret, sent it on connect, and signed all stdout responses.

- `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`
  - Updated native request literals for the new optional envelope fields.

- `apps/desktop/src-tauri/src/sys/commands/tool_confirmation.rs`
  - Decoded encoded MCP tool-envelope segments before exact read-only allowlist checks.

- `apps/desktop/src-tauri/src/sys/commands/mcp.rs`
  - Replaced unnecessary `splitn` with `split` for strict clippy.

- `apps/desktop/src-tauri/src/core/mcp/config.rs`
  - Collapsed nested allowlist condition for strict clippy.

- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`
  - Initialized websocket config with a struct literal for strict clippy.

- `apps/desktop/src-tauri/src/sys/commands/vision.rs`
  - Removed redundant closure in default model selection.

- `apps/desktop/src-tauri/src/sys/filesystem/search.rs`
  - Avoided owned root path comparison and explicit walk counters.

- `apps/desktop/src-tauri/src/sys/prompt_enhancement/api_router.rs`
  - Replaced useless `format!` with `.to_string()`.

- `apps/desktop/src-tauri/src/sys/security/dispatch_hmac.rs`
  - Replaced manual range check with `RangeInclusive::contains`.

- `apps/desktop/src-tauri/src/sys/security/sandbox.rs`
  - Derived `Default` for feature-gate struct.

- `apps/desktop/src-tauri/src/sys/security/storage.rs`
  - Fixed rustdoc continuation indentation.

- `apps/mobile/storage/db.ts`
  - Replaced no-op DB stub with Expo SQLite + SecureStore-backed SQLCipher initialization, migrations, close, and rekey.

- `apps/mobile/storage/types.ts`
  - Aligned storage interfaces with migrations and call sites.

- `apps/mobile/storage/migrations.ts`
  - Corrected persisted chat mode checks from stale `local/cloud` values to `chat/agent/voice`.

- `apps/mobile/storage/installedModels.ts`
  - Added compatibility aliases for insert/delete call sites.

- `apps/mobile/storage/telemetry.ts` (pre-existing untracked file)
  - Parsed JSON payload rows into typed `TelemetryEvent` values.

- `apps/mobile/services/complianceLedger.ts`
  - Added `ConsentLedger` export to satisfy compliance call sites; persistence remains backlog.

- `apps/mobile/components/model-picker/ModelPickerSheet.tsx`
  - Fixed paywall import casing.

- `eslint.config.mjs`
  - Ignored `.remember` scratch directories and configured CommonJS globals for manual mocks.

- `package.json`, `pnpm-lock.yaml`
  - Raised vulnerable transitive dependency floors through overrides.

- `apps/desktop/package.json`, `apps/web/package.json`
  - Raised `mermaid` to a non-advisory range and aligned local ESLint with root ESLint 9.

- `apps/extension-vscode/package.json`, `services/api-gateway/package.json`, `services/signaling-server/package.json`
  - Raised direct `ws` dependency to `^8.20.1`.

## Unintended Churn Removed

Package-wide Rust formatting churn was generated during the first clippy cleanup. It was removed from the tracked diff, keeping only the files above.
