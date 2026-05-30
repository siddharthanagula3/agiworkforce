# Inventory Audit — Rust core in-closure crates

Slice: `crates/agiworkforce-protocol`, `crates/agiworkforce-command-registry`, `crates/sandbox-policy`, `crates/agiworkforce-execpolicy`, `crates/agiworkforce-network-proxy`, `crates/agiworkforce-async-utils`

Date: 2026-05-29 · Method: RECON, read-only. Systematic grep signal collection + targeted reads of entry points, manifests, and security-sensitive files. Builds NOT run.

---

## TL;DR

These six crates are a **partially-integrated fork of OpenAI's codex-rs** (codex author handles in TODOs — `mbolin`, `aibrahim`, `viyatb`; binary self-identifies as `codex-execpolicy`; audit events named `codex.network_proxy.*`). Code quality is genuinely high — fail-secure policy precedence, SSRF guards, atomic 0o600 CA-key writes, strong test coverage. **But most of the closure is unreferenced by first-party (CLI/desktop) code.**

Verified reachability into the two shipping binaries (`agi`/`agiworkforce` CLI + `agiworkforce-desktop`):

| Crate | Status | Reached by |
|---|---|---|
| `sandbox-policy` | **ALIVE** | desktop `sandbox_runtime.rs` (drives `srt` config); CLI re-exports `SandboxPolicy` |
| `command-registry` | **ALIVE** | CLI `command_registry.rs` / TUI (builtin slash catalog) |
| `protocol` | **PARTIAL** (~2 of ~30 modules) | CLI uses only `custom_prompts` + `projects`. The other 28 modules (protocol.rs 5355 LOC, models.rs 2980, permissions.rs 2974, …) are compiled but never referenced by CLI/desktop |
| `async-utils` | **ALIVE (transitively)** | protocol `error.rs` uses `CancelErr` (but `error` module itself not reached by CLI — see below) |
| `execpolicy` | **DEAD in shipping closure** | only protocol `#[cfg(test)]` uses `Policy`. No app references it |
| `network-proxy` runtime | **DEAD in shipping closure** | pulled in ONLY because protocol re-uses 2 enums (`NetworkPolicyDecision`, `NetworkDecisionSource`) in its `network_policy` module — which the CLI never imports |

There are **zero user-reachable panic sites in this slice within the verified shipping closure** (confirmed: the only two protocol modules the CLI touches import only std/serde/schemars/ts-rs and pull none of the panic-bearing modules). The invariant panics that exist are sound.

The sharpest finding is a **misleading security surface** (see Security section): a sophisticated egress proxy and exec-policy engine exist but do **not** guard the product. Real gating lives in `apps/cli/src/sandbox.rs` + `apps/cli/src/policy/` (OUT OF SLICE — not audited here).

---

## Purpose & Architecture

- **`agiworkforce-protocol`** (17,673 LOC, edition 2024) — wire types / protocol contracts. Largest files: `protocol.rs` (5355), `models.rs` (2980), `permissions.rs` (2974), `openai_models.rs` (832), `config_types.rs` (763). Depends (path) on `async-utils`, `execpolicy`, `network-proxy`, four util crates. Most modules are codex-derived protocol enums/structs.
- **`agiworkforce-command-registry`** (844 LOC, edition 2021) — pure data + the builtin slash-command catalog (~90 commands). No deps. Clean.
- **`sandbox-policy`** (121 LOC, edition 2021) — `SandboxPolicy` enum + parse/accessor helpers. Pure data model; enforcement is delegated elsewhere (desktop → external `srt` binary; CLI → its own `policy/`).
- **`agiworkforce-execpolicy`** (1,802 LOC, edition 2024) — Starlark-rule command allow/prompt/deny engine + a `codex-execpolicy`-named CLI binary. Decision precedence is fail-secure.
- **`agiworkforce-network-proxy`** (8,215 LOC, edition 2024) — full MITM/HTTP/SOCKS5 egress proxy with allow/deny globsets, SSRF guards, audit events, MITM CA. Built on `rama-*` 0.3.0-alpha.4.
- **`agiworkforce-async-utils`** (86 LOC, edition 2024) — one `OrCancelExt` future-cancellation helper. Clean.

---

## Alive vs Dead (reachability into shipping binaries)

Verified via grep of `apps/cli/src`, `apps/desktop/src-tauri/src`, and Cargo manifests.

- CLI direct crate deps: `protocol`, `sandbox-policy`, `command-registry`, `utils-image`.
- CLI actual protocol usage (only these): `agiworkforce_protocol::projects::ProjectSourceSurface` (`sessions.rs:888`), `agiworkforce_protocol::custom_prompts::{CustomPrompt, PROMPTS_CMD_PREFIX}` (`command_registry.rs:28,33,58,359,391`). **Nothing else.**
- Desktop direct crate dep: `sandbox-policy` ONLY. Uses `SandboxPolicy::from_mode_str` / `WorkspaceWrite` / `DangerFullAccess` in `apps/desktop/src-tauri/src/sys/security/sandbox_runtime.rs:80-146` and `sys/commands/settings.rs:110`.
- `execpolicy`: NOT referenced by any app (`grep agiworkforce_execpolicy apps/ services/` = empty). In protocol, used only inside `#[cfg(test)] mod tests` (`models.rs:1728,2243`). Its `ExecPolicyAmendment`/`proposed_execpolicy_amendment` in protocol `approvals.rs`/`protocol.rs` are protocol-internal types, NOT the execpolicy crate.
- `network-proxy` runtime: NOT referenced by any app. Only `NetworkPolicyDecision` + `NetworkDecisionSource` enums are used, by protocol `network_policy.rs:2-3` — and the protocol `network_policy` module is itself never imported by the CLI (`grep network_policy:: apps/cli` = empty). The CLI's own `NetworkPolicy` enum in `apps/cli/src/sandbox.rs` is unrelated.

Note on shipped-binary bytes: root `Cargo.toml` release profile sets `lto=true` + `strip=true`, so unreferenced functions are very likely dead-code-eliminated. These crates are dead in the **source/compile graph**, not necessarily bloat in the final binary. The cargo dependency is real (declared, non-optional) which is why `cargo tree` reports them.

---

## Test Coverage

| Crate | #[test]/#[tokio::test] fns | Assessment |
|---|---|---|
| protocol | 221 | High (serde round-trips, conversions, sandbox semantics). Dedicated `error_tests.rs`, `exec_output_tests.rs` |
| command-registry | 14 | Good for its size; plus golden test `tests/slash_palette_golden.rs` |
| sandbox-policy | 3 | Adequate for 121 LOC (parse, defaults, mode names) |
| execpolicy | 6 | **Low by count for 1802 LOC.** Partly offset by inline `match`/`not_match` example validation baked into Starlark rules at parse time (`rule.rs:246-306`, `parser.rs:146-165`) |
| network-proxy | 116 | High; strong SSRF/normalization/globset coverage (`policy.rs` tests, `mitm_tests.rs`, `certs.rs` perm tests) |
| async-utils | 3 | Adequate (covers complete/cancel-first/already-cancelled) |

---

## Panic / Crash sites

Counts (src only): protocol panic!21 / unwrap30 / expect203 / todo!0(grep hit comments); command-registry unwrap3 / expect3; sandbox-policy 0; execpolicy unwrap2 / expect24; network-proxy panic!3 / unwrap155 / expect31; async-utils expect1.

After excluding `#[cfg(test)]` code, production (non-test) panic sites in the slice:

- **protocol `num_format.rs:15,17`** — `.expect("en-US wasn't a valid locale")` on a hardcoded `"en-US"` constant. Genuine compile-constant invariant (en-US is always a valid ICU locale). Module annotated `#![allow(clippy::expect_used)]`. SOUND.
- **protocol `models.rs:420`** — `unreachable!("external filesystem policies are represented by PermissionProfile::External")`. Both callers (`models.rs:521` always-Restricted; `models.rs:557` guarded by a match that diverts `ExternalSandbox` to `Self::External` at line 549) exclude the unreachable arm. SOUND invariant.
- **protocol `permissions.rs:1265-1267`** — `panic!("cwd must have a filesystem root")` / `panic!("cwd root must be an absolute path")`. `ancestors().last()` on a non-empty path is always `Some`; the root of an already-`AbsolutePathBuf` is always absolute. SOUND invariants.
- **protocol `config_types.rs:419`** — `non_zero_u64(...)` panics if value is 0; called only with the compile-time constant `DEFAULT_PROVIDER_AUTH_TIMEOUT_MS = 5_000` (`config_types.rs:366`). Never fires. SOUND.
- **protocol `config_types.rs:431`** — `default_provider_auth_cwd()` panics if `current_dir()` fails (e.g. deleted cwd). This is the only *value-dependent* (not compile-constant) production panic. **However**, it lives in the `config_types` module, which is NOT reached by the CLI/desktop closure (the two protocol modules the CLI imports — `custom_prompts`, `projects` — pull only std/serde/schemars/ts-rs). Not reachable in the current shipping closure; a P3 latency for any future/external consumer of `config_types`.
- **network-proxy** — `proxy.rs:622,674` and `config.rs:629` panics, plus the `runtime.rs:798` unwrap, are ALL inside `#[cfg(test)]` functions/modules. Effectively **zero** production panic sites in network-proxy. Excellent discipline.
- **execpolicy** — production expects are scoped `#[expect(clippy::expect_used)]` documented invariants: `policy.rs:367-368` (`matched_rules` non-empty by construction) and `parser.rs:351-357` (Evaluator.extra always populated by `parse()`). SOUND.

Conclusion: **0 user-reachable crash sites in-slice within the verified CLI+desktop closure.**

---

## TODO / FIXME / HACK

Protocol has 9 (all upstream codex-author comments, no `todo!()` macro): `protocol.rs:1285,2095,2119,2577`; `approvals.rs:63`; `openai_models.rs:452`. `plan_tool.rs` mentions "TODO tool" (the product feature, not a code marker). Other five crates: 0. None indicate broken features; all are upstream "make this not optional / add link" niceties.

---

## Security-sensitive code

**Headline risk — misleading dead security surface (P2):** This slice contains a sophisticated egress proxy and exec-policy engine that look like the product's network/exec guard rails but **do not guard the product**:

- `network-proxy` implements MITM TLS interception, SOCKS5, HTTP CONNECT, allow/deny globsets, SSRF protection, audit logging — and is dead in the shipping closure.
- `execpolicy` implements Starlark command allow/prompt/deny with fail-secure precedence — and is dead in the shipping closure.

A reviewer skimming the repo could wrongly conclude egress/exec is enforced here. **The CLI's actual network/exec/sandbox gating lives in `apps/cli/src/sandbox.rs` (its own `NetworkPolicy` enum) and `apps/cli/src/policy/`, and the desktop's in `apps/desktop/src-tauri/src/sys/security/`. Those — NOT these crates — are what must be verified for real egress/exec correctness. They are OUT OF SLICE and were not audited here.** (See Open Questions.)

Quality of the (dead) security code itself — all correct:
- **Fail-secure decision precedence.** `execpolicy/decision.rs:7` orders `Allow < Prompt < Forbidden`; `policy.rs:366` (`from_matches`) and `execpolicycheck.rs:63` aggregate with `.max()`, so the most restrictive matching rule wins. `network-proxy/network_policy.rs` `NetworkDecision::deny/ask` default to deny. Correct.
- **SSRF / private-range guards.** `network-proxy/policy.rs:45-98` classifies non-public IPv4/IPv6 (RFC 1918/6598/5737/2544/6890 + link-local/ULA + IPv4-mapped-IPv6 unwrap at :84). Thorough.
- **Global-wildcard denylist rejection.** `policy.rs:169-180` rejects `*` in denylist compilation (prevents an accidentally-permissive deny). Allowlist allows `*` only when explicitly enabled.
- **Host normalization** `policy.rs:101-124`, `execpolicy/rule.rs:156-212` — strip ports/brackets/trailing-dots, lowercase, reject wildcards in exact-host network rules, reject scheme/path. Defensive.
- **MITM CA key hygiene** `network-proxy/certs.rs:143` — CA private key written `0o600` via atomic `create_new` temp+rename (`:178-292`), reads validate mode (`:243-260`). P256 ECDSA, proper `BasicConstraints`/`KeyUsage`/`ExtendedKeyUsage` via rcgen. No `danger_accept_invalid`/`set_verify(NONE)` anywhere in `certs.rs`/`upstream.rs`/`mitm.rs`. Correct.
- **sandbox-policy default** `sandbox-policy/lib.rs:14-33` — unknown mode strings default to `WorkspaceWrite` (safe) with a warning; `DangerFullAccess` must be requested explicitly. Correct fail-safe (a prior version reportedly defaulted unknown→danger; comment at :94 notes the fix).
- **execpolicy amend file writes** `amend.rs:128-194` — advisory file lock + append + de-dup; path comes from caller (no traversal logic in-crate; trust boundary is the caller's policy-path choice).

No live security hole found in-slice. The egress/exec correctness that matters is out of slice.

---

## AI-slop / fork leftovers

- **Branding leftovers from codex-rs port** (low harm, P3): `execpolicy/main.rs:7` `#[command(name = "codex-execpolicy")]` while the bin is `agiworkforce-execpolicy`; `network-proxy/network_policy.rs:13` `POLICY_DECISION_EVENT_NAME = "codex.network_proxy.policy_decision"` and `:12` audit target `agiworkforce_otel.network_proxy`; codex author TODOs (mbolin/aibrahim/viyatb); test fixtures reference `.codex` dirs (`protocol.rs:4474,4485`).
- **Misplaced dependency declarations** (P3): protocol declares `agiworkforce-execpolicy` under `[dependencies]` but uses it only in `#[cfg(test)]` (belongs in `[dev-dependencies]`); `agiworkforce-network-proxy` is a full `[dependencies]` entry used solely for two enum types.
- No fabricated/RNG user-facing data, no stub returns rendered to users, no hallucinated APIs found in-slice. The `command-registry` builtin catalog is real metadata, not placeholder. No dead buttons / empty shells in these (data/logic-only) crates.

---

## Broken / half-built features

- None that are *broken* per se. The defining issue is **structural orphaning**: `execpolicy` (Starlark exec engine) and `network-proxy` (egress proxy) are complete, tested, but **not wired into any shipping surface**. They function in isolation/tests; they just guard nothing. ~28 of protocol's ~30 modules are similarly unreferenced by first-party code (they may exist to satisfy TS-binding generation via `ts-rs`, or as future scaffolding — unverified).

---

## Severity-ranked issues

- **P2 — Misleading dead security surface.** `network-proxy` (egress/MITM) and `execpolicy` (command allow/deny) present as the product's guard rails but are unreferenced by CLI/desktop; real gating is elsewhere (out of slice). Evidence: `grep agiworkforce_execpolicy apps/ services/` empty; `grep network_policy:: apps/cli` empty; CLI protocol usage limited to `custom_prompts`+`projects`. Fix hint: either wire these crates into `apps/cli/src/policy/`/`sandbox.rs` as the single enforcement path, or document them as reserved/not-yet-integrated and audit the live `apps/cli/src/sandbox.rs` + `apps/cli/src/policy/` for actual egress/exec correctness.
- **P3 — `config_types::default_provider_auth_cwd` panics on unresolvable cwd** (`crates/agiworkforce-protocol/src/config_types.rs:431`). Not reachable in current CLI/desktop closure; only a hazard for a future/external consumer that deserializes provider auth config from a deleted cwd. Fix hint: return a `Result`/fallback to `/` instead of `panic!`.
- **P3 — `protocol` declares `execpolicy` (and effectively `network-proxy`) in `[dependencies]` though execpolicy is test-only.** `crates/agiworkforce-protocol/Cargo.toml:17,19`. Fix hint: move `agiworkforce-execpolicy` to `[dev-dependencies]`; relocate the two shared enums (`NetworkPolicyDecision`, `NetworkDecisionSource`) out of `network-proxy` (e.g. into protocol or a tiny shared types crate) to drop the ~8k-LOC network-proxy from protocol's non-test closure.
- **P3 — codex branding leftovers.** `execpolicy/main.rs:7` (`codex-execpolicy`), `network-proxy/network_policy.rs:13` (`codex.network_proxy.policy_decision`). Cosmetic / telemetry-naming. Fix hint: rename to `agiworkforce-*`.

No P0/P1 in-slice: no live crash on a common path, no live security hole.

---

## Coverage & honesty

- **Read line-by-line:** all of `sandbox-policy`, `command-registry`, `async-utils`, `execpolicy` (lib/policy/decision/rule/parser/amend/main/execpolicycheck); protocol `lib.rs`/`num_format.rs`/`network_policy.rs` + targeted panic-context reads (`models.rs:400-460`, `permissions.rs:1245-1280`, `config_types.rs:405-435`); network-proxy `lib.rs`/`policy.rs` (full) + `network_policy.rs:1-200` + `certs.rs:1-60` + permission-handling greps.
- **Signal-level only (panic counts + targeted greps for TLS bypass / panics; NOT line-by-line), justified by dead status:** network-proxy `runtime.rs` (1732), `http_proxy.rs` (1300), `proxy.rs`, `socks5.rs`, `mitm.rs`, `config.rs`, `upstream.rs`, `state.rs`. `state.rs::validate_policy_against_constraints` (constraint-escape logic) was NOT read in detail — if these crates are ever wired live, that function and the proxy request path warrant a full review.
- **protocol:** ~28 unreferenced modules were reachability-checked and panic-greped but not all read line-by-line (large, and out of the live closure).

---

## Open questions / uncertainty

1. **Is the dead exec/egress machinery intended for future integration, or abandoned codex residue?** If intended, it should become the single enforcement path; if abandoned, it inflates the maintenance/audit surface. (Memory note `locks/v1-cloud-bridge-strategy` mentions a "managed proxy" — possibly the intended consumer, not yet built.)
2. **Where is the REAL egress/exec/sandbox enforcement for v1, and is it correct?** Out of this slice: `apps/cli/src/sandbox.rs` (CLI `NetworkPolicy` enum, default Deny per `:70`), `apps/cli/src/policy/` (incl. a `windows_sandbox.rs` stub gated behind a no-op `windows-appcontainer` feature per CLI Cargo.toml:96-101), and `apps/desktop/src-tauri/src/sys/security/`. These need a dedicated security audit — the crates in THIS slice do not provide the live guarantees.
3. Do protocol's ~28 unreferenced modules exist solely to generate TS bindings (`ts-rs`), or as dead scaffolding? Unverified.
