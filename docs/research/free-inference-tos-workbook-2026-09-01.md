# Free inference pools: terms-of-service workbook

Status: DRAFT, pending founder sign-off. Nothing in this document authorizes launch.
Owner: Repository maintainers
Last updated: 2026-09-01

This is S0 of the free-inference lane: the launch gate. It records what each
candidate pool's terms **currently say**, with a citation for every claim, so a
human can decide which pools may ever receive a `FreeEligibility` record. No row
here is approved. No row here has been signed off. `verifiedAtMs` is `null` for
every entry in `apps/web/config/free-pools.json`, which the loader treats as
ineligible, so the accompanying scaffold changes zero runtime behaviour.

Every terms page below was fetched live on **2026-09-01**. Terms pages change
without notice and without a version bump; a citation is a dated observation,
not a standing fact. Re-verify before relying on any row.

## What the four terms facts actually are

The brief for this workbook described the four facts as _commercial use, third-party
serving, prompts excluded from training, hard-stop before paid overage_. That is
**not** the shape the code checks, and the difference matters.

`isFreeEligibilityValid` in `packages/ai/routing/src/runtime-state.ts:227` requires
four booleans on `FreeEligibility.terms`:

| #   | field                         | question                                               |
| --- | ----------------------------- | ------------------------------------------------------ |
| 1   | `commercialUseAllowed`        | does the free tier permit commercial use               |
| 2   | `thirdPartyServingAllowed`    | may we serve third-party end users on it               |
| 3   | `proxyingAllowed`             | does it permit, rather than forbid, proxying/reselling |
| 4   | `promptsExcludedFromTraining` | are prompts kept out of provider training              |

Hard-stop is a **fifth, separate** fact and it does not live on `terms` at all.
it is `QuotaPool.hardStopsBeforePaid`, checked at gate 2 of
`resolveFreeAutoRoute` (`packages/ai/routing/src/free-auto.ts:205`), after the
terms gate. A pool can pass all four terms facts and still be refused for billing
overage, with the distinct reason `no_hard_stop_before_paid`.

So this workbook carries five columns, not four. `proxyingAllowed` is the one the
brief omitted, and it is the column that does the most work below.

## Verdict summary

| Pool                           | 1 commercial | 2 third-party  | 3 proxying | 4 no-training     | 5 hard-stop                                 | Verdict                | Deciding fact                                                                                                              |
| ------------------------------ | ------------ | -------------- | ---------- | ----------------- | ------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Groq free tier                 | yes          | yes            | yes\*      | yes               | yes                                         | **CANDIDATE**          | Only pool where all four terms facts are favorable and cited                                                               |
| Cloudflare Workers AI          | yes          | **UNCLEAR**    | yes\*      | yes               | free plan yes / paid plan **contradictory** | **NEEDS-HUMAN-REVIEW** | No clause either permits or forbids serving third-party end users                                                          |
| Vercel AI Gateway              | yes on Pro   | yes            | yes\*      | **CONTRADICTORY** | yes (auto top-up off by default)            | **NEEDS-HUMAN-REVIEW** | Product docs say "no training"; the Terms put Hobby/trial-Pro content into default-on model training                       |
| Mistral free (Experiment)      | UNCLEAR      | UNCLEAR        | UNCLEAR    | **CONTRADICTORY** | yes (pay-as-you-go is opt-in)               | **NEEDS-HUMAN-REVIEW** | Mistral's docs, privacy policy and help centre disagree with each other on training                                        |
| OpenRouter `:free`             | yes          | yes            | yes\*      | **no**            | yes                                         | **EXCLUDED**           | `promptsExcludedFromTraining`, `data_collection` defaults to `allow`                                                       |
| Google AI Studio / Gemini free | yes          | yes (inferred) | UNCLEAR    | **no**            | yes                                         | **EXCLUDED**           | `promptsExcludedFromTraining`, unpaid tier is explicitly used to improve products, human reviewers read it                 |
| NVIDIA build.nvidia.com        | **no**       | **no**         | **no**     | **no**            | yes                                         | **EXCLUDED**           | `commercialUseAllowed`, "you may only use the API Service for internal testing and evaluation purposes, not in production" |
| Together AI                    | UNCLEAR      | UNCLEAR        | **no**     | UNCLEAR           | UNCLEAR                                     | **EXCLUDED**           | `proxyingAllowed`, resale/standalone offering explicitly forbidden, and there is barely a free tier to begin with          |

\* **What the asterisk means, and why it is not a rubber stamp.** Every pool marked
`yes*` forbids reselling raw API access while separately permitting you to build a
product on the API. We read `proxyingAllowed: true` as "our intended use is
product-embedding, which is permitted", **not** as "proxying is unrestricted". That
reading is a legal judgement, not a quoted fact, and §"The question this workbook
cannot answer" below explains why it may be the wrong one for our specific
architecture. Counsel must confirm it before any `yes*` becomes a verified record.

One pool of eight is a CANDIDATE. Three need a human. Four are out.

## Pool 1: Groq free tier, CANDIDATE

Review by: **2026-10-01.** Soonest of any pool, because it is the only one we might
act on.

Governing document: GroqCloud Services Agreement,
<https://console.groq.com/docs/legal/services-agreement>, accessed 2026-09-01. The
legal index at <https://console.groq.com/docs/legal> names it "the primary contract
governing your use of GroqCloud" and lists no separate free-tier agreement.

**Allowance.** Per-model rate limits, not a credit or dollar allotment, the Free
plan has no balance concept at all. From
<https://console.groq.com/docs/rate-limits> (accessed 2026-09-01):
`openai/gpt-oss-120b` and `openai/gpt-oss-20b` at 30 RPM / 1,000 RPD / 8,000 TPM /
200,000 TPD; `groq/compound` at 30 RPM / 250 RPD / 70,000 TPM;
`meta-llama/llama-prompt-guard-2-*` at 30 RPM / 14,400 RPD. Limits vary
substantially per model. Widely-circulated blog figures quoting one blanket
"30 RPM / 14,400 RPD / 6,000 TPM" for the whole tier **do not match the primary
source** and must not be used for capacity planning.

**1 commercialUseAllowed, yes.** "Cloud Services and the AI Model Services under
this Agreement are not for consumer use." Free status is a pricing designation
inside the same agreement, "Certain Cloud Services and AI Model Services may be
designated as fee-free", not a separate, use-restricted product.

**2 thirdPartyServingAllowed, yes.** Explicit, §3.1: the right to "use Groq's APIs
to integrate the Cloud Services and AI Model Services into your Customer
Application and to make the Cloud Services and AI Model Services available to End
Users through your Customer Applications." No free-tier carve-out was found.

**3 proxyingAllowed, yes\*, with the standard resale bar.** §3.2: "Customer may
not resell or lease access to its Account." §6.3(c): "sell, resell, sublicense,
transfer, or distribute any of the Cloud Services except as expressly approved by
Groq." Read against §3.1, raw account resale is barred and product-embedding is
granted.

**4 promptsExcludedFromTraining, yes.** §4.2: "Groq is not permitted to use Inputs
or Outputs for training or fine-tuning any AI Model Services or other models,
unless explicitly granted permission or instructed by Customer." The Acceptable Use
& Responsible AI Policy (<https://console.groq.com/docs/legal/ai-policy>, accessed
2026-09-01) contains no free-tier exception to this.

**5 hardStopsBeforePaid, yes.** "When you exceed rate limits, our API returns a
`429 Too Many Requests` HTTP status code"
(<https://console.groq.com/docs/rate-limits>). Structurally, no overage state
exists: "Spending limits are only available on paid plans, not free tier accounts"
(<https://console.groq.com/docs/spend-limits>), and adding a payment method
converts the account from Free to Developer tier outright rather than unlocking
billing on top of the free ceiling
(<https://console.groq.com/docs/billing-faqs>). All accessed 2026-09-01.

**Open items before this can be verified.** Two, both material:

- The self-serve signup click-through was not directly observed. Facts 1 and 4
  rest on the Services Agreement being the document a no-sales-contact email
  signup actually accepts. Confirm by reading the live signup screen.
- Groq is **not in the model registry**. There is no `groq` provider and no Groq
  route among the 36 in `packages/ai/model-registry/generated/registry.json`
  (providers are anthropic, deepseek, google, minimax, moonshot, open_router,
  openai, perplexity, qwen, runway, xai, zhipu). The registry slot is a
  prerequisite, and `apps/web/scripts/check-free-pools.mjs` will fail this entry
  the moment anyone sets `verifiedAtMs` without adding it.

## Pool 2: Cloudflare Workers AI, NEEDS-HUMAN-REVIEW

Review by: **2026-10-15.**

**Allowance.** 10,000 neurons/day free, resetting at 00:00 UTC. "Our free
allocation allows anyone to use a total of 10,000 Neurons per day at no charge.
To use more than 10,000 Neurons per day, you need to sign up for the Workers Paid
plan." A neuron is "our way of measuring AI outputs across different models,
representing the GPU compute needed to perform your request."
<https://developers.cloudflare.com/workers-ai/platform/pricing/> (page reports
last updated 2026-08-28), accessed 2026-09-01. Applying that page's own per-model
rates, 10,000 neurons buys roughly 550k output tokens/day on
`@cf/meta/llama-3.2-1b-instruct` or ~287k on `llama-3.1-8b-instruct-fp8-fast`.
that arithmetic is ours, not Cloudflare's. Rate limits are 300 RPM default for
text generation, 20 RPM per account per model for frontier models
(<https://developers.cloudflare.com/workers-ai/platform/limits/>, accessed
2026-09-01).

**1 commercialUseAllowed, yes, with a model-licence pass-through.** No
non-commercial or evaluation-only restriction appears in the Self-Serve
Subscription Agreement or any Workers AI doc. But: "Cloudflare neither creates nor
trains the AI models made available on Workers AI. The models constitute
Third-Party Services and may be subject to open source or other license terms that
apply between you and the model provider."
(<https://developers.cloudflare.com/workers-ai/platform/data-usage/>, accessed
2026-09-01). This is enforced, not advisory, error 5016/403, "User has not agreed
to Llama3.2 model terms"
(<https://developers.cloudflare.com/workers-ai/platform/errors/>). The Llama 3.2
licence permits commercial use but requires a separate Meta licence above 700M
MAU (<https://developer.meta.com/ai/llama3_2/license/>). Per-model licences are our
obligation to track, model by model.

**2 thirdPartyServingAllowed, UNCLEAR. This is the deciding fact.** Nothing in the
Self-Serve Subscription Agreement, the Workers AI docs, or the AI Gateway docs
permits or forbids serving our own end customers through Workers AI. The nearest
clause is scoped to reselling the service itself (§2.2.1(a), quoted below). Absence
of a prohibition is not a permission, and this pool would carry our users' traffic.

**3 proxyingAllowed, yes\*, by absence rather than by grant.**
<https://www.cloudflare.com/terms/> §2.2.1 forbids: "(a) rent, lease, loan, export,
or sell access to the Services to any third party, or sign up for the Services on
behalf of a third party" and "(j) use the Services to provide a virtual private
network or other similar proxy services." Clause (j) sits in a list aimed at the
edge/CDN network and we read it as not reaching API-level AI intermediation, that
reading is inference. The historical "no non-HTML content" CDN restriction was
searched for and **not found** in the current text.

**4 promptsExcludedFromTraining, yes, and this one is clean.** "Cloudflare does
not use your Customer Content to (1) train any AI models made available on Workers
AI or (2) improve any Cloudflare or third-party services, and would not do so
unless we received your explicit consent."
(<https://developers.cloudflare.com/workers-ai/platform/data-usage/>, accessed
2026-09-01.) Corroborated by <https://www.cloudflare.com/trust-hub/responsible-ai/>:
"We do not use our customers' content to train any LLMs." Note the boundary: via
AI Gateway with your own provider key, the upstream provider's policy governs once
the request leaves Cloudflare, "Your access or use of a Third-Party Product is
solely between you and the applicable Third-Party Product provider"
(cloudflare.com/terms §3).

**5 hardStopsBeforePaid, free plan yes; paid plan contradictory in Cloudflare's
own docs.** Free plan is solid: error 3036/429, "You have used up your daily free
allocation of 10,000 neurons. Please upgrade to Cloudflare's Workers Paid plan if
you would like to continue usage."
(<https://developers.cloudflare.com/workers-ai/platform/errors/>). Paid plan, same
paragraph of the pricing page, two sentences apart: "you will be charged at $0.011
/ 1,000 Neurons for any usage above the free allocation of 10,000 Neurons per day"
versus "All limits reset daily at 00:00 UTC. If you exceed any one of the above
limits, further operations will fail with an error." These cannot both be true. The
billing sentence is the more specific and probably governs, but a pool whose
hard-stop behaviour rests on our reading of a self-contradicting page is exactly
what gate 2 of `resolveFreeAutoRoute` exists to refuse.

## Pool 3: Vercel AI Gateway, NEEDS-HUMAN-REVIEW

Review by: **2026-10-15.**

**Allowance.** "Every Vercel team account gets access to both a free tier and a
paid tier for AI Gateway Credits… The free tier includes a subset of models, not
the full catalog… Your free credits start when you make your first AI Gateway
request… Once you purchase credits, your account transitions to the paid tier and
the monthly free credit no longer applies."
(<https://vercel.com/docs/ai-gateway/pricing>, accessed 2026-09-01.) **No dollar
figure appears anywhere in Vercel's official docs.** The widely-quoted $5/month is
corroborated by third parties and by threads on Vercel's own community forum, but
is not an official statement, do not put a number in a plan without confirming it.
This credit pool is separate from the Pro plan's $20/month infrastructure credit;
AI Gateway is absent from the billable-resources list on
<https://vercel.com/docs/pricing>.

**1 commercialUseAllowed, plan-dependent.** Hobby is **no**: "Hobby teams are
restricted to non-commercial personal use only. All commercial usage of the
platform requires either a Pro or Enterprise plan."
(<https://vercel.com/docs/limits/fair-use-guidelines>, accessed 2026-09-01; same
effect at <https://vercel.com/legal/terms> §4). Pro/Enterprise is yes. Whether the
Hobby restriction reaches free AI Gateway credits specifically is inference from
the Fair Use Guidelines applying "across plans and usage-based resources", no AI
Gateway page says it in those words.

**2 thirdPartyServingAllowed, yes.** <https://vercel.com/legal/ai-product-terms>
§8.3: "You are solely responsible for any application that you offer that interacts
with AI Gateway ('Application') and anyone who interacts with AI Gateway through
your Application must comply with these AI Product Terms." End users reaching the
Gateway through our app are explicitly contemplated.

**3 proxyingAllowed, yes\*, with an explicit service-bureau bar.**
<https://vercel.com/legal/terms> §11: "You will not, directly or indirectly: (i)
sublicense, resell, rent, lease, transfer, assign, or otherwise commercially
exploit or make the Services available to any third party; … (iv) use the Services
for timesharing or service bureau purposes or otherwise for the benefit of a
third-party." Building on the Gateway is fine; passing Gateway access through as a
service is not. See §"The question this workbook cannot answer".

**4 promptsExcludedFromTraining, CONTRADICTORY. This is the deciding fact.** The
product page states, unqualified: "AI Gateway does not use your prompts or
responses for training purposes. Your data is processed solely to fulfill your
requests and is not retained for model improvement."
(<https://vercel.com/docs/ai-gateway/security-and-compliance/disallow-prompt-training>,
accessed 2026-09-01.) The controlling Terms say otherwise:
"if you are on a Hobby plan or trial Pro plan, you agree that we may use Your
Content to train our artificial intelligence ('AI') and machine learning models…
If you are on a paid Pro plan, Model Training is not enabled by default and you may
opt in… You may opt-out of Model Training at any time by adjusting your Team
account settings or by upgrading to an Enterprise plan."
(<https://vercel.com/legal/terms> §3, accessed 2026-09-01.) And the explicit
no-training warranty is scoped to Enterprise only: "Vercel represents and warrants
that it shall not use AI Gateway Customer Content to train or improve…"
(<https://vercel.com/legal/ai-product-terms> §8.4, "Enterprise AI Gateway"). No
equivalent warranty was found for Hobby or Pro. A product page and a contract
disagreeing about training is not something to resolve by picking the friendlier
one; get it in writing.

**5 hardStopsBeforePaid, yes, by default.** Two mechanisms, both documented. Auto
top-up is "disabled by default"; when enabled, "AI Gateway automatically charges
your payment method" (<https://vercel.com/docs/ai-gateway/pricing>). Budgets are
opt-in: "AI Gateway checks every budget in scope before each request and rejects
further requests once a limit is exceeded", returning HTTP 402
`quota_for_entity_exceeded`, though "A budget is a soft cap, not a hard limit. The
check runs at the start of each request, so the request that crosses the limit
still completes"
(<https://vercel.com/docs/ai-gateway/observability-and-spend/budgets>). Net: a card
on file for the Pro subscription does **not** by itself convert exhaustion into
metered billing, that needs the explicit auto top-up toggle. Rate limits exist but
no numbers are published; exceeding them returns 429.

## Pool 4: Mistral free / Experiment tier, NEEDS-HUMAN-REVIEW

Review by: **2026-10-15.**

**Allowance, not publicly documented.** Mistral's own explainer article at
<https://help.mistral.ai/en/articles/455206-how-can-i-try-the-api-for-free-with-the-experiment-plan>
returned HTTP 404 on three attempts (2026-09-01). The docs confirm numbers exist
but keep them behind auth: "Free mode lets you create API keys and use included
monthly usage within the limits shown on the Limits page"
(<https://docs.mistral.ai/admin/billing-usage/usage-limits>), where that page is
`admin.mistral.ai/plateforme/limits`. Secondary sources consistently report 500k
TPM per model, 1B tokens/month, ~1 RPS, phone verification instead of a card.
unconfirmed against Mistral's own text.

**1 commercialUseAllowed, UNCLEAR.** No clause bars commercial use of the free
tier; only descriptive framing: "Free mode (the default) has the lowest limits,
intended for evaluation and prototyping."
(<https://help.mistral.ai/en/articles/698531-why-am-i-hitting-api-rate-limits-and-how-do-i-increase-them>,
accessed 2026-09-01.) "Intended for" reads as guidance rather than a prohibition,
which is precisely why it is UNCLEAR rather than no.

**2 thirdPartyServingAllowed, UNCLEAR.** The Commercial Terms define "Customer
Offering" as "Customer's own products and services that it makes available to third
parties which involve use of the Mistral AI Products", contemplating third-party
serving in general (<https://legal.mistral.ai/terms/commercial-terms-of-service>),
but nothing ties that to the free tier.

**3 proxyingAllowed, UNCLEAR.** §2.2(h) bars "buy[ing], sell[ing], or
transfer[ring] API keys or any type of Mistral AI account from, to, or with a third
party", clear on account resale. §2.2(i) bars unauthorised integration but as
fetched is scoped to the "Vibe" product. No general anti-proxy clause covering API
output was found.

**4 promptsExcludedFromTraining, CONTRADICTORY across three Mistral-owned pages.
This is the deciding fact.** Docs: "data sent through the API isn't used for model
training" (<https://docs.mistral.ai/admin/monitor-comply/privacy-data-controls>).
Privacy policy: lists "Your Input and Output, subject to your opt-out" among data
used to train models, and describes "a user control which allows you to object to
the use of your input and output data for model training"
(<https://legal.mistral.ai/terms/privacy-policy>). Help centre, framing it as
default-on: users must "disable the toggle to prevent API calls and related data
from being used to improve Mistral's services"
(<https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training>).
All accessed 2026-09-01. An unqualified "isn't used" and an opt-out toggle cannot
both describe the same default. Verify the live toggle default in a real account
before treating this either way.

**5 hardStopsBeforePaid, yes, conditionally.** "If pay-as-you-go is enabled,
additional usage is billed per token. If it is not enabled, usage can stop until
the next billing period or until an admin changes the settings."
(<https://docs.mistral.ai/admin/billing-usage/subscriptions>, accessed 2026-09-01.)
Enabling pay-as-you-go is a distinct admin action; whether merely adding a card
auto-enables it was not confirmed.

## Pool 5: OpenRouter `:free` variants, EXCLUDED

Review by: **2026-11-30.** Excluded on fact 4.

**Allowance.** 20 RPM throughout; 50 RPD under $10 lifetime credits purchased,
1,000 RPD at or above it. "On free variants, purchase at least 10 credits to raise
your daily limit, or switch to the paid variant of the model, which has no
platform-level request cap."
(<https://openrouter.ai/docs/api-reference/limits>, accessed 2026-09-01.)

**1 commercialUseAllowed, yes.** The Terms (<https://openrouter.ai/terms>,
accessed 2026-09-01) contain **zero occurrences of the word "free"** and impose no
non-commercial restriction; §10.2 contemplates organizations using the Service "for
commercial, for-profit purposes". Several third-party blogs describe the free tier
as prototyping-only; that language **is not in OpenRouter's terms** and should not
be cited as if it were.

**2 thirdPartyServingAllowed, yes.** §5.2: "You will require that all of your
Authorized Users and customers access and use the Service and Models only in
accordance with this Agreement."

**3 proxyingAllowed, yes\*.** §7 forbids "access[ing] the Site or Service for
purposes of reselling API access to Models or otherwise developing a competing
service"; §7(14) forbids "Sell or otherwise transfer the access granted under these
Terms". Product-embedding survives via §5.2.

**4 promptsExcludedFromTraining, NO. This is the deciding fact.** The
`data_collection` routing parameter **defaults to `allow`**, described as "allow
providers which store user data non-transiently and may train on it"; excluding
training requires actively setting `deny`
(<https://openrouter.ai/docs/features/provider-routing>, accessed 2026-09-01).
OpenRouter's own privacy policy is scoped only to itself: "OpenRouter does not use
your Inputs or Outputs for model training", followed by "Some Model Providers may
use your Inputs and Outputs for model training or improvement… We do not control,
and are not responsible for, LLMs' handling of your Inputs."
(<https://openrouter.ai/privacy>.) There are "separate settings for paid and free
models" (<https://openrouter.ai/docs/features/privacy-and-logging>). Community
reports that many `:free` endpoints **require** the training toggle to be on, else
requests fail, are consistent with this design but were not confirmed on an
OpenRouter-owned page. Opt-out-by-default fails the fact as written.

**5 hardStopsBeforePaid, yes.** 429 on cap; the only ways past are a higher free
RPD or manually calling the separate paid model id.

**Registry trap, act on this.** `open_router/openrouter-free` **already exists**
in `packages/ai/model-registry/generated/registry.json`, is `selectable: true`, and
is priced `inputPerMillion: 0, outputPerMillion: 0`. It is exactly the case
`free-auto.ts` was built to refuse: zero in the catalog, not verified free in fact.
It must never receive a `FreeEligibility` record on the strength of its price
fields or its name. Its sibling `open_router/openrouter-auto` is likewise priced at
zero and is a paid meta-router.

Note what this means for the guard: `apps/web/scripts/check-free-pools.mjs` checks
that a route **exists in the registry**, not that its terms are favorable. Verified
against a hand-edited fixture, an entry for `open_router/openrouter-free` passes the
join check silently, because the route is real. The join check is a referential
guard, not a terms guard, the terms gate is this workbook plus human sign-off, and
nothing automated will catch a well-formed entry for an EXCLUDED pool.

## Pool 6: Google AI Studio / Gemini API free tier, EXCLUDED

Review by: **2026-11-30.** Excluded on fact 4.

**Allowance, no longer published.** "Rate limits depend on a variety of factors
(such as your usage tier) and can be viewed in Google AI Studio"
(<https://ai.google.dev/gemini-api/docs/rate-limits>, accessed 2026-09-01), the
real numbers are behind an authenticated dashboard. Third-party figures conflict
with each other and are not cited here. Structure is confirmed: RPM/TPM/RPD across
tiers Free → Tier 1 (billing linked) → Tier 2 (>$100 spend) → Tier 3 (>$1,000).

**1 commercialUseAllowed, yes.** "Use of Google AI Studio and Gemini API is for
developers building with Google AI models for professional or business purposes,
not for consumer use." (<https://ai.google.dev/gemini-api/terms>, accessed
2026-09-01.)

**2 thirdPartyServingAllowed, yes, inferred.** No categorical grant; the terms
assume end-user-facing use ("make API Clients available to users", grounding
clauses referencing "the end user who submitted the prompt"). Inference, not a
quote.

**3 proxyingAllowed, UNCLEAR.** No general anti-resale clause found on the pages
fetched. Explicit: "You may not use the Services to develop models that compete
with the Services". The general Google Terms at policies.google.com were out of
scope and may carry more.

**4 promptsExcludedFromTraining, NO, decisively and by design.** The terms define
the split: "Any Services that are offered free of charge like direct interactions
with Google AI Studio or unpaid quota in Gemini API are unpaid Services." For
unpaid Services: "Google uses the content you submit to the Services and any
generated responses to provide, improve, and develop Google products and services
and machine learning technologies… To help with quality and improve our products,
**human reviewers may read, annotate, and process your API input and output.**" For
paid: "Google doesn't use your prompts… or responses to improve our products."
(<https://ai.google.dev/gemini-api/terms>, accessed 2026-09-01.)

One carve-out worth knowing, because it is the only path by which this pool could
ever return: "If you're in the European Economic Area, Switzerland, or the United
Kingdom, the terms under 'How Google uses Your Data' in 'Paid Services' apply to
all Services… even though they are offered free of charge." A region-gated
eligibility record is conceivable. `FreeEligibility` has no region field today, so
it is not expressible without a schema change, do not attempt it as a workaround.

**5 hardStopsBeforePaid, yes.** Exceeding limits "will trigger a rate limit
error"; paid-tier spend caps return `429 RESOURCE_EXHAUSTED`. One gap: whether a
billing-enabled project auto-upgraded to Tier 1 still gets free AI Studio usage is
not stated on the pages fetched.

## Pool 7: NVIDIA build.nvidia.com / NIM trial credits, EXCLUDED

Review by: **2026-11-30.** Excluded on fact 1, and on facts 2, 3 and 4 as well.

Governing document: NVIDIA API Trial Terms of Service, v. 2025-09-19,
<https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf>,
accessed 2026-09-01. Per the general Technology Access Terms of Use §4, this
product agreement overrides the general site terms.

**Allowance, UNCLEAR on any NVIDIA-authored page.** The contract deliberately
omits numbers: "NVIDIA may extend trial service credits ('Credits') to you… NVIDIA
will deduct Credits based on your usage of the API Services as stated with the
relevant API Service" (§1.4). build.nvidia.com itself would not load (three
attempts, JS-rendered). The commonly cited 1,000 credits at signup / 5,000 with a
business email / ~40 RPM figures are corroborated across third parties and NVIDIA's
own user forums, but forum posts are user-generated, not policy.

**1 commercialUseAllowed, NO. This is the deciding fact.** §1.4: "You must have a
separate service subscription… to use the API Service **in production** or to use
the API Service after you have used your available Credits. **Unless you purchase a
Subscription… you may only use the API Service for internal testing and evaluation
purposes, not in production.**" Reinforced at §1.2: access is "for limited trial
purposes only and without use of the API Service or Generated Content in
production."

**2 thirdPartyServingAllowed, NO.** §4.2: "you may not copy, sell, rent,
sublicense, transfer or distribute or make available to others any portion of the
API Service or Generated Content."

**3 proxyingAllowed, NO.** Same §4.2, plus §4.12: "You will not use (or allow
others to use) the API Service including Generated Content to develop or improve
products or services that compete with the API Service."

**4 promptsExcludedFromTraining, NO.** §3.3: NVIDIA collects "User Content and
Generated Content to improve NVIDIA products and services, including AI models."
There is a genuine tension with §2.3 ("NVIDIA will not store or use User Content or
Generated Content at the end of each API Service session"), but §3.3 is the more
specific statement on training and it is unfavorable.

**5 hardStopsBeforePaid, yes.** Prepaid credits requiring an affirmative
Subscription purchase to continue; no auto-billing clause exists. Consistent with
the 402 "Cloud credits expired" reports on NVIDIA's forums.

This is the cleanest exclusion in the set: four unfavorable terms facts, all
directly quoted from the controlling agreement.

## Pool 8: Together AI, EXCLUDED

Review by: **2026-11-30.** Excluded on fact 3, and for lacking a real free tier.

**Threshold finding.** Together AI does not currently run a documented broad free
tier. The only confirmed $0.00 offering on <https://www.together.ai/pricing>
(accessed 2026-09-01) is a single model, `Prism-ML/Ternary-Bonsai-27B`. Third-party
claims of $5–$50 signup credits contradict each other, and none were confirmed on a
Together-owned page. There is not enough of an allowance here to be worth the
diligence.

**3 proxyingAllowed, NO. This is the deciding fact.**
<https://www.together.ai/terms-of-service> (accessed 2026-09-01) forbids:
"transfer, distribute, resell, lease, license, or assign the Services or otherwise
offer the Services on a standalone basis."

**4 promptsExcludedFromTraining, UNCLEAR, self-contradictory.** The privacy policy
implies training is the default absent zero-data-retention: "Under ZDR, the content
you submit… are not stored, retained, or used for model training"
(<https://www.together.ai/privacy>). The docs assert the opposite default:
"Together does not store inputs or outputs by default, i.e. it supports zero data
retention (ZDR)" and "Data sharing for training other models is opt-in and not
enabled by default" (<https://docs.together.ai/docs/privacy-and-security>). Note
also that a no-card account may be unable to change these settings at all: "If your
organization is on the Limited tier, add a payment method before updating these
settings."

Facts 1, 2 and 5 are UNCLEAR and were not pursued once fact 3 decided the verdict.

## The question this workbook cannot answer

Every pool above draws the same line: **reselling raw API access is forbidden;
building a product on the API is permitted.** We have recorded `proxyingAllowed:
yes*` wherever that line appears, on the reading that we are the second thing.

That reading deserves scrutiny, because the free-inference lane has a shape that
sits closer to the line than a normal product does:

- **One company account, many end users.** These allowances are metered per
  account. Routing many free-tier users' traffic through one company credential is
  not obviously "our application using the API"; it is closer to what Vercel's §11
  calls "service bureau purposes or otherwise for the benefit of a third-party".
  The distinction that matters to a provider is whether their per-account limit is
  functioning as intended.
- **Free-to-free.** We would be serving users who pay us nothing, using capacity a
  provider gave away expecting a developer to evaluate their product. No clause
  quoted above forbids that. It is also plainly not what the allowance is for, and
  "not what it is for" is how terms get rewritten.
- **The alternative shape.** If each end user brought their own free-tier
  credential (BYOK against their own account), most of this ambiguity disappears.
  the per-account limit meters the person it was meant to meter. That is a product
  decision, not a legal one, but it is the variant counsel is most likely to be
  comfortable with, and it is worth putting in front of them alongside the
  pooled-credential design rather than after it.

Multi-account rotation to evade per-account limits is out by definition and is not
analysed here: it fails `proxyingAllowed` and is the archetype of
`terms_incompatible`.

**Recommendation to the founder:** do not treat Groq's CANDIDATE verdict as
"Groq is cleared". Treat it as "Groq is the only pool where the remaining question
is the architectural one above, rather than a defect in the terms themselves."

## What has to be true before any of this ships

1. Counsel answers the pooled-credential question in §"The question this workbook
   cannot answer". It applies to every pool at once; answering it per-pool is waste.
2. For Groq specifically: read the live self-serve signup click-through, and add a
   `groq` provider plus routes to the model registry.
3. For Cloudflare: get a written answer on third-party serving, and on which of the
   two contradicting sentences governs paid-plan overage.
4. For Vercel: get written confirmation of which document governs training on the
   free tier, the product page or §3 of the Terms.
5. For Mistral: log into a real account and observe the training toggle's default.
6. Only then does anyone set `verifiedAtMs` and `reviewedBy` on an entry in
   `apps/web/config/free-pools.json`. Setting either without the other keeps the
   entry ineligible, by design.

## Re-verification

| Pool                  | Review by  | Why that date                                              |
| --------------------- | ---------- | ---------------------------------------------------------- |
| Groq                  | 2026-10-01 | The only CANDIDATE; the one we might act on                |
| Cloudflare Workers AI | 2026-10-15 | Two open questions with Cloudflare                         |
| Vercel AI Gateway     | 2026-10-15 | Documented contradiction to resolve                        |
| Mistral free          | 2026-10-15 | Needs live-account observation                             |
| OpenRouter `:free`    | 2026-11-30 | Excluded; recheck in case the default flips                |
| Google AI Studio      | 2026-11-30 | Excluded; recheck the EEA/UK/CH carve-out                  |
| NVIDIA                | 2026-11-30 | Excluded on explicit contract language; unlikely to change |
| Together AI           | 2026-11-30 | Excluded; recheck if a real free tier appears              |

All dates are within 90 days of 2026-09-01. A record whose review date has passed
must be re-verified, not renewed, `expiresAtMs` exists so that a stale record
fails closed as `verification_expired` rather than continuing to vouch for terms
nobody has read this quarter.

## Sign-off

This section is intentionally blank. Filling it in is a human act.

- Founder: \***\*\*\*\*\***\_\_\***\*\*\*\*\*** Date: \***\*\_\_\*\***
- Counsel: \***\*\*\*\*\***\_\_\***\*\*\*\*\*** Date: \***\*\_\_\*\***
