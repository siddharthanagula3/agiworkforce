# 12-Month Roadmap — The Integrated Plan

Status: Strategy analysis (not source-of-truth)
Owner: Founder
Last updated: 2026-06-27
Companion docs: all of `docs/strategy/`; reconcile with your `PLAN.md`, `TODO.md`, `docs/current/source-of-truth.md`

This is the synthesis: _what to do now, with long-term thinking, in order._ It integrates the gap analysis (`02`), the risk register (`03`), the scaling plan (`04`), and the GTM/funding strategy (`05`/`06`) into one prioritized sequence. It respects your serial-by-surface rule (Mobile is the active surface) and your trust-mode locks.

The roadmap has one organizing principle: **harden the runtime and the trust boundary, ship the active surface, land design partners, raise — in that order.** Resist widening surfaces before the shared core is solid.

---

## 1. Strategic objectives (the year)

1. **Ship Mobile to public App Store release** (your active surface; the credibility gate).
2. **Make the trust boundary provably airtight** (privacy is the product; any leak is existential).
3. **Harden the one shared agent runtime** so all surfaces inherit reliability.
4. **Land 3–5 regulated-vertical design partners** (the fundable wedge from `05`/`06`).
5. **Reposition the narrative** from "multi-provider chat app" to "sovereign/private AI workspace."
6. **Raise pre-seed/seed** on that repositioned story with the code-quality diligence assets.

---

## 2. Now / Next / Later

### NOW (0–3 months) — ship, harden, de-risk

| Item                                                                            | Why                                              | Source          |
| ------------------------------------------------------------------------------- | ------------------------------------------------ | --------------- |
| Provision real TLS pins + enable enforcement (mobile)                           | Launch blocker; MITM exposure                    | R2 (`03`)       |
| Apply audit-log immutability migration                                          | Blocks any compliance claim; diligence red flag  | R1 (`03`)       |
| Confirm Rust-egress path stays gated; add trust-boundary contract tests         | Privacy is the product; prove it mechanically    | R3 (`03`), `04` |
| Finish Mobile v1 to App Store submission                                        | Active surface; serial-by-surface rule           | source-of-truth |
| Align all marketing copy to shipped scope (mobile vision/translation, "parity") | Diligence + app-store review punish overclaiming | R5/R6, `03`     |
| Sweep dead code (Vite/Netlify leftovers, orphaned components)                   | Hygiene; confuses contributors + agents          | R13, `03`       |
| Sharpen the sovereign-AI narrative + one-pager                                  | Everything downstream depends on it              | `05`, `08`      |

### NEXT (3–6 months) — close perception gaps, start the enterprise motion

| Item                                                                 | Why                                                             | Source                |
| -------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------- |
| Global search (chats/projects/artifacts/files)                       | High-visibility "feels finished" gap; cheap                     | `02`                  |
| Settings IA to the locked spec (Desktop + Web)                       | Parity perception; demo-critical                                | `02`, source-of-truth |
| Connectors/apps directory (categories, search, per-tool permissions) | Incumbents' lock-in mechanism; reads as "platform"              | `02`                  |
| Artifacts polish (versioning, publish/share, error-fix loop)         | Highest "wow" in a demo                                         | `02`                  |
| Mount or cleanly gate AGI Code in Desktop V3                         | Orphaned today; either ship or hide                             | R12, `02`             |
| Land first 2–3 design partners (legal/health/finance)                | Their compliance reqs = your roadmap; logos = fundraising proof | `05`, `06`            |
| Exactly-once metering + drift audit (BILL-01)                        | Revenue-leak risk before Managed scale                          | `04`, your TODO       |
| Pre-seed/angel raise on the repositioned story                       | Capital for 18–24 mo runway                                     | `06`                  |

### LATER (6–12 months) — depth, enterprise, scale-readiness

| Item                                                                           | Why                                             | Source          |
| ------------------------------------------------------------------------------ | ----------------------------------------------- | --------------- |
| Projects + Memory completeness (RAG, isolation, import/export)                 | Retention/workspace habit                       | `02`            |
| Deep research flow (on the existing agent loop + web search)                   | Marketing value; reuses runtime                 | `02`            |
| Enterprise controls: SCIM, audit API, RBAC, data residency, on-prem/VPC deploy | The actual product for the paying ICP           | `02`, `05`      |
| Routing-as-a-service (capability/cost/health/trust aware)                      | Differentiator + margin control                 | ADR-2 (`04`)    |
| Harden Managed Cloud (abuse/fraud, refund/chargeback, retention)               | The revenue engine; safe-to-scale gate          | ADR-4 (`04`)    |
| Sync engine completeness (one conflict model, app-chat scoped)                 | Gating dependency for multiple features         | `04`, your TODO |
| Stricter CLI/IDE/Chrome parity passes                                          | Only after core + Mobile + enterprise are solid | `02`            |
| Series A on $1–3M ARR / 50%+ margin / NRR >120%                                | The unicorn-trajectory unlock                   | `06`            |

---

## 3. RICE-style prioritization of the top contested items

(Reach × Impact × Confidence ÷ Effort; relative 1–10 scale, illustrative — recompute with your data.)

| Item                                         | Reach | Impact | Conf. | Effort | RICE (rel.)   | Call                             |
| -------------------------------------------- | ----- | ------ | ----- | ------ | ------------- | -------------------------------- |
| TLS pins + audit immutability + egress tests | 10    | 10     | 9     | 2      | **highest**   | Do first — cheap, existential    |
| Ship Mobile to App Store                     | 9     | 9      | 8     | 5      | **very high** | Active surface                   |
| Global search                                | 8     | 6      | 9     | 3      | high          | Quick perception win             |
| Sovereign-AI repositioning + design partners | 6     | 10     | 7     | 4      | high          | Unlocks funding                  |
| Connectors directory                         | 7     | 7      | 7     | 6      | medium        | Platform credibility             |
| Artifacts polish                             | 7     | 7      | 7     | 6      | medium        | Demo "wow"                       |
| Enterprise controls (SCIM/audit/deploy)      | 4     | 10     | 7     | 8      | medium        | Gated by design-partner pull     |
| Visual design workspace                      | 5     | 5      | 4     | 10     | **low**       | Defer — it's a product in itself |
| New surfaces beyond the six                  | 3     | 3      | 4     | 9      | **lowest**    | Don't                            |

---

## 4. Metrics & KPIs (review monthly)

Per `06`, the metrics that matter are software-value and trust metrics — not headline users or pass-through revenue.

**North-star:** weekly active _workspaces_ (an account that returns and does real work), not raw signups.

| Category    | Metric                             | Target by month 12                                    |
| ----------- | ---------------------------------- | ----------------------------------------------------- |
| Adoption    | Weekly active workspaces           | Growing 15–20% MoM off a real base                    |
| Adoption    | Local/BYOK vs. Managed mix         | Track — Local/BYOK keeps you capital-efficient (`04`) |
| Revenue     | ARR (software layer only)          | $1–3M                                                 |
| Revenue     | Gross margin (software)            | ≥50%, trending 70%                                    |
| Retention   | NRR / GRR                          | >120% / ~70%+                                         |
| Enterprise  | Design partners → paid logos       | 3–5 → first paid                                      |
| Reliability | Stream success / metering accuracy | >99.5% / >99.99%                                      |
| Trust       | Trust-boundary violations          | **0** (P0 if ever >0)                                 |
| Quality     | Parity rows at `Present`           | Steady climb; marketing gated to it                   |

---

## 5. Sequencing principles (the long-term thinking you asked for)

1. **Runtime before surfaces.** Every hour in shared `packages/`/`crates/` pays off six times. Every hour duplicating logic in a surface is debt.
2. **Trust before growth.** A single privacy leak ends a privacy company. Prove the boundary in code before you scale users into it.
3. **Depth in one vertical before breadth across many.** The moat forms from compliance + workflow depth with real customers, not from feature count.
4. **Capital efficiency is the strategy, not a constraint.** Local/BYOK make you cheap to run; that _is_ the pitch ("we don't burn $8/$1 like incumbents"). Don't chase Managed consumer scale that inverts it.
5. **Honesty is a moat.** Your self-auditing culture (`03`) is rare. Keep marketing gated to shipped reality — it compounds into trust, which is the whole brand.
6. **Don't fight the incumbents head-on.** Ride their standards (MCP, Skills), avoid their strengths (frontier models, distribution), attack their structural weakness (data sovereignty).

---

## 6. The 12-month definition of success

Not "$1B valuation." That is the aspiration. The _plan of record_ success state:

> Mobile shipped and credible. Trust boundary provably airtight. The shared runtime hardened. 3–5 regulated design partners with first paid logos. $1–3M ARR at 50%+ software margin. A pre-seed/seed closed (Series A in sight) on a sovereign-AI narrative backed by a diligence-grade codebase.

Hit that, and you are a top-decile outcome on a genuine unicorn trajectory — which is the honest, ambitious version of the goal you set.
