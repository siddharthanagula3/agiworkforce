# AGI CLI — Volume 18 — Observability

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: Grounded in `AGENTS.md` (repo root), `apps/cli/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), and real repo paths: `apps/cli/src/doctor.rs`, `apps/cli/src/agent_events.rs`, `apps/cli/src/errors.rs`, `apps/cli/src/cost_ledger.rs`, `apps/cli/src/tui/cost_hud.rs`, `apps/cli/src/approval_audit.rs`, `apps/cli/src/voice.rs`, `apps/cli/src/agent/mod.rs`, `apps/cli/src/mcp/mod.rs`, `apps/cli/src/lib.rs`, `docs/surfaces/cli.md`, `docs/cli/COMMAND_SURFACE.md`.

## Overview & stance

This volume specifies how AGI CLI exposes its own runtime behavior: logs, diagnostics, debug/trace surfaces, performance and cost metrics, crash handling, feature-flag inspection, and telemetry consent. AGI CLI is a Local + BYOK + Managed developer surface where sessions are workspace/session-scoped and never auto-synced to app chat. Observability therefore obeys one hard rule that overrides convenience: **on Local sessions, telemetry is opt-in only and never carries prompt, file, or chat content.** The privacy modes in `apps/cli/src/agent/mod.rs` (`PrivacyMode::{Local, Byok, Managed}`, ✅ Built) already block a Local session from silently reaching non-local backends; observability must extend, not undermine, that guarantee. Any egress an observability feature performs must respect the same fork discipline as chat: explicit consent, visible destination, redaction. Diagnostics that stay on the device (doctor, cost HUD, stdout event streams) are the default; anything that would leave the machine is off unless the user turns it on.

## Logging

Instrumentation exists across the codebase via the `tracing` crate — e.g. `apps/cli/src/tier_cache.rs`, `apps/cli/src/a2a_ws.rs`, `apps/cli/src/mcp/mod.rs`, `apps/cli/src/models/streaming.rs` (🟡 Partial). The gap: no `tracing_subscriber` is initialized in the CLI (`apps/cli/src/main.rs` builds only the Tokio runtime and calls `run_main`), so emitted spans currently have no configured sink or user-facing level control. Requirements: initialize a subscriber with an env-driven filter, a human console layer and an opt-in file layer under the state dir, redaction of secret-shaped values before any log line is written, and no prompt/file content at `info` or below. Log level and file destination must be configurable without recompilation. Until the subscriber and file sink are wired, logging remains 🟡.

## Diagnostics

`agi doctor` is the read-mostly preflight (`apps/cli/src/doctor.rs`, ✅ Built): it validates config, local tools, state directories, MCP/plugin shape, and git hygiene without starting an LLM request or connecting to user MCP servers, and it intentionally skips live network probes. It emits structured `DoctorReport`/`DoctorCheck`/`DoctorStatus` and supports `--json`; a `/doctor` slash command is listed in `docs/cli/COMMAND_SURFACE.md`. Requirements: every check has a stable `id`, a `Pass/Warn/Fail/Unknown` status, and an actionable message; `agi doctor --json` is a stable machine contract for CI; a check must never leak secrets in `details`. Planned (🔭): a dedicated trust-boundary check that reports the active `PrivacyMode` and flags any egress-capable feature that is enabled.

## Debug Mode

Targeted debug affordances exist: `AGIWORKFORCE_MCP_DEBUG` prints MCP stderr immediately (`apps/cli/src/mcp/mod.rs`, ✅ Built, narrow to MCP), `agi ... --dump-system-prompt` prints the assembled prompt and exits with no API call (`apps/cli/src/lib.rs`, ✅ Built), and `--json-events` exposes machine-readable lifecycle events for inspection. A unified `--debug`/`--verbose` flag that raises the global log level and echoes provider/tool internals is **not** present (🔭 Planned). Requirement: a single debug switch must gate verbosity only — it must never relax approvals, sandbox policy, or trust-mode routing, and on a Local session it must not enable any network egress.

## Trace Mode

Session-lifecycle tracing ships as typed JSONL: `apps/cli/src/agent_events.rs` (✅ Built) emits one JSON object per line to stdout under `--json-events` (`Spawning`, `ReadyForPrompt`, `RunningTool` with `args_redacted`, `ToolResult`, etc.), with two guarantees — stable variant names and error `kind` strings drawn from `CliError::kind` (`apps/cli/src/errors.rs`). A full request/span trace mode (RUST_LOG-style filtered spans with timing, wired to the logging subscriber above) is 🔭 Planned and depends on the Logging work. Requirement: `RunningTool` must keep redacting secret-shaped arguments; a future span trace must never record raw prompt or file bytes on Local sessions.

## Performance Metrics

Cost/token metrics are built: `apps/cli/src/cost_ledger.rs` computes per-turn dollar cost strictly from the shared model catalog (`apps/cli/src/model_catalog.rs`) — unknown/user-defined models without catalog pricing are recorded as zero rather than estimated, avoiding fictional billing numbers (✅ Built). The TUI cost HUD renders live spend and context-window usage (`apps/cli/src/tui/cost_hud.rs`, ✅ Built), and `/cost`, `/usage`, `/insights` are exposed slash commands (`docs/cli/COMMAND_SURFACE.md`). Latency/throughput timing (time-to-first-token, tokens/sec, tool-call durations) is 🔭 Planned and should surface through the same HUD/insights path. Requirement: metrics stay on-device by default; pricing rates are read from the catalog, never hardcoded.

## Crash Reports

Errors are typed and actionable: `CliError` with a stable `kind()` taxonomy (`api_server_error`, `auth_expired`, `context_overflow`, `api_rate_limit`, `stream_disconnect`, `paywall`, …) drives both human hints and the `--json-events` error `kind` (`apps/cli/src/errors.rs`, ✅ Built). The security-relevant approval trail is append-logged with field truncation (`apps/cli/src/approval_audit.rs`, ✅ Built). What is **not** built: a panic hook / crash-capture path (no `panic::set_hook` in the CLI) and any crash upload (🔭 Planned). Requirement: a crash capture must write locally first, redact by default, and never auto-upload — upload is opt-in and, on Local sessions, prohibited from including session content.

## Feature Flags

`agi features` interrogates the feature layer (`Commands::Features` in `apps/cli/src/lib.rs`; `apps/cli/src/features/mod.rs`; described as "feature flag interrogation" in `docs/surfaces/cli.md`, ✅ Built for inspection). Requirement: `agi features` reports each capability's state (enabled/gated/planned) so observers can confirm which egress-capable features are live; flag names and defaults must match the code, and toggling a flag must never override a trust-mode block.

## Telemetry Controls

There is **no** analytics/telemetry backend in the CLI — no PostHog/Sentry/Segment/Amplitude client exists in `apps/cli/src/` (grounded absence; verified by search). So the default is the strongest possible: nothing is collected. A future telemetry pipeline is 🔭 Planned and must be opt-in only, off by default, content-free, and honor a standard do-not-track signal. The consent pattern already exists for egress: voice transcription is fail-closed on Local sessions unless `AGIWORKFORCE_VOICE_ALLOW_CLOUD` is explicitly set (`apps/cli/src/voice.rs`, `gate_cloud_egress`, ✅ Built) — telemetry must reuse this explicit-opt-in gate. On Local sessions, telemetry must never send prompts, file paths, chat, or tool arguments; at most anonymous, coarse counters, and only after consent.

## Repository map

- `apps/cli/src/doctor.rs` — preflight diagnostics (`agi doctor`, `/doctor`, `--json`).
- `apps/cli/src/agent_events.rs` — typed lifecycle JSONL under `--json-events`.
- `apps/cli/src/errors.rs` — `CliError` taxonomy + stable `kind()`.
- `apps/cli/src/cost_ledger.rs`, `apps/cli/src/tui/cost_hud.rs`, `apps/cli/src/model_catalog.rs` — cost/usage metrics.
- `apps/cli/src/approval_audit.rs` — append-only approval audit trail.
- `apps/cli/src/voice.rs` — consent-gated cloud egress pattern.
- `apps/cli/src/agent/mod.rs` — `PrivacyMode` trust-boundary enforcement.
- `apps/cli/src/mcp/mod.rs` — `AGIWORKFORCE_MCP_DEBUG` debug output.
- `apps/cli/src/features/mod.rs`, `apps/cli/src/lib.rs` — feature-flag interrogation and flag wiring.

## Competitor notes

Claude Code and Codex CLI ship debug/verbose logging, doctor-style diagnostics, and vendor-hosted telemetry (Sentry/analytics) that is on-by-default-with-opt-out and single-provider. AGI diverges deliberately: telemetry is **opt-out by default because it does not exist yet**, and when built it is opt-in only and content-free; diagnostics are multi-provider aware (the model catalog spans 10+ providers per `apps/cli/Cargo.toml`) and BYOK-aware; and every observability path is gated by the per-surface trust model, so a Local session's metrics, traces, and crash data stay on the device unless the user explicitly forks them out. Local-first observability is the product stance, not a setting.

## Acceptance / Definition of Done

A build is production-ready for observability when doctor, cost metrics, and the JSONL event stream are stable and documented; logging has a configured, redacting subscriber; and no observability path can move Local content off-device without explicit consent.

- [ ] Build: `agi doctor --json` and `--json-events` schemas are stable; `tracing_subscriber` is initialized with env-driven level + file sink; `cargo test -p agiworkforce-cli --lib` passes.
- [ ] Trust: `agi features` reports every egress-capable capability; Local sessions emit no network telemetry; telemetry (when built) is off by default and reuses the `gate_cloud_egress` consent pattern.
- [ ] Security: logs, traces, crash captures, and approval audit entries redact secret-shaped values and never record raw prompt/file content on Local sessions; approval audit stays append-only.

## Anti-patterns

- Enabling telemetry by default, or letting any observability path silently route Local session data to BYOK or Managed Cloud (violates the trust boundary in `apps/cli/src/agent/mod.rs`).
- Logging or tracing raw prompts, file contents, or unredacted tool arguments.
- A `--debug`/`--verbose` flag that also loosens approvals, sandbox, or routing.
- Auto-uploading crash reports, or uploading any crash/telemetry payload without explicit consent.
- Hardcoding pricing or model IDs into metrics instead of reading `apps/cli/src/model_catalog.rs` / `packages/contracts/types/src/models.json`.
- Claiming a telemetry/crash-report backend exists (none does), inventing env vars or routes, referencing Supabase, or citing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups.
- Using `agiworkforce <cmd>` in examples — the user-facing binary is `agi`.
