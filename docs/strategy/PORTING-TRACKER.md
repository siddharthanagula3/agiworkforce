# Porting & Attribution Tracker

Status: Active (single source of truth for the execution loop)
Owner: Platform lead
Last updated: 2026-06-28
Drives: `11-execution-playbook.md`. Update this after every increment.

This file tracks (a) increment status for the resumable loop, and (b) the license/attribution record for every adaptation, so the codebase stays diligence-clean. Rule: **no ported file lands without a row here** plus a `THIRD_PARTY_NOTICES.md` entry and preserved upstream headers.

---

## 1. Donor repos — license register (verified 2026-06-28)

| Donor                                                                     | License                                | Use                                                                         | Status                          |
| ------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- | ------------------------------- |
| codex-rs (`codex-cli/codex-rs`)                                           | Apache-2.0                             | **Port** runtime (Tool trait, compaction, execpolicy wiring, streaming)     | ✅ allowed (attribute)          |
| continue                                                                  | Apache-2.0                             | **Port** VS Code surface (IDE host, autocomplete, lazy-apply)               | ✅ allowed (attribute)          |
| opencode                                                                  | MIT                                    | **Port** agent patterns                                                     | ✅ allowed (attribute)          |
| odysseus @ `dd055ee`                                                      | MIT                                    | **Port** workspace patterns (provider detect, tool parsing, untrusted-wrap) | ✅ allowed (attribute)          |
| SkillSpector                                                              | Apache-2.0                             | **Adopt** skill/plugin vetting service                                      | ✅ allowed (attribute, NOTICE)  |
| gemini-cli / qwen-code                                                    | Apache-2.0                             | **Port** compaction prompt, sandbox profiles                                | ✅ allowed (attribute)          |
| goose                                                                     | Apache-2.0                             | **Study/port** two-tier compaction                                          | ✅ allowed (attribute)          |
| aider                                                                     | Apache-2.0                             | **Port** repo-map                                                           | ✅ allowed (attribute)          |
| supermemory                                                               | MIT (engine closed)                    | **Port** schema only                                                        | ✅ schema only                  |
| codegraph / codebase-memory-mcp                                           | MIT                                    | **Port** FTS/graph memory                                                   | ✅ allowed (attribute)          |
| LMCache / liteparse / VoxCPM / timesfm                                    | Apache-2.0                             | **Adopt** as dependency/service                                             | ✅ allowed (attribute)          |
| supervision                                                               | MIT                                    | **Adopt** (pair w/ permissive VLM)                                          | ✅ — NOT with Ultralytics YOLO  |
| RLLM (`axis1/llm`) / Portkey / Bifrost / OpenMeter / PowerSync / Electric | Apache/MIT (PowerSync FSL→Apache 2027) | **Port/Service** per scout                                                  | ✅ allowed                      |
| **claude-code**                                                           | **NONE (proprietary)**                 | **STUDY ONLY** — never copy                                                 | ⛔ no code may be copied        |
| **crush**                                                                 | FSL-1.1 (competing-use ban)            | study only                                                                  | ⛔ no copy until MIT conversion |
| **auto-code-rover**                                                       | SONAR (competing-use ban)              | study only                                                                  | ⛔ no copy                      |
| **Devon**                                                                 | AGPL-3.0                               | study only                                                                  | ⛔ no copy                      |
| **plandex** (pre-2.0)                                                     | AGPL-3.0                               | current MIT only                                                            | ⚠️ pin current commits          |
| **OpenHands/enterprise/**                                                 | PolyForm Free Trial                    | avoid dir                                                                   | ⚠️ MIT core only                |
| **CopilotKit/showcase/**                                                  | proprietary                            | avoid dir                                                                   | ⚠️ `packages/*` only            |
| **init / chat-template**                                                  | NO LICENSE                             | study only                                                                  | ⛔ reimplement, never fork      |
| Ultralytics YOLO (not in corpus)                                          | AGPL-3.0                               | avoid                                                                       | ⛔ use permissive detector      |

---

## 2. Increment status (the loop queue)

Legend: ⬜ todo · 🔄 in progress · ✅ done · ⏸ blocked

### Phase 0 — Machinery

| ID      | Increment                             | Status | Commit    |
| ------- | ------------------------------------- | ------ | --------- |
| INC-0.1 | License-gate CI + THIRD_PARTY_NOTICES | ✅     | b1972485f |
| INC-0.2 | Pin reference SHAs + this tracker     | 🔄     | —         |
| INC-0.3 | Trust-boundary contract tests         | ⬜     | —         |
| INC-0.4 | Provider-contract test harness        | ⬜     | —         |
| INC-0.5 | SkillSpector vetting service stand-up | ⬜     | —         |

### Phase 1 — Public Alpha (web/mobile/desktop)

| ID       | Increment                            | Status | Commit |
| -------- | ------------------------------------ | ------ | ------ |
| INC-1.1  | C3 wire execpolicy into loop         | ⬜     | —      |
| INC-1.2  | C1 Tool trait                        | ⬜     | —      |
| INC-1.3  | C2 LLM compaction                    | ⬜     | —      |
| INC-1.4  | C4 streaming exec + recover          | ⬜     | —      |
| INC-1.5  | Secret-scan at Local→BYOK fork       | ⬜     | —      |
| INC-1.6  | SkillSpector install gate + rug-pull | ⬜     | —      |
| INC-1.7  | Mobile TLS pins enforced             | ⬜     | —      |
| INC-1.8  | Audit-log immutability migration     | ⬜     | —      |
| INC-1.9  | Marketing-vs-reality copy alignment  | ⬜     | —      |
| INC-1.10 | Global search                        | ⬜     | —      |
| INC-1.11 | Settings IA to spec                  | ⬜     | —      |
| INC-1.12 | Artifacts polish                     | ⬜     | —      |
| INC-1.13 | Provider robustness port             | ⬜     | —      |
| INC-1.14 | Website public alpha deploy          | ⬜     | —      |
| INC-1.15 | Desktop alpha (signed)               | ⬜     | —      |
| INC-1.16 | Mobile alpha (stores)                | ⬜     | —      |

### Phase 2 — Production for 1M

| ID       | Increment                    | Status | Commit |
| -------- | ---------------------------- | ------ | ------ |
| INC-2.1  | LMCache sidecar              | ⬜     | —      |
| INC-2.2  | Gateway hardening            | ⬜     | —      |
| INC-2.3  | Exact metering + drift audit | ⬜     | —      |
| INC-2.4  | Abuse/fraud edge             | ⬜     | —      |
| INC-2.5  | Memory P0                    | ⬜     | —      |
| INC-2.6  | Connectors directory         | ⬜     | —      |
| INC-2.7  | Sync engine                  | ⬜     | —      |
| INC-2.8  | VS Code from continue        | ⬜     | —      |
| INC-2.9  | liteparse ingestion          | ⬜     | —      |
| INC-2.10 | Voice + vision               | ⬜     | —      |
| INC-2.11 | Enterprise controls          | ⬜     | —      |
| INC-2.12 | Load/soak to 1M              | ⬜     | —      |

---

## 3. Attribution log (append one row per ported file)

| Date                                          | AGI file | Source repo@commit | Source file | License | Notes |
| --------------------------------------------- | -------- | ------------------ | ----------- | ------- | ----- |
| _(none yet — first entry lands with INC-1.1)_ |          |                    |             |         |       |

---

## 4. Next action

**INC-0.3** (trust-boundary contract tests) is the next increment, per the loop in
`11-execution-playbook.md`. INC-0.1 (license gate) is ✅. INC-0.2 (tracker) is now tracked + maintained.

## 5. Session progress log

### 2026-06-28 — setup + working-tree reconciliation

Done-condition progress: **#1 CLEAN ✅** and **#2 STRUCTURE ✅** met.

- `b1972485f` ci(licenses): license-gate check + `check:licenses`/`check:capability-boundaries` scripts (INC-0.1 ✅)
- `b871804b2` chore(scripts): add clean-repo, migrate-structure, spec-artifacts, capability-boundary checks
- `5effdd333` chore(repo): applied `clean-repo --apply` (git-rm 932 stale audit/reports/tasks/archive files); doc-status.json pruned to match
- `33ae51130` fix(mobile): stream-error copy stays clean — `[DIAG]` diagnostic string no longer leaks into the assistant bubble/retry banner (console-only now); mobile suite 144/144 green
- `15e129f10` fix(models): reconciled `models.curation.json` + `models.synced.json` via `extract` round-trip so the generator reproduces the committed catalog. Pre-existing drift: curation lagged hand-edits to `models.json` (missing gpt-5-nano/gpt-4.1-nano, stale canonicalization + managed_cloud.taskRouting). `sync:models:check` was RED at HEAD; now GREEN with **zero** per-model data loss (verified field-level vs HEAD). types tests 256/256.
- `385e47737` feat(packages): platform capability matrix + unified-chat consumers (unified-chat 467/467)
- canonical docs commit: added `docs/spec` (master spec + 40 volumes), `docs/strategy`, `docs/00-foundation`
- `c2dddae7f` docs: refreshed current docs + root guides
- web group commit: capability provider, mobile API, neon 0043/0044, new tests (web typecheck green; new tests green)
- `05fdf0f6c` fix(desktop): clearer Local-mode routing errors (respects `local_only`, no BYOK/Managed leak), deterministic AC-19 skill ranking, cloudRollback test (cargo check + desktop typecheck green)
- `7a926f298` test(web): tool-timeline running header updated to status-phrase behavior (stale test after 5b54d58d0) — web ToolTimeline 17/17
- `refactor(cli)`: applied `migrate-structure --apply` → exec tools folder-per-tool (`{tool}/mod.rs`); `check:structure-conventions` green, cargo check -p agiworkforce-cli green (INC structure ✅)

**Pre-existing reds (NOT regressions, logged):** `apps/web` ~13 Neon-integration tests (memory, device-code, routing_preferences, me, artifacts) fail locally for lack of Postgres but pass in CI — already tracked as `CI-INSTEP-REDS-01` in known-flaws.
