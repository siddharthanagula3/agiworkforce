# Parity Gap, Budget & Fan-Out Execution Plan

Status: Generated estimation artifact (triage queue — not remediation)
Owner: Platform lead
Generated: 2026-06-20
Method: 19-agent Ultracode fan-out → adversarial verify → completeness critic (workflow `parity-gap-audit`, run `wf_904766c1-50f`)
Scope: 7 surfaces (`apps/{cli,desktop,web,mobile,extension,extension-vscode,sandbox}`) + 3 cross-cutting concerns, audited against the user-supplied "June 2026 Claude application suite" target baseline.

> **Read this first — two framing rules that govern every number below.**
>
> 1. **The baseline is a TARGET SPEC, not verified fact.** The "Claude suite" feature list in the prompt mixes (a) real external-product capabilities, (b) _our own_ intended architecture (the 8787 bridge, `.bridge_port` lockfile, PrivacyMode isolation, WebRTC dispatcher), and (c) unverifiable marketing ("30-day git-like ledger that blocks `rm/mv/cp`", "98% UI parity"). Each gap below is tagged `external-product-target` / `our-own-intended-arch` / `unverifiable`. **Current state is grounded in `file:line` evidence; gap = target − evidenced-current.**
> 2. **"$200" and "100% parity" are different budgets — never conflated.** $200 of autonomous agent run **cannot** close a 1.6M-LOC suite's gaps. This report gives two distinct numbers: **(A) total effort to 100%** (232–520 agent-hours; ~$0.8k–$2.5k realistic API spend) and **(B) what the first $200 tranche actually buys** (~30–50 agent-hours = the trust-boundary security floor). They are reported separately on purpose.

---

## 0. Executive Summary

| Metric                          | Value                                                                                                                              | Basis                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Surfaces audited                | 7 (6 active + empty `sandbox`)                                                                                                     | `apps/`                            |
| Verified gaps catalogued        | **40**                                                                                                                             | one per baseline sub-feature       |
| **Total effort to 100% parity** | **232–520 autonomous agent-hours**                                                                                                 | sum of per-gap estimates, de-duped |
| Build output tokens (100%)      | ~2.0M                                                                                                                              | sum of per-gap `estOutputTokensK`  |
| Model-tier split (by output)    | **91% Opus / 8.5% Sonnet / <1% Haiku**                                                                                             | per-gap routing                    |
| Realistic API spend to 100%     | **~$0.9k–$3.6k** = (232–520h) × **$4–7/agent-hr** (single declared rate, §B.2); iceberg-pessimistic $5k+                           | see §B.3                           |
| **What $200 buys**              | **~30–50 agent-hours** at the same rate = the **Tranche-1 security floor** (16–36h) with margin into Tranche 2                     | see §B.4                           |
| Single biggest driver           | **Cross-device sync epic (~60–130h, sequential, cannot parallelize)**                                                              | critic finding                     |
| Launch-relevance caveat         | The two dominant clusters (sync epic, desktop 3-tab shell) sit on **launch-lock-DEFERRED** surfaces. Active surface is **Mobile**. | `source-of-truth.md` launch lock   |

**Five load-bearing facts the adversarial layer established (these change the plan):**

1. **The CLI/Desktop "port 8787 contention" premise is FALSE.** Desktop binds `8787` (`apps/desktop/src-tauri/src/lib.rs:873-876`); CLI app-server binds `8788` by deliberate, documented separation (`apps/cli/src/lib.rs:1620-1623`); the shared `agiworkforce-app-server` crate defaults to **stdio** and only uses `8787` in `#[cfg(test)]`. The real gap is the **absence of a lockfile/fallback when an _external_ process holds the port**, not contention between our own services.
2. **Mobile data tier is encrypted SQLite (SQLCipher), NOT MMKV** as the baseline claims (`apps/mobile/storage/db.ts:93-101` + `app.config.js:213 useSQLCipher:true`). MMKV backs only Zustand settings + the offline queue. The baseline is factually wrong here; the real tier is _stronger_ than claimed.
3. **Neon RLS provides ZERO isolation today.** `0037_rls_user_isolation.sql:50` keys policies on `current_setting('app.user_id')`, but the only GUC setter binds `request.jwt.claim.sub` (`packages/data-layer/src/adapters/neon.ts:280`); the live web path never calls `withUser()` at all; policies have no `WITH CHECK`. Migration is explicitly dormant ("DO NOT APPLY"). Isolation rests entirely on app-layer `where user_id = $1`.
4. **Cross-device sync is a hollow throwing stub, not "feature-off."** Mobile `conversationSync.ts:54-68` throws; SQLite schema has **zero** sync columns (no `server_id`/dirty/tombstone/revision); desktop `cloud_sync.rs:21-49` is an intentional 100%-fail no-op. Flipping any flag does nothing — the whole engine must be built.
5. **Two scanner "gaps" were FALSE POSITIVES caught by skeptics:** Chrome workflow-recording is fully wired end-to-end (record→`SAVE_SHORTCUT`→`REPLAY_SHORTCUT`→`RUN_PAGE_ACTIONS`→`executePlannedAction`, live Replay button) — the scanner grepped only a vestigial storage key. And the web project-memory gap cited the wrong injection path (named the unified-chat hook; the live path is `WebChatPage`→`useChatStream`). **Implication: treat remaining un-reverified `Missing`/`Partial` labels as ~10–15% inflated.**

---

## 1. Methodology & Provenance

This report was produced by the exact pipeline the prompt asked it to _demonstrate_:

```
Phase 1 (Scan)      9 agents in parallel: 6 app scanners + 3 cross-cutting (data-tier, orchestration, privacy)
                    → each statuses every baseline sub-feature with file:line evidence + per-gap cost data
Phase 2 (Verify)    9 adversarial skeptics (one per scanner): open the cited files and try to REFUTE
                    the load-bearing claims; default to "refuted/partial" on thin evidence
Phase 3 (Synthesize) 1 completeness critic: uncovered baseline features, cross-cutting risks,
                    biggest drivers, sanity flags (double-counts, under-pricing)
```

19 agents, 495 tool calls, ~1.5M tokens, ~17 min wall-clock. Every status carries a `file:line` anchor; every refutation re-opened the cited file. Per-gap cost columns (`complexity`, `estOutputTokensK`, `modelTier`, `agentHours`) are emitted by the scanners so **hours, dollars, and routing all derive from one source**, not three independent guesses.

"**Agent hours**" throughout = autonomous Claude-Code wall-clock hours to build + test + production-harden, **not** human-dev hours. (Human-equivalent is materially larger.)

---

## 2. Section A — App-by-App Structural Gap Analysis

Status legend: `Present` (wired + verifiable) · `Partial` (exists, incomplete/not end-to-end) · `Missing` (no reliable impl) · `Gated` (built but flag-disabled) · `Done` (baseline claim refuted — already shipped or a non-gap).

### A.1 Desktop (`apps/desktop` — Tauri 2.11, Rust + React) — 72–166h

Strongest surface for computer-use; weakest for the three-tab shell.

| Baseline feature                                | Prov.      | Status      | Hours | Tier | Evidence / gap                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ---------- | ----------- | ----- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three-tab Chat/Cowork/Code                      | ext-target | Partial     | 18–40 | Opus | `V3Mode` is `'chat'` only (`DesktopShellV3.tsx:21`); `CodeModeHome` built but **never mounted** (orphaned at `index.ts:13`); "Cowork" = sidebar panels, not a tab.                                                                                              |
| Cowork isolated dashboard (sandboxed dir/VM)    | ext-target | Partial     | 16–36 | Opus | Sandbox + background-task backend exist (`sandbox.rs:157-326`, `background_tasks.rs`) but `AgiWorkDispatch.tsx:95-166` is static copy; **no OS-level network/process isolation** (`sandbox.rs:303-326`).                                                        |
| Computer Use engine                             | ext-target | **Present** | 8–18  | Opus | 13 wired Tauri commands, observe-plan-act loop, HiDPI math + test (`observe_plan_act.rs:1170,1226`), real `enigo` input. **Residual only:** video capture (currently 3s screenshots) + a11y-tree element resolution (no `AXUIElement`/UIAutomation).            |
| Embedded local preview (dev-server + Chromium)  | ext-target | Missing     | 12–28 | Opus | `LivePreview.tsx` is a DOMPurify content iframe; `BrowserViewer.tsx` is a screenshot stream. No dev-server spawn, no embedded webview.                                                                                                                          |
| CI/CD pipeline tracking + repair hooks          | ext-target | Missing     | 12–30 | Opus | Only a string in an MCP connector manifest (`connectors.rs:371`). No commands, no status-bar widget.                                                                                                                                                            |
| Data tier: aux-DB encryption + INTEGER→uuid ids | own-arch   | Partial     | 6–14  | Opus | Main `agiworkforce.db` is SQLCipher (real PBKDF2, `lib.rs:239-296`) **but** `agi_checkpoints.db`, outcome/ontology, `project_memory`, knowledge DBs open **plaintext** via bare `Connection::open`. Conversations use INTEGER autoincrement ids (sync-hostile). |

### A.2 CLI (`apps/cli` — pure Rust + Ratatui) — 11.5–24.5h

Toolbelt and agent loop are production-grade; the genuine hole is filesystem checkpointing.

| Baseline feature                          | Prov.        | Status      | Hours   | Tier   | Evidence / gap                                                                                                                                                                                                                                                               |
| ----------------------------------------- | ------------ | ----------- | ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native loop w/ bfs/ugrep                  | unverifiable | **Present** | 0.5–1.5 | Haiku  | Loop real (`executor.rs:10-21`); search is `rg`→`grep` fallback (`dir_ops.rs:233,257`). "bfs/ugrep" is an unsourced binary-name detail — `rg` already matches real Claude Code. **Near-zero value to change.**                                                               |
| Integrated toolbelt (Bash/Edit/Read/Grep) | ext-target   | **Present** | 0–1     | Sonnet | Sandboxed bash, read-before-write contract, approval gating (`bash.rs`, `file_ops.rs`, `dir_ops.rs`). Complete.                                                                                                                                                              |
| Checkpoint snapshot/rewind ledger         | ext-target   | Missing     | 8–16    | Opus   | Only an **in-memory** `Vec<Vec<Message>>` (`agent/mod.rs:136`); `/rewind` restores messages, not files. No on-disk file-content snapshot. ("30-day ledger that blocks rm/mv/cp" is an unverifiable embellishment — scope to snapshot+rewind; **do not** build a cp-blocker.) |
| Context compaction engine                 | ext-target   | Partial     | 3–6     | Sonnet | Triggering/`/compact`/CLAUDE.md ingestion all done (`chat.rs:163-205`), but compaction is **mechanical truncation, not LLM summarization** (`compaction.rs:213` defers it).                                                                                                  |

### A.3 VS Code extension (`apps/extension-vscode` — v0.3.0) — 28–61h

Rich command surface; the "bundled-CLI + local `ide` MCP server" baseline is entirely our-own-bridge instead.

| Baseline feature                                                 | Prov.      | Status  | Hours | Tier   | Evidence / gap                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | ---------- | ------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundled CLI + local `ide` MCP server + `~/.claude/settings.json` | ext-target | Missing | 14–30 | Opus   | No MCP server hosted (grep `McpServer/registerTool` empty); `cliPath` is restricted but **undefined** in config; only an HTTPS API + 8787 WS bridge client. Our arch ≠ baseline's; bridge does **not** count as partial.              |
| Four-tier permission engine                                      | ext-target | Partial | 8–18  | Opus   | 4 modes `ask/auto/plan/bypass` exist, but Plan = numbered-plan-in-prompt + confirm dialog (**not** an editor-tab markdown sign-off), and Bypass is a **system-prompt sentence**, not an enforced guard.                               |
| Granular context targeting                                       | ext-target | Partial | 6–13  | Sonnet | `@file` is whole-file only — regex `/@([\w./_-]+\.\w+)/g` has no `#`, so `@file#L25-50` can't resolve; no Alt+K/Option+K binding; no `@terminal:name`; diagnostics read in-process but **not** exposed as `mcp__ide__getDiagnostics`. |

### A.4 Chrome extension (`apps/extension` — MV3) — 12–30h

Browser bridge is mature (HMAC native messaging + CDP); network/console capture are the real holes.

| Baseline feature                             | Prov.      | Status      | Hours | Tier   | Evidence / gap                                                                                                                                                                                                     |
| -------------------------------------------- | ---------- | ----------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native messaging bridge (8787)               | own-arch   | **Present** | 3–7   | Opus   | Real `connectNative` + per-session HMAC envelope (`background.ts:205-274`) + Rust host. **Residual:** HMAC is back-compat-**optional** (falls to unsigned if host returns no secret); harden to fail-closed.       |
| Runtime debug — DOM inspection               | ext-target | **Present** | 1–3   | Sonnet | CDP `getPageContent` + content-script extraction. Polish only.                                                                                                                                                     |
| Runtime debug — network payload interception | ext-target | Missing     | 5–11  | Opus   | No CDP Network domain, no `webRequest`/DNR. Greenfield mechanism on existing CDP rails; **cost is the redaction/trust-boundary harness**.                                                                          |
| Runtime debug — console-error streaming      | ext-target | Missing     | 3–7   | Opus   | Deliberately removed (M-13 audit); `GET_CONSOLE_LOGS` returns an always-empty buffer. Rebuild via CDP `Runtime.consoleAPICalled`; must re-litigate the security rationale.                                         |
| Workflow recording (DOM→macro)               | own-arch   | **Done**    | 0–2   | Sonnet | **REFUTED:** fully wired end-to-end (record→`SAVE_SHORTCUT`→`REPLAY_SHORTCUT`→`RUN_PAGE_ACTIONS`→`executePlannedAction`, live Replay button, scheduled replay). Scanner grepped a vestigial storage key. ~0h work. |

Verified design invariant: **no LLM inference in the extension** (grep for `messages.create`/`new Anthropic`/`new OpenAI` empty). Holds.

### A.5 Web (`apps/web` — Next.js 16, Neon, Clerk) — 20–41h

Caching + artifacts are genuinely live; project memory persists but is **never injected into chat**.

| Baseline feature               | Prov.      | Status      | Hours | Tier | Evidence / gap                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ---------- | ----------- | ----- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1M context & prompt caching    | ext-target | **Present** | 6–12  | Opus | 5m/1h `cache_control` + `context-1m` beta header **live** on default path (`anthropic.ts:175-236`; client `use_prompt_cache:true` at `useChatStream.ts:464`). **Gaps:** no multi-file RAG indexer behind "1h extended cache"; v2 context-management compaction not wired to the live v1 path.                                                                    |
| Isolated interactive artifacts | ext-target | **Present** | 4–9   | Opus | Live React/SVG/Mermaid in cross-origin `apps/sandbox` (`index.html:31-291`, CSP `connect-src 'none'`). **Gaps:** isolation degrades to same-origin srcDoc without `NEXT_PUBLIC_SANDBOX_ORIGIN`; runtime libs from public CDNs (unpkg/jsdelivr); no edit-back-to-model loop.                                                                                      |
| Project Memory Base            | ext-target | Partial     | 10–20 | Opus | Storage exists (Neon `user_projects.instructions`, `project_knowledge_files` + RLS) **but nothing consumes it**: live send path injects only skill/style; `getActiveProjectInstructions()` has zero consumers; knowledge files store **metadata only** (no RAG/chunk/embed); curated memory persists but `WebChatRuntime` injection path is on an unrouted page. |

### A.6 Mobile (`apps/mobile` — Expo/RN) — 26–56h

Local-only v1 is solid and encrypted; continuity (sync) and the dispatcher are the gaps.

| Baseline feature                | Prov.        | Status   | Hours | Tier  | Evidence / gap                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------ | -------- | ----- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data tier = MMKV                | unverifiable | **Done** | 0     | Haiku | **REFUTED:** conversation tier is encrypted SQLite/SQLCipher (`db.ts:93-101`, `app.config.js:213`). Baseline factual error; no work.                                                                                                                                                                  |
| Unified session synchronization | ext-target   | Missing  | 14–30 | Opus  | `conversationSync.ts:54-68` throws; **zero** sync columns in schema; `cloudChat=true` is single-turn SSE with no push/pull endpoint. Whole engine must be built (sync metadata, push/pull, server endpoints + RLS, realtime channel, conflict resolution).                                            |
| Mobile work dispatcher          | own-arch     | Gated    | 12–26 | Opus  | WebRTC transport + HMAC + 4k-LOC signaling server are **built but flag-off** (`dispatch && companion` both false). **Missing for real:** TURN relay (only STUN → symmetric-NAT fails) **and** a server-side scheduled-task **executor** (CRUD persists, nothing runs it; only cron is reset-credits). |

### A.7 Cross-Cutting — Data Tier Divergence — 39–86h

Three fully independent persistence stacks, no shared schema, no shared id strategy. This is the substrate the sync epic sits on.

| Entity facet         | Desktop (SQLite)                               | Mobile (SQLite + live MMKV)                                         | Neon (Postgres)                                                        | Gap → hours/tier                                         |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| Conversation PK      | `INTEGER AUTOINCREMENT` (`migrations.rs:1013`) | `TEXT` schema / `conv_<ts>_<rand>` live (`chatMessageStore.ts:644`) | `uuid gen_random_uuid()` (`0001`)                                      | **Unify PK/ID** — Missing, 8–16h, Opus                   |
| Timestamps           | `TEXT CURRENT_TIMESTAMP`                       | `INTEGER` epoch-ms                                                  | `timestamptz`                                                          | **Canonical ts + version col** — Missing, 4–8h, Sonnet   |
| Tenancy `user_id`    | `TEXT DEFAULT ''` (empty-owner footgun)        | none                                                                | FK-derived (no col on `web_messages`)                                  | **Consistent tenancy + backfill** — Partial, 5–10h, Opus |
| Project↔conversation | JSON-array `conversation_ids`                  | no projects table                                                   | `project_id text` vs `user_projects.id uuid` (**intra-Neon mismatch**) | **Relational model** — Missing, 6–12h, Opus              |
| Sync transport       | `cloud_sync.rs` 100%-fail no-op                | throwing stub                                                       | n/a                                                                    | **Bidirectional merge engine** — Missing, 16–40h, Opus   |

There is **no shared schema/contract package** — `@agiworkforce/data-layer` is a raw-SQL connection adapter only.

### A.8 Cross-Cutting — Orchestration / Port Contention — 5–10.5h

| Baseline feature                          | Prov.      | Status   | Hours | Tier   | Verdict                                                                                                                              |
| ----------------------------------------- | ---------- | -------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 8787 contention (Tauri vs CLI app-server) | own-arch   | **Done** | ~0    | Haiku  | **FALSE premise.** Desktop=8787, CLI=8788 deliberately separated; crate defaults to stdio (8787 only in tests). Doc-correction only. |
| `~/.agiworkforce/.bridge_port` lockfile   | ext-target | Missing  | 3–6   | Opus   | No discovery exists; 4 clients hardcode 8787 while server port is env-overridable (`AGI_REALTIME_PORT`) → **latent SPOF**.           |
| Graceful "port occupied by external proc" | own-arch   | Missing  | 2–4   | Sonnet | Desktop bind `?`-fails in a detached task (error logged, never surfaced/retried → silent bridge outage); CLI `.expect()` panics.     |

### A.9 Cross-Cutting — Privacy Boundary Audit — 19–45h

Telemetry egress is genuinely hard-blocked; everything else is per-call-site and fragile.

| Baseline feature                          | Prov.      | Status      | Hours | Tier   | Verdict                                                                                                                                                                                    |
| ----------------------------------------- | ---------- | ----------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local-mode telemetry hard-block (desktop) | own-arch   | **Present** | 1–3   | Opus   | **Verified true egress block** in BOTH TS (`analytics.ts:154`, before consent check) and Rust (`collector.rs:79,98`, before any HTTP), with tests exercising the real `track()`/`flush()`. |
| Clerk/cloud-auth local short-circuit      | ext-target | Partial     | 2–5   | Opus   | Desktop uses no Clerk; `cloudAccountAuth.checkSession()` runs unconditionally — network-quiet only because no token is stored, not by a hard gate.                                         |
| Central egress chokepoint                 | own-arch   | Partial     | 5–12  | Opus   | **No** global fetch/invoke guard. ~24 per-call-site `selectPrivacyMode` checks across 9 files; `cloudApi.ts` exposes raw HTTP fns with no internal guard → **leak-on-new-callsite**.       |
| Neon RLS enforced                         | own-arch   | Gated       | 6–14  | Opus   | **Non-functional** (GUC mismatch + never-called `withUser()` + no `WITH CHECK`). See §0 fact #3.                                                                                           |
| Mobile telemetry opt-in gate              | own-arch   | Partial     | 2–5   | Sonnet | "Safe by absence" — no flush path exists, but opt-in is a comment not code; first flush caller leaks.                                                                                      |
| VS Code telemetry boundary                | ext-target | **Present** | 1–2   | Sonnet | Double-gated + host-allowlisted + redacted. Optional: unify under shared PrivacyMode vocab.                                                                                                |
| Privacy tests exercise prod code          | own-arch   | Partial     | 2–4   | Sonnet | "CRITICAL" tests assert **inline-copied lambdas**, not the real `analytics.ts`/`App.tsx` gates — deleting a production guard leaves them green.                                            |

---

## 3. Section B — Engineering Hours & Dollar Budget Matrix

### B.1 Hours matrix (per surface)

| Surface       | Gaps   | Output tokens | **Agent-hours (low–high)** | Notes                                                               |
| ------------- | ------ | ------------- | -------------------------- | ------------------------------------------------------------------- |
| Desktop       | 6      | 540k          | **72–166**                 | 3-tab shell + Cowork dominate; OS isolation is an iceberg (see B.5) |
| Data tier     | 6      | 330k          | **39–86**                  | sequential chain; substrate for sync                                |
| Mobile        | 3      | 340k          | **26–56**                  | sync + dispatcher; launch-active surface                            |
| VS Code       | 3      | 275k          | **28–61**                  | bundled-CLI/MCP server is the big item                              |
| Web           | 3      | 145k          | **20–41**                  | mostly "wire what exists"                                           |
| Chrome        | 5      | 147k          | **12–30**                  | recording already done; network/console real                        |
| Privacy       | 7      | 117k          | **19–45**                  | cheap, high-leverage, security floor                                |
| CLI           | 4      | 78k           | **11.5–24.5**              | only checkpoint ledger is substantial                               |
| Orchestration | 3      | 32k           | **5–10.5**                 | lockfile + fallback                                                 |
| **TOTAL**     | **40** | **~2.0M**     | **232.5–520**              | de-duped; see B.5 adjustments                                       |

### B.2 Token allocation & model-routing model

Routing is derived from the per-gap `modelTier` the scanners assigned (cheapest tier that does the job well):

| Tier       | Reserved for                                                                                                                                                                                                | Output tokens | Share     | Hours   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------- | ------- |
| **Opus**   | RLS + egress chokepoint, IPC/bridge hardening, sync transport/merge, ID-unification migration, aux-DB encryption, 3-tab/Cowork sandbox isolation, network-interception security harness, CI/CD repair hooks | 1,828k        | **91.2%** | 211–470 |
| **Sonnet** | context-targeting UI, LLM compaction phase, timestamp normalization, graceful port handling, mobile telemetry gate, VS Code telemetry unify, DOM-inspection polish, recording glue                          | 171k          | 8.5%      | 21–48   |
| **Haiku**  | doc corrections, false-gap closures, simple scaffolds                                                                                                                                                       | 5k            | <1%       | 0.5–2   |

**Routing principle:** the security/protocol/sync core _is_ the work — 91% genuinely needs flagship reasoning. The cheap tiers exist mainly to avoid burning Opus on layout and doc fixes, not because much boilerplate remains. Concretely: **never** route the Chrome Native-Messaging fail-closed hardening, the IPC `.bridge_port` race, or the RLS `WITH CHECK` policies below Opus; **always** route the layout/empty-state/marketing-copy and the two refuted "doc-correction" items to Haiku.

**Pricing assumptions** (repo catalog does not pin per-model Claude prices; `providers.anthropic.defaultPricing` = `$3/$15` confirms Sonnet-class). Published Anthropic API rates per MTok, caching applied:

| Tier       | Input | Output | Cache-read |
| ---------- | ----- | ------ | ---------- |
| Opus 4.x   | $15   | $75    | $1.50      |
| Sonnet 4.x | $3    | $15    | $0.30      |
| Haiku 4.x  | $1    | $5     | $0.10      |

**Single declared cost-per-agent-hour (the one number every dollar figure below derives from).** Agentic coding spend is **input-dominated** (repeated file reads, tool results, test runs, retries), not output. Per agent-hour in this repo: ~0.6–1.0M billed tokens × blended ~$6–8/MTok (91% Opus mix; ~70% of input served from cache) → **$4–7 per agent-hour** (central ≈ $5.5). This is the single conversion factor; hours come from one source (§B.1), so dollars must too.

### B.3 Total API cost to 100% parity (derived from the single rate)

`(232–520 agent-hours) × ($4–7/hr)` = **~$0.9k–$3.6k** (central ≈ $1.4k–$2.9k). The icebergs (OS-level sandbox isolation + full sync engine, §B.5) are the realistic path to the high end and beyond:

- **Realistic band:** **~$0.9k–$3.6k** (the rate × the hours total — nothing else).
- **Iceberg-pessimistic** (OS isolation + full sync prove to be weeks of cross-OS platform work, pushing hours past 520): **$5k+**.
- **Pure-token lower bound (NOT a realistic cost):** the 2.0M output × $69/MTok ($138) + ~24M cached input × ~$5/MTok (~$120) ≈ **~$260**. This ignores iteration, failed-test churn, and the critic-flagged output under-count, so it is a floor-of-the-floor, _not_ the optimistic estimate — do not budget against it.

> **Even the pure-token lower bound (~$260) exceeds $200, and the realistic figure is 4–14× it.** $200 is one tranche, not the program.

### B.4 What the first **$200** tranche actually buys

At the declared **$4–7/agent-hour** (§B.2), **$200 ≈ 30–50 agent-hours.** That comfortably covers **Tranche 1** (the trust-boundary security floor, 16–36h) with margin to begin Tranche 2. Tranche 1 is hard-capped so the $200 headline is never overclaimed:

**Tranche 1 — "stop the active leaks" (16–36h ≈ $90–$200 at the declared rate; fits $200 in full):**

| Tranche-1 item                                                                    | Surface     | Hours     | Tier      |
| --------------------------------------------------------------------------------- | ----------- | --------- | --------- |
| Neon RLS: align GUC + `WITH CHECK` + migration runner + cross-user denial tests   | Web/Data    | 6–14      | Opus      |
| Central egress chokepoint (fetch/invoke guard, fail-closed in local)              | Desktop+all | 5–12      | Opus      |
| Aux-DB encryption (route checkpoints/outcome/memory/knowledge through keyed conn) | Desktop     | 3–6       | Opus      |
| Privacy tests exercise prod code (not lambdas)                                    | Desktop     | 2–4       | Sonnet    |
| **Tranche-1 total**                                                               |             | **16–36** | ~80% Opus |

**Tranche 2 — hardening (10–22h ≈ a second ~$60–$150; explicitly NOT covered by the first $200):**

| Tranche-2 item                              | Surface       | Hours     | Tier   |
| ------------------------------------------- | ------------- | --------- | ------ |
| `.bridge_port` lockfile + client discovery  | Orchestration | 3–6       | Opus   |
| Clerk/cloud-auth local-mode short-circuit   | Desktop       | 2–5       | Opus   |
| Graceful port-occupied fallback + UI status | Orchestration | 2–4       | Sonnet |
| Mobile telemetry enforced opt-in gate       | Mobile        | 2–5       | Sonnet |
| VS Code telemetry unify under PrivacyMode   | VS Code       | 1–2       | Sonnet |
| **Tranche-2 total**                         |               | **10–22** | mixed  |

**Why Tranche 1 first:** (1) it closes the only _active security holes_ (RLS non-functional, leak-on-new-callsite egress, plaintext aux DBs); (2) it is launch-relevant on the active Mobile surface and the Web cloud tier; (3) it is the **gate** under cross-device sync — building sync before RLS works would ship a cross-tenant data leak. The expensive clusters (desktop 3-tab shell, full sync engine; ~120–260h combined) are explicitly **out of both tranches** and out of near-term launch scope. The aux-DB item is encryption-only; the INTEGER→uuid migration it shares a row with in §A.1 belongs to the sync chain, not the tranche.

### B.5 Critic adjustments already applied (so the totals aren't inflated)

- **Refuted/false gaps zeroed:** Chrome workflow-recording (was 4–9h → ~0–2h glue); port "contention" (was 0.2–0.5h → doc only); mobile MMKV (0h).
- **RLS de-duplicated:** counted once (in Privacy), folded out of Data tier.
- **Flagged but NOT silently lowered (honest high-end risk):**
  - _Sync double-count vs under-scope wash:_ mobile session-sync (14–30h) and data-tier transport (16–40h) overlap on shared endpoints/tombstones/conflict-resolution, **but** the critic also judged each _low_ for a 5-subsystem engine — these roughly cancel; the consolidated **sync epic is ~60–130h, sequential**.
  - _OS-level sandbox isolation_ (namespaces/containers, cross-OS) folded inside 3-tab/Cowork is **weeks, not hours** — the single most likely reason the high end blows past 520h.
  - _Computer-use a11y-tree_ (AXUIElement/UIAutomation/AT-SPI) is multi-platform; likely top-of-band.

---

## 4. Section C — Parallel Fan-Out Execution Blueprint

### C.1 Dependency reality (why naive parallelism fails)

The dominant epic — **cross-device sync — is a strict sequential chain that cannot be fanned out:**

```
unified ID type → canonical timestamp+version → tenancy user_id → relational project↔conv → RLS isolation → sync transport/merge
       (8–16h)          (4–8h)                     (5–10h)            (6–12h)                (6–14h)           (16–40h)
```

Each stage mutates the schema the next depends on. Parallelizing it corrupts the migration order. **So the orchestration is: parallelize ACROSS independent tracks; serialize WITHIN the sync chain.**

### C.2 Agent assignment plan (roster + isolation)

Each builder agent runs in its **own git worktree** (`isolation: worktree`) so parallel file mutation never conflicts. Tracks are chosen to be file-disjoint.

| Agent                                  | Charter                                                                                                                                | Owns (gaps)                                                                             | Parallel?                            | Worktree |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------ | -------- |
| **Alpha — Cloud/Neon/Isolation**       | RLS, tenancy, the sync chain, subscriptions/billing data                                                                               | Privacy-RLS, Data-tier chain (serial), Web project-memory                               | **Serial internally** (schema chain) | yes      |
| **Beta — Zero-Leak Privacy**           | Local↔Cloud boundary, central egress chokepoint, aux-DB encryption, telemetry gates, privacy-test hardening                            | Privacy (egress, clerk, mobile telemetry, tests), Desktop aux-DB encryption             | parallel w/ Gamma, Delta             | yes      |
| **Gamma — IPC / Bridges**              | `.bridge_port` lockfile + fallback, Chrome native-messaging fail-closed, VS Code bundled-CLI/`ide` MCP server, network/console capture | Orchestration, Chrome (bridge/network/console), VS Code (MCP server, context targeting) | parallel                             | yes      |
| **Delta — Desktop Shell / Cowork**     | 3-tab architecture, Cowork dashboard + sandbox isolation, embedded preview, CI/CD tracking                                             | Desktop (shell cluster)                                                                 | parallel (deferred surface)          | yes      |
| **Epsilon — CLI / Agentic Primitives** | filesystem checkpoint ledger, LLM compaction                                                                                           | CLI                                                                                     | parallel                             | yes      |
| **Zeta — Mobile Continuity**           | session-sync client + dispatcher enablement (consumes Alpha's server endpoints)                                                        | Mobile                                                                                  | **blocked on Alpha** (server side)   | yes      |

**Scheduling:** Beta + Gamma + Delta + Epsilon fan out immediately (file-disjoint, no cross-deps). Alpha runs the sync chain serially. Zeta starts only after Alpha lands the server-side sync endpoints + working RLS. The **$200 tranche = Alpha's RLS step + all of Beta + Gamma's lockfile** — i.e., the floor, before any builder touches sync transport or the desktop shell.

### C.3 Adversarial Skeptic Protocol (two distinct kinds — deliver BOTH)

**(1) Static verification skeptics — already executed this run.** One per builder track, prompted to _refute_ load-bearing claims by re-opening cited source; default to "refuted/partial" on thin evidence; kill a finding if it can't survive the file read. This run alone refuted 2 false gaps and corrected 4 mechanisms — proof the gate works. Re-run after each track lands, against the _diff_.

**(2) Runtime skeptic protocol — designed here, to be executed during the build (not faked):**

- **Offline Local-Mode Leak Harness (Beta's gate).** Launch desktop/mobile in Local mode inside a **network namespace with an egress sink** (deny-all + logging proxy on 0.0.0.0). Drive a scripted session (chat, attach file, switch model, open settings, trigger error). **Pass = zero outbound connection attempts to any non-allowlisted host** (Vercel, analytics, Clerk, provider APIs). Any captured SYN to a managed/BYOK endpoint = automatic fail → the egress chokepoint regressed. Wire as a CI job using the _real_ binary, not a mock — directly closes the "leak-on-new-callsite" risk.
- **Cross-Tenant RLS Denial Probe (Alpha's gate).** On a Neon branch with `0037` applied + GUC aligned: bind user A, attempt `SELECT`/`UPDATE`/`INSERT` against user B's rows. **Pass = 0 rows read, write rejected by `WITH CHECK`.** Repeat with GUC unset (must deny-all, not allow-all). Fail-loud if any row crosses tenants.
- **98% UI design-token parity diff (Delta's gate).** Render matched Desktop and Web components, extract computed tokens (color/space/type/radius) via the shared `@agiworkforce/design-tokens`, and screenshot-diff with computer-use. **Pass = ≥98% token match**; deltas above threshold flagged as drift, not "done." (Use token extraction as the primary signal; pixel-diff as secondary, since fonts/AA differ across surfaces.)
- **Port-collision chaos probe (Gamma's gate).** Hold 8787 with a decoy process, launch desktop, assert the bridge writes a fallback port to `.bridge_port`, all 4 clients discover it, and a user-visible status appears. **Pass = bridge functional on the fallback port; no silent outage.**

**Converge gate:** a track is "done" only when its static skeptic finds nothing new on the diff **and** its runtime probe is green. No "build passed → done" — per the locked rule, build success alone is not completion evidence.

---

## 5. Appendix — Corrected Facts, Matrix Drift, Risks

### 5.1 Baseline claims the audit corrected

- "Port 8787 contention between Tauri and CLI app-server" → **false**; 8787/8788 deliberately separated.
- "Mobile MMKV storage" → **false**; encrypted SQLite/SQLCipher.
- "30-day git-like ledger that blocks rm/mv/cp" (CLI) → **unverifiable embellishment**; real Claude Code does not hard-block via checkpoints. Scope to snapshot+rewind only.
- "Encrypted socket on 8787" → **misframe**; transport is stdio native-messaging + 127.0.0.1 loopback, not TLS. No wire-encryption gap on loopback.
- Chrome "workflow recording" treated as a gap → **already shipped end-to-end**.

### 5.2 `parity-implementation-matrix.md` drift found (open the doc and fix in the same change as code)

- L194–195 Desktop Cowork/Code "placeholder" → **stale**; Cowork is panels, Code is orphaned-built (unmounted), not placeholders.
- L189–197 Desktop encryption → understates main-DB SQLCipher maturity **and** misses plaintext aux DBs.
- L250 VS Code "Editor context Partial" → `Missing` for line-range anchors / Alt+K / `@terminal`.
- L119/133 Web project-memory → confirmed Partial, but doc omits that instructions are **never injected** into the live system prompt.
- L57/146 "sync status" across W/D/M → there is **no** cross-store sync at all; "sync status" is aspirational.
- No matrix row for: prompt caching (Present), port orchestration/lockfile, Chrome network/console capture, RLS. Add them.

### 5.3 Critic-flagged coverage gaps (NOT audited this run — scope a second pass)

Voice (dictation vs live), image/multimodal generation+editing, deep-research/search/citations, billing/usage/Stripe surfaces, connector/MCP-client/plugins **directory** + write-action confirmation, memory import/reference-history toggles, canvas/visual-design workspace + artifact versioning/export, chat-shell IA breadth (empty-state/plus-menu/account-menu/message-actions) on Web+Mobile, model-dropdown capability display + catalog-drift rule. These are real surfaces with code; they were outside the 9 scanner rubrics and are **not** in the 232–520h total.

### 5.4 Top cross-cutting risks

1. **Sync is one sequential epic** masquerading as per-surface stubs — cannot parallelize.
2. **Egress enforcement is per-call-site on every surface** — global invariant with no shared chokepoint.
3. **8787 hardcoded by 4 clients + env-overridable server** = cross-surface SPOF.
4. **RLS non-functional system-wide** — the security floor under any sync.
5. **Audit false-negative rate ~10–15%** — re-verify `Missing`/`Partial` before building.
6. **Three divergent id/timestamp/soft-delete conventions** break even non-sync features (move-chat-to-project, deletion propagation).

---

_Generated by the `parity-gap-audit` Ultracode workflow. Every status carries a `file:line` anchor in the run transcript (`wf_904766c1-50f`). This is a triage artifact: open the cited sources and confirm before building — two scanner findings were already proven wrong by the adversarial pass._
