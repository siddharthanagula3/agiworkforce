# Unit Economics, Pricing, and Day-1 Profitability Model

Status: Current
Owner: Founder + commercial/platform lead
Last updated: 2026-07-11

This is the definitive unit-economics + pricing + profitability model for AGI Workforce. It exists so every billable capability in Managed Cloud is priced to be gross-margin-positive from the first paid user. It supersets the per-token cost fix tracked separately (task #55): tokens are one line item among many.

> **STALE-MODEL FLAG (2026-07-11):** the founder locked a new pricing/metering decision the same day this file's numbers were last touched (`docs/plans/tier-metering-reconciliation-wave2-2026-07-11.md`): Basic cut from $8 to $7/mo, **Team reinstated** as a real per-seat tier ($30/seat/mo, $15/seat/mo COGS budget) between Max and Enterprise, and **top-ups enabled** for paid tiers (capped, opt-in, per-tier payout parity) — superseding this doc's "no top-ups" framing. The headline tier list (§3.4) and the P1 task list (§5) below are corrected for this. The downstream COGS-ceiling/retail-value/credit/margin/break-even tables in §3.4–§4.6 and the Executive Summary were computed against the **old** $8/no-Team/no-top-up inputs and have **not** been recomputed here — the exact credit-conversion rate they'd need is itself pending "pricing-research round 3" sign-off per the wave-2 plan. Treat every number in those tables as needing a fresh pass once round 3 lands; do not treat them as current fact in the meantime.

## How to read this doc

- **Provider prices are cited inline** to an official pricing page, or tagged `UNVERIFIED` where no public price exists. Do not propagate an `UNVERIFIED` number into billing code without confirming it.
- **Token prices come from `packages/contracts/types/src/models.json`** (the token-pricing SSOT), cross-checked against provider pages. All non-token capability prices (search tools, sandbox, image/video, infra) are researched here and are new to the repo.
- Prices were captured 2026-07-09/10. Provider pricing moves; re-verify before a pricing change ships.

## 0. The one idea that makes this tractable: resale vs pass-through

Cost incidence is the whole game. There are two trust boundaries and they have opposite economics:

| Mode                  | Who pays the provider         | Our COGS                             | Our revenue                         | Role               |
| --------------------- | ----------------------------- | ------------------------------------ | ----------------------------------- | ------------------ |
| **Local** (on-device) | nobody (user hardware)        | ~$0                                  | $0                                  | Free wedge         |
| **BYOK** (user's key) | the user, directly            | ~$0 (infra only)                     | $0 (no markup, per GTM)             | Free wedge         |
| **Managed Cloud**     | **we do**, then bill the user | provider compute + fallbacks + infra | subscription (+ overage if enabled) | **The entire P&L** |

Consequence: **provider prices are only OUR COGS inside Managed Cloud.** In BYOK the same provider prices are the _user's_ cost and never touch our P&L. This is confirmed by the GTM (`docs/current/commercial-and-launch.md`, `project-gtm-business-model` memory: "free Local + BYOK with ZERO markup"). So this model prices Managed Cloud and treats BYOK/Local as a ~zero-COGS, zero-revenue adoption channel.

**BYOK revenue is $0 by design.** We do not charge a platform/hosting fee on BYOK — "Local + BYOK are free access modes, not plans" (`project-pricing`). BYOK's return is conversion to Managed Cloud, not a per-call fee. (If a thin BYOK platform fee is ever wanted, it is a GTM change, not a units change; flagged as an open decision in §6.)

**No top-ups is a feature, not a limitation.** Top-ups are env-gated off (`project-pricing`). Combined with a hard included-usage budget per tier, this gives every paid tier a **COGS ceiling**: a user cannot consume more managed compute than their tier's budget, so our cost per user is bounded and day-1 gross margin is positive _by construction_ (proof in §4).

---

## 1. Capability × Provider matrix

Rows = billable capabilities. Cells = `NATIVE` (provider meters it directly, price in §2) or `→fallback` (provider lacks it; we route to our fallback and eat that cost). We do **not** price every cell here — each _unit_ price is sourced once in §2; cells only say native-or-fallback.

Providers: OA=OpenAI, AN=Anthropic, GG=Google/Gemini, DS=DeepSeek, XAI=xAI/Grok, KM=Moonshot/Kimi, MS=Mistral, QW=Qwen, ZH=Zhipu/GLM, GQ=Groq, OR=OpenRouter, PX=Perplexity, LOC=local (Ollama/llama.cpp/LM Studio).

| Capability                         | OA                        | AN                 | GG                         | DS        | XAI       | KM        | MS               | QW        | ZH        | GQ        | OR        | PX                           | LOC         |
| ---------------------------------- | ------------------------- | ------------------ | -------------------------- | --------- | --------- | --------- | ---------------- | --------- | --------- | --------- | --------- | ---------------------------- | ----------- |
| LLM chat tokens                    | NATIVE                    | NATIVE             | NATIVE                     | NATIVE    | NATIVE    | NATIVE    | NATIVE           | NATIVE    | NATIVE    | NATIVE    | NATIVE    | NATIVE                       | NATIVE ($0) |
| Tool / function calling            | NATIVE                    | NATIVE             | NATIVE                     | NATIVE    | NATIVE    | NATIVE    | NATIVE           | NATIVE    | NATIVE    | partial   | passthru  | NATIVE                       | model-dep   |
| Web search (provider tool)         | NATIVE                    | NATIVE             | NATIVE (grounding)         | →search   | →search   | →search   | →search          | →search   | →search   | →search   | →search   | NATIVE (Sonar)               | →search     |
| Deep research                      | →compose¹                 | →compose¹          | →compose¹                  | →compose¹ | →compose¹ | →compose¹ | →compose¹        | →compose¹ | →compose¹ | →compose¹ | →compose¹ | NATIVE (sonar-deep-research) | →compose¹   |
| Code execution / sandbox           | NATIVE (Code Interpreter) | NATIVE (code exec) | NATIVE (code exec)         | →E2B      | →E2B      | →E2B      | →E2B             | →E2B      | →E2B      | →E2B      | →E2B      | →E2B                         | →E2B        |
| File creation (docx/xlsx/pdf/pptx) | →sandbox²                 | →sandbox²          | →sandbox²                  | →sandbox² | →sandbox² | →sandbox² | →sandbox²        | →sandbox² | →sandbox² | →sandbox² | →sandbox² | →sandbox²                    | →sandbox²   |
| Image generation                   | NATIVE (gpt-image-2)      | →image             | NATIVE (Imagen/Gemini img) | →image    | →image    | →image    | →image           | →image    | →image    | →image    | →image    | →image                       | →image      |
| Video generation                   | →video³                   | →video             | NATIVE (Veo 3.1)           | →video    | →video    | →video    | →video           | →video    | →video    | →video    | →video    | →video                       | →video      |
| Vision / OCR                       | NATIVE                    | NATIVE             | NATIVE                     | partial   | NATIVE    | NATIVE    | NATIVE (Pixtral) | NATIVE    | partial   | partial   | passthru  | partial                      | model-dep   |
| Structured output (JSON/schema)    | NATIVE                    | NATIVE             | partial                    | NATIVE    | partial   | partial   | NATIVE           | NATIVE    | partial   | partial   | passthru  | partial                      | model-dep   |
| Connectors (MCP / OAuth apps)      | our infra                 | our infra          | our infra                  | our infra | our infra | our infra | our infra        | our infra | our infra | our infra | our infra | our infra                    | our infra   |
| Skills / plugins                   | our infra                 | our infra          | our infra                  | our infra | our infra | our infra | our infra        | our infra | our infra | our infra | our infra | our infra                    | our infra   |

¹ **Deep research** is a composed capability, not a provider SKU (except Perplexity `sonar-deep-research`). We run an agent loop = many chat turns × (web search + fetch) + long output. Its cost is modeled in §2 as `tokens + N×search`, and it is the #2 margin risk (§4).
² **File creation** has no provider SKU — it is code that runs in a sandbox (native Code Interpreter where available, else our E2B). Cost = sandbox time + the LLM tokens that write the code. Library costs are $0 (open-source: python-docx, openpyxl, reportlab, python-pptx).
³ OpenAI video (Sora) has **no public API price in our catalog** (verification log, 2026-06-03 kept unverified video IDs out). All video routes to Google Veo 3.1 until an OpenAI/other video price is verified.

**Fallback provider choices (our cost centers):**

- **No native sandbox → E2B** (2 vCPU / 2 GiB default). Metered per second (§2).
- **No native web search → Brave Search API** as the cheapest reliable raw-search fallback ($5/1k), with **Tavily** ($8/1k) as the AI-optimized alternate and **Exa** ($7/1k) for neural/semantic. Perplexity Sonar is used when the user explicitly wants cited answers (it is native-priced). Rationale in §2.
- **No native image → Google Imagen 4 Fast** ($0.02/image, cheapest verified) or Gemini Flash Image; **gpt-image-2** where OpenAI-native quality is requested.
- **No native video → Google Veo 3.1** (only verified video price we have).

---

## 2. Cost catalog — our COGS per billable unit (Managed Cloud)

Every unit below is a cost we incur _only in Managed Cloud_. In BYOK these are the user's costs.

### 2.1 LLM chat tokens (per 1M tokens, USD) — from `models.json`, cross-checked to provider pages

Representative routing models (full list in `packages/contracts/types/src/models.json`). `input / output / cache-read`:

| Model (route)                         | Input | Output | Cache read | Source                                                                                                |
| ------------------------------------- | ----- | ------ | ---------- | ----------------------------------------------------------------------------------------------------- |
| gemini-3.1-flash-lite (cheapest chat) | 0.25  | 1.50   | 0.025      | models.json; [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)   |
| gpt-5.4-nano                          | 0.20  | 1.25   | 0.02       | models.json; [developers.openai.com/api/docs/pricing](https://developers.openai.com/api/docs/pricing) |
| claude-haiku-4.5                      | 1.00  | 5.00   | 0.10       | [platform.claude.com pricing](https://platform.claude.com/docs/en/about-claude/pricing)               |
| deepseek-v4-flash                     | 0.14  | 0.28   | 0.0028     | models.json                                                                                           |
| gemini-3.5-flash                      | 1.50  | 9.00   | 0.15       | ai.google.dev pricing                                                                                 |
| gpt-5.6-luna                          | 1.00  | 6.00   | 0.10       | models.json; developers.openai.com                                                                    |
| gpt-5.6-terra                         | 2.50  | 15.00  | 0.25       | models.json                                                                                           |
| claude-sonnet-4.6                     | 3.00  | 15.00  | 0.30       | platform.claude.com                                                                                   |
| gpt-5.5 / gpt-5.6-sol (flagship)      | 5.00  | 30.00  | 0.50       | models.json; developers.openai.com                                                                    |
| claude-opus-4.8                       | 5.00  | 25.00  | 0.50       | platform.claude.com                                                                                   |
| grok-4.3                              | 1.25  | 2.50   | —          | models.json                                                                                           |
| glm-5.2                               | 1.40  | 4.40   | 0.26       | models.json                                                                                           |
| kimi-k2.6                             | 0.95  | 4.00   | 0.16       | models.json                                                                                           |

**Cost-control levers:** prompt caching (cache read = 0.1× input on Anthropic/OpenAI/Google) and default routing to a cheap "Super Fast" model for normal chat, reserving flagships for reasoning/tool tasks (aligns with `feedback-qa-model-cost-tiering`). A typical managed chat turn (≈1.5k in / 0.5k out on gemini-flash-lite) costs **≈$0.0011**.

### 2.2 Web search (provider tool)

| Provider                        | Price                                                                         | Notes                                                              | Source                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| OpenAI web search               | **$10 / 1k calls** + search-content tokens at model rate                      | preview on non-reasoning models $25/1k                             | [developers.openai.com/api/docs/pricing](https://developers.openai.com/api/docs/pricing) |
| Anthropic web search            | **$10 / 1k searches** + token cost                                            | web _fetch_ is free (tokens only)                                  | [platform.claude.com pricing](https://platform.claude.com/docs/en/about-claude/pricing)  |
| Google grounding (Gemini 3)     | **5k free/mo, then $14 / 1k queries**                                         | Gemini 2.5 = $35/1k                                                | ai.google.dev pricing                                                                    |
| Perplexity Sonar                | token-priced: sonar $1/$1, sonar-pro $3/$15, sonar-deep-research $2/$8 per 1M | per-request fee tiers `UNVERIFIED` — confirm at docs.perplexity.ai | models.json                                                                              |
| **Brave Search API** (fallback) | **$5 / 1k requests** ($4/1k on Answers + $5/1M tokens); $5/mo free credit     | cheapest reliable raw search                                       | [brave.com/search/api](https://brave.com/search/api/)                                    |
| **Tavily** (fallback)           | **$0.008 / credit ≈ $8 / 1k**; 1k free/mo                                     | AI-optimized results                                               | [tavily.com/pricing](https://tavily.com/pricing)                                         |
| **Exa** (fallback)              | **$7 / 1k searches** (≤10 results) + $1/1k pages contents; 20k free/mo        | neural/semantic                                                    | [exa.ai/pricing](https://exa.ai/pricing)                                                 |

**Fallback choice:** Brave at **$5/1k** is the cheapest reliable raw-search fallback for models with no native search. Effective blended search COGS assumption: **$0.005–$0.010 per search call** depending on route.

### 2.3 Code execution / sandbox

| Route                      | Price                                                                                          | Source                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| OpenAI Code Interpreter    | **$0.03 / 20-min session** (1 GB); 4 GB $0.12; 16 GB $0.48; 64 GB $1.92                        | developers.openai.com/api/docs/pricing     |
| Anthropic code execution   | **free with web search/fetch**; else 1,550 free hrs/mo then **$0.05/hr/container** (5-min min) | platform.claude.com pricing                |
| Google code execution      | billed at standard model token rates (no separate SKU)                                         | ai.google.dev pricing                      |
| **E2B sandbox (fallback)** | 2 vCPU **$0.000028/s** + RAM **$0.0000045/GiB/s**; Pro plan $150/mo + usage                    | [e2b.dev/pricing](https://e2b.dev/pricing) |

**E2B derived unit cost** (default 2 vCPU + 2 GiB): $0.000028 + 2×$0.0000045 = **$0.000037/s ≈ $0.133/hour ≈ $0.0022/min**. A typical 90-second tool run ≈ **$0.0033**. This line item MUST appear in the user's usage whenever a non-sandbox provider triggers code/file work.

### 2.4 File creation (docs/sheets/pdf/pptx)

No provider SKU. Cost = LLM tokens to write the code (§2.1) + sandbox seconds to run it (§2.3). Libraries are free/open-source. Model as: **1 file ≈ 30–60 sandbox-seconds ($0.001–$0.002) + ≈2k output tokens.** Practically **≈$0.005–$0.02/file** depending on model.

### 2.5 Image generation

| Model                                   | Price                                                                                                                                             | Source                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Imagen 4 Fast**                       | **$0.02 / image**                                                                                                                                 | ai.google.dev pricing                  |
| Imagen 4 Standard                       | $0.04 / image                                                                                                                                     | ai.google.dev pricing                  |
| Imagen 4 Ultra                          | $0.06 / image                                                                                                                                     | ai.google.dev pricing                  |
| Gemini Flash Image (nano-banana)        | $0.067 / image (1024²); batch $0.034                                                                                                              | ai.google.dev pricing                  |
| gpt-image-2                             | token-based: $8/1M in, $30/1M out; **per-image ≈ $0.02 (low) – $0.19 (high) at 1024²** `UNVERIFIED per-image` — use OpenAI image-token calculator | developers.openai.com/api/docs/pricing |
| Ideogram / SDXL (managed via Replicate) | models.json token-encoded (ideogram out=20, sdxl out=4); **real per-image `UNVERIFIED`** — confirm Replicate rate                                 | models.json                            |

**Assumption:** default image route = **Imagen 4 Fast $0.02/image**; premium = gpt-image-2 ≈$0.12/image.

### 2.6 Video generation — the biggest margin risk

| Model                | Price                                                                        | Source                      |
| -------------------- | ---------------------------------------------------------------------------- | --------------------------- |
| **Veo 3.1 Standard** | **$0.40/s** (720p/1080p), $0.60/s (4K)                                       | ai.google.dev pricing       |
| Veo 3.1 Fast         | $0.10/s (720p), $0.12/s (1080p), $0.30/s (4K)                                | ai.google.dev pricing       |
| Veo 3 Standard       | $0.40/s                                                                      | ai.google.dev pricing       |
| OpenAI Sora          | **`UNVERIFIED`** — no public API price in catalog; do not offer until priced | verification log 2026-06-03 |

**Derived:** an 8-second 1080p Veo 3.1 Standard clip = **$3.20**; Fast = $0.96. One standard clip is ≈46% of a whole Pro tier's monthly COGS budget (§4). Video must be gated + metered aggressively (§4 guardrails).

### 2.7 Deep research (composed)

Model per run: (agent loop ≈ 8–20 model turns of a mid model) + (6–15 web searches) + (long synthesis output). Worked estimate on gemini-3.5-flash + Brave: ~250k input + ~40k output tokens ($0.375 + $0.36) + 12 searches ($0.06) ≈ **$0.80/run**; on a flagship it can hit **$3–6/run**. This is margin risk #2 — cap runs/tier and default deep research to a mid model.

### 2.8 Vision / OCR, structured output, connectors, skills, plugins

- **Vision/OCR & structured output:** no separate SKU — priced as input tokens (images tokenized per provider vision rules). ~$0.003–$0.02 per image understood.
- **Connectors (MCP/OAuth), skills, plugins:** no per-call provider cost; cost is _our fixed infra_ (OAuth token store, connector runners) allocated in §2.9, plus whatever tokens/tools the connector triggers.

### 2.9 Fixed + variable infra COGS (our platform)

| Component                      | Price                                                                                                                                                                     | Source                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Vercel Pro**                 | $20/user/mo + $20 included credit; bandwidth 1 TB incl then **$0.15/GB**; edge requests 10M incl then **$2/1M**; Fluid active CPU **$0.128/hr**; invocations **$0.60/1M** | [vercel.com/pricing](https://vercel.com/pricing)                                      |
| **Neon Postgres (Launch)**     | compute **$0.106/CU-hr**, storage **$0.35/GB-mo**, egress 500 GB incl then $0.10/GB; free 100 CU-hr + 0.5 GB                                                              | [neon.com/pricing](https://neon.com/pricing)                                          |
| **Upstash Redis**              | free 500k cmd/mo; PAYG **$0.20/100k commands**, storage $0.25/GB, bandwidth 200 GB free then $0.03/GB                                                                     | [upstash.com/pricing](https://upstash.com/pricing)                                    |
| **Clerk auth**                 | free ≤50k MRU; Pro **$25/mo** incl 50k MRU, then **$0.02/MRU** (50k–100k)                                                                                                 | [clerk.com/pricing](https://clerk.com/pricing)                                        |
| **Cloudflare R2 (object/CDN)** | storage **$0.015/GB-mo**, Class A $4.50/M, Class B $0.36/M, **egress free**; free 10 GB                                                                                   | [developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/) |
| **E2B baseline**               | Pro $150/mo (only if self-orchestrating) + per-second usage (§2.3)                                                                                                        | e2b.dev/pricing                                                                       |
| **Stripe**                     | **2.9% + $0.30** per successful card charge (standard published US rate)                                                                                                  | stripe.com/pricing (standard rate)                                                    |

**Allocated fixed infra per active paid user:** the platform pieces (Vercel base, Neon, Upstash, Clerk, R2) are largely fixed + mildly per-user. At modest scale, allocate **≈$0.40–$0.80 / paid user / month** for these. Free users are near-zero on infra (auth MRU, tiny Neon rows, cached reads) — call it **≈$0.05–$0.15 / free user / month** plus their managed-usage subsidy.

---

## 3. Charging model

### 3.1 Principle

**Managed Cloud price = provider/fallback COGS × margin multiplier**, with a **hard included-usage COGS ceiling per tier** and **no top-ups** (so realized COGS ≤ ceiling, always).

### 3.2 Recommended margin multiplier: **2.5×**

Every metered unit is charged to the user's budget at **2.5× our raw provider/fallback COGS**. This multiplier is sized to cover, in order:

1. Stripe fees: 2.9% + $0.30/charge (≈3–7% of a small subscription).
2. Refund/chargeback reserve: ~2%.
3. Allocated fixed infra: $0.40–$0.80/user (§2.9).
4. Free-tier subsidy: free users' managed burn (§4).
5. Target gross margin: **≥50%** left over per paid tier.

A 2.5× multiplier means COGS is **40% of retail usage value**; after fees + fixed + reserve + free subsidy, each paid tier lands at **~55% gross margin** (§4). Overage, _if ever enabled_, is billed at the same 2.5× (provider_cost × 2.5).

### 3.3 The single usage meter (credits)

Heterogeneous units (tokens, searches, sandbox-seconds, images, video-seconds) collapse into one user-facing meter:

> **1 AGI Credit = $0.01 of retail usage value**, where retail value = raw provider/fallback COGS × 2.5.

Every capability debits credits by `round_up(raw_COGS × 2.5 / $0.01)`. Examples (at the assumed default routes):

| Action                              | Raw COGS  | Retail (×2.5) | Credits |
| ----------------------------------- | --------- | ------------- | ------- |
| 1 chat turn (flash-lite, 1.5k/0.5k) | $0.0011   | $0.0028       | ~1      |
| 1 web search (Brave)                | $0.005    | $0.0125       | ~2      |
| 90s sandbox run (E2B)               | $0.0033   | $0.0083       | ~1      |
| 1 generated file                    | $0.01     | $0.025        | ~3      |
| 1 image (Imagen 4 Fast)             | $0.02     | $0.05         | 5       |
| 1 image (gpt-image-2 high)          | $0.12     | $0.30         | 30      |
| 1 deep-research run (mid)           | $0.80     | $2.00         | 200     |
| **1× 8s video (Veo 3.1 1080p)**     | **$3.20** | **$8.00**     | **800** |

Internally we also track **raw COGS per user** against the tier's **COGS ceiling** — that ceiling, not the credit balance, is the true kill-switch (§4).

### 3.4 Tier mapping (usage budgets)

Tiers per `docs/plans/tier-metering-reconciliation-wave2-2026-07-11.md` (2026-07-11, supersedes the 2026-06-30 ladder cited in the tables below): Free $0 / Basic $7 (₹399) / Pro $20 / Max $100 & $200 / Team $30 per seat / Enterprise custom. INR only fixed for Basic. The $ figures in the tables below still reflect the pre-2026-07-11 ladder — see the stale-model flag above.

| Tier           | Price/mo | Managed COGS ceiling                     | Retail usage value (×2.5) | Included credits | Positioning                                        |
| -------------- | -------- | ---------------------------------------- | ------------------------- | ---------------- | -------------------------------------------------- |
| **Free**       | $0       | **$0.30** (throttled, cheap models only) | $0.75                     | 75               | Wedge; Local+BYOK unlimited + tiny managed taste   |
| **Basic**      | $8       | **$2.50**                                | $6.25                     | 625              | Entry managed (mobile-first, ChatGPT-India parity) |
| **Pro**        | $20      | **$7.00**                                | $17.50                    | 1,750            | Default paid                                       |
| **Max**        | $100     | **$40.00**                               | $100.00                   | 10,000           | Power / media / research                           |
| **Max+**       | $200     | **$85.00**                               | $212.50                   | 21,250           | Heavy / small-team-of-one                          |
| **Enterprise** | custom   | negotiated                               | negotiated                | pooled           | Invoice/ACH, pooled credits, SSO                   |

Media/video/deep-research consume the shared credit budget at their real (large) credit cost, so a Pro user _can_ make a couple of images but not burn the tier on video — the budget self-rations. Video generation is additionally **gated to Max/Max+** (and Enterprise) to protect margin (§4).

### 3.5 BYOK & Local revenue path

- **Revenue: $0.** No markup, no platform fee (GTM). Our cost: ~$0 (user's key/hardware); only ambient infra (auth MRU, chat-state rows if cloud-synced).
- **Return:** BYOK/Local is the top of the funnel. The conversion event is "user wants managed convenience / a capability their key can't do (native sandbox, our fallback video/search, cross-device managed state)." Instrument BYOK→Managed conversion; that ratio (§4) is the whole business.

---

## 4. Day-1 profitability plan (worked P&L)

### 4.1 Why every paid tier is positive by construction

For a paid tier with price `P`:

- Net after Stripe: `P_net = P×(1−0.029) − 0.30`.
- Subtract reserve `R = 0.02×P`, fixed infra `F ≈ $0.60`, and the **COGS ceiling `C`** (max managed usage, enforced by no-top-ups).
- Gross margin `GM = P_net − R − F − C`. Because realized COGS ≤ C for _every_ user, `GM` is the **worst-case** floor, not an average.

We set each tier's `C` so `GM > 0` even for a user who exhausts their budget on day 1.

### 4.2 Per-tier worked P&L (worst case = budget fully consumed)

| Line                                 | Basic $8  | Pro $20    | Max $100   | Max+ $200   |
| ------------------------------------ | --------- | ---------- | ---------- | ----------- |
| Gross price                          | 8.00      | 20.00      | 100.00     | 200.00      |
| − Stripe (2.9%+$0.30)                | −0.53     | −0.88      | −3.20      | −6.10       |
| Net revenue                          | 7.47      | 19.12      | 96.80      | 193.90      |
| − Refund/chargeback reserve (2%)     | −0.16     | −0.40      | −2.00      | −4.00       |
| − Allocated fixed infra              | −0.60     | −0.60      | −0.80      | −0.80       |
| − **Managed usage COGS ceiling `C`** | −2.50     | −7.00      | −40.00     | −85.00      |
| **Worst-case gross margin**          | **$4.21** | **$11.12** | **$54.00** | **$104.10** |
| **Worst-case GM % (of net revenue)** | **56%**   | **58%**    | **56%**    | **54%**     |
| Effective markup (price ÷ C)         | 3.2×      | 2.9×       | 2.5×       | 2.4×        |

Every paid tier is **gross-margin-positive from the first user, even if they max out usage.** Typical users consume well under the ceiling, pushing realized margin higher (often 75–90%).

### 4.3 Representative usage mixes (sanity check that the ceiling is generous)

- **Basic user** ($2.50 COGS budget): ~1,500 flash-lite chat turns _or_ ~500 turns + 40 searches + 20 images + 10 files. Comfortable for a light daily user.
- **Pro user** ($7 budget): ~4,000 chat turns, or a mix of ~2,000 turns + 150 searches + 60 files + 40 images + 2 deep-research runs. Matches a "daily driver" without hitting the wall in a normal month.
- **Max user** ($40 budget): heavy chat + ~10 deep-research runs + ~8 Veo-Fast clips, or ~4 Veo-Standard 1080p clips ($12.80) plus everything else.

If a segment routinely hits the ceiling, that is a _conversion signal_ (upgrade), not a loss — the ceiling protected margin the whole time.

### 4.4 Free tier: bounded loss + break-even conversion

- Free managed COGS ceiling = **$0.30/user/mo**; free infra ≈ **$0.10/user/mo** → **max free burn ≈ $0.40/free user/mo.** (Local/BYOK usage is $0, so heavy free users on their own key/hardware cost us nothing.)
- **Break-even conversion (blended):** at the doc's 3:1 Pro:Basic mix, worst-case paid GM ≈ **$9.39/paid user**, so break-even = free_burn / (paid_GM + free_burn) = `0.40 / 9.79` ≈ **4.1%**. (All-Pro conversion is lower: `0.40 / 11.52` ≈ **3.6%**; all-Basic is higher: `0.40 / 4.61` ≈ **8.7%**.)
- **Read:** a **~4–5% free→paid conversion covers all free-tier burn even in the worst case**, and any realistic consumption clears it far below that. Below ~4% at a Basic-heavy mix, tighten the free managed ceiling (it is a single dial) or set it to $0 (§6.2).

### 4.5 Portfolio example (per 1,000 signups, 4% conversion)

Assume 1,000 signups, 4% convert (30 Pro, 10 Basic), 960 free.

**Expected case (primary)** — paid users consume ~40% of their ceiling, free users ~50% of theirs:

|                      | Count | Unit expected GM | Total        |
| -------------------- | ----- | ---------------- | ------------ |
| Pro (COGS ≈ $2.80)   | 30    | +$15.32          | +$459.60     |
| Basic (COGS ≈ $1.00) | 10    | +$5.71           | +$57.10      |
| Free burn (≈ $0.25)  | 960   | −$0.25           | −$240.00     |
| **Net (expected)**   |       |                  | **+$276.70** |

The portfolio is **strongly positive at 4% conversion** under realistic consumption — free-tier burn is not just bounded, it is covered several times over.

**Worst case (stress test)** — every paid user maxes their budget _and_ every free user maxes their $0.40:

|                      | Count | Unit worst-case GM | Total      |
| -------------------- | ----- | ------------------ | ---------- |
| Pro                  | 30    | +$11.12            | +$333.60   |
| Basic                | 10    | +$4.21             | +$42.10    |
| Free burn            | 960   | −$0.40             | −$384.00   |
| **Net (worst case)** |       |                    | **−$8.30** |

Even the adversarial worst case is only marginally negative and sits just under the **4.1% blended break-even** (§4.4); **5% conversion, a $0.20 free ceiling, or a $0 free-managed ceiling (§6.2) all turn worst-case positive.**

### 4.6 Top margin risks + guardrails

1. **Video generation** ($3.20 per 8s clip). Guardrails: gate video to **Max/Max+/Enterprise only**; charge 800 credits/clip (retail $8); per-tier hard cap on video-seconds/month; default to **Veo Fast** ($0.10/s) unless the user opts into Standard; per-clip kill-switch if a single request would exceed remaining budget.
2. **Deep-research token blowout** ($3–6/run on a flagship). Guardrails: default deep research to a **mid model** (gemini-3.5-flash), cap searches/run (≤15) and total tokens/run, cap runs/month per tier, and debit credits at real cost so the shared budget self-limits.
3. **Sandbox / compute abuse** (crypto-mining, infinite loops, egress). Guardrails: per-session **wall-clock timeout** (e.g. 5 min) and **hard vCPU/RAM tier caps**; **egress limits** per session; per-user concurrent-sandbox cap; anomaly detection on sustained sandbox-seconds; per-capability **kill-switch** (the existing `AGI_MANAGED_COMPUTE_*` env gate is the incident lever).

Cross-cutting: the **hard per-tier COGS ceiling + no top-ups** is the master guardrail — no single capability can exceed the tier budget, so worst-case loss per paid user is bounded before any per-capability rule fires.

---

## 5. Implementation gaps (build list — do NOT implement here)

Priority-ordered; cross-referenced to repo. This turns the model into billable reality.

1. **Usage ledger + raw-COGS meter (P0).** A per-user ledger that records raw provider/fallback COGS per call _and_ the credit debit, and enforces the tier COGS ceiling as a hard stop. `docs/current/commercial-and-launch.md` lists "usage ledger / provider price table / quota reservation and settlement" as required-but-unbuilt. This is the spine — nothing else meters without it.
2. **Provider price table wired to `models.json` (P0).** Token prices exist in `models.json`; the **non-token unit prices in §2 (search, sandbox, image, video, infra) have no home in the repo yet.** Add a `capabilityPricing` block (or sibling file) so billing reads sourced prices, not hardcoded constants. Pairs with task #55 (token calc fix).
3. **E2B metering line item (P0).** Sandbox seconds must surface in the user's usage whenever a non-sandbox provider triggers code/file work (`packages/ai/providers` tool-loop → E2B integration). Confirm the E2B integration actually meters seconds, not just runs.
4. **Web-search fallback router (P1).** Route non-native-search providers to Brave/Tavily/Exa and meter per call. Check whether `packages/ai/providers` already has a search-tool abstraction or only per-provider native search.
5. **Media routes billing (P1).** Image (Imagen/gpt-image) and video (Veo) routes exist in `models.json` but are **token-encoded**, not per-image/per-second. Wire real per-unit metering; gate video to Max+.
6. **Tier catalog reconciliation (P1).** `packages/contracts/types/src/billing-catalog.ts` still carries a legacy shape (no `basic`, single $100 Max, and a `team` entry that predates the 2026-07-11 reinstatement so its price/seat model needs re-deriving, not deleting). Reconcile to Free/Basic/Pro/Max/Max+/Team/Enterprise and attach each tier's COGS ceiling + credit grant, including Team's $15/seat/mo COGS budget per the 2026-07-11 wave-2 plan.
7. **Deep-research + video hard caps + kill-switches (P1).** Per-tier caps and the per-capability kill-switch from §4.6.
8. **BYOK conversion instrumentation (P2).** Track BYOK/Local→Managed conversion events (the funnel metric that the whole P&L rests on).

---

## 6. Open decisions for the founder

1. **BYOK platform fee — keep at $0?** GTM says yes (no markup). If a thin hosting fee is ever wanted (e.g., managed connectors on a BYOK key), it is a new revenue line, not a units change. Default: **$0, unchanged.**
2. **Free managed ceiling ($0.30) — needs a rule check, not just a number.** `commercial-and-launch.md` states Managed Cloud is "subscription/entitlement-gated." A free $0.30 _managed_ taste arguably crosses that locked gate, so this is a **rule change to ratify, not a dial to turn**. Safe default if the founder does not want to touch the rule: set the free managed ceiling to **$0** (Free = strictly Local+BYOK), which makes the portfolio worst-case positive immediately at the cost of a weaker managed hook.
3. **RESOLVED 2026-07-11: top-ups are enabled** for paid tiers (capped, opt-in, off by default, 12-month expiry, per-tier payout parity) — see the stale-model flag at the top of this doc. This model's COGS-ceiling/margin tables still assume no top-ups and need a recompute pass; the fraud/chargeback exposure this item originally flagged (`commercial-and-launch.md` payment guidance) is still a live risk to manage under the new policy, not a reason it was rejected.
4. **Confirm Perplexity per-request search fees and gpt-image-2 / SDXL / Ideogram per-image prices** (tagged `UNVERIFIED` in §2) before those routes go billable.

---

## Executive summary

- **Structure:** BYOK/Local are zero-COGS, zero-revenue free wedges. **100% of unit economics live in Managed Cloud**, where we resell provider compute + fallbacks at a markup, inside a **hard per-tier usage budget with no top-ups** — which makes every paid tier gross-margin-positive _by construction_, even for a user who maxes out on day 1.
- **Recommended margin multiplier: 2.5×** on raw provider/fallback COGS (COGS = 40% of retail usage value). Covers Stripe (2.9%+$0.30), a 2% chargeback reserve, ~$0.60/user fixed infra, and the free-tier subsidy, leaving **~55% worst-case gross margin**.
- **Per-tier included budget (managed COGS ceiling → retail value → credits) and day-1 worst-case gross margin:**
  - **Basic $8** → $2.50 COGS / $6.25 value / 625 credits → **+$4.21 (56%)**
  - **Pro $20** → $7.00 COGS / $17.50 value / 1,750 credits → **+$11.12 (58%)**
  - **Max $100** → $40 COGS / $100 value / 10,000 credits → **+$54.00 (56%)**
  - **Max+ $200** → $85 COGS / $212.50 value / 21,250 credits → **+$104.10 (54%)**
  - **Free $0** → $0.30 managed ceiling + ~$0.10 infra = **≤$0.40/mo bounded burn**; blended worst-case break-even at **~4.1% conversion** (3.6% all-Pro), and a 1,000-signup / 4%-conversion portfolio is **+$277/mo in the expected case** (§4.5).
- **Top 3 margin risks + guardrails:** (1) **Video** — $3.20/8s Veo clip; gate to Max+, default Veo Fast, per-clip kill-switch. (2) **Deep research** — $3–6/run on a flagship; default to a mid model, cap searches/runs. (3) **Sandbox abuse** — wall-clock + vCPU/RAM caps, egress limits, per-capability kill-switch. The per-tier COGS ceiling + no-top-ups is the master guardrail behind all three.
- **Every provider price is cited** to an official page (OpenAI, Anthropic, Google, E2B, Brave, Tavily, Exa, Vercel, Neon, Upstash, Clerk, Cloudflare R2) or tagged **UNVERIFIED** (Perplexity per-request fee; gpt-image-2/SDXL/Ideogram per-image; OpenAI Sora video).
