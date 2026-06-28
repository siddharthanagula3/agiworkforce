# AGI Strategy Package — Executive Summary & Index

Status: Strategy analysis (not source-of-truth)
Owner: Founder
Last updated: 2026-06-27
Prepared by: competitive teardown + codebase audit + market/funding research, June 2026

This folder is a founder + investor + engineering strategy package answering one brief: _what makes the Claude/ChatGPT app suites exist, what's missing from AGI, what it takes to scale to 1M users, and what the real path to a billion-dollar outcome looks like._ The framing throughout is **honest and ambitious** — reality-check plus the real path, as you asked.

These docs are analysis, not source-of-truth. They do **not** override `AGENTS.md`, `docs/current/`, `PLAN.md`, or `TODO.md`. Where they overlap with your parity matrix, your matrix wins on detail.

---

## Read in this order

| #   | Doc                                                                                          | What it answers                                                                | For                        |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| 1   | [`01-competitive-teardown.md`](01-competitive-teardown.md)                                   | Anatomy of Claude + ChatGPT/Codex suites; what it takes to build one           | Founder + Eng              |
| 2   | [`02-gap-analysis.md`](02-gap-analysis.md)                                                   | Target vs. AGI codebase, surface by surface; what's missing                    | Founder + Eng              |
| 3   | [`03-code-reality-and-tech-debt.md`](03-code-reality-and-tech-debt.md)                       | What's real vs. theater; severity-ranked risk register                         | Eng + Investor (diligence) |
| 4   | [`04-scaling-to-1M-architecture.md`](04-scaling-to-1M-architecture.md)                       | System design + cost model + ADRs for 1M users                                 | Eng                        |
| 5   | [`05-gtm-pricing-business-model.md`](05-gtm-pricing-business-model.md)                       | Positioning, the no-markup problem, ICP, pricing, moat                         | Founder + Investor         |
| 6   | [`06-fundraising-and-financial-plan.md`](06-fundraising-and-financial-plan.md)               | The honest $1B question, comparables, raise plan, metrics                      | Founder + Investor         |
| 7   | [`07-roadmap-12-month.md`](07-roadmap-12-month.md)                                           | The integrated Now/Next/Later plan; what to do, in order                       | Founder + Eng              |
| 8   | [`08-brand-and-narrative.md`](08-brand-and-narrative.md)                                     | Brand voice + the positioning story                                            | Founder + Marketing        |
| 9   | [`09-reference-codebases.md`](09-reference-codebases.md)                                     | What to steal from `claude-code` + `odysseus` (the two closest references)     | Founder + Eng              |
| 10  | [`10-oss-corpus-port-plan.md`](10-oss-corpus-port-plan.md)                                   | Prioritized, license-aware port plan across ~50 reference repos                | Founder + Eng              |
| 11  | [`11-execution-playbook.md`](11-execution-playbook.md)                                       | The build plan: commit-by-commit loop to alpha (1mo) → production for 1M (3mo) | Founder + Eng              |
| —   | [`PORTING-TRACKER.md`](PORTING-TRACKER.md)                                                   | Live increment status + license/attribution log (loop's source of truth)       | Eng                        |
| 12  | [`12-website-production-plan.md`](12-website-production-plan.md)                             | Website → production, increment-by-increment (surface 1 of 3)                  | Founder + Eng              |
| 13  | [`13-mobile-production-plan.md`](13-mobile-production-plan.md)                               | Mobile → production (surface 2 of 3), Xcode-MCP tested                         | Founder + Eng              |
| 14  | [`14-desktop-production-plan.md`](14-desktop-production-plan.md)                             | Desktop → production (surface 3 of 3), odysseus-referenced                     | Founder + Eng              |
| 15  | [`15-structure-and-granularity-conventions.md`](15-structure-and-granularity-conventions.md) | Clean structure / file-naming / folder-per-tool conventions + enforcement      | Eng                        |

---

## The five things that matter most

### 1. Your code is not "AI slop." That premise is wrong — and costing you.

The audit (`03`) rates the codebase **~80–85% real**, professionally engineered, with an unusually honest culture (stubs labeled as stubs, scripted demos labeled scripted, fabricated data actively deleted). 6,782 Rust test functions, 824 TS test files, zero hollow tests, zero panic-stubs. The genuinely deceptive theater is **under ~5% and almost none of it user-reachable**. You have a _working multi-surface product_, not a pile of slop. Stop under-selling it.

### 2. The surfaces are the cheap part. The runtime and the trust boundary are the product.

Both incumbents build **one agent runtime + one model platform, then ship thin clients** (`01`). AGI's monorepo already has this shape. The highest-leverage work for the next year is hardening the **one shared runtime** and making the **trust boundary provably airtight** — not widening surfaces. Every hour duplicating logic per-surface is debt; every hour in shared `packages/`/`crates/` pays off six times.

### 3. "$1B in 12 months" as a multi-provider chat app is not real. The repositioned version is.

Sub-12-month unicorns are either **ex-frontier-lab founders raising on pedigree** or **viral products with record ARR** (`06`). A multi-provider chat app is neither, and that category is the **most defunded in the mid-2026 market** — VCs explicitly screen out wrappers/aggregators. The achievable, genuinely ambitious goal: reposition the same assets as a **sovereign/privacy-first enterprise platform**, land design partners, hit $1–3M ARR at 50%+ software margin, and raise a Series A — a credible unicorn trajectory over ~2 years, which is itself top-decile.

### 4. "No markup" is a great trust feature and a terrible business model. Keep one, kill the other.

Reselling tokens at no markup means **~0% token gross margin by design** (`05`). To a VC, "we resell tokens at no markup" reads as "we have no business model." The fix: pass compute through at cost — transparently, like electricity — and **charge for the software** (orchestration, trust/governance, compliance, deployment). You have real software value to charge for (`03`); make _that_ the revenue line. Bonus: your Local/BYOK architecture makes you capital-efficient — you don't burn $8 of compute per $1 of subscription like the incumbents did in 2026.

### 5. Your moat is the combination, aimed at the right buyer.

No single differentiator is defensible alone — multi-provider and BYOK are copyable, Rust/Tauri is a feature. The **defensible system** is local-first + no-egress + multi-provider + a real cross-surface product + trust enforced in code, **pointed at a buyer who needs all of it at once**: regulated, privacy-sensitive enterprises (legal, health, finance, public sector). Incumbents are _structurally conflicted out_ of that niche because serving it cannibalizes their data flywheel. That's your opening.

### Bonus: you have the answer keys (`09`)

The two reference repos you flagged are the two halves of AGI as _working code you can read_. `claude-code` (Claude Code's actual internals) shows your Rust CLI matches on breadth but lags on four specific depth items — a real `Tool` trait, LLM-summarization compaction, wiring the policy engine you already built, and streaming tool execution — which is where Claude Code's hour-long-session reliability comes from. `odysseus` (an open-source local-first AI workspace — your exact thesis, shipped broad by one builder) hands you ~14 concrete patterns to steal and a list of OSS (llmfit, Tongyi DeepResearch, ChromaDB, fastembed) to adopt instead of building. Between them they de-risk most of the hard problems — treat them as answer keys.

And `10` widens that to your full ~50-repo reference library. The decisive find: your `agiworkforce-execpolicy` crate is a fork of OpenAI Codex's `execpolicy`, so **codex-rs (Apache-2.0, Rust) is a near-drop-in donor for all four runtime gaps** — wiring, not rebuilding. Plus `continue` for the VS Code surface, `supermemory`'s schema for Memory, NVIDIA's `SkillSpector` as a marketable trust/safety gate for the plugin marketplace, `CopilotKit` for artifacts UI, and `LMCache`/`liteparse`/`VoxCPM` for cost/ingestion/voice — each with license gates flagged (codex/continue safe; crush/auto-code-rover/Devon/Ultralytics-YOLO are not). The takeaway: almost every hard problem now has a license-cleared reference to port from, so spend scarce original engineering only on the three true build-from-scratch items — which are also your moat.

---

## The plan of record (one paragraph)

Ship Mobile to the App Store. Make the trust boundary provably airtight (TLS pins, audit-log immutability, egress contract tests — all cheap, all in `03`). Harden the shared agent runtime. Reposition from "multi-provider chat app" to "sovereign AI workspace." Land 3–5 regulated-vertical design partners. Raise pre-seed/seed on that story, backed by a diligence-grade codebase. Then Series A on $1–3M ARR at 50%+ margin and >120% NRR. Treat "$1B in a year" as the bar that sets ambition — and a 2–3 year unicorn trajectory as the honest, achievable plan.

---

## Honest caveats on this analysis

- Competitor facts are web-sourced (June 2026); the fastest-moving (model lineups, valuations, ARR) will drift — re-verify before external use. Items that couldn't be confirmed against a primary source are flagged **[unverified]** in the source docs.
- The code audit is read-only and sampled; it cross-checks your own `known-flaws.md`/`risk-map.json`/TODO rather than re-deriving everything.
- Financial figures (comparables' ARR/valuation) are largely run-rate/third-party estimates, not audited.
- The strategic recommendations are opinionated by design — you asked for honest, not neutral. Pressure-test them against your own market knowledge.
