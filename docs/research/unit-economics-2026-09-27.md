# Unit economics per user profile, in credits

Status: Current calculation snapshot
Owner: Billing
Last updated: 2026-09-27

The calculations below describe the September 27 catalogs and assumptions. Run
the script again against the current executable catalogs before using a number
for pricing, cost, launch, or capacity decisions. Paid checkout is still behind
the waitlist.

This reruns `docs/research/unit-economics-2026-09-05.md` on the credit model.
The script keeps its original name, `scripts/research/unit-economics-2026-09-05.mjs`:
no repository rule ties a script's name to the date it is run, and the
September 5 document cites it by that name. Run
`node scripts/research/unit-economics-2026-09-05.mjs`; the last section of this
page is its complete output on this date. Routing slots are named below, model
ids are not.

## What changed since September 5

- **The credit.** 1 credit is 5,000 microUSD of provider cost
  (`packages/contracts/types/src/credits.ts`). A profile's credits are its
  provider cost divided by that, set against the plan's monthly credits in
  `packages/contracts/types/src/managed-usage-limits.ts`. The ledger-cent
  ceiling of September 5 is gone.
- **One rate card.** Search, Places, sandbox, hosted code execution and
  infrastructure rates come from `packages/contracts/types/src/rate-card.ts`.
  The script imports the contract modules themselves rather than matching their
  text, so a changed price changes the result and a removed one stops the run.
- **Sandbox memory.** A sandbox minute now pays for memory as well as vCPU,
  $0.0028 at the default 2 vCPU and 4 GiB.
- **Browser minutes cost us nothing.** Every browser path drives the user's own
  Chrome, desktop app or CLI, so the browser minutes in two profiles carry no
  compute cost. The profiles keep them as documented.
- **Basic routes on its own slots.** The router no longer folds Basic into Free.
- **Infrastructure.** Each profile carries its per-use infrastructure rows plus
  a share of the monthly platform fees, at an assumed 1,000 active accounts.
- **Plan margins.** A per-plan table sets the worst case, the whole monthly
  allowance spent, beside the modeled profiles at list price.

Profile quantities and their reasoning are unchanged. Provider cost per profile
moved by less than $0.70 from September 5.

## What the numbers say

**Ordinary use is comfortably profitable.** Eight of the nine profiles keep
between 59.5% and 98.4% gross margin at list price. The ninth, Automated or
abusive, runs past its allowance at 112.6% of Max 20x's 20,000 credits; the
monthly window stops it at 20,000, so the plan carries $100 of it and keeps 49.6%.

**The worst case sits on the 50% line.** With every monthly credit spent, the
allowance at provider cost is exactly half the price of Pro, Max 5x and Max 20x,
and the platform fee share takes them to between 49.5% and 50.0%. Basic keeps
70.1% and Team 59.6%.

**Included search is the largest exposure.** Paid plans include 300 interactive
search calls a month that draw no credits
(`apps/web/lib/web-search/search-budget.ts`). At the grounding rate that is up
to $4.20 of provider cost per account on top of a spent allowance: Basic's worst
case falls from 70.1% to 10.1% and Pro's from 49.5% to 28.5%, while Max 5x and
Max 20x lose 2 to 4 points. The same rule means a search-heavy profile draws
fewer credits than its cost suggests. Research heavy's 1,394 credits overstate
what it draws, because most of its 410 calls fall inside the included 300.

**Billing channel and interval matter more than infrastructure.** Yearly Pro at
$200 leaves 39.5% at the worst case. The App Store's 30% first-year commission
leaves about 20% on Pro, Max 5x and Max 20x, and 40.1% on Basic. Infrastructure
is small by comparison: $91 a month of platform fees is $0.09 per account at
1,000 active accounts and $0.91 at 100, and no profile's per-use rows pass $0.65.

**Not in these margins.** Payment processing is recorded per transaction from
Stripe rather than held as a rate. At Stripe's listed 2.9% plus 30 cents for a
domestic card (`docs/research/infrastructure-unit-costs-2026-09-27.md`) it
would take about $0.50 a month off Basic and $0.88 off Pro. The rolling 5-hour
and weekly windows and the flagship weekly share are not modeled; each can only
lower what a profile is served.

**Assumptions to confirm.** The 1,000 active accounts; the per-use infrastructure
footprint (0.1 compute-unit seconds and 10 cache commands a turn, 1.5 MiB an
image, 1 MiB a video second); and whether 300 included searches are intended on
Basic, where they can cost more than half the price.

## Script output

Every price is read when the script runs: credits from packages/contracts/types/src/credits.ts, plan allowances from packages/contracts/types/src/managed-usage-limits.ts, tool, media, search, sandbox and infrastructure rates from packages/contracts/types/src/rate-card.ts, plan prices and capability gates from packages/contracts/types/src/billing-catalog.ts, store commission from packages/contracts/types/src/mobile-iap.ts, and model token prices and routing policy from packages/ai/model-registry/generated/registry.json. The cache-write premium (1.25x) is read from apps/web/lib/services/llm-cost-calculator.ts and the included search allowance (300 calls) from apps/web/lib/web-search/search-budget.ts. Rate card figures are the published ones; deployment overrides are not applied.

1 credit = 5,000 microUSD of provider cost, so a profile's credits are its provider COGS divided by 5,000 microUSD, before the per-action round-up to 0.01 credit. Usage quantities (turns, tokens, tool calls per profile) are this script's own assumptions, because no profile like these is metered yet; each is printed with its reasoning.

### Assumptions

- Active accounts sharing the platform fees: 1,000. An active account is one with a provider cost event or a Free usage reservation in the month; the monthly allocation job divides each vendor's bill by that count. No measured count is in the repository.
- Search calls are priced at the provider rate whether or not they draw credits. Paid plans include 300 interactive search calls a month (web_search_perplexity, web_search_grounding) that draw no credits, so a search-heavy profile's credit count overstates what it draws by up to that many calls.
- Browser minutes are kept in the profiles as documented but carry no platform cost: no rate card row prices them, because every browser path drives the user's own Chrome, desktop app or CLI. The computer-use turns that drive the browser are priced as chat.
- Sandbox minutes run at the default sandbox shape, 2 vCPU and 4 GiB.
- Each task's model is the routing slot the router admits for the plan (auto policy, tier ceiling and allow-list in the registry), priced on that model's default route.
- Not modeled: payment processing fees (recorded per transaction from Stripe, not a rate), the flagship weekly share, the rolling 5-hour and weekly windows, the Google grounding free pool (5,000 requests a month for the whole platform, about 5 per account at 1,000 accounts), and vendor invoices beyond the per-use rows (Neon, R2 and Upstash have no committed monthly fee row).

Per-use infrastructure footprint:

| Per          | Rate card row              | Quantity | Reasoning                                                                                                                              |
| ------------ | -------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| turn         | database_compute_second    | 0.1      | about 20 statements a turn (usage reservation and settlement, message and ledger writes, reads) at about 5 ms of one compute unit each |
| turn         | cache_command_request      | 10       | rate limiter windows and cache reads and writes around one turn                                                                        |
| image        | artifact_storage_gib_month | 0.001465 | a 1.5 MiB image, accrued for one month of storage when it is saved                                                                     |
| image        | network_egress_gib         | 0.001465 | the same image served once through the file route                                                                                      |
| video second | artifact_storage_gib_month | 0.000977 | about 8 Mbit/s of 1080p video, accrued for one month of storage                                                                        |
| video second | network_egress_gib         | 0.000977 | the same video served once through the file route                                                                                      |

### Unit prices

| Rate card row                           | Unit                       | Provider cost | Credits per unit | Source                                                                                                                                                                                                 |
| --------------------------------------- | -------------------------- | ------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| web_search_grounding                    | request                    | $0.0140       | 2.8              | https://ai.google.dev/gemini-api/docs/pricing, verified 2026-09-08                                                                                                                                     |
| web_search_perplexity                   | request                    | $0.0050       | 1                | https://docs.perplexity.ai/getting-started/pricing, verified 2026-09-10                                                                                                                                |
| web_search_anthropic                    | request                    | $0.0100       | 2                | https://platform.claude.com/docs/en/about-claude/pricing, verified 2026-09-27                                                                                                                          |
| web_search_openai                       | request                    | $0.0100       | 2                | https://developers.openai.com/api/docs/pricing, verified 2026-09-27                                                                                                                                    |
| places_text_search                      | request                    | $0.0350       | 7                | https://developers.google.com/maps/billing-and-pricing/pricing, verified 2026-09-05                                                                                                                    |
| hosted_code_execution_openai_session    | session                    | $0.0300       | 6                | https://developers.openai.com/api/docs/pricing, verified 2026-09-27                                                                                                                                    |
| hosted_code_execution_anthropic_hour    | hour                       | $0.0500       | 10               | https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool (an upper bound: the 1,550 free organization hours a month cannot be tracked from one response), verified 2026-09-27 |
| sandbox_vcpu_second, sandbox_gib_second | minute at 2 vCPU and 4 GiB | $0.0028       | 0.55             | https://e2b.dev/pricing, verified 2026-09-27                                                                                                                                                           |
| image_generation slot                   | image                      | $0.0670       | 13.4             | registry route price                                                                                                                                                                                   |
| video_generation slot                   | second at 1080p            | $0.4000       | 80               | registry route price                                                                                                                                                                                   |

### Infrastructure platform fees

| Rate card row                | Vendor | Monthly fee                           |
| ---------------------------- | ------ | ------------------------------------- |
| hosting_platform_month       | vercel | $20.00 a month                        |
| auth_platform_month          | clerk  | $25.00 a month                        |
| auth_active_user_month       | clerk  | $0.02 per active account above 50,000 |
| observability_platform_month | sentry | $26.00 a month                        |
| email_platform_month         | resend | $20.00 a month                        |

At 1,000 active accounts the fees total $91.00 a month, $0.09 per account. Sensitivity: $0.91 per account at 100, $0.01 per account at 10,000.

### Light (Basic, $7.00/month)

Assumption: About one short conversation a day; the entry paid tier, no tool use.

Turns/month: 30, avg input tokens: 500, avg output tokens: 250, cache hit share: 15.0%, cache write share: 10.0%

| Component                             | Monthly cost | Credits |
| ------------------------------------- | ------------ | ------- |
| chat: simple_chat (workhorse_general) | $0.02        | 4.1     |
| chat: coding (coding_fast)            | $0.00        | 0.2     |
| chat: reasoning (reasoning_economy)   | $0.00        | 0.1     |
| retries + gateway overhead (4%)       | $0.00        | 0.2     |
| **Provider COGS**                     | **$0.02**    | **4.5** |

Credits: 4.5 of the plan's 400 monthly credits (1.1%).
Infrastructure: $0.09 (per-use rows $0.00, platform share $0.09).
Gross margin at list price: $6.89 (98.4%).
Prompt caching saves $0.00/month versus no caching; routing saves $0.00/month versus sending every task to the tier's maximum profile.

### Normal (Pro, $20.00/month)

Assumption: About ten turns a day of general chat with occasional coding help, search, and one image a week.

Turns/month: 300, avg input tokens: 1200, avg output tokens: 450, cache hit share: 45.0%, cache write share: 15.0%

| Component                                  | Monthly cost | Credits |
| ------------------------------------------ | ------------ | ------- |
| chat: simple_chat (workhorse_general)      | $0.24        | 48.2    |
| chat: coding (coding_balanced)             | $0.27        | 54.2    |
| chat: reasoning (reasoning_balanced)       | $0.03        | 6.3     |
| chat: research (search_premium)            | $0.07        | 13.3    |
| chat: creative_writing (creative_balanced) | $0.09        | 18.1    |
| retries + gateway overhead (6%)            | $0.04        | 8.4     |
| web search (grounded)                      | $0.28        | 56      |
| web search (fallback provider)             | $0.03        | 5       |
| image generation                           | $0.20        | 40.2    |
| **Provider COGS**                          | **$1.25**    | **250** |

Credits: 250 of the plan's 2,000 monthly credits (12.5%).
Infrastructure: $0.10 (per-use rows $0.01, platform share $0.09).
Gross margin at list price: $18.65 (93.3%).
Prompt caching saves $0.09/month versus no caching; routing saves $1.00/month versus sending every task to the tier's maximum profile.

### Power (Max 5x, $100.00/month)

Assumption: About 40 turns a day, a third of them coding, regular search and occasional sandboxed execution.

Turns/month: 1200, avg input tokens: 2500, avg output tokens: 800, cache hit share: 60.0%, cache write share: 20.0%

| Component                                  | Monthly cost | Credits   |
| ------------------------------------------ | ------------ | --------- |
| chat: simple_chat (workhorse_general)      | $0.98        | 197       |
| chat: coding (flagship_coding)             | $9.49        | 1,899     |
| chat: reasoning (reasoning_balanced)       | $0.33        | 66.6      |
| chat: research (search_premium)            | $0.46        | 92.7      |
| chat: creative_writing (creative_balanced) | $1.27        | 253       |
| retries + gateway overhead (7%)            | $0.88        | 176       |
| web search (grounded)                      | $1.12        | 224       |
| web search (fallback provider)             | $0.05        | 10        |
| sandbox compute                            | $0.25        | 49.7      |
| image generation                           | $0.80        | 161       |
| **Provider COGS**                          | **$15.64**   | **3,129** |

Credits: 3,129 of the plan's 10,000 monthly credits (31.3%).
Infrastructure: $0.13 (per-use rows $0.04, platform share $0.09).
Gross margin at list price: $84.23 (84.2%).
Prompt caching saves $2.87/month versus no caching; routing saves $6.02/month versus sending every task to the tier's maximum profile.

### Research heavy (Pro, $20.00/month)

Assumption: Grounded search dominates the turn mix; long retrieved context keeps cache reuse lower than chat-only usage.

Turns/month: 500, avg input tokens: 3500, avg output tokens: 650, cache hit share: 35.0%, cache write share: 20.0%

| Component                             | Monthly cost | Credits   |
| ------------------------------------- | ------------ | --------- |
| chat: research (search_premium)       | $1.16        | 233       |
| chat: simple_chat (workhorse_general) | $0.29        | 58.6      |
| chat: reasoning (reasoning_balanced)  | $0.21        | 42.4      |
| retries + gateway overhead (6%)       | $0.10        | 20        |
| web search (grounded)                 | $4.90        | 980       |
| web search (fallback provider)        | $0.30        | 60        |
| **Provider COGS**                     | **$6.97**    | **1,394** |

Credits: 1,394 of the plan's 2,000 monthly credits (69.7%).
Infrastructure: $0.10 (per-use rows $0.01, platform share $0.09).
Gross margin at list price: $12.93 (64.6%).
Prompt caching saves $0.30/month versus no caching; routing saves $1.33/month versus sending every task to the tier's maximum profile.

### Coding heavy (Max 5x, $100.00/month)

Assumption: Agentic multi-step coding; large repo context reused across a session drives cache hit rate up, and agent-loop retries push retry share up.

Turns/month: 900, avg input tokens: 6000, avg output tokens: 1100, cache hit share: 70.0%, cache write share: 15.0%

| Component                            | Monthly cost | Credits   |
| ------------------------------------ | ------------ | --------- |
| chat: coding (flagship_coding)       | $25.03       | 5,005     |
| chat: agentic (flagship_general)     | $5.72        | 1,144     |
| chat: reasoning (reasoning_balanced) | $0.26        | 52.3      |
| retries + gateway overhead (12%)     | $3.72        | 744       |
| web search (grounded)                | $0.21        | 42        |
| sandbox compute                      | $1.16        | 232       |
| **Provider COGS**                    | **$36.10**   | **7,220** |

Credits: 7,220 of the plan's 10,000 monthly credits (72.2%).
Infrastructure: $0.11 (per-use rows $0.02, platform share $0.09).
Gross margin at list price: $63.79 (63.8%).
Prompt caching saves $13.87/month versus no caching; routing saves $0.00/month versus sending every task to the tier's maximum profile.

### Desktop agent heavy (Max 20x, $200.00/month)

Assumption: About 150 agent runs a month at roughly 16 model steps each; every run mixes computer-use, code execution and general steps, so both browser and sandbox minutes accrue alongside the chat turns.

Turns/month: 2500, avg input tokens: 3500, avg output tokens: 500, cache hit share: 55.0%, cache write share: 15.0%

| Component                                 | Monthly cost | Credits    |
| ----------------------------------------- | ------------ | ---------- |
| chat: agentic (flagship_general)          | $17.59       | 3,519      |
| chat: computer-use (computer_use_premium) | $21.99       | 4,399      |
| chat: coding (flagship_coding)            | $11.00       | 2,199      |
| retries + gateway overhead (11%)          | $5.56        | 1,113      |
| web search (grounded)                     | $0.56        | 112        |
| sandbox compute                           | $0.83        | 166        |
| **Provider COGS**                         | **$57.54**   | **11,508** |

Credits: 11,508 of the plan's 20,000 monthly credits (57.5%).
Infrastructure: $0.16 (per-use rows $0.07, platform share $0.09).
Gross margin at list price: $142.31 (71.2%).
Prompt caching saves $18.41/month versus no caching; routing saves $0.00/month versus sending every task to the tier's maximum profile.
Browser minutes: 600 assumed, at no platform cost (see assumptions).

### Multimodal heavy (Max 20x, $200.00/month)

Assumption: Image and short-video generation dominate the spend; only max_15x and enterprise are entitled to video generation, so this profile is priced on that tier.

Turns/month: 200, avg input tokens: 1800, avg output tokens: 500, cache hit share: 30.0%, cache write share: 10.0%

| Component                                  | Monthly cost | Credits    |
| ------------------------------------------ | ------------ | ---------- |
| chat: multimodal (multimodal_balanced)     | $0.29        | 57.2       |
| chat: simple_chat (workhorse_general)      | $0.10        | 19.7       |
| chat: creative_writing (creative_balanced) | $0.31        | 61.7       |
| retries + gateway overhead (6%)            | $0.04        | 8.3        |
| image generation                           | $20.10       | 4,020      |
| video generation                           | $60.00       | 12,000     |
| **Provider COGS**                          | **$80.84**   | **16,167** |

Credits: 16,167 of the plan's 20,000 monthly credits (80.8%).
Infrastructure: $0.24 (per-use rows $0.15, platform share $0.09).
Gross margin at list price: $118.93 (59.5%).
Prompt caching saves $0.08/month versus no caching; routing saves $0.89/month versus sending every task to the tier's maximum profile.

### 95th percentile (Max 20x, $200.00/month)

Assumption: Top of the legitimate usage distribution: heavy on every dimension at once, still with realistic cache reuse.

Turns/month: 4000, avg input tokens: 3200, avg output tokens: 750, cache hit share: 60.0%, cache write share: 15.0%

| Component                                  | Monthly cost | Credits    |
| ------------------------------------------ | ------------ | ---------- |
| chat: simple_chat (workhorse_general)      | $2.78        | 556        |
| chat: coding (flagship_coding)             | $26.71       | 5,342      |
| chat: reasoning (reasoning_balanced)       | $1.15        | 230        |
| chat: research (search_premium)            | $2.35        | 470        |
| chat: agentic (flagship_general)           | $8.55        | 1,709      |
| chat: creative_writing (creative_balanced) | $2.14        | 427        |
| retries + gateway overhead (9%)            | $3.93        | 786        |
| web search (grounded)                      | $2.80        | 560        |
| web search (fallback provider)             | $0.15        | 30         |
| sandbox compute                            | $1.10        | 221        |
| image generation                           | $2.68        | 536        |
| video generation                           | $12.00       | 2,400      |
| **Provider COGS**                          | **$66.34**   | **13,267** |

Credits: 13,267 of the plan's 20,000 monthly credits (66.3%).
Infrastructure: $0.22 (per-use rows $0.13, platform share $0.09).
Gross margin at list price: $133.45 (66.7%).
Prompt caching saves $13.00/month versus no caching; routing saves $15.05/month versus sending every task to the tier's maximum profile.
Browser minutes: 120 assumed, at no platform cost (see assumptions).

### Automated or abusive (Max 20x, $200.00/month)

Assumption: Scripted, low-diversity probing: short independent prompts with no session reuse (zero cache hit) and a high retry share from hammering a failing call.

Turns/month: 25000, avg input tokens: 800, avg output tokens: 200, cache hit share: 0.0%, cache write share: 0.0%

| Component                             | Monthly cost | Credits    |
| ------------------------------------- | ------------ | ---------- |
| chat: simple_chat (workhorse_general) | $12.95       | 2,590      |
| chat: coding (flagship_coding)        | $67.50       | 13,500     |
| retries + gateway overhead (40%)      | $32.18       | 6,436      |
| **Provider COGS**                     | **$112.63**  | **22,526** |

Credits: 22,526 of the plan's 20,000 monthly credits (112.6%). The monthly window stops included use at 20,000 credits; the other 2,526 need bonus or purchased credits, so the plan price carries only $100.00.
Infrastructure: $0.75 (per-use rows $0.65, platform share $0.09).
Gross margin at list price: $99.25 (49.6%).
Prompt caching saves $0.00/month versus no caching; routing saves $57.05/month versus sending every task to the tier's maximum profile.

### Summary across profiles

| Profile              | Plan    | Price   | Provider COGS | Credits | Share of monthly credits | Infrastructure | Gross margin at list price |
| -------------------- | ------- | ------- | ------------- | ------- | ------------------------ | -------------- | -------------------------- |
| Light                | Basic   | $7.00   | $0.02         | 4.5     | 1.1%                     | $0.09          | 98.4%                      |
| Normal               | Pro     | $20.00  | $1.25         | 250     | 12.5%                    | $0.10          | 93.3%                      |
| Power                | Max 5x  | $100.00 | $15.64        | 3,129   | 31.3%                    | $0.13          | 84.2%                      |
| Research heavy       | Pro     | $20.00  | $6.97         | 1,394   | 69.7%                    | $0.10          | 64.6%                      |
| Coding heavy         | Max 5x  | $100.00 | $36.10        | 7,220   | 72.2%                    | $0.11          | 63.8%                      |
| Desktop agent heavy  | Max 20x | $200.00 | $57.54        | 11,508  | 57.5%                    | $0.16          | 71.2%                      |
| Multimodal heavy     | Max 20x | $200.00 | $80.84        | 16,167  | 80.8%                    | $0.24          | 59.5%                      |
| 95th percentile      | Max 20x | $200.00 | $66.34        | 13,267  | 66.3%                    | $0.22          | 66.7%                      |
| Automated or abusive | Max 20x | $200.00 | $112.63       | 22,526  | 112.6%                   | $0.75          | 49.6%                      |

### Gross margin per plan

Worst case: the whole monthly allowance spent at $0.005 a credit, plus the platform share at 1,000 active accounts. "With included search" adds the 300 interactive search calls a month that draw no credits, at the dearest included rate ($4.20). "Yearly billing" uses the yearly price spread over 12 months. "App Store, first year" takes 30.0% commission off the list price. Per-use infrastructure rows come to at most $0.65 a month in any modeled profile and are not in the worst case. Margins are shares of the monthly list price, except yearly billing, which is a share of the yearly price per month.

| Plan              | Price   | Monthly credits | Modeled profiles at list price                                                                       | Worst-case cost | Worst-case margin | With included search | Yearly billing | App Store, first year |
| ----------------- | ------- | --------------- | ---------------------------------------------------------------------------------------------------- | --------------- | ----------------- | -------------------- | -------------- | --------------------- |
| Basic (basic)     | $7.00   | 400             | Light 98.4%                                                                                          | $2.09           | 70.1%             | 10.1%                | not offered    | 40.1%                 |
| Pro (pro)         | $20.00  | 2,000           | Normal 93.3%, Research heavy 64.6%                                                                   | $10.09          | 49.5%             | 28.5%                | 39.5%          | 19.5%                 |
| Max 5x (max)      | $100.00 | 10,000          | Power 84.2%, Coding heavy 63.8%                                                                      | $50.09          | 49.9%             | 45.7%                | not offered    | 19.9%                 |
| Max 20x (max_15x) | $200.00 | 20,000          | Desktop agent heavy 71.2%, Multimodal heavy 59.5%, 95th percentile 66.7%, Automated or abusive 49.6% | $100.09         | 50.0%             | 47.9%                | not offered    | 20.0%                 |
| Team (team)       | $25.00  | 2,000           | none modeled                                                                                         | $10.09          | 59.6%             | 42.8%                | 49.5%          | not sold in the store |
