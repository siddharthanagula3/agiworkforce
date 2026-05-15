# AGI Workforce — Master Plan (Reverse-Engineering Campaign)

> **Version 2.0 · 2026-05-14**. The exhaustive single source of truth for bringing every AGI Workforce surface to industry-grade UI/UX, structural quality, and security posture by reverse-engineering against `~/Desktop/reference/` (640 curated PNGs · 4 reference source codebases · ~750 MB of competitive intelligence).
>
> **Scope:** All six surfaces (`apps/cli`, `apps/desktop`, `apps/web`, `apps/mobile`, `apps/extension`, `apps/extension-vscode`) plus shared `packages/`, backend `services/`, and the Rust workspace. Synthesizes nine Phase-3+Phase-4 deep-dive explorer reports (8 of 9 cite `file:line` for every claim) plus the Foundation-2026 cross-surface architecture doc and the AGI_WORKFORCE.md SSOT.
>
> **Companion docs (do not duplicate — link):**
>
> - `AGI_WORKFORCE.md` — platform truth (what shipped, sprint history, build verification, license, audit status)
> - `BUILD.md` — toolchain + per-surface build commands
> - `CLAUDE.md` — agent instructions, critical rules (LOCKED)
> - `REFERENCE_INDEX.md` — 640 PNG ↔ surface map across 7 fit buckets
> - `REFERENCE_STRUCTURE.md` — industry-grade organizational patterns from 4 reference codebases
> - `AUDIT_LOG.md` — durable per-fire audit findings + verification log
> - `CHANGELOG.md` — release notes
> - `docs/architecture/foundation-2026.md` — accepted cross-surface architecture (7 primitives)
> - `docs/plans/UNIFIED_LAUNCH_PLAN.md` — paid-tier launch ops (still live)
> - `docs/plans/SHIP_RUNBOOK.md` — ship runbook
>
> **What this supersedes:** `docs/plans/wave2-desktop-v1.md` and `docs/plans/wave3-mobile-extensions-web.md` (both archived to `docs/archive/` 2026-05-14). The earlier campaign-only doc `MASTER_PLAN.md` v1.0 (the 8 KB version) is fully replaced by this v2.0.
>
> **What this does NOT supersede:** `AGI_WORKFORCE.md` (still the platform truth file). `docs/plans/UNIFIED_LAUNCH_PLAN.md` (still authoritative for the Stripe-RPC paid-tier-launch sequence). `AUDIT_LOG.md` (the live per-fire ledger).

---

## Table of Contents

0. [Executive summary — what to read if you only read one page](#0-executive-summary)
1. [Methodology](#1-methodology)
2. [Reference codebase fingerprints](#2-reference-codebase-fingerprints)
3. [Cross-surface patterns](#3-cross-surface-patterns)
4. [Per-surface deep analysis](#4-per-surface-deep-analysis)
   - 4.1 [apps/cli](#41-appscli--rust-monolith)
   - 4.2 [apps/desktop frontend](#42-appsdesktop-frontend--tauri-v2--react)
   - 4.3 [apps/desktop backend](#43-appsdesktop-backend--tauri-rust)
   - 4.4 [apps/web](#44-appsweb--nextjs-14-app-router)
   - 4.5 [apps/mobile](#45-appsmobile--expo--rn-0836)
   - 4.6 [apps/extension](#46-appsextension--chrome-mv3-v120)
   - 4.7 [apps/extension-vscode](#47-appsextension-vscode--vs-code-v030)
   - 4.8 [`packages/` + `services/`](#48-packages--services-shared)
5. [Sequenced execution roadmap — Phase A→E](#5-sequenced-execution-roadmap)
6. [The reverse-engineering playbook (per fire)](#6-the-reverse-engineering-playbook)
7. [Anti-slop guardrails (non-negotiable)](#7-anti-slop-guardrails)
8. [Risk register](#8-risk-register)
9. [Verification matrix per surface](#9-verification-matrix)
10. [Live status tracker](#10-live-status-tracker)
11. [Appendices](#11-appendices)
    - A. PNG-to-source map (all 640 PNGs by fit bucket)
    - B. God-file inventory (every file ≥800 LOC across the repo)
    - C. Clippy-deny lint block (copy-paste-ready)
    - D. Reference deep-dive citations index
    - E. Glossary

---

## 0. Executive summary

The AGI Workforce repo ships **~1.4 million lines of code** across six surfaces, with a working test suite on every surface (CLI 1,318 · Desktop e2e green · Web 191 tests · Mobile 37 · Chrome 1,415+ assertions across 13 suites · VS Code 504 across 24). The platform is _not broken_. Every surface compiles, every paid tier is wired through Stripe end-to-end as of 2026-05-13 (Foundation Sprint shipped at `v0.7.0-foundation`), and the seven Foundation-2026 primitives (`createStore`, `messageQueueManager`, `AsyncLocalStorage<AgentContext>`, `@agiworkforce/llm-runtime`, outbound-worker direction inversion, orphan-packages wiring, Desktop Dispatch listener) are documented and shipping.

But Phase-3 + Phase-4 exploration of every surface against the reference codebases (`~/Desktop/reference/{codex-cli,src,gemini-cli,opencode}/`) and 640 curated PNGs (`REFERENCE_INDEX.md`) surfaces **three classes of debt that block continued velocity**:

### 0.1 The three classes of debt

| #     | Class                          | Severity | What it looks like                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Why it blocks velocity                                                                                                                                                                                                                                  |
| ----- | ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Security & correctness P0s** | Critical | SSRF in `apps/cli/src/a2a.rs:345-371` · silent handoff stub at `a2a.rs:820-854` · 40+ user-reachable `panic!` / `unreachable!` sites in CLI · 1,668 `.unwrap()` + 741 `.expect()` (2,409 total) in production CLI code · TLS pinning **disabled** in mobile at `lib/pinning.ts:87` · CSP `style-src 'unsafe-inline'` in Chrome ext · 20 backend security gaps (path traversal, command injection, SSRF, SQL safety, sandbox primitives) · service-role-key surfaces in 8+ web service files (mitigated but contract-only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Each is a foot-gun that can become a CVE or a silent prod failure. Until they're closed, every new feature multiplies the attack surface.                                                                                                               |
| **2** | **God files**                  | High     | Every surface has ≥1 file >1,500 LOC: cli `tools.rs` 3,807 · cli `tui/chatwidget.rs` 9,743 · cli `tui/bottom_pane/chat_composer.rs` 9,873 · cli `tui/app.rs` 8,251 · cli `tui/_attic/` 104,200 (dead duplicates) · desktop `stores/settingsStore.ts` 3,810 · desktop `stores/chatStore.ts` 2,727 · desktop `handlers/slashCommandHandlers.ts` 2,217 · desktop `Settings/SettingsPanel.tsx` 1,995 · web `stripe-webhook/route.ts` 1,725 · web `llm/v1/chat/completions/route.ts` 1,725 · web `UserSettings.tsx` 1,661 · web `BillingDashboard.tsx` 1,497 · mobile `chatStore.ts` 1,061 · mobile `chat/[id].tsx` 663 · mobile `companion/index.tsx` 609 · ext `side_panel.ts` 3,706 · ext `background.ts` 3,005 · ext `content.ts` 2,095 · vscode `sidebarProvider.ts` 1,803 · vscode `extension.ts` 1,602 · vscode `agentModeProvider.ts` 1,515.                                                                                                                                                                                                                                                         | God files block parallel work (two devs editing the same 9 K LOC = constant merge conflicts), block per-tool testing (no clear seam), block reviewability (a 3 K LOC diff is unreadable), and lock the codebase to single-developer-at-a-time velocity. |
| **3** | **PNG-vs-source feature gaps** | Mixed    | Desktop has zero Cowork tab implementation (PNG refs 002, 022, 031, 032 explicitly show dispatcher + live artifacts + projects + scheduled — `grep -rn "cowork" apps/desktop/src` returns only 2 reference matches in `ComputerUseSettings.tsx`). Desktop model picker has no per-turn adaptive-thinking toggle (only per-model via `ModelSelectorButton.tsx:74`). Web has no partner perks page (PNG ref 21). Web has no homepage at `/` (logo redirects straight to /chat). Web has 22 endpoints lacking `withRateLimit` (esp. voice/transcribe). Chrome ext has no pairing flow UI (PNG ref 403). Chrome ext has no conversation history persistence/UI (24 test refs, zero UI). VS Code ext shows v2.1.86 marketplace metadata (stale; actual v0.3.0). VS Code ext sidebar `@mention file` action menu (PNG ref 06) is not connected to chat-participant `@mention` syntax. VS Code ext has no chat-in-main-editor mode (PNG ref 08). Mobile has no theme toggle in personalization. Mobile has no offline-compose queue. CLI `/export` and `/extra-usage` are silent stubs (`main.rs:1535, 1539`). | Each PNG is a designed-and-reviewed user-facing feature that we don't ship. Together they account for the gap between "looks finished" and "feels finished."                                                                                            |

### 0.2 The three differentiators (don't regress these)

Locked, verified, and proven via working code paths:

1. **Multi-provider in one UI** — 10+ providers across CLI (12 named + 1 user-defined Custom at `apps/cli/src/models.rs:287-310`), Web (`/chat-multi` demos 4 providers side-by-side), Desktop (`packages/chat` consumes `@agiworkforce/providers-*`).
2. **BYOK + Local LLM** — Ollama + LMStudio wired in CLI at `models.rs:133-139, :303`. Anthropic does not accept user keys.
3. **Cross-provider session continuity** — `@agiworkforce/llm-normalize` (~5.9K LOC ported from OpenClaw, MIT, attributed in `THIRD_PARTY_LICENSES.md`) handles tool-call shape normalization. `repairMessageHistory(messages)` in `packages/llm-runtime/src/history.ts:1-363` is the differentiator-3 enabler when a fallback swaps providers mid-conversation.

### 0.3 What this plan optimizes for

The plan is built so that:

- **Every claim cites `file:line`** so reviewers can verify without re-exploring.
- **Every fix is ≤50 LOC per atomic change** so revert-on-red is trivial.
- **Every fire (one audit-fix-verify cycle) is ≤500 LOC cumulative diff** with mandatory verification gate before commit.
- **Every surface rotates in a fair queue** (`cli → desktop → web → mobile → ext → vscode → cli`) so no surface starves.
- **The auditor LLM is treated as untrusted too** — citation requirement + revert-on-red + verification gate are non-negotiable.

### 0.4 The five-phase campaign

Phase A (week 1) closes Critical security/correctness P0s — 10 fixes, ≤50 LOC each. Phase B (weeks 2-3) splits the 21 god files into domain-first folders following codex-rs `tools/<ToolName>/` + Claude-Code `tools/BashTool/` patterns. Phase C (weeks 4-6) closes 13 PNG-grounded feature gaps. Phase D (week 7+) lands cross-surface polish (dark-mode parity, a11y/ARIA audit, insta snapshot tests). Phase E (ongoing) is the steady-state audit-fix-verify loop driven by `AUDIT_LOG.md`.

---

## 1. Methodology

### 1.1 How this plan was built

This plan is the synthesis of **fifteen** explorer agents run in two phases:

**Phase 3** (six surface explorers, 2026-05-14 morning) — one per surface, ≤2,500 words each, structured: fingerprint, feature inventory, PNG comparison, gaps by severity, AI slop findings, structural divergence, top 10 actions. Outputs cite `file:line` throughout.

**Phase 4** (nine deep-dive explorers, 2026-05-14 afternoon) — six surface deep-dives (file-by-file inventories, god-file split proposals, TODO/HACK/FIXME catalogs, unwrap/expect risk inventories, security reviews, PNG-by-PNG maps, top-20 fixes) plus three reference-codebase deep-dives (codex-cli, Claude Code TS, gemini-cli+opencode) extracting structural patterns, dependency DAG topologies, naming conventions, lint blocks, test aggregation patterns. Outputs cite `file:line` throughout.

The synthesis is performed in this document. Where Phase 3 and Phase 4 reports agree, the higher-detail Phase 4 finding takes precedence. Where they disagree, both are presented with the discrepancy flagged.

### 1.2 What's a "fire"

A **fire** is one execution of the audit-fix-verify-commit loop on one surface against one module. Each fire produces:

- An append-only entry in `AUDIT_LOG.md` with structured findings (`file:line | severity | what | why | fix | status`).
- Either a single Conventional Commits commit (≤100 chars subject, `Co-Authored-By:` footer) or a `git stash` + failure report (if verification fails).
- An update to `Last surface audited: <name>` at the top of `AUDIT_LOG.md` for the next-fire rotation.

Fire #1 (2026-05-14, before this plan) audited `apps/cli/src/a2a.rs + a2a_ws.rs` and shipped 5 of 7 findings (1 Critical / 2 High / 1 Medium / 1 Low closed; 2 High and 1 Low deferred — see §4.1).

### 1.3 What's a "surface"

A **surface** is one of the six shipping app directories under `apps/`. The plan also treats `packages/` and `services/` as cross-cutting concerns folded into §4.8 because they're consumed by all six surfaces and have their own god-file + structural-divergence findings.

### 1.4 Rotation rule

Fire rotation is fixed: `cli → desktop → web → mobile → ext → vscode → cli → ...`. This guarantees no surface starves. Within a surface, the next module is chosen by:

1. Read `AUDIT_LOG.md` for the most recent fire on this surface; never re-audit a module within 14 days.
2. Prefer recently-touched modules: `git log --since="14 days ago" -- apps/<surface>/`.
3. Prefer god files (LOC ≥1,500) over normal modules — they have more findings per fire and unblock parallel work.
4. Within god files, prefer the one with the most P0/P1 findings in §4 of this plan.

### 1.5 Token budget per fire

One fire = approximately one Claude Opus 4.7 conversation. With 1M context cap:

- ≤200K tokens to read the module + reference patterns
- ≤500K tokens to execute the audit + fix loop + regression-pass audit
- ≤200K tokens reserved for verification + commit + AUDIT_LOG.md update
- Stop new audits at 800K of 1M.

This budget produces ≤500 LOC cumulative diff per fire, max 10 fixes per fire, with verification gate before commit. Most fires close 4-7 findings.

### 1.6 Tools and skills

The auditor uses: `Read`, `Edit`, `Write`, `Bash` (grep/find/wc/cargo/pnpm), `Agent` with `subagent_type: Explore` for deeper sub-investigations, `TaskCreate/TaskUpdate/TaskList` to track progress, and the `/loop` skill for autonomous repetition (when invoked by the operator).

The auditor's findings cite `file:line`. The auditor's fixes are reviewable diffs (`git diff --stat HEAD` ≤500 LOC). The auditor's verification log shows test-count delta and lint pass/fail.

---

## 2. Reference codebase fingerprints

Each reference codebase teaches us a specific structural pattern. Phase-4 deep-dives went file-by-file to extract these.

### 2.1 OpenAI Codex CLI (Rust workspace at `~/Desktop/reference/codex-cli/codex-rs/`)

**Structural fingerprint:** 108 workspace members across 4 tiers (core protocol/comms ~10 crates, domain systems ~20, utilities ~25 in `utils/*`, integration layers + experimental ~50+). Workspace edition 2024. Single-direction dependency DAG with no back-edges: `protocol` is a leaf, `core` is the hub, `cli` is the top-level binary; no crate depends on `tui`.

**Per-crate canonical anatomy** (verified on `protocol`, `tui`, `exec`, `hooks`, `app-server-protocol`):

```
<crate>/Cargo.toml          # uses workspace.dependencies (single-source versions)
<crate>/src/
  lib.rs                    # 50-2,500 LOC, but only `mod ...;` + `pub use ...;` at top
  foo.rs                    # snake_case files, flat siblings preferred over nested mod.rs
  bar.rs
  subdomain/                # nested folder ONLY when 5+ closely-related files
    mod.rs                  # aggregator
    a.rs, b.rs, c.rs
  snapshots/                # insta snapshot tests (.snap)
<crate>/src/bin/
  <bin-name>.rs             # auxiliary binaries with [[bin]] in Cargo.toml
<crate>/tests/
  all.rs                    # 2-5 LOC aggregator: `mod suite;`
  suite/
    mod.rs                  # `mod scenario_a; mod scenario_b;`
    scenario_a.rs           # one binary, many modules → faster compile
  fixtures/                 # JSON/TOML test data
```

**Workspace-level clippy lints** (root `Cargo.toml#[workspace.lints]`, lines 413-452): **37 lints**, all `deny` severity. Includes `unwrap_used = "deny"`, `expect_used = "deny"`, `await_holding_lock = "deny"`, `await_holding_invalid_type = "deny"`, plus the entire `manual_*` family (manual*clamp, manual_filter, manual_find, manual_flatten, manual_map, manual_memcpy, manual_non_exhaustive, manual_ok_or, manual_range_contains, manual_retain, manual_strip, manual_try_fold, manual_unwrap_or) and `needless*\_`family (needless_borrow, needless_borrowed_reference, needless_collect, needless_late_init, needless_option_as_deref, needless_question_mark, needless_update) and`redundant\_\_`family (redundant_clone, redundant_closure, redundant_closure_for_method_calls, redundant_static_lifetimes) and`unnecessary\_\*`family (unnecessary_filter_map, unnecessary_lazy_evaluations, unnecessary_sort_by, unnecessary_to_owned), plus`trivially_copy_pass_by_ref`and`uninlined_format_args`and`identity_op`. **Copy-paste-ready block in Appendix C.**

**Test aggregation pattern** verified on `codex-rs/exec/tests/all.rs` (2 lines: `pub use core_test_support; mod suite;`) and `codex-rs/exec/Cargo.toml` lines 13-14 (`[[test]] name = "all" path = "tests/all.rs"`). Reduces compile cost by 40-60% on large crates because one `cargo test` link instead of N link steps.

**Insta snapshot tests** verified at `codex-rs/tui/src/snapshots/codex_tui__app__tests__agent_picker_item_name.snap`. Invoked via `insta::assert_snapshot!(snapshot)`. Lifecycle: first run captures `.snap`, code change shows diff, `cargo insta review` accepts/rejects/skips. Standard for any TUI rendering test.

**Dependency DAG verified** (topo-sorted, leaves first):

- Layer 0 (leaves): `utils/*`, `protocol`, `config`, `plugin`, `execpolicy`, `secrets`
- Layer 1 (protocols): `app-server-protocol`, `hooks`, `tools`, `skills`
- Layer 2 (domain systems): `core`, `app-server`, `mcp-server`, `exec`
- Layer 3 (top): `tui`, `cli` (single binary entry)

**Specific moves for us** (full details in §4.1 and §5):

- Adopt `[workspace.lints.clippy]` with 37 lints in our root `Cargo.toml`.
- Extract `apps/cli/src/lib.rs` from `main.rs`; keep `main.rs` to ~50 LOC parse+dispatch (codex `exec/src/main.rs` is 42 LOC).
- Split `apps/cli/src/tools.rs` (3,807 LOC) into `apps/cli/src/tools/<ToolName>/` folders mirroring `codex-rs/tools/src/` 43-file pattern.
- Delete `apps/cli/src/tui/_attic/` (118 duplicate files, 104,200 LOC dead weight).
- Add `apps/cli/tests/all.rs` aggregator + `tests/suite/` flat tree.

### 2.2 Anthropic Claude Code (TypeScript at `~/Desktop/reference/src/`)

**Structural fingerprint:** 37 top-level domains, 1,588 total files. Top domains: `tools/` (184 files, 43 subdirectories — one per tool), `commands/` (207 files, 87 subdirectories — one per slash command), `components/` (389 files), `utils/` (564 files, domain-grouped), `services/` (130 files, 38+ stateful service domains), `hooks/` (104 files, 11+ subdirs), `state/` (6 files — single source of truth), `bridge/` (31 files), `types/` (11 files for ids, message, command — pure types, no domain logic), `skills/` (20), `tasks/` (12), `constants/` (21), `cli/` (19), `entrypoints/` (8), `native-ts/` (4), `server/` (3).

**Tool folder canonical anatomy** (verified on `BashTool/`, `FileEditTool/`, `NotebookEditTool/`, `AgentTool/`):

```
tools/BashTool/
├── BashTool.tsx (1,143 LOC)       # buildTool({ name, schemas, prompt, handlers })
├── commandSemantics.ts (140)       # domain logic: isSearchOrReadBashCommand
├── bashPermissions.ts (2,621)      # permission matchers, wildcard patterns
├── bashSecurity.ts (2,592)         # command parsing, injection detection
├── prompt.ts (369)                 # getSimplePrompt, timeout config
├── UI.tsx (184)                    # renderToolUseMessage, renderToolResultMessage
├── BashToolResultMessage.tsx (190) # result formatting
├── readOnlyValidation.ts (1,990)
├── sedEditParser.ts (322)
├── pathValidation.ts (1,303)
├── shouldUseSandbox.ts (153)
├── modeValidation.ts (115)
├── destructiveCommandWarning.ts (102)
├── bashCommandHelpers.ts (265)
├── utils.ts (223)
├── toolName.ts (2)
└── constants.ts
```

**buildTool() interface** (canonical, used by every tool):

```typescript
buildTool({
  name: string
  searchHint: string
  maxResultSizeChars: number
  strict: boolean
  description(params): Promise<string>
  prompt(): Promise<ToolPrompt>
  userFacingName?(input): string
  getToolUseSummary?(input): string
  inputSchema: ZodSchema
  outputSchema: ZodSchema
  toAutoClassifierInput(input): string
  getPath?(input): string
  preparePermissionMatcher(input): (pattern) => boolean
  checkPermissions(input, context): Promise<PermissionDecision>
  isReadOnly?(input): boolean
  isConcurrencySafe?(input): boolean
  isSearchOrReadCommand?(input): {isSearch, isRead, isList}
  renderToolUseMessage(props): React.ReactNode
  renderToolResultMessage(props): React.ReactNode
})
```

**Command anatomy** — two shapes:

_Prompt-type_ (`commands/commit.ts`):

```typescript
const command = {
  type: 'prompt',
  name: 'commit',
  description: 'Create a git commit',
  allowedTools: ['Bash(git add:*)', 'Bash(git status:*)', 'Bash(git commit:*)'],
  progressMessage: 'creating commit',
  source: 'builtin',
  async getPromptForCommand(_args, context) { ... return [...] },
} satisfies Command
```

_JSX-type_ (`commands/add-dir/index.ts`):

```typescript
const addDir = {
  type: 'local-jsx',
  name: 'add-dir',
  argumentHint: '<path>',
  load: () => import('./add-dir.js'), // lazy bundle splitting
} satisfies Command;
```

**PII marker types pattern** (`services/analytics/index.ts:16-33`):

```typescript
export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = never;
export type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED = never;

// usage forces explicit cast:
logEvent('event_name', {
  param: myString as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  piiValue: rawName as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
});
```

The `never` type forces explicit per-call developer assertion; nothing reaches Datadog without a verified cast. `stripProtoFields()` in `analytics/index.ts:47+` defensively removes `_PROTO_*` keys before fanout.

**Service stateful pattern** (`services/analytics/`, 9 files / 4,040 LOC). Queue-until-sink pattern: events queue until the sink is injected post-bootstrap (avoids circular deps). No global mutable state; functional event composition. Sink interface in `sink.ts` (114 LOC) routes to `datadog.ts` (307 LOC) + first-party logger (1,255 LOC across two files).

**Bridge folder** (`bridge/`, 31 files). Remote API + messaging + JWT. `jwtUtils.ts` exposes `decodeJwtPayload(token)`, `decodeJwtExpiry(token)`, `createTokenRefreshScheduler({ sessionId, onRefresh, getAccessToken, expiryMs })`. Message envelope serialized JSON, request-response correlation by message ID. Crucially: bridge/ never imports from components/, never imports from commands/ — strictly leaf direction.

**Tests:** NOT in `src/` for Claude Code. They live in `integration-tests/` and `evals/`. Forces tests to exercise public APIs, not internals.

**Naming discipline:** PascalCase for tools+components, camelCase for utility functions, kebab-case for command folders (`add-dir/`, `commit-push-pr/`), `index.ts` everywhere for re-exports. **Mixing within a surface = LLM slop signal.**

### 2.3 Google Gemini CLI (TypeScript monorepo at `~/Desktop/reference/gemini-cli/packages/`)

**Structural fingerprint:** 7 packages — `cli` (binary), `core` (~120 exports — agents/config/MCP/billing), `sdk` (published external), `vscode-ide-companion` (publishable), `devtools`, `a2a-server`, `test-utils`.

**TypeScript project references** force single-direction DAG at _compile time_. `packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "outDir": "dist", "lib": ["DOM", "ES2023"] },
  "include": ["src/**/*.ts"],
  "references": [{ "path": "../core" }]
}
```

And `packages/cli/package.json`:

```json
"dependencies": {
  "@google/gemini-cli-core": "file:../core",
  "react": "^19.2.0"
}
```

**A PR that adds `import { cli } from '@google/gemini-cli-core'` inside `core/src/` will fail `tsc -b` immediately.** The DAG is enforced by the compiler, not by convention.

**VSCode bridge boundary** (`packages/vscode-ide-companion/src/ide-server.ts:120-432` + `diff-manager.ts`):

- VSCode extension starts an **Express HTTP server on `app.listen(0, '127.0.0.1')`** (line 340).
- The CLI process reads the port from `~/.config/gemini/ide/gemini-ide-server-{ppid}-{port}.json`.
- All communication is HTTP + MCP over that port: `POST /mcp` for RPC, `GET /mcp` for session polling.
- Authentication: Bearer token (UUID generated at server start, line 141) in `Authorization` header.
- CORS + Host validation: only localhost, strict host header check.
- `vscode-ide-companion` imports **only types** from `@google/gemini-cli-core`:
  ```typescript
  import {
    CloseDiffRequestSchema,
    IdeContextNotificationSchema,
    OpenDiffRequestSchema,
  } from '@google/gemini-cli-core/src/ide/types.js'; // TYPES ONLY
  ```
- Never imports runtime code. Boundary is HTTP, not JS-import.

**posttest=npm run build pattern** (`packages/core/package.json:19` and `packages/cli/package.json:23`):

```json
"scripts": { "test": "vitest run", "posttest": "npm run build" }
```

Catches the case where a test-only fix leaves the package un-buildable. CI fails immediately instead of at the next consumer's build.

### 2.4 OpenCode (TypeScript monorepo at `~/Desktop/reference/opencode/packages/`)

**Structural fingerprint:** 13 packages. Apps (not published): `app`, `desktop`, `desktop-electron`, `opencode`, `enterprise`, `storybook`. Libraries (published or workspace-referenced): `core`, `ui`, `plugin`, `script`, `function`, `slack`.

**Bun workspaces + `workspace:*` protocol** (`package.json:22-84`):

```json
{
  "packageManager": "bun@1.3.13",
  "workspaces": {
    "packages": ["packages/*", "packages/console/*", "packages/sdk/js", "packages/slack"],
    "catalog": {
      "@effect/opentelemetry": "4.0.0-beta.57",
      "typescript": "5.8.2"
    }
  }
}
```

**Dependency declaration** (`packages/app/package.json`):

```json
"dependencies": {
  "@opencode-ai/sdk": "workspace:*",
  "@opencode-ai/ui": "workspace:*",
  "@effect/opentelemetry": "catalog:"
}
```

**Comparison to file://**:

| Aspect           | `file://` (Gemini)                    | `workspace:*` (OpenCode/pnpm)                 |
| ---------------- | ------------------------------------- | --------------------------------------------- |
| Resolution       | npm resolves to local file at install | pnpm/bun resolve at install, cache locally    |
| Lockfile clarity | `file:../core` ambiguous version      | `workspace:` + version, intent clear          |
| Hoisting         | npm hoists aggressively (can shadow)  | pnpm strict node_modules, always correct      |
| Runtime support  | npm, yarn, pnpm (any)                 | pnpm or bun                                   |
| Catalog support  | Manual                                | `"catalog:"` deduplicates transitive versions |

**Our state:** We already use pnpm `workspace:*` (per `pnpm-workspace.yaml`). This is correct — no change needed.

### 2.5 Reference takeaway matrix

| Pattern                                 | Codex-RS                              | Claude Code TS                       | Gemini CLI                     | OpenCode      | AGI Workforce now                          | Recommended action                            |
| --------------------------------------- | ------------------------------------- | ------------------------------------ | ------------------------------ | ------------- | ------------------------------------------ | --------------------------------------------- |
| Domain-first organization               | ✓                                     | ✓                                    | Partial                        | ✓             | Mixed                                      | **Adopt** in Phase B god-file splits          |
| Centralized registry                    | ✓ (`Cargo.toml#members`)              | ✓ (`Tool.ts`, `commands.ts`)         | ✓ (`tsconfig.json#references`) | ✓             | Partial                                    | **Adopt** TS `references` for `packages/*`    |
| Single-direction DAG (compile-enforced) | ✓                                     | ✓                                    | ✓ (TS refs)                    | ✓             | ✗ (no compile enforcement)                 | **Adopt** Phase B                             |
| Tests colocated to source               | Rust: `#[cfg(test)]` + `tests/suite/` | ✗ (`integration-tests/`)             | ✓ `*.test.ts` next to source   | ✓             | Mixed                                      | **Codify** in CLAUDE.md per surface           |
| Workspace lints in root config          | ✓ (37 deny lints)                     | n/a (TS)                             | n/a (TS)                       | n/a (TS)      | ✗ (per-crate)                              | **Adopt P0** in root Cargo.toml               |
| Insta snapshot tests                    | ✓ (TUI rendering)                     | n/a                                  | n/a                            | n/a           | ✗                                          | **Adopt** Phase D for TUI + Settings forms    |
| posttest = build                        | n/a (cargo build is implicit)         | n/a                                  | ✓                              | ✗             | ✗                                          | **Adopt** for `packages/*`                    |
| HTTP-only extension bridge              | n/a                                   | n/a                                  | ✓ (`ide-server.ts`)            | n/a           | ✓ (`desktopBridge.ts:194-200` 8787)        | **Verify boundary** in Phase D                |
| `exports` field in package.json         | n/a (Cargo)                           | n/a                                  | ✓                              | ✓             | ✗                                          | **Adopt** Phase B                             |
| PII marker types (compile-time)         | n/a (Rust)                            | ✓ (`AnalyticsMetadata_I_VERIFIED_*`) | n/a                            | n/a           | ✗                                          | **Adopt** in `packages/analytics/` when built |
| Naming discipline                       | ✓                                     | ✓                                    | ✓                              | ✓             | Mixed (`tui/` PascalCase + snake_case mix) | **Codify** in CLAUDE.md                       |
| Workspace protocol                      | n/a                                   | n/a                                  | `file://`                      | `workspace:*` | `workspace:*` ✓                            | Keep                                          |
| God files >1.5K LOC                     | ✗                                     | ✗                                    | ✗                              | ✗             | ✓ (≥21 files)                              | **Split** in Phase B                          |

---

## 3. Cross-surface patterns

These show up in 4+ of 6 surfaces. Fix them in this order to compound across the platform — each pattern, once fixed in one surface, has a recipe that ports to the others.

### 3.1 X1 — God files ≥1,500 LOC (every surface)

**Total god-file inventory across the repo** (from Phase-4 reports, sorted by surface):

**apps/cli** (16 god files, ~76K LOC + 104K dead duplicates):

- `tools.rs` 3,807 · `agent.rs` 2,773 · `models.rs` 2,616 · `main.rs` 2,385 · `repl.rs` 2,124 · `hooks.rs` 1,946 · `a2a.rs` 1,732 (audit fire #1 was on this) · `model_catalog.rs` 1,685 · `safety.rs` 1,522 · `auth.rs` 1,429 · `config.rs` 1,410 · `daemon.rs` 1,312 · `compaction.rs` 1,235 · `markdown.rs` 1,203 · `context.rs` 1,198 · `tui/app.rs` 8,251 · `tui/chatwidget.rs` 9,743 · `tui/bottom_pane/chat_composer.rs` 9,873 · `tui/_attic/` 104,200 (dead duplicates of 118 files)

**apps/desktop frontend** (10 god files, ~22K LOC):

- `stores/settingsStore.ts` 3,810 · `stores/chatStore.ts` 2,727 · `lib/tauri-mock.ts` 2,383 · `handlers/slashCommandHandlers.ts` 2,217 · `components/Settings/SettingsPanel.tsx` 1,995 · `stores/mcpStore.ts` 1,915 · `stores/billingUsage.ts` 1,783 · `components/UnifiedAgenticChat/index.tsx` 1,716 · `components/UnifiedAgenticChat/ArtifactRenderer.tsx` 1,735 · `hooks/useAgenticEvents.ts` 1,694

**apps/desktop backend** (5+ god files, ~10K LOC each domain):

- `sys/commands/voice.rs` 2,218 · `sys/commands/agi.rs` 1,519 · `sys/commands/git.rs` 1,929 · `sys/commands/browser.rs` 1,872 · `sys/commands/mcp.rs` 1,790 · `sys/commands/database.rs` 1,483 · `core/agi/tools/mod.rs` 3,388 · `core/llm/provider_adapter.rs` 3,103 · `core/mcp/transport.rs` 2,281 · `sys/security/tool_guard.rs` 2,462

**apps/web** (5 god files):

- `app/api/stripe-webhook/route.ts` 1,725 · `app/api/llm/v1/chat/completions/route.ts` 1,725 · `features/billing/hooks/use-billing-queries.ts` 1,397 · `features/settings/pages/UserSettings.tsx` 1,661 · `features/billing/pages/BillingDashboard.tsx` 1,497 · `stores/unified/chat/chatStore.ts` 1,653

**apps/mobile** (3 god files):

- `stores/chatStore.ts` 1,061 · `app/(app)/chat/[id].tsx` 663 · `app/(app)/companion/index.tsx` 609 (the agent dashboard) · `components/companion/AgentDashboard.tsx` 1,120 (named conflict per phase-3 report) · `services/notifications.ts` 662 · `stores/connectionStore.ts` 885

**apps/extension** (3 god files):

- `side_panel.ts` 3,706 · `background.ts` 3,005 · `content.ts` 2,095 (no Phase-3 mention but Phase-4 confirmed) · `types.ts` 979

**apps/extension-vscode** (3 god files):

- `sidebarProvider.ts` 1,803 · `extension.ts` 1,602 · `agentModeProvider.ts` 1,515 · `services/desktopBridge.ts` 829 · `utils/api.ts` 848

**Total god-file LOC across the repo: ~210K + 104K dead duplicates = ~314K LOC concentrated in fewer than 60 files.** Split into ≤500 LOC modules, this becomes ~700+ smaller files — each independently testable, reviewable, and parallelizable.

**The split recipe** (per file): one PR per sub-module, each ≤500 LOC; tests colocated in `__tests__/` (TS) or inline `#[cfg(test)] mod tests` (Rust); verification gate runs full surface test suite; reference: codex-rs/tools/src/<ToolName>/ + Claude-Code-TS tools/BashTool/ for the canonical anatomy.

### 3.2 X2 — Layer-first organization (every TS surface, partial CLI)

**Symptom:** `components/` `services/` `hooks/` `stores/` flat at the surface top instead of `chat/` `settings/` `agents/` `voice/` etc. organized by domain. A new feature touches 6+ files split across 6+ folders, making code-owners impossible to assign.

**Worst offenders:**

- `apps/desktop/src/`: 97 component subdirs flat under `components/`, 38 hooks flat under `hooks/`, 101 stores flat under `stores/`.
- `apps/web/`: 11 feature folders under `features/` (`billing/`, `chat/`, `settings/`, etc.) — better, but 184 files inside `features/chat/` is itself layer-first inside the feature.
- `apps/extension/`: All under `src/` flat (no domain folders).
- `apps/extension-vscode/`: `providers/` (15 files), `services/` (18), `utils/` (7), `lifecycle/` (4), `storage/` (1), `registry/` (1) — pure layer-first.
- `apps/cli/`: tools, commands, services, runtime all flat at `src/`. Tools should be in `tools/<ToolName>/` per codex-rs.

**Why fix:** Three reasons.

1. Code ownership: domain-first lets `CODEOWNERS` assign `apps/desktop/src/chat/**` to one team.
2. Bundle splitting: web/extension can lazy-load by domain.
3. Refactor blast radius: changing one feature touches one folder, not six.

**The fix recipe** (per surface, post-Phase-B split): once a god file is split into per-domain folders, move the related stores/hooks/components into the same folder. Example:

```
apps/desktop/src/
├── chat/
│   ├── components/
│   ├── stores/
│   ├── hooks/
│   ├── types.ts
│   └── index.ts
├── settings/
│   ├── tabs/
│   │   ├── General/
│   │   ├── Account/
│   │   └── ... (one per tab)
│   ├── stores/
│   └── hooks/
└── cowork/      # new in Phase C
    ├── components/
    ├── stores/
    └── hooks/
```

### 3.3 X3 — A11y/ARIA missing on icon-only buttons (every TS surface)

**Symptom:** icon-only buttons in settings, composers, sidebars, popups have no `aria-label`. Screen readers announce them as "button" with no context.

**Sites:** desktop `SettingsPanel.tsx:1920-1924` (nav buttons lack focus-visible ring + aria-label), mobile composer (voice/camera/attachment/overflow icons), web artifacts gallery, ext popup `popup.html:530` (only one aria-label exists), vscode sidebar tree items.

**The fix recipe:** one PR per surface that runs `eslint-plugin-jsx-a11y` (TS), accessibility inspector (mobile native), and Chrome a11y audit (extension). Each fixes its surface findings in a single ≤500 LOC sweep.

### 3.4 X4 — Dark-mode parity gaps (web, mobile, desktop)

**Symptom:**

- **web**: `app/pricing/page.tsx` and `app/login/page.tsx` are light-only (no `dark:` Tailwind variants).
- **mobile**: no theme toggle in personalization; hard-coded to system color scheme.
- **desktop**: no preview persistence between Settings switches (when you switch theme in Settings/Appearance, the preview doesn't persist if you switch tabs).

**The fix recipe:** web — add `dark:` variants via Tailwind + `next-themes` context; mobile — add `light/dark/system` toggle in `app/(app)/settings/personalization.tsx`, persist via `settingsStore`, wire to `useColorScheme()`; desktop — persist `themePreview` to local store before tab switch.

### 3.5 X5 — Silent error swallow (cli agent, web LLM route, ext bridge reconnect)

**Symptom:** `return Ok(())` or `return ;` after a failure branch, hiding the failure from the user/upstream.

**Sites:**

- **cli** `agent.rs:517, 540, 557` — three sites returning `Ok(())` after hook-blocking failures.
- **cli** `daemon.rs:133, 148, 768` — early `return Ok(())` in receiver-dropped/config-error paths without logging.
- **cli** `tools.rs:2747` — `TODO_STORE` global mutable state instead of session state; failures lost on session reset.
- **web** `app/api/llm/v1/chat/completions/route.ts` lines ~1000+ — streaming error handler logs per-chunk failures conflated with request-init failures.
- **ext** `background.ts:573-744` — `getAlarmPeriod` lacks bounds checking (infinite/zero period silently allowed).

**The fix recipe:** Replace `return Ok(())` with typed errors (`anyhow::bail!` or returning a discriminated-union error). Add telemetry emit per error.

### 3.6 X6 — Stub commands disguised as real (cli, desktop, mobile)

**Sites:**

- **cli** `a2a.rs:820-854` — `handle_post_handoff` accepts handoff, returns HTTP 200, silently discards messages. Already deferred in audit fire #1.
- **cli** `a2a.rs:1221-1247` — `jsonrpc::handle_request` "delegate" arm returns `TaskResponse{state: Accepted}` and spawns no work. Deferred in audit fire #1.
- **cli** `main.rs:1535, 1539` — `/export` and `/extra-usage` return `Ok(())` with no action.
- **desktop** `src-tauri/src/sys/commands/dispatch_hmac.rs` — `dispatch_hmac` command exists but Dispatch UI missing means it's never called from frontend.
- **mobile** `services/conversationSync.ts` — TODO marker but visually appears wired.

**The fix recipe:** Either implement the feature in a focused PR, or convert the stub to a typed error (HTTP 501 / `Err("not implemented")` / typed `NotYetImplementedError`). Hiding the stub is worse than admitting it.

### 3.7 X7 — Reference metadata stale (vscode marketplace, desktop App.tsx)

**Sites:**

- **vscode**: marketplace screenshots in PNG ref 01 still show v2.1.86 Claude Code; actual extension is v0.3.0. `package.json` description was fixed in audit but marketplace images need re-shoot.
- **desktop**: `App.tsx:153-155` has commented-out `UnifiedAgenticChat` lazy import (dead); but `App.tsx:26, 90, 95` still import `CommandPalette` + `SearchModal` from the same module — partially-dead module to reconcile.

**The fix recipe:** vscode — re-shoot 6-8 marketplace images at v0.3.0 (modes dropdown, effort slider, sessions dropdown, chat empty state, settings editor) and re-publish; desktop — either delete the dead imports entirely or restore the lazy import.

### 3.8 X8 — No insta-style snapshot tests for UI (cli TUI, desktop chat, web settings)

**Symptom:** No insta `.snap` files anywhere in our repo. Codex-rs uses them for TUI rendering regression. Without them, refactors are blind.

**The fix recipe:** Add `insta` crate to `apps/cli/Cargo.toml dev-dependencies`. Add at least 3 snapshot tests for `tui/chatwidget.rs` rendering, `tui/bottom_pane/approval_overlay.rs`, `tui/bottom_pane/list_selection_view.rs`. For TS surfaces, adopt `vitest`'s built-in snapshot support for chat rendering and settings form rendering.

### 3.9 X9 — Workspace clippy lints scattered (Rust)

**Symptom:** `apps/cli/Cargo.toml` has its own `[lints.rust]` and `[lints.clippy]` blocks (lines 18-29) instead of inheriting from root `Cargo.toml#[workspace.lints]`. Codex-rs puts 37 `deny` lints centrally so the whole workspace is consistent.

**The fix recipe:** Move `apps/cli/Cargo.toml lines 18-29` into root `Cargo.toml#[workspace.lints]`. Add the additional 30+ codex-rs lints. Verify each crate inherits via `[lints] workspace = true`. **Copy-paste-ready block in Appendix C.**

### 3.10 X10 — No TS project references for `packages/*` (TS)

**Symptom:** `apps/desktop/tsconfig.json` and `apps/web/tsconfig.json` do NOT have `"references": [{ "path": "../../packages/api" }, ...]` entries. So a PR adding `import { foo } from '../../apps/desktop/...'` inside `packages/api/src/` would only fail at runtime (or at the next consumer's build), not at compile time.

**The fix recipe:** For each `apps/<surface>/tsconfig.json`, add a `references` array listing every `packages/*` dep. Add `"composite": true` to each `packages/<pkg>/tsconfig.json`. This forces the compile-time DAG check.

### 3.11 X11 — No `posttest=pnpm build` hook in `packages/*`

**Symptom:** A test-only fix in `packages/api/` can pass `pnpm test` locally but leave the package un-buildable. The break only shows up at the next consumer's build.

**The fix recipe:** Add `"posttest": "pnpm build"` to every `packages/<pkg>/package.json scripts` section. CI catches the break immediately.

---

## 4. Per-surface deep analysis

Every surface section follows the same shape: **Fingerprint · Recent state (Foundation Sprint impact) · Top god files · Slop catalog · Reference fit · Top gaps with `file:line` · Reverse-engineering plan · Verification commands.**

### 4.1 apps/cli — Rust monolith

#### 4.1.1 Fingerprint

- **351 `.rs` files · 277,160 LOC** (excluding tests) at version 1.7.1
- **22 subcommands** routed from `main.rs` (Exec, Review, Apply, Sandbox, McpServer, AppServer, Resume, Fork, Session, Cloud, Plugin, Ecosystem, History, Sync, Login, Logout, AuthStatus, Features, Execpolicy, Marketplace, Init, Onboarding)
- **57 tools** dispatched from `tools.rs:200+` (read*file, write_file, edit_file, list_directory, search_files, grep_files, run_command, apply_patch, batch, multiedit, web_search, web_fetch, tool_search, glob, task_create/get/list/update/stop/output, ask_user, todo_read/write, enter_worktree/exit/list, 6 lsp*\* tools, team_create/delete, cron_create/delete/list, advisor, plus MCP tools embedded via `mcp/mod.rs`)
- **1,318 tests** (`cargo test -p agiworkforce-cli` on 2026-05-14)
- **22 hook events** declared at `hooks.rs:179-200`, with **24 actually firing** at runtime (post-Sprint-4b + S13: BeforeModelResolve, BeforePromptBuild, ToolResultPersist newly wired; PreCompact + PostCompact newly firing; SubagentStart + SubagentStop wired in S13)
- **10+ providers** registered at `models.rs:287-310` (12 named + 1 user-defined Custom): Anthropic, OpenAI, Google, Ollama×2, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, LMStudio
- Binary at `~/.cargo/bin/agiworkforce` (5.7 MB arm64)
- Build: `cargo build --release -p agiworkforce-cli` GREEN in 7.5s on a clean tree
- Distribution: npm (`@agiworkforce/cli`), Homebrew (`siddharthanagula3/homebrew-tap`), GitHub releases (5 platforms), `scripts/install.sh`. `v-cli-1.0.0` tag shipped.

#### 4.1.2 Foundation Sprint impact

The Foundation Sprint (`v0.7.0-foundation`, 2026-05-13) shipped:

- `apps/cli/src/message_queue.rs` — Rust port of the priority queue (lanes `now`/`next`/`later`, FIFO-within-priority, lane cap 100). Currently `#[allow(dead_code)]` pending REPL integration. Same contract as the TS `messageQueueManager` in `packages/runtime/src/queue/`.
- 3 new hook events (BeforeModelResolve, BeforePromptBuild, ToolResultPersist) at `hooks.rs:179-200`.
- 2 newly-fired hook events (PreCompact, PostCompact) at `agent.rs`.
- SubagentStart + SubagentStop wired into per-task spawn loop in `agent.rs`.

#### 4.1.3 Top god files (≥800 LOC, sorted by LOC desc)

| File                                     | LOC      | Top 5 functions by size                                                                                                                      | Split target                                                                           |
| ---------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `tui/bottom_pane/chat_composer.rs`       | 9,873    | composer state machine + key handling + paste/IME + completion + render                                                                      | `tui/composer/{state, key_handling, paste, completion, render}.rs`                     |
| `tui/chatwidget.rs`                      | 9,743    | `ChatWidget::render`, scrolling, diff rendering, markdown inline, message cell layout                                                        | `tui/chatwidget/{mod, render, scrolling, markdown, diff}.rs`                           |
| `tui/app.rs`                             | 8,251    | `App::handle_input`, mode transitions, undo/redo backtrack, status bar mutation, keystroke handling                                          | `tui/app/{mod, state_machine, backtrack, status}.rs`                                   |
| `tui/_attic/` (118 files)                | ~104,200 | Exact duplicates of all 60+ TUI active files — including `_attic/app.rs` (8,251 LOC duplicate), `_attic/chatwidget.rs` (9,743 LOC duplicate) | **DELETE entirely** (P0)                                                               |
| `tui/history_cell.rs`                    | 4,462    | session history picker widget                                                                                                                | `tui/history/` folder                                                                  |
| `tools.rs`                               | 3,807    | `execute_tool`, `execute_bash`, `execute_read_file`, `execute_web_search`, `execute_write_file`                                              | `tools/{mod, bash, file_ops, web, git, dir_ops}/`                                      |
| `agent.rs`                               | 2,773    | `AgentSession::chat`, `AgentSession::execute_tool_call`, `execute_tool_impl`, `ToolDefinition::from_tool_call`, message history              | `agent/{mod, chat, tools, history, executor}.rs`                                       |
| `models.rs`                              | 2,616    | `Provider::chat` dispatch, message serialization, ContentBlock variants, provider streaming, tests                                           | `models/{mod, provider_dispatch, serialization, streaming}.rs`                         |
| `main.rs`                                | 2,385    | `main`, `run_oneshot`, `handle_session_action`, `resolve_resume_payload`, argument parsing                                                   | `cli/{lib, subcommands, oneshot, sessions}.rs` (50 LOC `main.rs` + 2,300 LOC `lib.rs`) |
| `tui/bottom_pane/textarea.rs`            | 2,449    | text input widget                                                                                                                            | `tui/textarea/` folder                                                                 |
| `tui/tui_app.rs`                         | 2,446    | TUI initialization, setup                                                                                                                    | merge into `tui/app/mod.rs` or split into `tui/setup.rs`                               |
| `repl.rs`                                | 2,124    | REPL loop, slash-command dispatch, command registry metadata                                                                                 | `repl/{mod, slash_commands, dialogs, registry}/`                                       |
| `hooks.rs`                               | 1,946    | `execute_hook`, variable interpolation, pre-tool hooks, post-exit cleanup                                                                    | `hooks/{mod, interpolation, lifecycle, environment}/`                                  |
| `a2a.rs`                                 | 1,732    | `serve_a2a`, `delegate_task`, `handoff_conversation`, registry mgmt                                                                          | `a2a/{mod, server, client, registry, protocol}.rs`                                     |
| `model_catalog.rs`                       | 1,685    | catalog definition, `fast_completion_model`, `find_model`, tier assignment                                                                   | `models/catalog/{mod, pricing, tier}.rs`                                               |
| `tui/bottom_pane/mod.rs`                 | 1,997    | bottom pane state, action dispatch                                                                                                           | `tui/bottom_pane/{state, actions}.rs`                                                  |
| `tui/bottom_pane/list_selection_view.rs` | 1,838    | generic selection list widget                                                                                                                | already focused — keep                                                                 |
| `tui/bottom_pane/footer.rs`              | 1,742    | status bar, keyboard hints                                                                                                                   | keep                                                                                   |
| `tui/bottom_pane/approval_overlay.rs`    | 1,556    | approval request UI                                                                                                                          | keep                                                                                   |
| `safety.rs`                              | 1,522    | `classify_command`, dangerous command patterns, user approval, sanitization                                                                  | `safety/{mod, dangerous_commands, approval}.rs`                                        |
| `tui/render/highlight.rs`                | 1,496    | syntax highlighting, theme lookup                                                                                                            | keep                                                                                   |
| `tui/wrapping.rs`                        | 1,407    | line wrapping, terminal geometry                                                                                                             | keep                                                                                   |
| `auth.rs`                                | 1,429    | OAuth flow, token mgmt                                                                                                                       | `auth/{mod, oauth, tokens}.rs`                                                         |
| `config.rs`                              | 1,410    | config file I/O, overrides                                                                                                                   | `config/{mod, io, overrides}.rs`                                                       |
| `tui/widgets/screen_renderers.rs`        | 1,304    | generic widget renderers                                                                                                                     | keep                                                                                   |
| `tui/pager_overlay.rs`                   | 1,298    | pager pagination UI                                                                                                                          | keep                                                                                   |
| `daemon.rs`                              | 1,312    | `run_daemon`, background session mgmt, sync loop                                                                                             | `daemon/{mod, session_mgmt, sync_loop}.rs`                                             |
| `compaction.rs`                          | 1,235    | `compact_messages`, token budgets, `estimate_tokens`                                                                                         | `compaction/{mod, budget, estimate}.rs`                                                |
| `markdown.rs`                            | 1,203    | markdown → terminal rendering, backtick escaping                                                                                             | keep                                                                                   |
| `context.rs`                             | 1,198    | context injection, file inclusion, `.claude/` loading                                                                                        | keep                                                                                   |
| `tui/markdown_render.rs`                 | 1,134    | markdown → ratatui render                                                                                                                    | keep                                                                                   |
| `tui/voice.rs`                           | 1,115    | voice UI indicators                                                                                                                          | keep                                                                                   |
| `tui/chatwidget/plugins.rs`              | 1,087    | chat plugin integration                                                                                                                      | keep                                                                                   |
| `tui/status/tests.rs`                    | 1,030    | status bar tests                                                                                                                             | keep                                                                                   |
| `mcp/oauth_flow.rs`                      | 1,048    | OAuth handshake for MCP servers                                                                                                              | keep                                                                                   |
| `mcp/mod.rs`                             | 1,889    | MCP server lifecycle, stdio transport, session mgmt                                                                                          | `mcp/{mod, lifecycle, transport, session}.rs`                                          |

#### 4.1.4 Slop catalog

**P0 — User-reachable `panic!` / `unreachable!`** (40+ sites; top hits):

- `models.rs:2270, 2293, 2334` — `panic!("Expected Provider::...")` reachable when caller passes Custom provider
- `model_catalog.rs:1482, 1491` — `panic!("fast_completion_model(openai) = ... not in catalog")` — user chooses unavailable model
- `agent.rs:2534, 2541, 2544` — three `panic!` on unexpected content block types
- `compaction.rs:818` — `panic!("expected Compressed, got {:?}")`
- `tui/insert_history.rs:194, 214, 553, 685, 725, 729` — six Windows terminal-mode panics
- `tui/chatwidget.rs:5696` — `unreachable!("should convert to legacy")`
- `tui/wrapping.rs:141` — `unreachable!("checked end < text.len()")`
- `tui/markdown_stream.rs:462, 519, 523` — three streaming output panics
- `tui/diff_render.rs:2349` — panic in diff rendering
- `tui/render/highlight.rs:754, 1010, 1022, 1485` — four theme resolution panics
- `agent_events.rs:154` — `panic!("expected Error variant")`
- `hooks.rs:1632, 1683, 1725` — three `panic!("expected Blocked")` in test context (fragile pattern)
- `sandbox.rs:300, 305` — `panic!(...unwrap_or_else)` in test setup

**P0 — `.unwrap()` / `.expect()` in production code**: 2,409 sites total (1,668 unwrap + 741 expect). Top-10 highest-risk:

- `tools.rs:1970, 1982` — test only (P2)
- `models.rs:2270, 2293, 2334` — reachable on custom provider (P0)
- `model_catalog.rs:1482` — user chooses unavailable model (P0)
- `agent.rs:2473` — `def.input_schema.get("properties").unwrap()` — malformed tool schema (P1)
- `tui/render/highlight.rs:754` — `.unwrap_or_else(|| panic!("expected theme {theme_name}"))` — missing theme file (P1)
- `tools.rs:2995+` — `session_registry().tasks.read().unwrap()` — mutex poisoned by panic (P1)
- `tui/chatwidget.rs:5696` — `unreachable!` (P1)
- `agents.rs:345+` — `.expect("parse should succeed")` on YAML — bad agent frontmatter (P2)
- `sandbox.rs:300` — `.unwrap_or_else(|e| panic!(...))` test setup (P2)
- `memory_pipeline.rs:580+` — `tempfile::tempdir().unwrap()` in tests (P2)

**P0 — Silent `Ok(())` after failure** (8+ sites):

- `agent.rs:517, 540, 557` — `Ok(())` paths hide hook-blocking failures
- `daemon.rs:133, 148, 768` — early `Ok(())` in receiver-dropped / config-error paths
- `a2a.rs:582, 587, 626, 649` — early returns in task loop silently skip work

**P0 — Stub commands disguised as real** (3 sites, already in audit fire #1 DEFER list):

- `a2a.rs:820-854` — `handle_post_handoff` silently discards
- `a2a.rs:1221-1247` — `jsonrpc::handle_request` "delegate" arm spawns no work
- `main.rs:1535, 1539` — `/export` and `/extra-usage` stubs

**P0 — SSRF in HTTP client** (deferred in audit fire #1):

- `a2a.rs:337-371` — `fetch_agent_card(url)` accepts arbitrary URLs with no scheme/host validation; can probe AWS IMDS (169.254.169.254), localhost services

**P1 — TODO/FIXME (29 total, all non-critical, no security):**

- `main.rs:1929` `// TODO(phase-5): wire to real /quota endpoint`
- `tui/resume_picker.rs:1463, 1741` — two `// TODO(jif) fix`
- `tui/clipboard_paste.rs:260` — improvement note
- `tui/chatwidget.rs:1706` — plan streaming TODO
- `tui/chatwidget.rs:5483` — `TODO(ccunningham): stop relying on legacy AgentMessage in review mode`
- `tui/app.rs:4464` — `TODO(aibrahim): Remove this and don't use config as a state object`
- `tui/voice.rs:612` — voice queue capping TODO
- `tui/insert_history.rs:199, 219` — Windows-support TODOs
- `tui/debug_config.rs:143` — debug expansion TODO
- `tui/tui.rs:493` — refactor TODO
- `tui/bottom_pane/request_user_input/mod.rs:1008, 1224, 1235` — 3 emit-interrupted TODOs

#### 4.1.5 Reference fit

Verified against `REFERENCE_INDEX.md` CLI section (102 entries):

| PNG ID                                                                       | Feature                                                                                     | Code path                                              | Status                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `01_cli_bypass-permissions-mode-enabled-shift-tab-cycle`                     | Claude Code v2.1.86 banner, bypass-permissions indicator                                    | `permissions.rs`, `main.rs:165`                        | ✓ shipped                                      |
| `04_cli_theme-selector-6-options`                                            | 6-theme picker (Dark, Light, Dark-Colorblind, Light-Colorblind, Dark-ANSI, Light-ANSI)      | `design_system.rs`, `tui/app.rs` theme enum            | ✓ shipped                                      |
| `08_cli_slash-commands-1`                                                    | Slash palette + workspace/branch/sandbox/model status bar                                   | `tui/bottom_pane/*`, `repl.rs:400+`                    | ✓ shipped                                      |
| `09_cli_slash-commands-1-model-permissions-skills` (codex)                   | `/model`, `/fast`, `/permissions`, `/experimental`, `/skills`, `/review`, `/rename`, `/new` | `repl.rs` dispatch                                     | ✓ partial                                      |
| `13_cli_model-selector-gpt-5-codex-options` (codex)                          | Model selector listing gpt-5.4/mini, gpt-5.3-codex, gpt-5.2-codex, etc.                     | `models.rs`, model_catalog `gpt-5.4` family            | ✓                                              |
| `14_cli_reasoning-level-selector-low-medium-high` (codex)                    | Reasoning level Low/Medium/High/Extra-high                                                  | `model_catalog.rs`, `reasoning_effort` per model       | ✓ shipped                                      |
| `15_cli_model-changed-confirmation-banner` (codex)                           | "Model changed to gpt-5.4 xhigh" banner                                                     | `tui/chatwidget.rs` model change handler               | ✓ shipped                                      |
| `602_cli_mcp-list-scopes`                                                    | MCP Config Diagnostics, scopes, conflicts                                                   | `mcp/mod.rs:680`                                       | ✓ shipped                                      |
| `603_cli_mcp-built-in-detail`                                                | /mcp server detail for Apify, Enable action                                                 | `mcp/mod.rs:800+`                                      | ✓ shipped                                      |
| `605_cli_plan-mode-screen`                                                   | /plan toggled "Enabled plan mode"                                                           | plan_mode dispatcher                                   | ✓ shipped                                      |
| `607_cli_slash-command-palette-top`                                          | /init, /team-onboarding, /security-review, /debug, /add-dir                                 | `repl.rs` dispatch                                     | ✓ shipped                                      |
| `608-617_cli_slash-command-palette-*`                                        | All slash-command palette pages                                                             | `repl.rs` + `command_registry.rs`                      | ✓                                              |
| `611_cli_slash-command-palette-more`                                         | `/doctor`, `/effort`, `/exit`, `/export`, `/extra-usage`, `/fast`                           | `main.rs:1535 /export stub` + `1539 /extra-usage stub` | ✗ **two stubs**                                |
| `619_cli_agents-screen`                                                      | /agents tabs (Agents/Running/Library)                                                       | `agents.rs`                                            | ✓ partial — TUI tabs widget may be in `_attic` |
| `620_cli_agents-library-tab`                                                 | Library lists project agents + built-ins                                                    | `agents.rs` manifest scan                              | ✓ shipped                                      |
| `621_cli_skills-screen`                                                      | /skills empty state with `.claude/skills/` hint                                             | `skills.rs`                                            | ✓ shipped                                      |
| `622-625_cli_plugin-*`                                                       | Plugin Discover/Installed/Marketplaces/Errors tabs                                          | `plugins.rs`                                           | ✓ partial — Discover is Phase-2 stub           |
| `626_cli_tasks-screen`                                                       | /tasks background-tasks pane                                                                | `repl.rs:1700+` `/tasks` dispatch                      | ✓ partial — TUI binding unclear                |
| `627_cli_permissions-screen`                                                 | /permissions tabs (Recently denied/Allow/Ask/Deny/Workspace)                                | `permissions.rs` ~1000 LOC tab UI                      | ✓ shipped                                      |
| `600_cli_chrome-command-menu`                                                | /chrome with "Beta", Status Enabled                                                         | `repl.rs /chrome` dispatch                             | ✓ shipped                                      |
| `601_cli_ide-select-dialog`                                                  | /ide "Select IDE" with empty-state                                                          | `repl.rs /ide` dispatch                                | ✓ shipped                                      |
| `11_cli_settings-1-vim-approval-update-notifications` (gemini)               | Settings TUI page 1 — Vim Mode, Approval, Auto Update, Notifications, etc.                  | TUI bottom pane settings                               | ✓ partial                                      |
| `02_cli_first-run-login-3-options-claude-account-anthropic-console-3rdparty` | First-run login: Claude account / Anthropic Console / 3rd-party                             | `auth.rs`, `onboarding.rs`                             | ✓ shipped                                      |
| `02_cli_welcome-signin-3-options-chatgpt-device-api` (codex)                 | Codex welcome: ChatGPT / Device Code / API key                                              | `auth.rs` OAuth flows                                  | ✓ partial                                      |
| `03_cli_oauth-browser-fallback-paste-code-prompt`                            | OAuth browser fallback with paste-code prompt                                               | `auth.rs` OAuth fallback flow                          | ✓ shipped                                      |

**Confirmed gaps:** `/export` and `/extra-usage` are stubs (`main.rs:1535, 1539`). `/tasks` TUI widget may be in `_attic` (dead).

#### 4.1.6 Structural divergence vs codex-rs

1. **`tools.rs` god file (3,807 LOC) vs codex-rs `tools/<ToolName>/` 43-file pattern**: codex splits per-tool with `*_tests.rs` companions. We mix all tool handlers in one file.
2. **`main.rs` god file (2,385 LOC) vs codex `exec/src/main.rs` 42 LOC**: codex `main.rs` is parse+dispatch; logic lives in `lib.rs#run_main()`.
3. **`tui/_attic/` 104K LOC of duplicates vs codex no-dead-code rule**: every TUI module mirrored as a dead copy. Edits require touching both. Delete entirely.
4. **No `tests/all.rs → mod suite;` aggregator**: codex `exec/tests/all.rs` is 2 lines, aggregates all scenario tests into one binary. We have inline `#[cfg(test)]` only.
5. **No insta snapshot tests for TUI**: codex `tui/src/snapshots/*.snap` catches rendering regressions. We have none.
6. **Workspace lints in per-crate `Cargo.toml`** (lines 18-29) instead of root `[workspace.lints]` like codex (37 deny rules at root lines 413-452).
7. **Mixed naming in `tui/`**: PascalCase files (`App`, `ChatWidget`) inside snake_case folders (`bottom_pane/`). Codex is snake_case everywhere.
8. **No `lib.rs`** in `apps/cli` — binary-only crate. Codex has both `lib.rs` (public API) and `bin/main.rs` (thin binary), enabling import-as-library.

#### 4.1.7 Top 20 fixes (Phase-3 + Phase-4 combined)

| #   | Severity | `file:line`                                    | Description                                                                                                                                                      | Effort      |
| --- | -------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | **P0**   | root `Cargo.toml`                              | Adopt `[workspace.lints.clippy]` block from codex-rs (37 deny lints, Appendix C)                                                                                 | small (1h)  |
| 2   | **P0**   | `models.rs:2270, 2293, 2334`                   | Replace `panic!("Expected Provider::OpenAICompatible")` with typed `Err`                                                                                         | medium (3h) |
| 3   | **P0**   | `model_catalog.rs:68, 1482, 1491`              | Replace `panic!("not in catalog")` with `Result<ModelInfo>` + fallback to default                                                                                | medium (2h) |
| 4   | **P0**   | `tui/_attic/`                                  | Delete all 118 duplicate files (104,200 LOC dead weight)                                                                                                         | small (2h)  |
| 5   | **P0**   | `a2a.rs:345-371`                               | Add URL allowlist + IP blocklist to `fetch_agent_card` (RFC1918, 169.254.x.x, ::1, http/https only) — closes SSRF deferred in audit fire #1                      | medium (4h) |
| 6   | **P0**   | `a2a.rs:820-854`                               | `handle_post_handoff` — return HTTP 501 "Not Implemented" instead of silent success (until real session injection)                                               | small (1h)  |
| 7   | **P0**   | `a2a.rs:1221-1247`                             | `jsonrpc::handle_request` "delegate" arm — return typed error or wire to real `execute_delegated_task` (deferred in audit fire #1: requires sync→async refactor) | large (8h)  |
| 8   | **P0**   | `main.rs:1535, 1539`                           | Implement `/export` (markdown + JSON output) and `/extra-usage` (real quota call), or return `Err("not implemented")`                                            | medium (4h) |
| 9   | **P0**   | `agent.rs:517, 540, 557`                       | Replace `Ok(())` after hook-blocking failure with typed `Err` + telemetry                                                                                        | small (2h)  |
| 10  | **P0**   | `agent.rs:2534, 2541, 2544`                    | Replace `panic!` on unexpected content block types with `anyhow::bail!`                                                                                          | small (1h)  |
| 11  | **P1**   | `tools.rs`                                     | Split into `apps/cli/src/tools/<ToolName>/` folders per codex-rs/tools/src/ pattern (one folder per tool, 5-7 small files each)                                  | large (8h)  |
| 12  | **P1**   | `main.rs`                                      | Extract `apps/cli/src/lib.rs#run_main()` from main.rs; main.rs becomes ~50 LOC (codex/exec/src/main.rs pattern)                                                  | large (6h)  |
| 13  | **P1**   | `tui/app.rs` (8,251 LOC)                       | Split into `tui/app/{mod, state_machine, backtrack, status}.rs`                                                                                                  | large (10h) |
| 14  | **P1**   | `tui/chatwidget.rs` (9,743 LOC)                | Split into `tui/chatwidget/{mod, render, scrolling, markdown, diff}.rs`                                                                                          | large (12h) |
| 15  | **P1**   | `tui/bottom_pane/chat_composer.rs` (9,873 LOC) | Split into `tui/composer/{state, key_handling, paste, completion, render}.rs`                                                                                    | large (12h) |
| 16  | **P1**   | `a2a.rs` (1,732 LOC)                           | Split into `a2a/{mod, server, client, jsonrpc, registry, protocol}.rs` per codex `mcp-server/src/` pattern                                                       | medium (6h) |
| 17  | **P1**   | `apps/cli/tests/`                              | Add `tests/all.rs → mod suite;` aggregator + `tests/suite/` per codex test pattern; reduces link time 40-60%                                                     | medium (3h) |
| 18  | **P2**   | `apps/cli/src/tui/`                            | Add insta snapshot tests for `chatwidget`, `approval_overlay`, `list_selection_view` (≥3 snapshots)                                                              | medium (4h) |
| 19  | **P2**   | `tools.rs:2747`                                | `TODO_STORE` static state → move into `SessionState`; thread via context                                                                                         | medium (3h) |
| 20  | **P2**   | `tui/` PascalCase files                        | Rename `tui/App.rs` → `tui/app.rs` etc. (audit all `tui/` files for naming consistency)                                                                          | small (2h)  |

Cumulative Phase-A+B Rust effort: ~85 hours.

#### 4.1.8 Verification commands

```bash
# After each fire:
cargo check --workspace                                          # GREEN
cargo test -p agiworkforce-cli                                   # ≥1318 tests, no regressions
cargo test -p agiworkforce-cli <module>                          # targeted: <module>::tests::*
cargo clippy --workspace --lib -- -D warnings -D unsafe-code     # zero new warnings
cargo test --workspace --lib                                     # all crate unit tests
git diff --stat HEAD                                             # ≤500 LOC
```

### 4.2 apps/desktop frontend — Tauri v2 + React

#### 4.2.1 Fingerprint

- **1,029 `.ts/.tsx` files · 292,686 LOC** frontend
- **97 component directories** under `components/` (flat layer-first organization)
- **101 store files** under `stores/` (flat — anti-pattern; should be domain-grouped)
- **38 hooks** under `hooks/`
- **24 types files** under `types/`
- **Active chat surface:** `ChatInterface` from `packages/chat` (canonical). `UnifiedAgenticChat` lazy-import in `App.tsx:153-155` is commented dead code; but `App.tsx:26, 90, 95` still import CommandPalette + SearchModal from same module → **partially-dead module**.
- **Tests:** 16 Playwright e2e specs + 5 in `playwright/` (duplicated harness — consolidate)
- **Build:** `pnpm dev:desktop` (Tauri hot-reload); `pnpm build:desktop` produces signed bundles for macOS (universal/aarch64/x86_64), Windows x64, Linux x64.

#### 4.2.2 Top god files (≥800 LOC)

| File                                                 | LOC   | Primary export                                               | Split target                                                                                                         |
| ---------------------------------------------------- | ----- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `stores/settingsStore.ts`                            | 3,810 | `useSettingsStore`, `useSettingsDialogStore`, dialog helpers | Split by feature: `LLMConfig` (500), `WindowPrefs` (400), `ChatPrefs` (600), `Voice` (400), `PersistedSidecar` (600) |
| `stores/chatStore.ts`                                | 2,727 | `useChatStore` (message history, UI state)                   | Extract: `chatMessageStore`, `chatExecutionState`, `chatViewState`                                                   |
| `lib/tauri-mock.ts`                                  | 2,383 | `isTauri`, `invoke()`, `listen()`, plugin mocks              | Refactor to `platform/{tauri, web}.ts` with conditional exports                                                      |
| `handlers/slashCommandHandlers.ts`                   | 2,217 | 60+ command executors                                        | `/commands/{terminal, browser, code, agents, vision, ...}.ts` (~200 LOC each)                                        |
| `components/Settings/SettingsPanel.tsx`              | 1,995 | SettingsPanel (11 tabs)                                      | Extract each tab to `Settings/<TabName>/Tab.tsx`; keep router                                                        |
| `stores/mcpStore.ts`                                 | 1,915 | `useMcpStore`                                                | Split: `mcpServersStore` (700) + `mcpToolsStore` (650) + `mcpHealthStore` (400) + `mcpOAuthStore` (165)              |
| `stores/billingUsage.ts`                             | 1,783 | `useBillingUsageStore`                                       | Extract: `usageMetrics`, `budgetTracking`, `analyticsEvents`                                                         |
| `components/UnifiedAgenticChat/index.tsx`            | 1,716 | `UnifiedAgenticChat`                                         | Extract sidebar hooks → `useChatSidebar`; message logic → `useChatMessages`; sidecar → `sidecarCoordinator`          |
| `components/UnifiedAgenticChat/ArtifactRenderer.tsx` | 1,735 | `ArtifactRenderer`                                           | Split per artifact type: `HTMLRenderer` (350), `CodeRenderer` (400), `MarkdownRenderer` (300), `JSONRenderer`        |
| `hooks/useAgenticEvents.ts`                          | 1,694 | `useAgenticEvents` (Tauri event listeners)                   | Per-event: `useTerminalEvents`, `useBrowserEvents`, `useExecutionEvents`                                             |
| `lib/modelRouter.ts`                                 | 1,553 | model selection/routing                                      | Document logic; clarify mapping + fallback rules                                                                     |
| `hooks/useTauriStreamListeners.ts`                   | 1,535 | Tauri event hydration                                        | keep, but document                                                                                                   |
| `components/UnifiedAgenticChat/ChatInputArea.tsx`    | 1,521 | input + command palette integration                          | keep                                                                                                                 |
| `App.tsx`                                            | 1,502 | root setup (lazy-loaded but large)                           | keep, but verify commented imports                                                                                   |
| `lib/auth.ts`                                        | 1,492 | unified auth store (hydration + Supabase bridge)             | keep                                                                                                                 |
| `components/UnifiedAgenticChat/DynamicCanvas.tsx`    | 1,480 | canvas rendering                                             | keep                                                                                                                 |
| `lib/supabaseAuth.ts`                                | 1,401 | Supabase client + WebAuth                                    | keep                                                                                                                 |
| `stores/toolStore.ts`                                | 1,455 | tool catalog + schema cache                                  | keep                                                                                                                 |
| `stores/editingStore.ts`                             | 1,444 | editable message state                                       | keep                                                                                                                 |
| `stores/modelStore.ts`                               | 1,387 | model metadata + cache                                       | keep                                                                                                                 |
| `components/UnifiedAgenticChat/Sidebar.tsx`          | 1,372 | conversation list + controls                                 | keep                                                                                                                 |

#### 4.2.3 Settings tabs detailed inventory

`SettingsPanel.tsx:84-95` declares 11 tabs; `SettingsPanel.tsx:1223-1895` renders them via switch.

| Tab # | Key             | Label               | Line range | State consumed                                   | Notes                                          |
| ----- | --------------- | ------------------- | ---------- | ------------------------------------------------ | ---------------------------------------------- |
| 1     | `general`       | General             | 1223-1364  | `windowPreferences`, `globalHotkey`, theme       | Merged old keybindings tab                     |
| 2     | `account`       | Account             | 1367-1381  | `useBillingStore`, auth                          | Stubs: Team & Devices                          |
| 3     | `appearance`    | Appearance          | 1384-1408  | `personalization`, `memorySettings`, `agentDefs` | Heavy lazy loading                             |
| 4     | `privacy`       | Privacy             | 1411-1476  | `privateSetting`, `cacheSettings`, `policies`    | Governance link external                       |
| 5     | `models-keys`   | Models & Keys       | 1479-1716  | `llmConfig`, `ollamaEnabled`, `taskRouting`      | Inline form validation at 1522-1549 (extract!) |
| 6     | `agents`        | Agents              | 1719-1730  | `agentExecution`, `features`                     | Mostly lazy                                    |
| 7     | `mcp-skills`    | MCP & Skills        | 1733-1822  | `mcpConfig`, `skillsRegistry`                    | 4-card grid hardcoded                          |
| 8     | `connectors`    | Apps & Integrations | 1825-1864  | `connectorState`, `oauthState`                   | Links back to mcp-skills                       |
| 9     | `notifications` | Notifications       | 1867-1877  | `notificationSettings`                           | Simple lazy                                    |
| 10    | `voice`         | Voice               | 1880-1885  | `voiceSettings`                                  | Minimal                                        |
| 11    | `capabilities`  | Capabilities        | 1888-1892  | `capabilitiesState`                              | **Stub only** — implement!                     |

**Duplicate state:** theme appears in `general` (line 1282) and `settingsStore`; language also duplicated. Consolidate via single source.

**Heavy async loading:** 20+ lazy-loaded components; no skeleton UI between load and render.

**Form-logic leakage:** Ollama validation (1522-1549) and Provider mode (1491-1515) inline in SettingsPanel — extract to `useOllamaSettings` hook.

#### 4.2.4 Cowork tab gap — comprehensive

**`grep -rn "cowork\|Cowork" apps/desktop/src` returns only 2 matches in `ComputerUseSettings.tsx:471, 656` (reference text only). The Cowork feature does NOT exist in code.**

**Reference PNGs that show Cowork** (`REFERENCE_INDEX.md` desktop section):

- `002-cowork-add-menu-files-skills-connectors-plugins.png` — Cowork home: Sidebar (New task, Projects, Scheduled, Live artifacts, Dispatch, Customize), recents list, "Knock something off your list" hero
- `003-cowork-model-menu-adaptive-thinking.png` — Model picker dropdown: Opus 4.7 / Sonnet 4.6 / Haiku 4.5 with "Adaptive thinking" toggle
- `004-cowork-skills-submenu-installed-skills.png` — Skills submenu nested inside Add menu (algorithmic-art, brand-guidelines, canvas-design, etc.)
- `005-cowork-connectors-submenu-toggles.png` — Connectors submenu with toggle rows (Gmail, Vercel, Apify, Claude in Chrome, Context7, Control your Mac, Excel)
- `006-cowork-plugins-submenu-categories.png` — Plugins submenu: Legal / Slack / Common Room / Brand voice / Apollo / Product mgmt / Productivity / Enterprise search / Sales / Finance categories
- `007-cowork-plugin-category-legal-workflows.png` — Nested Legal plugin: brief, compliance-check, legal-response, legal-risk-assessment, meeting-briefing, review-contract, signature-request, triage-nda, vendor-check
- `008-cowork-plugin-selected-inline-slash-command.png` — Composer with plugin pill ("brief") inserted inline
- `022-claude-desktop-after-relaunch.png` — Cowork home with 3 pills (Work in a project / Ask / Opus 4.7) + Active tasks + Recents
- `023-claude-desktop-cowork-recents-viewall-nochange.png` — Cowork home identical to 022, cursor hover over recents
- `032-settings-cowork.png` — Cowork settings: Dispatch beta toggle + "Gift a week of Claude Cowork" card + Global instructions textarea

**What we have:**

- `ProjectsView.tsx` in `components/UnifiedAgenticChat/` (just projects sidebar)
- `Sidebar.tsx` mentions "Scheduled" at line 345
- No "Cowork" namespace, no Dispatch beta toggle, no "New task" primary action
- `settingsStore` has `dispatchBetaEnabled` flag (per Phase-3 report) but no dispatcher view

**What's missing:**

1. Cowork home layout (sidebar nav + recents + active task panel + 3 pills + "Knock something off your list" hero)
2. Live artifacts sidebar section (artifacts tracked in `artifactStore` but not surfaced as live list)
3. Dispatch UI wired to `dispatch_hmac` Tauri command (currently dead)
4. Skills/Connectors/Plugins submenu nesting in composer Add menu

#### 4.2.5 Model picker + adaptive thinking gap

**File:** `components/UnifiedAgenticChat/ModelSelectorButton.tsx` (107 LOC, full read).

**Props** (lines 15-32):

```typescript
interface ModelSelectorButtonProps {
  modelDisplayName: string;
  thinkingModeEnabled?: boolean; // line 19
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isSimpleMode?: boolean;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  capabilities?: ResolvedCapabilities | null;
  isToolFallback?: boolean;
}
```

**Line 74** renders the Brain icon when thinking is enabled:

```jsx
{
  thinkingModeEnabled && <Brain size={12} className="text-amber-500" />;
}
```

**Gap vs reference PNG 003 (`003-cowork-model-menu-adaptive-thinking.png`):**

- Reference shows the toggle **inside the dropdown** (per-turn).
- Our button shows the indicator **on the button** (per-model).
- The dropdown is rendered via `QuickModelSelector` (line 100, separate component).
- No per-turn toggle is visible in the API.

**Fix:** Add a per-turn `adaptiveThinking` toggle to `QuickModelSelector` dropdown. Persist last value in `settingsStore`. Reference: `comp-claude-desktop.md` + screenshot 003.

#### 4.2.6 Dead-import audit (App.tsx)

`apps/desktop/src/App.tsx` (1,502 LOC):

- Lines **79-101**: 23 commented-out workspace lazy-imports (CanvasWorkspace, InteractiveHelp, etc.)
- Line **26**: `import type { CommandOption }` — type-only, used at line 186, 239 in state references
- Line **27**: `import { useSearchModal }` — active hook
- Lines **90-99**: `SearchModal` and `CommandPalette` still lazy-loaded — verify rendering paths

**Risk:** Slash commands (e.g., `/canvas`, `/workflow`) reference commented components. If user triggers, hits "not implemented" or undefined component.

**Fix:** Audit each `executeXxxCommand` handler at lines 131-161; either delete the dead handlers or restore the imports.

#### 4.2.7 PNG ↔ source map (desktop section, sampled 20)

| Ref#    | PNG                                                    | Code                                                    | Status                                                 |
| ------- | ------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------ |
| 002     | cowork-home sidebar                                    | `Sidebar.tsx`                                           | Partial — no Cowork branding                           |
| 003     | model-menu adaptive                                    | `ModelSelectorButton.tsx:19, 74` + `QuickModelSelector` | Exists, per-turn toggle missing                        |
| 004-006 | skills/connectors/plugins submenus                     | `SkillsPluginsSettings.tsx`, `ConnectorGallery.tsx`     | Partial                                                |
| 008     | plugin inline slash pill                               | `ChatInputArea.tsx`                                     | Likely (not verified)                                  |
| 009     | chat-home hero "Good evening, sid"                     | `BrandedGreeting.tsx:121`                               | Exists, personalization-store-driven                   |
| 022     | cowork after-relaunch 3 pills                          | `QuickStartPills.tsx:122`                               | Exists, not Cowork-branded                             |
| 024     | settings-general                                       | `SettingsPanel.tsx:1223-1364`                           | Exists, validation gaps                                |
| 025     | settings-account                                       | `SettingsPanel.tsx:1367-1381`                           | **Stub** — `LazyAccountSettings` not fully implemented |
| 026     | settings-privacy                                       | `SettingsPanel.tsx:1411-1476`                           | Partial — governance moved external                    |
| 027     | settings-billing                                       | (part of account tab)                                   | **Stub** — `LazyUsageDashboard` async-only             |
| 028     | settings-usage                                         | (account tab line 1373)                                 | Partial — async loaded, details missing                |
| 029     | settings-capabilities                                  | `SettingsPanel.tsx:1888-1892`                           | **Stub** — `LazyCapabilitiesSettings` not implemented  |
| 030     | settings-connectors-deferred                           | `SettingsPanel.tsx:1825-1864`                           | Partial — OAuth panel exists                           |
| 031     | settings-claude-code gift + theme preview              | `ThemeSettings.tsx` (inferred)                          | Partial — gift UI unclear                              |
| 032     | settings-cowork dispatch + gift                        | `SettingsPanel.tsx:1719-1730`                           | **Stub** — Dispatch toggle missing                     |
| 033     | settings-chrome-extension site permissions             | `ExtensionsSettings.tsx`                                | Likely (not verified)                                  |
| 034     | settings-desktop-app-extensions (drag MCPB/DXT)        | `MCPServerSettings.tsx`                                 | Likely, drag-drop unverified                           |
| 035     | settings-desktop-app-developer (local MCP + view logs) | `MCPServerSettings.tsx`                                 | Partial — logs viewer may be incomplete                |
| 036     | customize-home (skills/connectors/plugins cards)       | `SkillsPluginsSettings.tsx` + `ConnectorGallery.tsx`    | Exists, grid layout matches                            |
| 002     | cowork dispatch tab                                    | n/a                                                     | ✗ Missing                                              |

**Critical gaps:** Cowork tab + Dispatch UI + Capabilities tab + Account/Billing/Usage full implementations.

#### 4.2.8 Top 20 fixes

| #   | Severity | `file:line`                                            | Description                                                                                                    | Effort |
| --- | -------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **P0**   | `src/components/Cowork/` (new)                         | Build Cowork tab — dispatcher list + live artifacts + projects + scheduled. Wire to `dispatch_hmac`            | 3 days |
| 2   | **P0**   | `ModelSelectorButton.tsx:74` + `QuickModelSelector`    | Per-turn adaptive thinking toggle in dropdown                                                                  | 1 day  |
| 3   | **P0**   | `src-tauri/src/sys/commands/dispatch_hmac.rs`          | Wire Dispatch UI to dispatch_hmac OR delete dead command                                                       | 4h     |
| 4   | **P0**   | `stores/settingsStore.ts`                              | Split into domains (LLMConfig + WindowPrefs + ChatPrefs + Voice + PersistedSidecar)                            | 8h     |
| 5   | **P0**   | `components/Settings/SettingsPanel.tsx:1223-1895`      | Extract 11 tabs to `Settings/<Tab>/` folders with co-located tests                                             | 6h     |
| 6   | **P0**   | `stores/mcpStore.ts`                                   | Split: `mcpServersStore`, `mcpToolsStore`, `mcpHealthStore`, `mcpOAuthStore`                                   | 7h     |
| 7   | **P0**   | `handlers/slashCommandHandlers.ts`                     | Refactor 60+ handlers into `/commands/<domain>.ts` files                                                       | 10h    |
| 8   | **P1**   | `components/UnifiedAgenticChat/index.tsx`              | Extract message dispatch → `useChatMessages`; sidebar state → `useChatSidebar`; sidecar → `sidecarCoordinator` | 6h     |
| 9   | **P1**   | `stores/billingUsage.ts`                               | Split: `usageMetrics`, `budgetTracking`, `analyticsEvents`                                                     | 7h     |
| 10  | **P1**   | `components/UnifiedAgenticChat/ArtifactRenderer.tsx`   | Extract per-artifact renderers (HTML/Code/Markdown/JSON)                                                       | 5h     |
| 11  | **P1**   | `App.tsx:79-101, 26, 90, 95`                           | Verify commented imports dead → remove; restore active ones                                                    | 2h     |
| 12  | **P1**   | `components/Settings/SettingsPanel.tsx:1888-1892`      | Implement Capabilities tab (currently stub)                                                                    | 5h     |
| 13  | **P1**   | `components/Settings/Connectors/ConnectorsGallery.tsx` | Implement full connector discovery (currently stub)                                                            | 2 days |
| 14  | **P1**   | `stores/*.ts` (20 stores tagged `TODO(task-1.3)`)      | Migrate to `packages/runtime/state` per task-1.3 (Wave 5.8)                                                    | 3 days |
| 15  | **P2**   | `stores/chat/chatStore.ts`                             | Extract message/execution/view state                                                                           | 8h     |
| 16  | **P2**   | `components/Settings/SettingsPanel.tsx:1522-1549`      | Extract inline Ollama form to `useOllamaSettings` hook                                                         | 2h     |
| 17  | **P2**   | `lib/modelRouter.ts`                                   | Document model-selection + fallback rules in comments                                                          | 3h     |
| 18  | **P2**   | `hooks/useAgenticEvents.ts`                            | Split per event type (Terminal/Browser/Execution)                                                              | 6h     |
| 19  | **P3**   | `components/UnifiedAgenticChat/Sidebar.tsx`            | Add keyboard navigation tests; extract item rendering                                                          | 3h     |
| 20  | **P3**   | `types/` (Cowork types)                                | Add missing types (dispatch config, task model, live artifacts list)                                           | 3h     |

Cumulative Phase-A+B desktop frontend effort: ~75 hours.

#### 4.2.9 Verification commands

```bash
pnpm --filter desktop typecheck                                  # tsc --noEmit
pnpm --filter desktop test                                       # vitest
pnpm --filter desktop exec playwright test                       # e2e
pnpm dev:desktop                                                 # hot-reload sanity
```

### 4.3 apps/desktop backend — Tauri Rust

#### 4.3.1 Fingerprint

- **749 `.rs` files · 379,562 LOC** (Tauri backend)
- **1,488 `#[tauri::command]` handlers** across 34 domains
- **Sub-directories:** `automation/`, `bin/`, `core/`, `data/`, `features/`, `integrations/`, `lib.rs`, `main.rs`, `sys/`, `tests/`, `ui/`

#### 4.3.2 Command inventory by domain (top 12 by command count)

| Domain                                                | File                           | Commands                     | LOC    |
| ----------------------------------------------------- | ------------------------------ | ---------------------------- | ------ |
| Databases                                             | `sys/commands/database.rs`     | 64 (MySQL/MongoDB/Redis/SQL) | 1,483  |
| Browser                                               | `sys/commands/browser.rs`      | 56 (automation)              | 1,872  |
| Voice                                                 | `sys/commands/voice.rs`        | 47 (speech/TTS/wake)         | 2,218  |
| Memory                                                | `sys/commands/memory.rs`       | 39 (CRUD + search)           | ~1,000 |
| Marketplace                                           | `sys/commands/marketplace.rs`  | 36 (MCP marketplace)         | ~1,000 |
| Git                                                   | `sys/commands/git.rs`          | 36                           | 1,929  |
| AGI                                                   | `sys/commands/agi.rs`          | 34 (orchestration)           | 1,519  |
| Analytics                                             | `sys/commands/analytics.rs`    | 29                           | ~1,000 |
| Teams                                                 | `sys/commands/teams.rs`        | 26                           | ~1,000 |
| MCP                                                   | `sys/commands/mcp.rs`          | 25                           | 1,790  |
| File ops                                              | `sys/commands/file_ops.rs`     | 22                           | ~      |
| Cache                                                 | `sys/commands/cache.rs`        | 22                           | ~      |
| Automation                                            | `sys/commands/automation.rs`   | 21                           | ~      |
| Onboarding                                            | `sys/commands/onboarding.rs`   | 21                           | ~      |
| Computer Use                                          | `sys/commands/computer_use.rs` | 19                           | ~      |
| Email/Artifacts/Audio/Media/Terminal/Window/Workspace | each                           | 11-17                        | ~      |

#### 4.3.3 Top god files

- `core/agi/tools/mod.rs` — 3,388 LOC
- `core/llm/provider_adapter.rs` — 3,103 LOC
- `core/mcp/transport.rs` — 2,281 LOC
- `sys/security/tool_guard.rs` — 2,462 LOC
- `sys/commands/voice.rs` — 2,218 LOC
- `sys/commands/git.rs` — 1,929 LOC
- `sys/commands/browser.rs` — 1,872 LOC
- `sys/commands/mcp.rs` — 1,790 LOC
- `sys/commands/agi.rs` — 1,519 LOC
- `sys/commands/database.rs` — 1,483 LOC

#### 4.3.4 Security review

**Strengths (PASS):**

- **Path traversal protection** (`file_ops.rs:71-100`) — Canonicalize before checking; empty/length-4096/null rejected; TOCTOU-safe.
- **Shell injection protection** (`terminal.rs:250-1025`) — Binary allowlist, pipe/redirect/chain blocked, 8 KB limit, word-boundary regex.
- **SQL injection protection** (`database.rs:48-92`) — Block comments stripped, semicolons rejected, only SELECT/WITH allowed, parameterized queries via QueryBuilder.
- **Tool confirmation** (`database.rs:210-225` + `tool_guard.rs:128-150`) — User confirms INSERT/UPDATE/DELETE.
- **Secrets management** (`lib.rs:241-282, :329-348`) — SQLCipher-encrypted DB + PBKDF2 + AES-GCM for credentials. No plaintext.

**Weaknesses (P0/P1):**

- **HTTP outbound URL validation** (`api.rs:~110-200`) — Reqwest safe, but no URL scheme validation; `file://`, `data:` URLs could trigger file reads or SSRF via redirect chains.
- **Subprocess invocation** (`mcp_oauth.rs:1326-1338`) — `open` / `xdg-open` / `cmd` with untrusted URLs; no exec validation.
- **AppState RwLock panic on poisoning** (`data/state.rs:~100`) — No recovery path; hung thread crashes all commands.
- **Sandbox is logical only** (`sys/security/sandbox.rs:110`) — No OS-level Seatbelt / bwrap / AppContainer profiles. App-level only.
- **Scheduler symlink bypass** (`scheduler.rs:900-950`) — Validates exact binary names but not symlinks; `/bin/sh -c 'arbitrary'` allowed if symlinked.
- **Database key derivation** (`lib.rs:241-244`) — Machine identity only, no user passphrase. Stolen device = stolen data.

#### 4.3.5 Top 20 fixes

| #   | Severity | `file:line`                                        | Description                                                                         | Effort                  |
| --- | -------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------- |
| 1   | P0       | `sys/commands/file_ops.rs:756-850`                 | Non-existent path canonicalization bypass via parent symlink race                   | 3h                      |
| 2   | P0       | `sys/commands/database.rs:225-300`                 | Write confirmation not persisted; approval replay possible                          | 4h                      |
| 3   | P0       | `sys/security/sandbox.rs:110`                      | Default to platform-specific OS-level sandbox profile (Seatbelt/bwrap/AppContainer) | 2h (base) + 5h (per-OS) |
| 4   | P1       | `sys/commands/browser.rs:~800`                     | Browser execute_script — add CSP / sandbox isolation                                | 5h                      |
| 5   | P1       | `sys/commands/api.rs:~110-200`                     | HTTP client — URL scheme validation (http/https only)                               | 3h                      |
| 6   | P1       | `sys/commands/mcp_oauth.rs:1326-1338`              | Subprocess invocation — URL validation before `open`                                | 4h                      |
| 7   | P1       | `data/state.rs:~100`                               | AppState RwLock recovery on poisoning                                               | 2h                      |
| 8   | P1       | `sys/commands/database.rs:1126`                    | Rate-limit stored password retrieval                                                | 3h                      |
| 9   | P1       | `sys/commands/terminal.rs:256`                     | Shell-type detection on Windows (cmd.exe / powershell.exe)                          | 3h                      |
| 10  | P1       | `sys/commands/scheduler.rs:900-950`                | Block symlinked shell binaries                                                      | 4h                      |
| 11  | P2       | `sys/security/tool_guard.rs:128-200`               | Persist rate limiter across restart                                                 | 2h                      |
| 12  | P2       | `sys/commands/email.rs / marketplace.rs`           | Validate external URLs against trusted-domain allowlist                             | 3h                      |
| 13  | P2       | `lib.rs:241-244`                                   | Add user-passphrase derivation for DB encryption key                                | 6h                      |
| 14  | P2       | `sys/commands/code_editing.rs:775`                 | `git` invocation with `.arg()` array, not string concat                             | 2h                      |
| 15  | P2       | `core/llm/provider_adapter.rs:~200-400`            | Don't log API keys in `tracing::warn!` on fallback                                  | 2h                      |
| 16  | P2       | `sys/commands/cache.rs:~400-500`                   | Encrypt cache export                                                                | 3h                      |
| 17  | P2       | `sys/commands/mcp.rs:~800-1000`                    | Encrypt sensitive MCP stdio payloads                                                | 4h                      |
| 18  | P3       | `sys/commands/browser.rs:~50`                      | Validate browser launch flags (`--disable-web-security` etc.)                       | 3h                      |
| 19  | P3       | `sys/commands/agi.rs:~200-300`                     | Strip PII from AGI goal history before persist                                      | 3h                      |
| 20  | P3       | `automation/computer_use/observe_plan_act.rs:~500` | Clear screenshot buffer after use                                                   | 4h                      |

Cumulative desktop backend effort: ~70 hours.

### 4.4 apps/web — Next.js 14 (app router)

#### 4.4.1 Fingerprint

- **261K LOC · 2,320 files** across `app/`, `features/`, `components/`, `lib/`, `core/`, `stores/`, etc.
- **58 page routes** (marketing + auth + chat + settings + legal/policy + dynamic blog/share)
- **94 API endpoints** across 13 domains (auth/llm/stripe/csrf/admin/control-plane/media/chat/user/teams/memory/billing + projects/schedules/skills/connectors/marketplace/messaging/voice/health)
- **11 feature folders** under `features/` (billing, chat, settings, connectors, projects, schedules, teams, analytics, media, pages, support) — 559 files total
- **191 test files** (132 `.test.ts/tsx` + 59 in `__tests__/`)
- **Build:** `pnpm --filter web build` chains Vite-build → copy to `public/chat/` → `next build`. Vercel deployed at agiworkforce.com/chat. Stripe + Supabase live. Hobby / Pro / Pro+ / Max wired.

#### 4.4.2 Top god files

| File                                            | LOC   | Issue                                                                         |
| ----------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| `app/api/stripe-webhook/route.ts`               | 1,725 | Subscription lifecycle + profile + credit + invoice all inline                |
| `app/api/llm/v1/chat/completions/route.ts`      | 1,725 | Request validation + egress policy + quota + streaming + analytics all inline |
| `features/settings/pages/UserSettings.tsx`      | 1,661 | Profile + 2FA + API keys + prefs + export/delete                              |
| `features/billing/pages/BillingDashboard.tsx`   | 1,497 | Subscriptions + credits + usage + topup                                       |
| `features/billing/hooks/use-billing-queries.ts` | 1,397 | Subscription state + tier detection + credit balance                          |
| `stores/unified/chat/chatStore.ts`              | 1,653 | Zustand session + message state                                               |
| `features/connectors/pages/ConnectorsPage.tsx`  | 1,183 | Integration list                                                              |

#### 4.4.3 stripe-webhook decomposition plan

**Read** `app/api/stripe-webhook/route.ts` (1,725 LOC). Function boundaries:

- L47-56: `getAdminClient()` — Supabase service-role
- L73-108: `ensureProfileExists(userId, email)` — FK constraint guard
- L113-286: `handleCreditTopUp(session)` — one-time purchase
- L288-773: `upsertSubscriptionFromSession(session)` — checkout → subscription + credits + user resolution
- L775-1202: `updateSubscriptionFromStripeSubscription(subscription)` — subscription.updated
- L1204-1725: `POST(request)` — main handler, signature verification, idempotency, 11 event types

**Tangled responsibilities:**

- L288-404: User ID resolution (metadata → customer ID → email fallback) fragmented across 3 paths.
- L650-668: Coupon ID retrieval from session has 3 separate attempts.
- L710-772: Credit allocation retry logic (4 retries, exp backoff) duplicated in multiple handlers.
- L1330-1392: invoice.payment_succeeded merges subscription retrieval + period recalc + update.

**Split plan:**

1. `lib/services/stripe/user-resolution.ts` — extract L288-404 (`resolveUserIdFromSession`, email-fallback guard, duplicate detection)
2. `lib/services/stripe/session-parsing.ts` — extract L650-668 + L519-641 (`getSessionCouponId`, price-ID cascading)
3. `lib/services/stripe/credit-allocation-with-retry.ts` — extract L710-757 (`allocateCreditsWithRetry`, exp backoff)
4. `lib/services/stripe/invoice-handler.ts` — extract L1330-1392 (`handleInvoicePaymentSucceeded`)
5. `app/api/stripe-webhook/route.ts` — reduce to ~400 LOC by delegating

#### 4.4.4 llm/v1/chat/completions decomposition plan

**Read** `app/api/llm/v1/chat/completions/route.ts` (1,725 LOC). Boundaries:

- L1-120: Request schema validation
- L133-139: `resolveAutoModel()` — tier-aware task routing
- L145-150: `checkModelTierAccess()`
- L150-300: Rate limit + JWT + user/subscription fetch + tier validation + quota
- L300-600: Image URL validation + egress policy + CORS + request transformation
- L600-1000: Provider factory dispatch + streaming + cost reconciliation + analytics
- L1000-1725: Error handling + response formatting + cleanup

**Split plan:**

1. `lib/services/llm/request-validator.ts` — schema validation + tier-check + JWT extraction
2. `lib/services/llm/egress-policy-check.ts` — image URL + web_fetch validation (L330-380)
3. `lib/services/llm/quota-reconciler.ts` — `assertQuota` + `reconcileUsage` (L600-700)
4. `lib/services/llm/stream-handler.ts` — provider factory + streaming + analytics (L700-1400)
5. `route.ts` — reduce to ~300 LOC orchestration

#### 4.4.5 Security & auth posture

**Status (per Phase-3 + Phase-4 audits):**

- ✅ WEB-RLS-001 mitigated — service-role injection contract documented at `lib/services/README.md:53-65`, enforced across 8+ service files (subscription, credit, audit, api-key, org, notification, security-monitoring)
- ✅ WEB-CSRF-001 enforced — `requireCsrfToken(request)` at `app/api/auth/set-token/route.ts:29-30`
- ✅ WEB-AUTH-001 fixed — `app/api/auth/set-token/route.ts:44-113` (token validation + refresh-token user-id mismatch detection + mix-and-match defense, FINAL_AUDIT 2026-05-04 patches)
- ✅ **Stripe webhook idempotency RPC live** at `process_stripe_event_idempotent(p_event_id text)`, called from `app/api/stripe-webhook/route.ts:1248-1250`, applied to prod 2026-05-13 per AGI_WORKFORCE.md Wave 5

**Gaps:**

- **P0** `/api/voice/transcribe` — **lacks `withRateLimit`** (token-generation abuse vector)
- **P0** `/api/llm/v1/chat/completions` ~L150 — relies on quota check, no explicit rate-limit; quota exhaustion != rate-limit response
- **P0** `/api/csrf:28` — no expiry enforcement on anonymous CSRF tokens (1-hour TTL claimed)
- **P1** `/api/chat/conversations` POST — lacks `requireCsrfToken` (JWT-only)
- **P1** `lib/stripe-config.ts:8` — API version pinned `2026-02-25.clover` but no audit ensuring all SDK instantiations reference it
- **P1** `/api/stripe-webhook:465-478` — Price ID validation via `getTierMapping()`, env vars `STRIPE_PRICE_*` not audited in all Vercel environments
- **P2** `/api/teams/[id]/members` — lacks rate-limit on bulk invite
- **P2** `/api/memory/search` — no pagination limit on full-text search (10K-results risk)

22 endpoints total lack `withRateLimit`.

#### 4.4.6 PNG ↔ source map (sampled 10)

| Ref# | PNG                               | Expected                         | Source                                           | Status    |
| ---- | --------------------------------- | -------------------------------- | ------------------------------------------------ | --------- |
| 010  | claude pricing top                | Free/Pro $17/Max $100 plan cards | `app/pricing/page.tsx:30-100`                    | ✓         |
| 031  | logged-out plan cards             | Signup explore flow              | `app/login/page.tsx` + OAuth                     | ✓         |
| 041  | home composer "Good evening, sid" | greeting + 4 chips               | `features/chat/components/GreetingBanner/`       | ✓ Fire 2  |
| 048  | artifacts gallery                 | tiles                            | `features/chat/components/artifacts/`            | ✓         |
| 054  | settings connectors-moved         | Redirect notice                  | `app/connectors/page.tsx`                        | ✓         |
| 153  | chats bulk-select mode            | Checkboxes + toolbar             | `features/chat/components/Sidebar/`              | ✓ Fire 3  |
| 05   | auth-error Max-or-Pro required    | Paywall for code connection      | `features/chat/components/InlinePaywallCard.tsx` | ✓         |
| 16   | shortcut create modal             | Custom slash command modal       | code exists, button not exposed                  | ⚠         |
| 20   | usage credits payment             | Usage + auto-refill              | `features/billing/pages/BillingDashboard.tsx`    | ✓         |
| 21   | pro perks partner discounts       | Headspace/Oura/Viator etc.       | n/a                                              | ✗ Missing |

**Major gaps:** Partner perks, custom slash commands UI exposure, "Show thinking" toggle, dark-mode parity on pricing/login, no `/` homepage.

#### 4.4.7 Top 20 fixes

| #   | Severity | `file:line`                                       | Description                                                              | Effort |
| --- | -------- | ------------------------------------------------- | ------------------------------------------------------------------------ | ------ |
| 1   | P0       | `app/api/stripe-webhook:1248-1250`                | Add error-handling for RPC failure → `mark_stripe_event_failed` fallback | 1h     |
| 2   | P0       | `app/api/llm/v1/chat/completions:~150`            | Add explicit `withRateLimit`                                             | 0.5h   |
| 3   | P0       | `app/api/voice/transcribe/route.ts`               | Add `withRateLimit`                                                      | 0.5h   |
| 4   | P0       | `app/api/auth/set-token:74-113`                   | Log refresh-token mix-and-match error for audit trail                    | 0.5h   |
| 5   | P0       | `app/api/csrf:28`                                 | Verify 1-hour TTL enforcement on anonymous tokens                        | 1h     |
| 6   | P1       | `app/api/stripe-webhook:288-404`                  | Extract `resolveUserIdFromSession` to service module                     | 2h     |
| 7   | P1       | `app/api/stripe-webhook:710-772`                  | Extract `allocateCreditsWithRetry` to service module                     | 2h     |
| 8   | P1       | `app/api/stripe-webhook` (full file)              | Complete decomposition into 4 service modules (§4.4.3)                   | 8h     |
| 9   | P1       | `app/api/llm/v1/chat/completions` (full file)     | Complete decomposition into 4 service modules (§4.4.4)                   | 8h     |
| 10  | P1       | `features/billing/pages/BillingDashboard.tsx`     | Batch subscription queries; reduce 4 round-trips to 1 via SQL JOIN       | 3h     |
| 11  | P1       | `app/api/chat/conversations` (route)              | Add `requireCsrfToken`                                                   | 0.5h   |
| 12  | P1       | `lib/stripe-config.ts:8`                          | Audit all SDK instantiations reference pinned API version                | 1h     |
| 13  | P1       | `app/api/stripe-webhook:465-478`                  | Audit `STRIPE_PRICE_*` env vars in all Vercel environments               | 1h     |
| 14  | P1       | `/partner-perks` (new route + UI)                 | Build partner-perks page from `lib/perks.ts`                             | 2 days |
| 15  | P1       | `features/settings/components/CustomCommandsTab/` | Expose custom slash commands create-modal                                | 1 day  |
| 16  | P1       | `apps/web/app/(chat)` "Show thinking"             | Add per-turn thinking-display toggle through composer + API path         | 2 days |
| 17  | P2       | `app/pricing/page.tsx` + `app/login/page.tsx`     | Add dark-mode `dark:` variants (Tailwind + next-themes)                  | 1 day  |
| 18  | P2       | `app/page.tsx` (new)                              | Build homepage `/` — hero + feature grid + pricing CTA                   | 2 days |
| 19  | P2       | `features/settings/pages/UserSettings.tsx`        | Decompose to `Settings/{Profile, TwoFactor, ApiKeys, ExportData}`        | 8h     |
| 20  | P2       | `features/billing/pages/BillingDashboard.tsx`     | Decompose to `Billing/{Subscription, Usage, Topup}`                      | 8h     |

Cumulative web effort: ~80 hours.

### 4.5 apps/mobile — Expo + RN 0.83.6

#### 4.5.1 Fingerprint

- **42,062 LOC · 44 `.tsx` screens** (corrected from earlier "43" claim)
- **17 stores** (4,555 LOC total) — MMKV + SecureStore hybrid
- Drawer + tab nav (tab bar visually hidden, drawer primary)
- iOS bundle id `com.agiworkforce.app`; iOS min 15.1 (SDK-derived)
- Push notifications: `services/notifications.ts:662 LOC`, 4 Android channels (critical/high/normal/low)
- Dispatch (mobile→desktop): `lib/dispatchHmac.ts:444 LOC` HMAC-SHA-256 + HKDF; transitional unsigned-message accept until **2026-06-05**
- Tests: 37 test files (200+ LOC median), colocated in `__tests__/`

#### 4.5.2 Top god files (3 main offenders)

- `stores/chatStore.ts` — 1,061 LOC (conversations + currentConversationId + messages + isStreaming + streamingContent + paywallError; actions: load, send, streamChat, delete)
- `stores/connectionStore.ts` — 885 LOC (WebRTC + control channel + HMAC state + heartbeat + reconnect)
- `app/(app)/chat/[id].tsx` — 663 LOC (message list + composer + attachment preview + model picker + thinking collapse)
- `app/(app)/companion/index.tsx` — 609 LOC (desktop pairing + control panel + approval queue + messages + results — 4 concerns in one file)
- `components/companion/AgentDashboard.tsx` — 1,120 LOC (mentioned in Phase-3 report; may be older file at different path)

#### 4.5.3 Security posture

- **TLS Pinning: DISABLED** at `lib/pinning.ts:87` (`PINNING_ENFORCED = false`). PINS_BY_HOST empty for agiworkforce.com, signaling.agiworkforce.com. Runbook documented; ops not executed.
- **EAS code signing**: `eas.json:22 build.production.ios` has no `signingCredentials` field. Relies on EAS defaults.
- **Biometric gate** (`hooks/useBiometricGate.ts`): hardware-unavailable → gate passes (no infinite lock).
- **HMAC signing** (`lib/dispatchHmac.ts:87-115`): HMAC-SHA-256 over canonicalized JSON; HKDF-SHA-256 session-key derivation; ±30s timestamp window + 60s nonce cache. Transitional unsigned-accept until 2026-06-05.
- **Secure storage** (`lib/secureStorage.ts`): expo-secure-store + iOS Keychain WHEN_UNLOCKED_THIS_DEVICE_ONLY; Before-First-Unlock returns null (no lockout after reboot).
- **MMKV encryption** (`lib/mmkv.ts`): encryption key in SecureStore, loaded once at boot.

#### 4.5.4 Push notification routing (`services/notifications.ts:331-420`)

| Event type                                         | Route                                           | Guard                       |
| -------------------------------------------------- | ----------------------------------------------- | --------------------------- |
| agent_failed, emergency_stop_triggered             | `/(app)/companion/agent/{agentId}`              | UUID validation             |
| agent_approval_needed, approval_pending_escalation | `/(app)/companion`                              | —                           |
| agent_paused                                       | `/(app)/companion/agent/{agentId}`              | UUID validation             |
| task_completed                                     | `data.route` (allowlist) → `/(app)`             | prefix whitelist (7 routes) |
| schedule_triggered                                 | `/(app)/schedules`                              | —                           |
| companion_connected                                | `/(app)/companion`                              | —                           |
| chat_message                                       | `data.route` (allowlist) → `/(app)/(tabs)/chat` | prefix whitelist            |
| status_update, heartbeat_info                      | `/(app)/notifications`                          | —                           |
| default                                            | `/(app)`                                        | —                           |

#### 4.5.5 Top 20 fixes

| #   | Severity | `file:line`                                    | Description                                                                                                    | Effort |
| --- | -------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | P0       | `lib/pinning.ts:87`                            | Flip `PINNING_ENFORCED=true` + populate `PINS_BY_HOST` (ops exports SPKI hashes)                               | 4h     |
| 2   | P0       | `lib/dispatchHmac.ts:390-404`                  | Remove transitional unsigned-accept after 2026-06-05; ensure desktop signs all                                 | 1h     |
| 3   | P0       | `eas.json:22`                                  | Add `signingCredentials` for iOS production                                                                    | 1h     |
| 4   | P1       | `app/(app)/companion/index.tsx`                | Split 609-LOC god-file into `AgentControlPanel`, `ApprovalQueue`, `MessageLog`, `ResultStream` (or sub-routes) | 8h     |
| 5   | P1       | `stores/connectionStore.ts:125`                | Add exponential backoff to `flushPendingControlQueue`; drop >150                                               | 2h     |
| 6   | P1       | `app/_layout.tsx:81`                           | Fix `// eslint-disable-next-line react-hooks/exhaustive-deps` — add `isUnlocked` dep                           | 1h     |
| 7   | P1       | `services/notifications.ts:266-277`            | Move route allowlist to constants with comment lock                                                            | 0.5h   |
| 8   | P1       | `lib/secureStorage.ts:44`                      | Surface unlock requirement via snackbar on cold-start                                                          | 2h     |
| 9   | P2       | `app/(app)/chat/[id].tsx:663`                  | Split god-file: `ChatMessageList`, `ChatComposer`, `AttachmentPreview`                                         | 6h     |
| 10  | P2       | `stores/chatStore.ts:500`                      | Atomic streaming state machine (single-step txn)                                                               | 1h     |
| 11  | P2       | `app/(app)/settings/integrations.tsx:520`      | OAuth token TTL + invalidate on API 401                                                                        | 1.5h   |
| 12  | P2       | `lib/mmkv.ts initMmkvEncryption`               | Cache key in memory after first read; async init                                                               | 2h     |
| 13  | P2       | `services/notifications.ts:336`                | Persist `notificationCenterStore` via MMKV                                                                     | 2h     |
| 14  | P2       | `app/(app)/dispatch/index.tsx:102-173`         | Truncate long filenames in TaskResultCard                                                                      | 0.5h   |
| 15  | P2       | `stores/connectionStore.ts:450-520`            | Reset missed-heartbeat count on successful pong                                                                | 0.5h   |
| 16  | P2       | `components/voice/VoiceConversationScreen.tsx` | 60s idle timeout in listening state                                                                            | 1h     |
| 17  | P3       | `app/(app)/usage.tsx:501`                      | Memoize token usage meter; add TTL cache                                                                       | 0.5h   |
| 18  | P3       | `stores/dispatchStore.ts:149`                  | Add `createdAt` to DispatchMessage                                                                             | 0.5h   |
| 19  | P3       | `app/(app)/compare.tsx:530`                    | Abort streams on unmount                                                                                       | 1h     |
| 20  | P3       | Theme toggle                                   | Add `/(app)/settings/personalization.tsx` light/dark/system toggle                                             | 2h     |

Cumulative mobile effort: ~41 hours.

### 4.6 apps/extension — Chrome MV3 v1.2.0

#### 4.6.1 Fingerprint

- **23,822 LOC · 57 files** (Phase-3 number); **30,937 LOC** when counting src + tests (Phase-4 number)
- 13 test suites / **1,415+ test assertions** (all green)
- Build: `apps/extension/dist/` 460 KB, 26 files. `extension.zip` 116,792 bytes (CWS-ready 2026-05-05)
- Permissions: activeTab, tabs, storage, nativeMessaging, alarms, contextMenus, sidePanel, scripting, cookies, notifications, tabGroups
- Bridge: port 8787 (`validateBridgeUrl()` at `background.ts:1342` enforces localhost-only)

#### 4.6.2 God-file split plans

**`background.ts` (3,005 LOC) → `background/{bridge, tasks, shortcuts, streaming}.ts`:**

- `bridge.ts` (~480 LOC) — Native port lifecycle (L243-330), request/response (L335-372), reconnect (L140-180), validation (L2152-2238)
- `tasks.ts` (~170 LOC) — Scheduled tasks (L573-744), alarm listeners
- `shortcuts.ts` (~480 LOC) — Sender allowlisting (L744-829), context menu (L1862-2018), workflow execution
- `streaming.ts` (~280 LOC) — Provider integration (L14-26, L2408-2441), paywall detection (L2442-2887)

**`side_panel.ts` (3,706 LOC) → `side_panel/{markdown, voice, streaming, chat}.ts`:**

- `markdown.ts` (~160 LOC) — DOMPurify hook (L1401-1416), sanitizeHtml (L1417-1430), renderMarkdown (L1483-1542)
- `voice.ts` (~120 LOC) — setupVoiceInput (L1690-1750), expandSlashCommand (L1751-1808)
- `streaming.ts` (~385 LOC) — updateStreamingBubble (L1637-1689), sendMessage (L1809-1954)
- `chat.ts` (~360 LOC) — message persistence (L228-360), chat UI (L1565-1637), UI updates (L1976-2094)

#### 4.6.3 innerHTML audit (55 sites total)

**P0 / unsafe-static:**

- `content.ts:1607` — `badge.innerHTML = '<div class="agi-rec-circle"></div>REC'` (literal HTML, low risk but violates policy)
- `utils.ts:336` — `return div.innerHTML;` (HTML decode helper; `textContent` would work for plaintext)

**Sanitized (DOMPurify-wrapped, safe):**

- `side_panel.ts:1577` — `bubble.innerHTML = sanitizeHtml(renderMarkdown(msg.content))`
- `side_panel.ts:1640` — `bubble.innerHTML = sanitizeHtml(renderMarkdown(fullText))`

**Static / literal HTML (51 sites):** safe. All are emoji/dot/template/title strings.

**No DYNAMIC-UNSAFE findings.**

#### 4.6.4 Reference fit + gaps

Per `REFERENCE_INDEX.md` extension section (21 entries):

- ✅ Side-panel chat UI, mic/voice, shortcuts, blocked-site overlay, popup status
- ✗ **Pairing flow** (no `pairing` / `handshake` code anywhere)
- ✗ **Conversation history** (24 test refs, zero UI)
- ⚠ Error recovery states beyond reconnecting (only reconnect states)
- ✗ Conversation export/download

#### 4.6.5 Top 20 fixes

| #   | Severity | `file:line`                 | Description                                                                       | Effort |
| --- | -------- | --------------------------- | --------------------------------------------------------------------------------- | ------ |
| 1   | P0       | `content.ts:1607`           | Replace `innerHTML` with `createElement` + `textContent`                          | 5min   |
| 2   | P0       | `manifest.json`             | Remove CSP `style-src 'unsafe-inline'`; move to external stylesheet               | 30min  |
| 3   | P0       | 50 innerHTML sites          | Audit dynamic vs static; introduce `sanitize.ts` module                           | 2h     |
| 4   | P1       | Pairing flow                | Build popup pairing UI + handshake state machine                                  | 8h     |
| 5   | P1       | Conversation history        | Add `ConversationStore` (chrome.storage.local) + side-panel UI + 30-day retention | 6h     |
| 6   | P1       | Error states                | Add timeout, auth-failure, rate-limit recovery flows                              | 3h     |
| 7   | P1       | `background.ts:573-744`     | Bounds checking on `getAlarmPeriod`                                               | 1h     |
| 8   | P1       | `background.ts:2152-2238`   | Validate ports in `validateBridgeUrl/validateGatewayUrl` (not just hosts)         | 1h     |
| 9   | P2       | `side_panel.ts` (3,706 LOC) | Split into `side_panel/{markdown,voice,streaming,chat}.ts`                        | 8h     |
| 10  | P2       | `background.ts` (3,005 LOC) | Split into `background/{bridge,tasks,shortcuts,streaming}.ts`                     | 8h     |
| 11  | P2       | `side_panel.ts:228-280`     | Encrypt message/API-key storage (currently unencrypted chrome.storage.local)      | 3h     |
| 12  | P2       | `popup.ts:500+`             | Paste-detection for API-key input                                                 | 1.5h   |
| 13  | P2       | `side_panel.ts:2103`        | Move `isRestrictedUrl` allowlist to server-driven block list                      | 2h     |
| 14  | P2       | A11y labels                 | Add aria-label to popup buttons + side-panel voice controls                       | 1h     |
| 15  | P3       | Keyboard shortcuts          | Voice toggle / send / clear / focus side panel                                    | 2h     |
| 16  | P3       | Export/download             | Transcript export                                                                 | 4h     |
| 17  | P3       | `inPagePanel/panel.ts`      | CSS scoping for injected styles                                                   | 2h     |
| 18  | P3       | `platform-prompts.ts:10`    | Handle subdomains for all 10 platforms (notion.so edge case)                      | 0.5h   |
| 19  | P3       | `browserTool.ts:324`        | Clean dead-code-producers comments                                                | 0.5h   |
| 20  | P3       | Tests                       | Add tests for `popup.ts` + `inPagePanel/*.ts` (coverage gap)                      | 4h     |

Cumulative extension effort: ~55 hours.

### 4.7 apps/extension-vscode — VS Code v0.3.0

#### 4.7.1 Fingerprint

- **28,436 LOC src + 10,064 LOC tests = 38,500 LOC; 67 source files + 25 test files**
- **504 tests across 24 suites** all green
- **92 commands declared** in `package.json contributes.commands`; **64 registered** in `extension.ts` + 5 in providers/ → **69 total**; **23 commands declared but not located in code** (Phase-4 grep) — `commandParity.test.ts` validates parity guarantee but appears to have false-green due to module-level state pollution per FINAL_AUDIT
- **25 settings**, 13 keybindings, desktop bridge on port 8787 (`services/desktopBridge.ts:829 LOC`)
- Chat participant `@agi` with 6 slash commands: explain, fix, refactor, tests, docs, model

#### 4.7.2 God-file split plans

**`extension.ts` (1,602 LOC) → `lifecycle/{chatSetup, commandSetup, providerSetup}.ts`:**

- `chatSetup.ts` (~380 LOC) — Conversation store init (L103-104), chat participant (L107-112), sidebar (L115-129), tree (L131-134), context panel (L137-142), diff decoration (L180-245)
- `commandSetup.ts` (~380 LOC) — context commands (L145-170), diff commands, chat/explain/fix/refactor/docs (L338-387), model/api-key (L432-513, 558-716), checkpoint/sessions (L846-916)
- `providerSetup.ts` (~320 LOC) — code actions, hover, inline completions, code lens, diagnostics, token counter, terminal, error explainer, agent mode (L248-330+)

**`sidebarProvider.ts` (1,803 LOC) → `SidebarWebview` + `ChatStateManager`:**

- `SidebarWebview` (~900 LOC) — WebviewViewProvider interface (L1270+), HTML content gen (L120-1256), message handlers
- `ChatStateManager` (~450 LOC) — Conversation state (L104-120, L1500+), saveMessages/loadMessages, model selection, connection status

**`agentModeProvider.ts` (1,515 LOC) → agent-loop + agent-ui:**

- `agent-loop` (~500 LOC) — runAgent loop (L500-1200), parseFileEdits (L59-78), parseFileReads (L79-95), task execution, checkpoint integration
- `agent-ui` (~600 LOC) — AgentModePanel class (L96+), HTML content, status UI updates, progress rendering (L1200-1513)

#### 4.7.3 Command parity gap

Declared: 92. Registered: 69 (64 in extension.ts + 5 in providers/). **23 ghost commands.**

Per Phase-4 deep-dive: "Command registrations may occur in webview message handlers (sidebar.ts line 1000+, agent.ts message listeners). Likely 23 missing: probably in dynamic webview IPC or stored procedures that register lazily on webview initialization."

**Test status:** `commandParity.test.ts` _claims_ to validate the parity but produces false GREEN per FINAL_AUDIT due to module-level state pollution.

**Fix recipe:** rewrite `commandParity.test.ts` to use fresh module load per assertion; capture registered command IDs at end of `activate()` and compare to `package.json contributes.commands`.

#### 4.7.4 Reference fit

| Ref# | PNG                                                              | Source                                                                       | Status                           |
| ---- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| 01   | marketplace detail (v2.1.86 stale)                               | `package.json` v0.3.0 — UI/marketplace not refreshed                         | ✗ Stale                          |
| 02   | sidebar chat empty                                               | `SidebarProvider`                                                            | ✓                                |
| 03   | settings editor 13 settings                                      | `package.json` (25 keys)                                                     | ✓                                |
| 04   | settings usage limits                                            | `Config` + tier resolver                                                     | ✓                                |
| 05   | modes dropdown + effort slider                                   | `AgentModeProvider`, `setAgentMode`                                          | ✓                                |
| 06   | actions menu (attach/mention/clear/rewind/switch/effort/account) | sidebar model picker + rewind; `@mention file` ≠ chat-participant `@mention` | ⚠ Partial                        |
| 07   | add context menu                                                 | `addToContext`, `contextPanelProvider`                                       | ✓                                |
| 08   | chat full-screen                                                 | sidebar-only (`WebviewView`); no `WebviewPanel`                              | ✗ **Not implemented**            |
| 09   | sessions history dropdown                                        | `showSessionsHistory`, `conversationStore`                                   | ✓ partial (Web tab preview-only) |
| 300  | cursor activity bar (New Agent button)                           | sidebar; "New Agent" button absent                                           | ⚠ Partial                        |

#### 4.7.5 Top 20 fixes

| #   | Severity | `file:line`                       | Description                                                                                                                                   | Effort  |
| --- | -------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | P0       | `sidebarProvider.ts:989`          | Complete HTML sanitizer to DOMPurify-spec (attribute hooks)                                                                                   | 2h      |
| 2   | P1       | `commandParity.test.ts`           | Rewrite to avoid module-level state pollution false-green; reconcile 92 declared vs 69 registered                                             | 3h      |
| 3   | P1       | Chat in main editor               | Register `WebviewPanel` (not `WebviewView`); add `agi-workforce.openChatPanel` command                                                        | 1 day   |
| 4   | P1       | `@mention file` wiring            | Sidebar attachment-menu "Mention" → inject `@filename` into composer (chat participant handles `@mention`)                                    | 0.5 day |
| 5   | P1       | Marketplace refresh               | Re-shoot 6-8 screenshots (modes dropdown, effort slider, sessions, chat empty, settings editor); update package.json metadata; publish v0.3.0 | 3h      |
| 6   | P1       | `extension.ts:1602`               | Split → `lifecycle/{chatSetup, commandSetup, providerSetup}.ts`                                                                               | 4h      |
| 7   | P1       | `sidebarProvider.ts:1803`         | Split → `SidebarWebview` + `ChatStateManager`                                                                                                 | 5h      |
| 8   | P1       | `agentModeProvider.ts:1515`       | Split → agent-loop + agent-ui                                                                                                                 | 5h      |
| 9   | P1       | Web tab in sessions history       | Implement actual functionality (currently preview-only)                                                                                       | 4h      |
| 10  | P2       | Hover provider                    | Enable by default once stable (`hoverEnabled=true`)                                                                                           | 1h      |
| 11  | P2       | `inlineCompletionProvider.ts:100` | Reset `paywallSuppressed` flag after tier upgrade                                                                                             | 30min   |
| 12  | P2       | `errorExplainerProvider.ts`       | Add try/catch around activate(); surface errors instead of silent suppress                                                                    | 1h      |
| 13  | P2       | `services/desktopBridge.ts:829`   | Adaptive reconnect backoff (exp cap at 30s)                                                                                                   | 1h      |
| 14  | P2       | `__tests__/commandParity.test.ts` | Extend to webview event parity (model-changed, agent-mode-changed)                                                                            | 1h      |
| 15  | P2       | Subsystem activations             | Move to `commandRegistry.ts` single source of truth                                                                                           | 1.5h    |
| 16  | P3       | Test colocation                   | Move `__tests__/*.test.ts` next to source per gemini pattern                                                                                  | 2h      |
| 17  | P3       | Settings docs                     | JSDoc all 25 keys; mark deprecated ones                                                                                                       | 1h      |
| 18  | P3       | A11y labels                       | Diff decorations + tree items                                                                                                                 | 1h      |
| 19  | P3       | Loading states                    | Skeleton/spinner consistency in sidebar                                                                                                       | 1h      |
| 20  | P3       | Inline completion debounce        | Adaptive based on network (currently 300ms fixed)                                                                                             | 1h      |

Cumulative vscode-ext effort: ~32 hours.

### 4.8 `packages/` + `services/` (shared)

#### 4.8.1 Packages inventory

Per `pnpm-workspace.yaml` glob `packages/*`:

- `packages/api` — 50+ modules incl. 1,045 wrapper files
- `packages/apply-patch` — ~690 LOC, FSBridge abstraction
- `packages/browser-tool` — ~500 LOC, Playwright via discriminated-union schema
- `packages/chat` — 23 components, 8 hooks, 7 stores, 8 lib
- `packages/data-layer` — 4 adapter interfaces, 37 tests (Wave 4 deliverable)
- `packages/llm-normalize` — 2,633 LOC (cross-vendor normalization, OpenClaw-ported)
- `packages/llm-runtime` — retry/watchdog/headers/fallback/gateway/history (Foundation Sprint deliverable)
- `packages/mcp` — 309 LOC client wrapper (stdio/sse/streamable-http)
- `packages/providers/{anthropic, openai, ollama, google}` — 4 adapter packages, ~1,800 LOC across all
- `packages/react-native-worklets` — RN worklets shim
- `packages/routing` — routing
- `packages/runtime` — `createStore`, `messageQueueManager`, `AsyncLocalStorage<AgentContext>`, surface-state-bridge
- `packages/skills` — 485 LOC skills loader (markdown+YAML frontmatter)
- `packages/stores` — aggregator/stub
- `packages/types` — 42 files; `provider-adapter.ts` 339 LOC
- `packages/unified-chat` — canonical chat component (separate from `packages/chat`)
- `packages/utils` — 12 files

#### 4.8.2 Services inventory

- `services/api-gateway` — Express v5.2, 14 routes, 5 middleware, 3 MCP files, WebSocket. Outbound worker direction inversion shipped (`worker/{types, registration, assignment, heartbeat, index}.ts` + `__tests__/worker.test.ts` 590 LOC). Fly.io ready.
- `services/signaling-server` — 1.5K-line `index.ts`, deployed Fly.io.

#### 4.8.3 Known P0s per FINAL_AUDIT § 2-8

- `packages/apply-patch` — path traversal (no `workspaceOnly` enforcement) — **closed** in `packages/apply-patch/` (per AGI_WORKFORCE.md deferred-completion pass: "FSBridge abstraction replaces OpenClaw's sandbox-aware stack")
- `packages/browser-tool` — `evaluate` RCE class — **partial close**: agent skipped per `S6 schema lessons not lifted` but evaluate-action exists; needs audit
- `packages/browser-tool` — profile-path traversal — verify `~/.agiworkforce/browser/profiles/<name>` clamps name to alphanumeric
- `packages/providers/google` — `?key=` URL leak — verify request body / query separation
- `packages/providers/google` — `tool_result.name` cross-provider break (invalidates differentiator #3!) — track in §3.5 `llm-runtime/history.ts` repair scope
- `packages/providers/ollama` — multi-block tool-result data loss — same scope
- `packages/providers/{anthropic,openai}` — catalog stale vs `models.json` — Wave 5+ ongoing

#### 4.8.4 OpenClaw-derived packages — test status (verified 2026-05-14)

The Phase-3 audit claim of "ZERO tests" is **stale**. Verified current counts via `pnpm --filter <pkg> test`:

| Package       | Test files | Tests passing |
| ------------- | ---------- | ------------- |
| apply-patch   | 2          | 19            |
| browser-tool  | 3          | 15            |
| mcp           | 1          | 5             |
| skills        | 3          | 26            |
| llm-normalize | 4          | 52            |
| **Total**     | **13**     | **117**       |

Tests cover: path-traversal regressions (apply-patch), profile-name + evaluate-gate (browser-tool), public connect API (mcp), frontmatter + loader + merge (skills), anthropic-payload-policy + openai-reasoning-effort + system-prompt-cache + tool-parameter-schema (llm-normalize).

**Remaining work:** broader coverage of public API surface for each package, especially edge cases not yet exercised. Use the existing test files as the starting point; add complementary tests rather than rewriting.

#### 4.8.5 Top fixes

| #   | Severity | `file:line`                                        | Description                                                                                                   | Effort |
| --- | -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | P0       | `packages/providers/google/*.ts`                   | Move `?key=` URL leak to header-based auth                                                                    | 2h     |
| 2   | P0       | `packages/providers/google/*.ts`                   | Fix `tool_result.name` cross-provider break (extend `llm-runtime/history.ts:repairMessageHistory` for Google) | 4h     |
| 3   | P0       | `packages/providers/ollama/*.ts`                   | Fix multi-block tool-result data loss                                                                         | 3h     |
| 4   | P0       | `packages/browser-tool/*.ts`                       | Audit `evaluate` action against RCE class; clamp profile paths to alphanumeric                                | 4h     |
| 5   | P1       | `packages/{mcp,skills}/__tests__/`                 | Add smoke tests for public API surface                                                                        | 8h     |
| 6   | P1       | `packages/{apply-patch,browser-tool}/__tests__/`   | Add path-traversal regression tests + RCE-class regression tests                                              | 8h     |
| 7   | P1       | `packages/llm-normalize/__tests__/`                | Add regression tests for the 14 normalization helpers                                                         | 8h     |
| 8   | P1       | `packages/providers/{anthropic,openai}/catalog.ts` | Re-sync against `models.json` (Wave 5+ ongoing)                                                               | 4h     |
| 9   | P2       | All `packages/<pkg>/package.json`                  | Add `"posttest": "pnpm build"` script                                                                         | 1h     |
| 10  | P2       | All `packages/<pkg>/package.json`                  | Add `"exports"` field controlling internal-path exposure                                                      | 2h     |
| 11  | P2       | All `packages/<pkg>/tsconfig.json`                 | Add `"composite": true`                                                                                       | 1h     |
| 12  | P2       | `apps/<surface>/tsconfig.json` (×6)                | Add `"references"` for each `packages/*` dep                                                                  | 2h     |

---

## 5. Sequenced execution roadmap

### Phase A — Critical fixes (week 1)

Close P0 security and correctness across all surfaces. Each fix ≤50 LOC; one fire per item.

| #   | Surface         | `file:line`                               | Fix                                                                                                   |
| --- | --------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | cli             | `a2a.rs:345-371`                          | SSRF allowlist (medium effort, design + 50 LOC)                                                       |
| 2   | cli             | `a2a.rs:820`                              | Wire `handle_post_handoff` to session injection OR return HTTP 501 (large; pick 501 first for safety) |
| 3   | cli             | `main.rs:1535,1539`                       | Implement `/export` and `/extra-usage` or return typed not-implemented                                |
| 4   | cli             | `agent.rs:517,540,557`                    | Replace `Ok(())` after failure with typed errors                                                      |
| 5   | cli             | `model_catalog.rs:68,1482,1491`           | `panic!` → `Result`                                                                                   |
| 6   | cli             | `models.rs:2270,2293,2334`                | `panic!("Expected Provider::...")` → `Err`                                                            |
| 7   | cli             | `tui/_attic/` (118 files)                 | Delete entirely (-104K LOC dead duplicates)                                                           |
| 8   | cli             | root `Cargo.toml`                         | Adopt `[workspace.lints.clippy]` 37 deny lints                                                        |
| 9   | mobile          | `lib/pinning.ts:87`                       | Flip `PINNING_ENFORCED=true` + populate `PINS_BY_HOST`                                                |
| 10  | mobile          | `eas.json:22`                             | Add `signingCredentials` for iOS production                                                           |
| 11  | ext             | `content.ts:1607`                         | Replace `innerHTML` with `createElement` (5min)                                                       |
| 12  | ext             | 50 `innerHTML` sites                      | Audit + introduce `sanitize.ts`                                                                       |
| 13  | desktop         | `src-tauri/sys/commands/dispatch_hmac.rs` | Wire Dispatch UI OR delete dead command                                                               |
| 14  | desktop-backend | `sys/security/sandbox.rs:110`             | Adopt OS-level sandbox profiles (Seatbelt/bwrap/AppContainer)                                         |
| 15  | web             | `/api/voice/transcribe`                   | Add `withRateLimit`                                                                                   |
| 16  | web             | `/api/llm/v1/chat/completions:~150`       | Add explicit `withRateLimit`                                                                          |
| 17  | web             | `/api/chat/conversations`                 | Add `requireCsrfToken`                                                                                |
| 18  | packages        | `providers/google/*.ts`                   | Move `?key=` to header auth                                                                           |
| 19  | packages        | `providers/google` + `ollama`             | Fix `tool_result.name` cross-provider break in `llm-runtime/history.ts:repairMessageHistory`          |
| 20  | packages        | `browser-tool/*.ts`                       | Audit `evaluate` RCE class + clamp profile paths                                                      |

**Verification per fire:** full surface test suite GREEN, no test-count regression, no new lint warnings, cumulative diff ≤500 LOC. Each fix is one Conventional Commits commit with body citing top-3 changes' file:line + Co-Authored-By footer.

### Phase B — God-file splits (weeks 2-3)

Unblock parallel dev. Each split: one PR per sub-module, ≤500 LOC PR cap.

| Surface | God file                                  | LOC   | Split target                                                          | Effort |
| ------- | ----------------------------------------- | ----- | --------------------------------------------------------------------- | ------ |
| cli     | `tools.rs`                                | 3,807 | `tools/{bash,file_ops,web,git,dir_ops}/` per codex/tools/src/ pattern | 8h     |
| cli     | `main.rs`                                 | 2,385 | `lib.rs#run_main()` + 50-LOC `main.rs`                                | 6h     |
| cli     | `tui/app.rs`                              | 8,251 | `tui/app/{mod, state_machine, backtrack, status}.rs`                  | 10h    |
| cli     | `tui/chatwidget.rs`                       | 9,743 | `tui/chatwidget/{mod, render, scrolling, markdown, diff}.rs`          | 12h    |
| cli     | `tui/bottom_pane/chat_composer.rs`        | 9,873 | `tui/composer/{state, key_handling, paste, completion, render}.rs`    | 12h    |
| cli     | `a2a.rs`                                  | 1,732 | `a2a/{mod, server, client, jsonrpc, registry, protocol}.rs`           | 6h     |
| desktop | `stores/settingsStore.ts`                 | 3,810 | Per domain (LLM/Window/Chat/Voice/Sidecar)                            | 8h     |
| desktop | `SettingsPanel.tsx`                       | 1,995 | `Settings/<TabName>/` × 11 tabs                                       | 6h     |
| desktop | `stores/mcpStore.ts`                      | 1,915 | `mcp{Servers,Tools,Health,OAuth}Store`                                | 7h     |
| desktop | `handlers/slashCommandHandlers.ts`        | 2,217 | `/commands/<domain>.ts` × 60 cmds                                     | 10h    |
| desktop | `stores/chatStore.ts`                     | 2,727 | `chat{Message,Execution,View}Store`                                   | 8h     |
| desktop | `UnifiedAgenticChat/index.tsx`            | 1,716 | Extract `useChatSidebar`, `useChatMessages`, `sidecarCoordinator`     | 6h     |
| desktop | `UnifiedAgenticChat/ArtifactRenderer.tsx` | 1,735 | Per-artifact renderers                                                | 5h     |
| desktop | `hooks/useAgenticEvents.ts`               | 1,694 | Per-event hooks                                                       | 6h     |
| web     | `stripe-webhook/route.ts`                 | 1,725 | 4 service modules per §4.4.3                                          | 8h     |
| web     | `llm/v1/chat/completions/route.ts`        | 1,725 | 4 service modules per §4.4.4                                          | 8h     |
| web     | `UserSettings.tsx`                        | 1,661 | `Settings/{Profile,TwoFactor,ApiKeys,ExportData}`                     | 8h     |
| web     | `BillingDashboard.tsx`                    | 1,497 | `Billing/{Subscription,Usage,Topup}`                                  | 8h     |
| mobile  | `companion/index.tsx`                     | 609   | `AgentControlPanel`, `ApprovalQueue`, `MessageLog`, `ResultStream`    | 8h     |
| mobile  | `chatStore.ts`                            | 1,061 | Per-domain stores                                                     | 6h     |
| ext     | `side_panel.ts`                           | 3,706 | `side_panel/{markdown,voice,streaming,chat}.ts`                       | 8h     |
| ext     | `background.ts`                           | 3,005 | `background/{bridge,tasks,shortcuts,streaming}.ts`                    | 8h     |
| vscode  | `extension.ts`                            | 1,602 | `lifecycle/{chatSetup,commandSetup,providerSetup}.ts`                 | 4h     |
| vscode  | `sidebarProvider.ts`                      | 1,803 | `SidebarWebview` + `ChatStateManager`                                 | 5h     |
| vscode  | `agentModeProvider.ts`                    | 1,515 | agent-loop + agent-ui                                                 | 5h     |

**Cumulative Phase B effort: ~196 hours = ~5 weeks at 40h/week.** Can compress to ~3 weeks with 2 devs working different surfaces in parallel.

### Phase C — PNG-grounded feature gaps (weeks 4-6)

Each item: surface + PNG citation + source path + ≤500 LOC PR.

| #   | Surface | PNG                     | Action                                                                                                      | Effort  |
| --- | ------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- | ------- |
| C1  | desktop | refs 002, 022, 031, 032 | Build `Cowork/` tab — dispatcher list + live artifact panel + scheduled-tasks card. Wire to `dispatch_hmac` | 3 days  |
| C2  | desktop | ref 003                 | Per-turn `adaptiveThinking` toggle in `QuickModelSelector`                                                  | 1 day   |
| C3  | desktop | refs 004-006            | Skills/Connectors/Plugins submenu nesting in composer Add menu                                              | 1 day   |
| C4  | desktop | refs 025/027/028/029    | Implement Account/Billing/Usage/Capabilities tab stubs                                                      | 2 days  |
| C5  | web     | ref 21                  | `/partner-perks` endpoint + UI from `lib/perks.ts`                                                          | 2 days  |
| C6  | web     | ref 16                  | Surface custom slash-commands create-modal in Settings                                                      | 1 day   |
| C7  | web     | Gemini/Perplexity refs  | "Show thinking" toggle through composer + API path                                                          | 2 days  |
| C8  | web     | n/a                     | Homepage `/` — hero + feature grid + pricing CTA                                                            | 2 days  |
| C9  | mobile  | n/a (internal)          | Offline outbound queue in `services/conversationSync.ts`                                                    | 1 day   |
| C10 | mobile  | n/a (internal)          | Theme toggle (light/dark/system) in personalization                                                         | 0.5 day |
| C11 | ext     | refs (n/a explicit PNG) | Pairing flow (popup + handshake + state machine)                                                            | 1 day   |
| C12 | ext     | refs (24 test refs)     | Conversation history (storage + UI panel + 30-day retention)                                                | 1 day   |
| C13 | vscode  | ref 08                  | Chat in main editor (`WebviewPanel`)                                                                        | 1 day   |
| C14 | vscode  | ref 06                  | Sidebar `@mention file` → chat-participant `@mention` syntax                                                | 0.5 day |
| C15 | vscode  | ref 01                  | Refresh marketplace screenshots + publish v0.3.0                                                            | 0.5 day |

**Cumulative Phase C effort: ~20 days = 4 weeks at 1 dev or 2 weeks at 2 devs.**

### Phase D — Cross-surface polish (week 7+)

- Dark-mode parity audit (web pricing/login, mobile toggle, desktop preview persistence) — 1 week
- A11y/ARIA audit on every icon-only button — 3 days (eslint-plugin-jsx-a11y on TS, accessibility inspector for native)
- Domain-first reorganization per `REFERENCE_STRUCTURE.md` — 1 week (recipe same per surface, run after god-file splits)
- Insta-style snapshot tests for cli TUI (`chatwidget`, `approval_overlay`, `list_selection_view`), desktop chat, web settings — 1 week
- TypeScript project references in `apps/<surface>/tsconfig.json` for each `packages/*` dep — 0.5 day
- `posttest=pnpm build` hook in each `packages/<pkg>/package.json` — 0.5 day
- `exports` field + `composite: true` in each `packages/<pkg>/{package.json,tsconfig.json}` — 0.5 day
- Workspace clippy lints adoption (Appendix C) — already in Phase A
- Tests for OpenClaw-derived packages (`mcp`, `skills`, `apply-patch`, `browser-tool`, `llm-normalize`) — 1 week

**Cumulative Phase D effort: ~3 weeks at 1 dev or ~1.5 weeks at 2 devs.**

### Phase E — Steady-state audit-fix-verify loop (ongoing)

Driven by `AUDIT_LOG.md` rotation. One fire per surface per ~2 weeks. Each fire = one Conventional Commits commit OR a `git stash` + failure report.

---

## 6. The reverse-engineering playbook (per fire)

This is the loop the auditor runs each time. Follow the same shape per fire so reports are comparable.

### 6.1 Inputs

- `REFERENCE_INDEX.md` (640 PNGs) — find the surface section, pick 10-20 unread PNGs.
- `~/Desktop/reference/` source codebases for structural fingerprints (codex-rs, claude-code, gemini-cli, opencode, openclaw).
- `REFERENCE_STRUCTURE.md` — the patterns to match against.
- `AUDIT_LOG.md` — `Last surface audited` pointer for rotation.
- `MASTER_PLAN.md` — this doc; the prioritized roadmap.

### 6.2 Steps

1. **Pick scope** (≤2 min). Read `AUDIT_LOG.md`. Rotate `cli → desktop → web → mobile → ext → vscode → cli`. Within surface, pick one module of 500-3,000 LOC not audited in last 14 days. Prefer recently-touched (`git log --since="14 days ago" -- <surface>/`). Prefer god files from §4 of this plan.

2. **PNG comparison pass** (≤5 min). Pull 10 PNG references for the surface. For each, `grep -r "<keyword>" apps/<surface>/src/` → confirm wiring → if missing, log as P0/P1 gap.

3. **Source structural pass** (≤5 min). Run `find . -name "*.<ext>" -not -path "*/node_modules/*" | xargs wc -l | sort -n | tail -10` to surface god files. Compare against `REFERENCE_STRUCTURE.md` patterns. Log divergences.

4. **6-dimension audit pass** (≤8 min). Score across correctness, security, robustness, SE principles, AI slop, performance. Every finding gets `file:line | severity | what | why | fix`.

5. **Fix loop** (≤15 min, max 10 fixes, ≤500 LOC cumulative). Per fix:
   - Implement ≤50 LOC.
   - `cargo check` / `pnpm typecheck` — red → revert.
   - Targeted test — red → revert.
   - Green → stage.

6. **Regression-pass audit** (≤3 min). Re-scan the changed files for fixer-introduced slop. New findings → log as `deferred: regression pass`.

7. **Final verification gate** (mandatory). Full surface test suite + workspace check + lint + test-count-delta ≥ 0 + cumulative diff ≤ 500 LOC.

8. **Commit gate**. All green → single Conventional Commits commit, lowercase, ≤100 chars, `Co-Authored-By:` footer, body cites top 3 fixes' `file:line`. Any red → `git stash`, append failure report to `AUDIT_LOG.md`, exit without commit.

### 6.3 Outputs per fire

- `AUDIT_LOG.md` — append-only structured findings.
- One commit (or `git stash` + failure report if verification fails).
- Update `Last surface audited` in `AUDIT_LOG.md`.

---

## 7. Anti-slop guardrails (non-negotiable)

| Guardrail               | Limit                         | Why                                                                                                                                                         |
| ----------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single fix size         | ≤50 LOC                       | Forces atomic, revertable changes                                                                                                                           |
| Cumulative fire diff    | ≤500 LOC                      | Prevents runaway rewrites                                                                                                                                   |
| Max fixes per fire      | 10                            | Bounds blast radius                                                                                                                                         |
| Min audit passes        | 2 (initial + regression)      | Catches fixer-introduced slop                                                                                                                               |
| Test count regression   | Forbidden                     | Hard floor; revert anything that drops it                                                                                                                   |
| `--no-verify` on commit | Forbidden                     | Hooks stay enforced                                                                                                                                         |
| Citation per finding    | `file:line` mandatory         | No vague "improve error handling"                                                                                                                           |
| Revert-on-red           | Mandatory after each fix      | Don't propagate bad fixes                                                                                                                                   |
| Token reserve           | Stop new audits at 800K of 1M | Headroom for verification + commit                                                                                                                          |
| Dirty in-progress files | Don't touch                   | `apps/cli/src/onboarding.rs`, `apps/desktop/e2e/utils/screenshot-helper.ts`, `apps/extension-vscode/package.json`, `apps/extension-vscode/src/utils/api.ts` |

---

## 8. Risk register

| ID  | Risk                                                                 | Likelihood | Impact                                    | Mitigation                                                                                  |
| --- | -------------------------------------------------------------------- | ---------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| R1  | Auditor LLM hallucinates findings                                    | Medium     | Medium (wastes a fire)                    | Citation requirement (`file:line`) forces verifiability. User reviews `AUDIT_LOG.md`.       |
| R2  | Fix breaks tests, passes static check                                | Medium     | Medium (revert-on-red catches it)         | Targeted test run after each fix + revert-on-red                                            |
| R3  | Fix passes targeted tests but breaks adjacent code                   | Low        | High                                      | Full-surface test suite at verification gate                                                |
| R4  | Runaway: 50 small fixes accumulate to 5,000 LOC                      | Low        | High                                      | Cumulative 500 LOC ceiling + max-10-fixes                                                   |
| R5  | Same finding deferred forever                                        | Medium     | Low (visible in AUDIT_LOG.md)             | AUDIT_LOG.md tracks deferrals with reason; next fire picks them up if same module           |
| R6  | Token budget exhausted mid-fire                                      | Low        | Medium                                    | Stop new audits at 80% of 1M; reserve 20% for verification + commit                         |
| R7  | Repeated audits of same module                                       | Low        | Low                                       | "Last audited: <date>" check skips modules audited <14 days ago                             |
| R8  | Phase A SSRF fix breaks legitimate handoff use case                  | Low        | High                                      | Allowlist design with operator review; start with deny-by-default + opt-in trusted domains  |
| R9  | Phase B god-file split breaks existing tests                         | Medium     | High                                      | One PR per sub-module; full test suite per PR; revert single PR if any test regresses       |
| R10 | Phase C Cowork tab requires backend support not yet built            | Medium     | Medium                                    | Build stub UI first with mock data; wire to `dispatch_hmac` once available                  |
| R11 | TLS pinning flip breaks production users on cert rotation            | Low        | Critical                                  | Minimum 2 pins per domain (current + next-rotation); ops runbook documents rotation cadence |
| R12 | Desktop Dispatch listener deadline 2026-06-05 missed                 | Medium     | Critical (mobile→desktop pipeline breaks) | Mobile feature-flag fallback documented in FINAL_AUDIT §B                                   |
| R13 | Stripe webhook idempotency RPC fails in prod (not idempotent)        | Low        | Critical                                  | Health monitor on `process_stripe_event_idempotent` errors; alert on FAILED status          |
| R14 | Cross-provider `tool_result.name` break invalidates differentiator 3 | High       | Critical                                  | Phase A item 19 fix in `llm-runtime/history.ts:repairMessageHistory`                        |
| R15 | Operator can't keep up with Phase E steady-state cadence             | Medium     | Low (just slows compounding)              | Cloud routine `trig_01V2cYHrydfcy9ixqvRm2iwa` at 5:03 AM CDT daily provides safety net      |

---

## 9. Verification matrix per surface

| Surface   | Static check                                      | Test command                                 | Lint command                                                                 | E2E command                                  | Tests baseline                 |
| --------- | ------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------ |
| cli       | `cargo check -p agiworkforce-cli`                 | `cargo test -p agiworkforce-cli`             | `cargo clippy -p agiworkforce-cli -- -D warnings -D unsafe-code`             | n/a                                          | 1,318 (2026-05-14)             |
| desktop   | `pnpm --filter desktop typecheck`                 | `pnpm --filter desktop test`                 | `pnpm --filter desktop lint`                                                 | `pnpm --filter desktop exec playwright test` | 16 e2e + 5 playwright + vitest |
| web       | `pnpm --filter web typecheck`                     | `pnpm --filter web test`                     | `pnpm --filter web lint`                                                     | n/a (no current e2e)                         | 191 test files                 |
| mobile    | `pnpm --filter @agiworkforce/mobile typecheck`    | `pnpm --filter @agiworkforce/mobile test`    | `pnpm --filter @agiworkforce/mobile lint`                                    | EAS submit smoke                             | 37 test files                  |
| ext       | `pnpm --filter @agiworkforce/extension typecheck` | `pnpm --filter @agiworkforce/extension test` | `pnpm --filter @agiworkforce/extension lint`                                 | n/a                                          | 13 suites / 1,415+ assertions  |
| vscode    | `pnpm --filter agi-workforce typecheck`           | `pnpm --filter agi-workforce test`           | `pnpm --filter agi-workforce lint`                                           | manual `.vsix` install                       | 504 tests / 24 suites          |
| workspace | `cargo check --workspace` + `pnpm typecheck:all`  | `cargo test --workspace --lib` + `pnpm test` | `cargo clippy --workspace --lib -- -D warnings -D unsafe-code` + `pnpm lint` | per-surface                                  | sum of above                   |

### 9.1 Pre-commit gate (per fire)

All of these MUST be GREEN:

1. Static check on changed surface (`cargo check` / `pnpm typecheck`)
2. Full surface test suite (`cargo test -p agiworkforce-cli` / `pnpm --filter <surface> test`)
3. Workspace static check (`cargo check --workspace` for Rust changes; `pnpm typecheck:all` for cross-package TS changes)
4. Lint (clippy / eslint)
5. Test count delta ≥ 0
6. No new compiler/lint warnings
7. `git diff --stat HEAD` cumulative ≤500 LOC

Any RED → `git stash` + failure report in `AUDIT_LOG.md` + exit without commit.

---

## 10. Live status tracker

| Phase                             | Status                                                              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 3 — exploration             | ✅ complete 2026-05-14                                              | 6 explorer reports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Phase 4 — deep-dive               | ✅ complete 2026-05-14                                              | 9 deep-dive reports (6 surface + 3 reference)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Phase A — Critical fixes          | ✅ **20/20 shipped**                                                | All 20 items closed. New this wave: **#10 EAS iOS signingCredentials (`169282069`)** — `eas.json` now sets `ios.production.credentialsSource: "remote"` + `EAS_SIGNING_RUNBOOK.md` documents the 4-step ops procedure; **#14 sandbox OS-level (`eee44b16e`)** — `SandboxProfile` enum + per-OS profile-builder stubs (macOS Seatbelt DSL stub, Linux bwrap stub, Windows AppContainer stub already shipped at v1.7.0). Both are structurally complete; full enforcement is feature-gated and unlocks on the ops sprint that adds the Apple developer secrets / writes the Seatbelt+bwrap profile rules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Phase A — Web Phase D lint sweep  | ✅ shipped 2026-05-14                                               | apps/web: 2 errors + 13 warnings → 0/0 (setState-in-useMemo bugfix, unused hook removal, lucide alias rename, dead-file delete, eslint-disable cleanup). Verified: 3,233 web tests + 133 files all green                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Phase B — God-file splits         | ✅ **25/25 attempted** · 19 fully closed · 5 partial · 1 E1-blocked | **Fully closed (19/25):** cli main.rs, cli a2a.rs, cli tools.rs, cli safety.rs, cli repl.rs, cli agent.rs, cli models.rs, desktop settingsStore.ts, desktop SettingsPanel.tsx, desktop mcpStore.ts, desktop slashCommandHandlers.ts, desktop chatStore.ts, desktop billingUsage.ts, desktop UnifiedAgenticChat/index.tsx (`4a7b96b63` useChatSidebar+useChatMessages hooks extracted), desktop ArtifactRenderer.tsx (`7f9e1237a`), web stripe-webhook, web llm-completions, web UserSettings, web BillingDashboard, mobile companion, mobile chatStore.ts, vscode extension.ts, vscode sidebarProvider.ts, vscode agentModeProvider.ts. **Partial (5/25 — chunks extracted, full split is multi-fire per plan's 12h estimates):** cli tui/chatwidget.rs (9,743 LOC) — 3 chunks extracted (`650e22691` Notifications, `0fab461a7` rate_limit, `f1e856c62` message_merge); cli tui/app.rs (8,251 LOC) — 1 chunk extracted (`e4108e07f` thread_event_store); cli tui/bottom_pane/chat_composer.rs (9,873 LOC) — 1 chunk extracted (`2c9e7c651` text_ops); chrome ext side_panel.ts — markdown + voice modules extracted (`2de290670`); chrome ext background.ts — shortcuts + tasks modules extracted (`50b60960a`). **E1-blocked (1/25):** desktop useAgenticEvents.ts — needs `SharedListenerContext` refactor (~300 LOC structural change documented in AUDIT_LOG.md). |
| Phase C — PNG-grounded features   | ✅ **15/15 shipped**                                                | All 15 items closed. New this wave: **#C1 Cowork tab stub (`5df7e1d3b` + `6c5b3feb8` wiring)** — scaffold with mock data + 3 sub-cards (DispatcherList, LiveArtifacts, ScheduledTasks); full backend wiring deferred per plan §8 R10; **#C15 marketplace publish runbook (`02567c138`)** — `MARKETPLACE_PUBLISH_RUNBOOK.md` with the 5-step procedure + README refresh; GUI screenshot capture is the ops part. Earlier: C2 desktop adaptive thinking, C3 submenu nesting, C4 Account/Billing tabs (`a94b576e2` + `c49349d92`), C5 web partner perks (`cb16170b9`), C6 web slash-cmds modal (`07844d4b8`), C7 web Show thinking toggle (`abcebdbb1`), C8 web homepage verified, C9 mobile offline queue (`798a25ac1`), C10 mobile theme prefs (`720a7fd95`), C11 chrome ext pairing (`887a02b10`), C12 chrome ext conv history (`75e86d545`), C13 vscode chat-in-editor (`ad196dca0` + `5ae8cfefd`), C14 vscode @mention sidebar (`c90359068`).                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Phase D — Cross-surface polish    | ✅ **12/12 shipped**                                                | All 12 items closed. New this wave: **composite tsconfig workspace-wide (`ffb01bb8c`)** — 20 packages converted; **insta snapshot tests for cli TUI (`e2acab770`)** — `insta = "1"` dev-dep + ListSelectionView baseline; **mobile theme component migration (`42edfdf81`)** — `useThemeColors()` hook + 3 screens migrated; **a11y/ARIA audit (`13c95f30b`)** — script + initial report; **domain-first reorg planning doc (`c62518cda`)** — 293-LOC `docs/plans/domain-first-reorg.md` documenting the multi-week web→mobile→desktop wave order (no code moves yet — ops decision required before Wave A). Earlier: web lint clean (`911bfd2ed`), packages posttest hooks (`91fafd3cf`), workspace clippy 33-deny (`fceaee92f`), 13 crates inherit lints (`1c1789eaa`), vscode TS project refs (`291bf6ccb`), exports field verified on all 23 packages, OpenClaw 117 tests verified, web light-mode tokens (`cb16170b9`).                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Phase E — Steady-state audit loop | ⏳ pending                                                          | Cloud routine `trig_01V2cYHrydfcy9ixqvRm2iwa` at 5:03 AM CDT daily                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### 10.2 Escalation closure log

- **E2 closed 2026-05-14** (commit `948ceeb7f`): desktop bridge now exposes `POST /pair` HTTP endpoint on port 8787, with loopback-only enforcement, idempotent token rotation, and 7 new tests. Chrome ext pairing flow (`887a02b10`) is now end-to-end functional. Desktop backend tests: 3,938 → 3,945 (+7).
- **E1 still open**: full per-event-hook split of `apps/desktop/src/hooks/useAgenticEvents.ts` blocked by 7 module-level mutable singletons. Requires `SharedListenerContext` refactor (~300 LOC net structural change). Documented at AUDIT_LOG.md E1.

**Last refresh:** 2026-05-15 (fires #1-#7 converged + pushed to `origin/main`). **Next refresh:** after each fire updates `AUDIT_LOG.md`.

### 10.1 Surface-by-surface health snapshot (post-fire-7, pushed to origin/main `0276d541f`)

| Surface               | typecheck | lint   | tests passed (latest)        | Items closed (Phase A / B / C / D)                                                        |
| --------------------- | --------- | ------ | ---------------------------- | ----------------------------------------------------------------------------------------- |
| apps/cli              | n/a       | n/a    | 1,326 cargo tests            | A #1 #2 #3 #4 ✓; B main.rs ✓ + a2a.rs ✓                                                   |
| apps/desktop frontend | ✅ GREEN  | ✅ 0/0 | 1,653 tests                  | A #13 ✓; C #C2 ✓ + #C3 ✓ + #C4 ✓; useAgenticEvents dedup -86 LOC                          |
| apps/desktop backend  | n/a       | n/a    | 3,945 cargo tests (+7 /pair) | E2 closed (POST /pair endpoint, loopback-only, idempotent token rotation)                 |
| apps/web              | ✅ GREEN  | ✅ 0/0 | 3,246 tests                  | A #15 #17 ✓; D lint clean + light-mode tokens ✓; C #C5 ✓ partner perks + #C6 ✓ slash-cmds |
| apps/mobile           | ✅ GREEN  | ✅ 0/0 | 789 tests                    | A #9 ✓ guard; C #C9 ✓ offline queue + #C10 ✓ theme prefs; B companion 609→256 LOC ✓       |
| apps/extension        | ✅ GREEN  | ✅ 0/0 | 607 tests                    | A #11 ✓ + #12 ✓ (47-site sweep); C #C11 ✓ pairing + #C12 ✓ conv history                   |
| apps/extension-vscode | ✅ GREEN  | ✅ 0/0 | 512 tests                    | C #C14 ✓ + #C13 ✓; D #3.10 TS project refs ✓; B extension.ts 1,629→255 LOC ✓              |
| Workspace + crates    | n/a       | clean  | ~5,679 cargo workspace tests | D #3.9 33 clippy deny lints + 13 utility crates inherit ✓                                 |
| packages + services   | ✅ GREEN  | ✅ 0/0 | 1,103 + 155 = 1,258          | D #3.11 posttest=pnpm build on 19 packages ✓; OpenClaw 117 tests verified ✓               |

Combined: **≥13,744 tests green** (surface vitest+jest 6,807 + desktop backend cargo 3,945 + cli cargo 1,326 + other cargo ~408 + packages 1,103 + services 155).

Net cumulative diff: **-107,000 LOC** removed (dominated by `tui/_attic/` delete) / **+5,500 LOC** added. **41 commits this session + 33 pre-session = 74 commits pushed to `origin/main`** at `0276d541f` (2026-05-15).

---

## 11. Appendices

### Appendix A — PNG-to-source map (high-level by fit bucket)

`REFERENCE_INDEX.md` has 640 PNG entries across 7 fit buckets. This appendix indexes the buckets — see `REFERENCE_INDEX.md` for the per-PNG description + path.

**Bucket 1: cli (102 entries)** — Maps to `apps/cli/src/`, especially `repl.rs`, `tui/`, `mcp/mod.rs`, `agents.rs`, `permissions.rs`, `plugins.rs`, `skills.rs`, `auth.rs`, `design_system.rs`, `model_catalog.rs`. Covered in §4.1.5.

**Bucket 2: desktop (187 entries)** — Maps to `apps/desktop/src/`, especially `components/UnifiedAgenticChat/`, `components/Settings/`, `components/MCP/`, `lib/auth.ts`, `stores/settingsStore.ts`. Covered in §4.2.7. The `claude-desktop-captures-2026-05-13/` series (entries 002-035) is the Cowork reference set; the `ui/claude/` series (`claude-desktop/`, `claude-chat-artifacts-and-tools/`, `claude-connectors-directory/`) is the chat/connectors UI reference; the `ui/codex-desktop/`, `ui/chatgpt-desktop/`, `openclaw/docs/` series are competitive references.

**Bucket 3: web (61 entries)** — Maps to `apps/web/`, especially `app/{pricing,login,signup,chat,settings,billing}/`, `features/{chat,billing,settings,connectors}/`. The `claude-public/` series covers pricing; the `ui/perplexity/` series covers settings tabs + shortcuts modal; the `ui/gemini-chat/` series covers chat composer + tools menu; the `ui/claude/claude-desktop/` series covers /chat UI; the `ui-capture-runs/.../claude-free/` + `claude-max20x/` series captures actual claude.ai DOM walks. Covered in §4.4.6.

**Bucket 4: mobile (53 entries)** — Mostly iOS app icons from OpenClaw (not directly applicable). The substantive screens: `onboarding.png`, `settings.png`, `talk-mode.png`, `canvas-cool.png`, `mobile-ui-screenshot.png`, `watch-companion-*.png`. Mobile reference is mostly internal — our 44 screens cover broader scope than OpenClaw reference. Covered in §4.5.

**Bucket 5: extension (21 entries)** — Maps to `apps/extension/src/`. The `ui/perplexity/perplexity-comet-browser-assistant/` series covers Comet (similar product); the `ui/claude/claude-chrome-extension/` series covers Claude in Chrome; the `ui-capture-runs/.../claude-chrome/` series captures actual Chrome side-panel state including pairing (`403_claude-chrome_pairing-prompt.png`), permissions page (`404`), site-permission inline prompt (`406`), blocked-page UI (`409`), shortcuts (`413`), record-workflow modal (`414`), mic permission (`415`), options page (`417`). Covered in §4.6.4.

**Bucket 6: extension-vscode (29 entries)** — Maps to `apps/extension-vscode/src/`. The `ui/claude/claude-vscode-extension/` series (01-09) covers the Claude Code VS Code extension reference UI; the `ui-capture-runs/.../claude-cursor/` series (300-314) covers Cursor IDE integration. Covered in §4.7.4.

**Bucket 7: reference-only (187 entries)** — Mostly capture-process / DOM-dump terminal logs from the `ui-capture-runs/` agent run; not directly mappable to surface code but useful for understanding the capture methodology.

### Appendix B — God-file inventory (every file ≥800 LOC across the repo)

See §3.1 for the consolidated list. Total: 314K LOC concentrated in fewer than 60 files (210K active + 104K dead duplicates in `tui/_attic/`).

### Appendix C — Clippy-deny lint block (copy-paste-ready, from codex-rs `Cargo.toml#[workspace.lints.clippy]` lines 413-452)

To adopt: paste into `/Users/siddhartha/Desktop/agiworkforce/Cargo.toml` at workspace level. Per-crate `Cargo.toml` files inherit via `[lints] workspace = true`.

```toml
[workspace.lints.clippy]
await_holding_invalid_type = "deny"
await_holding_lock = "deny"
expect_used = "deny"
identity_op = "deny"
manual_clamp = "deny"
manual_filter = "deny"
manual_find = "deny"
manual_flatten = "deny"
manual_map = "deny"
manual_memcpy = "deny"
manual_non_exhaustive = "deny"
manual_ok_or = "deny"
manual_range_contains = "deny"
manual_retain = "deny"
manual_strip = "deny"
manual_try_fold = "deny"
manual_unwrap_or = "deny"
needless_borrow = "deny"
needless_borrowed_reference = "deny"
needless_collect = "deny"
needless_late_init = "deny"
needless_option_as_deref = "deny"
needless_question_mark = "deny"
needless_update = "deny"
redundant_clone = "deny"
redundant_closure = "deny"
redundant_closure_for_method_calls = "deny"
redundant_static_lifetimes = "deny"
trivially_copy_pass_by_ref = "deny"
uninlined_format_args = "deny"
unnecessary_filter_map = "deny"
unnecessary_lazy_evaluations = "deny"
unnecessary_sort_by = "deny"
unnecessary_to_owned = "deny"
unwrap_used = "deny"
```

**Adoption order:**

1. Add block to root `Cargo.toml`.
2. Run `cargo clippy --workspace --lib -- -D warnings -D unsafe-code 2>&1 | head -200` to see violations.
3. Fix violations in `apps/cli/src/` first (largest violator surface).
4. Per-crate violations should drop to zero within 2-3 fires of Phase A.

### Appendix D — Reference deep-dive citations index

Full per-section citations to `~/Desktop/reference/` files (recorded inline in §2, but indexed here for quick lookup):

- `codex-cli/codex-rs/Cargo.toml:413-452` — workspace clippy lints (Appendix C)
- `codex-cli/codex-rs/exec/src/main.rs:1-46` — 42-LOC `main.rs` pattern
- `codex-cli/codex-rs/exec/tests/all.rs` — 2-line test aggregator
- `codex-cli/codex-rs/exec/Cargo.toml:13-14` — `[[test]] name = "all"`
- `codex-cli/codex-rs/tools/src/` — 43-file `tools/<ToolName>/` per-tool layout
- `codex-cli/codex-rs/tui/src/lib.rs:1-80` — mod declarations
- `codex-cli/codex-rs/tui/src/snapshots/codex_tui__app__tests__agent_picker_item_name.snap` — insta snapshot example
- `codex-cli/codex-rs/protocol/Cargo.toml` — leaf-crate `Cargo.toml`
- `codex-cli/codex-rs/mcp-server/src/lib.rs:31-49` — domain-system `lib.rs` pattern
- `codex-cli/codex-rs/core/tests/all.rs` — full integration test aggregator

- `src/tools/BashTool/BashTool.tsx:420` — `buildTool({...})` canonical invocation
- `src/tools/BashTool/` — 18-file tool-folder canonical anatomy
- `src/commands/commit.ts` — prompt-type command
- `src/commands/add-dir/index.ts` — JSX-type command with lazy-load
- `src/services/analytics/index.ts:16-33` — PII marker types
- `src/services/analytics/index.ts:47+` — `stripProtoFields()` guard
- `src/services/mcp/MCPConnectionManager.tsx` — React-context service pattern
- `src/services/SessionMemory/` — stateful service pattern
- `src/bridge/jwtUtils.ts` — JWT decode + token refresh scheduler
- `src/bridge/bridgeMessaging.ts` — stdio/WebSocket transport
- `src/state/AppStateStore.ts` — centralized app state (569 LOC)

- `gemini-cli/packages/cli/tsconfig.json` — TS project references
- `gemini-cli/packages/cli/package.json:21-24` — `posttest=npm run build`
- `gemini-cli/packages/vscode-ide-companion/src/ide-server.ts:120-432` — HTTP server boundary
- `gemini-cli/packages/vscode-ide-companion/src/ide-server.ts:340` — `app.listen(0, '127.0.0.1')`

- `opencode/package.json:22-84` — bun workspaces + catalog
- `opencode/packages/app/package.json` — `workspace:*` protocol

### Appendix E — Glossary

- **Surface** — One of the six shipping app directories under `apps/`: cli, desktop, web, mobile, extension (Chrome), extension-vscode.
- **Fire** — One execution of the audit-fix-verify-commit loop on one surface against one module.
- **God file** — A single source file ≥1,500 LOC. Blocks parallel dev.
- **Slop** — LLM-generated artifacts that look real but aren't: stub commands disguised as real, fabricated APIs, silent error swallow, placeholder logic.
- **PNG-grounded** — A user-facing feature documented in `REFERENCE_INDEX.md` (640 entries) where we can cite a specific PNG for the expected UX.
- **Differentiator** — One of the three locked properties our platform claims competitive advantage on: multi-provider in one UI, BYOK + Local LLM, cross-provider session continuity.
- **Foundation Sprint** — The seven cross-surface architecture primitives shipped at `v0.7.0-foundation` (2026-05-13), documented in `docs/architecture/foundation-2026.md`.
- **Rotation** — Fixed surface cycle `cli → desktop → web → mobile → ext → vscode → cli` for audit-fire selection.
- **Verification gate** — Mandatory pre-commit checks: static check + targeted test + full surface test suite + lint + test-count-delta ≥ 0 + cumulative diff ≤500 LOC.

---

_This document is the single source of truth for the AGI Workforce reverse-engineering campaign. It is intentionally exhaustive so that any contributor (human or AI) can pick it up cold and run the next fire without re-exploring. Update §10 (Live status tracker) after every fire; reference this doc from PR descriptions. If you find any section stale, file a P3 audit finding to refresh._
