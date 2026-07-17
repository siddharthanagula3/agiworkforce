# AGI CLI — Volume 09 — Terminal

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/cli/AGENTS.md`, and the real implementation this volume grounds in: `apps/cli/src/features/exec/tools/bash/mod.rs`, `apps/cli/src/features/exec/tools/common/mod.rs`, `apps/cli/src/features/exec/tools/task_registry/mod.rs`, `apps/cli/src/safety/mod.rs`, `apps/cli/src/shell_snapshot.rs`, `apps/cli/src/powershell_tool.rs`, `apps/cli/src/platform/runtime/tool_catalog.rs`, `apps/cli/src/agent/mod.rs`, `apps/cli/src/app_server.rs`, and `crates/agiworkforce-app-server`.

## Overview & stance

This volume specifies how AGI CLI runs shell commands on the developer's machine and how the agent observes what those commands produce. Command execution is an **on-device** capability: every process runs against the local shell and workspace, so running a command never itself changes the trust boundary. What the trust mode governs is where command **output** travels once it re-enters the model context. Local (`local_only`) keeps command output on the device; BYOK sends selected context directly to the user's provider key (Desktop/CLI/VS Code only); Managed Cloud routes selected context through AGI-managed compute. The `PrivacyMode` guard in `apps/cli/src/agent/mod.rs` (`validate_privacy_boundary`, `consume_byok_handoff`) is ✅ Built and blocks a Local session from silently feeding command output to a non-local provider — the Local→BYOK move is an explicit fork (context selection, secret scan, payload preview, visible provider label, consent). All terminal activity is workspace/session-scoped and is never auto-synced to app chat.

Two invariants hold below: **policy-then-approval** — every command is first evaluated by the execution policy (a `Forbidden` decision is a hard block no confirmation can override, `bash/mod.rs`), then non-`Safe` commands pass `CommandSafety` approval (`safety/mod.rs`); and **sandbox-by-default** — commands run inside `SandboxManager` with `NetworkPolicy::Deny` unless the user explicitly runs `--no-sandbox` (`bash/mod.rs`).

## Execute Commands

✅ Built — `run_command` (`tool_catalog.rs:295`; execution in `bash/mod.rs`) runs a shell command and returns combined stdout/stderr. It is gated by the execution policy, `classify_command` safety triage, and the saved `PermissionStore`; a sandboxed run uses `SandboxManager::for_command_execution`, and the unsandboxed fallback is `sh -c`. A separate `powershell` tool (`tool_catalog.rs:306`, `powershell_tool.rs`) exists for Windows with its own destructive-verb/registry/ExecutionPolicy checks. Requirement: no command runs before policy + approval; a `Forbidden` command is refused with an explanatory message, never executed.

## Shell Integration

🟡 Partial — at session start `ShellSnapshot::capture` (`shell_snapshot.rs`) records the process environment to an owner-only (`0600`) per-session file, **redacting** secret-bearing keys (`KEY`, `TOKEN`, `SECRET`, `AUTH`, …) so credentials never persist in plaintext, and prunes snapshots older than three days. Commands execute through `sh -c` (Unix) or the PowerShell interpreter resolved by `find_interpreter` (`powershell_tool.rs`). Gap: the CLI does **not** yet source the user's interactive rc files or load their aliases/functions/prompt into the execution shell — the snapshot is a redacted record, not an applied shell profile. First-class shell-config integration (aliases, functions, sourced rc) is 🔭 Planned.

## Long-running Commands

🟡 Partial — `run_command` enforces a hard `COMMAND_TIMEOUT` of 30 seconds (`common/mod.rs:19`); on expiry the tool returns "Command timed out after 30 seconds" rather than hanging. The `powershell` tool accepts a per-call `timeout_sec` (default 30, `tool_catalog.rs:313`), but `run_command` exposes no per-call override today. Gap: a configurable/extendable timeout and a "promote to background" path for `run_command` are 🔭 Planned; work exceeding 30 s is currently expected to move to the task registry (below).

## Background Processes

🟡 Partial — the session `task_registry` (`task_registry/mod.rs`) provides `task_create`, `task_update`, `task_stop` (`tool_catalog.rs:485–564`, deferred). `task_create` records `kind`/`command`, allocates a file-backed output sink, and returns a UUID; state transitions are validated (Pending→Running→Completed/Failed/Stopped). Gap: the registry is **bookkeeping**, not a supervisor — `task_create` does not itself spawn or detach a process, and `task_stop`'s own description states "the actual process kill (if any) must be performed separately; this only updates registry state." A true detached-process spawner that writes into the sink and reaps exit status is 🔭 Planned. Requirement: registry state must never claim a process is running that it did not actually launch.

## Process Monitoring

🟡 Partial — `task_list`, `task_get`, and `task_output` (`tool_catalog.rs:518–577`, read-only, deferred) report registry state: status/kind, start/end timestamps, exit code, error, and a tail of the file-backed output (`max_bytes`, default 8192). This lets the agent poll and inspect tracked tasks. Gap: there is no live PID/CPU/memory monitoring, no process tree, and no signal delivery — monitoring reflects recorded registry state and captured output, not OS-level liveness. Live process telemetry is 🔭 Planned.

## Exit Codes

✅ Built — `run_command` returns `Exit code: <n>` prefixed to the output and sets `success = output.status.success()` (`bash/mod.rs`); on spawn failure it returns a failure result, and on timeout a distinct timeout message. `powershell` records `exit_code` (`powershell_tool.rs`), `apply_patch` returns an `exit_code` (`apply_patch.rs`), and the task registry stores an optional `exit_code` per task (`task_registry/mod.rs`). The CLI process itself maps typed errors to exit codes via `CliError::exit_code` (`errors.rs`, e.g. paywall = 78). Requirement: a non-zero exit must be surfaced to the model as failure, never masked as success.

## Output Streaming

🟡 Partial — `run_command` buffers a command to completion with `.output()` and then truncates (`MAX_OUTPUT_BYTES = 50 KB`, `MAX_OUTPUT_LINES = 2000`, overflow saved to disk via `truncate_output_with_save`) — command stdout/stderr is captured, not streamed live. Model-generated text **does** stream (JSONL `MessageDelta` events when `json_events` is set, `agent/mod.rs`; app-server notifications, `app_server.rs`), and `task_output` tails a task's sink. Gap: incremental streaming of a running command's output into the transcript/UI is 🔭 Planned. Requirement: truncated output must show a visible marker and a save pointer, never silently drop bytes.

## Command Suggestions

🔭 Planned — there is no shell-command suggestion/"did you mean" feature for failed or mistyped commands. The only "Did you mean" today is **tool-name** disambiguation for an unknown tool call (`features/exec/tools/mod.rs:332`), which is unrelated. A command-correction/next-command suggester is design intent only; do not describe it as shipped.

## Explain Output

🔭 Planned — the agent can of course explain command output conversationally within a turn, but there is **no** dedicated "explain this output/error" affordance (e.g. a bound action that summarizes the last command's stderr with a fix). This is a parity target, not built. When added it must respect the active `PrivacyMode` — explaining Local output must not route it to BYOK/Managed without the explicit fork.

## Repository map

- `apps/cli/src/features/exec/tools/bash/mod.rs` — `run_command` execution, policy gate, safety approval, sandboxing, exit-code assembly.
- `apps/cli/src/features/exec/tools/common/mod.rs` — `COMMAND_TIMEOUT`, output caps, `truncate_output_with_save`, `describe_command`.
- `apps/cli/src/features/exec/tools/task_registry/mod.rs` — task lifecycle (create/get/list/update/stop/output) and file-backed sinks.
- `apps/cli/src/safety/mod.rs` — `classify_command`, `CommandSafety` (Safe/Dangerous).
- `apps/cli/src/shell_snapshot.rs` — redacted per-session env snapshot, `0600`, 3-day pruning.
- `apps/cli/src/powershell_tool.rs` — Windows PowerShell execution with per-call timeout and safety checks.
- `apps/cli/src/platform/runtime/tool_catalog.rs` — `run_command`/`powershell`/`task_*` definitions, aliases, size caps.
- `apps/cli/src/agent/mod.rs` — `PrivacyMode` guard over what output may leave the device.
- `apps/cli/src/app_server.rs`, `crates/agiworkforce-app-server` — command tools exposed over the JSON-RPC/WS tool host.

## Competitor notes

Claude Code and Codex CLI expose a comparable bash tool with approval prompts, timeouts, background/detached runs, and live output streaming; ChatGPT executes shell mainly inside its cloud/agent runtime rather than a local BYOK CLI. AGI's deliberate divergence is **per-surface trust** and **local-first**: the provider/model behind an agent turn is user-selectable (Local, or BYOK on this surface), and the Local privacy guard means command output on a Local session cannot be routed to a cloud provider without the explicit, previewed BYOK/Managed fork — a guarantee single-vendor CLIs do not offer. Sandbox-by-default with `NetworkPolicy::Deny` and a hard `Forbidden` execution-policy block are stricter defaults than a bare shell tool. Model IDs come only from `packages/contracts/types/src/models.json`; terminal tooling never hardcodes one.

## Acceptance / Definition of Done

- [ ] **Build:** `run_command` runs through policy → safety → sandbox, prefixes an accurate `Exit code`, truncates oversized output with a save pointer, and honors the 30 s timeout; `cargo test -p agiworkforce-cli --lib` green.
- [ ] **Trust:** command output on a Local session cannot reach BYOK/Managed without the explicit fork (`validate_privacy_boundary` + BYOK-handoff tests); no auto-sync of terminal output to app chat.
- [ ] **Security:** `Forbidden` commands are hard-blocked regardless of confirmation; non-`Safe` commands are approval-gated; the env snapshot redacts secret keys and is `0600`.

## Anti-patterns

- Silently routing Local-session command output to BYOK or Managed Cloud, or auto-syncing terminal output into app chat.
- Reporting a non-zero exit as success, or claiming a background process is running that the registry never actually launched.
- Persisting unredacted secrets in the shell snapshot, or bypassing the execution-policy/approval gates.
- Claiming live output streaming, extendable `run_command` timeouts, command suggestions, or an "explain output" action as shipped — those are 🔭/🟡, not ✅.
- Inventing model IDs, routes, env vars, or tool names; using `agiworkforce <cmd>` in examples instead of `agi`.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby"), credit top-ups, or Supabase.
