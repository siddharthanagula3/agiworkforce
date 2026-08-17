# Desktop Tauri Audit — `apps/desktop/src-tauri` + dependent `crates/`

Scope: the Tauri native shell only (not the Electron cloud shell, not the React
frontend logic beyond IPC call sites). Read `apps/desktop/AGENTS.md` first;
its "Locked: one surface, two shells" section is the authoritative trust-
boundary spec this audit verifies against.

Methodology note: the Rust command surface is large (1,268 distinct
`#[tauri::command]` functions). Every classification below is backed by a
literal-string cross-reference between three sets, not sampling:

1. `all_commands` — every fn name following `#[tauri::command]` in
   `apps/desktop/src-tauri/src/**/*.rs` (verified two extraction misses were
   `#[allow(non_snake_case)]` between the attribute and `fn`, not real gaps).
2. `registered_commands` — every `crate::...` path inside the single
   `.invoke_handler(tauri::generate_handler![...])` block,
   `apps/desktop/src-tauri/src/lib.rs:1206-2691`.
3. `used_commands` — every command-name string literal appearing anywhere in
   `apps/desktop/src/**/*.{ts,tsx}` **excluding** `utils/registeredCommands.ts`
   (the allowlist mirror itself) and `lib/tauri-mock.ts` (the dev/mock
   dispatch table, whose `case` arms are not evidence of a real caller).
   This deliberately catches calls made through any wrapper name
   (`invoke`, `invokeWithTimeout`, `invokeWithRetry`, `docInvoke`, …), not
   just literal `invoke(`.

## 1. Command registration — essentially complete and self-enforcing

This is the single strongest finding of the audit: **the Rust↔TS command
registry has almost no drift**, and the repo has machinery that makes drift
hard to reintroduce:

- `apps/desktop/check-wiring.sh` runs a Node lexical parser
  (`apps/desktop/scripts/check-wiring.mjs` + its node-test) that cross-checks
  `generate_handler!` against `#[tauri::command]` definitions.
- `apps/desktop/src/utils/registeredCommands.ts` (1,273 entries) is a second,
  independent allowlist that `apps/desktop/src/utils/__tests__/ipc.test.ts`
  fails if it and the Rust registry disagree.
- Of 1,268 unique `#[tauri::command]` functions, only 2 apparent mismatches
  were found against the `generate_handler!` block, and both are doc-comment
  examples (`my_command`, `with`) inside
  `apps/desktop/src-tauri/src/sys/commands/agent_context.rs:15-19`, not real
  gaps — confirmed by re-grepping with `#[allow(non_snake_case)]` accounted
  for.
- **Zero** frontend `invoke*()` calls reference a command name that has no
  matching `#[tauri::command]` — i.e., no reachable "calls a command that
  doesn't exist" bug exists in the shipped TS surface.

Verdict for the wiring layer itself: **COMPLETE**.

### 1a. But the allowlist check has real coverage gaps

`apps/desktop/src/utils/ipc.ts:23-32` (comment, verified accurate against the
code): the enforced path (`assertRegisteredCommand`, called from
`lib/tauri-mock.ts:263`) is what 178 renderer modules import their `invoke`
from. Four modules bypass it entirely by importing
`@tauri-apps/api/core` directly and are **not** checked against the allowlist
at test time:

- `apps/desktop/src/features/startup-recovery/StartupRecoveryBootstrap.tsx`
- `apps/desktop/src/services/analyticsQueries.ts`
- `apps/desktop/src/lib/newChatReset.ts`
- `apps/desktop/src/lib/browserAutomation.ts`

These four are not proven broken (a real Rust error would still surface at
runtime), but they are the one place a typo'd command name would ship
undetected by `ipc.test.ts`. NEEDS_VALIDATION.

## 2. Commands the frontend never calls (BACKEND_ONLY / DEAD)

154 of 1,268 registered commands (~12%) have no caller anywhere in
`apps/desktop/src/**` outside the allowlist/mock files — verified by a
literal-string sweep, not the noisier `invoke(` regex (which had false
negatives on wrapper names like `invokeWithTimeout` and nested generics like
`invoke<ArtifactResponse<Artifact>>`). Grouped by what they represent:

### Fully-built, fully-dead subsystems

- **`hooks_*` (12 commands: `hooks_add`, `hooks_create_example`,
  `hooks_export`, `hooks_get_config_path`, `hooks_get_event_types`,
  `hooks_get_stats`, `hooks_import`, `hooks_initialize`, `hooks_list`,
  `hooks_reload`, `hooks_remove`, `hooks_toggle`, `hooks_update`)**. Backed
  by a real implementation (`apps/desktop/src-tauri/src/core/hooks/{config,event,executor}.rs`)
  but has **zero** references anywhere in `apps/desktop/src` — not even in
  `lib/tauri-mock.ts`'s mock dispatch table. A Claude-Code-style hooks system
  exists server-side with no UI entry point at all. DEAD.

- **`background_agent_*` (11 commands: `cancel`, `cleanup`, `get`, `list`,
  `list_active`, `pause`, `push`, `resume`, `should_push`, `stats`,
  `take_over`)**. The frontend only ever `listen()`s to
  `background_agent:*` **events** (`apps/desktop/src/constants/event-names.ts:19-27`,
  `apps/desktop/src/stores/chat/agentWorkflowEvents.ts:1070`) — there is no
  UI that calls the control commands. Users can watch a background agent
  run but nothing in the shipped app can list, pause, resume, cancel, or
  take over one. BACKEND_ONLY.

- **`messaging_connect_discord`, `messaging_connect_signal`,
  `messaging_connect_telegram`, `messaging_disconnect`,
  `messaging_get_status`, `messaging_send`** — backed by ~1,777 lines of real
  API-client code (`apps/desktop/src-tauri/src/features/messaging/{discord,signal,telegram,whatsapp}.rs`,
  no stubs/`TODO`s found), but none of it is reachable from any UI, not even
  the mock file. BACKEND_ONLY.

- **`gmail_oauth_start/complete/refresh/list_accounts/disconnect/get_account`
  (6 commands)** — a full Google OAuth2 flow
  (`apps/desktop/src-tauri/src/features/communications/gmail_oauth.rs`,
  `apps/desktop/src-tauri/src/sys/commands/gmail_oauth.rs`) with zero
  frontend callers. The generic `email_connect` command (used at
  `apps/desktop/src/api/email.ts:52`) is what the UI actually calls for
  email accounts — meaning users can only connect email via
  IMAP/SMTP-style credentials, not the dedicated Gmail OAuth path the
  backend fully supports. BACKEND_ONLY.

- **`settings_v2_get/set/delete/get_batch/get_category/list_all/
load_app_settings/save_app_settings/clear_cache` (9 commands)** — backed
  by a real `settings_v2` SQLite table
  (`apps/desktop/src-tauri/src/data/db/migrations.rs:1396`) and full CRUD
  command layer (`apps/desktop/src-tauri/src/sys/commands/settings_v2.rs`),
  but the frontend settings store uses the **older** `settings_load`,
  `settings_save`, `settings_load_from_disk` commands exclusively
  (`apps/desktop/src/stores/settingsStore.ts:1433-1833`). `settings_v2` is a
  fully-built, fully-migrated-schema, entirely-unused parallel
  implementation. DUPLICATED / DEAD.

### Duplicated feature with a live twin

- **`checkpoint_create/restore/list/delete`** (conversation-level
  checkpoints, `apps/desktop/src-tauri/src/sys/commands/checkpoints.rs:46-221`,
  backed by `conversation_checkpoints` +
  `checkpoint_restore_history` tables) have **zero** frontend callers.
  Meanwhile **`coding_checkpoint_create/list/rewind`** (file-snapshot
  checkpoints, `apps/desktop/src-tauri/src/sys/commands/undo.rs:144-170`) is
  what the UI actually uses
  (`apps/desktop/src/stores/codingCheckpointStore.ts:92,129`,
  `apps/desktop/src/api/undo.ts:174,184`). Two independently-built
  "checkpoint" systems exist; only the coding one shipped a UI.
  DUPLICATED.

- **`document_create_excel/excel_simple/excel_numbers/pdf/pdf_simple/
powerpoint/powerpoint_simple/word/word_simple` (9 commands) +
  `document_edit_excel`** are dead. The frontend exclusively calls the
  `*_manifest`-suffixed siblings (`document_create_pdf_simple_manifest`,
  `document_create_word_simple_manifest`,
  `document_create_excel_simple_manifest`,
  `document_create_excel_numbers_manifest`,
  `document_create_powerpoint_simple_manifest` —
  `apps/desktop/src/stores/documentStore.ts:161-306`,
  `apps/desktop/src/stores/editingStore.ts:719-836`), which additionally
  register the output in `generated_file_manifest.rs`. The non-manifest
  variants are superseded leftovers. DUPLICATED / DEAD.

### Smaller dead pockets (spot-checked individually, not sampled)

`account_disconnect_device`/`account_list_devices`, `auth_store_session`/
`auth_retrieve_session`/`auth_remove_session`, `automation_record_action_narration`/
`_clear_last`/`_discard`/`_get_last`/`_get_status`, `connector_permission_get/
list/set`, `conversation_share`, `conversation_export_pdf`,
`dotfile_add_mcp_server`/`_list_mcp_servers`/`_list_skills`/`_read_instructions`/
`_read_memories`/`_remove_mcp_server` (the whole `~/.agiworkforce/` dotfile
bridge — `read_shared_config`/`write_shared_config` too), `intent_*` (9 of the
intent-router's commands — the UI apparently drives intent detection through
a different call path or not at all), `knowledge_add`/`knowledge_query`,
`master_password_is_configured`/`_is_unlocked`/`_needs_migration`/`_verify`
(the UI calls `master_password_get_status` instead —
`apps/desktop/src/features/settings/MasterPasswordSettings.tsx:29` — so these
4 are likely genuinely redundant, not a broken gate), `project_get`/
`_get_settings`/`_add_knowledge_file`/`_search_knowledge`, `route_to_best_api`,
`skill_create_from_recording`, `save_global_config`/`save_project_config`,
and 17 assorted `get_*` helper commands (`get_best_practices`,
`get_process_templates`, `get_process_success_rates`,
`get_prompt_enhancement_config`, `get_resolved_config`,
`get_suggested_provider`, `get_tool_approval_policy`, `get_user_presence`,
etc.) whose backing subsystems (`process_reasoning.rs`, `prompt_enhancement/`,
`config_hierarchy.rs`, presence/realtime) are real but not reachable from any
UI in this scope.

Full list of 154 verified-dead command names saved during this audit run at
`/tmp/audit/truly_unused.txt` (not part of the repo; regenerate via the
three-set diff described above if needed).

### Frontend → Rust: zero broken calls

Every command name the frontend actually invokes has a matching
`#[tauri::command]`. No reachable "calls a command that was renamed/removed"
bug was found.

## 3. `tauri.conf.json` — capabilities, CSP, updater, bundle

`apps/desktop/src-tauri/tauri.conf.json`:

- **CSP** (`app.security.csp`) is a real allowlist, not `unsafe-inline`
  script or wildcard `connect-src`: `script-src 'self' 'wasm-unsafe-eval'`
  only; `connect-src` is pinned to `'self' ipc: https://api.agiworkforce.com
https://agiworkforce.com https://api.stripe.com
https://agiworkforce-signaling.fly.dev
wss://agiworkforce-signaling.fly.dev`; `object-src 'none'`;
  `frame-ancestors 'none'`.
- **Isolation pattern** is enabled (`"pattern": {"use": "isolation", "dir":
"isolation"}`), backed by `apps/desktop/src-tauri/isolation/`.
- **Updater**: real endpoint
  (`https://www.agiworkforce.com/api/releases/{{target}}/{{current_version}}`),
  real minisign pubkey embedded, Windows `installMode: passive`.
  `createUpdaterArtifacts: true`. Frontend genuinely calls the official
  `@tauri-apps/plugin-updater` `check()` API
  (`apps/desktop/src/features/updates/useUpdater.ts:209,235`) — COMPLETE.
- **Deep links**: scheme `agiworkforce://` registered
  (`plugins.deep-link.desktop.schemes`), plugin initialized
  (`apps/desktop/src-tauri/src/lib.rs:176`,
  `tauri_plugin_deep_link::init()`), and genuinely handled on the frontend
  via the official `onOpenUrl` API
  (`apps/desktop/src/hooks/useDeepLink.ts:2,77`). COMPLETE.
- **`removeUnusedCommands: true`** in `build` — Tauri's own dead-command
  stripper is enabled, which is consistent with finding near-zero
  registration drift above (though it does not explain away the 154
  frontend-unreachable-but-registered commands above, since those commands
  are still referenced from `lib.rs`, just never called at runtime).

### Capabilities (`apps/desktop/src-tauri/capabilities/default.json`)

- `fs:allow-read-file`/`allow-write-file`/etc. scope reads/writes to
  `$DOCUMENT`, `$DOWNLOAD`, `$APPDATA`, `$APPCONFIG`,
  `$HOME/.agiworkforce/**`, `$HOME/Desktop/**`, `$HOME/Projects/**` — and
  explicitly **deny** a long, well-considered list: `~/.ssh`, `~/.aws`,
  `~/.gnupg`, `~/.kube`, `~/.config/gcloud`, macOS Keychain files, every
  major browser's profile/cookie directory (Chrome, Firefox, Safari, Edge,
  Brave, Vivaldi, Opera — both macOS and Windows paths), `.env` files
  (including `$HOME/**/.env`), git credentials, npm/pip/cargo credential
  files, cloud CLI credential files, and the app's own
  `~/.agiworkforce/{secrets,credentials,keys,tokens,vault,byok,sessions,oauth}/**`.
  This is a genuinely engineered deny-list, not a token gesture.
- **`shell` permission scope is `shell:allow-open` only** — no
  `shell:allow-execute` capability is granted. This means terminal/shell
  execution (`features/terminal/pty.rs`, using `portable-pty`, not
  `tauri-plugin-shell`) is implemented as custom Rust commands gated by the
  app's own policy engine (`sys/security/exec_gate.rs`,
  `command_validator.rs`, using the shared `agiworkforce-execpolicy` crate —
  confirmed via `use agiworkforce_execpolicy::{Decision, Policy,
RuleMatch};` at `apps/desktop/src-tauri/src/sys/security/exec_gate.rs:26`)
  rather than the Tauri shell plugin's own scoping — a stricter design than
  relying on the plugin's allowlist.
- A second capability file, `recorder-hud.json`, scopes only 3 permissions
  (`core:event:allow-listen/unlisten`, `core:window:allow-close`) to a
  `recorder-hud` window — good least-privilege separation for the
  workflow-recorder overlay window.

## 4. Local-first architecture

### SQLite database — real, not scaffolding

`apps/desktop/src-tauri/src/data/db/mod.rs:1-46`: `rusqlite` with
`bundled-sqlcipher-vendored-openssl` (encrypted at rest), `PRAGMA
journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = ON`. Schema is
applied programmatically from
`apps/desktop/src-tauri/src/data/db/migrations.rs` (not the 3 loose `.sql`
files under `migrations/`, which appear to be a separate/legacy path — 252
lines total vs. the ~60 `CREATE TABLE` statements in `migrations.rs`).

Confirmed real tables backing real features: `conversations`, `messages`,
`settings`, `automation_history`, `overlay_events`, `calendar_accounts`,
`captures`, `ocr_results`, `permissions`, `audit_log`, `command_history`,
`clipboard_history`, `settings_v2` (dead per §2), `cache_entries`,
`browser_sessions`/`browser_tabs`/`browser_automation_history`,
`email_accounts`/`emails`/`email_attachments`, `contacts`, `context_items`,
`mcp_servers`/`mcp_tools_cache`, `autonomous_sessions`/
`autonomous_task_logs`, `conversation_checkpoints`/
`checkpoint_restore_history` (dead per §2), `onboarding_progress`,
`user_preferences`, `user_sessions`, `offline_operations_queue`,
`codebase_cache`, `billing_customers`/`_subscriptions`/`_invoices`/`_usage`/
`_payment_methods`/`_webhook_events`, `workflow_definitions`/`_executions`/
`_execution_logs`, `process_templates`, `outcome_tracking`,
`agent_templates`. This is a substantial, genuinely local-first schema, not
a thin shim over a remote API.

### Local model execution — source present, NOT shipped

- `llama-cpp-2` is an `optional = true` Cargo dependency
  (`apps/desktop/src-tauri/Cargo.toml`), gated behind the `local-llm`
  feature. **Zero** call sites reference `llama_cpp_2::` anywhere in
  `apps/desktop/src-tauri/src` — the dependency compiles but nothing calls
  into it. `Provider::LlamaCpp` (in `core/llm/mod.rs:677`) is not native
  in-process inference — it is an HTTP client pointed at
  `http://localhost:8080/v1`
  (`apps/desktop/src-tauri/src/core/llm/providers/direct_api_provider.rs:411`),
  i.e. "connect to a llama.cpp/LM-Studio server the user runs separately,"
  treated identically to `LmStudio`/`Vllm`. There is no embedded/in-process
  model execution.
- `whisper-rs` (offline local STT) is real, working code
  (`apps/desktop/src-tauri/src/features/speech/local_stt.rs`, genuinely uses
  `whisper_rs::{FullParams, WhisperContext, ...}`), but is gated behind the
  `local-whisper` feature.
- **Neither `local-llm` nor `local-whisper` is in the shipped binary.**
  `Cargo.toml`'s `default` feature set is `["shell", "updater", "billing",
"vad"]`. The release pipeline
  (`.github/workflows/release-desktop.yml:376-390`, `tauri-apps/tauri-action`
  invoked with `args: --bundles appimage,deb`, no `--features`) builds with
  defaults only. The only place `local-llm`/`local-whisper` are ever enabled
  is a **clippy-lint-only** CI lane
  (`.github/workflows/ci.yml:880-882`, explicitly a `cargo clippy` step, not
  a release build) that exists to keep the feature-gated code lint-clean,
  not to ship it. Same treatment for `ocr` (Tesseract), `webrtc-support`,
  and `devtools`. HIDDEN — real code, cargo-feature-flagged off in every
  shipped artifact.
- Practical local-model story that **does** ship: Ollama, via a genuine HTTP
  client (`apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`) with a
  deliberate `MAX_PROMPT_INJECTED_TOOLS = 32` cap, justified by measured
  numbers in-code (88.7s prompt-eval on a real tool catalog) rather than an
  arbitrary constant.

### Local RAG / embeddings / memory — present

`apps/desktop/src-tauri/src/core/embeddings/{cache,chunker,generator,
indexer,similarity}.rs` and `core/agi/{memory,memory_manager,
memory_persistence,semantic_search}.rs` are real modules (not stubs); not
exhaustively traced end-to-end in this pass given the scope's breadth —
NEEDS_VALIDATION for the embeddings→RAG→chat-context path specifically.

### Local MCP

`core/mcp/` is large (client, manager, oauth, server/{auth,executor,
handlers,http_server,tools}, extensions/{installer,manager,manifest,package,
repository}) and its command surface is mostly wired
(`mcp_call_tool`, `mcp_list_servers`, `mcp_list_tools`, `mcp_search_tools`,
etc. all confirmed live callers in `apps/desktop/src/api/mcp.ts`). One
concrete finding:

- **`apps/desktop/src-tauri/mcp-allowlist.json`** — a "slopsquatting
  defense" allowlist (comment: `"AUDIT-FIX: CI-5 — MCP server allow-list.
Only listed packages can be installed via MCP install commands"`) is
  loaded in `apps/desktop/src-tauri/src/core/mcp/config.rs:1648` via
  `std::path::PathBuf::from("mcp-allowlist.json")` — a path **relative to
  the process's current working directory**, not the app's resource or
  config directory. The file is **not** declared under
  `tauri.conf.json`'s `bundle` (no `resources` entry references it), so it
  is never packaged into a release build at all. The code's own fallback
  (`config.rs:1645`, comment: `"Absence of the file = open mode (dev)"`)
  means that in every packaged build the allowlist check silently no-ops
  and **any** npm package can be installed as an MCP server — the opposite
  of the control's stated intent. **BROKEN** (fails open, silently, in
  production).

## 5. Local / BYOK / Managed-Cloud trust boundary — verified real and tested

This is the best-engineered part of the codebase in this scope.

- `ChatExecutionMode` (`apps/desktop/src-tauri/src/sys/commands/chat/types.rs:82-108`)
  is a real 3-state enum (`LocalOnly`, `Byok`, `CloudManaged`) with
  `uses_local_storage()` and a `trust_mode()` mapping into
  `agiworkforce_model_registry::TrustMode` — i.e. the boundary is enforced
  at the shared-crate level, not just in desktop glue code.
- The actual no-leak guarantee is a single pure function,
  `derive_cloud_sync_enabled(active_mode, storage_mode_is_cloud)`
  (`apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs:66-75`):
  `active_mode == "local"` forces `false` unconditionally, regardless of the
  user's stored sync preference. The doc comment is explicit about the
  threat: _"a user with storage_mode='cloud' but active_mode='local' must
  never have that Local session's data touch the network."_
- This exact function is reused — not reimplemented — by
  `apps/desktop/src-tauri/src/sys/commands/memory.rs:25` and
  `apps/desktop/src-tauri/src/sys/commands/projects.rs:21` for memory-sync
  and project-sync gating, so the boundary is consistent across chat,
  memory, and projects rather than three independent (and driftable)
  copies.
- Regression tests exist and are labeled as trust-boundary tests, not
  incidental: `send_message_setup.rs:1119-1136` (local never syncs
  regardless of storage-mode flag), `:1242-1329` (`active_mode="local"`
  forces `is_local_mode=true` regardless of legacy `prefer_cloud_credits`),
  `:1559-1583` (explicit "TRUST-BOUNDARY" doc comments on the tests
  themselves).
- Cloud sync engine (`apps/desktop/src-tauri/src/data/cloud_sync.rs`) is
  "MANAGED-ONLY" by its own header comment, gated on a bearer token, and its
  mint hooks are only reachable from inside the `if cloud_sync_enabled`
  branches this function controls. The registered command
  `sync_conversations_to_cloud` (`lib.rs:2590`) is genuinely called from the
  frontend (`apps/desktop/src/lib/cloudSyncTrigger.ts:62`). COMPLETE.
- BYOK key storage uses `tauri-plugin-stronghold` (Argon2id-hashed
  snapshot, salt at `$APPDATA/stronghold.salt`, snapshot at
  `$APPDATA/keys.stronghold` — `lib.rs:289-303`), and the frontend
  genuinely talks to it through the official
  `@tauri-apps/plugin-stronghold` JS API
  (`apps/desktop/src/lib/byok-vault.ts`), not a hand-rolled command. Local
  API keys are not touched by this vault by design (comment: "Trust
  boundary: BYOK only — never routes Local keys to Cloud").
- Secret manager (`sys/security/secret_manager.rs`) deliberately avoids the
  OS keyring for its primary use ("no keyring permission prompts"),
  deriving machine keys instead; the OS `keyring` crate is used elsewhere
  for device/account tokens (`sys/account/mod.rs`,
  `data/db/key_management.rs`), with per-OS backends configured correctly
  in `Cargo.toml` (`apple-native` on macOS, `linux-native-sync-persistent`
  on Linux, `windows-native` on Windows) — not left on the default
  process-local mock backend that silently loses data on restart.

No leak path from Local to BYOK/Cloud was found in this pass. Verdict:
**COMPLETE** for the boundary mechanism itself.

## 6. A live security-relevant gap: `voice_inject_text`

`apps/desktop/src-tauri/src/sys/commands/voice_global.rs:287-294` — the
Rust implementation's own doc comment says:

> "NOTE (plan phase 4, not yet implemented): this is a bare typing call with
> no target pinning/revalidation, secure-field refusal, or clipboard
> transaction — **it must not be wired into an automatic dictation flow
> until that stage lands.**"

It is registered as a live `#[tauri::command]` and **is** wired into an
automatic dictation flow: `apps/desktop/src/api/voice.ts:440` exposes
`voiceInjectText()`, called from
`apps/desktop/src/stores/settings/voice.ts:744-751`
(`injectText` store action), which is the live push-to-talk/global-dictation
path (`startGlobalPtt`/`stopGlobalPtt` sit right next to it in the same
store). The safety work the author explicitly gated this behind has not
landed, but the gate itself was not enforced in code — it shipped anyway.
**BROKEN** (contradicts its own documented precondition; text can be
injected into whatever field currently has OS focus, including password
fields, with no secure-field refusal).

## 7. `crates/agiworkforce-*` — used vs. orphaned (w.r.t. the desktop binary)

`apps/desktop/src-tauri/Cargo.toml` path-depends on exactly 7 of the 12
crates under `crates/`:
`agiworkforce-agent-core`, `agiworkforce-execpolicy`, `agiworkforce-llm`,
`agiworkforce-model-registry`, `agiworkforce-mcp`, `agiworkforce-protocol`,
`agiworkforce-sandbox-policy`.

Transitively also pulled in (confirmed via each crate's own `Cargo.toml`):
`agiworkforce-utils-absolute-path` (dep of `execpolicy` and `protocol`) and
`agiworkforce-utils-image` (dep of `protocol`).

**Not used by the desktop Tauri binary, at any depth:**

- `agiworkforce-app-server` — a JSON-RPC stdio+WebSocket transport crate
  ("exposing AGI Workforce tools to programmatic clients"). Explicitly
  avoided by design: `crates/agiworkforce-agent-core/Cargo.toml:26`
  comments that agent-core deliberately does _not_ pull in
  `agiworkforce-app-server` (axum/tower) "purely for an unused..." (comment
  truncated at the point checked, but the intent — avoid the dependency —
  is unambiguous from the surrounding `Cargo.toml`). Not orphaned
  repo-wide, just out of scope for Desktop; presumably serves a CLI/server
  surface elsewhere in the monorepo.
- `agiworkforce-command-registry` (980 lines) — "AGI command registry
  contracts for CLI and TUI surfaces." No crate in the workspace depends on
  it (only its own `Cargo.toml` self-reference matched). Orphaned at least
  w.r.t. anything this audit's scope touches.
- `agiworkforce-licensing` (1,388 lines) — no crate in the workspace
  depends on it either. Same status.

These three are not necessarily dead repo-wide (they may back a CLI/TUI app
not in this audit's scope), but they are confirmed **not part of the Desktop
Tauri binary's dependency graph**, direct or transitive.

## 8. `apps/desktop/archive/` — confirmed dead, correctly isolated

204 files under `apps/desktop/archive/features/{chat,tool-calling}/` (old
`MessageBubble`, `Cards`, `Timeline`, `Sidecar`, `InlinePanels`, etc.
component trees). Confirmed **zero** import references from
`apps/desktop/src/**` into `apps/desktop/archive/**` (only one comment in
`apps/desktop/src/features/settings/tabs/Connectors/index.tsx:35`
mentions the path, explicitly noting it's "excluded from the build"). This
is inert historical code, not a live duplication risk — correctly named and
isolated, not imported by the active tree, and not part of any build target
(`tauri.conf.json`'s `frontendDist` points at `../dist`, built from `src/`
via Vite, which never resolves into `archive/`).

## 9. Computer use / automation — fully wired, none of it orphaned

All 13 `computer_use_*` commands (`capture_screen`, `click`, `move_mouse`,
`type_text`, `start_session`/`stop_session`/`get_session`/`list_sessions`,
`zoom_at_point`/`zoom_region`/`suggest_zoom_level`, `execute_tool`,
`cancel_opa_task`/`execute_opa_task`) have live frontend callers — none
appear in the dead-command list in §2. Backed by a substantial, non-stub
implementation: `automation/computer_use/{action_executor, anthropic_agent,
app_permissions, consent, observe_plan_act, safety, session,
visual_reasoner, window_manager, zoom}.rs`. This is the most completely
wired end-to-end subsystem found in this audit (UI → command → executor →
OS-level enigo/xcap/rdev calls → result → UI).

## 10. Summary table

| Area                                                                                                                                                        | Verdict                                               | Key evidence                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| Rust command registration (macro↔impl)                                                                                                                      | COMPLETE                                              | §1, `check-wiring.sh`, `registeredCommands.ts` test |
| Frontend calling a nonexistent command                                                                                                                      | COMPLETE (none found)                                 | §1, 0-entry diff                                    |
| 154 registered commands with no FE caller                                                                                                                   | BACKEND_ONLY/DEAD (mixed)                             | §2                                                  |
| `settings_v2_*` subsystem                                                                                                                                   | DUPLICATED/DEAD                                       | §2                                                  |
| `checkpoint_*` vs `coding_checkpoint_*`                                                                                                                     | DUPLICATED                                            | §2                                                  |
| `hooks_*` subsystem                                                                                                                                         | DEAD                                                  | §2                                                  |
| `background_agent_*` control commands                                                                                                                       | BACKEND_ONLY                                          | §2                                                  |
| `messaging_*` (Discord/Signal/Telegram/WhatsApp)                                                                                                            | BACKEND_ONLY                                          | §2                                                  |
| `gmail_oauth_*`                                                                                                                                             | BACKEND_ONLY                                          | §2                                                  |
| `document_create_*` (non-manifest)                                                                                                                          | DUPLICATED/DEAD                                       | §2                                                  |
| CSP / capabilities / fs deny-list                                                                                                                           | COMPLETE                                              | §3                                                  |
| Shell execution scoping                                                                                                                                     | COMPLETE (via custom policy engine, not plugin scope) | §3                                                  |
| Auto-updater                                                                                                                                                | COMPLETE                                              | §3                                                  |
| Deep links                                                                                                                                                  | COMPLETE                                              | §3                                                  |
| SQLite local-first schema                                                                                                                                   | COMPLETE                                              | §4                                                  |
| Local in-process LLM execution (llama.cpp)                                                                                                                  | HIDDEN (feature off in every shipped build)           | §4                                                  |
| Local offline STT (whisper.cpp)                                                                                                                             | HIDDEN (feature off in every shipped build)           | §4                                                  |
| Ollama / OpenAI-compatible local server                                                                                                                     | COMPLETE                                              | §4                                                  |
| MCP command surface                                                                                                                                         | COMPLETE (mostly)                                     | §4                                                  |
| MCP slopsquatting allowlist                                                                                                                                 | BROKEN (fails open in production)                     | §4                                                  |
| Local/BYOK/Cloud trust boundary                                                                                                                             | COMPLETE, tested                                      | §5                                                  |
| BYOK vault (Stronghold)                                                                                                                                     | COMPLETE                                              | §5                                                  |
| Cloud sync engine + gating                                                                                                                                  | COMPLETE                                              | §5                                                  |
| `voice_inject_text` global dictation                                                                                                                        | BROKEN (ships despite documented unsafe precondition) | §6                                                  |
| Crate usage (`agent-core`, `execpolicy`, `llm`, `model-registry`, `mcp`, `protocol`, `sandbox-policy`, + transitively `utils-absolute-path`, `utils-image`) | COMPLETE (real deps)                                  | §7                                                  |
| Crate orphaned re: desktop (`app-server`, `command-registry`, `licensing`)                                                                                  | Not part of this binary's graph                       | §7                                                  |
| `apps/desktop/archive/`                                                                                                                                     | DEAD, correctly isolated                              | §8                                                  |
| Computer use                                                                                                                                                | COMPLETE                                              | §9                                                  |
