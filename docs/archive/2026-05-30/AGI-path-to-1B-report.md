# AGI — Path to Break-Even, Profitability & a $1B Exit (Research-Based, 2026)

> Prepared 2026-05-30. Brutally realistic, not a pitch deck. Every number is tagged **[FACT]** (cited, externally verifiable) or **[ESTIMATE]** (the author's modeling, with stated assumptions). Where the founder's locked product decisions help or hurt the $1B goal, that is stated directly.
>
> Bottom line up front: a **$1B standalone exit on consumer subscription alone is not realistic** on the current plan. A **$200M–$500M outcome is achievable**, and a **$1B exit is reachable only via acquisition by a platform/cloud player or by adding a second revenue lever (enterprise/API/vertical)**. Profitability, however, is genuinely within reach for a bootstrapped solo founder — that is the part to bank on first.

---

## 1. Executive Summary — the honest answer

**Is $1B realistic?** Partly. Split the goal in two, because the founder stated it as "break-even + profitability, then $1B company OR ~$1B sell."

- **Profitability: YES, realistic.** [ESTIMATE] A bootstrapped solo founder with a near-zero marginal-cost inference model (on-device) can reach founder-livable profitability in **12–24 months**. This is the single most defensible part of the plan. [FACT] On-device inference has zero marginal cost per query versus cloud LLM inference at $0.14–$25 per million tokens; AI-dependent cloud apps run 25–60% gross margins versus 75–85% for traditional SaaS — AGI's architecture structurally avoids the margin treadmill that is killing GPT-wrapper startups (90% of pure wrappers projected to fail by end-2026).
- **$1B standalone company: NO, not on consumer subscription alone.** [FACT] The demonstrated ceiling for a single-lever consumer AI subscription app is ~$200–$500M ARR; even Perplexity (~$200M–$500M ARR depending on source/date, ~100M MAU) is not there as a pure consumer play and is not profitable. A standalone $1B _valuation_ needs ~$150–$300M+ ARR with growth — unreachable on India-first consumer subscription at $0.59–$2.39/month ARPU.
- **$1B exit (acquisition): POSSIBLE but conditional.** [ESTIMATE] Reachable only if AGI becomes a _strategic_ asset — owning a defensible India sensitive-data/vernacular niche, or holding genuinely differentiated on-device IP — that a platform player (Apple, Google, Meta, Samsung, Qualcomm, or a large Indian conglomerate) wants to buy. Base case is a **$150M–$400M acquisition**, not $1B.

**The single most important strategic move:** Add a **second, higher-ARPU revenue lever beyond India consumer subscription** — specifically a **B2B / vertical-privacy play** (regulated-data SMB or vernacular enterprise: legal, healthcare, finance, government data that _legally cannot leave the device/jurisdiction_). On-device privacy is table-stakes for consumers but a _real_ differentiator where data residency is a compliance requirement. This is the only finding-supported path that lifts the ceiling from $300M toward $1B. **CONSTRAINT TO ACKNOWLEDGE:** this move directly tensions the founder's own LOCKED rules — v1 is LOCAL-ONLY and managed cloud / monetized B2B is waitlist-gated until ledgering, abuse, fraud, refunds, chargebacks, provider terms, retention, and deletion controls are proven (MEMORY.md / CLAUDE.md). So the ceiling-lifter is **not free to start**: pursuing it is a deliberate decision to un-gate that lock and do the compliance work first. Also note the architectural tension — B2B buyers want admin controls, audit logs, and central policy, which pull _against_ pure on-device. The honest framing: the regulated-data niche is where on-device privacy becomes a true moat, but capturing it requires consciously reopening a locked decision and building the governance layer, not bolting a SKU onto the consumer app.

**The biggest risk:** Not competition — **commoditization + churn.** [FACT] Privacy-first is now mainstream (50–86% consumer concern, shipped by default by Apple/Google), so it is no longer a differentiator; [FACT] AI apps churn ~36% faster than non-AI apps and 72% of annual subscribers cancel within Year 1 (worsening from 56% in 2025). A privacy app with no data-network-effect moat, sold to low-ARPU users who churn fast, is the canonical $0 outcome. The whole plan lives or dies on **retention + a moat that isn't "privacy."**

---

## 2. Is this a $1B market?

**The market is real and growing — but it is not concentrated where AGI sits.**

- [FACT] On-device AI market: ~24.8–27.8% CAGR (2026–2033), reaching **$75–156B by 2033** (Grand View Research, Coherent Market Insights, SNS Insider). Confirmed by multiple analysts.
- [FACT] India conversational AI: ~25.6% CAGR 2026–2034, reaching **$5.9B by 2034** (IMARC). India is #1 globally in GenAI app downloads (207% YoY growth, 16–19% of global AI users) — **but generates only ~1% of global in-app revenue** (TechCrunch, Sensor Tower, Business Standard).

**Can privacy-first on-device AI support a unicorn?** The honest read of the evidence: **not as a standalone consumer app.**

- [FACT] Privacy is now a hygiene factor, not a wedge: 50–86% of consumers say they care, GDPR fines exceed €7.1B, and Apple/Google ship on-device privacy by default. Apple's ~$1B/year Gemini-for-Siri deal and iOS 27's plan to open Siri to third-party assistants prove **distribution and brand are the moat, not on-device technology.**
- [FACT] Single-app consumer AI subscription revenue plateaus at ~$200–$500M ARR. The only consumer AI names _above_ that (ChatGPT $25B ARR, Anthropic $14B+) win on **platform scale + enterprise/API**, not consumer subscription — ChatGPT is ~40%+ enterprise; Anthropic is ~80% enterprise API.
- [FACT] Standalone consumer AI app moats are weak (a16z 2026, Foundation Capital, Levera): the moat is brand + domain expertise + data network effects, none of which "on-device privacy" provides — in fact, on-device _removes_ the central server data that creates network effects.

**Verdict:** The _market_ is big enough to host a unicorn. AGI's _position within it_ (standalone consumer, India-first, privacy-as-wedge) is not unicorn-shaped. To reach $1B, AGI must change its position (add a lever) or change its outcome type (be acquired for strategic value).

---

## 3. The Numbers — the financial model

**Modeling assumptions (all [ESTIMATE] unless cited):**

- ARPU: India consumer at **₹149/mo (~$1.79)** blended after discounts/PPP; [FACT] India sweet-spot band is ₹49–₹199 ($0.59–$2.39).
- Gross margin: **~80% on inference** thanks to on-device (cloud-mode users carry their own cost via top-ups/BYOK). [FACT] On-device ≈ zero marginal cost; cloud AI apps sit at 25–60%. **IMPORTANT:** the GM figures in the table below are stated _before_ store commission. [FACT] Apple/Google take **30% on store-billed revenue above $1M proceeds/yr** (15% only below it). Because the model crosses $1M proceeds early (Y3), the _effective_ blended margin on store-billed revenue from Y3 on is **~50–55%, not 80%** — net of the store cut. On-device still beats cloud-AI peers, but do not double-count: subtract the store commission, then the on-device inference saving is the edge.
- Churn: **~7%/mo blended** (AI-app reality). [FACT] AI apps churn ~36% faster; 6–10% monthly typical.
- Free→paid conversion: **2.5%** (consumer freemium is 1–5%; AI apps slightly better per-payer but churn-heavy).
- Solo founder cash burn (bootstrap): **~$3–6K/mo** (infra + tools + part-time contractors), rising with scale.
- "Break-even" = monthly gross profit covers monthly cash costs incl. a modest founder salary.

### 3a. Bootstrap path (recommended) — year-by-year

| Metric               | Y1 (2026) | Y2 (2027)        | Y3 (2028) | Y4 (2029) | Y5 (2030) |
| -------------------- | --------- | ---------------- | --------- | --------- | --------- |
| Total installs (cum) | 300K      | 2.0M             | 8M        | 20M       | 40M       |
| Paying subs (active) | 4K        | 35K              | 160K      | 450K      | 950K      |
| Blended ARPU/mo      | $1.79     | $2.10            | $2.40     | $2.80     | $3.20     |
| ARR                  | ~$0.09M   | ~$0.9M           | ~$4.6M    | ~$15M     | ~$36M     |
| Gross margin         | 80%       | 80%              | 78%       | 77%       | 76%       |
| **Cash break-even?** | No        | **~Month 18–22** | Yes       | Yes       | Yes       |
| Founder take-home    | $0        | ~$30–60K         | ~$150K    | ~$400K+   | ~$1M+     |

[ESTIMATE] All figures. The model assumes the founder cracks India retention and adds a higher-ARPU global tier (Desktop/CLI BYOK power users + a vertical/B2B tier) by Y3 — without that, ARPU stalls at ~$2 and ARR caps near **$10–15M**.

### 3b. VC path — year-by-year (illustrative, if raised)

| Metric               | Y1                  | Y2              | Y3       | Y4   | Y5          |
| -------------------- | ------------------- | --------------- | -------- | ---- | ----------- |
| Capital raised (cum) | $2M (pre-seed/seed) | $10M (Series A) | $30M (B) | —    | —           |
| ARR                  | $0.3M               | $3M             | $15M     | $45M | $100M+      |
| Burn/yr              | $1.5M               | $6M             | $20M     | $35M | $40M        |
| Profitable?          | No                  | No              | No       | No   | Approaching |
| Founder ownership    | ~80%                | ~55%            | ~38%     | ~32% | ~28%        |

[ESTIMATE]. VC buys a _shot_ at $1B but trades away the thing AGI is actually good at (capital efficiency) and dilutes the founder to ~25–30% — meaning a $1B exit nets the founder ~$250–300M, while a $400M acquisition on the bootstrap path (founder owns ~90%) nets ~$360M. **The bootstrap math is not obviously worse for the founder's pocket.**

### 3c. Founder net at exit — base / bull / bear

| Scenario | Path                                                            | Exit value                      | Founder ownership                | **Founder net (pre-tax)**      |
| -------- | --------------------------------------------------------------- | ------------------------------- | -------------------------------- | ------------------------------ |
| **Bear** | Consumer-only, India ARPU stalls, churn high                    | $30–80M acqui-hire / asset sale | ~90% (bootstrap)                 | **~$30–70M**                   |
| **Base** | Profitable, India niche + small B2B/vertical lever              | $150–400M strategic acquisition | ~85–90% (bootstrap)              | **~$130–360M**                 |
| **Bull** | Defensible vernacular/regulated-data moat, platform bidding war | ~$1B acquisition                | ~60% (raised A/B) or ~85% (lean) | **~$300M (VC) – $850M (lean)** |

[ESTIMATE] throughout. The **bear case is still a life-changing outcome**; the bull case requires both a real moat and a motivated strategic buyer at the right moment.

---

## 4. When do investors get (and you get) profit — the direct answer

**If you bootstrap (recommended):**

- [ESTIMATE] **You start getting paid around Month 18–22** — the moment monthly gross profit (~80% of ARR/12) covers infra + a founder salary. On the model above, that's when active paying subs cross ~25–35K (≈$50–70K MRR).
- You get the _big_ payout only at exit. Until then you pay yourself a modest, growing salary out of profit. There is no investor to satisfy — **100% of equity value is yours.** This is the cleanest answer to "when do I get profit": you self-fund a salary in ~Y2 and capture the full exit later.

**If you raise:**

- [FACT/benchmarks] Stage map for an India-first consumer AI app, 2026:
  - **Pre-seed/Seed ($0.5–2M):** needs traction signal — ~10–50K WAU, early retention (D30 > industry), a believable second lever. Dilution ~15–25%.
  - **Series A ($8–15M):** needs ~$1–3M ARR, healthy unit economics, [FACT] **LTV:CAC ≥ 4–5:1 for consumer** and **CAC payback < 12 months**. Dilution ~20–25%.
  - **Series B ($25–40M):** needs ~$10–20M ARR + a path to $100M and a moat narrative. Dilution ~15–20%.
- **Investors get returns only at exit (acquisition/secondary), typically Y4–Y7.** They make money only if the exit multiple beats their entry price — [FACT] AI/SaaS strategic acquisitions run ~3–5x ARR for ordinary assets (higher for strategic/scarce capability). At $400M on $40M ARR (10x, generous) a Series A investor who paid a $40M post-money 3x's; below that they may not.
- **The blunt founder takeaway:** raising makes sense **only if the second lever (enterprise/vertical) genuinely needs capital to win a land grab before competitors.** For a pure India consumer app, VC degrades both your ownership and your odds (you inherit growth-at-all-costs pressure in a 1%-of-revenue market). **Default to bootstrap; raise opportunistically only against a B2B/vertical wedge.**

---

## 5. Monetization & Pricing — recommended engine + exact price points

**Recommended engine: hybrid — low-friction subscription + usage top-ups + a high-ARPU lever.** [FACT] Hybrid monetization (sub + usage) is the proven pattern for AI apps (RevenueCat); on-device makes the subscription nearly all-margin while cloud-mode top-ups self-fund their compute.

**Exact price points (recommendation):**

| Tier              | Price                           | Who                          | Notes                                                                                                                                                               |
| ----------------- | ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free (on-device)  | ₹0                              | Mass India                   | Capped, always-on-device. [FACT] free users are a cost center _unless_ capped — but on-device makes them near-zero cost, so use free aggressively for distribution. |
| **Plus (India)**  | **₹149/mo (~$1.79)** or ₹999/yr | India consumer               | Inside the [FACT] ₹49–₹199 conversion band; annual to fight [FACT] 72% Y1 cancel.                                                                                   |
| **Pro (Global)**  | **$7.99–$9.99/mo**              | Global / urban India / power | [FACT] ChatGPT Go-style $8/mo is the consumer anchor; do NOT price India mass at this.                                                                              |
| **Cloud top-ups** | pay-as-you-go credits           | Heavy/cloud-mode             | Self-funds managed compute; preserves margin.                                                                                                                       |
| **Vertical/B2B**  | **$15–50/seat/mo**              | Regulated-data SMB           | The lever that lifts the ceiling. Price on compliance value, not tokens.                                                                                            |

**What to change in the current plan (each cited):**

1. **Fix the StoreKit assumption — this is wrong in the plan.** [FACT — REFUTED claim] The "15% forever via Small Business Program" assumption is false. Apple's Small Business Program gives 15% **only while annual proceeds ≤ $1M**; once you exceed $1M in a calendar year you pay **30%** for the rest of that year and the _next_ year, re-qualifying for 15% only after dropping back below $1M. **Model 30% Apple commission above ~$1M proceeds**, not 15%. This materially cuts net margin exactly as you scale — budget for it.
2. **Don't lead with India $0.59 pricing globally.** Geo-price hard: India ₹149, global $8–10. [FACT] India is 1% of revenue despite 19% of users — monetize global/urban for cash, India for distribution.
3. **Annual-first checkout.** [FACT] 35% of annual cancels happen in Month 1 and 72% cancel within Y1 — front-load annual plans and nail the first-30-day experience or LTV collapses.
4. **Keep BYOK on Desktop/CLI, never mobile.** [FACT] BYOK only works for power users; this split is correct — but recognize BYOK users don't pay _you_ for inference, so monetize them via a flat Pro seat, not usage.
5. **Add the vertical/B2B SKU as a gated waitlist now — not a live product.** It is the only finding-supported route past the ~$300M ceiling, but it sits behind the founder's LOCKED managed-cloud/compliance gate (§1, MEMORY.md). Use the waitlist to validate demand and design-partners while you build ledgering/audit/deletion; flip it live only after those controls exist.

---

## 6. Users — taste, convenience, happiness & the privacy paradox

**The privacy paradox is the central user-truth and it cuts against the current positioning.**

- [FACT] Consumers _say_ they care about privacy (50–86%) but _behave_ by trading data for convenience, and OS-level + free tiers have commoditized the feature. Translation: **"your data never leaves the device" wins surveys, loses the download decision** unless paired with something the user can feel.
- [FACT] AI apps earn 41% more per payer but churn ~36% faster; 72% of annual subs cancel within Y1. Users are promiscuous and convenience-driven.

**Product + retention decisions that follow:**

1. **Sell the _benefit_, not the architecture.** Market "works offline / instant / never gets your data wrong by leaking it to a stranger / your therapy & money stay yours" — concrete outcomes, not "on-device LLM." Privacy is the _reason it's safe to be personal_, which is the actual wedge: **personalization + emotional/sensitive use** (the founder's own listed use cases) are where privacy converts.
2. **Win on convenience to beat the paradox.** [FACT] On-device = offline + instant + no rate limits + no login wall. Lead with those felt benefits; let privacy be the closer, not the headline.
3. **Engineer Day-1→Day-30 retention obsessively.** [FACT] Month-1 is where annual subs die. Onboarding that produces one "wow, it remembered me / it works offline on the train" moment in the first session is worth more than any feature.
4. **Build the one moat on-device _can_ create: a private, persistent, personal memory** the user would lose by switching. On-device removes data-network-effects, so the _only_ lock-in is **deep per-user personalization that lives on their device.** Make leaving feel like losing a relationship.

---

## 7. The $1B Exit — who buys, multiple, what to show, timeline

**Standalone $1B IPO/independence: not realistic** on this model. **$1B = acquisition.**

**Who buys, and why:**

- **Apple / Google / Samsung / Qualcomm** — for on-device IP + a private-by-default brand/team post-iOS 27 marketplace. [FACT] iOS 27 opening Siri to third-party assistants and Apple's $1B/yr Gemini deal show platforms are actively shopping AI capability and distribution.
- **Meta** — privacy-washing + on-device talent.
- **Large Indian conglomerate (Reliance/Jio, Tata, a telco)** — for dominant India vernacular/sensitive-data share + distribution. [FACT] India is the #1 GenAI-download market; an Indian acquirer values _users + local moat_ more than ARR.
- **An enterprise AI player** — if AGI has a real regulated-data/vertical B2B book.

**Multiple:** [FACT/ESTIMATE] Ordinary AI/SaaS strategic M&A ≈ **3–5x ARR**; scarce/strategic capability or a bidding war can reach **10–20x ARR** or be priced on _users/IP_ rather than ARR. A $1B exit therefore needs **either ~$100M+ ARR at a normal multiple, or ~$50–100M ARR + genuine strategic scarcity at a premium multiple, or a users/IP-based deal.**

**What you must show to command $1B (not $300M):**

1. A defensible **moat that isn't "privacy"**: dominant share of a specific India sensitive-data/vernacular use case, or unique on-device IP/personalization.
2. **Retention** that beats the [FACT] AI-app churn benchmark — the single most scrutinized metric.
3. A **second revenue lever** proving you're not capped at consumer subscription.
4. Strategic **timing** — sell into a platform's "we need on-device/India now" moment.

**Timeline:**

- **Fast (bull): ~3–4 years** — a platform decides on-device/India is urgent and you're the cleanest buy.
- **Base: ~5–7 years** — build profitability + a niche + a B2B lever, then sell at $150–400M (most likely), $1B only if a war breaks out.
- **Slow (bear): 7+ years or never at $1B** — you run a profitable $10–40M ARR lifestyle/cash-flow business and exit at 3–5x ARR ($30–150M). Still a strong solo-founder outcome.

---

## 8. Risks & Moats

**Top failure modes (most→least likely):**

1. **Commoditization + churn** — privacy is table-stakes; [FACT] AI churn 36% faster, 72% annual cancel. Mitigation: convenience + on-device personalization lock-in + annual-first.
2. **India ARPU trap** — [FACT] 1% of global revenue, $0.03 RPD, 62.5% rural. Mitigation: geo-price; monetize global/B2B for cash, India for scale.
3. **No moat → no premium exit** — [FACT] standalone consumer AI moats are weak; on-device _removes_ data-network-effects. Mitigation: build the vertical/regulated-data moat; own a niche.
4. **Margin erosion at scale** — [FACT — REFUTED assumption] Apple goes 30% above $1M proceeds; cloud-mode compute if mismanaged. Mitigation: model 30%, gate cloud behind top-ups/BYOK.
5. **Platform obsolescence** — [FACT] iOS 27 + Gemini-Siri could absorb the use case. Mitigation: be acquirable _before_ you're irrelevant; differentiate on niche/vernacular the platforms ignore.
6. **Solo-founder bandwidth** — six surfaces is over-scoped for one person pre-revenue. Mitigation: **mobile + India first; freeze the other five surfaces** until profitable.

**The defensible moat — honest version:** On-device **weakens** the classic AI moat (no central data → no data-network-effect → no compounding model advantage). The _only_ durable moats available to AGI are:

- **(a) On-device personal memory lock-in** — switching cost lives on the user's device (the one thing on-device gives you for free).
- **(b) Regulated/vernacular niche dominance** — "data legally cannot leave the device/country" turns privacy from a feature into a _requirement_ (legal, health, finance, gov, Indian-language). This is where privacy is a real moat, not table-stakes.
- **Brand + distribution** is the moat everyone else has and you must still build — but it's not unique to you.

---

## 9. The Plan — sequenced 0 → break-even → profit → $1B

**Phase 0 — Launch & focus (Months 0–6):**

- Ship mobile (iOS+Play), India-first; **freeze Desktop/Web/CLI/extensions** until profitable (solo-founder bandwidth risk, §8.6).
- Market the _benefit_ (offline/instant/personal/private-therapy-&-money), not the architecture (§6.1).
- Geo-price: ₹149 India / $8–10 global; annual-first checkout (§5.2, §5.3).
- **Fix the StoreKit model to 30% above $1M** (§5.1).

**Phase 1 — Retention & break-even (Months 6–22):**

- Obsess over Day-1→Day-30; build on-device personal-memory lock-in (§6.3, §6.4 → moat (a)).
- Cloud-mode top-ups self-fund managed compute; keep BYOK Desktop/CLI flat-seat (§5.4).
- Target ~$50–70K MRR → **cash break-even + founder salary ~Month 18–22** (§4 bootstrap, §3a).

**Phase 2 — Profit & the second lever (Year 2–4):**

- Launch the **vertical/regulated-data B2B SKU** at $15–50/seat — the ceiling-lifter (§5.5 → moat (b)). Gate-first: this requires consciously un-locking the LOCAL-ONLY/managed-cloud lock and building ledgering, audit logs, retention/deletion, and admin controls before it goes live (§1).
- Push ARR toward $15–45M; prove retention beats the AI-app benchmark (§7 "what to show").
- Optionally raise a _targeted_ round **only** to win a B2B/vertical land grab — not for consumer growth (§4 "if you raise").

**Phase 3 — Position for $1B (Year 3–7):**

- Build dominant share of a specific India sensitive-data/vernacular niche (§7 buyers).
- Cultivate strategic acquirers (Apple/Google/Samsung/Qualcomm/Reliance/Tata) around their on-device/India urgency (§7 timing).
- Sell at the moment of maximum strategic scarcity. **Base case $150–400M; $1B only with a real moat + a bidding war.**

Each move maps to a finding above; nothing here assumes a fact the research didn't support.

---

## 10. What we couldn't verify (open questions + killed assumptions)

**Killed / corrected assumptions (do not build on these):**

- **[KILLED 3-0] "Apple Small Business Program = 15% forever."** False. 15% only while ≤$1M annual proceeds; **30% above $1M** for that year and the next. Re-model margins accordingly. _This was a load-bearing error in the locked plan._
- **[KILLED 2-1→refuted] "40%+ enterprise AI workloads include local inference / 320% YoY quantized-download growth."** Unverified; do not cite.
- **["Ceiling = $200–500M" partially obsolete]** Several sources show Perplexity/Cursor above $500M ARR — but via **multi-lever** (enterprise/agents/usage), which _confirms_ the core thesis: single-lever consumer subscription caps low; you need a second lever.

**Open questions (decide with primary data before betting):**

1. **Exact current Apple commission mechanics for 2026** — now confirmed via live check (Apple Developer + RevenueCat/Adapty, 2026-05): 15% applies only while you and associated accounts earn ≤ **$1M proceeds**; exceed $1M in the current year → standard **30%** applies to sales for the **remainder of that year**; you can re-qualify for 15% only **the year after** proceeds fall back below $1M. (EU note: a further-reduced 10% applies to alternative-terms subscriptions after year one — not relevant to India-first.) Re-confirm any India-specific store rules at pricing finalization.
2. **Perplexity's true current ARR/valuation** — now reasonably pinned via live check (2026-05): ARR ran ~$200M (Sep–Dec 2025) → **~$450M (March 2026)** with a **$656M target for 2026**, at a **~$20B post-money valuation** (Series E-6). The $450M jump came from a **usage-based pricing shift + the "Computer" agent + enterprise adoption** — i.e. _multi-lever_, which directly confirms the core thesis that single-lever consumer subscription caps low. Exact spot number still moves month to month. _Sources: FT via Yahoo Finance; getpanto.ai; demandsage; ARR Club._
3. **Real India D30/D90 retention for a privacy/personalization AI app** — the entire model hinges on beating AI-app churn. Live check (2026-05) gives the backdrop but not your number: [FACT] India subscription-app churn averages **8–12%/month** (RevenueCat/industry); AI monthly retention is **6.1% vs 9.5% non-AI** and **36% worse over 12 months**; generic D30 for apps is **7–10%**. Proven India levers: personalized "morning brief" notifications (3x open rate), well-timed upgrade nudges, single-offer win-backs, and **pause-instead-of-cancel (recovers 30–40% of churners)**. Still: **run your own cohort before scaling spend** — no privacy-AI-specific India cohort was verifiable.
4. **Whether a regulated-data/vernacular B2B wedge actually has buyers in India at $15–50/seat** — assumed, not proven. Validate with 10 design-partner conversations before building.
5. **Strategic-acquirer appetite for on-device/India AI in 2027–2029** — directionally supported by iOS 27 + Gemini-Siri, but M&A timing is unknowable; do not plan cash flow around an exit.

---

_FACT/ESTIMATE discipline: market sizes, ARPU bands, churn rates, margin benchmarks, the Apple commission rule, and competitor ARR ranges are [FACT] with cited sources in the verified-findings corpus. All forward financials (year-by-year tables, break-even month, founder net) are [ESTIMATE] with stated assumptions and should be stress-tested against your own first 6 months of real data._
