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

### 2026-05-28 — Read-only deep exploration of the whole monorepo (while migration finishes)

**Deliverable:** `docs-hardening/REPO_EXPLORATION.md` — architecture map + prioritized risk register
from a 20-agent (14 succeeded + 12-area gap-fill in progress) read-only exploration. Strictly
read-only; no code touched. Tally from the 14 deep-dives: 0 P0 / 17 P1 / 41 P2 / 27 P3; synthesis
ranked 23 top risks.

**Verified finding — LATENT P0 (CLI memory pipeline trust-boundary defect):**

- `apps/cli/src/memory_pipeline.rs` `extract_session_summary` + `consolidate` route auxiliary LLM
  calls through `resolve_fast_model(config)` = `config.default.model` (ships as cloud `claude-opus-4-7`),
  with NO `validate_privacy_boundary()` and no session `privacy_mode` awareness.
- The correct guard exists at `apps/cli/src/agent/mod.rs:560` but is not threaded into the pipeline.
- **Severity downgraded from the subagent's "VERIFIED LIVE" to LATENT** by my own source read:
  `extract_session_summary` (the only writer of `session_summaries/*.md`) has ZERO callers repo-wide,
  and `consolidate` (live at `agent/chat.rs:1335`) early-returns on the empty dir — so nothing leaks
  out-of-box TODAY. But `ARCHITECTURE.md` documents the writer as intended-future wiring; wiring it
  without a privacy gate would leak Local-session content to Anthropic.
- **Fix (when unblocked; conflict-free — apps/cli not migration-touched):** thread session
  privacy_mode/provider into `memory_pipeline`, and skip/redirect cloud for Local sessions BEFORE the
  writer is ever wired. Batch 3/4.

**Other top risks (subagent-flagged, PENDING my independent verification; mostly migration-owned):**
computer-use OPA confirmation-skip default (desktop), hosted RLS isolation gap (data-layer/services),
worker session_ingress_token forgery (services), CLI TUI approval prompt broken under raw mode (cli —
mine), llm-runtime retry/fallback unwired (packages), release pipeline 404 download URLs + static
version (CI), web ContactSales→missing /api/contact (web). See REPO_EXPLORATION.md for the full list.

### 2026-05-28 — Gap-fill exploration complete (web/desktop/mobile) + consolidated register

Doc updated: `docs-hardening/REPO_EXPLORATION.md` now 1574 lines (14 + 12 area deep-dives, both
syntheses). Combined risk tally across both runs: ~4 P0-class, ~31 P1, ~62 P2, ~44 P3.

**VERIFIED-BY-ME findings (read the source myself):**

- **[LATENT P0 · MINE/conflict-free]** CLI memory pipeline trust-boundary (`apps/cli/src/memory_pipeline.rs`):
  routes via default cloud model, no privacy gate; latent because writer is unwired. Fix before wiring.
- **[P0 · deferred (migration-owned core/agi)]** Desktop UTF-8 byte-slice panics on live paths:
  `core/agi/orchestrator.rs:623` `&text[..10000]` (PDF attachment text),
  `core/agi/executors/code_executor.rs:538` `&code[..code.len().min(100)]` and `:787` `&code[..4000]`.
  Length-guarded, NOT codepoint-guarded → panics on multibyte input. Fix = `core/agent/autonomous.rs:1607`
  `truncate_str` (char-safe idiom already in repo) + multibyte regression test. VERIFIED real.
- **[P0 · deferred + re-verify on merged tree]** Desktop silent Local→cloud egress
  (`sys/commands/chat/send_message_execution.rs:1496`): unconfigured/Auto request redirected to
  ManagedCloud before backend 403; content leaves device with no consent/secret-scan/payload-preview.
  Migration agent owns + is actively rewiring `sys/commands/chat/**` — re-verify post-commit.
- **[P1 · MINE/conflict-free]** Live fabricated analytics: `apps/desktop/src/services/analyticsQueries.ts`
  (queryCategoryData/queryRetentionRate/queryConversionFunnel/queryErrorStats/queryPerformanceMetrics)
  rendered by `features/analytics/UsageDashboard.tsx`. De-fake → real Tauri cmd or honest empty.
- **[P1 · MINE/conflict-free]** `apps/desktop/src/features/v3/CodeModeHome.tsx` fabricated stats + random heatmap.

**Mobile (LEAD SURFACE) — now covered:** trust-boundary safety is the best of the 3 surfaces
(fail-closed, triple-gated, no silent Local→cloud). But **[P1] first-run local chat dead-ends**:
default Qwen3-4B catalog entry lacks downloadUrl/checksum/format so `onboarding.tsx` finishes without
downloading; `resolveLocalModelRef` does not provision → chat only works on devices with Apple FM /
Gemini Nano or after manual download. Also: TLS pins are PLACEHOLDER (ops gap, fail-loud guard blocks
release), authSession is a v1 stub, dispatch HMAC cutover (2026-06-05) pending. VERIFIED.

**EXECUTION ORDER (when migration commit lands + user unblocks):**

1. `git rebase` this branch onto the migration commit; re-run `audit.sh` for a clean merged baseline.
2. Re-verify the two deferred P0s on the merged tree (byte-slice panics; silent egress).
3. Fix conflict-free first (no rebase pain): CLI memory P0, desktop byte-slice P0 (now unblocked),
   analyticsQueries+UsageDashboard de-fake, CodeModeHome de-fake.
4. Then work the risk register by severity per surface (Mobile lead), two-reviewer verification per file.

### 2026-05-29 — Batch 3: fixed 4 UTF-8 byte-slice panics on user-reachable desktop paths

Added `pub(crate) floor_char_boundary` to `core/agi/mod.rs` (+3 multibyte regression tests) and routed
four byte-index string slices through it:

- `core/agi/orchestrator.rs:623` `&text[..10000]` (PDF attachment text on the live chat path)
- `core/agi/executors/code_executor.rs:538` `&code[..code.len().min(100)]` and `:787` `&code[..4000]`
- `core/agi/executors/llm_executor.rs:143` `&prompt[..100]` (NOT in the exploration list — found during the fix)
  Each was length-guarded but NOT codepoint-guarded → panic on multibyte input (PDF smart quotes, non-Latin code).
  VERIFICATION: lib compiles (cargo test built the lib cleanly). Full test-suite RUN is blocked by a SEPARATE
  migration regression — `data/state/draft_manager.rs:146` imports `crate::data::database::init_database`,
  removed during the migration; the migration ran `cargo check` (not `cargo test`) so missed it. This breaks
  ALL desktop test compilation (CI test job likely red). Tracked as a Batch-6 follow-up.

### 2026-05-29 — Model single-source-of-truth: architecture already ~80% built (research in flight)

Read-only repo findings:

- `models.json` IS canonical. Rust CLI embeds it via `include_str!` (model_catalog.rs:32) with a 3-tier source
  (models.dev api.json fetch → 5-min cache → bundled embed) — NOT a hardcoded duplicate.
- TS registry layer exists (model-catalog.ts: modelsById, normalizeModelId, modelIdAliases, SLOT_REGISTRY,
  getRoutingSlotModel, requireProviderDefaultModel, tierAllowedModels).
- Guardrails exist but are DELIBERATELY NARROW: ESLint no-restricted-syntax (TS) + check-no-hardcoded-models.sh
  (Rust, ci.yml:78) catch only the claude-opus-4-6-mini ghost + FAST*\*/DEFAULT*\*\_MODEL const literals. The
  ~64-file hardcoded backlog was explicitly deferred to "Wave 2 CLI/Desktop sweeps."
- ~86 non-test files still contain model-ID literals (desktop 40, cli 31, web 4, packages 5, crates 4) — count
  includes the legit registry/alias/fallback layer; true-violation set needs triage.
  GOAL: finish the deferred sweep → widen guardrails → model curation (opus-4.8/sonnet-4.6/haiku-4.5 only;
  gpt-image-2 only; drop sora-2 + old Opus/Sonnet/DALL-E) becomes a single-file edit. Deep-research wmktr8307
  running to confirm models.dev/LiteLLM best practice + polyglot single-source patterns.

---

## 2026-05-29 — EXECUTION RESUMED on merged tree (`hardening/execution-2026-05-28`)

The Supabase→Neon→Clerk migration has LANDED (commit `d56bb265f`) and the model-catalog curation
landed (`6bb5b0417`). The two-agent coordination constraints above are now resolved: I work the full
mission on the single merged branch. Resuming the batch loop with two-reviewer discipline per file.

### Batch 0 — Green baseline (serial) ✅

**Instrument provenance:** the original `audit.sh` (the brief's feedback loop) was **deleted by a
coding agent** and is not recoverable from git (it was untracked) or disk. I **reconstructed** it from
the signal set documented in this log's baseline table. It is a NEW INSTRUMENT: absolute counts differ
from the prior documented baseline (different rg patterns/exclusions). **Deltas are tracked only within
this instrument** — never compared to the old 6559/197/21/17/156/4/158/3/4747 numbers. The script is
frozen and committed (`audit.sh`); re-run after every batch.

**Reconstructed baseline (`audit-report.md` @ `6bb5b0417`, this instrument):**

| Signal                                      | This instrument |
| ------------------------------------------- | --------------: |
| Slop markers (non-test)                     |            2784 |
| Mock/random/hardcoded-data files (non-test) |             155 |
| Rust todo!/unimplemented!                   |               0 |
| `as any`                                    |              59 |
| @ts-ignore/@ts-expect-error                 |              22 |
| Skipped/.only/.todo tests                   |             232 |
| Duplicate-version files                     |               3 |
| Rust panic!()                               |             220 |
| Rust unreachable!()                         |               3 |
| Rust .unwrap()/.expect()                    |            5798 |

**Compile/test green map (verified, not asserted):**

- `cargo check --workspace` (desktop + cli + 16 crates): **exit 0** (1m37s).
- `cargo check -p agiworkforce-desktop --tests` (lib + all 4141 test fns): **exit 0** (1m42s) — confirms
  the desktop test target compiles.
- `pnpm -r --if-present typecheck` (32 TS packages incl. apps/web, apps/desktop): **exit 0**, 32 "Done",
  0 failures.
- `cargo test -p agiworkforce-desktop --lib draft_manager`: **2 passed, 0 failed** (runtime, not just compile).

NOT yet run (heavier; tracked, not claimed): full production bundles (`pnpm build:all`, Next.js web build),
the full vitest/jest/cargo-test execution across all suites, and clippy. Compile-green + typecheck-green
established as the Batch-0 gate; full suite/bundle execution noted as a CI responsibility and will be run
where a batch touches the relevant code.

**Fix (CI-red test blocker — legitimate Batch-0 "fix CI first"):**
`apps/desktop/src-tauri/src/data/state/draft_manager.rs` test module imported
`crate::data::database::init_database`, a symbol the migration removed — this broke **all** desktop test
compilation. Replaced with a local `mem_db()` helper (`Arc::new(Mutex::new(Connection::open_in_memory()))`);
`DraftManager::new` self-creates its table so an empty in-memory connection suffices. Verified the only
casualty repo-wide (other `data::database::` imports reference still-existing symbols). Verification:
`cargo check --tests` exit 0 + the two draft tests pass.

**Batch-2 target pre-verification (invariant #2 — read before write):** the brief's 4 named de-fake
targets are partly stale; each was checked for live-render-path mount status:

- `apps/desktop/src/services/analyticsQueries.ts` — **LIVE** (rendered via `UsageDashboard`, lazy-loaded
  in settings Account tab). MIXED: 9 fns correctly wire to real Tauri cmds w/ empty fallback, but 5 fns
  (`queryRetentionRate`, `queryConversionFunnel`, `queryErrorStats`, `queryCategoryData`,
  `queryPerformanceMetrics`) return hardcoded / `Math.random` fabrications. **REAL OFFENDER → Batch 2.**
- `apps/desktop/src/features/v3/CodeModeHome.tsx` — **ORPHANED** (only re-exported from a barrel nobody
  imports; no JSX usage). Fabricates stats + random heatmap + hardcoded model %. Dead-code (Batch 5) OR
  de-fake-to-empty; not in a live render path so not a DoD violation today.
- `apps/web/features/analytics/pages/AnalyticsDashboard.tsx` — **ORPHANED** (live billing page mounts
  `TokenAnalyticsDashboard` instead). Needs dead-confirm + fabrication check.
- `apps/extension-vscode/src/features/model-picker/modelMetrics.ts` — **ALREADY HONEST** (records REAL
  per-request metrics from `recordRequest`, persisted, with an explicit empty state). NOT a fabrication;
  the only nuance is the "Est. Cost" blended-rate estimate (a P2 label concern, not fake data).

This is exactly the audit-is-noisy lesson: a blind fan-out would have "fixed" non-problems and missed
the real one. Batch 2 will investigate-then-fix.

### Batch 1 — Dependency correctness ✅

DoD = "every app/service builds in isolation from a cold install." Verified each brief-named dep for
genuine direct-import-but-undeclared status (invariant #2: don't add unused deps).

**ADDED (directly imported, undeclared → would break a strict cold install):**

- `apps/web` deps: `highlight.js@^11.11.1`. `EnhancedMarkdownRenderer.tsx`/`MarkdownContent.tsx`/`BlogPost.tsx`
  do `import 'highlight.js/styles/github-dark.css'`. The CSS file exists ONLY in 11.x; the tree had both
  10.7.3 (no CSS) and 11.11.1 (has CSS, pulled by rehype-highlight→lowlight). Declaring 11.11.1 directly
  makes the CSS import deterministic. Verified: web now resolves highlight.js → 11.11.1.
- `apps/extension-vscode` devDeps: `glob@^10.5.0`, `mocha@^11.7.5`, `@types/mocha@^10.0.10`.
  `src/test/suite/index.ts` does `require('glob')` + `require('mocha')` for the integration test runner
  (the file's own comment said to install them). Test infra → devDeps.
- root devDeps: `@eslint/js@^9.39.4`. `eslint.config.mjs` does `import js from '@eslint/js'`.
- `services/api-gateway` devDeps: `@types/qs@^6.14.0`, `@types/express-serve-static-core@^5.1.1`. The brief
  named `qs`+`express-serve-static-core`, but both are TYPE-ONLY imports (`ParsedQs`, `ParamsDictionary`)
  in `middleware/asyncHandler.ts` — the correct deps are the `@types/*` packages. (`@types/express@5` is
  already declared and transitively provides them; the explicit decls make cold install deterministic.)

**NOT ADDED (deliberate, logged — brief's list was partly wrong):**

- `pg` (packages/data-layer): the brief assumed data-layer imports `pg`. It does NOT. `adapters/postgres.ts`
  is a `NotImplementedError` STUB; every `pg` reference is JSDoc documenting future wiring (even a literal
  `pnpm add pg` instruction in a comment). The real code import is `from '../types'`. Adding `pg` would
  introduce an UNUSED runtime dep — violates the brief's own "genuinely-undeclared" principle. **Flagged.**
- `@expo/config-plugins` (apps/mobile): required directly in `native/android/*.cjs` config plugins, but it
  is part of `expo`'s contract (expo ~55 bundles & guarantees it; it resolves today, v5). Declaring a
  divergent direct copy risks the classic duplicate-instance plugin failure. Standard Expo guidance is to
  let `expo` manage it. **Decision: not added; flagged** (invariant #6 — most-integrated reversible choice).

**Verification:** `pnpm install` (6.8s, no new downloads — versions already present) → `pnpm install
--frozen-lockfile` **exit 0** (1.2s; lockfile now complete & consistent). `pnpm --filter
@agiworkforce/api-gateway build` exit 0 (with the explicit @types). web/vscode/root resolution confirmed.
Audit signals unchanged (dep decls don't touch code). No regression.

### Batch 2 — De-fake user/investor-facing surfaces ✅

Run via the `batch2-defake` workflow: 4 parallel cross-surface discovery agents (web/mobile/chrome/vscode,
read-only Explore) + two independent reviewers per edited desktop file (A: correctness+honesty,
B: typecheck). Desktop offenders fixed by me first (high judgment), then 2-reviewer-verified.

**DESKTOP — fixed + BOTH reviewers PASS:**

- `apps/desktop/src/services/analyticsQueries.ts` (LIVE — rendered by the settings→Account `UsageDashboard`).
  The live-rendered `queryCategoryData('features')` now DERIVES from the real `analytics_get_feature_usage`
  telemetry (honest empty when zero) instead of a hardcoded 35/28/18/12/7 split. The four non-rendered
  fabricators (`queryRetentionRate`, `queryConversionFunnel`, `queryErrorStats`, `queryPerformanceMetrics` —
  the last used `Math.random()` curves) now return honest empty/zero state. No `analytics_get_*` command was
  invented; verified against `sys/commands/analytics.rs` (no retention/funnel/error/category/perf command exists).
- `apps/desktop/src/features/v3/CodeModeHome.tsx` (ORPHANED — only barrel-re-exported, never mounted; brief-named).
  De-faked to honest empty: removed the hardcoded session stats (612 sessions / 697,587 messages / 134.6M
  tokens / streaks / favorites), the `Math.random()` activity heatmap, the hardcoded 62/28/10 model-usage
  bars, and the "~6,119× The Little Prince" fun-fact. Renders "—" / "No model usage recorded yet."

**CROSS-SURFACE DISCOVERY (read-only):**

- Chrome extension: **0** live fabrications (strong local-only discipline confirmed).
- VS Code extension: **0** (re-confirms `modelMetrics.ts` is already honest).
- Web: 2 candidates, both judged **NOT fabrications** (not fixed): `components/agi/AgiChatDemo.tsx` is a scripted
  marketing demo animation (illustrative, like a product video — not user data passed off as real); `app/page.tsx`
  ProofStrip `value:'3'` "Trust modes" is a TRUE static product fact (Local/BYOK/Managed = 3), not fabricated.
- **Mobile (LEAD SURFACE): 3 real LIVE fabrications** (the config arrays VOICE_PRESETS/AUTO_MODES/PROVIDERS
  were over-flagged — they are legit feature definitions, not fabricated metrics; NOT touched):
  - `features/artifacts/data.ts` `RECEIVED_ARTIFACTS` (8 fake artifacts) rendered in the live ArtifactsGallery
    "Inspiration" footer — alongside a REAL `useArtifactStore`. → honest empty (real store is the true source).
  - `features/code-sessions/data.ts` `CODE_SESSIONS` (12 fake sessions) rendered in the live CodeSessionsScreen.
  - `features/artifacts/index.tsx` GetInspiredCard hardcoded "53%" fake quiz card.
    **MOBILE FIX DONE (mobile-engineer + my review):**
  - `RECEIVED_ARTIFACTS` deleted entirely (`artifacts/data.ts` removed); the gallery's fake "Inspiration"
    footer section removed. The screen now renders ONLY real `useArtifactStore` artifacts with the existing
    honest `ArtifactsEmptyState` ("No artifacts yet") via `ListEmptyComponent`.
  - GetInspiredCard "How petty are you? / 53%" quiz removed (lived in the same footer).
  - `CODE_SESSIONS` reduced to `[]` (12 fakes gone); CodeSessionsScreen shows `CodeSessionsEmptyState`
    ("No code sessions yet"); detail screen renders an honest "Session unavailable" state when not found.
  - Test suite `__tests__/artifacts-code-sessions.test.tsx` rewritten to assert honest states (6 pass).
  - Verification: `pnpm --filter @agiworkforce/mobile typecheck` exit 0 (independently re-run); 6 tests pass;
    grep confirms RECEIVED_ARTIFACTS / quiz literals / fabricated session titles gone repo-wide.
  - **Product flag (no real backend):** code-sessions has NO store/API/Dispatch source — the feature UI is
    structurally complete but empty until a real store is wired (a Batch-7 parity task, scoped separately).
    Artifacts DOES have a real store. First-run sample content, if wanted, is an additive product decision.

**Audit delta:** the reconstructed instrument's file-level "Mock/random" metric is INSENSITIVE to semantic
de-faking (it greps literal `Math.random`/`mockData`; the removed fabrications were named hardcoded arrays
like `RECEIVED_ARTIFACTS`, and the two desktop files still contain the token `Math.random` only inside
explanatory comments documenting the removal). Real deltas are verified by the 2-reviewer pass + grep, not
by this coarse gauge. DoD ("no fabricated data in any non-test render path") met for all surfaces examined.

### Batch 3 — Crash/safety hardening (Rust) 🟡 (in progress)

**Part 1 — CLI memory pipeline trust-boundary gate (the latent P0), DONE + tested.**

`apps/cli/src/memory_pipeline.rs` `extract_session_summary` + `consolidate` routed auxiliary LLM calls
through `resolve_fast_model(config)` (ships as a cloud model) with NO privacy-boundary check. The main
chat path has `Agent::validate_privacy_boundary()` (bails if a Local session targets a non-Local provider),
but that guard was never threaded into the memory pipeline. Latent because `extract_session_summary` has
zero callers today and `consolidate` early-returns on an empty summaries dir — but `ARCHITECTURE.md`
documents the writer as intended future wiring, and wiring it without a gate would silently upload
Local-session content to a cloud provider (violates the locked never-silent-egress invariant).

Fix (defense-in-depth, before the writer is ever wired): added a `local_only: bool` parameter to both
functions. When true, summarization/consolidation runs entirely on-device via the existing deterministic
fallbacks (`build_raw_summary` / `deduplicate_lines`) — NO network call. The `chat.rs:1339` call site now
passes `self.privacy_mode == PrivacyMode::Local`. Header records "on-device fallback (local privacy: no
network)" so the skipped-cloud path is auditable. Added `#[tokio::test]
test_extract_session_summary_local_only_stays_on_device`. Verify: `cargo check -p agiworkforce-cli` exit 0;
all 17 memory_pipeline tests pass.

**Part 2 — desktop `sys/commands` + `core/agi` panic triage: VERIFIED CLEAN.** Ran the
`batch3-panic-triage` workflow (4 Explore agents partitioning sys/commands top-level, sys/commands/chat,
sys/commands subdirs, and core/agi). Results:

- `sys/commands` (1406 `#[tauri::command]` handlers, top-level + chat + subdirs): **ZERO** genuine
  user-reachable crashers. Every unwrap/expect is a test, a compile-time constant, an idiomatic mutex lock,
  `unwrap_or` with a default, or internal serialization of a fixed type.
- `core/agi`: the agent flagged 3 "high" sites — **I verified all 3 as FALSE POSITIVES** (read-before-write;
  did not apply the recommended changes, which would have been churn on non-bugs, violating invariant #2):
  - `project_memory.rs:327` + `:484` (`&json_escaped[1..len-1]`): `style_key`/`decision` are `&str` (Tauri
    boundary `String`). `serde_json::to_string(&str)` and the `format!("\"{}\"", …)` fallback ALWAYS yield a
    quoted string ≥2 bytes, so `[1..len-1]` is always a valid slice (min `[1..1]`), and the boundaries sit on
    the ASCII quotes (no UTF-8 issue). No panic possible.
  - `conversation_summarizer.rs:694` (`body["choices"][0]["message"]["content"]`): serde_json `Value`
    indexing returns `Value::Null` for missing keys/wrong types — it never panics; `.as_str()` then yields
    `None`, handled by `.ok_or_else`. No panic possible.

**Batch 3 DoD ("no panic/unwrap on user-reachable paths; app degrades, never crashes") = MET & verified:**
crates/ + cli production paths clean (prior session, re-confirmed compiling); desktop UTF-8 byte-slice
panics fixed (`8653faf74`); desktop command + core/agi surface has zero genuine user-reachable crashers
(this triage); CLI memory trust-boundary gated + tested (Part 1). The raw audit panic/unwrap counts remain
high but are verified to be tests + invariants + panic-safe library semantics — the noise the brief warns of.

### Batch 4 — Auth unification ✅ VERIFIED (the migration already collapsed the fork)

The Supabase→Neon→Clerk migration (commit `d56bb265f`) already collapsed the Clerk-vs-Supabase fork to a
single system. Verified by me (read-only):

- **Zero Supabase references** in non-test/non-doc TS/Rust code (`rg supabase` over `*.ts/*.tsx/*.rs`,
  excluding node_modules/\_archive/tests/docs → 0 refs / 0 files). The Supabase auth path is fully removed —
  no dead Supabase auth code remains.
- **Clerk is the single system**, used across `apps/web`, `packages/data-layer`, and `services/api-gateway`.
- **Signatures ARE verified at the trust boundary:** the gateway uses `@clerk/backend` `verifyToken(token,
{ secretKey })` in `middleware/auth.ts:43` and `routes/deviceAuth.ts:214`.
- The `data-layer` `AuthProvider = 'auth0' | 'clerk' | 'cognito'` type + factory cases are an intentional
  pluggable-adapter SEAM (only `clerk` is wired/used; the comment says so). Not a live fork, not dead code
  to delete — it's a library extensibility point.

**DoD ("single tested auth path, no dead auth code") = met for the web/gateway/data-layer core.** Full
per-surface auth E2E tracing (desktop managed path, mobile, extensions) is consistent with Clerk and not
re-forked; deeper per-surface flows fold into Batch 7 parity.

**Flagged for Batch 8 (security pass) — NOT changed now (avoid breaking the verify-at-edge design):**

- `data-layer` `withUser(jwt)` decodes the `sub` claim WITHOUT re-verifying the signature (verify-at-edge
  pattern — the gateway verifies first). Confirm EVERY caller verifies upstream before trusting `withUser`;
  if any raw-request path reaches it unverified, that is an auth-scoping bypass.
- (register) `ClerkAuthAdapter.refreshToken` unimplemented; worker `session_ingress_token` unsigned/forgeable
  (only if that protocol is enabled in prod); `routeToCloud` token sourced from an unwritten localStorage key.

### Batch 5 — Dead code & duplication ✅ (core DoD met; risky removals documented + deferred)

DoD = "0 orphan packages, 0 dead dup files, single migration root." Verified each, removed what is provably
safe (compiler-confirmed), and documented the rest with corroboration:

- **Single migration root ✅** — the brief's "two `supabase/migrations` dirs to consolidate" no longer exist:
  the migration removed Supabase entirely (`find -name migrations` → only `apps/desktop/src-tauri/migrations`,
  the unrelated desktop SQLite migrations; canonical Neon migrations live at `apps/web/db/neon`).
- **`@agiworkforce/stores` is NOT orphaned ✅** — 63 refs via the `@shared/stores` alias across apps/web
  (chat-store, hooks, components). The register's caution was correct; KEEP.
- **Dup-version files: none are deletable dead dups** (corroborates the brief's cautions):
  - `automation_enhanced.rs` — KEEP (brief-verified substantive).
  - `sys/commands/settings_v2.rs` — LIVE: both `settings` and `settings_v2` are re-exported, and the
    `settings_v2` DB table is the runtime's categorized KV prefs store. Not a dead dup.
  - `apps/cli/src/subagent_v2.rs` — INTENDED FUTURE work, not abandoned: its header reads "Subagent v2 —
    full IPC + bidirectional message passing … M34 of v1.3 / M34a of v1.4 … closes the last v1.2
    architectural backlog item," and it is explicitly `#![allow(dead_code)]`. `subagent.rs` (v1) is the
    live one (`SubagentManager` used in `agent/chat.rs`). Deleting v2 would discard staged work — KEEP.
- **Unused Cargo deps (cargo-machete + per-dep verification):** removed 6 from `apps/cli/Cargo.toml` that are
  provably unused (the register's "source-of-truth inversion" — cli reimplemented these locally): the
  workspace-crate deps `agiworkforce-app-server`, `agiworkforce-apply-patch`, `agiworkforce-plugin-runtime`,
  `agiworkforce-task-runtime` (the cli uses its OWN local `app_server`/`apply_patch` modules — name collision
  that fooled the audit; the crate paths `agiworkforce_*::` have 0 refs), plus `tower` + `tower-http` (0
  direct refs; `axum` provides tower transitively). **Verified: `cargo check -p agiworkforce-cli` exit 0.**
- **Deferred (documented, NOT removed — too risky to remove without feature-aware multi-target builds):**
  cargo-machete also flagged desktop deps `llama-cpp-2` (local LLM), `ed25519-dalek` (signing), `async-stripe`
  (gated billing), `webrtc`, `rayon`, `unicode-segmentation`, and `anyhow`/`serde`/`serde_json` in several
  leaf utility crates. These are very likely feature-gated or used via derive/macros/re-exports cargo-machete
  misses; removing them risks breaking the windows/feature builds. Safe removal needs a per-dep + per-feature
  build pass — out of safe single-session scope. Left intact; flagged for a dedicated dep-hygiene pass.

### Batch 6 — Type safety & tests 🟡 (core type-safety DoD met; skipped-test bar re-scoped honestly)

- **`as any` in CORE = 0 ✅.** Verified: `packages/{routing,llm-runtime,llm-normalize,providers,unified-chat,
runtime}` contain ZERO non-test `as any`. The brief's "no `as any` in core" DoD is met. The remaining
  non-test `as any` (~14) live in app surfaces only (web 7, desktop 4, mobile 3) — lower priority; the
  reconstructed-instrument's count of 59 includes tests + archived code.
- **Skipped tests — the "0 skipped" bar is NOT honest here.** Triage shows the skips are overwhelmingly
  INTENTIONAL gating, not theater:
  - Provider + gateway `*.live.test.ts`: `it.skip('set AGIWORKFORCE_LIVE_TEST=1 + <KEY> to run')` — live-API
    integration tests, correctly skipped in CI (would need real keys + network).
  - Mobile: `const itX = FEATURES.x ? it : it.skip` / `DF.companion ? it : it.skip` — FEATURE-FLAG conditional
    skips; the feature is intentionally off in v1, so the skip is correct, not dead.
  - Rust `#[ignore]` (85): slow/integration tests intentionally ignored in the default run.
    Blindly un-skipping these would create false-reds or require credentials. Honest un-skipping is a per-test
    triage of the small residue of genuinely-disabled tests (a few desktop `it.skip`, e.g.
    `ResearchPanel.test.tsx`) — deferred to a dedicated test-triage pass, NOT a blanket flip.
- **Meaningful core-path test ADDED** (Batch 3 Part 1): `test_extract_session_summary_local_only_stays_on_device`
  covers the CLI memory trust-boundary (a core privacy path). Further core-path tests (LLM proxy, three-tier
  router, provider adapters, computer-use) remain a Batch-6 follow-up.
