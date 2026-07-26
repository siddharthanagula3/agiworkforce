# Volume 36 — Roadmap & Release Readiness

Status: Canonical · program volume (depth of Master Spec Vol 36)
Authority: `docs/strategy/07-roadmap-12-month.md`, `11-execution-playbook.md`, `12-website-production-plan.md`, `13-mobile-production-plan.md`, `14-desktop-production-plan.md`, `docs/current/source-of-truth.md`, `PORTING-TRACKER.md`. These hold the per-increment detail; this volume holds the binding sequence + release gates.

## Philosophy & Cloud/Local stance

The roadmap has one organizing principle (`strategy/07` §intro): **harden the runtime and the trust boundary, ship the active surface, land design partners, raise — in that order.** Resist widening surfaces before the shared core is solid. Every hour in shared `packages/`/`crates/` pays off six times; every hour duplicating logic per-surface is debt.

Surface sequence is serial, not parallel: **Website → Mobile → Desktop** (`strategy/11` §intro; founder priority). A surface ships only when its production plan's exit criteria and the per-increment Definition of Done are green.

Cloud/Local stance shapes _what_ ships when: Local/BYOK features are capital-efficient and de-risk the business, so they lead; Managed Cloud is the revenue engine but must be **safe-to-scale** (metering, abuse, refund/chargeback) before it carries load — it is in public alpha now (open by default, env kill-switch only — Vol 3), and that gate is correct, not a blocker to remove.

## Binding rules

1. **Ship serially: Website → Mobile → Desktop.** Do not open a new surface front until the active surface hits its production-plan exit criteria (`strategy/12`/`13`/`14`).
2. **Runtime before surfaces; trust before growth; depth before breadth.** (Operating Law 8; `strategy/07` §5.) Prove the trust boundary in code before scaling users into it.
3. **A release gate is exit-criteria + per-increment DoD, both green.** No surface ships on a demo or a green build alone (Operating Law 4).
4. **Tier-1 risks block release.** R1 (audit-log immutability), R2 (mobile TLS pins), R3 (Rust-egress gating) from Vol 35 must be resolved before the relevant surface's public release.
5. **Increments come from `PORTING-TRACKER.md`, in order.** Each is a self-contained work order: branch → study → port (license-clean) → attribute → verify → commit on `feat/agi-alpha` → update tracker (Vol 40).
6. **North-star is weekly active workspaces**, not signups or pass-through revenue (`strategy/07` §4; Vol 37).

## Repository map / authority docs

- 12-month plan + RICE + KPIs: `docs/strategy/07-roadmap-12-month.md`.
- The build loop + phase gates: `docs/strategy/11-execution-playbook.md`; live status in `PORTING-TRACKER.md`.
- Per-surface production plans (exit criteria live here): `12-website-production-plan.md`, `13-mobile-production-plan.md`, `14-desktop-production-plan.md`.
- Surface code: `apps/{web,mobile,desktop,cli,extension,extension-vscode}`; shared `packages/`/`crates/`; backend `services/`.
- Per-surface checks: `docs/agent-context/commands.json`.

## Competitor notes

Incumbents ship rapid model-family cadence as a weapon (`strategy/01`) and run **continuous app-store/marketplace review-compliance** across iOS, Android, Chrome Web Store, VS Code Marketplace, JetBrains, and cloud marketplaces. AGI cannot match model cadence and should not try; AGI's release discipline competes on **trust + honesty** instead — gated claims, provable boundaries, serial surfaces done well. Don't fight incumbent strengths (frontier models, distribution); attack the structural weakness (data sovereignty) on a sequence you can actually execute (`strategy/07` §5).

## Checklists

### NOW (0–3 months) — ship, harden, de-risk (`strategy/07` §2)

- [ ] Provision real mobile TLS pins + enable enforcement (R2; `check:tls-pins` green).
- [ ] Apply audit-log immutability migration (R1; verify in Neon).
- [ ] Confirm Rust-egress path stays gated; add trust-boundary contract tests (R3; INC-0.3).
- [ ] Finish Mobile v1 to App Store submission (active surface).
- [ ] Align all marketing copy to shipped scope (mobile vision/translation, "parity") (R5/R6).
- [ ] Sweep dead code (Vite/Netlify leftovers, orphaned components) (R13).
- [ ] Sharpen the sovereign-AI narrative + one-pager (Vol 37).

### NEXT (3–6 months) — close perception gaps, start enterprise motion

- [ ] Global search (chats/projects/artifacts/files), trust-scoped.
- [ ] Settings IA to the locked spec (Desktop + Web).
- [ ] Connectors/apps directory (categories, search, per-tool permissions).
- [ ] Artifacts polish (versioning, publish/share, error-fix loop).
- [ ] Mount or cleanly gate AGI Code in Desktop V3 (R12).
- [ ] Land first 2–3 design partners (legal/health/finance).
- [ ] Exactly-once metering + daily drift audit (BILL-01).
- [ ] Pre-seed/angel raise on the repositioned story.

### LATER (6–12 months) — depth, enterprise, scale-readiness

- [ ] Projects + Memory completeness (RAG, isolation, import/export).
- [ ] Deep research flow (on the existing agent loop + web search).
- [ ] Enterprise controls: SCIM, audit API, RBAC, data residency, on-prem/VPC deploy.
- [ ] Routing-as-a-service (capability/cost/health/trust aware).
- [ ] Harden Managed Cloud (abuse/fraud, refund/chargeback, retention).
- [ ] Sync engine completeness (one conflict model, app-chat scoped).
- [ ] Stricter CLI/IDE/Chrome parity passes (only after core + Mobile + enterprise solid).
- [ ] Series A on $1–3M ARR / ≥50% margin / NRR >120%.

### Release-readiness gate — per surface (all must be green before public release)

- [ ] The surface's production plan exit criteria (below) are all met.
- [ ] Per-increment DoD green for every shipped increment (typecheck/lint/cargo + targeted tests + surface check + e2e/visual for UI + trust-boundary tests for networking).
- [ ] Tier-1 risks resolved for this surface (R1/R2/R3 as applicable).
- [ ] Zero trust-boundary violations (P0 if any).
- [ ] All present-tense marketing maps to `Present` parity rows (Vol 34).

### Per-surface exit criteria

- [ ] **Website** (`strategy/12`): Neon-backed state only; no BYOK/free-env-key chat on web; CSP/CORS/CSRF verified; global search + settings IA present; trust labels visible; smoke e2e green on the prod URL.
- [ ] **Mobile** (`strategy/13`): real TLS pins enforced; on-device LLM first-token works; cloud gated unless entitled; copy matches shipped scope; App Store + Play review passed; crash-free >99.5%.
- [ ] **Desktop** (`strategy/14`): signed/notarized build; Local+BYOK+Managed modes visible; MCP/connectors wired; local files never auto-upload; updater works; computer/browser-use approvals gated.

### KPI review (monthly; `strategy/07` §4)

- [ ] Weekly active workspaces growing ~15–20% MoM off a real base.
- [ ] Local/BYOK vs. Managed mix tracked (capital efficiency).
- [ ] ARR (software layer only) tracking toward $1–3M; gross margin ≥50% trending 70%.
- [ ] NRR >120% / GRR ~70%+; design partners → first paid logos.
- [ ] Stream success >99.5%; metering accuracy >99.99%; trust-boundary violations = 0.

## Definition of Done

The 12-month plan-of-record success state (`strategy/07` §6): Mobile shipped and credible; the trust boundary provably airtight; the shared runtime hardened; 3–5 regulated design partners with first paid logos; $1–3M ARR at ≥50% software margin; a pre-seed/seed closed on a sovereign-AI narrative backed by a diligence-grade codebase. A _surface_ is done when its exit criteria + per-increment DoD are green and Tier-1 risks for it are resolved.

## Anti-patterns

- Opening a new surface before the active one hits its exit criteria (breaks the serial rule).
- Widening surfaces instead of hardening the shared runtime (the wrong lever).
- Shipping on a green build or a good demo without exit criteria + DoD.
- Releasing a surface with an unresolved Tier-1 risk (R1/R2/R3).
- Treating "$1B in 12 months" as the plan rather than the aspiration (Vol 37).
- Optimizing signups/pass-through revenue instead of weekly active workspaces.
