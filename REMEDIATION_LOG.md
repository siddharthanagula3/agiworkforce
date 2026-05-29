# Remediation Log — Non-Migration Hardening

Branch: `hardening/non-migration-2026-05-28` (worktree at `~/Desktop/agiworkforce-hardening`)
Base: `28d6eeeda` (clean HEAD; main tree's uncommitted Supabase→Neon→Clerk migration deliberately excluded)
Owner: hardening agent (second agent; migration owned by a separate concurrent agent)

## Coordination constraints (LOCKED this session)

- A concurrent agent owns the Supabase→Neon→Clerk migration in the **main** working tree. I MUST NOT touch, recode, redo, or commit any of it.
- Mission **Batch 4 (auth unification)** and the migration-consolidation half of **Batch 5** are the migration agent's — excluded from my scope.
- I work only in this isolated worktree and commit only here. The user merges my branch when the migration lands.
- Off-limits file set is being confirmed by the migration agent (prompt forwarded by the user). Until confirmed, I treat `apps/web/**`, all `package.json`/`pnpm-lock.yaml`, and the desktop Rust `data/` + `sys/commands/auth*`/`cloud_sync`/`chat/cloud` modules as HIGH-CONFLICT and avoid them.

## Honesty-grade invariants (never violate)

1. Never invent data — wire to real data or show honest empty/loading/error state.
2. Read before write; smallest change that fixes the issue.
3. Prove dead before deleting (build + ref search + tooling).
4. Two independent reviewers per file (correctness+invariants; build/typecheck).
5. Don't break product invariants (Local + BYOK only; cloud gated).
6. Surface irreversible/product decisions; don't guess.
7. Log every change here (what/why/verification/audit-delta).

## Baseline (audit-report.md @ main, 2026-05-28 20:54, dirty tree)

NOTE: baseline was generated against the migration agent's dirty tree, not this worktree.
I will re-run `audit.sh` against this worktree to get a clean baseline before claiming deltas.

| Signal                           | Baseline (dirty main) |
| -------------------------------- | --------------------: |
| Slop markers (non-test)          |                  6559 |
| Mock/random/hardcoded-data files |                   197 |
| Rust todo!/unimplemented!        |                     0 |
| `as any`                         |                    21 |
| `@ts-ignore`/`@ts-expect-error`  |                    17 |
| Skipped/`.only`/`.todo` tests    |                   156 |
| Duplicate-version files          |                     4 |
| Rust `panic!()`                  |                   158 |
| Rust `unreachable!()`            |                     3 |
| Rust `.unwrap()`/`.expect()`     |                  4747 |

---

## Changes

### 2026-05-28 — Batch 3 (Rust crash-hardening): VERIFIED CLEAN on conflict-free surface

**Scope examined:** the only Rust surface not owned by the in-flight migration —
`crates/**` (CLI engine: protocol, network-proxy, execpolicy, apply-patch, task-runtime,
sandbox-policy, utils-\*) and untouched `apps/cli/**` (excluding the 6 migration-touched files:
claude_parity.rs, cloud.rs, slash_commands.rs, sessions.rs, tier_cache.rs, tui/tui_app.rs).

**Why (audit said: 158 panic!, 3 unreachable!, 4747 unwrap/expect):** these counts are dominated
by test code and deliberate invariants — the noise the mission warns about.

**Verification (evidence, not assertion):**

- `crates/` non-test panic/unreachable triaged site-by-site:
  - `network-proxy/{proxy.rs:622,674 ; config.rs:629}` → inside `#[cfg(test)] mod tests`. Test assertions. KEEP.
  - `protocol/config_types.rs:419` (`non_zero_u64`) → validates a hardcoded compile-time
    default constant (`DEFAULT_PROVIDER_AUTH_TIMEOUT_MS`), not user input. Invariant. KEEP.
  - `protocol/config_types.rs:431` → serde-default fn; normal path deserializes the literal `"."`
    (effectively infallible); panic only if cwd is also unresolvable (cwd deleted). Serde-default
    signature can't be fallible. Effectively unreachable. KEEP.
  - `protocol/permissions.rs:1265/1267` → `cwd.ancestors().last()` is never `None` (ancestors
    always yields ≥1), and the root of an `AbsolutePathBuf` is always absolute. Provable invariant. KEEP.
  - `protocol/models.rs:420` (`ExternalSandbox => unreachable!`) → enforced design invariant
    (external policies represented by `PermissionProfile::External`). KEEP.
  - `utils-image/lib.rs:182` (`_ => unreachable!`) → `encode_image` narrows `preferred_format` to
    exactly `{Jpeg,WebP,Png}` at lines 134-138 (`_ => Png`) immediately before the match, so the
    arm is **provably unreachable by construction**. KEEP.
- `apps/cli` user-reachable paths:
  - `agent/mod.rs` (the agent loop): ALL unwrap/expect (lines 996-1264) are past the
    `#[cfg(test)]` boundary at line 890 → **production loop has zero unwraps**.
  - `sdk_io/stdin_reader.rs` (user-input parser — most reachable): all 3 unwraps past `#[cfg(test)]`
    at line 98 → **production parser has zero unwraps**.
  - `models/provider_dispatch.rs`, `mcp/mod.rs`: zero production unwraps (all in tests).
  - `message_queue.rs`: 10 production `.lock().expect("queue mutex poisoned")` — idiomatic
    mutex-lock; only fails after a prior panic. Genuine invariant. KEEP.

**Outcome:** No recoverable user-reachable panics/unwraps found. Batch 3 DoD ("no panic/unwrap on
user-reachable paths; app degrades, never crashes") is **already satisfied** for the conflict-free
surface. No code change made — making one would violate invariant #2 (smallest change; no churn).

**Audit delta:** none expected (correctly). The audit's panic/unwrap counts remain, but are verified
to be test-code + invariants, not crash risks. This is a verification deliverable, not a noop.

**Blocked work (owned by the migration agent, deferred until their single migration commit lands):**
Batch 1 (deps — theirs), Batch 2 de-fake of Web/Desktop/Mobile (they asked me to wait;
settings/chat/waitlist/billing being rewired), Batch 3 src-tauri crash paths (sys/commands, data/\*),
Batch 4 (auth — theirs), Batch 5 migration-consolidation (theirs), Batch 6/7/8 on app surfaces.
Plan: rebase onto their commit when pinged, then execute those batches.
