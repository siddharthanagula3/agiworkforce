# AGI Workforce Audit — 2026-05-01

Auditor: Claude (Opus 4.7), in `/Users/siddhartha/Desktop/agiworkforce` at HEAD `9271b03a` (branch `main`).
Scope: Tauri v2 desktop, Next.js web, Expo mobile, Rust CLI/TUI, Chrome ext, VS Code ext, ~115 Rust crates, ~1,459 Tauri IPC commands, 25 LLM providers.

---

## Executive Summary

- **Total findings: 78** · **P0: 11** · **P1: 28** · **P2: 26** · **P3: 13**
- **Overall ship-readiness: RED.**
- **Estimated remediation for P0+P1 only: ~22–30 engineering days** (one engineer, no scope cuts).
- **Top 3 ship-blockers:**
  1. **Provider API keys are encrypted with a machine-derivable key, not the master password.** The Argon2id `MasterPasswordManager` (`apps/desktop/src-tauri/src/sys/security/master_password.rs:456-472`) is dead code — `derive_key_with_password()` has zero callers. `save_api_key` (`apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:1731-1743`) calls `derive_key(KeyPurpose::McpCredentials)` which only mixes a stable OS UID (`apps/desktop/src-tauri/src/sys/security/machine_key.rs:162-182`). Anyone with the SQLite file recovers all 25 providers' keys.
  2. **`computer_use_*` Tauri commands have zero approval gating.** `computer_use_click`, `computer_use_type_text`, `computer_use_move_mouse`, `computer_use_execute_tool` (`apps/desktop/src-tauri/src/sys/commands/computer_use.rs:198-330`) accept LLM-supplied coordinates/text and dispatch real OS input with no `tool_confirmation` call (compare `terminal.rs:60-90`, which does gate). Plaintext is also logged via `tracing::info!("Typing text: {}")` (line 253). One indirect prompt injection in a doc/PDF and the agent can `rm -rf ~`.
  3. **CI has been red for 5 consecutive commits including the v0.1.0 release tag.** `cargo test --workspace --lib` (`.github/workflows/ci.yml:117`) fails because `agiworkforce-app-server` has 24 compile errors and `agiworkforce-utils-pty` is missing the `pretty_assertions` dev-dep. Git log: `9271b03a`, `a6d87c5d`, `693fc08b`, `8ae27e24`, `b9ebdbf8` — every push to `main` since 2026-05-02 04:29 UTC has failed CI. The `Release Desktop` workflow for tag `v0.1.0` also failed.

The repo is shipping work claimed to be done while the build is broken, the encrypted credential story is theatre, the highest-blast-radius IPC commands are unauthenticated, and the Privacy Policy contradicts the runtime architecture. Multiple "this is encrypted / this is signed / this is a managed proxy" claims in user-facing surfaces are not true in code today.

---

## Phase 1 — Vision & Requirements Drift

### Coverage matrix

The stated vision lives only in `~/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/product-vision.md` (no root README/CLAUDE.md/AGENTS.md). The vision states _"ONE layout. Chat. Everything inside it. DELETE all 28+ separate views/pages."_

| Feature claim (memory)                    | Status                              | Evidence                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ONE chat layout, no separate pages        | **Specified, drifted** (P1)         | 25 standalone view directories still exist under `apps/desktop/src/components/` (Terminal, Canvas, Database, Git, Voice, Browser, Memory, Marketplace, Skills, Calendar, Documents, Connectors, Outcomes, MCP, ToolCalling, Realtime, Scheduler, Tools, ScreenCapture, Mobile, Productivity, Reminders, Workflows, Schedules, Images). Vision said delete. Code retains every one. |
| 25 LLM providers                          | **Implemented** (24 typed)          | `apps/desktop/src/types/provider.ts:1-25` declares 24 distinct provider IDs. Memory says 25. Off-by-one or undocumented.                                                                                                                                                                                                                                                           |
| Multi-agent / teams                       | **Stub** (P2)                       | `apps/cli/src/teams.rs` and `apps/cli/src/subagent.rs` flagged "prototype only" in `docs/planning/cli-modernization-spec.md:117-119`.                                                                                                                                                                                                                                              |
| Browser automation                        | **Implemented OK**                  | `apps/desktop/src-tauri/src/automation/browser/` 8 modules; `apps/desktop/src/components/Browser/` 5 files.                                                                                                                                                                                                                                                                        |
| Computer use                              | **Implemented but unsafe** (P0)     | `apps/desktop/src-tauri/src/sys/commands/computer_use.rs:198-330` no approval gate.                                                                                                                                                                                                                                                                                                |
| Voice                                     | **Partial** (P2)                    | `apps/desktop/src-tauri/src/lib.rs:1837` admits "Wispr Flow speech recording stubs". TTS+PTT shipped; STT stub.                                                                                                                                                                                                                                                                    |
| MCP                                       | **Implemented** (P2 for CLI parity) | `apps/desktop/src-tauri/src/core/mcp/` 14 files; CLI `apps/cli/src/mcp.rs` is stdio-only (`docs/planning/cli-modernization-spec.md:34`).                                                                                                                                                                                                                                           |
| Mobile companion                          | **Partial** (P2)                    | `apps/mobile/` Expo scaffold present; vision claims "37+ screens, 5 tabs, dispatch" — not verified.                                                                                                                                                                                                                                                                                |
| CLI (`agiworkforce`)                      | **Implemented WIP** (P1)            | `apps/cli/src/main.rs` plus 54 ported codex-rs crates. Spec at `docs/planning/cli-modernization-spec.md:25-35` admits "current CLI has many of these ideas... split between a monolithic main.rs and richer Codex-shaped crates that are not wired as the default path" — i.e., parallel implementations not unified.                                                              |
| BYOK                                      | **Implemented but insecure** (P0)   | See Phase 4 §P0-1.                                                                                                                                                                                                                                                                                                                                                                 |
| Skills (140+)                             | **Implemented**                     | `apps/desktop/src/data/skills/`.                                                                                                                                                                                                                                                                                                                                                   |
| **Scope creep — built but not in vision** | **P1**                              | `Database/`, `Canvas/`, `Productivity/`, `Outcomes/`, `Realtime/`, `ScreenCapture/`, `ROIDashboard/`, `Governance/`, `Marketplace/`, `Schedules/` AND `Scheduler/` (two!) — none in stated vision.                                                                                                                                                                                 |

### Stub/TODO sweep — security-critical

**P0 (security)**

- `apps/desktop/src-tauri/src/sys/commands/messaging.rs:87, :140, :199` — `// TODO: SECURITY — Credentials should be encrypted via SecretManager before storage. Currently stored as plaintext JSON. See FIX-R10.` Slack `bot_token`/`app_token`/`signing_secret`, WhatsApp `access_token`/`verify_token`, Teams `client_secret`/`tenant_id` all written to SQLite `messaging_connections.credentials` as plaintext JSON.

**P1 (capability misrepresentation)**

- `apps/desktop/src-tauri/src/sys/commands/google_batch.rs:1-37` — _"This is currently a mock/stub implementation using in-memory storage. Job data is NOT persisted across app restarts."_ Exposed as `google_batch_create`, `google_batch_list`, `google_batch_cancel` Tauri commands with no UI affordance signaling "not real."
- `apps/desktop/src-tauri/src/sys/account/mod.rs:847` — `device-revoke` is a no-op TODO.

**P1 (panics)**

- `crates/agiworkforce-config/src/config_toml.rs:284, :298, :468` — three `todo!()` in TOML round-trip; if any is reached the process panics.
- `crates/agiworkforce-linux-sandbox/src/landlock.rs:258` — `unimplemented!("unsupported architecture for seccomp filter")` panics on non-x86_64 Linux.

---

## Phase 2 — Architecture Integrity

### Architecture diagram

```
+-----------------------------------------------------------------------------+
|                        FRONTEND APPS  (TS / JS)                             |
|                                                                             |
| apps/web/      Next.js 14 app router  (NOT a Vite SPA — memory is wrong).   |
|                ~50 page.tsx, 45 API routes (`apps/web/app/api`).            |
|                BUILD HACK: builds Vite over apps/desktop's UI, copies       |
|                dist-web -> public/chat/, then `next build`.                 |
|                (apps/web/package.json:8)                                    |
|                                                                             |
| apps/desktop/  Tauri v2 + Vite SPA (React 18, Zustand)                      |
|     src/      App.tsx 1495 LOC                                              |
|     src-tauri/ 733 .rs files, 371 503 LOC                                   |
|                                                                             |
| apps/mobile/   Expo / React Native + NativeWind (10 stores)                 |
| apps/cli/      Rust CLI (clap) + ratatui TUI (188 .rs, 150 696 LOC)         |
| apps/extension/         Chrome/Vite extension (manifest v3)                 |
| apps/extension-vscode/  VS Code extension (esbuild)                         |
+--------------------+--------------------------------------------------------+
                     | Tauri IPC: 1458 #[tauri::command]
                     | (1380 registered in lib.rs:1038, 26 silently dead,
                     |  20 frontend invokes target nonexistent commands)
                     v
+-----------------------------------------------------------------------------+
|     apps/desktop/src-tauri/src   (single binary, NOT a workspace)           |
|                                                                             |
|  lib.rs (2644 LOC)   generate_handler! has 1380 entries hand-listed         |
|     ├─ automation/   gestures, OS automation                                |
|     ├─ core/         agent/, agi/, llm/, mcp/, scheduler/, swarm/, ...      |
|     ├─ data/         db/, cache/, settings/, state/, supabase_sync          |
|     ├─ features/     calendar/, productivity/, teams/, workflows/, ...      |
|     ├─ integrations/ api_integrations/, cloud/, native_messaging/           |
|     ├─ sys/          commands/ (111 .rs), security/, telemetry/             |
|     └─ ui/           tray.rs, menus                                         |
|                                                                             |
|  >>> NB: this binary's only `agiworkforce-*` workspace dep is                |
|  >>> `agiworkforce-sandbox-policy`. None of the 115 ported codex-rs        |
|  >>> crates in /crates/ ship in the desktop bundle.                         |
+----+-----------------+---------------------+--------------------------------+
     |                 |                     |
     v                 v                     v
+----------+  +-------------------+  +----------------------+
| /crates/ |  | /services/  TS/Node|  | /supabase/           |
| 115 dirs |  | api-gateway        |  | migrations 17 .sql   |
| 883 392  |  | (Express)          |  | (RLS not audited)    |
| LOC.     |  | signaling-server   |  +----------------------+
| Used by  |  | (WebRTC, Fly.io)   |
| apps/cli |  +--------------------+
| only.    |
+----------+
     |
     v
+-----------------------------------------------------------+
| /packages/                                                |
|   api/      Tauri-aware fetch wrappers                    |
|   chat/     ChatHostBridge + 7 stores (web+desktop import)|
|   runtime/  Tauri-vs-web detection                        |
|   stores/   EMPTY STUB — `src/index.ts:12` exports nothing|
|             yet web+desktop list it as workspace dep      |
|   types/, utils/, react-native-worklets/                  |
+-----------------------------------------------------------+
```

### State ownership

168 store files (memory says 90 — outdated). Same field owned by 5–6 separate stores.

| Concern  | Stores                                                                                                                                                                                                                         | Total LOC |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Chat     | desktop:`stores/chat/chatStore.ts`, web:`stores/unified/chat/chatStore.ts`, web:`shared/stores/chat-store.ts`, web:`features/chat/stores/chat-store.ts`, mobile:`stores/chatStore.ts`, packages:`chat/src/stores/chatStore.ts` | **7,462** |
| Auth     | desktop:`stores/auth.ts`, desktop:`stores/authOrchestrator.ts`, web:`stores/unified/auth.ts`, web:`shared/stores/authentication-store.ts`, mobile:`stores/authStore.ts`                                                        | **2,895** |
| Settings | 6 stores                                                                                                                                                                                                                       | —         |
| Agents   | 6 stores                                                                                                                                                                                                                       | —         |

`packages/stores/src/index.ts:12` is `// Stores will be exported here…` with no exports — yet `apps/web/package.json:24` and `apps/desktop/package.json:30` list it as a `workspace:*` dep. **P1 — empty workspace pkg**.

### God files (>2000 LOC, production)

49 files exceed 2000 LOC. Notable:

| LOC    | File                                                               | Notes                                 |
| ------ | ------------------------------------------------------------------ | ------------------------------------- |
| 12 198 | `crates/agiworkforce-tui/src/chatwidget.rs`                        | 3-way fork                            |
| 10 976 | `crates/agiworkforce-app-server/src/codex_message_processor.rs`    | broken (Phase 3)                      |
| 10 945 | `crates/agiworkforce-app-server-protocol/src/protocol/v2.rs`       | broken                                |
| 10 888 | `crates/agiworkforce-tui_app_server/src/chatwidget.rs`             | fork                                  |
| 9 733  | `apps/cli/src/tui/chatwidget.rs`                                   | fork                                  |
| 5 552  | `apps/desktop/src-tauri/src/data/db/migrations.rs`                 | single migration file, 60+ versions   |
| 5 351  | `crates/agiworkforce-protocol/src/protocol.rs`                     |                                       |
| 3 388  | `apps/desktop/src-tauri/src/core/agi/tools/mod.rs`                 |                                       |
| 3 249  | `apps/desktop/src-tauri/src/sys/commands/continuous_job_runner.rs` |                                       |
| 3 060  | `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`          |                                       |
| 2 899  | `apps/desktop/src-tauri/src/core/agi/executors/git_executor.rs`    |                                       |
| 2 660  | `apps/web/components/UnifiedAgenticChat/index.tsx`                 | single React component                |
| 2 644  | `apps/desktop/src-tauri/src/lib.rs`                                | 1380 entries in `generate_handler![]` |
| 2 540  | `apps/desktop/src-tauri/src/core/llm/llm_router.rs`                |                                       |
| 2 462  | `apps/desktop/src-tauri/src/sys/security/tool_guard.rs`            |                                       |

### Duplication map

- **TUI is forked 3-way:** `apps/cli/src/tui/` (125 .rs) ≠ `crates/agiworkforce-tui/src/` (212 .rs) ≠ `crates/agiworkforce-tui_app_server/src/` (138 .rs). `chatwidget.rs` differs by 3 730 lines between two of three forks.
- **LLM router exists twice:** `apps/desktop/src-tauri/src/core/llm/llm_router.rs` (2540 LOC) is hand-rolled; `crates/agiworkforce-core/src/tools/router.rs` (334 LOC) is the codex-rs version. Desktop binary imports neither `agiworkforce-ollama`, `agiworkforce-lmstudio`, `agiworkforce-chatgpt`, nor `agiworkforce-model-provider`.
- **MCP transport exists three times:** `apps/desktop/src-tauri/src/core/mcp/`, `crates/agiworkforce-mcp/src/`, `crates/agiworkforce-rmcp-client/src/`.
- **Slash command handlers** sibling-forked: `apps/desktop/src/handlers/slashCommandHandlers.ts` and `apps/web/handlers/slashCommandHandlers.ts`.
- **Crate consumption:** the desktop Tauri binary depends on **just one** workspace crate (`agiworkforce-sandbox-policy`). `apps/cli/Cargo.toml` consumes ~12. The remaining ~100 crates (~880 K LOC) are workspace dead-weight.

**P0:** `Cargo.toml:3` includes `crates/*` as workspace members; release LTO + `codegen-units = 1` (`Cargo.toml:11`) over this corpus inflates compile time without producing shipped code, AND keeps a corpus of broken crates (Phase 3) in CI's path.

### IPC inventory

| Metric                                                               | Count                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#[tauri::command]` definitions across `apps/desktop/src-tauri/src/` | **1 458**                                                                                                                                                                                                                                                                                                      |
| Files containing commands                                            | 132                                                                                                                                                                                                                                                                                                            |
| Distinct command names                                               | 1 405                                                                                                                                                                                                                                                                                                          |
| Registered in `lib.rs` `generate_handler!` (lib.rs:1038)             | 1 380                                                                                                                                                                                                                                                                                                          |
| Defined but **NOT registered** (silently dead)                       | **26** (e.g. `settings_v2_get/set/list_all/...`, `abort_execution`, `build_system_tray`, `canvas_a2ui_execute`, `clear_error_contexts`, `index_workspace_file`, `retry_failed_step`, `search_symbols`, `send_invoice_email`, `skip_failed_step`, `stripe_create_setup_intent`, `stripe_delete_payment_method`) |
| Frontend invokes a non-existent command                              | **20** (will throw at runtime)                                                                                                                                                                                                                                                                                 |
| Registered but never invoked from any frontend                       | **169** (attack surface; capabilities/ allows core IPC)                                                                                                                                                                                                                                                        |
| TODO/FIXME/unimplemented! in src-tauri                               | 9                                                                                                                                                                                                                                                                                                              |

### Module boundaries

The lib.rs declares a layered structure (`automation → core → data → features → integrations → sys → ui`) but `grep "use crate::"` shows bidirectional edges everywhere:

| Edge                    | Imports                                                                   | Note                 |
| ----------------------- | ------------------------------------------------------------------------- | -------------------- |
| `sys/` → `core/`        | 103                                                                       |                      |
| `core/` → `sys/`        | 83                                                                        | **CYCLE** with above |
| `data/` → `core/`       | 2 (e.g. `data/state/draft_manager.rs:1`, `data/cache/llm_responses.rs:1`) | **CYCLE**            |
| `features/` → `core/`   | 4                                                                         | **CYCLE**            |
| `automation/` → `core/` | 8                                                                         |                      |

Concrete: `apps/desktop/src-tauri/src/sys/security/encryption.rs:1` imports `crate::core::sync_utils::RwLockExt`; `apps/desktop/src-tauri/src/core/sync_utils.rs:6` imports `crate::sys::error::Error`. P2 — naming is fictional but it compiles.

---

## Phase 3 — Hallucination Sweep

### Build status (the headline)

- **`pnpm typecheck` (apps/desktop)**: clean. `tsc --noEmit` → exit 0.
- **`cargo check -p agiworkforce-desktop`**: clean. Compiles in 1m55s.
- **`cargo check -p agiworkforce-cli`**: clean.
- **`cargo check --workspace`**: **FAILS**. `agiworkforce-app-server` has **24 compile errors**. The bash pipeline masked the exit code (cargo's exit was eaten by `tee`/`tail`); CI reports failure correctly.
- **`cargo test --workspace --lib --no-run`**: **FAILS**. `agiworkforce-utils-pty` is missing the `pretty_assertions` dev-dep:
  ```
  crates/agiworkforce-utils-pty/src/tests.rs:4:5: error[E0432]: unresolved import `pretty_assertions`
  ```
- **GitHub Actions CI**: last 5 runs all `failure` (verified 2026-05-02 04:44 UTC):
  ```
  failure  docs(cli): readme + demo.sh for the v0.1.0 ship                             3m03s
  failure  feat(cli): output styles + 4 new slash commands                             3m09s
  failure  feat(cli): --demo flag, fallback tui banner, onboarding refresh             3m02s
  failure  chore(crates): port codex-rs batch 7 — finalize rebrand + bazel + readmes   3m15s
  failure  chore(deps): bump the desktop-patch-minor group across 1 directory          1m12s
  ```
- **`Release Desktop` for tag `v0.1.0`** also failed (2026-05-02 04:44 UTC, 1m41s). Memory says "Tag v0.1.0 pushed to origin" — true, but **the release pipeline did not produce signed artifacts**. The "ship" is incomplete.

### The 24 errors in `agiworkforce-app-server` (P0)

Textbook LLM hallucinations from the codex-rs rebrand (memory: "54 Codex CLI crates copied + rebranded; 36 compiling"):

```
crates/agiworkforce-app-server/src/lib.rs:55  E0432  no `AgiworkforceFeedback` in agiworkforce_feedback
crates/agiworkforce-app-server/src/lib.rs:76  E0583  module file not found
crates/agiworkforce-app-server/src/lib.rs:121 E0308  expected Arc<dyn ThreadConfigLoader>, found &str
crates/agiworkforce-app-server/src/lib.rs:649 E0599 no variant `RemoteControl` on enum `Feature`
crates/agiworkforce-app-server/src/in_process.rs:86      E0432
crates/agiworkforce-app-server/src/message_processor.rs:70   E0432
crates/agiworkforce-app-server/src/message_processor.rs:1048 E0308 expected Option<&AgiworkforceAuth>, found bool
crates/agiworkforce-app-server/src/message_processor.rs:1057 E0282 cannot infer type
crates/agiworkforce-app-server/src/message_processor.rs:1059 E0425 cannot find `list_accessible_connectors_from_mcp_tools_with_environment_manager`
crates/agiworkforce-app-server/src/message_processor.rs:1129 E0599 no variant `RemoteControl`
crates/agiworkforce-app-server/src/bespoke_event_handling.rs:1910 E0277  size of [RolloutItem] unknown at compile time (×4)
crates/agiworkforce-app-server/src/bespoke_event_handling.rs:2762 E0277,E0061  trait+arity mismatch
crates/agiworkforce-app-server/src/config_api.rs:406  E0609 no field `entries` on NetworkDomainPermissionsToml
crates/agiworkforce-app-server/src/config_api.rs:418  E0609 no field `entries` on NetworkUnixSocketPermissionsToml
crates/agiworkforce-app-server/src/config_api.rs:434-444  E0599 no associated item Allow/Deny/None
```

These are exactly the kind of symbol-invention errors that arise from auto-rebranding a codebase by find-and-replace without compiling.

### Clippy / lint suppressions

- `cargo clippy --workspace --lib -- -D warnings -D unsafe-code` is enforced by CI line 121.
- `cargo audit` runs at `--deny warnings` (CI line 106) for **critical** and advisory at `high`.
- `eslint --max-warnings=0` enforced (`package.json:34`).

### Spot checks for fake imports

- `crates/agiworkforce-chatgpt/src/connectors.rs:25` — `unused import: agiworkforce_core::plugins::PluginsManager` (warning, leftover from rebrand).
- `apps/desktop/src/handlers/slashCommandHandlers.ts` and `apps/web/handlers/slashCommandHandlers.ts` — diverged copies; risk of one referencing a constant the other deleted.

### Dependency CVEs

**`pnpm audit --prod` — 25 vulnerabilities (12 high, 13 moderate, 0 critical)**

| Sev  | Package                    | Path                                                                                                                                       |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| High | `node-forge ≤1.3.3`        | `apps/mobile > expo > @expo/cli > node-forge` (3× advisories — Ed25519 forgery, RSA-PKCS forgery, basicConstraints bypass, modInverse DoS) |
| High | `path-to-regexp`           | `services/api-gateway > express > router`, `services/signaling-server > express > router` (ReDoS)                                          |
| High | `lodash-es 4.17.23`        | `apps/desktop > mermaid > @mermaid-js/parser > langium > chevrotain → lodash-es` (`_.template` code injection)                             |
| High | `next 16.2.1`              | `apps/web > next` (DoS in Server Components)                                                                                               |
| High | `@xmldom/xmldom 0.8.x`     | apps/mobile > expo > @expo/cli > @expo/plist (5 advisories)                                                                                |
| Mod  | `dompurify 3.3.3`          | `apps/desktop > dompurify`, `monaco-editor > dompurify`, `mermaid > dompurify` (XSS)                                                       |
| Mod  | `@anthropic-ai/sdk 0.80.0` | `apps/web > @anthropic-ai/sdk` (insecure local-fs default permissions in Memory tool)                                                      |

**`cargo audit` — 9 vulnerabilities**

- `RUSTSEC-2026-0119` `hickory-proto` O(n²) name-compression DoS — reachable via `mongodb → hickory-resolver`.
- `RUSTSEC-2026-0118` `hickory-proto` NSEC3 unbounded loop.
- `RUSTSEC-2023-0071` `rsa 0.9.10` Marvin Attack — used by `mongodb`, `mysql_async`.
- `RUSTSEC-2026-0098, -0099, -0104` × 2 versions `rustls-webpki` 0.101.7 and 0.103.10 — name-constraint bypass + panic on CRL.

**Patches blocked by transitive Expo / mermaid / chevrotain trees** — pnpm `overrides` are already used for some deps (`package.json:18-30`); add overrides for `node-forge`, `lodash-es`, `dompurify`, `@xmldom/xmldom` and bump `next` directly.

---

## Phase 4 — Security Audit

### P0-1. API keys "encrypted" with a machine-derivable key; master-password is dead code

- `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:1731-1743` — `save_api_key()` calls `encrypt_credential(&key)` and writes to SQLite `settings_v2`.
- `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs:1269-1286` — `encrypt_credential()` derives the key with `derive_key(KeyPurpose::McpCredentials)`.
- `apps/desktop/src-tauri/src/sys/security/machine_key.rs:162-182` — `derive_key()` is **machine-only** (PBKDF2 over `machine_uid` + bundle-id constants). On macOS, `machine_uid` = `IOPlatformUUID`, readable by any process.
- `apps/desktop/src-tauri/src/sys/security/machine_key.rs:238-266` — `derive_key_with_password()` exists but **has zero callers**. `grep -rn derive_key_with_password apps/desktop/src-tauri/src/` returns only the export and definition.
- `apps/desktop/src-tauri/src/sys/security/master_password.rs:456-472` — full Argon2id+HKDF implementation, never invoked from any IPC critical path.

**Impact:** Anyone with read access to the SQLite file plus a single run of the binary on the same machine recovers all 25 providers' keys. Exfiltrated DB on its own decrypts via `machine_uid`. The "AES-256-GCM" technically present in the encryption is operationally meaningless against the stated threat model.

### P0-2. Computer-Use IPC has zero approval gate

- `apps/desktop/src-tauri/src/sys/commands/computer_use.rs:198-221` `computer_use_click(x, y)` issues real OS click at LLM-supplied coords; no permission check, rate limit, confirmation.
- `apps/desktop/src-tauri/src/sys/commands/computer_use.rs:248-270` `computer_use_type_text(text)` sends arbitrary keystrokes to whatever has focus AND `tracing::info!("Typing text: {}", text)` (line 253) — **plaintext passwords land in logs**.
- `apps/desktop/src-tauri/src/sys/commands/computer_use.rs:223-246` `computer_use_move_mouse` — same pattern.
- `apps/desktop/src-tauri/src/sys/commands/computer_use.rs:296-330` `computer_use_execute_tool` — dispatches `click`/`type`/`move_mouse` from raw `serde_json::Value`.

The framework exists — `apps/desktop/src-tauri/src/sys/commands/terminal.rs:60-90` does call `tool_confirmation::request_confirmation_simple` and `redact_secrets`. Computer-use just doesn't use it. Indirect prompt injection (PDF, web page, email contents) → "click (x,y) and type `rm -rf ~`" → executed.

### P0-3. Supabase auth tokens in localStorage with a public-derivable "encryption" key

- `apps/desktop/src/lib/supabase.ts:28-65, 87-104` — key material at line 33 is the constant `'agiworkforce-storage-v1-' + window.location.hostname`. In Tauri the hostname is fixed (`tauri://localhost`). Salt at line 41 is the hardcoded constant `'agi-supabase-storage-salt-2026'`. The author's own comment at lines 24-25 admits _"anyone with source can reproduce the derivation"_.

Anyone who exfiltrates `localStorage` (XSS, browser cache, CSP bypass) recovers plaintext Supabase tokens. The DB-encryption story is a sticker over a glass door.

### P0-4. CSP allows `'unsafe-inline'` for style-src

- `apps/desktop/src-tauri/tauri.conf.json:24` — `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`.
- Combined with the `dompurify 3.3.3` advisories (P1-3 above), an XSS-via-style-injection vector becomes realistic.
- Webview XSS in Tauri = full IPC = the entire 1 459-command surface. Tailwind/shadcn use predominantly class-based styles, so removal is feasible (or move to nonce/hash CSP).

### P0-5. Plaintext Slack/WhatsApp/Teams credentials in SQLite

- `apps/desktop/src-tauri/src/sys/commands/messaging.rs:71-237` — three handlers (`connect_slack`, `connect_whatsapp`, `connect_teams`). Each builds a `serde_json::json!({...})` of secrets and INSERTs as plaintext into `messaging_connections.credentials`. Authors left their own `// TODO: SECURITY` with cross-reference to "FIX-R10" — unfixed. The `store_api_key()` helper (`apps/desktop/src-tauri/src/sys/security/storage.rs:203`) was available all along.

### P0-6. Privacy Policy materially contradicts code

- Privacy doc (`apps/web/app/privacy/page.tsx:55-105`) claims:
  - _"AGI Workforce uses a managed proxy model for LLM access...your requests are routed through our secure proxy"_
  - _"We do not store, log, or use your conversations"_
  - _"Local-first application... remains on your device unless you explicitly choose to sync"_
- Code reality:
  - `apps/desktop/src/types/provider.ts:1-25` lists `'openai'`, `'anthropic'`, `'google'`, `'xai'`, `'deepseek'`, `'cohere'`, `'mistral'`, `'groq'`, `'together'`, `'fireworks'`, `'perplexity'`, `'azure'`, `'bedrock'`, `'open_router'`, `'ai21'`, `'sambanova'` — i.e., direct BYOK to 24 providers. **Not** "proxy only".
  - `apps/web/core/monitoring/analytics-tracker.ts:124-188` loads `googletagmanager.com/gtag/js` and tracks events. Privacy mentions "Basic telemetry...if opted in" but does not name GTM/GA. CSP (`apps/web/proxy.ts:19`) explicitly allows GTM. **GDPR consent gap**.
  - Sentry (`apps/desktop/src/services/errorTracking.ts:5-75`) initialized; opt-in respected (line 43); but Privacy doc never names Sentry — also non-conforming under GDPR purpose-limitation.

This is consumer-protection / regulator exposure (FTC, ICO, CNIL all care about "proxy only" claims that aren't true).

### P0-7. CI is red on `main` and the tagged release shipped without successful pipeline

- 5 most recent CI runs `failure`. `Release Desktop` for `v0.1.0` `failure`. Tag pushed; bundles unsigned/incomplete.

### P0-8. ~880 K LOC of unused crates inflate the workspace and keep CI red

- `Cargo.toml:3` `members = [..., "crates/*"]`.
- Desktop binary depends on 1 (`agiworkforce-sandbox-policy`); CLI on ~12. The other ~100 crates are vendored ports that don't ship — but they're in the workspace, so `cargo test --workspace` exercises them, and the broken ones (Phase 3 above) keep CI red.

### P0-9. Per-request token cap not enforced; per-user/daily cost cap absent

- `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs:714, :808, :1715` — `max_tokens` is honoured **when present** in the request; no global cap is imposed before the call.
- Session cap (`apps/desktop/src-tauri/src/core/agent/autonomous.rs:180, :335, :767, :1051`) defaults to $50, **resets per autonomous run**.
- No per-user / daily cap anywhere.
- For BYOK with OpenAI/Anthropic, an indirect prompt injection (P0-2 attack vector + a poisoned doc) can drain `$50 × n_runs` against the user's keys before any throttle hits.

If the managed-cloud proxy enforces server-side daily caps, mark this **P1 advisory** for managed-cloud users and **P0** for BYOK.

### P0-10. Plaintext credentials misalign with stated encryption posture

(Same root cause as P0-1/P0-3/P0-5; included to make the count explicit because there are three independent code paths.)

### P0-11. ~880k LOC of dead crates (overlap with P0-8 — counted because it has both compilation and licensing impact)

The fork includes `[patch.crates-io]` rerouting `tokio-tungstenite` and `tungstenite` to private SHAs in `github.com/openai-oss-forks` (`Cargo.toml:31-35`). License terms of the _forked_ repository must be confirmed (upstream is MIT but forks under different orgs need separate review).

### P1 — pre-launch fixes (security)

- **P1-1 — Prompt injection: tool-list appended to system prompt with no delimiter.** `apps/desktop/src-tauri/src/core/llm/prompt_tool_injection.rs:91-94` does `sys_msg.content.push_str(&injection)` with no XML / sentinel boundary. Wrap in unique sentinels.
- **P1-2 — Attachment/PDF text concatenated into instruction with weak markers.** `apps/desktop/src-tauri/src/core/agi/orchestrator.rs:620-630` uses `[End Attachment]` as terminator — a malicious PDF can emit that string. Use a per-call cryptographic nonce.
- **P1-3 — Path traversal on git commands.** `apps/desktop/src-tauri/src/sys/commands/git.rs:99` `git_init(path)`, `:111` `git_status(path)`, `:200` `git_add(path, files)`, `:226` `git_commit(path, message)` — all accept `path: String`, pass to `Repository::open()`, **no `validate_path_security()`** (which exists at `file_ops.rs:71-154` and is used there).
- **P1-4 — Unbounded `limit` in fs_search.** `apps/desktop/src-tauri/src/sys/filesystem/search.rs:5-21` `fs_search_files(query, limit: usize)` — `limit` is unbounded; caller can pass `usize::MAX`. Combined with `walkdir` over a large tree → OOM.
- **P1-5 — Tauri `automation_send_keys` / `automation_type` lack approval gate.** `apps/desktop/src-tauri/src/sys/commands/automation.rs:239, :433` — 100k length cap exists; AI-action confirmation does not.
- **P1-6 — Substring-match path blacklist.** `apps/desktop/src-tauri/src/sys/commands/file_ops.rs:181-206` uses `path_lower.contains(blocked)`. False positives (`events.txt` blocked because contains "ent") and false negatives (`id_rsa`, `.kube/config`, `.docker/config.json`, `.netrc` not in list).

### P2 — security tech debt

- **P2-1 — `KEYRING_SERVICE = "codex"`.** `crates/agiworkforce-secrets/src/lib.rs:22` — left over from rebrand; users with Codex CLI installed will have keyring collisions.
- **P2-2 — Tracing emits raw command text in computer-use** (overlaps P0-2 logging concern).
- **P2-3 — `cargo audit` global ignore list (~27 RUSTSEC entries) without per-entry justification.** Re-review.
- **P2-4 — `connect-src http://localhost:11434` in CSP** — Ollama. Fine on personal machines, attackable on multi-tenant hosts.
- **P2-5 — `pubkey` in tauri.conf.json (`apps/desktop/src-tauri/tauri.conf.json:64`)** is a real minisign key (not placeholder), endpoint matches docs. ✓ — included as "P2 verify" not as a finding.

---

## Phase 5 — Data Integrity

### Persistence layers

1. SQLite (`apps/desktop/src-tauri/src/data/db/`) — primary.
2. localStorage (apps/desktop & apps/web) — auth tokens, theme, subscription cache.
3. Supabase Postgres (us-east-2; no EU residency) — sync target.
4. Stronghold/keychain — **referenced** but not consistently used (P4-1).
5. Filesystem — `~/.agiworkforce/**`.

### Migrations

`apps/desktop/src-tauri/src/data/db/migrations.rs` — 5 552 LOC, **122 `CREATE TABLE` statements**, **263 `CREATE INDEX`** statements (well-indexed).

- **Versioned**: yes. `schema_version` table holds rows; `run_migrations` (line 289) iterates `if current_version < N { run_migration_in_transaction(conn, N, apply_migration_vN)? }` for N=1..47+ (sample at lines 323-387).
- **Atomic per migration**: yes. `run_migration_in_transaction` (line 262-287) uses a SAVEPOINT named `migration_v{n}`.
- **Reversible**: **no**. No `down`/`rollback` per-migration. 3 mentions of `DROP TABLE` are forward fixups, not rollbacks. **P1**.
- **Tested on prod-shaped data**: only **4 of ~60 migrations** have explicit tests (`migrations.rs:5262-5550`). `test_migration_v59_rebuilds_and_redacts_auth_sessions` is good (asserts `REDACTED_TOKEN_SENTINEL` replacement). **P2 — coverage gap**.
- **Newer-version handling**: explicit (line 308-322) — refuses to run if DB schema is newer than app, logs a clear error. ✓
- **Single 5 552-LOC file**: every change appended to one file → rebase nightmare. **P2 — split per migration version**.

### Destructive operations

- `db_execute_prepared` (`database.rs:180`) gates DML through a confirmation. ✓
- `apps/desktop/src/api/privacy.ts` exposes `privacy_export_data` and `privacy_delete_account` Tauri commands — but the Privacy Policy doesn't mention GDPR rights. **P1 — UX/legal mismatch**.
- "Delete agent" / "Wipe history" — confirmation pattern not audited; sample 5 destructive actions.

### Backups

- No app-level backup or restore-test code found. **P1** for a "store everything locally" product.

### Concurrent writes

- Most async paths use `tokio::sync::Mutex`. ✓
- One blocking-mutex-in-async hot path: `apps/desktop/src-tauri/src/core/agi/core.rs:115` uses `std::sync::Mutex` instead of `tokio::sync::Mutex`. **P2 — deadlock risk under concurrent IPC**.
- `apps/desktop/src-tauri/src/data/supabase_sync.rs:227-245` `bulk_sync_to_cloud` is **N+1 over HTTP** (one POST per conversation/message) — write amplification under load. **P1**.

---

## Phase 6 — Error Handling & Observability

### Empty catches

- `apps/desktop/src/components/UnifiedAgenticChat/artifact-components/ReactPreview.tsx:73` — `catch (_) {}` swallows iframe init errors. **P2**.
- `apps/desktop/src/stores/voiceModeStore.ts:335, :343, :694` and `apps/desktop/src/hooks/useTTS.ts:169` — `voiceTtsStop().catch(() => {})` (4 sites). **P1** — TTS subsystem failures invisible to user.
- 5× `InlineToolResults/Inline*.tsx` (clipboard fallback). **P3** — should at least toast.

### `.unwrap()` / `.expect()` in non-test Rust

3 869 occurrences in `apps/desktop/src-tauri/src/`. Sampled categories:

- Static regex compile, HMAC keysize, static dates, `models.json` parse, Tauri `.run()` — **all startup-only, P3**.
- **No** unwrap on user-input or network response found in `core/llm/`, `automation/`, `integrations/`, `sys/security/` paths sampled.

### LLM call protections

| Protection                               | Status                                                                   | Evidence                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Connect timeout                          | YES (30 s)                                                               | `core/llm/providers/http_client_factory.rs:41`                                  |
| Read timeout (non-streaming)             | YES (300 s)                                                              | `http_client_factory.rs:42`                                                     |
| Streaming idle timeout                   | YES (30 s)                                                               | `core/llm/llm_router.rs:67`                                                     |
| Connect timeout for streams              | YES (90 s)                                                               | `llm_router.rs:56`                                                              |
| Retries with classification              | YES (max 3)                                                              | `llm_router.rs:69-200, :1210`                                                   |
| Exponential backoff                      | YES                                                                      | `llm_router.rs:194-200`                                                         |
| Circuit breaker                          | PARTIAL                                                                  | `core/llm/fallback_chain.rs:266` `RateLimitTracker`, `:203-260` `CooldownEntry` |
| Fallback provider chain                  | YES                                                                      | `fallback_chain.rs:634` `run_with_fallback`                                     |
| Per-request token cap                    | **NO** global cap                                                        | (P0-9)                                                                          |
| Per-session cost cap                     | YES ($50)                                                                | `core/agent/autonomous.rs:180`                                                  |
| Per-user / daily cost cap                | **NO**                                                                   | —                                                                               |
| `ManagedCloudProvider::default` fallback | **constructs `Client::new()` with no timeouts** when timed builder fails | `core/llm/providers/managed_cloud_provider.rs:49-60` — **P2**                   |

### Logging hygiene

- Rust src-tauri: 46 println/eprintln; mostly panic-handler. Acceptable.
- Rust crates/: 458 println/eprintln. Acceptable in CLI bins.
- TS/TSX: **1 247** raw `console.log`/`console.error` across `apps/desktop/src` + `apps/web/src` + `apps/mobile`. **No centralized logger.** No PII redaction in browser console. Sentry exists but not wired as a logger facade. **P1**.
- Rust `redact_secrets()` (`apps/desktop/src-tauri/src/sys/security/log_redaction.rs:17-82`) exists with regexes for OpenAI/AWS/Google/Stripe/Bearer/AKIA/GitHub/db URLs — but is not consistently invoked. `core/mcp/transport.rs:542`, `features/calendar/google_calendar.rs:184, :230` log raw IDs/titles. **P2**.

### Frontend error boundaries

- Desktop top-level wraps under `ErrorBoundary` (`apps/desktop/src/App.tsx:1256, :1487`). `SectionErrorBoundary.tsx` exists and is unit-tested.
- Web (Next.js): 10+ `error.tsx`/`global-error.tsx` files. ✓
- `unhandledrejection` and `error` listeners registered (`apps/desktop/src/App.tsx:283-300`) with paired removeEventListener. ✓

### Telemetry

- Sentry init at `apps/desktop/src/services/errorTracking.ts:42-75`; `beforeSend` strips cookies/headers/query strings (lines 57-68); Settings UI exposes the toggle (`SettingsPanel.tsx:467`). ✓ — but Privacy doc doesn't name it (P0-6).

---

## Phase 7 — Testing Reality Check

### Counts

| Layer                                        | Count             |
| -------------------------------------------- | ----------------- |
| Rust files with `#[test]` / `#[tokio::test]` | 1 353             |
| Rust tests in `apps/desktop/src-tauri/src/`  | 4 181 annotations |
| Rust tests in `crates/`                      | 8 819 annotations |
| Rust files in dedicated `tests/` dirs        | 317               |
| TS/TSX `*.test.{ts,tsx}` / `*.spec.{ts,tsx}` | 342               |
| Playwright e2e specs                         | 17                |

### Mutation samples

| File                                                                | Quality                                      | Note                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/src-tauri/src/sys/security/tool_guard.rs:2098-2462`   | **Good**                                     | Real assertions on `Err(SecurityError::PathTraversal(_))`, concurrent rate-limit enforcement                                                                                                                                |
| `apps/desktop/src-tauri/src/core/llm/provider_adapter_tests.rs:15+` | **Good**                                     | 56 tests, real assertions                                                                                                                                                                                                   |
| `apps/desktop/src-tauri/src/data/db/migrations.rs:5262-5550`        | **Good for what's there**                    | Only ~4/60 migrations covered. **P2**.                                                                                                                                                                                      |
| `apps/desktop/e2e/agi-safety.spec.ts` (596 LOC)                     | **THEATER — P1**                             | Every assertion gated on `await locator.isVisible({timeout}).catch(() => false)`; tests pass when the feature is absent. Pattern at lines 21, 40-42, 55, 60, 67, 90, 105, 109, 116, 134, 153, 158, 172, 174, 185, 189, 191. |
| `apps/desktop/e2e/smoke.spec.ts:1-33`                               | **No-crash check, not a feature smoke — P2** | 2 tests; second only asserts `interactiveElements > 0`                                                                                                                                                                      |
| `apps/desktop/e2e/comprehensive-flows.spec.ts` (933 LOC)            | **Likely theater** (sampled pattern matches) | Pattern repeats                                                                                                                                                                                                             |

### CI

- Lint, typecheck, JS test all blocking. ✓
- Rust tests at `ci.yml:117` use `--skip enigo --skip AutomationService --skip automation` — silences 3 high-risk suites. **P2**.
- `--max-warnings=0` enforced for ESLint. ✓
- `cargo clippy --workspace --lib -- -D warnings -D unsafe-code`. ✓
- `pnpm audit --audit-level=critical` blocking; `--audit-level=high` advisory (`continue-on-error: true`). 12 highs ignored.
- `cargo audit --deny warnings` blocking; `cargo audit` (no flag) advisory. 9 vulns ignored on the advisory side.
- `deploy-signaling-server.yml:245` — production deploy step is `continue-on-error: true`. **P1**.
- **No Windows test job** — Windows-only bugs surface only at release. **P2**.

---

## Phase 8 — Performance & Resource Leaks

### React effect cleanup

Sampled 4 sites — `App.tsx`, `StatusBanner.tsx`, `IterationProgressPanel.tsx`, `AgentTaskMonitor.tsx`. All paired with cleanup. **P3** — full sweep recommended; 245 useEffect-using files unsampled.

### Rust task leaks

459 `tokio::spawn` sites in `apps/desktop/src-tauri/src/` + `crates/`. Sampled 5:

- `core/agi/core.rs:404` — fire-and-forget goal execution; handle dropped → cannot cancel. **P2 — needs separate signaling channel**.
- `core/swarm/agent_spawner.rs:367` — uses `stop_signal: AtomicBool`. ✓
- `ui/hooks/mod.rs:41` — fire-and-forget telemetry. Acceptable.
- `core/agi/executor.rs:679, :824` — handle pushed into Vec, awaited via `join_all`. ✓
- `core/llm/background_manager.rs:112, :157` — nested spawns; need orchestrated shutdown.

### `Mutex` across `.await`

20 sampled in `core/agi/orchestrator.rs:182-710` — all `tokio::sync::Mutex` (async-safe). ✓
1 explicit comment ("Scope the MutexGuard so it is dropped before any .await") at `sys/commands/chat/conversation.rs:345` — team is aware.
1 misuse: `core/agi/core.rs:115` `std::sync::Mutex` in async path. **P2**.

### DB query patterns

- 263 indexes — well-indexed. ✓
- N+1: `data/supabase_sync.rs:227-245` `bulk_sync_to_cloud` issues per-row HTTP POST. **P1**.

### LLM cost controls

(See Phase 6 table.) **P0-9** — no per-request cap, no per-user/daily cap.

### Bundle / binary

- `apps/desktop/dist`: **3.5 MB**. Largest: `desktop-core-DnGspm5j.js` 596 KB, `index-nDEKxPGv.js` 592 KB, `react-vendor-BIgFRy6B.js` 380 KB. Within budget.
- `apps/desktop/src-tauri/target/release/agiworkforce-desktop`: **33 MB**. Reasonable.
- target/release cache: 9.6 GB (build artifacts, not shipped). OK.

---

## Phase 9 — Cross-Platform Correctness

### Hardcoded paths

- **Test fixtures with absolute author path:**
  - `apps/cli/src/tui/resume_picker.rs:1419` — `"/Users/siddhartha/Desktop/agiworkforce/apps/cli"` literal in a test path. **P2 — fails on any non-author machine / CI runner.**
  - `apps/desktop/src-tauri/src/integrations/native_messaging/manifest.rs:579, :581` — `PathBuf::from("/Users/siddhartha/Library/Containers/...")` inside `#[cfg(test)]`. **P3**.
- **Build output committed:** `apps/web/.next/required-server-files.json:107, :320, :330` has the author's absolute path baked in. `.next/` is gitignored at line 45 of `.gitignore`, but the file is present — likely a slipped commit. **P2**.
- **Placeholder text:** `apps/web/app/features/plugins/page.tsx:141` `"/Users/you/projects"` — OK.
- `/tmp/` paths almost all in tests; one in a doc comment. OK.

### Platform `cfg`

- 604 `cfg(target_os = ...)` directives.
- Three-platform branches verified for `apps/desktop/src-tauri/src/automation/executor.rs:19, :26, :33`.
- **Linux computer-use missing**: `apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs:409, :640` references `wmctrl`/`xdotool` shell-outs but no AT-SPI / Wayland code; no `automation/linux/` dir mirroring `automation/mac/` or `automation/uia/`. **Computer-use degrades silently on Linux**. **P1**.
- `crates/agiworkforce-linux-sandbox/src/landlock.rs:258` — `unimplemented!()` panics on non-x86_64 Linux. **P1**.

### CI multi-platform

- `release-desktop.yml:209-510` matrix builds macOS (universal/aarch64/x86_64), Windows x64, Linux x64. ✓
- macOS smoke + clippy on every PR. ✓
- **No Windows test job.** **P2**.

---

## Phase 10 — DevOps & Delivery

### Lockfiles & pins

- `pnpm-lock.yaml` ✓; `Cargo.lock` ✓; `package.json:13-15` pins Node 22, pnpm ≥9.15.0, packageManager pnpm@9.15.3 ✓; `.nvmrc` says 22 ✓; `apps/desktop/src-tauri/rust-toolchain.toml` pins 1.94.0 ✓.
- `.gitignore:70` excludes `Cargo.lock` then re-allows for `apps/**/Cargo.lock` and `/Cargo.lock` — fragile. **P3**.

### CI workflows (`.github/workflows/`)

- 8 workflows. ci.yml strict on lint/type/test/clippy. ✓
- `continue-on-error: true` audit:
  - `ci.yml:63` (high-sev pnpm audit) — acceptable advisory.
  - `ci.yml:111` (advisory cargo audit) — acceptable.
  - `deploy-signaling-server.yml:245` (production deploy) — **P1**.
- **CI is currently red on `main`.** 5 consecutive failures (Phase 3).

### Release pipeline

- `release-desktop.yml`:
  - macOS code signing: APPLE_CERTIFICATE/PASSWORD/SIGNING_IDENTITY/ID/PASSWORD/TEAM_ID present in env. ✓
  - Notarization: `tauri-action@v0.6.2` performs notarization automatically given `APPLE_ID`+`APPLE_PASSWORD`+`APPLE_TEAM_ID`. ✓
  - Tauri update signing: TAURI_SIGNING_PRIVATE_KEY + TAURI_SIGNING_PRIVATE_KEY_PASSWORD ✓; pubkey at `tauri.conf.json:64` is real (not placeholder). ✓
  - **Risk:** macOS signing step is gated `if: env.APPLE_CERTIFICATE != ''` — when secret is missing, signing silently skips and the artifact still uploads as "release". **P1**.
  - **Windows code signing absent.** No signing identity in `tauri.conf.json` (lines 36-43 declare only `digestAlgorithm` and timestamp URL) and no signing certs referenced in any workflow. Windows installer ships unsigned → SmartScreen warnings. **P1**.
  - tauri-action pinned to commit SHA `84b9d35b…` (line at v0.6.2 marker). ✓
- `Release Desktop` for `v0.1.0` failed (Phase 3) — no signed artifact produced.

### Reproducibility

- **No root README, BUILD, or CONTRIBUTING.** Build command for new contributor is undocumented. Tauri Rust + system deps need OS-specific install (`libwebkit2gtk-4.1-dev`, etc., per `ci.yml:36`). **P1 — onboarding gap**.

### Feature flags

- No external SaaS (LaunchDarkly, GrowthBook). Server-side flags in `apps/web/app/api/me/route.ts:110-149`, consumed by `apps/web/stores/unified/auth.ts:64+`. Schema in `apps/web/shared/types/supabase.ts:395`. ✓

---

## Phase 11 — UX, Accessibility, Edge States

### Loading / empty / error

- 10/10 sampled components handle these (BackgroundTasks, Connectors/HealthDashboard, Reminders, Settings/UsageDashboard, AgentTaskMonitor). `ui/EmptyState.tsx` shared component. ✓
- Two `ErrorBoundary` files (root + ErrorHandling/) — duplicate. **P3**.

### A11y ratio

- 772 `aria-label`/`aria-labelledby` vs 2 810 `<button>`/`<Button>` = ~27%. **P2 — many icon-only buttons unlabeled**.
- Critical paths good: `CommandPalette.tsx:582, :631, :642` and `ChatInputArea.tsx:1322-1359` (aria-live, aria-label). ✓
- 49 occurrences of `tabindex` or `onKeyDown` repo-wide. Sparse. **P2**.
- `Layout/UserProfile.tsx:67-68` uses `role="button" tabIndex={0}` — should be a real `<button>`. **P3**.

### Onboarding

- `apps/desktop/src/components/Onboarding/` — only `OnboardingWizard.tsx` plus a re-export (`OnboardingWelcome` is `export { OnboardingWizard as OnboardingWelcome }`).
- Missing first-launch "Local mode or Cloud mode" choice (per `~/.claude/.../memory/feedback-desktop-ux-gaps.md:5-15`). **P1**.
- Auth race on cold boot — "Sign in to enable Cloud Mode" shows even when signed in (same memory). **P1**.

### Offline

- `apps/desktop/src/stores/appModeStore.ts:45, :85` — `navigator.onLine` consumed; `setOnline` action wired.
- `apps/desktop/src/components/OfflineIndicator.tsx:17, :58` and `Layout/StatusBar.tsx:32-46, :206`. ✓
- Cloud-model requests still throw at request time (no client-side gate). User sees error. **P2**.

---

## Phase 12 — Legal / IP / Compliance

### License

- Root `LICENSE`: PROPRIETARY AND CONFIDENTIAL. Placeholder `[your-contact-info]`. **P3**.
- `package.json:11`, `apps/extension/package.json:9`, `apps/extension-vscode/package.json:6` all declare `"PROPRIETARY"`. ✓
- **Forked OSS Rust deps:** `Cargo.toml:31-35` patches `tokio-tungstenite` and `tungstenite` to private SHAs in `github.com/openai-oss-forks`. Upstream MIT — fork license terms must be confirmed. **P1**.
- `pnpm-lock.yaml` has no `AGPL`/`GPL-3`/`SSPL` strings. `cargo-license` not run in CI. **P2 — add to CI**.

### Privacy / ToS

- Privacy doc says proxy-only / no logging / local-first; reality is BYOK to 24 providers + GTM/GA + Sentry. **P0** (Phase 4 §P0-6). FTC + GDPR exposure.
- ToS (`apps/web/app/terms/page.tsx`) — 7 sections only, **no DPA, governing law, warranty disclaimer, arbitration**. Bare-bones. **P1**.
- No GDPR data-subject rights surface mentioned, despite `privacy_export_data` and `privacy_delete_account` IPC commands existing (`apps/desktop/src/api/privacy.ts`). **P1**.

### Data residency

- Supabase: `aws-1-us-east-2.pooler.supabase.com` (`supabase/.temp/pooler-url:1`) — **US East**. No EU residency option. **P1 — for any EU customer**.
- No S3/R2/GCS user-data buckets found. ✓

### LLM provider ToS

- 24 providers wired. Several (Groq, Together, Fireworks) have output-redistribution restrictions for "competing models". No provider-ToS acknowledgment surface; users sign nothing on first use. **P2 advisory**.

---

## Coverage matrix (re-print)

| Feature claim                                                                                    | Spec?                     | Impl?      | Working?                   | Verdict      |
| ------------------------------------------------------------------------------------------------ | ------------------------- | ---------- | -------------------------- | ------------ |
| ONE chat layout                                                                                  | ✓                         | ✓          | ✗ (drift)                  | **P1** drift |
| 25 LLM providers                                                                                 | ✓                         | 24 typed   | ✓ but BYOK insecure (P0-1) | **P0**       |
| Multi-agent / teams                                                                              | ✓                         | stub       | ?                          | P2           |
| Browser automation                                                                               | ✓                         | ✓          | ✓                          | OK           |
| Computer use                                                                                     | ✓                         | ✓          | unsafe (P0-2)              | **P0**       |
| Voice (TTS, PTT, STT)                                                                            | ✓                         | partial    | TTS+PTT yes, STT stub      | P2           |
| MCP support                                                                                      | ✓                         | ✓          | ✓ desktop, stdio-only CLI  | P2           |
| Mobile companion                                                                                 | ✓                         | partial    | not verified               | P2           |
| CLI (`agiworkforce`)                                                                             | ✓                         | duplicated | partial                    | P1 (drift)   |
| VS Code ext                                                                                      | ✓                         | ✓          | ✓                          | OK           |
| Chrome ext                                                                                       | ✓                         | ✓          | ✓                          | OK           |
| Local LLM (Ollama, LMS)                                                                          | ✓                         | ✓          | ✓                          | OK           |
| BYOK                                                                                             | ✓                         | ✓          | encrypted theatre          | **P0**       |
| 140+ skills                                                                                      | ✓                         | ✓          | sourced                    | OK           |
| Database/Canvas/Productivity/Outcomes/Realtime/ScreenCapture/ROIDashboard/Governance/Marketplace | ✗ scope creep             | ✓          | ?                          | **P1**       |
| Privacy "managed proxy / no logging / local first"                                               | docs                      | ✗          | ✗                          | **P0**       |
| GDPR data-subject rights                                                                         | implicit (commands exist) | partial    | not exposed in UI/policy   | **P1**       |
| Windows code signing                                                                             | implicit                  | ✗          | ships unsigned             | **P1**       |
| Linux computer-use                                                                               | implicit                  | partial    | degrades silently          | **P1**       |
| CI green on main                                                                                 | implicit                  | ✗          | red 5 commits              | **P0**       |

---

## Appendices

### A. Background commands & checks run

- `cargo check --workspace --message-format=short` → 24 errors in `agiworkforce-app-server`, 4 warnings (unused imports). Pipeline masked exit code; actual `cargo` exit non-zero.
- `cargo check -p agiworkforce-desktop --message-format=short` → exit 0, 1m55s.
- `cargo check -p agiworkforce-cli --message-format=short` → exit 0, 10s.
- `cargo test --workspace --lib --no-run` → fails on `agiworkforce-utils-pty` missing `pretty_assertions` dep.
- `pnpm typecheck` → exit 0.
- `pnpm audit --prod` → 25 vulns (12 H, 13 M, 0 C). Full advisory IDs in Phase 3.
- `cargo audit` → 9 vulns (one yanked: `core2 0.4.0`).
- `gh run list --workflow=ci.yml --limit 5` → 5 consecutive failures.
- `gh run list --workflow=release-desktop.yml --limit 3` → all failures including v0.1.0.
- `git ls-files .mcp.json apps/mobile/.env liberrors.rlib libsafety.rlib fib.py test_search.rs` → only `fib.py`, `test_search.rs` tracked at repo root (P3 cleanup).
- `git log --all -p | grep -iE "(api[_-]?key|sk-…|AKIA[0-9A-Z]{16}|ghp_…)"` → no real-looking tokens; only test fixtures and schema-generated `apiKey` field names. ✓

### B. Files changed but uncommitted at start of audit

```
M apps/cli/src/agent.rs
M apps/cli/src/command_registry.rs
M apps/cli/src/main.rs
?? apps/cli/src/output_styles.rs
?? apps/cli/src/output_styles/
```

(Subsequent commits `9271b03a` later landed these.)

### C. Top 30 unused IPC commands (registered but never invoked)

```
abort_execution                        sys/error/commands.rs:140
account_disconnect_device              sys/account/mod.rs:828
account_list_devices                   sys/account/mod.rs:795
agent_set_workflow_hash                sys/commands/agent.rs:252
agi_submit_goal_parallel               sys/commands/agi.rs:160
ai_access_file                         sys/commands/ai_native.rs:260
ai_add_constraint                      sys/commands/ai_native.rs:114
ai_analyze_project                     sys/commands/ai_native.rs:47
ai_generate_code                       sys/commands/ai_native.rs:146
ai_generate_context_prompt             sys/commands/ai_native.rs:243
ai_generate_tests                      sys/commands/ai_native.rs:190
ai_get_project_context                 sys/commands/ai_native.rs:213
ai_refactor_code                       sys/commands/ai_native.rs:170
artifact_get_by_conversation           sys/commands/artifacts.rs:439
auth_remove_session                    sys/commands/auth.rs:213
auth_retrieve_session                  sys/commands/auth.rs:207
auth_store_session                     sys/commands/auth.rs:195
automation_execute_script              sys/commands/automation_enhanced.rs:143
automation_generate_code               sys/commands/automation_enhanced.rs:286
automation_get_element_tree            sys/commands/automation_enhanced.rs:133
automation_screenshot                  sys/commands/automation.rs:591
background_agent_should_push           sys/commands/background_agents.rs:358
bg_llm_cancel                          sys/commands/background_llm.rs:81
bg_llm_cleanup                         sys/commands/background_llm.rs:108
bg_llm_get_statistics                  sys/commands/background_llm.rs:90
bg_llm_get_status                      sys/commands/background_llm.rs:72
bg_llm_process_queue                   sys/commands/background_llm.rs:102
bg_llm_submit                          sys/commands/background_llm.rs:43
bg_llm_verify_webhook                  sys/commands/background_llm.rs:128
cancel_agent                           sys/commands/agi.rs:692
```

*(Full list of 169 unused commands available via `comm -23 <(grep -hE '^#\[tauri::command\]' -A1 -r apps/desktop/src-tauri/src | grep '^pub' | sed 's/.*fn \([a-z_0-9]_\)._/\1/' | sort -u) <(grep -rhoE "invoke\(\s*['\"]([a-z_0-9]+)" apps/desktop/src apps/web packages | sed -E "s/.*['\"]([a-z_0-9]+)/\1/" | sort -u))`)\*

### D. Coverage gaps the audit could NOT close in this session

- Did not fuzz IPC command handlers with crafted JSON.
- Did not run mutation testing (manual mutation samples only).
- Did not deep-dive Supabase RLS policies in 17 SQL migrations.
- Did not validate every `cfg(target_os)` branch compiles independently — relied on CI's matrix.
- Did not verify each of the 24 `agiworkforce-app-server` errors' downstream impact.
- Did not measure cold-start latency (no `apps/desktop/dist` runtime test).
- Did not exhaustively audit the 169 unused IPC commands for individual risk profile.
- Did not verify the full-list of 1,247 `console.log` calls for PII content.
- Did not sample all 245 useEffect-using files for cleanup correctness.

These are tracked in `FIX_QUEUE.md` as follow-up work where applicable.

---

End of report.
