# AGI Workforce — Definition of Done (Phase 5) — SINGLE SOURCE OF TRUTH

Status: Current
Owner: Lead engineer (autonomous)
Purpose: the machine-verifiable completion contract the /goal loop verifies against. Every gate is an exact shell command + threshold. "Done" = all of §A–§F checked AND freshly re-run with results pasted into the turn's output.
Retention: Authoritative for the mission; supersede only by an explicit decision logged in STATE.md.
Last updated: 2026-05-29
Baseline HEAD: `867db867d`

> **Calibration (do not violate — see advisor guidance + REMEDIATION_BRIEF):**
> - The reconstructed `audit.sh` is ~90% noise. Thresholds here are scoped to **user-reachable shipping paths** and **real fabricated-data in non-test render paths**, NOT raw marker counts.
> - **Keep the Rust clippy lint set exactly as the repo defines it** (curated set in `Cargo.toml`; deliberately omits `clippy::unwrap_used`/`expect_used`). Do NOT add those lints — it would make `-D warnings` unpassable. Panic-site reduction is tracked as the scoped §D metric instead.
> - "Verification must be code that runs": every P0/P1 and every security finding ships a **regression/exploit test that fails before the fix and passes after**.
> - Never check a box from build-success or memory. Re-run the gate and paste output.

---

## §A — Global gate battery (the /goal DONE condition)

Run from a clean tree; paste each command's tail + exit code. ALL must be green in the SAME turn.

- [ ] **A1 build (TS):** `pnpm build:all` → exit 0  _(baseline: ✅ PASS)_
- [ ] **A2 build (desktop):** `pnpm build:desktop` → exit 0  _(baseline: NOT YET MEASURED; runs frontend + native-messaging-host sidecar + Tauri bundle; desktop Rust pinned 1.94.0 via `rust-toolchain.toml` — ensure `rustup toolchain list` has 1.94.0)_
- [ ] **A3 tests:** `pnpm -r test` → exit 0, **zero failing tests**  _(baseline: ❌ — vscode 3 stale snapshots bail the run; web 14 / desktop 7 / mobile 2 catalog-drift fail when run individually)_
- [ ] **A4 coverage:** meets §B floor  _(baseline: not measured)_
- [ ] **A5 typecheck:** `pnpm typecheck:all` → exit 0  _(baseline: ✅ PASS)_
- [ ] **A6 lint:** `pnpm lint` → exit 0 (`--max-warnings=0`)  _(baseline: ✅ PASS)_
- [ ] **A7 lint (ext):** `pnpm lint:extension` → exit 0 (`--max-warnings=0`)  _(baseline: ✅ PASS)_
- [ ] **A8 operability:** `pnpm check:llm-operability` → exit 0 (all 18 sub-checks)  _(baseline: ✅ PASS after retention fix)_
- [ ] **A9 model catalog:** `pnpm sync:models:check` → exit 0  _(baseline: ✅ PASS)_
- [ ] **A10 rust build:** `cargo build --release --offline` → exit 0  _(baseline: ✅ PASS, 14m54s)_
- [ ] **A11 rust clippy:** `cargo clippy --workspace --offline -- -D warnings` → exit 0 (curated lint set; **do not** add unwrap/expect lints)  _(baseline: ❌ 6 desktop-lib lints — P1-CLIPPY)_
- [ ] **A12 rust tests:** `cargo test --workspace --offline` → exit 0, zero failing  _(baseline: ❌ 24 catalog-drift in apps/cli)_
- [ ] **A13 rust dep scan:** `cargo audit` → exit 0, zero unignored high/critical (ignore list in `.cargo/audit.toml`)  _(baseline: ✅ PASS)_
- [ ] **A14 JS dep scan:** `pnpm audit --audit-level=high` → zero high/critical  _(baseline: ❌ 1 high `tmp@0.2.5` dev-dep — fix via `pnpm.overrides`)_
- [ ] **A15 SAST:** `pnpm dlx semgrep --config auto --error` (or the repo's configured Semgrep baseline) → zero NEW high/critical above the documented advisory baseline  _(baseline: not measured; check `.github/workflows` semgrep config)_
- [ ] **A16 clean tree:** `git diff --check` + `git status` reviewed; no accidental artifacts.

## §B — Coverage floor (set by lead; defensible + machine-checkable)

Three-part floor (ALL apply):
- [ ] **B1 no-regression:** total passing test count per surface ≥ the baseline recorded in `reports/audit/gate-baseline/` (web 3416+, desktop 1731+, cli-rust 1471+, mobile 1105+, gateway/signaling/all packages green). New work must not delete green tests to pass.
- [ ] **B2 measured coverage:** `vitest run --coverage` per TS surface (web/desktop/mobile/extension/extension-vscode/api-gateway) reports **≥70% lines / ≥60% branches**; Rust `cargo llvm-cov --workspace` reports **≥60% lines** for `apps/cli` + `apps/desktop` libs. Where a surface is below floor at first measurement, record the measured % here and the floor for THIS mission is `max(70/60, measured-baseline)` with a tracked task to reach 70/60. _(Install `cargo-llvm-cov` if absent; if a surface lacks a coverage harness, add `--coverage` config as part of the work.)_
- [ ] **B3 diff + exploit coverage:** every file changed in the mission has ≥80% line coverage of its diff; every §D / §E item ships a test that **fails before the fix**.

## §C — Per-surface gates (exact commands)

### C-web (`apps/web`)
- [ ] `pnpm --filter ./apps/web build` exit 0
- [ ] `pnpm --filter ./apps/web typecheck` exit 0
- [ ] `pnpm --filter ./apps/web test` exit 0, zero fail
- [ ] `pnpm --filter ./apps/web exec playwright test` exit 0 (e2e smoke for chat + auth + a settings flow)
- [ ] `node scripts/check-marketing-models.mjs` (AP-03) exit 0; `check:no-hex-web` no NEW violations

### C-desktop (`apps/desktop`)
- [ ] `pnpm build:desktop` exit 0 (incl. native-host sidecar)
- [ ] `pnpm --filter ./apps/desktop typecheck` exit 0
- [ ] `pnpm --filter ./apps/desktop test` exit 0, zero fail
- [ ] `cargo test -p agiworkforce-desktop --offline` exit 0
- [ ] `cargo clippy -p agiworkforce-desktop --offline -- -D warnings` exit 0
- [ ] desktop e2e: `pnpm --filter ./apps/desktop exec playwright test` exit 0 (launch + chat smoke)

### C-mobile (`apps/mobile`)
- [ ] `pnpm --filter ./apps/mobile test` exit 0, zero fail (mock SecureStore; no `keychain offline` failure)
- [ ] `pnpm --filter ./apps/mobile exec tsc --noEmit` exit 0
- [ ] `node scripts/check-no-hex-colors-mobile.mjs` no NEW violations
- [ ] Release-config launch does not crash (P0-2 regression test green)

### C-cli (`apps/cli`)
- [ ] `cargo test -p agiworkforce-cli --offline` exit 0, zero fail
- [ ] `cargo clippy -p agiworkforce-cli --offline -- -D warnings` exit 0
- [ ] `node apps/cli/scripts/check-hook-fire-sites.mjs` exit 0 (all hook variants have fire sites)

### C-chrome (`apps/extension`)
- [ ] `pnpm --filter ./apps/extension build` exit 0
- [ ] `pnpm --filter ./apps/extension test` exit 0, zero fail
- [ ] `pnpm --filter ./apps/extension exec ...check:no-cloud-ipc` exit 0 **after the guard is fixed to recurse** (P2); `check:no-hex` 0 violations

### C-vscode (`apps/extension-vscode`)
- [ ] `pnpm --filter ./apps/extension-vscode build` exit 0
- [ ] `pnpm --filter ./apps/extension-vscode test` exit 0, zero fail (3 webview snapshots regenerated after verifying the HTML change is intended)
- [ ] `check:vscode-theme-tokens` no NEW violations

### C-services
- [ ] `pnpm --filter ./services/api-gateway build && ... test` exit 0
- [ ] `pnpm --filter ./services/signaling-server build && ... test` exit 0

## §D — Panic-site / privacy hardening (scoped metric, test-encoded)

- [ ] **D1** All ~11 desktop UTF-8 byte-slice abort sites (AUDIT P0-1) route through a char-safe truncation helper; `tool_events.rs::truncate` walks `is_char_boundary`. Regression test feeds multibyte (emoji) content to each site and asserts no panic.
- [ ] **D2** Mobile TLS-pinning (P0-2): release-config launch path does not crash; test covers the `_layout → pinning` import chain with placeholder/empty pins.
- [ ] **D3** CLI voice (P1-VOICE): `detect_backend()` honors `privacy_mode`; Local mode never selects the cloud Whisper API. Test asserts Local→no cloud egress.
- [ ] **D4** CLI advisor (P2) + `buildFallbackChain` (P1-FALLBACK): privacy-tier gate adjacent to egress; test asserts a Local source can never produce a cloud/managed target without explicit consent.
- [ ] **D5** `utils-cache` current-thread panic (P1): branch on `RuntimeFlavor::CurrentThread`; test runs the cache under a current-thread runtime without panic.
- [ ] **D6** Zero `panic!`/`.unwrap()`/`.expect()` introduced on a NEW user-reachable shipping path (scoped grep over changed files; sound invariants documented). Tracked as a count in STATE, not via global clippy.

## §E — Security tests to add (encode the exploits)

- [ ] **E1** Web auth: a test asserting representative privileged/mutating routes 401 without a session (lock in the self-gating model).
- [ ] **E2** api-gateway tenant isolation (P1-GW-RLS): test that a user cannot read another user's rows; a lint/test asserting every user-scoped query carries an ownership filter (since RLS is NOT actually enforced).
- [ ] **E3** api-gateway revocation (P1-GW-REVOKE): minted tokens carry `jti`; logout revokes; revoked token is rejected.
- [ ] **E4** Artifact CSP (P2): `ReactPreview`/`buildSandboxedHtml` emit a `connect-src` CSP; test asserts the generated doc contains the CSP and blocks arbitrary egress (or artifacts route through the cross-origin `apps/sandbox`).
- [ ] **E5** Chrome cloud-IPC guard (P2): the fixed `check-no-cloud-ipc` recurses into subdirs; test/fixture proves a planted cloud-IPC call in `features/` is caught.
- [ ] **E6** Logger redactor (P2): a redaction suite (each pattern + an "unknown-format secret" expectation).
- [ ] **E7** Model-catalog integrity: a test (per surface) that asserts every model ID referenced in code/tests exists in `models.json` (prevents future drift — the root cause of P1-CATALOG).

## §F — Product completion (parity SoT P0s; from `docs/current/source-of-truth.md` + parity matrix)

Each requires a wired end-to-end path (UI → service/runtime → result → persist where claimed) + test + (launch-critical) e2e/visual, per the matrix's Implementation-DoD.
- [ ] **F1** Desktop `cowork` + `code` modes route to real surfaces, not placeholders (SoT P0 #1). Sidebar nav has zero dead no-ops (P1-DESK-NAV).
- [ ] **F2** Desktop Settings IA = locked sections (General/Account/Privacy/Billing/Usage/Capabilities/Connectors/AGI Code/AGI in Chrome/Extensions/Developer) (SoT P0 #2; P1-DESK-SETTINGS).
- [ ] **F3** One-chat: normal chat + selected/reference files in the same conversation (SoT P0 #3).
- [ ] **F4** Local→BYOK fork end-to-end on every surface where it appears: selection, secret scan, payload preview, provider label, consent, preserved Local original (SoT P0 #4).
- [ ] **F5** Model selection reads catalog/capability metadata everywhere; zero hardcoded current-model literals in shipping code (SoT P0 #5; kills P1-CATALOG at the source).
- [ ] **F6** Memory: view/manage, reference-chat search, generate-from-history, import (SoT P0 #6); mobile memory injection is relevance-gated (P1-MOBILE-MEM).
- [ ] **F7** Connectors/apps/MCP: directory, search, OAuth/custom MCP, per-tool permissions, per-conversation load, admin controls (SoT P0 #7).
- [ ] **F8** Artifacts: create, side panel, source/preview, versions, copy/download/export, multi-select, error-fix, publish/share gating, one hardened renderer (SoT P0 #8 + E4).
- [ ] **F9** Global search across chats/projects/artifacts/files/connectors/settings (SoT P0 #9).
- [ ] **F10** Mobile first-run: download a default on-device model and complete a local chat turn offline (P1-MOBILE-FIRSTRUN).
- [ ] **F11** Web settings org/team management wired to its (existing) backend; no fake-success (P1-WEB-SETTINGS).
- [ ] **F12** Provider layer consolidated to the canonical adapter; 4 orphan adapters wired or explicitly deferred (WEB-PROVIDER-DRIFT-01 / R26-2).
- [ ] **F13** Marketing/landing/wording pass complete across web (and surface empty/loading/error states per matrix Implementation-DoD).

## §G — Dead-code / orphan resolution (prove-dead first)

- [ ] **G1** Delete `crates/agiworkforce-apply-patch` + `agiworkforce-plugin-runtime` (build-green-without + repo ref-search clean); update stale root `Cargo.toml` "44 crates" comment.
- [ ] **G2** Wire `agiworkforce-app-server` (fix the broken shipped `tools/call`) — do NOT delete the crate first (P1-CLI-APPSERVER).
- [ ] **G3** Resolve `network-proxy`/`execpolicy`: wire as single enforcement path OR document as reserved + audit the live `apps/cli/src/sandbox.rs`+`policy/` gating.
- [ ] **G4** Remove empty `@agiworkforce/stores` + phantom `workspace:*` deps (or populate); prune data-layer dead auth/storage/realtime adapters.
- [ ] **G5** Delete Desktop legacy `features/chat`/`features/v3` dead islands after confirming package-path security parity; delete gateway unmounted routers; delete CLI `subagent_v2.rs`; remove fabricated `AnalyticsDashboard`.

## §I — Capability-coverage gate (added per Codex 2nd-pass; both audits agree)

Build/lint/typecheck/test do NOT catch advertised-but-unwired facades. This gate fails unless every **advertised** capability is **exercised end-to-end** by a test. "Advertised but lacking an exercising test" = **INCOMPLETE**.

- [ ] **I1 CLI flags/subcommands:** every clap flag/subcommand (`apps/cli/src/lib.rs`) has a **behavior** test (not a parse test) proving it does what it advertises — explicitly `--max-budget-usd` (emits `budget_exhausted`), `--session-id`, `--include-partial-messages`, `--input-format stream-json`, `--system-prompt-file`. Any that no-op are WIRED or the flag is REMOVED.
- [ ] **I2 MCP/app-server tools:** every entry in `tools/list` (app-server + mcp-server) is invoked via `tools/call` in a test and returns a real result (not `-32601`). (Wire via the orphan `agiworkforce-app-server` crate.)
- [ ] **I3 UI actions:** every submitted form/primary button on web/desktop/mobile hits a real handler (no fake-success, no no-op): web `/api/contact`, settings profile/keys/org hooks, forgot/update-password; desktop sidebar nav + New Chat; mobile onboarding (no model-less chat).
- [ ] **I4 Extension commands:** every VS Code contributed command + every Chrome message-type runs (no dead-end); VS Code advertised provider list = actually-callable list.
- [ ] **I5 Service endpoints:** every mounted route has a test that hits it; `/models` (and `/dotfile` if kept) serve canonical catalog from `@agiworkforce/types` (no `claude-opus-4.6`/`gpt-5.4-codex`).
- [ ] **I6 Observed-state rule:** gates verify OBSERVED runtime behavior. Repo docs (TODO.md "R27 shipped", source-of-truth.md, CHANGELOG) are NEVER accepted as completion evidence.
- [ ] **I7 Unwired register drained:** every row in `reports/audit/RECONCILED.md` Item-1 has a landed WIRE or REMOVE (no surfaced capability the code doesn't honor).

## §H — The DONE procedure (run fresh; paste results)

```bash
# from repo root, clean tree
pnpm install --frozen-lockfile
pnpm check:llm-operability
pnpm sync:models:check
pnpm typecheck:all
pnpm lint && pnpm lint:extension
pnpm -r test            # zero failures
# per-surface coverage (vitest --coverage; cargo llvm-cov) → §B
pnpm build:all && pnpm build:desktop
cargo build --release --offline
cargo clippy --workspace --offline -- -D warnings
cargo test --workspace --offline
cargo audit
pnpm audit --audit-level=high
# SAST per §A15
git diff --check && git status
```
Then: confirm `reports/audit/STATE.md` shows **0 open P0 and 0 open P1**, and every box in §A–§G is checked with pasted evidence. Only then report DONE.

> Reality note (honesty): §F (product parity tail — esp. F1/F7/F8/F9 and the broader parity matrix) is multi-week, rate-limited work. §A–§E + §G are the near-term, high-leverage, fully-machine-verifiable core. The mission drives §A–§E/§G to green first, then §F, re-running §A–§H from clean before any DONE claim.
