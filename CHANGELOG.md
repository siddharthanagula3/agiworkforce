# Changelog

All notable changes to AGI Workforce. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
