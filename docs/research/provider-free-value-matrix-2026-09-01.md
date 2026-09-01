# Provider free-value matrix

Status: DRAFT — pending founder sign-off. Nothing here authorizes a signup, a
pool entry, or a catalog change.
Owner: Repository maintainers
Last updated: 2026-09-01

This is the breadth pass that sits beside
`docs/research/free-inference-tos-workbook-2026-09-01.md`. The workbook asks one
question of eight pools — _may this pool ever receive a `FreeEligibility`
record_. This document asks four questions of nineteen providers:

1. What is free, and is it free _capacity_ or a one-time _grant_?
2. What promotional pricing is live right now, and when does it end?
3. Is there an OpenAI-compatible endpoint? An Anthropic-compatible one?
4. Which of the three lanes does this provider belong in — company pool, BYOK,
   or paid?

Every page below was fetched live on **2026-09-01**. A citation is a dated
observation, not a standing fact; provider pricing moves monthly and free tiers
move faster. Secondary sources are marked `[SECONDARY]` and are never the sole
basis for a verdict. Where a fact could not be established from a primary
document it says **UNCLEAR** and names what is missing.

## The distinction this document is built on

The founder's brief separates two things that marketing pages deliberately
conflate:

- **Free allowance** — recurring capacity a provider gives away indefinitely.
  Groq's 1,000 RPD, Zhipu's `$0` Flash models, Scaleway's 1M tokens. This is
  the only kind that can ever back a company pool, because a pool needs
  capacity that exists again tomorrow.
- **Signup credit** — a one-time grant, usually expiring, often card-gated.
  Cerebras' $5/30 days, OVHcloud's $200/1 month, Fireworks' $1. This is
  **traction fuel**: it buys evaluation, benchmarking and demo traffic. It is
  never steady-state capacity and must never be modelled as a quota pool,
  because a pool backed by an expiring grant fails closed exactly once and then
  strands every request routed to it.

A third category turned up often enough to name: **application-gated grants**
(DeepInfra DeepStart, Xiaomi's 100T Builders program, Zhipu's referral tokens).
These are neither — they are business development, and they belong in a
conversation, not a config file.

Multi-account rotation is out of scope by definition, as it is in the workbook.

## What the workbook already settled — do not redo

Eight pools have been through the five-column terms pass. Their verdicts stand;
this document references them and does not re-derive them.

| Pool                           | Workbook verdict   | Where                                              |
| ------------------------------ | ------------------ | -------------------------------------------------- |
| Groq free tier                 | CANDIDATE          | workbook §"Pool 1"                                 |
| Cloudflare Workers AI          | NEEDS-HUMAN-REVIEW | workbook §"Pool 2"                                 |
| Vercel AI Gateway              | NEEDS-HUMAN-REVIEW | workbook §"Pool 3"                                 |
| Mistral free / Experiment      | NEEDS-HUMAN-REVIEW | workbook §"Pool 4"; gap-fill only in §14 below     |
| OpenRouter `:free`             | EXCLUDED           | workbook §"Pool 5" — `promptsExcludedFromTraining` |
| Google AI Studio / Gemini free | EXCLUDED           | workbook §"Pool 6" — `promptsExcludedFromTraining` |
| NVIDIA build.nvidia.com        | EXCLUDED           | workbook §"Pool 7" — `commercialUseAllowed`        |
| Together AI                    | EXCLUDED           | workbook §"Pool 8" — `proxyingAllowed`             |

The five facts a company pool must clear are defined in the workbook's §"What
the four terms facts actually are" and are not restated here. In short: four
booleans on `FreeEligibility.terms` (`commercialUseAllowed`,
`thirdPartyServingAllowed`, `proxyingAllowed`, `promptsExcludedFromTraining`)
checked by `isFreeEligibilityValid`, plus a fifth and separate
`QuotaPool.hardStopsBeforePaid` checked at gate 2 of `resolveFreeAutoRoute`.
The workbook's `yes*` convention — every provider forbids reselling raw API
access while permitting product-embedding, and we read that as permitting our
use — carries over unchanged, and carries the same caveat: it is a legal
judgement, not a quoted fact.

Providers below that cannot host a company pool get **"BYOK lane only"** and no
five-column pass, per the brief.

## Verdict summary

Nineteen providers. Two new company-pool candidates, both of which must still go
through the workbook process before anyone touches `free-pools.json`.

| #   | Provider                    | Free allowance (recurring)              | Signup credit              | Live discount                         | OpenAI-compat | Anthropic-compat | Lane verdict                            | Deciding fact                                                                                              |
| --- | --------------------------- | --------------------------------------- | -------------------------- | ------------------------------------- | ------------- | ---------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | **Zhipu GLM / z.ai**        | **yes** — 3 `$0` Flash models           | none (intl)                | GLM-5.3-Flash −50% to **09-09**       | yes           | yes              | **COMPANY-POOL CANDIDATE** + paid-cheap | Free models are permanent SKUs, and the API ToS excludes prompts from training by default                  |
| 2   | **Novita**                  | **yes** — 5 `$0` models                 | unstated; $10 referral     | glm-5.3-flash −50%, no end date       | yes           | yes (49 models)  | **COMPANY-POOL CANDIDATE** + BYOK       | Zero-data-retention default, hard-stops with 403, and no clause bars serving third parties                 |
| 3   | Alibaba Qwen / Model Studio | 1M tokens per model, 90-day expiry      | UNCLEAR                    | qwen3.7-max −50%, plus −20% (undated) | yes           | yes              | NEEDS-HUMAN-REVIEW → then BYOK          | ToS §III.5 may make free-quota output non-commercial; the document cuts both ways                          |
| 4   | Scaleway Generative APIs    | 1M tokens, all models                   | none found                 | batch −50% (structural)               | yes           | **no**           | **EXCLUDED (pool)** / BYOK              | `hardStopsBeforePaid` — its own FAQ says you cannot configure a blocking threshold                         |
| 5   | SambaNova Cloud             | 20 RPM / **20 RPD** / 200K TPD, no card | UNCLEAR (sources clash)    | none                                  | yes           | yes              | **EXCLUDED (pool)** / BYOK marginal     | ToS §1.5(c) bars a "service bureau or outsourced offering"; 20 requests/day is not capacity                |
| 6   | Hyperbolic                  | Basic tier, 60 RPM, no payment          | $1 `[SECONDARY]`           | none                                  | yes           | **no**           | **EXCLUDED (pool)** / BYOK              | ToS §2.1 licenses "personal or internal business purposes" — fails third-party serving                     |
| 7   | Cerebras                    | **none** — free tier retired            | $5 / 30 days, card req'd   | none                                  | yes           | **no**           | BYOK-recommend / paid-fast              | Docs verbatim: "Is there a permanently free tier? No."                                                     |
| 8   | OVHcloud AI Endpoints       | guard/TTS/image only; 2 RPM anonymous   | $200 / 1 month, card req'd | none                                  | yes           | **no**           | paid-cheap + free moderation infra      | Nothing free on the chat path, but the friendliest contract of all nineteen                                |
| 9   | DeepSeek                    | none                                    | UNCLEAR `[SECONDARY]`      | off-peak is base; peak is **+100%**   | yes           | yes              | BYOK-recommend + paid-cheap             | No free row on the pricing page; cache-hit input is ~30× cheaper than cache-miss                           |
| 10  | Xiaomi MiMo                 | none (grants are application-gated)     | none automatic             | off-peak ×0.8 (hour-of-day)           | yes           | yes              | BYOK-recommend + paid-cheap             | A first-party hosted API exists — the open-weights-only premise was wrong                                  |
| 11  | MiniMax                     | none                                    | UNCLEAR (no primary)       | **M3 "permanent" −50%**               | yes           | yes              | BYOK lane only + paid-cheap             | Training not excluded and no opt-out — could never clear fact 4                                            |
| 12  | Moonshot Kimi               | none; **$1 before first call**          | $5 voucher after $5 spend  | none                                  | yes           | yes              | BYOK lane only (high friction)          | Top-up is WeChat Pay / Alipay only, and Tier0 is 3 RPM                                                     |
| 13  | Fireworks AI                | none (10 RPM until card)                | $1, no card                | batch/cache −50% (structural)         | yes           | yes              | BYOK-recommend                          | Explicit no-training in ToS §3.6; $1 is a smoke test, not capacity                                         |
| 14  | Mistral                     | "Free mode", limits unpublished         | **$10/mo API credits**     | none dated                            | yes           | **no**           | workbook governs; gap-fill only         | Free plan now carries a recurring $10/mo credit line — new since the workbook                              |
| 15  | DeepInfra                   | none — card required to start           | none confirmed             | none                                  | yes           | yes              | BYOK lane only                          | Pricing page verbatim: "You have to add a card or pre-pay"                                                 |
| 16  | Tencent Hunyuan             | TokenHub 1M tokens/model, 90 days       | promo runs to 2026-12-31   | none                                  | yes           | **no**           | BYOK-recommend (pool pass not done)     | Foreign passport/driver's licence accepted for KYC — a real international path                             |
| 17  | Baidu ERNIE                 | exists, shape UNCLEAR                   | UNCLEAR                    | none                                  | yes (`/v2`)   | **no**           | **SKIP direct** → open weights          | Qianfan is absent from Baidu's own international portal; reach ERNIE via Novita/OpenRouter                 |
| 18  | SiliconFlow (intl)          | **none** (the free lists are `.cn`)     | $1                         | none                                  | yes           | yes              | **SKIP**                                | ToS 3.4(p) bars "any commercial purposes"; 3.4(e) bars use "for the benefit of anyone other than yourself" |
| 19  | GitHub Models               | **retired**                             | n/a                        | n/a                                   | **410 Gone**  | never            | **SKIP — does not exist**               | Fully retired 2026-07-30; the inference API returns HTTP 410 and the legacy host NXDOMAINs                 |

Two candidates out of nineteen. Both need the workbook's five-column pass before
they are anything more than candidates.

## Top-line findings

**1. GitHub Models is gone.** Not deprecated, not restricted — retired on
2026-07-30 and verified dead by live probe today. This needs removing from any
plan that assumed it, not repricing. Details in §19.

**2. Zhipu is the strongest new pool candidate since Groq**, and it comes with a
trap. Three GLM Flash models are permanently `$0` (not trial credits), and the
pay-as-you-go ToS says verbatim "We will not use End User Content for developing
or improving Services". But the **GLM Coding Plan** is a different contract that
forbids proxying, third-party service, and use in unsupported tools. If we
accept Zhipu credentials we must accept pay-as-you-go keys only and say so at
the paste field.

**3. Novita is the best-terms gateway of the nine surveyed**: five genuinely free
models, a contractual Zero Data Retention default, a hard 403 on exhausted
balance, and 49 models addressable over an Anthropic-shaped endpoint. Its one
gap is silence — no clause permits or forbids serving third-party end users,
which is the same gap that put Cloudflare into NEEDS-HUMAN-REVIEW.

**4. Two providers silently bill past a free allowance**, which is precisely what
`no_hard_stop_before_paid` exists to catch. Scaleway's FAQ says outright that you
cannot configure a blocking threshold. Alibaba's verified accounts roll onto
pay-as-you-go unless someone explicitly enables **Free Quota Only**. Scaleway is
excluded on this; Alibaba is survivable only because the hard stop is a setting
we control.

**5. Anthropic-compatible endpoints are far more common than assumed.** Eleven of
nineteen ship one first-party: DeepSeek, Moonshot, Zhipu, Alibaba, MiniMax,
Xiaomi, Novita, Fireworks, DeepInfra, SambaNova, SiliconFlow. Mistral, Cerebras,
Scaleway, OVHcloud and Hyperbolic do not. This materially changes what a
harness-level Anthropic client can reach.

---

# Part 1 — Company-pool candidates

Both sections below stop short of a verdict on eligibility. They record the five
facts so the workbook process has something to act on.

## 1. Zhipu AI / GLM (z.ai, open.bigmodel.cn) — COMPANY-POOL CANDIDATE

**Two products, opposite terms.** This is the single most important structural
fact and conflating the two would be a serious error:

- **Pay-as-you-go API** (z.ai / open.bigmodel.cn) — permits serving third-party
  end users, excludes API content from training by contract.
- **GLM Coding Plan subscription** — forbids proxying, reselling, sharing and
  third-party service outright, and binds the plan to one named natural person.

**Free allowance — genuinely free models, not credits.** From
<https://docs.z.ai/guides/overview/pricing> (accessed 2026-09-01), priced at
`Free` for input, cached input and output: **GLM-4.7-Flash**, **GLM-4.5-Flash**,
**GLM-4.6V-Flash** (vision). Corroborated on the CN side at
<https://docs.bigmodel.cn/cn/guide/start/model-overview>, which lists 免费 (free)
models including GLM-4-Flash-250414, GLM-4.1V-Thinking-Flash, GLM-4V-Flash,
CogView-3-Flash and CogVideoX-Flash.

Two caveats that must survive into any pool entry:

- **Use GLM-4.7-Flash, not GLM-4.5-Flash.**
  <https://docs.bigmodel.cn/cn/guide/models/free/glm-4.5-flash> carries a
  discontinuation date of **2026-01-30** with automatic rerouting to
  GLM-4.7-Flash — a date eight months past — while the z.ai international
  pricing page still lists GLM-4.5-Flash as Free. The two primary sources
  disagree; the safe read is that only GLM-4.7-Flash is dependable.
- **Rate limits on the free models are UNCLEAR.** No RPD or TPM figure is
  published. <https://docs.z.ai/api-reference/rate-limit> 307-redirects to the
  logged-in console at <https://z.ai/manage-apikey/rate-limits>, and
  <https://docs.bigmodel.cn/cn/api/rate-limit> likewise defers to the console.
  Limits are account-specific and only visible when authenticated. A pool entry
  needs a `limit`/`window`/`unit` triple, and **we cannot fill it from public
  documentation** — this must come from an authenticated account.

**Signup credits — none found internationally.** No new-user grant appears on the
pricing page, the quick-start, the FAQ, or the full `llms-full.txt` dump. On the
mainland site, <https://docs.bigmodel.cn/cn/update/promotion> documents referral
grants (20M GLM-4.5-Air tokens per successful referral, capped at 10/month) and
a 10%-off first order, but **no plain registration grant**. `[SECONDARY]` sources
report a 20M-token new-user package valid 3 months; UNCLEAR, unconfirmed.

**Promotional pricing — one live discount with a near-term expiry.**
GLM-5.3-Flash carries a **50% discount ending 24:00 on 2026-09-09 (UTC+8)** —
**eight days from today**. Current $0.075 in / $0.25 out. **Post-discount pricing
is not stated**, which matters for the catalog entry (see §"Promo entries to
model"). Cached-input storage is marked "Limited-time Free" across most models
with no stated end date. GLM Coding Plan pricing starts at "$18 USD per month"
(<https://docs.z.ai/devpack/overview>); Pro and Max USD prices are **UNCLEAR** —
only Lite's $18 appears in Zhipu's own docs and three `[SECONDARY]` sources give
three different ladders ($18/$80/$168, $18/$72/$160, $10/$30/$80).

**Compat endpoints.**

- OpenAI-compatible: **yes** — intl `https://api.z.ai/api/paas/v4/`, CN
  `https://open.bigmodel.cn/api/paas/v4/`
  (<https://docs.z.ai/guides/overview/quick-start>,
  <https://docs.bigmodel.cn/cn/guide/start/quick-start>). Documented deviation:
  "The temperature parameter range is (0,1), do_sample = False (temperature = 0)
  is not applicable in OpenAI calls" — **temperature=0 is unsupported**, which
  breaks any deterministic-output path that assumes it works everywhere.
- Anthropic-compatible: **yes** — intl `https://api.z.ai/api/anthropic`
  (<https://docs.z.ai/devpack/quick-start>, <https://docs.z.ai/devpack/faq>), CN
  `https://open.bigmodel.cn/api/anthropic` with path `/v1/messages`
  (<https://docs.bigmodel.cn/cn/guide/develop/claude/introduction>).
  **Important:** the international Anthropic endpoint is documented
  _exclusively_ in GLM Coding Plan context, and the docs say "Only the following
  two models can be called: GLM-5.3, GLM-5.3-Flash". Whether a plain
  pay-as-you-go key is accepted there is **UNCLEAR** and needs a live probe. The
  CN endpoint is documented under the general developer guide, which suggests
  ordinary keys work.

**The five facts.** All quotes from
<https://docs.z.ai/legal-agreement/terms-of-use> (accessed 2026-09-01) unless
noted.

1. **`commercialUseAllowed` — yes.** "you have the right to use the Services
   provided by the Z.ai in accordance with the terms and conditions of these
   Terms", subject to the §III.3–6 prohibited-use list, which contains no
   commercial restriction.
2. **`thirdPartyServingAllowed` — yes, explicitly.** "use Z.ai's API to integrate
   the Services into your applications or to develop downstream systems,
   applications or functions to your end users".
3. **`proxyingAllowed` — yes\*, standard resale bar.** "you cannot transfer,
   assign, sublicense, or subcontract your rights or obligations under these
   Terms to anyone else without our prior written consent". Product-embedding is
   granted by fact 2; raw resale is barred. Same shape the workbook already
   accepted for Groq.
4. **`promptsExcludedFromTraining` — yes, by default, for API.** "**We will not
   use End User Content for developing or improving Services, unless you
   explicitly agree to such use.**" Note the inverted default for individual
   consumer users, for whom the same document reserves the right to process
   content. The Data Processing Addendum §4(b) goes further: "The Company do not
   store any of the content the Customer or its End Users provide or generate
   while using our Services… This information is processed in real-time… and is
   not saved on our servers." **This is the strongest training-exclusion posture
   of any provider in this document except Scaleway and Xiaomi.**
5. **`hardStopsBeforePaid` — yes for paid, UNCLEAR for free.** "Your balance will
   be consumed if you use our paid services, and we reserve the right to suspend
   services if your balance are insufficient." No overage clause. But the `$0`
   models consume no balance at all, so **what happens when a free model's
   undisclosed rate limit is hit is not documented**. A 429 is the strong
   inference; it is not a quoted fact.

**The Coding Plan blocker.** From
<https://docs.z.ai/legal-agreement/subscription-terms> §4.2–4.3:

> "The GLM Coding Plan subscription is tied to a single account and is licensed
> only to the individual natural person associated with such account."
>
> "you may not resell, sub-resell, repackage, aggregate, proxy or otherwise
> provide the GLM Coding Plan to any third party, whether on a paid or free
> basis, nor may you use the GLM Coding Plan to provide model capabilities as a
> service to third parties."

And <https://docs.z.ai/devpack/faq>: "The GLM Coding Plan is strictly limited to
use within officially supported tools and products."

A Coding Plan subscriber who pastes their key into our chat product is likely in
breach, and the penalty is termination with no refund. **Product requirement: if
we accept Zhipu credentials, accept pay-as-you-go keys only, and say so at the
input field.**

**BYOK viability — best in this document.** Self-serve key at
<https://z.ai/model-api>, no waitlist, and a user can call GLM-4.7-Flash **for
free with no payment method at all**. One sharp constraint from
<https://docs.z.ai/help/faq>: "When using a credit card to recharge, please
ensure that you are not using 3DS verification" — which will silently fail for
EU/UK users whose banks mandate SCA under PSD2. Worth a warning string in our UI.

**Adapter status:** `packages/ai/providers/zhipu` exists.

**Open items before the workbook pass can conclude:** the free models' rate
limits (authenticated account required); whether a pay-as-you-go key is accepted
at `api.z.ai/api/anthropic` (live probe); GLM-4.5-Flash's contradictory
discontinuation date; and the free-model exhaustion behaviour.

## 2. Novita AI — COMPANY-POOL CANDIDATE

The strongest terms of any gateway surveyed. Notably, Novita publishes an
**unauthenticated model catalogue** at
<https://api.novita.ai/openai/v1/models> (HTTP 200, accessed 2026-09-01)
returning all 154 models with exact prices, per-model endpoint support, and
origin-vs-current pricing. That is machine-readable primary evidence and is
better than any pricing page — it is also directly ingestible by a catalog sync.

**Free allowance — five genuinely free models**, a standing catalogue feature
rather than a promotion. From the live catalogue, priced at $0 in / $0 out:

- `inclusionai/ling-3.0-flash-fin`
- `inclusionai/ling-3.0-tiny`
- `qwen/qwen3.5-plus`
- `qwen/qwen3.6-plus`
- `nex-agi/nex-n2-pro`

(Excluded from that list: `ai_infer_test_1/2/3`, `gt-4p`, `dev/glm46`, `bunny` —
plainly internal test artefacts.) All five expose only `chat/completions`; **no
free model is Anthropic-addressable.** <https://novita.ai/pricing> independently
confirms Ling 3.0 Flash Fin as free at 256K context.

**Rate limits are UNCLEAR and this is the main gap.** Novita publishes no LLM
rate-limit page; its own doc index (`novita.ai/docs/llms.txt`) lists rate/quota
docs only for Agent Sandbox. Circulating figures (60 RPM; 30 RPM / 1,000 RPD /
8,000 TPM for `gpt-oss-120b`; T1–T5 tiers) are `[SECONDARY]`, from Novita's
marketing blog and third-party sites, not the API docs. **A pool entry needs
measured limits, not published ones.**

**Signup credits — amount unstated.** The quickstart says only "We offer new
users a voucher with some credit to try our products". No figure, no expiry, in
any primary doc; the widely-cited $0.50 is `[SECONDARY]`. The **referral program
is primary and generous**: <https://novita.ai/referral> is titled "Give $10, Earn
$10 In LLM API credits". Separately, the registration page advertises $100
Sandbox credits over 90 days — that is **Agent Sandbox compute, not LLM
inference credit**; do not conflate.

**Promotional pricing — exactly one discounted model**, computed from the
catalogue's `origin_price_per_m` vs `price_per_m`: `zai-org/glm-5.3-flash` at
**50% off** — input $0.15 → $0.075, output $0.05 → $0.025. **No end date is
exposed** in the API or on the pricing page. Separately the pricing page states
"Batch inference is available at an introductory 50% discount on input and
output tokens for supported models", also undated.

**Compat endpoints.**

- OpenAI-compatible: **yes** — `https://api.novita.ai/openai`, stated verbatim in
  `novita.ai/docs/llms.txt`; chat at
  `https://api.novita.ai/openai/v1/chat/completions`.
- Anthropic-compatible: **yes** — `https://api.novita.ai/anthropic`, i.e.
  Messages at `/anthropic/v1/messages`
  (<https://novita.ai/docs/guides/llm-anthropic-compatibility>). Live probe
  returned 403, not 404 — the route exists and requires auth. **49 of 154 models
  carry the `anthropic` endpoint**, including `moonshotai/kimi-k3`,
  `deepseek/deepseek-v4-pro`, `zai-org/glm-5.3`, `qwen/qwen3.8-max` and
  `minimax/minimax-m3`.

**The five facts.** All quotes from <https://novita.ai/legal/terms-of-service>
(accessed 2026-09-01).

1. **`commercialUseAllowed` — yes.** The only commercial restriction (§2) governs
   Novita's own site content and marks, not inference calls. §11 disclaimers
   expressly contemplate using Output "FOR ANY COMMERCIAL, LEGAL, MEDICAL,
   FINANCIAL, SAFETY-CRITICAL, OR OTHER CONSEQUENTIAL PURPOSE", which presupposes
   commercial use is permitted.
2. **`thirdPartyServingAllowed` — UNCLEAR, and this is the open question.** No
   clause permits it and none forbids it. Nothing parallels SiliconFlow's
   "benefit of anyone other than yourself" bar. §10 confirms "You retain
   copyright and any other proprietary rights that you may hold in the Input",
   and §10.2 contemplates you processing third-party personal data lawfully
   (GDPR/CCPA named), which implies downstream users are anticipated — but
   **implication is not permission.** This is the same silence that put
   Cloudflare Workers AI into NEEDS-HUMAN-REVIEW in the workbook, and it should
   be resolved the same way: a written question to Novita.
3. **`proxyingAllowed` — yes\*, weakly.** No general anti-resale clause was
   found. The single "reselling" mention is narrow, §9(6): "reselling access to
   circumvention tools" — that bars reselling jailbreak tooling, not API access.
   No clause expressly permits resale either.
4. **`promptsExcludedFromTraining` — yes, contractually, and strongly.** §10.2
   Zero Data Retention: "By Default, Novita AI will not use your Content to train
   our own models or to improve the Services. We will not retain any Content for
   longer than is necessary to provide the Services to you. We have adopted a
   'Zero Data Retention' policy, which means that we will not… (i) log your
   Content for human review; or (ii) retain your Content beyond the time it takes
   to generate Output and deliver that Output to you." Carve-out: automated
   safety screening is permitted and "does not constitute retention".
5. **`hardStopsBeforePaid` — yes.** Prepaid credit model confirmed by the
   published error table (<https://novita.ai/docs/api-reference/basic-error-code>):
   `BILLING_BALANCE_NOT_ENOUGH` → **HTTP 403 "Insufficient balance"**, and
   `NOT_ENOUGH_BALANCE` → **HTTP 403**. Rate limiting is separate
   (`RATE_LIMIT_EXCEEDED` → 429). It refuses rather than bills.

**Two risks worth pricing in.** §19 caps liability at the lesser of six months'
fees or **$500 USD**. And §5: "Novita AI reserves the right to add, modify,
suspend, or remove any Model from the Service at any time" with no liability —
relevant if we pin a model in a user-facing selector.

**BYOK viability — excellent.** Google/GitHub/email sign-in, key at
<https://novita.ai/settings/key-management>, no KYC, no identity verification, no
region gate found in the ToS or signup flow. Must be 18+. Prepaid balance means a
key cannot silently run up a bill.

**Adapter status:** **none.** See §"Adapter gaps".

**Open items:** measured free-tier rate limits; a written answer on third-party
serving; and whether the free five have separate limits from the paid catalogue.

---

# Part 2 — Excluded from the company pool

These four have real free allowances, which is why they were investigated in
depth, and each fails on a specific fact rather than on vibes.

## 3. Scaleway Generative APIs — EXCLUDED on `hardStopsBeforePaid`

This is the cleanest exclusion in the document, and it maps exactly onto
`FreeAutoRejectionReason.no_hard_stop_before_paid`.

**Free allowance — real and current.** From
<https://www.scaleway.com/en/docs/generative-apis/faq/> (page reviewed
2026-04-13, accessed 2026-09-01):

> "There is a Free Tier available for _Serverless_. The Free Tier allows you to
> process, **without incurring any costs**, up to: **1,000,000 tokens** for
> models billed by tokens [and] **60 minutes of audio transcription**… After
> reaching this limit, you will be charged per million tokens processed."

It applies across all Serverless models, is "applied to the most expensive
tokens first", and appears on the bill as "Offer deducted - Generative APIs Free
Tier". **Periodicity is UNCLEAR** — no primary source says whether the 1M tokens
is monthly, one-time or recurring; the FAQ's framing around "the current month"
suggests monthly, but that is inference.

**Why it is excluded.** From the same FAQ:

> "**Can I configure a maximum billing threshold?** **Currently, you cannot
> configure a specific threshold after which your usage will be blocked.**
> However: You can configure billing alerts… Your total billing remains limited
> by the amount of tokens you can consume within rate limits."

Exceeding 1M tokens does not 429 — it bills. At the identity-verified ceiling of
600 RPM and up to 2,000k TPM, the theoretical monthly exposure is very large.
This fails gate 2 of `resolveFreeAutoRoute` outright, and no amount of favourable
terms elsewhere rescues it.

That is a shame, because the rest is strong. Article 4.4 of the **Specific
Conditions Applicable to AI Services** (version 07/04/2026,
<https://www-uploads.scaleway.com/Specific_Conditions_AI_Services_275907180f.pdf>)
carries the strongest data guarantee of all nineteen:

> "**Scaleway does not retain any requests or generated Content after
> processing.** Client data, including prompts, completions, and training data:
> **is not used to train, retrain, or improve the base Models**; is not
> accessible by LLM Model providers; **is not used to improve the Service**…
> **Scaleway does not log this data.**"

Commercial use is permitted (Article 4.5's prohibition list contains no
commercial restriction). Third-party serving is **UNCLEAR** — neither permitted
nor prohibited. Resale is **not prohibited in the AI Specific Conditions**, but
the **General Terms of Services PDF (v.09/06/26) is not machine-extractable**, so
a resale clause could sit there and would govern. That gap needs a human reader
before Scaleway is used for anything beyond BYOK.

**Compat:** OpenAI-compatible at `https://api.scaleway.ai/v1` (project-scoped
form `https://api.scaleway.ai/{project_id}/v1`). **No native Anthropic
endpoint** — Scaleway's own Claude Code guide routes through the third-party
`y-router` Cloudflare worker, not a Scaleway endpoint.

**BYOK:** high friction. Article 3 makes KYC identity verification and payment
method validation mandatory before any use, and identity verification doubles RPM
(300→600) and multiplies TPM up to 10×. Paris region only.

**If the founder wants Scaleway anyway:** it is usable only behind an
application-side token budget that cuts off at 1M, because the provider will not.
That is a real engineering commitment, not a config flag.

## 4. SambaNova Cloud — EXCLUDED on `thirdPartyServingAllowed` + allowance shape

**Free allowance — real, card-free, and far too small.** Per
<https://docs.sambanova.ai/docs/en/models/rate-limits> (accessed 2026-09-01), the
Free Tier applies "when there is no payment method linked with your account" and
gives, identically across `DeepSeek-V3.1`, `Meta-Llama-3.3-70B-Instruct`,
`gpt-oss-120b`, `DeepSeek-V3.2` and `gemma-4-31B-it`: **20 RPM / 20 RPD / 200,000
TPD**.

Twenty requests per day, per model. That is an evaluation allowance, and the
200K TPD cap is unreachable in 20 requests unless each averages 10K tokens. Even
with perfect terms this could not back a user-facing pool.

**And the terms are not perfect.** From the SambaCloud ToS
(<https://sambanova.ai/cloud-end-user-license-agreement>), §1.5 General
Restrictions:

> "Customer, including any User, will not… (c) sell, resell, rent, sublicense,
> transfer or otherwise make available any Service to a third party **(other
> than permitting a User to use the Service)** or in a service bureau or
> outsourced offering"

The "User" carve-out is real — "User" is defined as "the persons and/or entities
designated and granted access to the Service by or on behalf of Customer" — but
the clause's tail, **"or in a service bureau or outsourced offering"**, is a
textbook description of a company-operated shared free pool fronting SambaNova
capacity to unrelated end users. This clause decides it, and it reads against us.

One trap worth recording: `sambanova.ai/terms-and-conditions` §1 says the site is
for "informational, **non-commercial** use". **That governs the marketing website
only, not the Cloud service.** The governing contract is the SambaCloud ToS.

**Training exclusion is UNCLEAR** — there is no express no-training sentence,
only a purpose limitation in §2.1 ("solely to the extent necessary to provide the
Service to you… and for no other purposes"). That excludes training as a matter
of construction, but every other provider in this document that means it says it.

**Notable positive:** SambaNova exposes a **native Anthropic Messages endpoint**
at `https://api.sambanova.ai/v1` via `POST /v1/messages` plus
`/v1/messages/count_tokens` — same base URL as its OpenAI-compatible surface,
which is unusual and convenient.

**Contradiction to resolve:** the docs say the Free Tier needs no payment method;
the console plans page says "Add a payment method and purchase credits to run
your first requests". Resolving this needs a real signup attempt.

## 5. Hyperbolic — EXCLUDED on `thirdPartyServingAllowed`

**Free allowance — real.** A "Basic" tier of **60 RPM, capped at "100 IP
Limit"**, for serverless inference, usable with no payment on file, listed as
including "API access, All models, Community support"
(<https://www.hyperbolic.ai/docs/inference/overview>, accessed 2026-09-01). No
expiry stated — it reads as persistent, not time-boxed. That is a better free
allowance than most of this document.

**Why it is excluded.** ToS §2.1 (<https://www.hyperbolic.ai/terms>) licenses the
service "solely for your own personal or internal business purposes". On the
plain reading that excludes operating the API as the backend for our own external
users. §7 reinforces: "you shall not… license, sell, rent, lease, transfer,
assign, reproduce, distribute, host or otherwise commercially exploit the
Services."

**Training exclusion is UNCLEAR at the contractual level.** The docs claim "Zero
data retention policy" and "Your data is never stored", but the Privacy Policy
does not address prompt use in training — a favourable informal signal, not a
contractual guarantee. Fact 4 cannot be marked yes on a docs page when the legal
text is silent.

**Hard-stop appears to be the default**, inferred from Hyperbolic's own blog
describing the problem their opt-in Auto Top-Ups feature solves: "having your
instance shut down mid-job—or having your inference request fail—just because
your balance ran out".

**No Anthropic-compatible endpoint** was found. OpenAI-compatible at
`https://api.hyperbolic.xyz/v1` (note: docs moved to `hyperbolic.ai`, the API
host is still `hyperbolic.xyz`). Pricing pages 404 across the board; only floor
prices are primary-confirmed ("from $0.10 per million input tokens").

**BYOK:** viable and zero-friction — the 60 RPM Basic tier works with no payment
at all, which makes it a good candidate for a "try it without a card" onboarding
path even though the pool is out.

## 6. Cerebras — no free tier exists

Included because it was on the brief as a claimed free tier. It is not one, and
Cerebras says so in as many words at
<https://inference-docs.cerebras.ai/support/rate-limits> (accessed 2026-09-01):

> "**Is there a permanently free tier?** No. The Free Trial is time- and
> credit-bounded: $5 in credits that expire 30 days after they're granted…
> **Cerebras doesn't currently offer a no-cost tier that renews automatically or
> a per-model always-free allowance.**"

The $5 is granted **after adding a verified payment method**, and "If you skip
adding a payment method at sign-up, Playground and API access remain inactive
until you do."

That makes it a **signup credit, not a free allowance** — traction fuel in this
document's taxonomy. Free-trial limits are 5 RPM / 30K TPM / 1M TPD on both
public models (`gpt-oss-120b`, `gemma-4-31b`); context is 65k on free versus 131k
on paid.

**The terms are actually good**, which is worth recording for the paid lane. The
ToS grants "(b) distribute or allow access to your integration of the APIs within
your applications to end users of such applications" — express third-party
serving — and Data Usage: "**the foregoing does not grant Cerebras the right to
use Service Content for the purpose of training or fine-tuning models.**" It
hard-stops: "API and Playground access stop on the Free Trial tier until you
purchase credits."

**Verdict: BYOK-recommend and a strong paid-fast option** ($0.35/$0.75 per M on
`gpt-oss-120b`, ~1,000 tok/s class), just never a free pool. No Anthropic
endpoint — zero occurrences of "Anthropic" across the 135-entry docs index.

## 7. OVHcloud AI Endpoints — best contract, nothing free on the chat path

**The free models are real but not chat models.** Seven of nineteen catalogue
entries are €0: `Qwen3Guard-Gen-8B`, `Qwen3Guard-Gen-0.6B` (LLM guards),
`stable-diffusion-xl-base-v10`, and four NVIDIA Riva TTS voices. **None is a
general-purpose chat LLM.** For a chat free pool OVHcloud contributes nothing —
though `Qwen3Guard` is genuinely useful as **free moderation infrastructure**
regardless of which provider serves the chat turn, and that is worth taking.

There is also a genuinely open anonymous path: **2 requests per minute, per IP
and per model, with no account at all**; authenticated keys get 400 RPM per
project per model. Useful for demos and smoke tests, not for serving.

**The contract is the friendliest of all nineteen.** GTS §10.6 expressly
contemplates third-party use:

> "The Client assumes all risks… **including when the Services made available to
> the Client are used by or on behalf of third parties, in particular Users. If
> the Client uses the Services on behalf of third parties… the Client undertakes,
> prior to their use, to communicate to them and have them validate the
> contractual conditions of OVHcloud and Third-Party Products Conditions
> applicable to these Services.**"

That is permission with a **pass-through obligation** — we would have to surface
OVHcloud's terms and the per-model licences to our users and obtain their
validation. A full-text search of all four current governing documents returned
**zero matches for "resell", "resale", "sublicens", "rent", "lease" or
"marketplace"**. And Appendix 10 §5: "**OVHcloud has no knowledge of Inputs and
Outputs, and OVHcloud does not reuse them in any way**" — with a **Batch API
carve-out** where that guarantee does not apply.

**Hard-stop is UNCLEAR** — no governing contract addresses what happens when the
$200 trial credit is exhausted.

**Where this lands: the paid lane.** `gpt-oss-120b` at **€0.08 in / €0.40 out**
undercuts Scaleway's €0.15/€0.60 by ~47%/33% for the identical model, and
OVHcloud is an EU entity with a no-reuse guarantee and express third-party
permission. If we want a cheap, contractually clean default route for open
models, this is the strongest candidate in the document.

**Jurisdiction caveat:** the separate US contract
(`us.ovhcloud.com/legal/terms-of-service/`, different contracting entity)
reportedly prohibits sublicensing at §5(b). That quote is `[SECONDARY]` and
unverified. If we contract via the US entity rather than OVH Hosting Limited
(Ireland), it must be re-checked.

---

# Part 3 — BYOK and paid lanes

Providers with no plausible company pool. Per the brief, these get the four
commercial questions and no deep terms analysis.

## 8. DeepSeek — BYOK-recommend + paid-cheap

**No free allowance.** The pricing page lists three models, all per-token, with
no free row (<https://api-docs.deepseek.com/quick_start/pricing>). Signup credits
are **UNCLEAR** — nothing on the pricing, rate-limit, error-code, first-call or
ToS pages mentions a grant, and the FAQ is a JS-rendered SPA that returned no
body. `[SECONDARY]` aggregators claim a 5M-token/30-day grant but one of them
says outright it is not guaranteed and may be campaign-specific. **Do not model a
DeepSeek signup credit.**

**The off-peak scheme still exists but inverted.** Verbatim from the pricing
page: "Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday
(all other hours are off-peak)" and "Off-peak rates are half of the peak rates."
**Peak is now the surcharge and off-peak is the base** — the old
16:30–00:30 UTC / 50%-off-V3 / 75%-off-R1 scheme is gone along with the
`deepseek-chat` and `deepseek-reasoner` aliases. Off-peak covers all weekend plus
17 of 24 weekday hours.

| model                          | in cache-hit off/peak | in cache-miss off/peak | output off/peak |
| ------------------------------ | --------------------- | ---------------------- | --------------- |
| `deepseek-v4-flash`            | $0.007 / $0.014       | $0.22 / $0.44          | $0.66 / $1.32   |
| `deepseek-v4-pro`              | $0.022 / $0.044       | $0.66 / $1.32          | $1.98 / $3.96   |
| `deepseek-v4-flash-vision-exp` | $0.007 / $0.014       | $0.22 / $0.44          | $0.66 / $1.32   |

**Cache-hit input is ~30× cheaper than cache-miss.** That is the single largest
cost lever on this provider and dwarfs the peak/off-peak spread.

**Compat:** OpenAI at `https://api.deepseek.com`; **Anthropic at
`https://api.deepseek.com/anthropic`**. DeepSeek is the only provider in this
document that publishes an **itemised deviation list**
(<https://api-docs.deepseek.com/guides/anthropic_api/>): `anthropic-version`,
`container`, `mcp_servers`, `service_tier`, `top_k` and `cache_control` are
silently ignored; `thinking.budget_tokens` is ignored; `document`,
`search_result`, `redacted_thinking` and several tool-result content types are
unsupported.

**One dangerous default worth guarding against in our adapter:** "Unsupported
model names automatically map to `deepseek-v4-flash`." A typo'd or Claude-named
model does not error — it silently downgrades to the cheap model. For a
model-neutral platform that is a correctness hazard; validate the model string
before dispatch.

**Terms, briefly.** Commercial use and third-party serving are explicitly
permitted (Open Platform ToS §1.1: "providing services to both internal and
external end users"). Raw resale is barred via the incorporated Terms of Use
§3.6(4). **Training exclusion is UNCLEAR and the default appears to be NOT
excluded** — the Privacy Policy lists training among its purposes and its
opt-out is framed around Personal Data, not API prompt content. Hard-stop is
confirmed: 402 Insufficient Balance, prepaid, no overage. DeepSeek also does
**not** forbid distillation of its outputs (§4).

**BYOK:** self-serve, no waitlist, generous concurrency (500 / 2500). Payment
rails are **UNCLEAR from primary**; `[SECONDARY]` consistently reports PayPal
rather than direct card internationally.

**Adapter status:** `packages/ai/providers/deepseek` exists.

## 9. Xiaomi MiMo — BYOK-recommend + paid-cheap

**The brief's premise was wrong, and this is the biggest surprise in the
research.** MiMo is not open-weights-only. Xiaomi operates the **MiMo API Open
Platform**: console at <https://platform.xiaomimimo.com>, docs at
<https://mimo.mi.com/docs>, inference at `https://api.xiaomimimo.com`. Log in
with a Xiaomi account, create an `sk-` key, top up, and call it. It has published
per-token pricing in CNY and USD, a four-tier subscription, ASR/TTS lines, prompt
caching, and **both** OpenAI- and Anthropic-compatible endpoints. The weights are
_also_ MIT-licensed on HuggingFace; both things are true at once.

Current models: `mimo-v2.5-pro` (~1.0T params, 42B active) and `mimo-v2.5` (310B
total, 15B active), plus ASR/TTS variants. **The MiMo-V2 series was deprecated on
June 30.**

**No general free quota.** Free access exists only through application-gated
programs — the "100T Token Grant for Builders" (individually reviewed;
application window 2026-04-28 to 2026-05-28, **UNCLEAR whether currently open**)
and a free Max-tier plan for Apache Software Foundation committers with an
`@apache.org` address. Two time-boxed freebies appear in the pricing table: TTS
"free for a limited time" and "Cache Write: Limited-time Free", neither dated.

**Pricing is genuinely cheap.** Overseas (USD/1M): `mimo-v2.5-pro` $0.435 in /
$0.87 out / $0.0036 cache-hit; `mimo-v2.5` $0.14 / $0.28 / $0.0028. Domestic
(CNY/1M): `mimo-v2.5-pro` ¥3.00 / ¥6.00; `mimo-v2.5` ¥1.00 / ¥2.00. The two price
books are independently set, not FX conversions. **Off-peak discount: ×0.8
consumption during Beijing 00:00–08:00 (UTC 16:00–24:00).**

**Compat endpoints — four base URLs, and they are not interchangeable:**

| key type              | OpenAI-compatible                         | Anthropic-compatible                             |
| --------------------- | ----------------------------------------- | ------------------------------------------------ |
| Pay-as-you-go (`sk-`) | `https://api.xiaomimimo.com/v1`           | `https://api.xiaomimimo.com/anthropic`           |
| Token Plan (`tp-`)    | `https://token-plan-cn.xiaomimimo.com/v1` | `https://token-plan-cn.xiaomimimo.com/anthropic` |

Per the FAQ: "Return different Base URLs + Keys based on the region where the
account is located, **which are not interoperable**". Any adapter must take the
base URL from configuration rather than assuming one default.

**Training exclusion is stated more plainly than by any other provider here.**
From the platform privacy policy (<https://privacy.mi.com/XiaomiMiMoPlatformos/en_GB/>):
"**Xiaomi will not use the content you provide for model training or any other
purposes.**" Unconditional, no opt-out needed. Data residency outside mainland
China is **Europe and Singapore**. §4.1 of the user agreement puts Xiaomi in the
Processor role with us as Controller — the strongest data-protection framing of
the Chinese providers surveyed.

**Hard-stop:** documented with a grace window — "Once the balance becomes
negative, the model inference service can no longer be used, and the next
recharge order will first deduct the overdue amount."

**BYOK:** easiest signup of the Chinese providers. Personal Xiaomi account only
(no enterprise login), no waitlist, and overseas payment runs through the Waffo
gateway in USD supporting **Apple Pay, Google Pay and credit/debit cards** — no
WeChat/Alipay requirement for overseas users. Domestic users must complete
real-name authentication before recharging.

**Commercial use is UNCLEAR** — no affirmative grant, no prohibition, and no
explicit anti-resale clause was found. Fine for BYOK; would need work before any
pool.

**Adapter status:** **none.** See §"Adapter gaps" — MiMo is called out explicitly
there per the brief.

## 10. MiniMax — BYOK lane only + paid-cheap

**No free allowance.** Every text model on the pay-as-you-go table carries a
per-token cost (<https://platform.minimax.io/docs/guides/pricing-paygo>). The one
free tier that did exist was **removed three weeks ago**: "Starting August 20,
2026… The free music generation APIs (Music-3.0-free, Music-2.6-free,
music-cover-free) will be discontinued."

**Signup credits: UNCLEAR.** No primary doc on either site states a grant;
pricing, Token Plan pricing, both FAQs, the quickstart and the live signup screen
were all checked. `[SECONDARY]` claims of "¥68" or "trial credits, 30-day expiry"
cite no doc URL and contradict each other. The likely source of confusion is
MiniMax **Agent** (agent.minimax.io), a separate consumer product that does run
credit promos.

**MiniMax-M3 carries a "Permanent 50% off" badge with no end date** (CN badge
reads 永久五折): ≤512K standard at **$0.30 in / $1.20 out / $0.06 cache read**,
down from $0.60 / $2.40 / $0.12. "Permanent" is the doc's own word, not a
contractual guarantee.

**Compat:** OpenAI at `https://api.minimax.io/v1`; **Anthropic at
`https://api.minimax.io/anthropic`**. Mainland hosts add an "i":
`https://api.minimaxi.com/v1` and `/anthropic`.

**Why this can never be a pool, even if a free tier returned:** training is not
excluded and there is no documented opt-out. ToS: "We may use the input and
generated content to provide, maintain, develop, and improve our Services." That
fails `promptsExcludedFromTraining` the same way OpenRouter `:free` does in the
workbook. There is also a clause worth flagging to whoever owns our ToS: "You
agree to use our Service exclusively for your own products or projects", read
together with an explicit ban on sublicensing, reselling or distributing services
"outside of any integrated applications".

**Hard-stop:** yes — error `1008 insufficient balance`, prepaid wallet.

**BYOK:** international signup is **email-only** (live-verified: email, Google or
GitHub OAuth, no phone field), payment via Stripe. Sanctioned regions excluded per
the Export Controls clause.

**Adapter status:** `packages/ai/providers/minimax` exists.

## 11. Moonshot Kimi — BYOK lane only, high friction

**No free allowance, and a paywall before the first call.** Verbatim from
<https://platform.kimi.ai/docs/pricing/limits>: "To prevent abuse, you need to
recharge at least $1 to start using, and when your cumulative recharge reaches
$5, you will receive a $5 voucher."

**Tier0 — the $1 minimum — is 1 concurrent request and 3 RPM.** A BYOK user who
tops up the minimum will experience our product as broken under any concurrency.
Tier1 ($10 cumulative) jumps to 50 concurrent / 200 RPM. If we support Kimi keys
we should surface the tier requirement in onboarding.

Also verbatim: "When the system detects abnormal activity on an account, a
risk-control rate-limiting policy is triggered. Once triggered, the restriction
cannot be lifted." Irreversible, per the docs.

**Domain note:** `platform.moonshot.ai` now 301-redirects to `platform.kimi.ai`
and `platform.moonshot.cn` to `platform.kimi.com`. The **API hostnames are
unchanged** (`api.moonshot.ai` / `api.moonshot.cn`).

**Compat:** OpenAI at `https://api.moonshot.ai/v1`; **Anthropic at
`https://api.moonshot.ai/anthropic`** (Messages at `/anthropic/v1/messages`),
documented in a dedicated Claude Code guide. Deviations that matter: the Messages
spec restricts `model` to an enum of `kimi-k3`; tool schemas follow "MFJS
(Moonshot Flavored JSON Schema)" rather than plain JSON Schema, so **tool
definitions are not portable**; images use a proprietary `ms://<file_id>` scheme;
and `kimi-k2.7-code` has thinking "Forced on, cannot be turned off".

Current pricing (USD/1M): `kimi-k3` $0.30 cache-hit / $3.00 cache-miss / $15.00
out; `kimi-k2.7-code` $0.19 / $0.95 / $4.00; `kimi-k2.6` $0.16 / $0.95 / $4.00.
No promotional pricing found.

**The blocker for Western BYOK is payment.** From
<https://platform.kimi.ai/docs/guide/account-and-payments>: "Online top-ups
support WeChat Pay and Alipay QR code payments". **Credit cards are not mentioned
anywhere on the international platform's own payments page**, and the invoicing
entity is "Beijing Moonshot AI Technology Co., Ltd." even on the `.ai` platform.

**Training:** used by default; the only opt-out is an enterprise conversation
("Customer who requires restrictions on the use of Customer Content for training…
may contact Moonshot AI"). **This is the weakest data posture of the Chinese
providers** and should be disclosed to any user who brings a Kimi key.

**Adapter status:** `packages/ai/providers/moonshot` exists.

## 12. Alibaba Qwen / Model Studio — NEEDS-HUMAN-REVIEW, then BYOK

Included here rather than in Part 1 because its blocker is a genuine textual
ambiguity that a human must resolve, not a fact we can record.

**The two sites are different products.** International = Alibaba Cloud Model
Studio, Singapore region, `dashscope-intl` / `*.ap-southeast-1.maas.aliyuncs.com`,
USD. Mainland = 百炼 (Bailian), Beijing region, `dashscope.aliyuncs.com`, CNY. Keys
and base URLs are not interchangeable. **Methodological warning:**
`help.aliyun.com` serves mainland content on its `/en/` paths too; the genuine
international doc lives only under `www.alibabacloud.com/help/en/...`.

**Free allowance — per model, not per account.** From
<https://www.alibabacloud.com/help/en/model-studio/new-free-quota> (page states
Last Updated 2026-09-01): "Each model… has its own independent free quota
(typically 1,000,000 tokens)", validity **90 days**, **Singapore region only**
("Only models in the Singapore region with the service deployment scope set to
International are eligible"). Dated snapshot versions count as separate models
with their own quota. Excludes batch, fine-tuning and deployment. An account and
its RAM users share one quota. **No always-free model** — every quota expires.

**The blocker.** The service-specific terms
(<https://help.aliyun.com/en/model-studio/bailian-service-notes>) have four
sections, and Section **III "Trial services"** §5 says:

> "The content you generate through model trials **may only be used to evaluate
> the model's performance. It may not be used for any other purpose, including
> any commercial purpose.** You are prohibited from providing it to any third
> party in any form."

Section III.4 scopes itself to "the Model Library trial", i.e. the console
playground — which would put the API free quota outside it. But **III.1 opens
"due to limited resources for trial services, we may impose a quota on your free
trial usage"**, which is arguably describing the free token quota itself. The
document genuinely cuts both ways. For a platform serving third-party end users,
that ambiguity _is_ the risk. **Treat free-quota output as non-commercial until
Alibaba confirms otherwise in writing.**

**The hard-stop trap.** The default is the dangerous one:

> New/unverified users: "You cannot continue making invocations after your free
> quota is exhausted."
> Verified users, protection off: "**ongoing invocations are not interrupted.**
> Any tokens used beyond the free quota are charged at the input/output prices
> listed in the console."
> With **"Free Quota Only"** enabled: "the service stops responding and returns
> the error code `AllocationQuota.FreeTierOnly`."

**A verified account silently bills overage unless someone explicitly enables
Free Quota Only.** If we provision Alibaba keys for anything, that flag goes on
first. Unlike Scaleway, at least the hard stop exists and is ours to switch on.

**Training: excluded by default.** "Alibaba Cloud strictly protects your data
privacy and will never use your data for model training." No opt-out needed.

**Compat.** OpenAI-compatible: Singapore
`https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (legacy, still works) or
`https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`;
Beijing `https://dashscope.aliyuncs.com/compatible-mode/v1`. **Anthropic-compatible:
yes** — `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/apps/anthropic`,
and the base URL must end at `/apps/anthropic`, **not** `/apps/anthropic/v1/`,
because Claude clients auto-append `/v1/models`. A separate Coding Plan product
uses `sk-sp-` keys and `coding-intl.dashscope.aliyuncs.com` and is not
interchangeable.

**Discounts:** `qwen3.7-max` carries a **50% limited-time discount** ($2.5/$7.5)
and `qwen3.7-plus` a **20% discount** ($0.4–$1.2 / $1.6–$4.8), tiered by context.
**No end date is stated for either** — they are labelled "limited-time"/"限时"
without a date, which makes them unmodellable as promo entries (see below).

**BYOK:** viable internationally for an individual. Full ID verification is
required only for mainland-region resources — Singapore resources and free trials
need only "complete sign-up" (mobile verification, payment method, billing
address). **India is blocked**: "no longer accepts new customer registrations in
India." Virtual credit cards are explicitly not accepted. Mainland Bailian is
effectively closed to a foreign individual: no passport option exists anywhere in
the CN account docs.

**Adapter status:** `packages/ai/providers/qwen` exists.

## 13. Fireworks AI — BYOK-recommend

**$1 signup credit, no card required to claim it.** No expiry stated anywhere —
**UNCLEAR whether it expires**. There is no renewing free tier: accounts with no
payment method are capped at **10 RPM account-wide**, and once the $1 is gone
"Your account will be suspended until you add a payment method". That is a smoke
test, not capacity.

**Compat:** OpenAI at `https://api.fireworks.ai/inference/v1`; **Anthropic at
`https://api.fireworks.ai/inference`** (SDK appends `/v1/messages`).

**Training excluded by contract.** ToS §3.6: "We will not use your Content to
train our own models or to improve the Service." The Privacy Policy adds "without
your explicit opt-in". Caveat: this covers inference, not the Response
API/fine-tuning/agent features.

**Third-party serving is ambiguous** — §2.1 licenses "solely for your personal
use or internal business purposes", which does not affirmatively authorise
serving external customers. Resale is explicitly barred (§2.2(e)), as is
transferring API keys (§2.2(d)).

Serverless prices (Standard, $/1M in→out): DeepSeek V4 Flash $0.22→$0.66; DeepSeek
V4 Pro $1.32→$3.96; Qwen 3.8 Max $2.00→$6.00; Kimi K2.6 $0.95→$4.00; GPT-OSS 120B
$0.15→$0.60; GLM 5.3 $1.40→$4.40. Structural discounts: batch at 50%, cached input
at 50%. Note GPU rental prices **rose today** (H100/H200 $7→$8/hr, B200
$10→$13/hr) — irrelevant to serverless but worth knowing if we ever rent.

## 14. Mistral — workbook governs; three gap-fills

Terms analysis was deliberately skipped (workbook §"Pool 4" has it, verdict
NEEDS-HUMAN-REVIEW on a training contradiction). Three facts changed since:

**"Experiment" appears to be retired as a name.** Current docs call it **"Free
mode"** — "Free mode lets you create API keys and use included monthly usage
within the limits shown on the Limits page." The word "Experiment" does not
appear in current docs, and the `/tier` doc slugs now redirect to
`/admin/billing-usage/usage-limits`. Whether "Mistral Studio" is the renamed La
Plateforme is **UNCLEAR**.

**Exact free-tier rate limits are no longer published.** The docs define only the
shape and direct you to `https://admin.mistral.ai/plateforme/limits` — your own
account. Community figures ("1 req/sec, 500K TPM, ~1B tokens/month") are
`[SECONDARY]` and uncorroborated. **The workbook's Mistral row cannot get a
`limit`/`window`/`unit` triple from public docs either.**

**A recurring monthly credit now exists, which is new and structurally
interesting.** The pricing page shows the **Free plan carrying "$10 /mo in API
credits"**, with paid tiers showing $30/mo and $15/mo lines (UNCLEAR which maps
to which — likely an annual/monthly toggle inside the same Pro block). This is
neither a free allowance nor a one-time signup credit; it is a **recurring
grant**, and it is the only one of its kind in this document. Historically Le Chat
Pro and API billing were independent; these lines appear to change that. Verify
in-console before relying on it.

Two `$0` models on the API pricing page: `labs-leanstral-2603` (free during
limited Labs phase) and `mistral-moderation-2603`. Structural discounts: cached
input **−90%**, batch **half price**.

**Compat:** OpenAI-shaped at `https://api.mistral.ai/v1` — though Mistral does not
itself brand it "OpenAI-compatible" and publishes no compatibility page.
**No Anthropic endpoint**; no `/v1/messages` is documented anywhere.

**Adapter status: none.** Mistral is a workbook pool under review with no adapter
in `packages/ai/providers/`. Worth flagging even though it is not new research.

## 15. DeepInfra — BYOK lane only

**No free allowance, confirmed on the vendor's own page:** "You have to add a card
or pre-pay or you won't be able to use our services"
(<https://deepinfra.com/pricing>). This directly contradicts `[SECONDARY]`
aggregators claiming a "$5 free credit, no card required" — that claim could not
be verified on any current primary page and likely describes a lapsed promotion.

**DeepStart** (<https://deepinfra.com/deepstart>) offers 1B tokens at DeepSeek
V3.1 prices, but it is a selective startup-application program (must have raised
$250K–$10M, founded under 2 years) — an application-gated grant, not a signup
credit.

**Compat:** OpenAI at `https://api.deepinfra.com/v1/openai`; **Anthropic-protocol
at `https://api.deepinfra.com/anthropic`** (no `/v1`). An important nuance: that
endpoint serves **DeepInfra's own open-source models over the Anthropic wire
protocol** — "You are running open-source models via the Anthropic protocol, not
Anthropic's Claude models." Separately DeepInfra also resells real
`anthropic/claude-*` models (claude-opus-4-8 at $5.00/$25.00) reachable via the
OpenAI-compat endpoint. Two distinct features; do not conflate.

**Training excluded:** "We will not store, sell, or train using this data unless
we have your explicit consent."

**Hard-stop is partly UNCLEAR** — the ToS confirms postpaid card billing ("At the
end of each billing period, DeepInfra will charge your credit-card on file for
all usages"), but behaviour when a _prepaid_ balance hits $0 is not documented.

**Constraint relevant to any resale-shaped design:** §11(a)(viii) forbids making
the Services available to third parties "except as expressly permitted under this
Agreement or the applicable Service Order" — plain self-serve terms likely require
a negotiated Service Order for third-party serving.

## 16. Tencent Hunyuan — BYOK-recommend; pool pass not attempted

**Usable internationally, and this is the surprise on the CN-intl axis.**
Tencent Cloud International's own account docs state individuals can complete
real-name verification with "a valid ID card, passport, driver's license, or work
permit issued by a government authority in the jurisdiction where the account is
registered", and companies with home-jurisdiction business registration
(<https://www.tencentcloud.com/document/product/378/10495>). That is a genuine
first-party foreign-ID path, not a workaround — the thing Baidu never built.

**Free grant: TokenHub.** New primary accounts get up to **1M free tokens per
model** from a shared pool, valid **90 days** from claim, via the console or
auto-granted on first API call; **the promo runs through 2026-12-31**
(<https://www.tencentcloud.com/techpedia/144120>,
<https://www.tencentcloud.com/techpedia/145748>). TokenHub is Tencent's unified
gateway routing to Hunyuan/Hy3 plus 14+ other vendors' models under one key. A
lower-quality aggregator claims "1M tokens/year, 12-month validity" — treat
Tencent's own 90-day figure as authoritative.

**Compat:** OpenAI-compatible, two paths — direct
`https://api.hunyuan.cloud.tencent.com/v1`, or the unified gateway
`https://api.tencentcloud.com/tokenhub/v1` (model id `hunyuan-hy3`). **No
Anthropic endpoint found.**

**Open weights as an alternative path:** the current flagship **Hy3** (295B MoE,
21B active) was released 2026-07-06 under **Apache 2.0 with no geographic
carve-out**. Older Hunyuan weights (Hunyuan-Large, HunyuanVideo, the April Hy3
preview) ship under the restrictive Tencent Hunyuan Community License, whose text
states verbatim "**THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION,
UNITED KINGDOM AND SOUTH KOREA**" and requires a separate grant above 100M MAU.
That is a **self-hosted weight restriction, not an API restriction** — it does
not block hosted-API use from the EU/UK/Korea and does not touch the current
Apache-2.0 Hy3 at all.

**No five-column pass was attempted** (the brief scoped these two to an
availability paragraph). If the founder wants Hunyuan as a pool candidate, it
needs the full workbook treatment — the free grant is a 90-day expiring credit
anyway, which makes it traction fuel rather than pool capacity.

## 17. Baidu ERNIE — SKIP direct; reach via open weights

**Not realistically usable directly.** The deciding fact: Baidu's own
international portal `intl.cloud.baidu.com` lists only IaaS products — **it does
not offer Qianfan or ERNIE at all**. The generative-AI platform lives solely on
the domestic `cloud.baidu.com` / `console.bce.baidu.com`, which mandates
real-name verification before an API key (`bce-v3/ALTAK-...`) can be issued.
Sources disagree on severity: one guide says a Chinese ID is required for full
access; another `[SECONDARY]` says international developers can use email signup
with a mainland phone needed only for enterprise features. No firsthand account
of a non-Chinese company completing onboarding was found. Baidu built no
first-party foreign-ID front door for this product, unlike Tencent.

**A free tier exists but its shape is inconsistently reported** — "permanently
free, unlimited tokens" on ERNIE-Speed-8K / ERNIE-Lite-8K with 50–300 RPM caps,
versus "1M tokens per model, 3-month validity", from two different `[SECONDARY]`
aggregators. Treat "a free tier exists" as solid and the terms as UNCLEAR.

**The clean path is open weights.** Baidu open-sourced the full ERNIE 4.5 family
(0.3B through the 300B-A47B MoE flagship) on 2025-06-30 under **Apache 2.0 with
no geographic carve-out**. It is served internationally by **Novita**
($0.28/$0.90 per M), **SiliconFlow** ($0.29/$1.15) and **OpenRouter**. Since
Novita is already a pool candidate with an adapter gap we intend to close, ERNIE
arrives for free as a catalogue entry there.

OpenAI-compatible base URL, for the record: `https://qianfan.baidubce.com/v2` —
note `/v2`, not `/v1`. No Anthropic endpoint.

## 18. SiliconFlow (international) — SKIP

Technically fine, legally hostile, and without the free tier everyone says it
has.

**No free allowance on the international site.** The `.com` model page for
Qwen3-8B — the model most widely reported as "permanently free" — shows **$0.06/M
in and out**. The `.com` pricing page lists no `$0` LLM; the cheapest is
Qwen3.5-9B at $0.10/$0.15. The circulating free-model lists are **`.cn` claims
from affiliate sites** and are contradicted by the primary `.com` page. The `.com`
and `.cn` sites are **two different corporate entities** — SILICONFLOW TECHNOLOGY
PTE. LTD. (Singapore) versus 北京硅基流动科技股份有限公司 — not two domains of one
company.

**Signup credit: $1**, stated verbatim on the pricing page ("plus $1 in free
credits to get you started"). No expiry stated. The ¥14/¥16 figure in circulation
is the mainland grant.

**The terms are disqualifying.** From
<https://docs.siliconflow.com/en/legals/terms-of-service>:

- 3.4(p): "use the Platform or Services for **any commercial purposes**…"
- 3.4(e): "make the Platform, Services or the Documentation… available to, or use
  [them] **for the benefit of anyone other than yourself**"
- 3.4(f): "rent, lease, lend, sell, resell, sublicense, assign, distribute…
  or include the Platform or Services in a **service bureau**, time-sharing, or
  outsourcing offering"
- 3.4(j): bars accessing the Services "in order to build a competitive product"

Clause 3.4(p) is almost certainly boilerplate imported from a consumer-website
template — it would make the entire paid product unusable if enforced literally —
but it is the operative text, and 3.4(e)/(f) reinforce rather than contradict it.
**UNCLEAR: no separate commercial or API-specific agreement was found that would
supersede clause 3.4.** Clause 2.1 also grants a licence "to access and use the
Platform and Services for in Singapore" (sic), which read literally is a
Singapore-only territorial licence.

Training _is_ excluded by default (7.4), and both compat endpoints exist and are
live (`https://api.siliconflow.com/v1`, and Anthropic at
`https://api.siliconflow.com/` with Messages at `/v1/messages` — probed, returns
401 not 404). None of that rescues 3.4(e) and (p).

**If SiliconFlow ever matters to us, get written confirmation first.** Until then
it is a skip in every lane.

## 19. GitHub Models — RETIRED, remove from plans

Verified dead by live probe on 2026-09-01:

- `POST https://models.github.ai/inference/chat/completions` → **HTTP 410**, body
  `{"error":{"code":"github_models_retirement_brownout",...}}`
- `GET https://models.github.ai/catalog/models` → **HTTP 410**
- `models.inference.ai.azure.com` → **DNS NXDOMAIN**

Three-stage retirement on GitHub's own changelog: 2026-06-16 closed to new
customers; 2026-07-01 announced the end date; **2026-07-30 completed** — "GitHub
Models is now retired. The playground, model catalog, inference API, and bring
your own key (BYOK) are no longer available to any customer, including existing
customers with active usage." The Models section has been deleted from the Terms
for Additional Products and Features. Successor named by GitHub: **Microsoft
Foundry** (formerly Azure AI Foundry) — a different vendor relationship (Azure
subscription, Azure billing) that would need its own evaluation.

**Worth recording anyway, because it settles the question the brief asked:** even
while live, GitHub Models was never viable for us. The binding restriction was in
_Responsible use of GitHub Models_, verbatim: "GitHub Models is designed to allow
for learning, experimentation and proof-of-concept activities. The feature is
subject to various limits… and **is not designed for production use cases.**"
The Models terms section itself was three sentences long and deferred everything
else to "the terms of the company hosting the model and the model license".
Free-tier rate limits were 15 RPM / 150 RPD on the Low tier for a free GitHub
account, with the entire Azure OpenAI o-series and GPT-5 family marked "Not
applicable" below Copilot Pro.

---

# Founder signup queue

Ordered by value per unit of effort. Nothing here is authorized — this is the
recommended order if the founder wants to harvest it.

**Tier 1 — do these first (real free capacity, minimal friction)**

1. **Zhipu z.ai** — no card, no payment method, no KYC documented. Unlocks: three
   permanently-free GLM Flash models, the free rate limits we cannot read from
   public docs, and a live probe of whether a pay-as-you-go key works at
   `api.z.ai/api/anthropic`. **Card: none needed.** If topping up later, use a
   non-3DS card. **Do not buy a Coding Plan** — its terms forbid the use we would
   make of it.
2. **Novita** — Google/GitHub/email sign-in, no KYC, no card to register. Unlocks:
   five free models, 49 Anthropic-addressable models, measured rate limits (which
   are undocumented), and ERNIE/Hunyuan open weights without a Chinese account.
   **Card: only to add balance.** Worth using the $10/$10 referral rather than a
   cold signup.
3. **Tencent Cloud International (TokenHub)** — 1M free tokens per model, 90-day
   validity, promo through **2026-12-31**. **Card: yes, $1 refundable pre-auth**;
   KYC accepts a passport or driver's licence from your own jurisdiction. This is
   the only credible Chinese-hyperscaler path for a non-Chinese company.

**Tier 2 — worth doing, with a specific precaution each**

4. **Alibaba Cloud Model Studio (Singapore region)** — 1M tokens per model, 90
   days. **Card + billing address required**; no ID document needed for Singapore
   resources. **Precaution: enable "Free Quota Only" immediately**, or a verified
   account silently bills overage. Do not register from India (blocked) and do not
   use a virtual card (rejected).
5. **Cerebras** — $5 / 30 days. **Card required before anything works.** Not a
   pool, but the fastest inference in the set and worth having for latency
   benchmarking against our routing assumptions.
6. **Fireworks** — $1, **no card**. Two minutes of effort; enough to validate the
   Anthropic-compat endpoint and the adapter.
7. **Hyperbolic** — free Basic tier, 60 RPM, **no payment at all**. Excluded from
   the pool on terms, but it is the best "try it without a card" surface in the
   document and useful for adapter smoke tests.

**Tier 3 — conditional**

8. **OVHcloud** — $200 / 1 month trial, **card required**. Worth it only if we
   pursue OVHcloud as the cheap paid default route (it has the best contract and
   the cheapest `gpt-oss-120b`), and for the free `Qwen3Guard` moderation models,
   which are useful regardless of who serves the chat turn.
9. **Scaleway** — 1M free tokens, but **KYC + card mandatory and no spend cap
   exists**. Only create this account alongside an application-side token budget.
   Otherwise the free tier is a billing incident waiting to happen.
10. **SambaNova** — free tier reportedly needs no card, but the docs and the
    console contradict each other. Worth one signup attempt purely to resolve
    that contradiction; the 20-requests-per-day ceiling means nothing else
    depends on it.

**Tier 4 — BYOK reference keys only (no free value; create only when building the
adapter)**

11. **Xiaomi MiMo** — overseas payment via Apple Pay / Google Pay / card, personal
    Xiaomi account. Cheapest frontier-ish pricing in the set and the cleanest
    no-training guarantee.
12. **DeepSeek** — self-serve, prepaid; payment rails likely PayPal-mediated
    internationally (`[SECONDARY]`, unconfirmed).
13. **MiniMax** — email-only signup, Stripe payment.
14. **Moonshot Kimi** — **only if someone can pay via WeChat Pay or Alipay**, and
    budget $10 cumulative rather than the $1 minimum to escape the 3 RPM Tier0.

**Do not create:** GitHub Models (retired), SiliconFlow (ToS 3.4(e)/(p)), Baidu
Qianfan (no international path; reach ERNIE via Novita instead).

# Adapter gaps

`packages/ai/providers/` currently holds **18 adapters**: anthropic, deepseek,
factory, google, **groq**, lmstudio, minimax, moonshot, **nvidia**, ollama,
openai, openrouter, perplexity, qwen, **vercel-gateway**, **workers-ai**, xai,
zhipu. The four bolded ones landed during this research — the brief described
them as in flight.

**Already covered** among providers researched here: DeepSeek, MiniMax, Moonshot,
Qwen, Zhipu.

**Missing, and whether `createOpenAICompatAdapter` covers them.** The helper
(`packages/ai/providers/openai/src/compat-adapter.ts:67`) asks for four fields —
identity, auth env var, default endpoint, curated catalog — and "deliberately
exposes no hooks" for vendors needing extra headers, response rewriting or
vendor-only request fields.

| Provider        | Endpoint compat                                    | `createOpenAICompatAdapter` suffices?                                                                                                                                |
| --------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Novita**      | `https://api.novita.ai/openai`                     | **Yes.** Priority — it is a pool candidate.                                                                                                                          |
| **Xiaomi MiMo** | `https://api.xiaomimimo.com/v1`                    | **Yes, with `baseUrlEnvVar`** — see the note below.                                                                                                                  |
| Fireworks       | `https://api.fireworks.ai/inference/v1`            | Yes.                                                                                                                                                                 |
| DeepInfra       | `https://api.deepinfra.com/v1/openai`              | Yes.                                                                                                                                                                 |
| Cerebras        | `https://api.cerebras.ai/v1`                       | Yes.                                                                                                                                                                 |
| SambaNova       | `https://api.sambanova.ai/v1`                      | Yes.                                                                                                                                                                 |
| Hyperbolic      | `https://api.hyperbolic.xyz/v1`                    | Yes. Note docs moved to `hyperbolic.ai`; the API host did not.                                                                                                       |
| OVHcloud        | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` | Yes.                                                                                                                                                                 |
| Scaleway        | `https://api.scaleway.ai/{project_id}/v1`          | Yes, but **omit `defaultBaseUrl`** — the path is account-scoped, exactly the case the spec's comment describes.                                                      |
| Tencent Hunyuan | `https://api.hunyuan.cloud.tencent.com/v1`         | Yes. TokenHub gateway is an alternative base URL.                                                                                                                    |
| Mistral         | `https://api.mistral.ai/v1`                        | Probably — OpenAI-shaped, though Mistral publishes no compatibility page and does not brand it as such. **Worth noting Mistral is a workbook pool with no adapter.** |
| Baidu ERNIE     | `https://qianfan.baidubce.com/v2`                  | Endpoint yes, but `/v2` not `/v1` — verify path construction. Moot given the SKIP verdict.                                                                           |
| SiliconFlow     | `https://api.siliconflow.com/v1`                   | Endpoint yes; moot on terms.                                                                                                                                         |

**MiMo explicitly, per the brief:** yes, `createOpenAICompatAdapter` covers it.
Xiaomi ships a first-party OpenAI-compatible endpoint at
`https://api.xiaomimimo.com/v1` with no bespoke headers documented, so no
hand-written adapter is needed. **One caveat that must shape the spec:** MiMo has
four base URLs that are explicitly not interoperable — pay-as-you-go versus Token
Plan (`tp-` keys, `token-plan-cn.xiaomimimo.com`), and domestic versus overseas
accounts ("Return different Base URLs + Keys based on the region where the
account is located, which are not interoperable"). The spec should therefore set
`baseUrlEnvVar` and treat `defaultBaseUrl` as the overseas pay-as-you-go host
only, rather than assuming one endpoint serves every key.

**Two adapters that would need hand-writing if we want them:** none identified.
Every provider surveyed ships a plain OpenAI-shaped Chat Completions endpoint.

**Anthropic-shaped access is a separate question the helper does not address.**
Eleven providers ship an Anthropic Messages endpoint, but `createOpenAICompatAdapter`
builds an OpenAI-shaped adapter. If we want to route harness traffic over
Anthropic-compat endpoints there is no shared constructor for that yet, and the
deviations are real and vendor-specific: DeepSeek silently ignores six parameters
and downgrades unknown model names; Moonshot restricts `model` to an enum and uses
a non-standard tool-schema dialect; Zhipu and Moonshot both publish only a
one-line "differences exist but compatibility is unaffected" disclaimer. Only
DeepSeek documents its deviations itemised. Budget empirical compatibility testing
per vendor rather than trusting the label.

# Promo entries to model

**First, a finding about the machinery itself.** `promo_expires_at` /
`post_promo_prices` are implemented in `packages/contracts/types/src/model-catalog.ts`
and surfaced through `packages/ai/routing/src/pricing.ts`, but **there are zero
promo entries in any catalog file today** — `models.synced.json`,
`models.curation.json` and `generated/registry.json` all contain no
`promo_expires_at`. Anything below would be the machinery's first real use, so
the first entry should come with a test that exercises the expiry flip against
the live catalog rather than only the synthetic fixture.

**A second finding that constrains what can be modelled.** `pricingSchedule`
resolves at **ISO-day granularity** — `resolveEffectiveModelPricing` calls
`toIsoDay(asOf)` and compares `effectiveFrom <= day <= effectiveUntil`. It can
express a dated promo window. It **cannot express an hour-of-day window.** Three
providers price by time of day:

- DeepSeek — peak 01:00–04:00 and 06:00–10:00 UTC Mon–Fri, off-peak everywhere
  else, peak is 2× off-peak
- Zhipu Coding Plan — peak 14:00–18:00 UTC+8 Mon–Fri (= 06:00–10:00 UTC), off-peak
  consumes credits at 50%
- Xiaomi MiMo — ×0.8 during Beijing 00:00–08:00 (= UTC 16:00–24:00)

Note that DeepSeek's and Zhipu's peak windows **partially coincide** (06:00–10:00
UTC), so a "route to the cheapest provider right now" rule cannot share one clock
across them. Modelling this needs either a new schedule shape with time-of-day
bounds, or an explicit decision to **price everything at peak** — conservative,
never under-estimates, and treats off-peak as unmodelled upside. Recommend the
latter until there is a reason to build the former.

**Entries worth adding, in confidence order.**

| #   | Model                          | Promo                           | `promo_expires_at`                     | `post_promo_prices`         | Confidence                                                                                              |
| --- | ------------------------------ | ------------------------------- | -------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Novita `zai-org/glm-5.3-flash` | −50%: $0.075 in / $0.025 out    | **none stated**                        | $0.15 in / $0.05 out        | **High** — both prices come from the machine-readable catalogue (`price_per_m` vs `origin_price_per_m`) |
| 2   | MiniMax `MiniMax-M3` ≤512K std | "Permanent" −50%: $0.30 / $1.20 | **none stated**                        | $0.60 / $2.40               | **High** on prices, **low** on permanence — "permanent" is the doc's word, not a contract               |
| 3   | z.ai `GLM-5.3-Flash`           | −50%: $0.075 in / $0.25 out     | **2026-09-09T16:00:00Z** (24:00 UTC+8) | **UNKNOWN — not published** | **High** on the date, **blocked** on the post-promo price                                               |
| 4   | Alibaba `qwen3.7-max`          | −50%: $2.5 / $7.5               | **not stated**                         | UNKNOWN                     | Cannot model honestly — labelled "limited-time" with no date                                            |
| 5   | Alibaba `qwen3.7-plus`         | −20%, tiered by context         | **not stated**                         | UNKNOWN                     | Same problem                                                                                            |

**On entry 3, the one with a real deadline:** the discount ends in eight days and
the post-promo price is not published. Setting `promo_expires_at` without
`post_promo_prices` is harmless — `resolveEffectiveModelPricingForInputTokens`
just keeps the base price — but it also achieves nothing. The useful move is to
**re-read the z.ai pricing page on 2026-09-10** and enter both fields once the
post-promo price is observable. Doubling the current price is a guess, not a
citation.

**On entries 1 and 2, the undated ones:** an entry with `promo_expires_at: null`
never flips, so the discounted price simply becomes the catalog price with the
list price parked in `post_promo_prices` awaiting a date. That is a correct and
useful state — it records what the undiscounted price would be, which matters if
the promo is withdrawn without notice.

**Not promo entries — do not model these as promos.** Several vendors run
structural discounts that are pricing dimensions, not time-boxed offers:
Fireworks batch −50% and cached input −50%; Scaleway batch −50%; Mistral cached
input −90% and batch half price; DeepSeek's ~30× cache-hit differential, which is
by far the largest single lever in this document and belongs in `cached_input`,
not a promo.

# Re-verification

| Provider                   | Review by      | Why that date                                                            |
| -------------------------- | -------------- | ------------------------------------------------------------------------ |
| **z.ai GLM-5.3-Flash**     | **2026-09-10** | The 50% discount expires 2026-09-09; the post-promo price is unpublished |
| **Zhipu (pool facts)**     | 2026-10-01     | Pool candidate; needs authenticated rate limits and an Anthropic probe   |
| **Novita (pool facts)**    | 2026-10-01     | Pool candidate; needs measured rate limits and a third-party answer      |
| Alibaba Model Studio       | 2026-10-15     | The §III.5 commercial-use ambiguity needs a written answer               |
| Scaleway                   | 2026-10-15     | Recheck whether a spend cap ships; the GTS PDF still needs a human       |
| Tencent TokenHub           | 2026-11-30     | The free-token promo is dated to 2026-12-31                              |
| MiniMax M3 "permanent" 50% | 2026-11-30     | Recheck whether "permanent" survived                                     |
| DeepSeek / Xiaomi / Kimi   | 2026-11-30     | Pricing-only rows; no pool exposure                                      |
| Everything else            | 2026-11-30     | Skipped or excluded; recheck in case a terms change reopens one          |

All dates are within 90 days of 2026-09-01, matching the workbook's convention. A
row whose review date has passed is stale, not renewable.

# Sign-off

This section is intentionally blank. Filling it in is a human act. No provider
below may be added to `apps/web/config/free-pools.json` on the strength of this
document — the two candidates must go through the workbook's five-column process
first, and `verifiedAtMs` stays `null` until a human sets it.

- Founder: \***\*\*\*\*\***\_\_\***\*\*\*\*\*** Date: \***\*\_\_\*\***
- Counsel (candidates only): \***\*\*\*\*\***\_\_\***\*\*\*\*\*** Date: \***\*\_\_\*\***

---

## Addendum: live QwenCloud account observation (2026-09-01)

Status: OBSERVED — founder-supplied console screenshot, not doc research.
Evidence: `docs/research/evidence/provider-accounts/qwencloud-benefits-2026-09-01.png`

The founder already holds a QwenCloud (Alibaba international) account, so the
signup-queue Tier 2 item is DONE. Observed on the Benefits page at capture:

- **266 eligible models with free quota**; 0 expiring within 7 days; 2
  unavailable in the last 180 days. Most text models carry **1M free tokens
  each**, expirations clustering around 2026-10-21 (~50 days remaining);
  media models are quotaed in seconds/images/chars.
- **QwenCloud hosts third-party frontier models with their own free quotas**:
  deepseek-v4-pro/-0813/-flash, deepseek-v3.2, kimi-k2.7-code, glm-5.2 and
  glm-5.1 each show 1M free tokens — one account and one key reach four
  vendors' models. This consolidates the BYOK story materially.
- **The "Auto-stop when free quota runs out" control exists exactly as this
  matrix hoped** ("survivable only because that switch is ours" — confirmed
  real). At capture it was NOT enabled for all models: only a minority of
  rows show "Free quota only" on. Recorded action for the founder: click
  **Enable all models** before any key from this account is used anywhere.
- Consumption is essentially zero (one qwen3.5-flash row shows 1.3K tokens
  used), so the full allowance is intact.

Lane implications unchanged: the §III.5 output-commerciality ambiguity keeps
Alibaba/QwenCloud at NEEDS-HUMAN-REVIEW for the company pool. With auto-stop
enabled account-wide this becomes the largest single observed free pool in
the survey (~266 models × up to 1M tokens each per window) pending that one
terms answer.
