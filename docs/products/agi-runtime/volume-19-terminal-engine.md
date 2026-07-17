# AGI Runtime — Volume 19 — Terminal Engine

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/cli/AGENTS.md`, `services/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, plus the real repo paths in the Repository map below.

## Overview & stance

This volume specifies the internal AGI Runtime **Terminal Engine**: the shared code that spawns shell commands on the host, streams their output, monitors the process, and reconciles exit codes. It is not a user surface — it is Rust/TS the surfaces compile in and the local host consumes.

Terminal execution is inherently the **Local** trust mode (`local_only`). A command runs on the user's machine, against the user's filesystem and environment; its bytes and exit codes never enter Neon delta-sync. There is no "cloud terminal" here — Cloud-run agent sessions are a separate Managed-Cloud path, not this engine. **BYOK does not apply**: a shell command is not an LLM call, though on Desktop/CLI/VS Code an agent under a BYOK or Local session may invoke this engine as a tool. **Web and Mobile expose no local terminal** — they have no local process host, so this engine compiles only into Desktop, CLI, and VS Code.

Remote Control can steer a terminal (a paired phone/web window issues `dispatch`/`cancel` through `services/signaling-server`), but the process keeps running on the host — compute never moves, the connection is outbound-only, and every command is approval-gated. Secret-bearing env vars are stripped before any subprocess sees them (see Shell Detection). There is no monolithic "terminal daemon" today; the engine is assembled from the real parts below, and the fully-wired PTY spawner is 🔭.

## Shell Detection

Requirement: choose the correct shell/interpreter per host OS, build a safe subprocess environment, and never leak credentials into it.

- ✅ Built — `crates/agiworkforce-protocol/src/shell_environment.rs`: `create_env` / `populate_env` build the subprocess environment from a `ShellEnvironmentPolicy`. Default-excludes strip `*KEY*`, `*SECRET*`, `*TOKEN*`, `*PASSWORD*`, `*PASSWD*`, `*CREDENTIAL*`, `*DATABASE_URL*` (case-insensitive) so live credentials never reach an agent-driven shell. Core-inherit keeps `SHELL`/`COMSPEC`/`PATH`/`PATHEXT`; Windows gets a default `PATHEXT` when a restrictive policy dropped it.
- ✅ Built — `crates/agiworkforce-protocol/src/config_types.rs`: `ShellEnvironmentPolicy { inherit (All|Core|None), ignore_default_excludes, exclude, set, include_only, use_profile }`. `use_profile` selects whether the command runs through the login shell profile.
- ✅ Built — `crates/agiworkforce-command-registry/src/lib.rs:454`: a registry command prints the shell-integration snippet for `bash/zsh/fish`.
- 🔭 Planned — a dedicated resolver that detects the interpreter (zsh vs. pwsh vs. cmd) from `$SHELL`/`$COMSPEC` and OS, then picks argv (`-lc`, `-Command`). Today the environment carries the hints but no component canonicalizes the interpreter choice.

## Command Execution

Requirement: run a single command as a tracked unit with a stable id, working directory, resolved environment, and sandbox boundary; never route it off-host.

- 🟡 Partial — `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`: `TaskRegistry::create(TaskKind::LocalShell, command)` records a `Task { id, command, output_path, status, exit_code, error }` and enforces a legal status machine (`Pending → Running → {Completed|Failed|Stopped}`). **Gap:** the registry tracks the unit and its output file but does not itself `spawn` an OS process — the PTY/`tokio::process` spawner binding argv to this lifecycle is 🔭.
- ✅ Built — `crates/agiworkforce-execpolicy` (`Policy`, `PolicyParser`, `Decision`, `blocking_append_allow_prefix_rule`): an allow/deny gate matching a candidate argv against per-program and network rules before execution — where "ask before acting" is decided.
- ✅ Built — `crates/sandbox-policy/src/lib.rs`: `SandboxPolicy { ReadOnly, WorkspaceWrite { writable_roots }, ExternalSandbox, DangerFullAccess }`, defaulting to `WorkspaceWrite` for unrecognized modes — commands run inside a filesystem boundary.
- ✅ Built — `crates/agiworkforce-app-server/src/lib.rs`: typed developer-session stdio + authenticated WebSocket transport drives the full CLI agent host, including approval round-trips. 🟡 Partial — the separate `agi mcp-server` stdio command advertises no tools until its execution and approval path is wired.

## Process Monitoring

Requirement: observe a running command for liveness, detect stalls, and expose stop/cancel — locally and to an approved remote window.

- 🟡 Partial — `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`: `StallWatchdog::spawn(registry, task_id, timeout)` polls the task's output file for byte growth (derived 100 ms–500 ms interval); if no new output appears within `timeout`, it marks the task `Failed` with error `"stall timeout"`, and aborts when the task reaches a terminal state.
- 🟡 Partial — `TaskRegistry::stop(id)` marks a running task `Stopped` and rejects illegal transitions, giving a cancel primitive. **Gap:** `stop` flips registry state but does not yet signal/kill the underlying OS process (the spawner is 🔭), so real SIGTERM/kill wiring is outstanding.
- 🔭 Planned — remote monitoring parity: a paired phone/web window receiving live process status and issuing `cancel` through `services/signaling-server` (roles `desktop|mobile`, HMAC `pairTokens`, approval-gated). The signaling verbs exist; the desktop↔mobile companion last mile is 🟡 (`apps/mobile/lib/v1FeatureFlags.ts` `companion:false`/`dispatch:false`; control events re-emitted as a `'mobile-companion:control'` window event with no listener).

## Streaming Output — stream stdout/stderr

Requirement: stream stdout and stderr incrementally with correct text decoding, an aggregated interleaved view, and bounded/truncated buffers so a runaway command cannot exhaust memory.

- ✅ Built — `crates/agiworkforce-protocol/src/exec_output.rs`: `StreamOutput<T> { text, truncated_after_lines }` and `ExecToolCallOutput { exit_code, stdout, stderr, aggregated_output, duration, timed_out }` are the streaming data model — separate stdout/stderr plus an aggregated view, with an explicit truncation marker.
- ✅ Built — same file: `bytes_to_string_smart` uses `chardetng` + `encoding_rs` to detect legacy code pages (CP1251/CP866/Windows-1252) and decode them instead of emitting replacement junk. Testable: mixed smart-quote bytes render as `"…"`, not Cyrillic.
- 🟡 Partial — `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`: `read_output(id, max_bytes)` tails the task's output file up to `max_bytes` (seeking past the head), giving bounded reads over time. **Gap:** this is pull-based file tailing, not a push stream emitting incremental `StreamOutput` chunks as bytes arrive — the live chunk pump is 🔭.

## Exit Codes — handle process completion

Requirement: capture the true process exit code (and timeout/kill distinction), close the task deterministically, and surface completion to callers and any remote window.

- 🟡 Partial — `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`: `Task.exit_code: Option<i32>` and `update_status(id, status, exit_code, error)` record completion; the state machine guarantees a task ends in exactly one terminal state, with tests asserting `exit_code == Some(0)` on clean exit.
- ✅ Built — `crates/agiworkforce-protocol/src/exec_output.rs`: `ExecToolCallOutput` carries `exit_code`, `duration`, and a distinct `timed_out` flag so "exited 137 via timeout" is not confused with "exited 0". This is the completion contract returned to callers.
- 🔭 Planned — end-to-end reconciliation: mapping a real `std::process::ExitStatus` (Unix signal-derived and Windows codes) into `Task.exit_code` + `ExecToolCallOutput.timed_out`, then emitting one completion event over the app-server transport and, when paired, to the remote window. The fields exist; the spawner that populates them from a live child is outstanding.

## Repository map

- `crates/agiworkforce-protocol/src/exec_output.rs` — `StreamOutput`, `ExecToolCallOutput`, encoding-aware byte→string decoding.
- `crates/agiworkforce-protocol/src/shell_environment.rs` — subprocess env construction, secret excludes, Windows `PATHEXT`.
- `crates/agiworkforce-protocol/src/config_types.rs` — `ShellEnvironmentPolicy` and inherit modes.
- `crates/agiworkforce-task-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` — `TaskKind::LocalShell`, `TaskRegistry`, `StallWatchdog`, `read_output`, `stop`.
- `crates/agiworkforce-execpolicy/` — command allow/deny policy engine.
- `crates/sandbox-policy/src/lib.rs` — filesystem sandbox modes.
- `crates/agiworkforce-app-server/src/lib.rs` — typed developer-session stdio + authenticated WebSocket transport.
- `crates/agiworkforce-command-registry/src/lib.rs` — shell-integration snippet command.
- `services/signaling-server` — remote `dispatch`/`cancel` steering (compute stays on host).

## Competitor notes

Claude Code, ChatGPT, and Codex all run a host shell as an agent tool with approval prompts; Codex remote connections and Claude Code Remote Control let a paired phone steer a Mac/Windows host while the session stays local. AGI's deliberate divergence: (1) **local-first and per-surface** — the terminal exists only on Desktop/CLI/VS Code, never on Web/Mobile, and its output is Local trust, never delta-synced; (2) **provider-agnostic** — the engine is decoupled from any LLM, so Local, BYOK, and Managed-Cloud agents use the same sandbox and execpolicy gate; (3) **credential hygiene by default** — secret-named env vars are stripped before a subprocess starts, not opt-in; (4) **explicit remote windows, not a fourth mode** — steering is QR+HMAC paired, approval-gated, and moves no local data to the cloud.

## Acceptance / Definition of Done

A production-ready Terminal Engine spawns a real child with the resolved shell and sandbox, streams decoded stdout/stderr incrementally, monitors liveness, and reconciles the true exit code — on the host, gated by execpolicy, with no credential leakage or off-host routing.

- [ ] Build: a command runs through `TaskKind::LocalShell` end-to-end, streaming incremental `StreamOutput` chunks and closing with the child's real `exit_code`/`timed_out`; `stop` actually signals the child.
- [ ] Trust: terminal output stays Local — no row enters `apps/web/app/api/{chat,memory,projects}/sync`; remote steering is approval-gated and compute stays on the host.
- [ ] Security: `execpolicy` denies un-allowlisted argv; secret-named env vars are absent from the child environment; the sandbox mode bounds writes to `writable_roots`.

## Anti-patterns

- Do not stream, log, or sync terminal output into Managed-Cloud chat rows, or route a Local command through a BYOK/Cloud path — Local is a hard boundary.
- Do not treat a remote phone/web window as a new trust mode; it is a paired, approval-gated window over a host-local process.
- Do not disable the secret-name env excludes or default to `DangerFullAccess`/`ignore_default_excludes`.
- Do not claim a live PTY spawner, push-streaming, or process-kill is shipped — those are 🔭 until wired to a real child; cite the path or mark the gap.
- Do not invent model IDs, routes, env var names, or commands; non-LLM engine identifiers come from real repo code. Never reference removed tiers ("Plus", `pro_plus`, "Hobby") or top-ups, and never reference Supabase.
- CLI examples use the `agi` binary, never `agiworkforce <cmd>`.
