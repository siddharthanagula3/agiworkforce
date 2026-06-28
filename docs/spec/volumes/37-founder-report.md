# Volume 37 — Founder Report (GTM / Business Model / Fundraising)

Status: Canonical · program volume (depth of Master Spec Vol 37)
Authority: `docs/strategy/05-gtm-pricing-business-model.md`, `06-fundraising-and-financial-plan.md`, `docs/strategy/README.md`, `08-brand-and-narrative.md`. Those hold the comparables, sourcing, and full argument; this volume holds the binding posture every session should encode.

## Philosophy & Cloud/Local stance

This volume exists so that engineering decisions, marketing copy, and pitch claims all flow from one honest business posture instead of drifting. The posture (`strategy/05`/`06`): **the product as a horizontal, multi-provider, BYOK, zero-markup consumer chat app is the single most defunded category in mid-2026.** That is not a reason to stop — it is a reason to _reposition the same assets_ toward where the money and the moat actually are: **sovereign / privacy-first enterprise** in regulated verticals.

The Cloud/Local stance _is_ the GTM. Local/BYOK push inference COGS toward ~$0 for AGI, which makes the company **capital-efficient by construction** — "we don't burn $8 of compute per $1 of subscription like the incumbents did in 2026" (`strategy/05` §1, `06` §6). Managed Cloud is the only line that carries real inference cost, so it is passed through at cost and kept off the consumer-scale growth path until safe-to-scale (Vol 36).

## Binding rules

1. **"No markup" is a trust feature, not the revenue line.** Reselling tokens at no markup is ~0% token gross margin by design; to a 2026 VC it reads as "no business model." Pass compute through at cost — like electricity — and **charge for the software** (orchestration, trust/governance, compliance, deployment) (`strategy/05` §1).
2. **Lead with sovereignty, not "a better ChatGPT."** The wedge is the three things incumbents structurally cannot/will not do: privacy/no-egress, multi-provider neutrality, local-first BYOK economics — aimed at a buyer who needs all of it at once (`strategy/05` §2).
3. **The ICP is regulated/privacy-sensitive enterprise** (legal, health, finance, public sector, defense). Developers + prosumers are the **top-of-funnel and credibility engine**, not the revenue engine (`strategy/05` §3).
4. **Engineering and marketing inherit the metrics that matter:** ARR (software only), gross margin ≥50% trending 70%, NRR >120%, GRR ~70%+, design-partners→paid logos, a provable trust architecture. **Not** headline user count or pass-through revenue (`strategy/06` §5).
5. **The moat is the combination + vertical depth, aimed at the right buyer.** No single bullet (multi-provider, BYOK, Rust/Tauri) is defensible alone; the _system_ enforced in code, pointed at the compliance buyer, is (`strategy/05` §6).
6. **Honest ambition, not fantasy.** "$1B in 12 months" as a chat app is not real; the achievable version is a credible Series-A-to-unicorn trajectory over ~2 years on the sovereign-enterprise repositioning (`strategy/06` §1, §7). Treat the billion as the bar that sets ambition, not the plan of record.

## Repository map / authority docs

- GTM/pricing/moat: `docs/strategy/05-gtm-pricing-business-model.md`.
- Fundraising reality + raise plan + comparables: `docs/strategy/06-fundraising-and-financial-plan.md`.
- Brand voice + positioning story: `docs/strategy/08-brand-and-narrative.md`; package framing: `docs/strategy/README.md`.
- The assets the story rests on (cite these in diligence): the trust contracts (`packages/types/src/suite-contracts.ts`), the multi-provider catalog (`packages/types/src/models.json`), the self-auditing ledgers (`docs/agent-context/known-flaws.md`, `risk-map.json`), and the code-quality verdict (Vol 35 / `strategy/03`).

## Competitor notes

The consumer AI category is a winner-take-most monopoly — **ChatGPT is ~77% of all gen-AI app revenue**; Apple is routing Siri to Gemini across ~2B devices; "Sherlocking" wiped out ~200 funded wrapper startups; paid consumer acquisition is a losing auction against free, pre-installed incumbents (`strategy/05` §2). Incumbents are **structurally conflicted out** of the privacy-purist niche because serving it cannibalizes their inference revenue and data flywheel (`strategy/01` §5, `06` §3) — that conflict is AGI's best structural defense. Caveat to keep honest: multi-provider and BYOK are copyable, and neutral aggregators (OpenRouter, Poe) are _not_ conflicted out the way the labs are — so the durable edge is the _combination_ aimed at the compliance buyer, not any single feature (`strategy/05` §2).

## Checklists

### Positioning & narrative discipline

- [ ] Public-facing one-liner leads with sovereignty/privacy/no-egress, not "multi-provider chat."
- [ ] "No markup" is framed as a trust feature; the revenue story is the software layer.
- [ ] Marketing claims gated to `Present` parity rows (Vol 34/35); no unshipped capability in present tense.
- [ ] The ICP (regulated enterprise) is explicit in pitch + site; dev/prosumer framed as funnel.
- [ ] Capital-efficiency story ("we don't burn $8/$1") is in the pitch.

### Pricing model (charge for software, never tokens) (`strategy/05` §4)

- [ ] Free/OSS tier: Local + BYOK + multi-provider + basic surfaces ($0; adoption).
- [ ] Pro (~$20/mo): sync, projects/memory, artifacts, connectors; inference still BYOK or passed-through.
- [ ] Managed Cloud: subscription + **pass-through inference at cost (transparent)** + platform fee (margin is the platform, not tokens).
- [ ] Team (~$25–40/seat): shared projects, admin, connector controls, SSO.
- [ ] Enterprise/Sovereign (custom): on-prem/VPC deploy, audit/compliance API, SCIM, data residency, RBAC, support — the 70%+ gross-margin line.

### Distribution (from the wedge, not paid consumer acquisition) (`strategy/05` §5)

- [ ] Developer-led, bottom-up (GitHub/HN; quality + trust architecture vs. LibreChat/Open WebUI).
- [ ] Privacy/sovereignty content + 3–5 regulated-vertical design partners.
- [ ] Adopt open ecosystem standards (MCP, Skills) — interoperate, don't wall.
- [ ] App stores as presence/credibility, not the growth engine.
- [ ] The "no metered black box" message to teams burned by 2026 subscription overages.

### Fundraising sequence (`strategy/06` §4)

- [ ] Pre-seed/angel (now–3mo): working multi-surface product + sharpened sovereign-AI narrative (~$0.5–3M; ~$8–20M post — expect below the headline AI premium).
- [ ] Seed (3–9mo): 3–5 design partners, Mobile shipped, trust architecture provable, early ARR (~$3–8M; ~$20–50M post).
- [ ] Series A (9–18mo): ~$1–3M ARR, ≥50% margin (software), NRR >120%, an enterprise logo or two (~$10–25M; ~$60–150M post).
- [ ] The $1B conversation (18–36mo): category leadership in sovereign AI for a vertical, with ARR/retention/margin to underwrite it.

### What investors must see (kill the wrong metrics) (`strategy/06` §5)

- [ ] ARR ~$1–3M (willingness to pay for software, not tokens).
- [ ] Gross margin ≥50% trending 70%+.
- [ ] NRR >120%; GRR ~70%+.
- [ ] 3–5 design partners → first paid logos.
- [ ] Trust architecture provable + audited (contract tests).
- [ ] Remove headline user count + pass-through "revenue" from the deck.

## Definition of Done

The founder posture is "production-ready" when: every public surface and pitch leads with the sovereign/privacy wedge; "no markup" appears only as a trust feature; pricing charges for software not tokens; the diligence assets (code-quality verdict, in-code trust architecture, self-auditing ledgers) are packaged and current; and the metrics the company reports are the software-value/trust metrics, not vanity counts. The plan of record is: ship Mobile, land design partners, prove the trust architecture, hit $1–3M ARR at ≥50% margin, raise a Series A.

## Anti-patterns

- Pitching "$1B in 12 months as a multi-provider chat app" (fails the wrapper/aggregator screen by construction).
- Presenting pass-through token spend as revenue, or "no markup" as the business model.
- Leading with "a better ChatGPT" and competing on the most expensive paid-acquisition channels in history.
- Targeting consumers as the revenue engine (~30% faster churn; ~23% sub-$50 retention).
- Reporting headline user counts/pass-through revenue to investors who now discount both.
- Letting marketing outrun shipped scope — the recurring debt class that also breaks diligence (Vol 35).
