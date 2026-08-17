# Runtime & Infrastructure Substrate Inventory

Scope: `crates/`, `services/`, `infrastructure/`, `apps/cli`, `scripts/`, and the
deployment/runtime substrate (vercel.json, docker-compose.yml, .github/workflows).
Read-only audit. Date: 2026-08-15.

Methodology note: this is a **static** audit (no `cargo build`/`cargo test` was
executed — the workspace is large and a full build was out of budget). All
COMPLETE/PARTIAL/etc. classifications are backed by grep/read evidence with
file:line citations; anywhere a runtime check would be needed to fully confirm
behavior, it's called out explicitly.

---

## 1. `crates/` — Rust workspace crates

Workspace root: `Cargo.toml:1-15`. Members: `apps/desktop/src-tauri`,
`apps/cli`, `crates/*`. Comment at `Cargo.toml:7-13` records that three crates
(`agiworkforce-apply-patch`, `agiworkforce-plugin-runtime`,
`agiworkforce-task-runtime`) were already removed as dead code on 2026-07-08 —
so the 12 crates below are the current, already-pruned set, not the "100+
ported codex-rs crates" that older CI comments still reference (see §5).

| Crate                              | Purpose                                                                                                                                                                                                                                                                                                                                                                                   | Depended on by                                                                                                                                                                                                                                                                                            | Verdict                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agiworkforce-agent-core`          | Shared turn-loop engine (model-stream driving, tool-call scheduling, budget guards, turn events). Host-agnostic via a `TurnHost` trait.                                                                                                                                                                                                                                                   | CLI (`apps/cli/src/agent/chat.rs:4,9`, `compaction.rs:26`, `repl/registry.rs:572`) and Desktop (`apps/desktop/src-tauri/src/sys/commands/chat/local_turn_host.rs:32`, `memory_manager.rs`, `semantic_search.rs`, `conversation_summarizer.rs`)                                                            | **COMPLETE** — real production dependent in both CLI and Desktop, not just declared.                                                                                                                                                                                                                                             |
| `agiworkforce-app-server`          | JSON-RPC stdio + WebSocket transport (`ToolDispatch` trait) plus the newer "developer session" protocol (`developer_sessions.rs`, 516 lines) driving threads/turns/streaming/approvals.                                                                                                                                                                                                   | CLI only, via `apps/cli/src/app_server.rs:16,20` and `apps/cli/src/app_server/developer_host.rs:1`. Wired to the `agi app-server` subcommand (`apps/cli/src/lib.rs:701-717`).                                                                                                                             | **COMPLETE** for CLI. Desktop does not depend on it (own IPC via Tauri commands).                                                                                                                                                                                                                                                |
| `agiworkforce-command-registry`    | Pure data types + built-in slash-command catalog (`RegistryCommand`, `CommandKind`, `CommandSource`). Has an **empty `[dependencies]` block** (`Cargo.toml:14-16`) — intentional, it's a leaf types crate.                                                                                                                                                                                | CLI: `apps/cli/src/command_registry.rs:7,251` re-exports/tests it.                                                                                                                                                                                                                                        | **COMPLETE**. Two `#[allow(dead_code)]` at `src/lib.rs:12,20` are on enum variants the crate defines but doesn't yet construct every variant of from within the crate itself (consumed via the CLI) — cosmetic, not evidence of unused code.                                                                                     |
| `agiworkforce-execpolicy`          | Starlark-based exec policy engine: prefix rules → `Allow/Prompt/Forbidden` decisions. Ships both a lib and a `agiworkforce-execpolicy` bin.                                                                                                                                                                                                                                               | CLI (`apps/cli/src/features/exec/exec_policy.rs:16`, `.../tools/bash/mod.rs:41`) and Desktop (`apps/desktop/src-tauri/src/sys/security/policy/engine.rs:333-346`, `command_validator.rs:455,581`, `exec_gate.rs:26`).                                                                                     | **COMPLETE** — real decision engine wired into both shell-execution paths.                                                                                                                                                                                                                                                       |
| `agiworkforce-licensing`           | Rust re-implementation of the TS `@agiworkforce/licensing` package's offline license/org-policy verifier (Ed25519-signed containers).                                                                                                                                                                                                                                                     | **Nobody.** `rg -n "agiworkforce_licensing"` across the whole repo outside its own crate returns zero hits; `grep -rl "agiworkforce-licensing" --include=Cargo.toml .` returns only its own manifest.                                                                                                     | **DEAD (self-documented).** Its own module doc says so explicitly: _"It is NOT wired into any app/desktop/CLI/gateway runtime"_ (`crates/agiworkforce-licensing/src/lib.rs:19-21`). This is an honest, tracked non-wiring, not a discovered bug — but it means enterprise licensing verification has zero runtime callers today. |
| `agiworkforce-llm`                 | Shared LLM provider engine: dialect request building, SSE/NDJSON stream decoding, tool-call delta assembly, provider error classification. Pinned to reqwest 0.12 to match the CLI's TLS line.                                                                                                                                                                                            | CLI (`agiworkforce-agent-core` re-exports it and the CLI uses agent-core), Desktop's `agiworkforce-agent-core` chain, and `agiworkforce-agent-core` itself depends on it directly (`crates/agiworkforce-agent-core/Cargo.toml:19`).                                                                       | **COMPLETE**.                                                                                                                                                                                                                                                                                                                    |
| `agiworkforce-mcp`                 | Full MCP client engine: JSON-RPC framing/correlation/timeouts, stdio/SSE/Streamable-HTTP transports, RFC 9728/8414/7591 OAuth (PKCE, discovery, token exchange) — `src/oauth/{flow,pkce,mod}.rs`. Ships a scripted fake stdio server binary (`mcp_sim_stdio`) for its own integration tests only (`test = false` at `Cargo.toml`'s `[[bin]]`, so it never ships in a release build).      | CLI (`apps/cli/src/mcp/mod.rs:27,30`, `elicitation.rs:10`) and Desktop (`apps/desktop/src-tauri/src/core/mcp/transport.rs:48,106,134,146-149`).                                                                                                                                                           | **COMPLETE**. Four `#[allow(dead_code)]` in `oauth/flow.rs:44,58,62,73` and two in `jsonrpc.rs:17,19` are scoped to individual struct fields, not whole modules.                                                                                                                                                                 |
| `agiworkforce-model-registry`      | Typed Rust access to the generated model registry + Auto-routing policy (`TrustMode`, `RoutingTaskType`, `resolve_auto_route`).                                                                                                                                                                                                                                                           | CLI: `apps/cli/src/model_catalog.rs:25`, `apps/cli/src/platform/runtime/session.rs:1`, `apps/cli/src/routing/classify.rs:19`, `apps/cli/src/daemon.rs`.                                                                                                                                                   | **COMPLETE**.                                                                                                                                                                                                                                                                                                                    |
| `agiworkforce-protocol`            | The largest crate: shared wire protocol types (agent events, developer-session protocol, approvals, permissions, plan tool), plus platform sandboxing primitives (`landlock`/`seccompiler` under `cfg(target_os="linux")`, `Cargo.toml:39-41`). Also owns a `ts-rs`-generated TypeScript bindings tree (`bindings/`, **279 files**) so Rust and TS share one wire-format source of truth. | `agiworkforce-execpolicy`, `agiworkforce-utils-absolute-path`, `agiworkforce-utils-image` (own deps) and is itself a dependency of `agiworkforce-app-server`, `agiworkforce-mcp`, and (indirectly) CLI/Desktop.                                                                                           | **COMPLETE**.                                                                                                                                                                                                                                                                                                                    |
| `agiworkforce-sandbox-policy`      | Shared `SandboxPolicy` enum (`ReadOnly`/`WorkspaceWrite`/`DangerFullAccess`) — pure data model, no OS calls.                                                                                                                                                                                                                                                                              | CLI (`apps/cli/src/sandbox.rs:2`) and Desktop (`apps/desktop/src-tauri/src/sys/security/sandbox_runtime.rs:2`, `sys/commands/settings.rs:143`). This is the **only** crate `apps/desktop/src-tauri` path-depends on per the workspace comment (`Cargo.toml:11`), confirmed by its own `Cargo.toml:12-18`. | **COMPLETE**.                                                                                                                                                                                                                                                                                                                    |
| `agiworkforce-utils-absolute-path` | Path normalization/absolutization utility with `ts-rs` bindings.                                                                                                                                                                                                                                                                                                                          | Used by `agiworkforce-protocol` (`Cargo.toml:14`) and `agiworkforce-execpolicy` (`Cargo.toml:14`).                                                                                                                                                                                                        | **COMPLETE** (internal utility, no direct app callers needed).                                                                                                                                                                                                                                                                   |
| `agiworkforce-utils-image`         | Image decode/resize/cache utility (jpeg/png/webp/gif via the `image` crate, LRU cache).                                                                                                                                                                                                                                                                                                   | CLI depends on it directly (`apps/cli/Cargo.toml`: `agiworkforce-utils-image`).                                                                                                                                                                                                                           | **COMPLETE**.                                                                                                                                                                                                                                                                                                                    |

### Crate-level red flags found

- `apps/cli/src/sandbox.rs:1` has a whole-file `#![allow(dead_code, unused_imports)]`, which is broader than the individual `#[allow(dead_code)]` markers seen elsewhere — worth narrowing, but the module's core types (`SandboxManager`, `SandboxType`) are demonstrably live (see §4).
- No `todo!()`, `unimplemented!()`, or `panic!("not implemented")` found anywhere under `crates/` (`rg -n "todo!\(|unimplemented!\(" crates/` returns nothing). This is a genuinely clean workspace on that axis.

---

## 2. `services/api-gateway` and `services/signaling-server`

Both read `services/AGENTS.md` (`services/AGENTS.md:9-11`): "owns API gateway,
signaling, and future managed/private compute services." Both are real Express
apps with structured logging (pino), `/health` + `/ready` endpoints, and their
own vitest suites — not stubs.

### `services/api-gateway`

- Real route surface: `agents`, `auth`, `chat`, `cloudChat`, `credits`,
  `desktop`, `deviceAuth`, `enterprise`, `llm`, `mobile`, `models`, `pair`,
  `providerStream`, `sync`, `usage`, plus an `mcp` sub-router
  (`services/api-gateway/src/app.ts:5-20,140`).
- Middleware stack is production-grade: `helmet`, CORS allowlist
  (`app.ts:49-63`), request-context/correlation IDs before all other
  middleware (`app.ts:83`), CSRF/content-type/security-header validation
  (`app.ts:129-131`), and a `managedComputeGate.ts` that implements the exact
  public-alpha kill-switch semantics AGENTS.md mandates.
- **`services/api-gateway/src/middleware/managedComputeGate.ts:1-14,96-99`**
  verified byte-for-byte against the AGENTS.md rule: managed compute is open
  by default; `AGI_MANAGED_COMPUTE_PRIVATE_BETA=0/false/off` is the only
  documented way to re-gate it (incident kill-switch), and the code comment
  cross-references the identical implementation in
  `apps/web/lib/managed-compute-gate.ts`. **COMPLETE** and correctly wired.
- Deployment: `infrastructure/api-gateway/fly.staging.toml` and
  `fly.production.toml` define Fly.io machines with `/health` and `/ready`
  checks matching the app's actual endpoints. `.github/workflows/deploy-production.yml:239-428`
  has real `deploy-gateway-staging`/`deploy-gateway-production` jobs that
  build+push the Docker image (`services/api-gateway/Dockerfile`), deploy via
  `fly deploy --config infrastructure/api-gateway/fly.*.toml`, and verify with
  `scripts/verify-gateway-deployment.mjs` (polls `/health`+`/ready`, checks
  the release SHA and `x-request-id` echoing).
- **DUPLICATION / topology risk (verified against `docs/agent-context/known-flaws.md:2475-2503`, entry `SVC-DEPLOY-TOPOLOGY-VERCEL-SINGLE`, dated 2026-07-19):**
  that entry states production runs as ONE Vercel project (`apps/web`) serving
  every live flow including mobile cloud chat, and that `services/api-gateway`
  was **NOT deployed and NOT required** — its REST routes (`chat/sync/credits/llm/usage/models`)
  **duplicate** the Next.js routes, and the only two live web references to it
  were dead code that had already been removed. The Fly.io deploy jobs and
  `infrastructure/api-gateway/fly.*.toml` files are all dated 2026-08-09 —
  i.e. **after** that known-flaws entry — so the "not deployed" half of that
  finding may now be stale (the CI/CD path to actually deploy it now exists).
  However, the **duplication** and **who actually calls it** questions are
  still open:
  - `apps/mobile/lib/constants.ts:18` defaults `EXPO_PUBLIC_GATEWAY_URL` to
    `https://api.agiworkforce.com` — but per the known-flaws entry,
    `api.agiworkforce.com` is a DNS alias for the **same Vercel/Next.js**
    deployment (host-rewritten to `/api/llm/v1/*` in `next.config.ts`), not
    the Fly-hosted Express gateway.
  - A **separate** allowlisted origin, `gateway.agiworkforce.com`, does exist
    and is treated as the real Express gateway by
    `apps/extension/src/background/policy.ts:642-649` (`GATEWAY_URL_ALLOWLIST_EXACT`)
    and `apps/desktop` egress-guard logic (`apps/desktop/src/__tests__/lib/egressGuard.test.ts:51`),
    for the desktop/extension "companion"/remote-control pairing feature.
  - That companion/remote-control feature is currently **flag-gated off**
    per the same known-flaws entry (`companion:false`).
  - **Net verdict: PARTIAL / NEEDS_VALIDATION.** The service is real, tested,
    and now has a genuine CI/CD deploy path, but (a) its general REST surface
    still duplicates `apps/web`'s Next.js API routes and no current evidence
    shows a production client calling `api.agiworkforce.com` expecting the
    Express gateway rather than the Next.js rewrite, and (b) its one
    distinctive live purpose (WebSocket + QR pairing for desktop/extension
    companion mode) sits behind a currently-disabled feature flag. The
    known-flaws entry records this as a "PENDING founder decision (blocked,
    roadmap): retire the whole api-gateway... vs. keep only its WebSocket +
    QR-pairing core" — i.e., this is a tracked, not newly-discovered, gap.

### `services/signaling-server`

- WebSocket relay with real Prometheus-format metrics
  (`services/signaling-server/src/metrics.ts:1-13` — connection/session/message/error/pairing counters and uptime/memory gauges), an `adminAuth` middleware, rate limiting, and security headers.
- Has its own `fly.toml` and `railway.toml` (dual-target deploy) plus a
  dedicated `.github/workflows/deploy-signaling-server.yml` gated on CI
  success and file-path triggers (`deploy-signaling-server.yml:1-20`).
- `apps/desktop/electron/config.ts:69` and `apps/desktop/vite.config.ts:164`
  both hard-code its live domain, `agiworkforce-signaling.fly.dev`, into their
  CSP `connect-src`, confirming it is a real, addressed dependency of the
  Desktop app (used for WebRTC signaling), not a dead deploy target.
- Per the same known-flaws entry, its purpose (remote-control/companion) is
  currently flag-gated off in production — so the service is deployed and
  reachable (**COMPLETE** as infra) but its feature surface is **HIDDEN**
  behind a disabled flag at the product layer.

---

## 3. `infrastructure/`

### `infrastructure/api-gateway/`

Contains only `fly.staging.toml` and `fly.production.toml` — Fly.io machine
configs for the api-gateway service (see §2). No app code here; it's purely
deploy config, consumed by `deploy-production.yml`.

### `infrastructure/sandbox/` — the "artifact renderer," not a code-execution sandbox

- `infrastructure/sandbox/index.html` (477 lines) is a **single static HTML
  file, no build step** (`package.json`: `"build": "echo 'no build — static HTML'"`).
  It is deployed to `sandbox.agiworkforce.com` via its own `vercel.json`.
- **What it actually is:** a cross-origin `postMessage` renderer for
  LLM-**generated display artifacts** (HTML/React/SVG/Mermaid/Markdown/text) —
  the same code embeds into an iframe both on the web (separate origin) and
  in Desktop (served from a `tauri://`/`artifact://` scheme, per the comment
  at `index.html:8-16`, cross-referencing `apps/desktop/src-tauri/src/ui/artifact_sandbox.rs`).
- **Isolation model, concretely:**
  - CSP: `connect-src 'none'` (blocks all network exfiltration from the
    rendered artifact), `default-src 'none'`, `frame-src 'self'` only for a
    same-origin `srcdoc` iframe (`index.html:50-63`, `vercel.json` mirrors
    the same header at the HTTP layer for defense-in-depth).
  - HTML artifacts render inside a **nested `srcdoc` iframe**, not
    `innerHTML` — chosen deliberately (`index.html:234-255`) so the artifact
    behaves like a real document load (DOMContentLoaded fires, viewport units
    resolve correctly) while still inheriting the parent CSP.
  - SVG artifacts are sanitized with **DOMPurify**, loaded from jsDelivr with
    a pinned version + Subresource Integrity hash (`index.html:129-140`), not
    a hand-rolled regex sanitizer (the file's comment explicitly notes a
    prior regex-based sanitizer was replaced for being bypassable,
    `index.html:354-361`).
  - React artifacts are transpiled **client-side via Babel standalone** and
    executed directly (`renderReact`, `index.html:314-348`) — this is NOT
    sandboxed beyond the iframe/CSP boundary; a malicious React artifact can
    still do anything JS running in that origin can do (DOM manipulation,
    `fetch` is blocked by CSP but e.g. `<img src>` beaconing is not).
  - Parent-origin allowlist (`index.html:156-188`) gates which parent windows
    can send `render` messages at all.

**Verdict: this is a real, carefully-built _display_ sandbox (cross-origin +
CSP + DOMPurify), not OS-level code-execution isolation.** It never executes
shell commands, never touches a filesystem, and has no server-side component
that runs arbitrary code — it only renders markup/SVG/a client-side React
tree inside a browser security boundary. It should **not** be conflated with
"the code sandbox" in product messaging. The actual arbitrary-code-execution
sandbox for the product is `apps/web/lib/e2b/` (E2B Code Interpreter — real,
gated, fail-closed; see §6) and the CLI/Desktop's OS-level command sandboxing
(`agiworkforce-execpolicy` + `apps/cli/src/sandbox.rs`; see §4), both outside
`infrastructure/`.

---

## 4. `apps/cli` — the "developer engine"

`apps/cli/AGENTS.md:9-11` states: "owns the terminal coding-agent surface and
reusable developer-engine behavior that has not yet moved into `crates/`" —
this is an accurate, self-aware description; the crate list in §1 shows the
convergence is real and ongoing (agent-core, llm, mcp, protocol,
sandbox-policy, execpolicy, command-registry, model-registry, app-server,
utils-image all already extracted and shared with Desktop where applicable).

### Binaries

Two bins from one lib crate (`apps/cli/Cargo.toml`: `[[bin]] name = "agi"`,
`[[bin]] name = "agiworkforce"` at `src/bin/agiworkforce.rs`) — `agi` is the
default-run, user-facing binary; `agiworkforce` remains only as a
compatibility alias, matching the AGENTS.md non-negotiable
("`agiworkforce` remains only as a compatibility alias or internal
repo/package/crate identifier," root `AGENTS.md:92`).

### Command surface (from `apps/cli/src/lib.rs:643-816`, `enum Command`)

`exec` (alias `e`), `review`, `apply` (alias `a`), `sandbox`, `mcp-server`,
`completion`, `app-server`, `resume`, `fork`, `session`, `models`, `plugin`,
`features`, `approvals`, `execpolicy`, `ecosystem`, `migrate`, `history`,
`sync`, `login`, `logout`, `auth-status`, `doctor`, `marketplace` (truncated —
more subcommands exist further in the enum, e.g. daemon-related). This is a
large, genuinely implemented command surface, not a facade — every module
listed under `apps/cli/src/` (memory, skills, subagents v1/v2, teams, MCP,
routing, daemon, cost ledger, provenance, review, sync, voice, TUI) has
matching non-trivial `.rs` files (multiple 500–1400+ line modules).

**One notable self-documented stub, stated honestly in its own `--help`
text:** `Command::McpServer` (`apps/cli/src/lib.rs:684-692`) — "Run as MCP
server (stdio). Exposes no tools yet — see `agi app-server`," with a comment
explaining the handler answers `initialize`/`tools/list` but deliberately
advertises an **empty** tool list because one-shot agent exec over stdio MCP
needs session/approval/event plumbing that doesn't exist for that path yet.
**Classification: PARTIAL, but honestly labeled** — not a hidden gap.

### CLI sandboxing (`apps/cli/src/sandbox.rs`, 935 lines) — real, with one honest platform gap

- **macOS:** wraps commands with `sandbox-exec -p <profile>`
  (`apps/cli/src/platform/policy/macos_sandbox.rs:104-131`), builds a real
  Seatbelt SBPL profile, with a documented CVE-class fix for SBPL string
  injection via workspace paths (`sandbox.rs:157-222`,
  `validate_and_escape_seatbelt_path`). Real unit tests assert profile
  content per preset (`macos_sandbox.rs:145-210`).
- **Linux:** `SandboxType::detect()` (`sandbox.rs:20-34`) only checks for the
  external `bwrap` (bubblewrap) binary on PATH — if absent, `sandbox_type`
  falls to `None`. A **second**, separate seccomp-BPF implementation exists
  (`apps/cli/src/platform/policy/linux_sandbox.rs`, using the `seccompiler`
  crate) but is gated behind a Cargo feature, `linux-seccomp`, which is **not
  in the default feature set** (`apps/cli/Cargo.toml`: `default = []`) and is
  **not passed** by the release build
  (`.github/workflows/release-cli.yml:191`: `cargo build --release --target
${{ matrix.target }} -p agiworkforce-cli`, no `--features`). So the shipped
  Linux binary relies entirely on an externally-installed `bwrap`; the
  in-process seccomp path is compiled out of the artifact users actually
  download.
- **Fail-closed, not fail-open, when unavailable:**
  `SandboxManager::for_command_execution` (`sandbox.rs:104-116`) explicitly
  `bail!`s with "sandbox not available on this platform or host" if
  `sandbox_type == None`, and the bash tool (`apps/cli/src/features/exec/tools/bash/mod.rs:172-211`)
  surfaces that as a hard tool failure ("Sandbox unavailable...") rather than
  silently running unsandboxed — the only true bypass is the explicit
  `--no-sandbox` / `AGIWORKFORCE_NO_SANDBOX` opt-out (`sandbox.rs:83-93`,
  which itself prints a yellow warning).
- **Windows:** `apps/cli/src/platform/policy/windows_sandbox.rs:79-91` — its
  `install_filter` **explicitly returns an error even when its feature flag
  is enabled**: `"install_filter is not yet implemented even with the
feature flag; tracking issue: AppContainer integration is a v1.8 work
item"`. This is a real, currently-shipping gap (Windows CLI users get no OS
  sandbox at all — matches `apps/cli/Cargo.toml`'s own comment describing
  `windows-appcontainer` as a "stub feature gate"). **Classification: MISSING
  (self-documented, tracked as v1.8 work), fails closed rather than silently
  unsandboxed** — i.e., honestly reported by the code, not a hidden defect.

### Daemon (`apps/cli/src/daemon.rs`, 1437 lines)

Real persistent event listener: cron schedules (via the `cron` crate),
webhook HTTP endpoints (axum), and filesystem watchers, each spawning a
non-interactive `AgentSession` with a concurrency cap (`max_parallel`,
default 4) and results logged to `~/.agiworkforce/daemon-logs/`
(`daemon.rs:1-8`). Started via `agi --daemon` / `agi daemon`. **COMPLETE**,
non-trivial implementation — not a stub despite being easy to assume so from
the name alone.

---

## 5. `scripts/` and the CI/deploy substrate

`scripts/` (118 files) is overwhelmingly **guardrail/check scripts**
(`check-*.mjs`/`.sh`/`.py`, ~70 of the 118 files) run by pre-commit/pre-push
hooks and CI — not runtime infra in the traditional sense, but they _are_ the
deployment substrate's gatekeeping layer. Representative ones actually
exercised by CI/hooks: `production-deploy-scope.mjs` (used by both
`ci.yml:60-70` and `deploy-production.yml` to select which surfaces changed),
`verify-gateway-deployment.mjs` (post-deploy health probe for the Fly.io
gateway, §2), `verify-deployment.mjs`, `check-no-hardcoded-model-ids.mjs`,
`check-secrets.mjs`, `check-hooks.mjs`. Also present: `install.sh` (curl-pipe
installer for the CLI, requires `cosign` Sigstore verification of the release
signature — real supply-chain hardening, `install.sh:1-11`), `release.sh`
(desktop release tagging — delegates all signing/artifact work to GitHub
Actions), `publish-cli.sh`, `update-homebrew-tap.sh`.

### CI coverage of `crates/` — a real gap

`.github/workflows/ci.yml`'s main `check` job runs, for native code:

```
xvfb-run --auto-servernum cargo test -p agiworkforce-desktop --lib
xvfb-run --auto-servernum cargo test -p agiworkforce-cli
```

(`ci.yml:432-433`) — scoped **only** to the two shipping binary crates' own
unit tests, explicitly not `--workspace`. The step's own comment
(`ci.yml:396-403`) says: _"The 100+ ported codex-rs crates under `crates/_`have their own pre-existing test regressions... unrelated to whether the
desktop + cli binaries work. Track those separately under FIX-021's TUI
defork plan."* This comment is **stale relative to the current repo state**:`crates/`now has 12 crates, not "100+," per the 2026-07-08 pruning noted in`Cargo.toml:7-13`— this is old-state documentation that was not updated when
the crates were consolidated.`FIX-021`does not appear anywhere in`docs/agent-context/known-flaws.md`, `PLAN.md`, or `CHANGELOG.md`, so its
current status is unverifiable from the repo.

The only places a wider Rust check runs are:

- `macos-smoke` (`ci.yml:888-921`) and `clippy-all-features`
  (`ci.yml:809-882`): both run `cargo check --workspace` (from
  `apps/desktop/src-tauri`, which Cargo resolves to the **root** workspace,
  so this does cover `crates/*`) — but `cargo check` only **compiles**, it
  does not run any test.
- `windows-smoke` (`ci.yml:929-981`): runs `cargo test --workspace --lib -- --skip landlock --skip seccomp --skip linux_sandbox` — but `--lib` restricts
  execution to each crate's in-source `#[cfg(test)]` unit tests; it does
  **not** run the separate integration-test binaries under
  `crates/*/tests/*.rs` (e.g. `agiworkforce-mcp/tests/`, `agiworkforce-protocol/tests/`,
  `agiworkforce-llm/tests/`, `agiworkforce-agent-core/tests/`,
  `agiworkforce-app-server/tests/`, `agiworkforce-command-registry/tests/`,
  `agiworkforce-model-registry/tests/` — all of which exist, per the `ls`
  inventory in §1's directory listing).

**Net finding: no CI job in this repo runs the full `cargo test --workspace`
(all targets, all crates) on any platform.** The crates' own integration test
suites are compiled-checked (via `cargo check --workspace`) but their pass/fail
status is not gated in CI as far as this audit could determine from the
workflow files. This should be verified/tracked, since `crates/agiworkforce-mcp`,
`agiworkforce-protocol`, and `agiworkforce-llm` in particular carry
security-relevant logic (OAuth PKCE, SSE stream decoding, JSON-RPC framing).

### Deployment: what actually deploys

- **`apps/web`** (Next.js) → Vercel, via `vercel.json` (root). Notably,
  `vercel.json:8-12` sets `"git": {"deploymentEnabled": {"main": false}}` —
  **Vercel's own git integration does not auto-deploy `main`**; production
  deploys are driven exclusively through `.github/workflows/deploy-production.yml`
  (gated on CI success + per-surface diff scoping). All 9 Vercel cron jobs
  (`vercel.json:14-46`) are once-daily (`0 0 * * *` style, single-value
  fields) — consistent with the Hobby-plan daily-cron constraint noted in
  project memory; none are sub-daily.
- **`services/api-gateway`** → Fly.io (staging + production), via
  `deploy-production.yml` (§2).
- **`services/signaling-server`** → Fly.io and/or Railway, via
  `.github/workflows/deploy-signaling-server.yml` (§2).
- **Desktop / CLI / mobile / extensions** each have their own dedicated
  release workflows (`release-desktop.yml`, `release-desktop-cloud.yml`,
  `release-cli.yml`, `release-mobile.yml`, `release-chrome-extension.yml`,
  `release-vscode-extension.yml`, `build-windows-release.yml`) — not reviewed
  line-by-line here (outside this agent's primary scope) but confirmed to
  exist and be distinct from `ci.yml`.
- **Local dev only:** root `docker-compose.yml` — Postgres 16 + pgAdmin,
  explicitly documented as mirroring the production Neon schema for local
  development; not a production deployment artifact.

### Root-level stray files — verified clean, not a git hygiene problem

The repo root has numerous `.png` screenshots (`banner-320.png`,
`sidepanel-header-overlap.png`, `pricing-individual.png`, etc.), `tmp/`,
`target/`, `.env.local`, `.env.local.bak*` present **on disk**. All are
confirmed **not tracked in git**: `git ls-files | grep '\.png$'` returns only
legitimate app icon assets under `apps/desktop/...`; `git check-ignore -v`
confirms `target`, `tmp`, `.env.local`, and `banner-320.png` are all
gitignore-matched (`.gitignore:69,145,199,268`). `git status --porcelain`
shows a clean tree (only this audit's own output directory is untracked).
**No stray build artifact or screenshot is actually committed to the
repository** — this is local working-tree clutter, not a repo defect.

---

## 6. Execution runtimes — code sandbox, browser sandbox, computer-use (searched repo-wide per instructions)

These implementations live mostly outside this agent's primary scope
(`apps/web`, `apps/desktop`) but are reported here since the task explicitly
asked for a repo-wide sweep of execution runtimes.

- **Code-execution sandbox — REAL, `apps/web/lib/e2b/`:** `runtime.ts` (734
  lines) is described in its own header comment as "the live
  `@e2b/code-interpreter` binding... Gated + fail-closed: returns null unless
  E2B is configured... A failure at any step... fails CLOSED — the router
  surfaces an explicit error to the model, never a silent no-op and never a
  provider-native fallback" (`apps/web/lib/e2b/runtime.ts:1-15`). Includes
  session persistence via Redis (`session-store.ts`), plan-based
  sandbox/TTL limits (`getPlanMaxSandboxes`, `getPlanSandboxTtlMs`), and
  compute metering (`compute-metering.ts`). This is the actual arbitrary
  code-execution sandbox for the product — genuinely gated on a real SDK, not
  a mock.
- **Computer-use runtime — REAL, Desktop only, `apps/desktop/src-tauri/src/automation/computer_use/`:**
  `action_executor.rs` (378 lines) executes `ComputerUseAction` variants via
  real OS input simulation (`enigo`/`rdev` per `apps/desktop/src-tauri/Cargo.toml`)
  and real screen capture (`xcap`), with HiDPI coordinate translation. Not a
  stub. (Full audit of this subsystem's approval/consent gating is out of
  this agent's scope — flagged for the Desktop-scoped audit.)
- **Browser sandbox / artifact renderer:** see §3 —
  `infrastructure/sandbox/index.html` is real but is a _display_ sandbox
  (cross-origin iframe + CSP + DOMPurify), not a code-execution or
  browser-automation runtime. There is no evidence in this scope of a
  separate "browser sandbox" runtime (e.g., a headless-Chrome-in-the-loop
  tool) inside `crates/`, `services/`, or `infrastructure/`; if one exists it
  would be under `apps/web` or `apps/desktop` (out of this scope; not found
  in `packages/` search either during this pass).
- **CLI/Desktop shell-command sandboxing:** covered in §4 (real on
  macOS/Linux-with-bwrap, fail-closed elsewhere, explicitly unimplemented on
  Windows).

---

## 7. Observability: telemetry, logging, error reporting, audit logs, feature flags

Within this scope (crates/services/infra/cli/scripts):

- **Structured logging:** real in both TS services — pino, JSON in
  production, pretty-printed in dev (`services/api-gateway/src/lib/logger.ts:1-24`,
  `services/signaling-server/src/logger.ts`). Rust side uses the `tracing`
  crate throughout `crates/agiworkforce-llm`, `agiworkforce-mcp`,
  `agiworkforce-protocol` (all declare `tracing` as a dependency), and
  Desktop wires `tracing-subscriber` with a JSON feature + `tracing-appender`
  (`apps/desktop/src-tauri/Cargo.toml`: `tracing-subscriber = {..., features=["env-filter","json"]}`, `tracing-appender = "0.2"`).
- **Metrics:** real Prometheus-format counters/gauges in
  `services/signaling-server/src/metrics.ts` (connections, sessions,
  messages by type, errors by type, pairing success/failure, uptime, memory)
  — exposed at `/metrics` per its own header comment. `services/api-gateway`
  has no equivalent `/metrics` endpoint in this scope's grep — only
  `/health`/`/ready`; this is an asymmetry between the two services worth
  noting (gateway has less runtime visibility than signaling-server).
- **Error reporting / APM:** **no Sentry (or equivalent) integration found**
  in either `services/api-gateway/package.json` or
  `services/signaling-server/package.json` (`grep -rn "sentry"` on both
  returns nothing). Errors are logged via pino (`logger.warn`/`logger.fatal`)
  but not forwarded to an external error-tracking service from these two
  backend services. (Whether `apps/web`/`apps/desktop` have Sentry is out of
  this scope, and their AGENTS.md-adjacent docs suggest they might — this is
  called out as a services-tier-specific gap, not a repo-wide one.)
- **Audit logs:** `apps/cli/src/approval_audit.rs` exists (CLI approval
  decision auditing) — real file, not reviewed line-by-line (secondary to
  this pass's budget) but its presence + the `provenance.rs` module suggest a
  genuine audit trail for agent actions at the CLI layer.
  `services/api-gateway` has `services/approvalPolicy.ts` for a
  server-side equivalent.
- **Feature flags:** the one flag with product-wide consequences in this
  scope, `AGI_MANAGED_COMPUTE_PRIVATE_BETA`, is correctly and identically
  implemented in the gateway (`managedComputeGate.ts`, §2) and cross-referenced
  against the web implementation. No other ad hoc feature-flag system was
  found inside `crates/`/`services/`/`infrastructure/`/`apps/cli`/`scripts/`
  themselves (flag systems for the client apps, e.g. `apps/mobile/lib/v1FeatureFlags.ts`,
  are out of this scope).

---

## Summary table

| Area                                                                                                                             | Verdict                                                                                                                      | Key evidence                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crates/agiworkforce-{agent-core,app-server,command-registry,execpolicy,llm,mcp,model-registry,protocol,sandbox-policy,utils-*}` | **COMPLETE**                                                                                                                 | Real cross-crate imports from CLI and/or Desktop production code, cited per-crate above.                                                                                                       |
| `crates/agiworkforce-licensing`                                                                                                  | **DEAD** (self-documented)                                                                                                   | Zero non-self imports repo-wide; its own doc comment says it is not wired anywhere (`src/lib.rs:19-21`).                                                                                       |
| `services/api-gateway`                                                                                                           | **PARTIAL / NEEDS_VALIDATION**                                                                                               | Real service, real Fly.io CI/CD, but REST routes duplicate `apps/web`; primary named consumer (`mobile`) likely resolves to the Next.js app, not this service, per `known-flaws.md:2475-2503`. |
| `services/signaling-server`                                                                                                      | **COMPLETE (infra) / HIDDEN (feature)**                                                                                      | Deployed, addressed by Desktop's CSP; its product feature (companion pairing) is flag-gated off.                                                                                               |
| `infrastructure/api-gateway`                                                                                                     | **COMPLETE**                                                                                                                 | Fly.io configs consumed by real CI jobs.                                                                                                                                                       |
| `infrastructure/sandbox`                                                                                                         | **COMPLETE (as a display sandbox)** — not a code-execution sandbox                                                           | Cross-origin iframe + CSP + DOMPurify, real deployed static site.                                                                                                                              |
| `apps/cli`                                                                                                                       | **COMPLETE**, one honestly-labeled PARTIAL (`mcp-server` empty tool list), one honestly-labeled MISSING (Windows OS sandbox) | Command enum, module inventory, sandbox implementation all cited above.                                                                                                                        |
| CI coverage of `crates/` integration tests                                                                                       | **GAP**                                                                                                                      | No CI job runs `cargo test --workspace` on all targets; main Linux job explicitly scopes to 2 binary crates with a stale comment about "100+" crates.                                          |
| Root stray files (pngs, tmp, target, .env.local)                                                                                 | **Not a defect**                                                                                                             | Confirmed gitignored and untracked; local clutter only.                                                                                                                                        |
| Code-execution sandbox (E2B)                                                                                                     | **COMPLETE** (outside primary scope, found via repo-wide search)                                                             | `apps/web/lib/e2b/runtime.ts` — real SDK, fail-closed, metered.                                                                                                                                |
| Computer-use runtime (Desktop)                                                                                                   | **COMPLETE** (outside primary scope)                                                                                         | `apps/desktop/src-tauri/src/automation/computer_use/action_executor.rs` — real OS input simulation.                                                                                            |
