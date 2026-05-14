# AGIWorkforce Rust-First CLI — v1.1 Delivered + v1.2 Gap-Closure Plan

> Plan revised 2026-05-14 after a deep audit of every reference CLI in `~/Desktop/reference/`. Canonical mirror of `/Users/siddhartha/.claude/plans/delegated-painting-bubble.md`. Implementation history in `AGIWORKFORCE_IMPLEMENTATION_LOG.md`. Phase-1 evidence in `AGIWORKFORCE_EXPLORATION_LEDGER.md`.

## Context

The user asked for a CLI "comparable with other CLIs." v1.1 closed the foundational gaps (M0–M14). v1.2 closes the gaps surfaced by the 2026-05-14 deep audit against Codex CLI (Rust), Claude Code (TS), Gemini CLI (TS), OpenCode (TS), OpenClaw, and Claw-code. This file is the canonical forward-looking plan.

Three corrections to v1.1's "AGI advantages":

1. Claude Code has **27** documented hook events (`HOOK_EVENTS` constant in `reference/src/entrypoints/sdk/coreTypes.ts`) including `Stop`, `StopFailure`, `PostToolUseFailure`, `TaskCreated`, `TaskCompleted`, `Elicitation`, `ConfigChange`, `WorktreeCreate/Remove`, `InstructionsLoaded`, `CwdChanged`, `Setup`, `TeammateIdle`. My 22 events are a subset, not a superset. The "AGI advantage" holds vs. Codex (6 events) and Gemini/OpenCode (0) but not vs. Claude Code.
2. Claude Code's `mvp_tool_specs()` exposes **40** tool specs. AGI ships **20**. Missing 20+ tools including the full task/team/cron/worktree lifecycles, plus `AdvisorTool`, `LSPTool`, `NotebookEditTool`, `REPLTool`, `RemoteTriggerTool`, `SyntheticOutputTool`, `PowerShellTool`.
3. The Claude Code capture palette (607–618) lists **63 commands**. AGI registers 50. Genuine parity gaps: 13 commands worth adding (out of 19 missing; 6 are commercial/cosmetic and skip-eligible).

The deltas are large but tractable: ~25K LOC over ~13 weeks of focused work to reach Claude Code v2.1.128 + Codex CLI parity on the dimensions users measurably care about.

## v1.1 — Delivered (closed status)

Locked in `AGIWORKFORCE_IMPLEMENTATION_LOG.md`. Highlights:

- **3 new workspace crates**: `agiworkforce-command-registry`, `agiworkforce-app-server`, `agiworkforce-plugin-runtime`.
- **50 slash commands** registered with golden snapshot + alias resolution test.
- **14 text-rendered parity overlays** for `/mcp /agents /skills /permissions /plugin /tasks /chrome /ide /usage /sandbox /doctor /recap /release-notes /keybindings`, snapshot-tested against captures 600/601/602/603/619/620/621/622/623/624/625/626/627.
- **22 hook events** in canonical enum with compile-time count lock.
- **12-provider registry** with `.claude/.codex/.agiworkforce/` alias-path discovery.
- **app-server `tools/call`** dispatch (`ToolDispatch` trait) wiring real catalog with `inputSchema`.
- **Plugin manifest matrix** for 5 formats with 5 fixture roots + integration test.
- **`InteractiveView` foundation** trait + `SelectionState` + `TabState` (test-only, awaiting event-loop wiring).
- **MCP elicitation type surface** (`ElicitationHandler` trait + 3 handlers).
- **Dead-code attic**: 104,216 LOC of unused codex-rs ports moved to `apps/cli/src/tui/_attic/`.
- **1150 tests** passing across 4 crates. `cargo check --workspace` green.
- CLI version bumped to **1.1.0**.

## v1.2 Backlog — Verified Gaps

Tier classification: P0 = blocks production parity. P1 = high-value parity. P2 = polish. P3 = defer or skip.

### P0 — Production blockers

| #   | Gap                                      | Evidence                                                                                                                                                                                                                                          | Impact                                       |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | No real permission UX (dialoguer Yes/No) | Codex `ApprovalOverlay` at `codex-rs/tui/src/bottom_pane/approval_overlay.rs:531` is interactive                                                                                                                                                  | Users can't manage permissions interactively |
| 2   | No MCP elicitation UI                    | `ElicitationRequest` type exists at `apps/cli/src/mcp/elicitation.rs` but no overlay + no dispatch loop wiring                                                                                                                                    | MCP servers that ask for input hang          |
| 3   | Task tools missing (6)                   | Reference exposes `TaskCreate/Get/List/Update/Stop/Output` per `claw-code/PARITY.md` lane 5; `reference/src/tasks/types.ts` has 7 task kinds                                                                                                      | Subagents can't be tracked or stopped        |
| 4   | Team/cron tools missing (5)              | `TeamCreate/TeamDelete/CronCreate/CronDelete/CronList` per `claw-code/PARITY.md` lane 6                                                                                                                                                           | No background scheduling                     |
| 5   | Apply-patch has zero regression coverage | Codex has 22 scenario fixtures at `codex-rs/apply-patch/tests/fixtures/scenarios/001-022_*/`                                                                                                                                                      | Refactor risk on `apply_patch` is high       |
| 6   | 13 missing hook events                   | Claude Code's `HOOK_EVENTS` lists 27 vs. my 22; missing `Stop StopFailure PostToolUseFailure TaskCreated TaskCompleted Elicitation ElicitationResult ConfigChange WorktreeCreate WorktreeRemove InstructionsLoaded CwdChanged Setup TeammateIdle` | Hooks contract incomplete                    |

### P1 — High-value parity

| #   | Gap                                 | Evidence                                                                                                                                                         | Impact                                      |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 7   | 13 missing slash commands           | Captures 607–618: `/clear /rewind /resume /export /focus /background /branch /advisor /team-onboarding /terminal-setup /reload-plugins /extra-usage /remote-env` | User palette parity                         |
| 8   | Cost ledger is a stub               | `render_usage` returns `estimated_cost_usd = 0.0`; reference cost trackers compute from per-model pricing constants                                              | `/usage` is misleading                      |
| 9   | Memory pruning missing              | Gemini `memoryContextManager.ts` decays observations >30 days; AGI memory is append-only                                                                         | Memory grows unboundedly                    |
| 10  | Tool distillation missing           | Gemini `toolDistillationService.ts` compresses tool specs per model family                                                                                       | 5–15% wasted context per turn               |
| 11  | MCP connection pooling missing      | Codex `McpConnectionManager` reuses connections; AGI reopens per call                                                                                            | Tool-call latency                           |
| 12  | MCP OAuth token persistence missing | `apps/cli/src/mcp/oauth_store.rs` is a stub; Codex uses OS keyring                                                                                               | Re-auth required on every session           |
| 13  | MCP resource list API missing       | Only `read_mcp_resource` is plumbed; no `list_mcp_resources`                                                                                                     | Servers can't expose their resource catalog |
| 14  | Inline diff preview missing         | `apply_patch` prompts via dialoguer text; references show side-by-side diffs with per-file approve/reject                                                        | Trust deficit for autonomous runs           |
| 15  | Subagent v2 missing                 | Codex `tools/src/agent_tool.rs` has spawn-agent-v2 with IPC; AGI's `subagent.rs` is in-process only                                                              | No real background agents                   |

### P2 — Polish

| #   | Gap                            | Evidence                                                                                                                                  |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 16  | 6 missing interactive overlays | Codex has `MemoriesSettingsView`, `SkillsToggleView`, `StatusLineSetupView`, `TerminalTitleSetupView`, `CommandPopup`, `FeedbackNoteView` |
| 17  | No VS Code extension companion | Gemini `packages/vscode-ide-companion/`                                                                                                   |
| 18  | No LSP client                  | OpenCode `packages/opencode/src/lsp/lsp.ts`                                                                                               |
| 19  | No platform-specific sandboxes | Gemini `packages/core/src/sandbox/{macos,linux,windows}/`                                                                                 |
| 20  | No browser OAuth (PKCE)        | Claude Code `ConsoleOAuthFlow.tsx` (79 KB)                                                                                                |
| 21  | No voice input                 | Gemini `packages/core/src/voice/audioRecorder.ts`                                                                                         |
| 22  | No worktree tools              | `EnterWorktree/ExitWorktree` standard in references                                                                                       |

### P3 — Defer or skip

- Browser extension companion (Chrome) — full extension is a separate product surface
- Desktop app (Tauri/Electron) — out of scope for CLI
- Multi-agent coordination layer (OmX/clawhip/OmO from `claw-code/PHILOSOPHY.md`) — external system
- Marketplace registry + remote install — needs hosted infra
- `/upgrade /passes /stickers /privacy-settings /mobile /desktop /tui` — commercial/cosmetic; skip

## Sprint Plan (10 sprints, ~13 weeks)

### S1 — Permission & elicitation overlays (P0, 1 wk)

- **M15** — `ApprovalOverlay`. New `apps/cli/src/tui/widgets/approval_overlay.rs` implementing `InteractiveView`. Wraps `SelectionState`. Modes: tool-approval (Yes/No/Always-allow/Never), permission-rule (5-tab strip), bulk-approval (multi-select). Wire from `apps/cli/src/tools.rs` so `require_confirmation = true` opens the overlay instead of dialoguer. Snapshot tests against the 4 captures preserved in `_attic/`.
- **M16** — `ElicitationOverlay` + live MCP dispatch. New `apps/cli/src/tui/widgets/elicitation_overlay.rs` renders `ElicitationRequest.requestedSchema` as a form. `mcp/mod.rs::McpConnection` dispatch loop routes `elicitation/create` JSON-RPC requests through `SharedElicitationHandler`. New `TuiElicitationHandler` impl owns a queue + emits overlay-open events.
- **Exit**: `agiworkforce exec` opens real overlays under crossterm; mock MCP server's elicitation round-trips through the UI.

### S2 — Task/team/cron tool family (P0, 1 wk)

- **M17** — Extract `agiworkforce-task-runtime` crate. `TaskRegistry`, `TaskStatus { pending running completed failed stopped }`, `Task { id, kind, status, output_path, started_at, ended_at }`. Storage: in-memory + file-backed output at `~/.agiworkforce/tasks/<id>.out`. Port `LocalShellTask` semantics from `reference/src/tasks/LocalShellTask/LocalShellTask.tsx:46` (stall watchdog, prompt-detection regex, kill).
- **M18** — Wire 11 new tools (`task_create task_get task_list task_update task_stop task_output team_create team_delete cron_create cron_delete cron_list`) through `runtime/tool_catalog.rs`. Tool count: 20 → 31. Update `/tasks` overlay (currently empty) to query the registry.
- **Exit**: `cargo test -p agiworkforce-task-runtime` ≥ 20 tests. `agiworkforce exec "run sleep 60 in background"` populates `/tasks`.

### S3 — Apply-patch crate + scenario harness (P0, 1 wk)

- **M19** — Extract `crates/agiworkforce-apply-patch/`. Unified-diff parser, hunk matcher, atomic file writer with rollback. Port semantics from `codex-rs/apply-patch/src/lib.rs`. Replace inline `execute_apply_patch` in `tools.rs`. Add `move` operation (OpenCode `apply_patch.ts:60`).
- **M20** — Copy 22 scenario fixtures from `reference/codex-cli/codex-rs/apply-patch/tests/fixtures/scenarios/`. Each has `input.patch`, `input_tree.toml`, `expected_tree.toml`, `expected_result.json`. Parameterized test driver.
- **Exit**: `cargo test -p agiworkforce-apply-patch` ≥ 22 scenarios pass.

### S4 — Hook event completion (P0, 3 days)

- **M21** — Add 14 missing hook events. Extend `apps/cli/src/hooks.rs::HookEvent` with `StopFailure PostToolUseFailure TaskCreated TaskCompleted Elicitation ElicitationResult ConfigChange WorktreeCreate WorktreeRemove InstructionsLoaded CwdChanged Setup TeammateIdle`. Update string-mapping at `hooks.rs:resolve_event_name:176`. Update count lock test from 22 → 35. Update Claude-Code-parity-set test to include all newly-shared events.
- **Exit**: `cargo test hooks` ≥ 70 tests (was 50).

### S5 — 13 missing slash commands (P1, 1 wk)

- **M22** — Update `crates/agiworkforce-command-registry/src/lib.rs::builtin_slash_registry_commands` with the 13 new commands. Update `slash_palette_golden.txt` (50 → 63 lines) and count test.
- **M23** — Wire dispatch arms in `tui/tui_app.rs`. Most reuse existing handlers (`/clear` → `app.session.clear()`; `/rewind` → `repl::handle_rewind`; `/export` → `repl::handle_export`; `/branch` aliases `/fork`; `/reload-plugins` → `PluginsManager::load_all`; `/extra-usage` points to pricing). `/focus` toggles a new `app.focus_mode` flag.
- **M24** — `/advisor` slash + `AdvisorTool`. Overlay routes user question to a higher-tier model (default Opus) without affecting session context. Output streams as `SystemMessage`. New tool the agent can also call from within an agentic loop.
- **Exit**: `cargo test slash_palette_matches_golden` green at 63 commands.

### S6 — Cost ledger + memory pruning + tool distillation (P1, 1 wk)

- **M25** — Real cost ledger. New `apps/cli/src/cost_ledger.rs` with per-model pricing constants from `models.json`. Tracks input × rate + output × rate + cache_read × rate + cache_write × rate. Wire from `agent.rs` post-turn. Update `UsageSummary::estimated_cost_usd` in `screen_renderers.rs` to read from the ledger.
- **M26** — Memory pruning. `apps/cli/src/memory.rs::prune(max_age_days, max_facts)` drops observations >30 days OR keeps top-K by `recency × relevance`. Called from session-end + `/memory clear-old`.
- **M27** — Tool distillation. New `apps/cli/src/runtime/tool_distillation.rs::distill_for(model_family)` returns compressed catalog view (drop verbose descriptions for small models; drop `should_defer` tools for tier-1 models). Provider stream functions call it.
- **Exit**: send-to-Haiku payload ≤ 60% of send-to-Opus. Memory test triggers prune. `/usage` shows real dollars within 1% of API-reported.

### S7 — MCP completion (P1, 1 wk)

- **M28** — Connection pooling. `McpConnectionManager` with `HashMap<server_name, Arc<Mutex<McpConnection>>>`. Idle-timeout reaper. 100 repeated tool calls reuse 1 connection.
- **M29** — OAuth token persistence via `keyring` crate (with file-backed fallback at `~/.agiworkforce/secrets/` for headless Linux). Per-server tokens, refresh-on-401. Wire `mcp/oauth_flow.rs` to write into the store.
- **M30** — Resource-list API + server status snapshot. `list_mcp_resources(server) -> Vec<Resource>`. `McpServerStatusSnapshot { status: Connected/Disabled/NeedsAuth/Failed, error }` refreshed periodically. `/mcp` overlay uses real status (currently hardcoded `Connected`).

### S8 — Real interactive overlays (P1/P2, 2 wks)

- **M31** — `ListSelectionView<T>` base + 4 derived overlays: `MemoriesSettingsView`, `SkillsToggleView` (interactive enable/disable, not just text), `StatusLineSetupView`, `TerminalTitleSetupView`. Wire to `/memory`, `/skills` (extended), `/statusline`, `/title`.
- **M32** — `CommandPopup` slash help. Port Codex's `command_popup.rs`. `/` opens an autocomplete popup with descriptions, filterable by typing. Hook into `tui/tui_app.rs::handle_slash_popup_key:950`.
- **M33** — Inline diff preview / `DiffReviewView`. For `apply_patch` + `edit_file/multiedit`, render file-list + scrollable diff pane. Per-file approve/reject. Snapshot tests against synthetic diffs.

### S9 — Subagent v2 + worktree + LSP basic (P1/P2, 2 wks)

- **M34** — Subagent v2 + IPC. Refactor `subagent.rs` to spawn child process (or isolated tokio task) running an independent agent loop. IPC over stdio for send-message, wait-for-result, kill. New tools: `spawn_agent_v2`, `send_message_to_agent`, `wait_agent`, `close_agent`. `/tasks` lists active subagents.
- **M35** — `EnterWorktree`/`ExitWorktree` tools. `git worktree add` temporary worktree, switch session cwd, run a sequence, `git worktree remove` on exit. Fires `WorktreeCreate`/`WorktreeRemove` hook events (added in S4).
- **M36** — LSP client basic. New `apps/cli/src/lsp/` module with stdio LSP client. Initialize against rust-analyzer / tsserver / gopls based on workspace detection. 3 tools: `lsp_definition`, `lsp_hover`, `lsp_diagnostics`. Integration test against rust-analyzer.

### S10 — Sandbox + browser OAuth + voice (P2/P3, 2 wks)

- **M37** — macOS Seatbelt. Port `MacOsSandboxManager.ts` (Gemini, ~600 LOC) to Rust at `crates/sandbox-policy/src/macos.rs`. Wrap `run_command` invocations with `sandbox-exec -p <profile>` on macOS. Behind `--sandbox=experimental` flag.
- **M38** — Linux seccomp-BPF basic. Use `seccompiler` crate. Architecture-aware (x86_64, aarch64). Deny `ptrace`, `clone-with-namespaces`, `unshare`.
- **M39** — Browser OAuth (PKCE) for `/login`. Open `https://...?code_challenge=...` in default browser; local listener on a random port catches the redirect; exchange code; store via M29. Multi-provider from `models.json` `auth_url`.
- **M40** — Voice input basic. Audio capture via `cpal` (already a dep), POST to Whisper API, transcript pastes into composer. `/voice` toggle.

## Verification per sprint

Each sprint exit:

- `cargo check --workspace` green
- `cargo test --workspace` green (target: +200 tests over v1.1 by S10)
- Each new tool / overlay / hook has a snapshot or unit test
- `git diff --stat` shows no edits outside `apps/cli/`, `crates/`, `AGIWORKFORCE_*.md`

Final v1.2 release exit:

- `cargo build --release -p agiworkforce-cli` produces a ≤ 8MB binary
- `~/.cargo/bin/agiworkforce --version` prints `1.2.0`
- Manual smoke of every new command + overlay against captures + reference behavior
- `AGIWORKFORCE_IMPLEMENTATION_LOG.md` has an entry per milestone
- Tag `v-cli-1.2.0` on `main`

## Critical files (top 20 to modify across v1.2)

| #   | File                                              | Sprint(s)      | Action                     |
| --- | ------------------------------------------------- | -------------- | -------------------------- |
| 1   | `apps/cli/src/tui/widgets/approval_overlay.rs`    | S1             | NEW                        |
| 2   | `apps/cli/src/tui/widgets/elicitation_overlay.rs` | S1             | NEW                        |
| 3   | `crates/agiworkforce-task-runtime/`               | S2             | NEW crate                  |
| 4   | `apps/cli/src/runtime/tool_catalog.rs`            | S2, S6, S9     | extend                     |
| 5   | `crates/agiworkforce-apply-patch/`                | S3             | NEW crate                  |
| 6   | `apps/cli/src/hooks.rs`                           | S4             | add 14 events              |
| 7   | `crates/agiworkforce-command-registry/src/lib.rs` | S5             | add 13 commands            |
| 8   | `apps/cli/src/tui/tui_app.rs`                     | S1, S5, S8, S9 | dispatch + overlay routing |
| 9   | `apps/cli/src/cost_ledger.rs`                     | S6             | NEW                        |
| 10  | `apps/cli/src/memory.rs`                          | S6             | add prune                  |
| 11  | `apps/cli/src/runtime/tool_distillation.rs`       | S6             | NEW                        |
| 12  | `apps/cli/src/mcp/mod.rs`                         | S7             | pooling + list API         |
| 13  | `apps/cli/src/mcp/oauth_store.rs`                 | S7             | implement keyring          |
| 14  | `apps/cli/src/tui/widgets/list_selection_view.rs` | S8             | NEW                        |
| 15  | `apps/cli/src/tui/widgets/diff_review.rs`         | S8             | NEW                        |
| 16  | `apps/cli/src/subagent.rs`                        | S9             | v2 + IPC                   |
| 17  | `apps/cli/src/lsp/`                               | S9             | NEW module                 |
| 18  | `crates/sandbox-policy/src/macos.rs`              | S10            | NEW                        |
| 19  | `crates/sandbox-policy/src/linux.rs`              | S10            | NEW                        |
| 20  | `apps/cli/src/auth.rs`                            | S10            | browser PKCE               |

## Acceptance criteria

**P0 done** (S1–S4 complete) when:

- `/approvals` opens a real interactive overlay; keys mutate state.
- A mock MCP server's `elicitation/create` shows the overlay and user input round-trips.
- `task_create` → `task_list` → `task_stop` → `task_output` works through agent tools.
- `cargo test -p agiworkforce-apply-patch` runs ≥ 22 scenarios.
- All 14 missing hook events resolve from string and fire from their dispatch sites.

**P1 done** (S5–S7 complete) when:

- The 13 new commands appear in the palette + dispatch correctly.
- `/usage` shows real dollar cost (within 1% of API-reported usage).
- Long session triggers memory pruning; `cargo test memory::prune` proves it.
- Send-to-Haiku payload ≥ 30% smaller than send-to-Opus.
- 100 MCP tool calls in a row reuse 1 connection per server.
- `/mcp auth-status` lists each server's auth state.

**P2 done** (S8–S10 complete) when:

- `/memory` and `/skills` are interactive (cursor + key dispatch), not text.
- `/apply_patch` shows per-file diff with y/n approval.
- LSP `lsp_definition` works on a Rust file in this repo.
- macOS Seatbelt blocks `run_command` from writing outside cwd unless `--network` flag.
- Linux seccomp filter blocks `ptrace`.
- `/login` opens a browser for OAuth.
- `/voice` records + transcribes via Whisper.

## Risks & mitigations

- **R1 — TUI event-loop refactor cost.** S1 wires the first real `InteractiveView`. The event loop in `tui/tui_app.rs` currently routes keys to the bottom-pane composer; adding a "modal overlay slot" that intercepts keys first is the load-bearing change. **Mitigation**: do it as an isolated PR before M15; use the existing model/effort/theme pickers as the regression baseline.
- **R2 — Task-runtime stalls.** Spawned subprocesses can hang indefinitely. **Mitigation**: port Codex's stall watchdog (configurable timeout per task, kill-on-timeout, surface as `failed: timeout` in `/tasks`).
- **R3 — OS-specific sandbox bugs.** Seatbelt + seccomp are brittle. **Mitigation**: ship behind `--sandbox=experimental` flag; default to current Rust sandbox; allow opt-out per command via `/sandbox unrestricted`.
- **R4 — Keyring portability.** `keyring` crate has known issues on headless Linux. **Mitigation**: fall back to a 0o600 file under `~/.agiworkforce/secrets/` on environments without DBus; surface via `/doctor`.
- **R5 — Scope creep.** Each sprint is 1 week; anything bigger must split. **Mitigation**: at each sprint exit, re-read this plan and re-scope the next.
- **R6 — Reference code license.** Reference repos under `~/Desktop/reference/` carry their own licenses (Codex CLI: Apache 2.0; Gemini CLI: Apache 2.0; OpenCode: Apache 2.0; Claw-code: MIT). **Mitigation**: port behavior (clean-room), not source. Add SPDX attribution in `THIRD_PARTY_LICENSES.md` for any non-trivial structural inspiration.

## Order of operations

```
S1  (1w)  → permission + elicitation overlays           [P0]
S2  (1w)  → task/team/cron tools                        [P0]
S3  (1w)  → apply-patch crate + 22 fixtures             [P0]
S4  (3d)  → +14 hook events                             [P0]
S5  (1w)  → +13 slash commands                          [P1]
S6  (1w)  → cost ledger + memory prune + distillation   [P1]
S7  (1w)  → MCP pooling + OAuth keyring + resource API  [P1]
S8  (2w)  → real interactive overlays                   [P1/P2]
S9  (2w)  → subagent v2 + worktree + LSP basic          [P1/P2]
S10 (2w)  → macOS Seatbelt + seccomp + browser OAuth + voice  [P2/P3]
─────
~13 weeks → v1.2.0 release
```

If timeline must compress: drop S10 entirely (P2/P3 only) and ship as v1.2.0; remaining items become v1.3 backlog. The P0 sprints (S1–S4) are non-negotiable for shipping competitive parity.

## Audit-Verified Sources

Citations gathered during the 2026-05-14 deep audit. Every claim in this plan traces back to one of these.

### Codex CLI

- 107 workspace crates: `reference/codex-cli/codex-rs/Cargo.toml:2-108`
- 46 slash commands: `codex-rs/tui/src/slash_command.rs:12-73`
- ~155 tool factories: `codex-rs/tools/src/lib.rs:1-156`
- 18 BottomPaneView impls: `codex-rs/tui/src/bottom_pane/`
- `ApprovalOverlay`: `codex-rs/tui/src/bottom_pane/approval_overlay.rs:531`
- `RequestUserInputOverlay`: `codex-rs/tui/src/bottom_pane/request_user_input.rs`
- 22 apply-patch fixtures: `codex-rs/apply-patch/tests/fixtures/scenarios/001-022_*/`
- 439 insta snapshots across workspace
- MCP elicitation: `codex-rs/codex-mcp/src/elicitation.rs:34-80`
- MCP exports: `codex-rs/codex-mcp/src/lib.rs:25-48`
- 6 hook events: `codex-rs/hooks/src/lib.rs:10-17`
- 30 protocol modules: `codex-rs/protocol/src/lib.rs:1-30`
- CLI subcommands: `codex-rs/cli/src/main.rs:103-240`
- Hook fixtures: `codex-rs/tui/src/bottom_pane/snapshots/*.snap` (preserved under `_attic/`)

### Claude Code (extracted TS source + captures)

- 101 command files: `reference/src/commands/`
- 40 tool specs: `mvp_tool_specs()` per `claw-code/PARITY.md` lane 10
- 36 services: `reference/src/services/`
- 146 component dirs: `reference/src/components/`
- 7 task types: `reference/src/tasks/types.ts`
- 27 hook events: `reference/src/entrypoints/sdk/coreTypes.ts::HOOK_EVENTS`
- Palette captures 607–618: `reference/ui-capture-runs/20260513-185809-agent-platform-reference/screenshots/claude-code/`

### Gemini CLI

- 7 workspace packages: `reference/gemini-cli/packages/`
- 46 slash commands: `reference/gemini-cli/packages/cli/src/ui/commands/`
- 21 core tools: `reference/gemini-cli/packages/core/src/tools/definitions/base-declarations.ts:1-104`
- Voice: `packages/core/src/voice/audioRecorder.ts` + `geminiLiveTranscriptionProvider.ts`
- Sandboxes: `packages/core/src/sandbox/{macos,linux,windows}/`
- Memory: `packages/core/src/context/memoryContextManager.ts`
- Skill auto-extraction: `packages/core/src/agents/skill-extraction-agent.ts:1-80`
- VS Code companion: `packages/vscode-ide-companion/src/`

### OpenCode

- 21 workspace packages
- LSP: `packages/opencode/src/lsp/lsp.ts:1-100`
- Patch with move: `packages/opencode/src/tool/apply_patch.ts:18-100`
- ACP: `packages/opencode/src/acp/`

### Claw-code

- 9 crates, 48,599 LOC: `claw-code/PARITY.md:8-10`
- 9-lane checkpoint: `claw-code/PARITY.md:38-50`
- OmX/clawhip/OmO architecture: `claw-code/PHILOSOPHY.md:1-115`
- Still-limited list: `claw-code/PARITY.md:153-188`

## Assumptions (carried over from v1.1)

1. Incremental extraction continues — no from-scratch rewrite.
2. Pre-existing dirty in-progress files stay untouched (`apps/cli/src/onboarding.rs`, `apps/desktop/e2e/utils/screenshot-helper.ts`, `apps/extension-vscode/package.json`, `apps/extension-vscode/src/utils/api.ts`).
3. Reference code is read-only; we port behavior, not source.
4. Plan-mode mutation gate (`agent.rs:2129`) continues to protect against unintended writes.
5. Hook events stay backward-compatible; new events are additive.
6. Cargo workspace member glob `crates/*` auto-picks up new crates.

## Out-of-scope for v1.2

- Multi-agent coordination layer (OmX/clawhip/OmO from claw-code)
- Desktop app (Tauri or Electron)
- Chrome extension companion (full feature; v1.2 keeps the text overlay only)
- Hosted plugin marketplace registry
- Commercial flow: `/upgrade /passes /privacy-settings /mobile /desktop /tui /stickers`
