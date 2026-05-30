# Rust ORPHAN Crates — Inventory Audit (deletion candidates)

Slice: `crates/agiworkforce-app-server`, `crates/agiworkforce-apply-patch`, `crates/agiworkforce-plugin-runtime`, `crates/agiworkforce-task-runtime`
Mode: RECON, read-only. Date: 2026-05-29. Auditor scope: these four crates + cross-reference to their shipped CLI shadows.

## TL;DR verdicts

| Crate | LOC (src) | Wired? | Shadowed by shipped copy? | Recommendation | Why |
|-------|-----------|--------|----------------------------|----------------|-----|
| `agiworkforce-app-server` | 504 | No | Yes — `apps/cli/src/app_server.rs` (wired, **inferior**) | **Keep / do not delete blindly** | Orphan is the *correct* copy: it implements `tools/call` via a `ToolDispatch` trait; the shipped CLI copy returns `-32601` for any tool call. Deleting it removes the fix vehicle for a real shipped bug. |
| `agiworkforce-apply-patch` | 640 | No | Yes — `apps/cli/src/apply_patch.rs` (wired) + `packages/apply-patch` (TS) | **Safe to delete** | Genuine triplicate. Shipped CLI copy is wired AND already has an equivalent path-traversal guard + 7 traversal tests. No shipped gap depends on the orphan. |
| `agiworkforce-plugin-runtime` | 266 | No | Yes — `apps/cli/src/features/plugins/plugins.rs` (wired) | **Safe to delete** | Near-identical duplicate of types already defined and used in the wired CLI module. Nothing imports the crate. |
| `agiworkforce-task-runtime` | 507 | No | Partial — no full shipped equivalent located | **Keep (intended near-future)** | `PLAN.md:148` (root, non-archived) lists it backing file-creation / compute-sessions, status "Partial." Strongest forward-looking signal. Not yet wired. |

All four `cargo check --workspace` clean (per anchor docs / STATE.md). None is in the dependency closure of any shipping binary (`apps/cli` bins `agi`/`agiworkforce`, `apps/desktop/src-tauri` `agiworkforce-desktop`).

## IMPORTANT correction to prior audit (stale claim)

`docs-hardening/REPO_EXPLORATION.md` (P2, ~L440) and STATE.md state the four crates are "declared as path deps in `apps/cli/Cargo.toml` but never referenced." **This is now stale.** The current `apps/cli/Cargo.toml [dependencies]` block declares only four agiworkforce path deps: `agiworkforce-protocol`, `agiworkforce-sandbox-policy`, `agiworkforce-command-registry`, `agiworkforce-utils-image`. The four orphan crates are **not** declared as deps anywhere. They are pure `crates/*`-glob workspace members (root `Cargo.toml` `members = [..., "crates/*"]`), pulled into `cargo check --workspace` only by the glob. This downgrades the "four dead CLI deps" P2 to a **P3 workspace-glob cleanup**.

The only repo-internal reference to any of these crate *names* in CLI source is a cosmetic string literal: `apps/cli/src/app_server.rs:91` sets `serverInfo.name = "agiworkforce-app-server"` — not an import.

---

## Purpose & Architecture (per crate)

### agiworkforce-app-server (`crates/agiworkforce-app-server/src/lib.rs`, 504 LOC)
JSON-RPC server exposing a tool catalog + `tools/call` dispatch over stdio and WebSocket (axum 0.8 `ws`). Tool execution is injected via a `pub trait ToolDispatch` (L38-49), decoupling the crate from any concrete tool set. Methods: `initialize`, `tools/list`, `tools/call`, `shutdown` (Processor at L132-191). Second entry `run_mcp_server` (L285) speaks MCP wire protocol with a single `agiworkforce_exec` tool. Doc comment (L5-7) claims "the cli wires its own `CliToolDispatch` at construction" — **no `CliToolDispatch` implementor exists anywhere in the repo** (hallucinated/aspirational claim).

### agiworkforce-apply-patch (`src/lib.rs` 357 LOC + `src/parser.rs` 283 LOC)
`*** Begin Patch` / `*** End Patch` format parser (`parser.rs`) + atomic-ish fs applier (`lib.rs`). Supports Add/Delete/Update + Move. `resolve()` (lib.rs:119-176) is a hardened path-traversal guard tagged `// AUDIT-FIX: C-4`: rejects absolute paths (L121), `ParentDir`/`RootDir`/`Prefix` components (L127-137), and verifies the canonical candidate `starts_with(canonical_root)` (L146). Well-engineered. Decoupled from the rest of the CLI.

### agiworkforce-plugin-runtime (`src/lib.rs`, 266 LOC)
Plugin-manifest schema + discovery across 5 formats (`.agiworkforce-plugin`, `.claude-plugin`, `.codex-plugin`, `.app.json`, `.mcp.json`). Defines `ManifestFormat`, `MANIFEST_PATHS`, `McpServerConfig`, `PluginManifest`, `load_manifest_for`. Pure schema/IO; no process spawn, no network.

### agiworkforce-task-runtime (`src/lib.rs`, 507 LOC)
In-memory `TaskRegistry` (`Arc<RwLock<HashMap<TaskId, Task>>>`) with file-backed output at `~/.agiworkforce/tasks/<id>.out`, a `valid_transition` state machine (L61-71), and a `StallWatchdog` (L215-276) that marks a task Failed if its output file stops growing within a timeout. 7 `TaskKind` variants incl. `Dream`, `MonitorMcp`. Registry is purely in-memory: task metadata is lost on process restart; only the `.out` file persists.

---

## Alive vs Dead

All four are **DEAD** with respect to shipping-binary reachability — none is in the import closure of `agi`, `agiworkforce`, or `agiworkforce-desktop`. Evidence:
- `apps/cli/Cargo.toml` `[dependencies]`: no app-server / apply-patch / plugin-runtime / task-runtime.
- `apps/desktop/src-tauri/Cargo.toml` `[dependencies]`: only `agiworkforce-sandbox-policy`.
- `grep` of `apps/cli/src/` for `agiworkforce_{app_server,apply_patch,plugin_runtime,task_runtime}` / dash variants: zero `use`/path imports (only the cosmetic string at `app_server.rs:91`).

They remain in the workspace solely via the `crates/*` glob in root `Cargo.toml`. Each has a live, wired shadow in the CLI (see cross-references) except task-runtime, which has no full shipped equivalent yet.

---

## Test Coverage

Coverage is good *inside the crates* (the original reverse-engineering campaign wrote them test-first), but **these tests do not run in CI**: the Rust test jobs use `cargo test -p agiworkforce-desktop -p agiworkforce-cli --lib` (`.github/workflows/ci.yml:215`, `:472`), i.e. only the two shipping crates' lib tests. `cargo check --workspace` (ci.yml:413/453) only *compiles* the orphans; `cargo clippy --workspace --lib` (ci.yml:417/476) lints lib code only (not `--all-targets`), so the test-code clippy nits noted in STATE.md don't gate CI.

| Crate | Unit tests (src `#[cfg(test)]`) | Integration tests (`tests/`) |
|-------|---------------------------------|------------------------------|
| app-server | 7 (`lib.rs:357-504`) | `tests/jsonrpc.rs` (126 LOC), full lifecycle via public `ToolDispatch` |
| apply-patch | 2 (`lib.rs:342-356`) | `tests/scenarios.rs` (144 LOC) drives 22 fixture scenarios in `tests/fixtures/scenarios/` |
| plugin-runtime | 7 (`lib.rs:177-266`) | `tests/manifest_matrix.rs` (124 LOC), 5 manifest fixtures |
| task-runtime | ~24 (`lib.rs:289-507`) | `tests/lifecycle.rs` (326 LOC) |

Consequence: a regression in any orphan crate would pass CI silently. Net for deletion calculus: removing apply-patch/plugin-runtime drops dead tests that gate nothing.

---

## Panic / Crash sites

**Zero panic/unwrap/expect/todo!/unimplemented! on any user-reachable path.** Every `.unwrap()`/`.expect()` is inside a `#[cfg(test)]` module:
- app-server: 7 `.expect(...)` — all in `lib.rs:412-503` tests.
- plugin-runtime: 4 `.expect(...)` — all in `lib.rs:211-265` tests.
- task-runtime: ~50 `.unwrap()` — all in `lib.rs:289-507` tests.
- apply-patch: none in src at all (uses `Result` end-to-end).

Crash potential is moot regardless: none of the code is reachable from a shipping binary.

---

## TODO / FIXME / HACK

**Zero** across all four crates (src and tests; fixtures excluded). Clean.

---

## Security-sensitive code

Minimal, and all unreachable at runtime:
- `agiworkforce-app-server/src/lib.rs:220` — `tokio::net::TcpListener::bind(addr)`. Binds a WebSocket server. Reachable only via `AppServerTransport::WebSocket`, which the orphan crate never gets called with (the crate is unwired). The *shipped* WS server in `apps/cli/src/app_server.rs` is the one that actually binds; the orphan's bind is dead. No auth on the WS endpoint in either copy — noted as a property of the shipped server, not this crate.
- `agiworkforce-task-runtime/src/lib.rs:206` — `std::env::var("HOME")` with safe `.` fallback (`dirs_home`). Benign.
- `agiworkforce-apply-patch/src/lib.rs:119-176` — `resolve()` is *defensive* security code (the C-4 traversal guard). Positive, not a concern.

No secret/token/api_key handling, no process spawn, no `unsafe`, no eval. (app-server denies `unsafe_code` in its own lint table; the others inherit workspace lints.)

---

## AI-slop / duplication

The dominant slop signature here is **duplication-with-divergence** — three of the four crates are shadowed by wired CLI copies:

1. **app-server vs `apps/cli/src/app_server.rs`** — the dangerous one. The orphan crate implements `tools/call` (Processor `lib.rs:157-182`) via `ToolDispatch`. The shipped CLI copy's `process()` (`app_server.rs:93-98`) has only `tools/list` then a catch-all `-32601 "Method not found"` — **no `tools/call` arm**. So the source-of-truth is inverted: the dead crate is correct, the live binary is broken.
2. **plugin-runtime vs `apps/cli/src/features/plugins/plugins.rs`** — near-identical re-definition of `ManifestFormat` (CLI L29), `MANIFEST_PATHS` (L69), `McpServerConfig` (L116), `PluginManifest` (L134), `load_manifest_for` (L698). Two copies to maintain.
3. **apply-patch vs `apps/cli/src/apply_patch.rs` vs `packages/apply-patch`** — triplicate. `packages/apply-patch/README.md:60` explicitly says "Rust patch behavior may also exist in `crates/agiworkforce-apply-patch`; keep semantics aligned" — i.e. the divergence is known and unmanaged. Note the implementations diverge in *strategy*: the orphan parses+applies the patch itself; the shipped CLI copy validates targets then shells out to `git apply` (`apply_git_patch`, `apply_patch.rs:119`).

Hallucinated API: app-server doc comment (`lib.rs:5-7`) references a `CliToolDispatch` "the cli wires at construction" that does not exist. Stale workspace comment: root `Cargo.toml` still says "44 crates ... may be pruned."

---

## Broken / half-built features (with cross-reference evidence)

These are shipped-code consequences of the orphan/duplication situation. They are **outside this slice's files** but are the reason the per-crate verdicts differ. Reported as cross-references; owners are the CLI slice.

- **CROSS-REF P1/P2: shipped `agi app-server` / `agi mcp-server` advertise tools they cannot execute.** `apps/cli/src/app_server.rs:93-98` returns `tools/list` then `-32601` for everything else — no `tools/call`. Both are real clap subcommands (`apps/cli/src/lib.rs:541` McpServer, `:543` AppServer; dispatched `:1268`/`:1296`). Any client invoking an advertised tool gets Method-not-found. Severity hinges on whether these subcommands are advertised as shipped capabilities (parity matrix) — P1 if yes, P2 if internal/experimental. The orphan `agiworkforce-app-server` crate is the ready-made fix (wire it with a real `CliToolDispatch`). **Deleting the orphan removes that fix vehicle.**
- **NOT a vuln (verified):** apply-patch path traversal. The *shipped* wired copy `apps/cli/src/apply_patch.rs` has `validate_patch_targets` (L36) with absolute-path rejection (L69), parent-depth tracking (L80), RootDir/Prefix rejection (L83), and canonical `starts_with(cwd)` check (L106), plus 7 traversal tests (`rejects_absolute_path_*`, `rejects_parent_traversal_beyond_root`, etc., L235-284). So the C-4 hardening exists in shipped code independently of the orphan crate → orphan apply-patch is safe to delete.

---

## Severity-ranked issues

### P1 (only as a cross-ref; in-slice the orphans contribute no P0/P1)
- **P1 (cross-ref, CLI-owned): `agi app-server`/`mcp-server` advertise tools with no `tools/call`.** `apps/cli/src/app_server.rs:93-98`, `apps/cli/src/lib.rs:1268`/`1296`. Fix hint: add a `tools/call` arm OR delete the shipped copy and wire `agiworkforce-app-server` with a concrete `CliToolDispatch`. *Do not delete the app-server crate without simultaneously fixing the shipped copy.* (Severity P1 if these subcommands are advertised capabilities; downgrade to P2 if internal.)

### P2
- **P2: Source-of-truth inversion — dead app-server crate is correct, live CLI copy is broken.** `crates/agiworkforce-app-server/src/lib.rs:157` (has `tools/call`) vs `apps/cli/src/app_server.rs:98` (`-32601`). A future engineer editing the obvious owner (the crate) sees no effect. Maintenance trap. Fix: pick one source of truth (see Open Questions); the clean path is to wire the crate and delete the CLI inline copy.
- **P2: plugin-runtime is a maintained duplicate of wired CLI types.** `crates/agiworkforce-plugin-runtime/src/lib.rs` vs `apps/cli/src/features/plugins/plugins.rs:29/69/116/134/698`. Two copies drift. Fix: delete the orphan crate (CLI copy is canonical), or invert and consume the crate.
- **P2: apply-patch is a triplicate with explicitly-unmanaged semantics.** orphan crate + `apps/cli/src/apply_patch.rs` + `packages/apply-patch` (TS); `packages/apply-patch/README.md:60` admits the drift. Fix: delete the orphan Rust crate; keep CLI (wired) + TS (its own surface) aligned.

### P3
- **P3: workspace-glob orphans inflate `cargo check --workspace` build time + falsely imply wiring.** Root `Cargo.toml` `members = ["crates/*"]` compiles all four; nothing depends on them. (Downgraded from prior P2 "dead CLI deps" — they are no longer declared deps.) Fix: delete apply-patch + plugin-runtime; keep app-server (until shipped fix) + task-runtime (intended). Update the stale "44 crates" comment in root `Cargo.toml`.
- **P3: app-server doc comment references a non-existent `CliToolDispatch`.** `crates/agiworkforce-app-server/src/lib.rs:6-7`. Fix: correct the doc or implement the type.
- **P3: task-runtime `read_output` byte-seek can split a UTF-8 codepoint.** `crates/agiworkforce-task-runtime/src/lib.rs:161-178` — seeks to `file_len - max_bytes` then `read_to_string`. An offset mid-codepoint makes `read_to_string` return `Err(InvalidData)` → surfaced as `TaskError::Io` (**NOT a panic** — REPO_EXPLORATION's "can panic" headline is inaccurate; the truncation/corruption-of-first-line concern is valid). Behind an unwired crate, so impact is currently theoretical. Fix when wiring: seek to a char boundary or read bytes + `from_utf8_lossy`.
- **P3: task-runtime registry is in-memory only — metadata lost on restart.** `src/lib.rs:74-91`. Only the `.out` file persists; `Task` status/timestamps/exit_code vanish on process exit. Must be addressed before this backs any user-facing background-task surface (`PLAN.md:148`). Fix: persist registry (e.g., JSON sidecar) when wiring.

---

## Open questions / uncertainty

1. **Wire vs prune — genuinely unresolved.** Root `Cargo.toml` comment says these crates "may be pruned"; the crate doc comments say the CLI wires them (and reference a `CliToolDispatch` that doesn't exist). The two answers imply opposite fixes for the app-server `tools/call` gap. I did not resolve this; per-crate evidence drives each recommendation above. `PLAN.md:148` (task-runtime, status "Partial") is the strongest "wire" signal for one crate; the others have no live "wire" evidence.
2. **Are `agi app-server` / `agi mcp-server` advertised as shipped capabilities** (docs / parity matrix)? This decides whether the `tools/call` gap is P1 (launch-blocker) or P2 (internal). I did not audit the parity matrix in this slice.
3. I did **not** run builds, tests, or clippy (recon constraint). Test counts are read off source `#[cfg(test)]` blocks and `tests/` files, not from a green run. "Compiles clean" is taken from the anchor docs / STATE.md, not independently re-verified.
4. I did not exhaustively diff the orphan plugin-runtime vs the CLI copy line-by-line beyond confirming the same type names/paths/`load_manifest_for` exist in both; minor behavioral drift (e.g., deprecation-notice wording, `extra` flatten edge cases) is possible but not load-bearing for the delete verdict.

## Recommended action summary (recon only — DO NOT delete here)
- `agiworkforce-apply-patch` → **DELETE** (triplicate; shipped copy wired + hardened + tested).
- `agiworkforce-plugin-runtime` → **DELETE** (duplicate of wired CLI types).
- `agiworkforce-app-server` → **KEEP until shipped `tools/call` gap is fixed** (this crate is the fix vehicle); then either wire it (delete CLI inline copy) or delete it together with a CLI-side `tools/call` fix.
- `agiworkforce-task-runtime` → **KEEP** (intended near-future per `PLAN.md:148`); fix in-memory persistence + UTF-8 seek before wiring.
