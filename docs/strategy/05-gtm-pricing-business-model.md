# GTM, Pricing & Business Model

Status: Strategy analysis (not source-of-truth)
Owner: Founder
Last updated: 2026-06-27 (pricing tables superseded 2026-07-26 — see banner below)
Companion docs: `06-fundraising-and-financial-plan.md`, `08-brand-and-narrative.md`
Framing: honest and ambitious (per your request)

> **SUPERSEDED PRICING (2026-07-26):** the tier table in §"Charge for the software
> layer" predates the current tier lock and omits Basic and Max entirely. The
> canonical ladder is Free $0 / Basic $8 (₹399) / Pro $20 / Max $100 and $200 /
> Team per-seat / Enterprise custom — see `docs/current/unit-economics-and-pricing-model.md`.
> Everything here remains valid as market analysis, not as price truth.

This is the hardest doc in the package, because it contains the finding you most need to hear: **the product as currently framed — a horizontal, multi-provider, BYOK, zero-markup consumer chat app — is the single most defunded category in the mid-2026 market.** That is not a reason to stop. It is a reason to _reposition the same assets_ toward where the money and the moat actually are. This doc shows how.

---

## 1. The brutal truth about "no markup"

Your stated differentiator #3 is "BYOK only in Local Mode, with no markup." As a _trust signal_, it is excellent. As a _business model_, it is a trap, and you must separate the two.

- AI-native companies already run **~52% gross margins** (ICONIQ, Jan 2026) vs. 75–90% for SaaS, because inference is a real usage-scaling COGS line (~23% of revenue at scaling-stage AI cos).
- "No markup" on tokens means **your token gross margin is ~0% (slightly negative after payment fees), by design.** Any "revenue" that is passed-through token spend is _reimbursed expense_, not value capture. Investors multiply gross profit, not pass-through gross revenue.
- "We resell tokens at no markup" reads to a 2026 VC as **"we have no business model."** Around 50% gross margin is becoming the de facto Series A floor.

**The reframe (keep the feature, kill the framing):** pass compute through at cost — like electricity — and charge for the platform: orchestration, the trust/governance layer, the system of skills/connectors, compliance tooling, and the work the product actually performs. The operator quote worth internalizing: _"None of that is a commodity. You built it."_ No-markup only works **if you have genuine software value to charge for** — which, per `03`, you do. Make money on the software layer; let tokens be free and honest.

One real point in your favor: 2026 saw flat AI subscriptions blow up (GitHub moved all Copilot plans to usage-based June 1 2026; Anthropic reportedly burned ~$8 of compute per $1 of subscription). The only safe flat subscription is one where inference is BYOK or genuinely passed through. **Your architecture already avoids the trap that is hurting incumbents.** Position it that way.

---

## 2. Positioning: stop competing where you lose

The consumer AI category is a winner-take-most monopoly: **ChatGPT is ~77% of all gen-AI app revenue**; the top apps are incumbents or state-scale players; Apple is routing Siri to Gemini across ~2B devices; "Sherlocking" wiped out ~200 funded wrapper startups. A new horizontal entrant fights free, pre-installed alternatives on the most expensive paid-acquisition channels in history (Meta CPA ~$38, +38% YoY).

So do not lead with "a better ChatGPT." Lead with the three things incumbents **structurally cannot or will not do**:

1. **Privacy / sovereignty / no data egress.** The EU AI Act fully applies Aug 2 2026; ~77% of companies now weigh a vendor's country of origin; sovereign-AI demand is a wave. "Your data never leaves your boundary" is a credible, ownable wedge. Incumbents can't lead here without cannibalizing their data flywheel.
2. **No vendor lock-in / multi-provider neutrality.** 81% of enterprise leaders worry about AI vendor dependency; only 6% could switch primary vendors without disruption. AGI is the switch.
3. **Local-first + BYOK economics.** As inference trends toward free, "transparent pass-through + run it on your own infra/keys" becomes a trust and cost-control story for buyers who hate the metered black box.

Caveat to internalize: **multi-provider and BYOK are copyable features**, and neutral aggregators (OpenRouter, Poe) already offer them and are _not_ conflicted out of the niche the way the labs are. Your durable edge is the _combination_ — local-first + no-egress + multi-provider + a real cross-surface product + an honest trust architecture enforced in code — aimed at a buyer who needs all of it at once. That buyer is not the consumer.

---

## 3. The ICP decision: who actually pays

| Segment                                                                                            | Will they pay for AGI's wedge?                                                                                                           | Verdict                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Consumers (prosumers)                                                                              | Mostly want the best single model for free; churn ~30% faster than other apps; sub-$50 AI cohort retains ~23%/yr                         | **Not the venture path.** A fine OSS/bootstrapped audience (your real comps are LibreChat, Open WebUI). |
| Developers                                                                                         | Value multi-provider, BYOK, local, CLI/IDE. But monetization is thin and incumbents are strong.                                          | **Wedge for adoption + credibility, not for revenue.** Use to build distribution and a community.       |
| **Regulated / privacy-sensitive enterprises** (legal, healthcare, finance, public sector, defense) | Need exactly local-first + no-egress + multi-provider + audit/compliance. The ~$250+/mo vertical-B2B cohort retains ~70% GRR / ~85% NRR. | **This is the business.** Highest willingness to pay, lowest churn, structurally underserved by labs.   |

**Recommendation:** developer + prosumer adoption as the _top of funnel and credibility engine_; regulated-enterprise / sovereign-AI as the _revenue engine_. Your trust-boundary architecture is not a consumer nicety — it is the literal feature a compliance buyer is purchasing. Re-aim the whole story at them.

---

## 4. Pricing model

Charge for the software layer; never for tokens. A workable structure:

| Tier                       | Who                       | Price                                                                            | What they pay for (NOT tokens)                                                                                                                                                                          |
| -------------------------- | ------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Free / OSS**             | Local + BYOK individuals  | $0                                                                               | Local Mode, BYOK, multi-provider, basic surfaces. Drives adoption, community, credibility.                                                                                                              |
| **Pro**                    | Prosumers, developers     | ~$20/mo                                                                          | Sync, projects/memory, artifacts, advanced surfaces, connectors. Inference still BYOK or passed-through.                                                                                                |
| **Managed Cloud**          | Users who want zero setup | Subscription + **pass-through inference at cost** (transparent) + a platform fee | The platform/orchestration is the margin, not the tokens.                                                                                                                                               |
| **Team**                   | Small orgs                | ~$25–40/seat                                                                     | Shared projects, admin, connector controls, SSO.                                                                                                                                                        |
| **Enterprise / Sovereign** | Regulated verticals       | **Custom, seat + platform + deployment**                                         | The real margin: on-prem/VPC deployment, audit/compliance API, SCIM, data residency, RBAC, support, governance. **70%+ gross margin achievable here because the value is software, not resold tokens.** |

The Enterprise/Sovereign tier is where the venture-scale economics live. Everything below it is funnel and proof.

---

## 5. Distribution

The honest read: organic consumer virality is largely exhausted (ChatGPT/Lensa caught a novelty wave that's gone), and paid consumer acquisition is a losing auction against free incumbents. So distribution must come from the wedge, not from outspending OpenAI:

- **Developer-led, bottom-up.** Open-source the client/runtime where sensible (compete with LibreChat/Open WebUI on quality + the trust architecture). Win GitHub, Hacker News, and developer trust. This is cheap, credible, and feeds the enterprise funnel.
- **Privacy/sovereignty content + design partners.** Land 3–5 regulated-vertical design partners (legal/health/finance/public sector). Their compliance requirements _are_ your roadmap, and their logos are your fundraising proof.
- **Ecosystem standards.** Adopt MCP and the open Skills standard (both are open and competitor-adopted). Being interoperable beats being walled — and it lets you ride the incumbents' ecosystem rather than fight it.
- **App stores as presence, not as the growth engine.** Ship Mobile to the App Store (your active surface) for credibility and continuity, but don't model it as the acquisition flywheel.
- **The "no metered black box" message** to teams burned by Copilot/Claude subscription overage in 2026 — a timely, specific pain you uniquely address.

---

## 6. The moat — honest assessment

| Claimed moat                                          | Real?                       | Note                                                                               |
| ----------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| Multi-provider                                        | Weak alone                  | Copyable; OpenRouter/Poe already do it.                                            |
| BYOK / no markup                                      | Weak alone                  | Copyable; a trust feature, not a moat.                                             |
| Rust/Tauri desktop                                    | Medium                      | Real quality edge over Electron incumbents; still a feature.                       |
| Local-first / no-egress                               | **Strong**                  | Incumbents structurally conflicted out; hard to copy without self-harm.            |
| Trust architecture enforced in code                   | **Strong**                  | The combination + provability is the defensible asset (see `03` contract tests).   |
| Regulated-vertical depth (data, workflow, compliance) | **Strongest (to be built)** | Switching costs + compliance lock-in. This is where durable enterprise moats form. |

The moat is **the combination, aimed at a buyer who needs all of it**, plus the vertical depth you accumulate with design partners. No single bullet is defensible; the system, pointed at the right ICP, is.

---

## 7. The GTM thesis in one paragraph

AGI is the privacy-first, multi-provider AI workspace for organizations that cannot or will not send their data to a single foreign model lab. Developers and prosumers adopt it free (local + BYOK) and make it credible; regulated enterprises pay for the governed, deployable, compliant platform on top. Tokens are passed through at cost — transparently — and the business is the software: orchestration, trust, compliance, and the work the product performs. The wedge incumbents can't follow is data sovereignty; the proof they can't fake is an architecture that enforces it in code.
