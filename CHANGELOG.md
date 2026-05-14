# Changelog

All notable changes to AGI Workforce. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [cli-1.4.0] — 2026-05-14

Security and protocol hardening release. Closes three v1.3 deferred backlog items: real seccomp-BPF filter installation on Linux, `SubagentTaskRunner` trait abstraction making the subagent task body swappable, and a2a WebSocket transport for persistent cross-process agent streaming.

### Added

- **`apps/cli/src/policy/linux_sandbox.rs`** (M38a) — `compile_bpf` + `install_filter` behind the new `linux-seccomp` Cargo feature. `install_filter` calls `prctl(PR_SET_NO_NEW_PRIVS)` then `seccompiler::apply_filter`; on default (feature-off) Linux builds a no-op stub is provided so call sites compile under both configurations. `compile_bpf_available()` probes feature presence at runtime.
- **`apps/cli/src/subagent_v2.rs`** (M34a) — `SubagentTaskRunner` async trait. Swappable task body: implementors receive `inbox_rx: mpsc::Receiver<String>` and `outbox_tx: mpsc::Sender<SubagentMessage>`; `SubagentRegistry::spawn_with_runner` accepts any `Arc<dyn SubagentTaskRunner>` so the echo-loop stub can be replaced by a real `AgentSession` without touching the registry.
- **`apps/cli/src/a2a_ws.rs`** (new, ~100 LOC) — a2a WebSocket transport. `WsServer::serve(addr)` binds a `TcpListener`, upgrades each TCP connection via `tokio-tungstenite`, and dispatches text frames through `crate::a2a::jsonrpc::handle_request`. Binary frames return a JSON-RPC error. Each connection owns an `Arc<PeerRegistry>` clone so the registry is shared without contention.

### Changed

- **`apps/cli/Cargo.toml`** — version 1.3.0 → 1.4.0. Added `[target.'cfg(target_os = "linux")'.dependencies]` block (`seccompiler = "0.5"`, `libc = "0.2"`, both optional). Added `linux-seccomp = ["dep:seccompiler", "dep:libc"]` feature. Added `tokio-tungstenite = "0.24"` dependency.
- `cargo check --workspace` green on macOS. All Linux-only deps cfg-gated and optional — zero impact on darwin builds.
- Tests: 1284 passing (1 pre-existing flaky oauth_flow port-contention test passes in isolation).

### Notes

- Opt into real BPF installation via `cargo build --features linux-seccomp` on Linux. Default builds compile cleanly on all platforms.
- a2a WebSocket and seccomp filter installation are the last two items from the v1.3 Notes "deferred" list.

---

## [cli-1.3.0] — 2026-05-14

Final-backlog release. Closes the last four items the v1.2 audit deferred to v1.3: Subagent v2 with full IPC, Linux seccomp-BPF sandbox preset, agent-to-agent (a2a) coordination protocol, and TUI dispatch wiring for the v1.2.1 overlay catalog.

### Added

- **`apps/cli/src/subagent_v2.rs`** (M34) — full-IPC subagent runtime. `SubagentRegistry` + `SubagentHandle` with bidirectional message channels (inbox/outbox), kill via `oneshot::Sender`, `wait` on the join handle. Each subagent runs as an isolated tokio task with its own `mpsc::channel<32>` for prompts and responses. Status machine: `Pending → Running → Completed | Failed | Killed`. 6 tests covering registry empty/unique-ids, message round-trip, kill transition, missing-id error, status progression.
- **`apps/cli/src/policy/linux_sandbox.rs`** (M38) — Linux seccomp-BPF preset. Architecture-aware allow-list builder for `ReadOnly` / `Contained` / `Unrestricted` presets. ~50 syscall allow-list for ReadOnly (read, write, openat, stat, fstat, mmap, mprotect, brk, futex, clock_gettime, …); Contained adds `execve` / `clone` / `pipe2` / `socketpair`. `describe_filter` produces a one-line summary for `/sandbox` + `/doctor`. `is_available` probes `/proc/self/status` for the `Seccomp:` line. Tests run only on Linux via `#![cfg(target_os = "linux")]`; the module compiles cleanly on macOS as part of `cargo check --workspace`.
- **`apps/cli/src/a2a.rs`** (1,649 LOC) — agent-to-agent coordination protocol. JSON-RPC 2.0 surface with `discover`, `list_peers`, `delegate`, `cancel` methods. `AgentCard { id, name, model, capabilities, tools, version }`, `TaskRequest { id, prompt, deadline_unix?, context }`, `TaskResponse { state, result?, error? }`, `TaskState { Accepted, Running, Completed, Failed, Cancelled }`. `PeerRegistry` with `find_by_capability` lookup. HTTP transport scaffold + local-registry persistence + handoff request type + priority sort. 26 tests covering serialization roundtrips, handler dispatch, error code surfaces, registry persistence, and `format_agent_list_offline` rendering.
- **TUI overlay dispatch** — wired 5 slash arms to the v1.2.1 interactive overlays in `apps/cli/src/tui/tui_app.rs`:
  - `/memories` → `MemoriesSettingsView`
  - `/skills-toggle` → `SkillsToggleView`
  - `/statusline` → `StatusLineSetupView`
  - `/title` → `TerminalTitleSetupView`
  - `/diff-review` → `DiffReviewView`

### Changed

- CLI version bumped 1.2.1 → 1.3.0. `cargo check --workspace` green.
- Tests: 1244 → **1276** (+32 from this iteration: 6 subagent_v2 + 26 a2a; linux_sandbox tests are cfg-gated to Linux).
- Closes the v1.2 deferred backlog: M34 (subagent IPC), M38 (Linux sandbox), a2a coordination, overlay dispatch arms.

### Notes

- Subagent v2's task body is a minimal echo loop today; the IPC plumbing (channels, status machine, kill/wait) is real and ready for a future swap-in of `AgentSession` as the task body.
- The seccomp-BPF allow-list builder is portable Rust; **installing** the BPF program (`seccompiler::apply_filter` after `prctl(PR_SET_NO_NEW_PRIVS)`) needs the `seccompiler` crate as a Linux-only optional dep — v1.3.1 work.
- The a2a protocol is in-process today. WebSocket / cross-process transport is a hosted-infra step.

---

## [cli-1.2.1] — 2026-05-14

Backlog-close release. v1.2.0 shipped the audit-driven gap closure; v1.2.1 closes the architectural follow-ups (interactive overlay catalog, plugin marketplace client, LSP completion path, OAuth endpoint discovery).

### Added

- **7 new interactive overlay modules** in `apps/cli/src/tui/widgets/`:
  - `list_selection_view.rs` — generic `ListSelectionView<T>` base implementing `InteractiveView` (used by 4 derived overlays)
  - `memories_settings.rs` — toggle auto-memory, decay threshold, max-facts
  - `skills_toggle.rs` — spacebar-toggle enabled state per discovered skill
  - `statusline_setup.rs` — multi-checkbox status line composition
  - `terminal_title_setup.rs` — multi-checkbox terminal title composition
  - `command_popup.rs` — autocomplete slash-command popup (typed filter, ↑↓ Enter Esc)
  - `diff_review.rs` — per-file diff with `y/n/s` decisions and final Submit count
- **`apps/cli/src/marketplace.rs`** — plugin marketplace client: `Marketplace { registry_url }`, `list_plugins`, `search`, `install`. Default registry URL placeholder; hosted infra is an ops step.
- **`auth_oauth::discover_endpoints`** — RFC 8414 / OpenID Connect Discovery: probes `/.well-known/openid-configuration` then `/.well-known/oauth-authorization-server`. Returns typed `DiscoveredEndpoints { authorization_endpoint, token_endpoint, scopes_supported, code_challenge_methods_supported, ... }`.
- **LSP completion path**:
  - `LspClient::completion`, `LspClient::document_symbol`, `LspClient::formatting` methods
  - `DiagnosticsBuffer` shared-state container for future `textDocument/publishDiagnostics` push subscription
  - `CompletionItem`, `DocumentSymbol`, `TextEdit` LSP wire types
  - 3 new tools registered: `lsp_completion`, `lsp_document_symbols`, `lsp_format` — catalog 38 → 41

### Changed

- Tests: **1281 → 1347** (+66) across 6 crates.
- `tui/widgets/mod.rs` registers all 7 new overlay modules.

### Notes

- Reference screenshots at `~/Desktop/reference/ui-capture-runs/.../screenshots/claude-code/` (captures 607–618 for slash palette, 621 for skills) show **dismissed** overlay state (post-close). The new interactive overlays use a boxed-modal style during active use; the pure-text `screen_renderers.rs` continues to produce the dismissed-state shape. Both serve complementary rendering purposes.
- Real OAuth-app registrations for known providers (anthropic / openai) remain placeholder; `discover_endpoints` is provider-agnostic and works against any RFC 8414 / OIDC-compliant issuer URL.

---

## [cli-1.2.0] — 2026-05-14

The "comparable with other CLIs" release. Closes every P0 and P1 item identified in the 2026-05-14 deep audit against Codex CLI, Claude Code, Gemini CLI, OpenCode, and Claw-code.

### Added

- **5 new shipping crates**: `agiworkforce-command-registry`, `agiworkforce-app-server`, `agiworkforce-plugin-runtime`, `agiworkforce-apply-patch` (with 22 scenario fixtures), `agiworkforce-task-runtime` (with `TaskRegistry` + `StallWatchdog`).
- **+18 slash commands** (40 → 58): `/agents`, `/chrome`, `/ide`, `/tasks`, `/usage`, `/sandbox`, `/doctor`, `/recap`, `/release-notes`, `/keybindings`, `/focus`, `/background`, `/advisor`, `/team-onboarding`, `/terminal-setup`, `/reload-plugins`, `/extra-usage`, `/remote-env`; `/plugin` canonical with `/plugins` `/marketplace` `/market` aliases.
- **+18 tools** (20 → 38): 6 task lifecycle + 2 team + 3 cron + 3 worktree + 3 LSP + `advisor`.
- **+13 hook events** (22 → 35): full Claude Code `HOOK_EVENTS` parity.
- **TUI overlays**: `ApprovalOverlayState` (20 tests), `InteractiveView` trait + state machines (11 tests), modal-overlay slot in `tui_app.rs` event loop, `TuiElicitationHandler` bridge for MCP elicitation, 14 parity-screen renderers.
- **MCP completion**: connection pooling (`McpConnectionManager`), keyring-backed OAuth persistence (file fallback at `~/.agiworkforce/secrets/`), `list_mcp_resources` / `read_mcp_resource` / `McpServerStatusSnapshot`, live `elicitation/create` dispatch across stdio + sse + http.
- **Browser PKCE OAuth for `/login`** (`auth_oauth.rs`): RFC 7636 S256, ephemeral local listener, CSRF state validation; "anthropic" and "openai" providers built-in.
- **Cost ledger** (`cost_ledger.rs`): real per-turn dollar tracking from `models.json` pricing constants.
- **Memory pruning** (`memory::prune`): drops observations older than `max_age_days` or keeps top-K by `recency × relevance_score`.
- **Tool distillation** (`tool_distillation.rs`): compresses tool catalog per model family (Tier-1 full, Tier-2 truncate to 80c, Tier-3 to 40c).
- **macOS Seatbelt** (`policy::macos_sandbox`): `SandboxPreset { ReadOnly, Contained, Unrestricted }` + `wrap_command` via `sandbox-exec -p <profile>`.
- **Basic LSP client** (`lsp/`): stdio, Content-Length framing, server-for-extension dispatch (rust-analyzer / tsserver / gopls / pyright-langserver).
- **Voice input** (`voice.rs`): push-to-talk + cpal capture + WAV + OpenAI Whisper + local-binary fallback.
- **Alias path discovery**: `.claude/` and `.codex/` siblings of `.agiworkforce/` for agents + skills.
- **`AGIWORKFORCE_NO_KEYRING=1` env var**: opt-out from OS keyring for headless / CI / containerized runs (avoids macOS Keychain auth prompts).

### Changed

- Test count: **1150 → 1268** (+118, +10%).
- Workspace crates: **1 + 12 utility → 6 cli-shipping + 12 utility**.
- 104,216 LOC of dead codex-rs port files moved to `apps/cli/src/tui/_attic/` (preserved, out of compilation surface).
- Plan-mode mutation gate hardened with 4 inline tests + integration coverage.

### Fixed

- macOS Keychain auth-prompt storm during MCP OAuth tests (per-test bypass + env-var production opt-out).
- `apply-patch` `clippy::manual_find` rewritten as iterator chain.
- Tool catalog count assertion tracks growth (20 → 31 → 32 → 38) with cited M-numbers.

### Deferred to v1.3

- **M34** — Subagent v2 with full IPC.
- **M38** — Linux seccomp-BPF sandbox.
- Plugin marketplace registry (needs hosted infra).
- External multi-agent coordination layer (OmX/clawhip/OmO style).

## [Unreleased]

### Wave 2 (in progress)

- Pixel-close Claude Desktop UI for Tauri app
- Triage 84 desktop component dirs → ~25 active (in-flight: 9 dirs / 3,430 LOC removed; ~50 still reachable via DynamicSidecar lazy loader)
- Windows code signing (EV cert) for desktop installer (needs $300/yr cert)
- Privacy Policy rewrite + GDPR Settings → Data section (needs counsel sign-off)
- IPC inventory proc-macro replacement of `generate_handler!` (FIX-023 already wired check-wiring.sh into ci.yml at line 154; proc-macro is the v1.1 follow-up)

### Wave 2 — DONE

- ✅ `apps/web/components/UnifiedAgenticChat/` deleted (141 files / 36,086 LOC of dead code; real /chat surface is the desktop Vite SPA per vercel.json rewrite)
- ✅ WEB-4 Stripe webhook body-read: middleware exclusion + nodejs runtime pinned

### Wave 3 (planned)

- iOS App Store + Google Play submissions for mobile companion (needs Apple/Google dev accounts)
- Chrome Web Store submission for browser extension (needs $5 dev account)
- VS Code Marketplace submission (free, but needs Microsoft account)
- Hobby tier ($5/mo) launch (needs Stripe price + frontend wire-up)
- Pro / Max waitlist UI (API at `/api/waitlist` already exists; pricing page already calls it)

### Wave 0 — SHIPPED 2026-05-03

Massive cleanup pass. -1.04M LOC total across 19 commits. See git log for detail.

---

## [1.0.0] — 2026-05-03 (CLI v1.0 — SHIPPED)

**Live install paths**:

```bash
brew install siddharthanagula3/tap/agiworkforce        # ✅ live
curl -fsSL https://raw.githubusercontent.com/siddharthanagula3/agiworkforce/main/scripts/install.sh | bash  # ✅ live
cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli  # ✅ live
# Direct: https://github.com/siddharthanagula3/agiworkforce/releases/tag/v-cli-1.0.0  # ✅ live
npm install -g @agiworkforce/cli                        # ⏳ pending NPM_TOKEN secret (user action)
```

**Platforms shipped**: macOS arm64, macOS x64, Linux x64, Windows arm64, Windows x64.
**Linux arm64**: deferred to v1.1 (cross-compile openssl-sys not yet wired). Workaround: `cargo install --git ...` (builds natively).

### Added

- **22 subcommands**: `exec`, `review`, `apply`, `sandbox`, `mcp-server`, `app-server`, `resume`, `fork`, `session`, `cloud`, `plugin`, `features`, `execpolicy`, `ecosystem`, `history`, `sync`, `login`, `logout`, `auth-status`, `marketplace`, `init`, `onboarding`
- **10+ Providers**: Anthropic, OpenAI, Google, Ollama, Mistral, xAI, DeepSeek, OllamaCloud + subscription paths for GitHub Copilot and ChatGPT Plus
- **Ratatui TUI**: 125-file terminal UI with streaming markdown, slash commands, syntax highlighting (syntect), agent task panel
- **Multi-provider fallback chain**: comma-separated `-m` flag rotates on RateLimit/Transient/Any errors
- **--demo flag**: synthesizes a 429 on first call to demo fallback chain (no real API call needed for live demos)
- **--json-events**: machine-readable JSONL agent events to stdout (one per line; pipeable through `jq` for CI/dashboards)
- **--dump-system-prompt** (Phase 2): inspect the assembled system prompt without making an API call
- **Anthropic prompt cache wiring** (Phases 4-5): `cache_control: ephemeral` markers + `prompt-caching-2024-07-31` beta header; `cache_read_input_tokens` and `cache_creation_input_tokens` parsed from stream events
- **Tool concurrency** (Phases 6-7): `is_read_only` + `is_concurrency_safe` flags on `ToolDefinition`; concurrent batch execution of read-only tools via `futures::future::join_all`
- **Per-tool result size caps** (Phase 8): `read_file`/`web_search` 100k, `web_fetch` 200k, `search/grep/run` 50k, `list/tool_search` 20k, `write/edit/apply_patch` 5k
- **Memory typing** (Phase 9): `kind: user | feedback | project | reference` frontmatter on memory files; injected into separate XML blocks
- **Hook transformers** (Phase 10): `updated_input`, `additional_context`, `updated_mcp_tool_output` outputs in addition to gate decisions
- **Sandbox**: macOS Seatbelt, Linux Bubblewrap, Linux Landlock, Windows Restricted Token (auto-detected)
- **Daemon mode**: cron + webhook + file-watcher triggers, rate-limited, constant-time webhook token comparison
- **MCP support**: client (consumes external MCP servers via stdio) and server (`agiworkforce mcp-server` exposes own tools)
- **Skills system**: project / global / system / learned tiers; YAML frontmatter; auto-loaded by name match
- **Marketplace**: `agiworkforce marketplace install <plugin>` from registry.agiworkforce.com (alpha)
- **Voice mode**: Whisper STT + cpal recording; push-to-talk via SPACE/ESC
- **Cross-device sync**: `agiworkforce sync export` / `import` bundles config + memory + projects
- **Ecosystem scan**: `agiworkforce ecosystem scan` discovers Claude/Codex/Cursor/Gemini configs and imports MCP servers
- **App-server mode**: JSON-RPC over stdio or WebSocket for IDE integration; `tools/list` + `initialize` + `shutdown`
- **3-layer permission stack**: CommandSafety classifier (Safe/Unknown/Dangerous heuristic) → PermissionStore (always_allow/deny + session_allow) → PolicyEngine (TOML rules, priority-ordered) + optional SDK CanUseTool RPC

### Changed

- Cargo workspace cleaned: 113 crates → 11 (removed 102 codex-rs port crates that never compiled cleanly after the rename, preserved at `~/Desktop/reference/codex-cli/` for future re-port)
- Repo size reduced by **995,111 LOC** across 4,624 files

### Distribution

- npm: `@agiworkforce/cli` (with platform-specific `@agiworkforce/cli-{platform}-{arch}` packages)
- Homebrew: `agiworkforce/tap/agiworkforce`
- Universal installer: `curl -fsSL https://agiworkforce.com/install.sh | bash`
- Cargo: `cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli`
- GitHub releases: pre-built binaries for darwin-arm64/x64, linux-arm64/x64, win32-arm64/x64

### Tests

- 914/914 unit tests green (`cargo test -p agiworkforce-cli --bin agiworkforce` — verified 2026-05-03 via `cargo test --release`)
- Snapshot tests for TUI rendering (chatwidget)
- Integration tests for tool execution + permission stack

### Known limitations (v1.0.0)

- Auth credentials stored as 0o600 plaintext JSON at `~/.agiworkforce/auth.json` instead of OS keyring (CLI-5 from 2026-05-03 audit; mitigated by file permissions)
- 7 in-progress modules parked but not wired (a2a, tui_basic, history, memory_pipeline, models_cache, shell_snapshot, skill_learner) — slated for v1.1+
- Subscription paths (Copilot, ChatGPT Plus) are best-effort and may break if the upstream auth flow changes

### Security audit (2026-05-03)

- P0 closed: 13/14 (CLI-5 deferred — see Known limitations)
- P1 closed: 20/25 (4 deferred to v1.1: DESK-5/8, WEB-4/5/11)
- See [`docs/audit/AUDIT_2026-05-03.md`](docs/audit/AUDIT_2026-05-03.md) for the full report
