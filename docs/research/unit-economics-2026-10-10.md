# Unit economics per plan, region and channel

Status: Current calculation snapshot
Owner: Billing
Last updated: 2026-10-10

The calculations below describe the October 10 catalogs, prices and
assumptions. Run the script again against the current executable catalogs
before using a number for pricing, cost, launch or capacity decisions.

This reruns `docs/research/unit-economics-2026-09-27.md` and extends it to
regions, payment channels, voice and the owner's decisions of 2026-10-10: one
token-cost budget per plan at a 50% worst-case margin, sized to each channel's
net revenue, with everyday chat on the fast OpenAI family. Run
`node scripts/research/unit-economics-2026-09-05.mjs`; add `--json <file>` for
the full model with every formula and source, and `--params <file>` to replace
any assumption. The script keeps its original name because earlier documents
cite it by that name. It imports only files inside the repository, never a
package entrypoint, because a worktree without `node_modules` resolves
`@agiworkforce/*` to another checkout's copy. The last section of this page is
its complete output on this date. Routing slots are named, model ids are not.

## What changed since September 27

- **Paid plans no longer include free searches.** `includedMonthlySearchCalls`
  in `apps/web/lib/web-search/search-budget.ts` returns 20 for Free and 0 for
  every paid plan, so September's largest exposure (300 searches a month
  outside credits) is gone.
- **Prices.** Individual plans are monthly only. Team is $25 a seat or $240 a
  year; Team Premium is new at $125 a seat or $1,200 a year with 10,000
  credits. India has founder-set monthly prices (Basic INR 399, Pro INR 1,999,
  Max 5x INR 9,999, Max 20x INR 24,999, Team INR 1,999); only Basic and Team
  have INR Stripe price points in `apps/web/lib/pricing.ts`. EEA traffic is
  blocked in production, so EU VAT does not arise.
- **Images cost half.** The image slot now prices at $0.0336 an image, requested
  at 1K.
- **Voice is priced.** The live voice slot costs $0.05 a minute, billed per
  second, and the delegated backend model is billed separately. Plans grant 30,
  300 or unlimited voice minutes. Basic and Team resolve to the same policy as
  Pro, so both get 300 minutes.
- **Free has a platform-funded sandbox.** `FREE_PLATFORM_SANDBOX_DAILY_BUDGET_MICROUSD`
  gives each Free account $1 of sandbox a day outside its credits
  (`apps/web/lib/e2b/compute-metering.ts`).

## What the numbers say

**Every metered feature already draws one credit pool at provider cost.**
Chat on any reachable model, images, video, paid search, deep research,
sandbox, the coding agent, transcription and read-aloud all reserve credits,
and one credit is $0.005 of provider cost. The worst case is therefore the
whole pool plus what sits outside it, whichever model or feature spends the
pool. Long-context pricing tiers are applied by the cost calculator, so a long
prompt cannot undercharge.

**Today the worst case loses money on Basic and Pro.** On the US web price,
with every allowance used in full: Basic -22%, Pro -10%, Max 5x 9%, Max 20x
13%, Team 10% monthly and -10% yearly, Team Premium 27%. India Basic at INR 399
($4.12) is -106%. The first App Store year (30%) makes every individual plan
negative. Three costs outside the pool drive it:

- **Delegated voice backend tokens are not charged on main.** Neither client
  sends the backend usage report, so up to $5.92 a month on Pro and $59.20 on
  Max 20x reaches the provider bill and not the ledger. Commit `369f4443f0` on
  `fix/voice-conversation` fixes this.
- **Paid downloads have no cap.** Only a 120-a-minute rate limit bounds them;
  at Free's 500 MiB a day they cost $3.35 a month, nearly half of Basic's net
  revenue.
- **Saved messages, semantic search and email** at Free's daily caps cost $1.09
  a month on any plan, because the zero-cost routes let a paid account chat
  without drawing credits.

**The voice branch as built would make it far worse.** Commit `1ffb43f575`
takes live voice out of the pool and books it as cost with no customer charge.
At the assumed backend load, 300 minutes cost $23.88, more than Basic, Pro or
Team bring in. Max, Max 20x and Team Premium have unlimited minutes and no hard
bound: each conversation holds one open session, but a user can open many. At
eight hours a day that is $1,163 a month; around the clock, $3,489. The owner's
later decision to put voice in the single pool supersedes it, and the branch
needs its metering commit reverted before it merges.

**Free costs cents in practice and $36 at worst.** A typical Free account costs
$0.83 a month. The worst case is $36, of which $30.44 is the platform-funded
sandbox, $3.35 downloads and $1.09 messages. The temporary free-quota layer
costs nothing while it lasts: 244 of its 279 allocations expire on 2026-10-21,
and the rest by 2027-01-01.

**Ordinary use stays well above target.** Typical margins on the US web price
are 84% for a light Basic user, 81% for a normal Pro user and 79% for a power
Max 5x user. The heavy profiles on their plans (research heavy on Pro, coding
heavy on Max 5x, desktop agent and 95th percentile on Max 20x) sit between 54%
and 60%, and the scripted-abuse profile, capped by the pool, at 48%.

**Break-even.** At the launch mix (30% Basic, 55% Pro, 10% Max 5x, 5% Max 20x,
US web) a paying user contributes $13.54 a month after support and ten Free
accounts. Twenty-one paying users cover the $281 of fixed vendor costs; 858
also cover one engineer at the BLS median. On the proposed 50% budgets in their
worst case it is 52 and 2,135.

## Recommendation: token budgets at a 50% worst-case margin

The owner decided three things on 2026-10-10, after the 60% table further down
was drafted:

- Plan budgets use a **50% worst-case gross margin**.
- Everyday chat on paid plans moves to the fast OpenAI family, with the
  Anthropic small model and the Qwen flash family as backups. Auto steps up to
  the balanced OpenAI family or Sonnet only for hard tasks (coding, agentic,
  computer use, reasoning, long context), and flagships are manual on Max.
- **Budget follows revenue**: each region and channel gets the budget its own
  net revenue supports, so India Basic at INR 399 gets less than US Basic.

The margin is measured on net revenue, the price less tax, card fees and store
commission:

```
monthly credits = floor((net revenue x (1 - 0.50) - non-pool cost) / $0.005)
```

The non-pool cost keeps the caps proposed below (downloads at 3% of the price,
storage at 1% but never above today's quota, about 300 saved messages a day).
Measured on the list price instead, the margin comes out 1 to 4 points lower;
the "list price" column gives the budgets for that stricter reading.

**Base table for `managed-usage-limits.ts`** (US web):

| Plan         | Today (monthly / weekly / 5-hour) | Proposed at 50%      | Change | If margin is on list price | Worst margin, net / list | Typical margin |
| ------------ | --------------------------------- | -------------------- | ------ | -------------------------- | ------------------------ | -------------- |
| Basic        | 400 / 100 / 10                    | 450 / 113 / 16       | +12.5% | 350                        | 50.5% / 46.3%            | 91.2%          |
| Pro          | 2,000 / 500 / 50                  | 1,500 / 375 / 38     | -25%   | 1,400                      | 52.1% / 49.2%            | 83.0%          |
| Max 5x       | 10,000 / 2,500 / 250              | 8,500 / 2,125 / 213  | -15%   | 8,000                      | 50.1% / 47.9%            | 79.7%          |
| Max 20x      | 20,000 / 5,000 / 1,000            | 17,000 / 4,250 / 425 | -15%   | 16,000                     | 50.5% / 48.4%            | 58.3%          |
| Team         | 2,000 / 500 / 50                  | 2,000 / 500 / 50     | 0%     | 1,800                      | 50.3% / 47.6%            | 86.5%          |
| Team Premium | 10,000 / 2,500 / 250              | 10,500 / 2,625 / 263 | +5%    | 10,000                     | 50.9% / 48.7%            | 83.8%          |

The window shape is unchanged from the 60% proposal: weekly 25% of the month,
five-hour 2.5%, never below one heavy voice minute (which sets Basic's 16).
Free stays at 25 credits a month (see the Free paragraph under the 60% table);
its budget comes from conversion, not margin.

**Budget by region and channel.** Safe monthly credits, with the ratio to US
web in brackets. Store rows use the US price unless marked India; India store
prices are not in the repository and are assumed equal to the web INR price
with 18% GST included.

| Plan         | US web     | Rest of world web | India web     | iOS 30%       | iOS 15%       | Google Play 15% |
| ------------ | ---------- | ----------------- | ------------- | ------------- | ------------- | --------------- |
| Basic        | 456 (1)    | 446 (0.98)        | 187 (0.41)    | 305 (0.67)    | 410 (0.90)    | 410 (0.90)      |
| Pro          | 1,579 (1)  | 1,549 (0.98)      | 1,587 (1.01)  | 1,091 (0.69)  | 1,391 (0.88)  | 1,391 (0.88)    |
| Max 5x       | 8,519 (1)  | 8,369 (0.98)      | 8,557 (1.00)  | 5,959 (0.70)  | 7,459 (0.88)  | 7,459 (0.88)    |
| Max 20x      | 17,204 (1) | 16,904 (0.98)     | 21,696 (1.26) | 12,054 (0.70) | 15,054 (0.88) | 15,054 (0.88)   |
| Team         | 2,012 (1)  | 1,975 (0.98)      | 1,581 (0.79)  | not sold      | not sold      | not sold        |
| Team Premium | 10,718 (1) | 10,531 (0.98)     | not sold      | not sold      | not sold      | not sold        |

Google Play subscriptions are 15% (10% service plus 5% billing in the US, EEA
and UK since 2026-06-30, 15% elsewhere), so its column matches iOS at 15%. India
store rows come to 0.17 (iOS) and 0.28 (Play) of US web on Basic, and 0.58 to
0.94 on the other plans. Only India Pro, Max 5x and Max 20x price above their
USD equivalents, which is why their India web budgets are at or above US.

**What a budget buys.** The everyday message is 1,500 tokens in and 400 out,
40% cached, except 3% of messages at 150,000 tokens and 0.5% at 300,000, each
priced at its own long-context tier. That costs 0.143 credits on the everyday
model, against 0.059 without the long messages: the occasional long prompt more
than doubles the average. The backups cost more for the same mix: 0.402 credits
on the Anthropic small model, whose prices rise 5x on prompts over 100,000
tokens, and 0.262 on the Qwen flash route. The everyday model's own tier
doubles input and raises output 1.5x only above 272,000 tokens. A premium
message is the same mix on the dearer of the balanced OpenAI model (2.77
credits) and Sonnet (2.52). Voice uses the owner's 13 credits a minute; the
model gives 10.5 at typical backend use and 15.9 heavy. An image is 6.72
credits.

| Plan         | Credits | Everyday messages | Premium messages | Voice minutes at 13 | Images | Lite videos (8 s) |
| ------------ | ------- | ----------------- | ---------------- | ------------------- | ------ | ----------------- |
| Basic        | 450     | 3,151             | 162              | 34                  | 0      | 0                 |
| Pro          | 1,500   | 10,505            | 541              | 115                 | 223    | 0                 |
| Max 5x       | 8,500   | 59,532            | 3,069            | 653                 | 1,264  | 0                 |
| Max 20x      | 17,000  | 119,065           | 6,139            | 1,307               | 2,529  | 132               |
| Team         | 2,000   | 14,007            | 722              | 153                 | 297    | 0                 |
| Team Premium | 10,500  | 73,540            | 3,792            | 807                 | 1,562  | 0                 |

Each figure assumes the whole budget goes to that one thing. Basic has no image
or video generation, and video is Max 20x only.

**Margin averaged across users.** Typical profiles on the new routing (with 15%
of hard turns on a manual flagship on Max plans), each capped at the proposed
budget, weighted within each plan and blended by the launch mix on US web
prices:

| Plan         | Profile weights                                                            | Net revenue | Average cost | Margin, net revenue | Margin, list price |
| ------------ | -------------------------------------------------------------------------- | ----------- | ------------ | ------------------- | ------------------ |
| Basic        | Light                                                                      | $6.41       | $0.57        | 91.2%               | 83.5%              |
| Pro          | Normal 80%, research heavy 20%                                             | $18.88      | $4.17        | 77.9%               | 73.6%              |
| Max 5x       | Power 70%, coding heavy 30%                                                | $95.60      | $22.88       | 76.1%               | 72.7%              |
| Max 20x      | 95th percentile 40%, desktop agent 30%, multimodal 20%, scripted abuse 10% | $191.50     | $75.66       | 60.5%               | 57.9%              |
| Team         | Normal                                                                     | $23.68      | $3.20        | 86.5%               | 81.9%              |
| Team Premium | Power                                                                      | $119.58     | $19.40       | 83.8%               | 80.1%              |
| **Blended**  | Basic 30%, Pro 55%, Max 5x 10%, Max 20x 5%                                 | $31.44      | $8.54        | **72.9%**           | **69.2%**          |

The profile weights and the plan mix are owner inputs.

**Break-even on these budgets.** If every paying user spent the whole 50%
budget, the launch mix would contribute $5.44 per paying user after support and
Free accounts: 52 paying users cover the fixed vendor costs and 2,135 also
cover one engineer. Half the mix on iOS in the first year, each user on the iOS
budget, needs 81 and 3,338; half in India on the web, 48 and 1,969.

**Ceiling check.** Against similarly priced plans with a published dollar value
at API prices (collected by another agent today and not re-verified here), every
budget is inside the ceiling: Pro's $7.50 and Team's $10 against Cursor Pro's
$20 pool, Max 20x's $85 against Cursor Ultra's $400, Max 5x's $42.50 and Team
Premium's $52.50 against measured Claude Max usage starting near $1,050. No
plan near $7 publishes a dollar value.

**Catalog gap.** The Anthropic small model has no family slot in
`model-families.json`; the script finds it as the chat model partnered with the
active Sonnet model. Routing it as a backup by family needs that slot.

## Superseded: token budgets at 60% of list price

Kept for comparison. This section was written at the Bessemer 60% benchmark,
measured on the list price, on the routing in the code today.

The owner decided on 2026-10-10 that each plan gets one usage budget in
provider token cost, drawn by chat, voice (live minutes and backend tokens),
images, video, search, sandbox and research alike. The temporary free-quota
layer stays separate. Under that rule:

```
worst case  = monthly credits x $0.005 + non-pool cost + payment fee or store commission
safe maximum = floor((price x (1 - target margin) - fees - commission - non-pool cost) / $0.005)
```

The target margin is 60% by default, the average Bessemer reports for AI
companies it calls Shooting Stars
([State of AI 2025](https://www.bvp.com/atlas/the-state-of-ai-2025)). The
non-pool cost assumes three caps proposed alongside the budgets: downloads at
3% of the price, storage at 1% of the price but never above today's quota, and
about 300 saved messages a day.

| Plan         | Today (monthly / weekly / 5-hour) | Safe maximum, US web | Proposed             | Worst margin | Typical margin |
| ------------ | --------------------------------- | -------------------- | -------------------- | ------------ | -------------- |
| Free         | 20 / 15 / 2                       | 25                   | 25 / 6 / 6           | n/a          | n/a            |
| Basic        | 400 / 100 / 10                    | 257                  | 250 / 63 / 16        | 60.6%        | 83.9%          |
| Pro          | 2,000 / 500 / 50                  | 1,067                | 1,000 / 250 / 25     | 61.7%        | 80.8%          |
| Max 5x       | 10,000 / 2,500 / 250              | 6,079                | 6,000 / 1,500 / 150  | 60.4%        | 78.8%          |
| Max 20x      | 20,000 / 5,000 / 1,000            | 12,354               | 12,000 / 3,000 / 300 | 60.9%        | 65.4%          |
| Team         | 2,000 / 500 / 50                  | 1,380                | 1,300 / 325 / 33     | 61.6%        | 83.8%          |
| Team Premium | 10,000 / 2,500 / 250              | 7,676                | 7,500 / 1,875 / 188  | 60.7%        | 82.2%          |

Every paid plan's current budget is above its safe maximum on every channel:
on the web by 30% (Team Premium, US) to 100% (Team, India), India Basic by
733%, and by far more in the stores.

**Windows.** Weekly stays at 25% of the month, today's shape, so the month
lasts at least four weeks at full use. The five-hour window is 2.5% of the
month, so a whole day of back-to-back windows reaches at most 12% and no single
day can drain the month. The five-hour window never falls below one minute of
heavy voice; on Basic that floor lifts it to 16 credits, and the weekly window
then bounds the heaviest day at 25%. Max 20x today allows 5% a window, so one
day can take 24% of the month; the proposal brings it into line. `dailyCredits`
stays 0, because the five-hour window already bounds a day.

**Free.** With ten Free accounts per paying user (about 9% conversion) and a
quarter of a paying user's typical contribution set aside for Free, each Free
account is funded at $0.55 a month. Marginal storage, 20 MiB of downloads a
day, messages and email take $0.42, leaving 25 credits. Both the conversion
ratio and the quarter are owner inputs. The $1-a-day platform sandbox and the
20 included searches move into the pool.

**What a budget buys.** For the app's "about N left" figures, the script
publishes credits per unit for every plan. On Pro's proposed 1,000 credits, if
spent on one thing alone: about 3,700 messages on the default slot or 730 on
the dearest one, 94 voice minutes at typical backend use (62 heavy), 148
images, 357 searches or 4 deep research runs. On Max 20x's 12,000: 44,000
default messages or 2,000 on the flagship slot, 1,139 voice minutes, 1,785
images, 18 eight-second 1080p videos on the standard video model or 93 on the
lite one.

**Regions and channels.** `managed-usage-limits.ts` has one budget per plan, so
each price point that supports less than the plan's budget needs either a
regional limit table or a different price:

- India Basic at INR 399 safely supports 48 credits. Supporting 250 at the same
  margin needs a price near INR 720, from the formula above.
- The first App Store year leaves Pro 91 safe credits at $20. Keeping the web
  margin needs $26.97 on iOS, or $22.21 inside the App Store Small Business
  Program (15% from the first month, for developers under $1M of proceeds).
  The repository records no enrollment. Android subscriptions at 15% need
  $22.21 on Pro.
- The INR store prices are not in the repository; the India store rows assume
  the web INR price with 18% GST included.

**Ceiling check.** No competitor at $7, $20, $25 or $125 publishes an absolute
usage budget, so the ceiling cannot be tested in dollars there. At $100 and
$200, the proposed $30 and $60 of provider cost sit below the published usage
values another agent collected today (Claude Max's API credits, Perplexity
Max's roughly $100 of Computer credits), so the proposal stays inside the
ceiling. Those competitor figures were not re-verified here.

## Other changes that protect the worst case

- Charge delegated voice backend tokens (keep `369f4443f0`) and keep live voice
  in the pool (revert the metering choice in `1ffb43f575`).
- Cap paid downloads and replace unlimited storage on Max 5x, Max 20x and Team
  Premium with a quota (62, 124 and 77 GiB at 1% of the price).
- Correct `MOBILE_IAP_STORE_COMMISSION.android.oneTimeBasisPoints`: Google Play
  now charges 20% plus 5% on one-time purchases for new installs in the US, EEA
  and UK ([service fees](https://support.google.com/googleplay/android-developer/answer/112622)),
  against the 15% recorded.
- Default budget-sensitive video to the lite video family ($0.08 a second at
  1080p against $0.40), five times as many seconds per credit.
- Price the cheaper Google live audio model in the catalog: its audio rates are
  $0.005 a minute in and $0.018 out
  ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)), against
  $0.05 a minute plus backend for the current live slot, but the registry
  records only its text token prices.
- Top-ups already carry a 4x markup (50 credits a dollar) and keep 60% to 69%
  on the web after discounts.

## Unknowns

- The Stripe account's country and its Stripe Tax registrations are not
  recorded. Fees assume a US account with Stripe Tax on every charge; India GST
  on INR sales depends on a registration the repository cannot show.
- Whether the USD Pro, Max 5x and Max 20x prices carry an INR currency option
  in Stripe. Without one, Indian checkout for those plans stays closed.
- Delegated backend use per voice minute is an assumption; no metered sessions
  exist.
- Vendor plans actually held (Vercel, Clerk, Sentry, Resend, E2B) come from the
  rate card and vendor pages, not invoices; Neon is the Free plan per the
  owner. Domain and GitHub costs are not recorded. The Fly machines run in
  `sjc`, whose premium over the base-region price is not published in text.
- Active accounts (1,000), Free accounts per paying user (10), support minutes
  per paying user (5), the engineering budget (one FTE at the BLS median) and
  every typical profile are owner inputs, not measurements.
- Enterprise is contract-priced with unlimited managed usage, so it has no
  computable worst case.
- Guest chat can spend up to $20 a day by default; its actual spend is not
  observable from the repository.

## Script output

Every price is read when the script runs: credits from packages/contracts/types/src/credits.ts, plan allowances from packages/contracts/types/src/managed-usage-limits.ts, tool, media, search, sandbox and infrastructure rates from packages/contracts/types/src/rate-card.ts, plan prices, product limits, Free caps and capability gates from packages/contracts/types/src/billing-catalog.ts, India prices from apps/web/lib/regional-pricing.ts, store commission from packages/contracts/types/src/mobile-iap.ts, top-ups from packages/contracts/types/src/billing-topups.ts, voice minutes and the plan-to-policy mapping from the text of packages/contracts/types/src/model-catalog.ts, and model prices and routing from packages/ai/model-registry/generated/registry.json. Card, store, exchange-rate and vendor figures without a repository owner are the dated observations in the script's EXTERNAL block. Assumptions are the PARAMS block; `--params <file>` overrides them and `--json <file>` writes the full model.

### Assumptions

- Active accounts sharing fixed costs: 1,000. Target gross margin: 50.0% worst case (owner decision of 2026-10-10; Bessemer reports ~60% for AI "Shooting Stars", https://www.bvp.com/atlas/the-state-of-ai-2025).
- Gross margin here is (price - store tax - payment fee - store commission - variable cost) / price, at the tax-exclusive list price.
- Card fees assume a US Stripe account with Stripe Billing (0.7%) and Stripe Tax (0.5%) on every charge. India adds the international (1.5%) and conversion (1%) surcharges. INR converts at 96.73 per USD.
- iOS uses the first year App Store commission (30.0%); Google Play subscriptions 15.0%. India store rows assume the web INR price with 18.0% GST included.
- Voice backend, worst case: 2 delegations a minute of 6,000 input tokens (50.0% cached) and 600 output tokens, plus 0.5 searches a minute. Typical: 0.3 delegations of 4,000 in and 300 out.
- Unlimited voice is shown at 8 hours a day; nothing in code stops a longer total, because each conversation may hold one open session and a user may open many conversations.
- Worst-case turns, semantic searches and emails use the Free daily caps for every plan (1,000 messages, 200 searches, 10 emails a day). Paid plans have no such cap; the chat rate limit (20 a minute, scaled by plan concurrency) is the only bound.
- Unlimited file storage is shown at 100 GiB, and paid downloads at the Free cap of 14.9 GiB a month; both are assumptions, not limits.
- A deep research run is assumed to be 40 grounded searches and 30 steps of 20,000 in and 2,000 out: $1.11 a run.

### Variable cost per unit

| Unit                              | Per                                | Provider cost | Credits | Source                                                                                                                                                             |
| --------------------------------- | ---------------------------------- | ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| credit                            | credit                             | $0.0050       | 1       | packages/contracts/types/src/credits.ts                                                                                                                            |
| image                             | image at 1K                        | $0.0336       | 6.72    | packages/ai/model-registry/generated/registry.json image_generation slot; https://ai.google.dev/gemini-api/docs/pricing read 2026-10-10                            |
| video_second_standard             | second at 1080p                    | $0.4000       | 80      | packages/ai/model-registry/generated/registry.json video_generation slot                                                                                           |
| video_second_lite                 | second at 1080p                    | $0.0800       | 16      | packages/ai/model-registry/generated/registry.json family google/veo-lite                                                                                          |
| voice_live_minute                 | minute                             | $0.0500       | 10      | packages/ai/model-registry/generated/registry.json voice_live slot; https://developers.openai.com/api/docs/pricing read 2026-10-10                                 |
| voice_backend_minute_paid_worst   | minute                             | $0.0296       | 5.92    | packages/ai/model-registry/generated/registry.json voice_live_backend slot x params.voiceBackend.worst                                                             |
| voice_backend_minute_paid_typical | minute                             | $0.0027       | 0.53    | packages/ai/model-registry/generated/registry.json voice_live_backend slot x params.voiceBackend.typical                                                           |
| voice_backend_minute_free_worst   | minute                             | $0.0063       | 1.25    | packages/ai/model-registry/generated/registry.json family openai/gpt-fast (the voice_live_backend_free slot on fix/voice-conversation)                             |
| voice_alternative_live_minute     | minute, both directions streaming  | $0.0230       | 4.6     | https://ai.google.dev/gemini-api/docs/pricing read 2026-10-10 (Google 3.8 Live audio rates, paid tier); the registry records only text token prices for this model |
| transcription_minute              | minute                             | $0.0060       | 1.2     | packages/contracts/types/src/rate-card.ts transcription_minute                                                                                                     |
| search_grounded                   | call                               | $0.0140       | 2.8     | packages/contracts/types/src/rate-card.ts web_search_grounding                                                                                                     |
| search_fallback                   | call                               | $0.0050       | 1       | packages/contracts/types/src/rate-card.ts web_search_perplexity                                                                                                    |
| sandbox_minute                    | minute at 2 vCPU and 4 GiB         | $0.0028       | 0.55    | packages/contracts/types/src/rate-card.ts sandbox rows                                                                                                             |
| deep_research_run                 | run (assumed shape)                | $1.1135       | 222.7   | params.deepResearchRun on the search_premium slot plus grounded search                                                                                             |
| storage_gib_month                 | GiB-month                          | $0.0161       | 3.22    | packages/contracts/types/src/rate-card.ts object_storage_gib_month                                                                                                 |
| egress_gib                        | GiB                                | $0.2255       | 45.1    | packages/contracts/types/src/rate-card.ts network_egress_gib (on-demand; Vercel Pro includes 1 TB)                                                                 |
| turn_infrastructure               | turn                               | $0.0000       | 0.01    | INFRASTRUCTURE_FOOTPRINT turn rows                                                                                                                                 |
| email                             | email                              | $0.0009       | 0.18    | packages/contracts/types/src/rate-card.ts email_message_request                                                                                                    |
| vector_query                      | query                              | $0.0000       | 0       | packages/contracts/types/src/rate-card.ts vector_query_request (estimate)                                                                                          |
| auth_active_user_above_included   | monthly retained user above 50,000 | $0.0200       | 4       | packages/contracts/types/src/rate-card.ts auth_active_user_month                                                                                                   |

### Fixed monthly costs

| Item                            | Monthly     | Basis                                                                                                                                                                               |
| ------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hosting_platform_month          | $20.00      | committed rate card row                                                                                                                                                             |
| auth_platform_month             | $25.00      | committed rate card row                                                                                                                                                             |
| observability_platform_month    | $26.00      | committed rate card row                                                                                                                                                             |
| email_platform_month            | $20.00      | committed rate card row                                                                                                                                                             |
| fly_agiworkforce-signaling      | $6.70       | 1 always-on shared-cpu-1x machine with 1 GB at the base-region price                                                                                                                |
| fly_agiworkforce-upload-scanner | $25.39      | 1 always-on shared-cpu-2x machine with 4 GB at the base-region price                                                                                                                |
| e2b_pro                         | $150.00     | Hobby allows 20 concurrent sandboxes for the whole platform; plans grant up to 5 per user, so paid launch needs Pro                                                                 |
| apple_developer_program         | $8.25       | $99 a year, also covers macOS signing and notarization in release-desktop-cloud.yml                                                                                                 |
| neon_database                   | $0.00       | Free plan per the owner (100 CU-hours a project, compute suspends when spent); AGI_DB_LOW_POWER keeps crons inside 15 minutes an hour. Launch is $0.106 per CU-hour with no minimum |
| upstash_redis                   | $0.00       | pay as you go with no base fee; per-command cost is in the per-turn footprint                                                                                                       |
| cloudflare_r2                   | $0.00       | no base fee; storage is priced per GiB-month in the per-user rows                                                                                                                   |
| **Total**                       | **$281.34** | $0.28 per active account at 1,000; $2.81 at 100, $0.03 at 10,000                                                                                                                    |

Not included: domain (registrar and renewal price are not recorded in the repository); github (plan and Actions minutes are not recorded in the repository); google_play_developer ($25 one-time registration (https://support.google.com/googleplay/android-developer/answer/6112435); not a monthly cost). Guest chat may spend up to $608.75 a month at its default daily cap.

### Worst case per plan

Every allowance used in full. Chat, images, video, paid search, deep research, sandbox, transcription and read-aloud all draw one credit pool at provider cost, so the pool is the worst case for all of them together, whichever model is used. "Main" is the code on main today, where delegated voice backend tokens go uncharged; "voice branch" is fix/voice-conversation (owner decision D1), where live voice leaves the pool; "one pool" is the owner decision of 2026-10-10, where voice, backend tokens included, draws the pool like everything else.

| Plan         | Price   | Credit pool | Voice outside pool (main) | Voice outside pool (branch) | Other outside pool | Worst cost (main) | Worst cost (branch) | Worst cost (one pool) | Unbounded                                   |
| ------------ | ------- | ----------- | ------------------------- | --------------------------- | ------------------ | ----------------- | ------------------- | --------------------- | ------------------------------------------- |
| Free         | $0.00   | $0.10       | $0.06 (2 min)             | $1.69 (30 min)              | $35.84             | $35.99            | $37.62              | $35.94                | none                                        |
| Basic        | $7.00   | $2.00       | $1.18 (40 min)            | $23.88 (300 min)            | $4.76              | $7.94             | $30.64              | $6.76                 | file downloads                              |
| Pro          | $20.00  | $10.00      | $5.92 (200 min)           | $23.88 (300 min)            | $4.99              | $20.91            | $38.87              | $14.99                | file downloads                              |
| Max 5x       | $100.00 | $50.00      | $29.60 (1,000 min)        | $1162.96 (14,610 min)       | $6.86              | $86.46            | $1219.81            | $56.86                | voice minutes, file storage, file downloads |
| Max 20x      | $200.00 | $100.00     | $59.20 (2,000 min)        | $1162.96 (14,610 min)       | $7.39              | $166.59           | $1270.34            | $107.39               | voice minutes, file storage, file downloads |
| Team         | $25.00  | $10.00      | $5.92 (200 min)           | $23.88 (300 min)            | $5.23              | $21.15            | $39.11              | $15.23                | file downloads                              |
| Team Premium | $125.00 | $50.00      | $29.60 (1,000 min)        | $1162.96 (14,610 min)       | $6.86              | $86.46            | $1219.81            | $56.86                | voice minutes, file storage, file downloads |

Line items, voice branch:

| Plan         | chat (pool) | voice    | search | sandbox | storage | egress | db    | auth  | infra share | total    |
| ------------ | ----------- | -------- | ------ | ------- | ------- | ------ | ----- | ----- | ----------- | -------- |
| Free         | $0.10       | $1.69    | $0.28  | $30.44  | $0.40   | $3.35  | $1.09 | $0.03 | $0.26       | $37.62   |
| Basic        | $2.00       | $23.88   | $0.00  | $0.00   | $0.04   | $3.35  | $1.09 | $0.03 | $0.26       | $30.64   |
| Pro          | $10.00      | $23.88   | $0.00  | $0.00   | $0.27   | $3.35  | $1.09 | $0.03 | $0.26       | $38.87   |
| Max 5x       | $50.00      | $1162.96 | $0.00  | $0.00   | $2.14   | $3.35  | $1.09 | $0.03 | $0.26       | $1219.81 |
| Max 20x      | $100.00     | $1162.96 | $0.00  | $0.00   | $2.66   | $3.35  | $1.09 | $0.03 | $0.26       | $1270.34 |
| Team         | $10.00      | $23.88   | $0.00  | $0.00   | $0.51   | $3.35  | $1.09 | $0.03 | $0.26       | $39.11   |
| Team Premium | $50.00      | $1162.96 | $0.00  | $0.00   | $2.14   | $3.35  | $1.09 | $0.03 | $0.26       | $1219.81 |

#### Worst-case margin by region and channel

| Plan         | Region   | Channel | Interval | Price   | Fee    | Store tax | Commission | Margin (main) | Margin (branch) | Margin (one pool) |
| ------------ | -------- | ------- | -------- | ------- | ------ | --------- | ---------- | ------------- | --------------- | ----------------- |
| Basic        | us       | web     | monthly  | $7.00   | $0.59  | $0.00     | $0.00      | -21.9%        | -346.1%         | -4.9%             |
| Basic        | intl_usd | web     | monthly  | $7.00   | $0.69  | $0.00     | $0.00      | -23.4%        | -347.6%         | -6.4%             |
| Basic        | in       | web     | monthly  | $4.12   | $0.57  | $0.00     | $0.00      | -106.4%       | -656.7%         | -77.7%            |
| Basic        | us       | ios     | monthly  | $7.00   | $0.00  | $0.00     | $2.10      | -43.5%        | -367.7%         | -26.6%            |
| Basic        | in       | ios     | monthly  | $4.12   | $0.00  | $0.63     | $1.05      | -133.2%       | -683.5%         | -104.5%           |
| Basic        | us       | android | monthly  | $7.00   | $0.00  | $0.00     | $1.05      | -28.5%        | -352.7%         | -11.6%            |
| Basic        | in       | android | monthly  | $4.12   | $0.00  | $0.63     | $0.52      | -120.5%       | -670.8%         | -91.8%            |
| Pro          | us       | web     | monthly  | $20.00  | $1.12  | $0.00     | $0.00      | -10.1%        | -99.9%          | 19.5%             |
| Pro          | intl_usd | web     | monthly  | $20.00  | $1.42  | $0.00     | $0.00      | -11.6%        | -101.4%         | 18.0%             |
| Pro          | in       | web     | monthly  | $20.67  | $1.66  | $0.00     | $0.00      | -9.2%         | -96.1%          | 19.4%             |
| Pro          | us       | ios     | monthly  | $20.00  | $0.00  | $0.00     | $6.00      | -34.5%        | -124.3%         | -4.9%             |
| Pro          | in       | ios     | monthly  | $20.67  | $0.00  | $3.15     | $5.25      | -41.9%        | -128.8%         | -13.2%            |
| Pro          | us       | android | monthly  | $20.00  | $0.00  | $0.00     | $3.00      | -19.5%        | -109.3%         | 10.1%             |
| Pro          | in       | android | monthly  | $20.67  | $0.00  | $3.15     | $2.63      | -29.1%        | -116.0%         | -0.5%             |
| Max 5x       | us       | web     | monthly  | $100.00 | $4.40  | $0.00     | $0.00      | 9.1%          | -1124.2%        | 38.7%             |
| Max 5x       | intl_usd | web     | monthly  | $100.00 | $5.90  | $0.00     | $0.00      | 7.6%          | -1125.7%        | 37.2%             |
| Max 5x       | in       | web     | monthly  | $103.37 | $7.12  | $0.00     | $0.00      | 9.5%          | -1086.9%        | 38.1%             |
| Max 5x       | us       | ios     | monthly  | $100.00 | $0.00  | $0.00     | $30.00     | -16.5%        | -1149.8%        | 13.1%             |
| Max 5x       | in       | ios     | monthly  | $103.37 | $0.00  | $15.77    | $26.28     | -24.3%        | -1120.7%        | 4.3%              |
| Max 5x       | us       | android | monthly  | $100.00 | $0.00  | $0.00     | $15.00     | -1.5%         | -1134.8%        | 28.1%             |
| Max 5x       | in       | android | monthly  | $103.37 | $0.00  | $15.77    | $13.14     | -11.6%        | -1108.0%        | 17.0%             |
| Max 20x      | us       | web     | monthly  | $200.00 | $8.50  | $0.00     | $0.00      | 12.5%         | -539.4%         | 42.1%             |
| Max 20x      | intl_usd | web     | monthly  | $200.00 | $11.50 | $0.00     | $0.00      | 11.0%         | -540.9%         | 40.6%             |
| Max 20x      | in       | web     | monthly  | $258.44 | $17.36 | $0.00     | $0.00      | 28.8%         | -398.3%         | 51.7%             |
| Max 20x      | us       | ios     | monthly  | $200.00 | $0.00  | $0.00     | $60.00     | -13.3%        | -565.2%         | 16.3%             |
| Max 20x      | in       | ios     | monthly  | $258.44 | $0.00  | $39.42    | $65.70     | -5.1%         | -432.2%         | 17.8%             |
| Max 20x      | us       | android | monthly  | $200.00 | $0.00  | $0.00     | $30.00     | 1.7%          | -550.2%         | 31.3%             |
| Max 20x      | in       | android | monthly  | $258.44 | $0.00  | $39.42    | $32.85     | 7.6%          | -419.5%         | 30.5%             |
| Team         | us       | web     | monthly  | $25.00  | $1.32  | $0.00     | $0.00      | 10.1%         | -61.7%          | 33.8%             |
| Team         | us       | web     | yearly   | $20.00  | $0.84  | $0.00     | $0.00      | -10.0%        | -99.8%          | 19.6%             |
| Team         | intl_usd | web     | monthly  | $25.00  | $1.70  | $0.00     | $0.00      | 8.6%          | -63.2%          | 32.3%             |
| Team         | intl_usd | web     | yearly   | $20.00  | $1.15  | $0.00     | $0.00      | -11.5%        | -101.3%         | 18.1%             |
| Team         | in       | web     | monthly  | $20.67  | $1.66  | $0.00     | $0.00      | -10.4%        | -97.3%          | 18.3%             |
| Team Premium | us       | web     | monthly  | $125.00 | $5.42  | $0.00     | $0.00      | 26.5%         | -880.2%         | 50.2%             |
| Team Premium | us       | web     | yearly   | $100.00 | $4.13  | $0.00     | $0.00      | 9.4%          | -1123.9%        | 39.0%             |
| Team Premium | intl_usd | web     | monthly  | $125.00 | $7.30  | $0.00     | $0.00      | 25.0%         | -881.7%         | 48.7%             |
| Team Premium | intl_usd | web     | yearly   | $100.00 | $5.63  | $0.00     | $0.00      | 7.9%          | -1125.4%        | 37.5%             |

### Typical case per profile

| Profile              | Plan         | Credits used | chat   | voice | images | video  | search | sandbox | storage+egress | db    | auth+infra | Cost   | Margin, US web |
| -------------------- | ------------ | ------------ | ------ | ----- | ------ | ------ | ------ | ------- | -------------- | ----- | ---------- | ------ | -------------- |
| Free everyday        | Free         | 0            | $0.00  | $0.25 | $0.00  | $0.00  | $0.07  | $0.00   | $0.23          | $0.00 | $0.28      | $0.83  | no revenue     |
| Light                | Basic        | 4.5          | $0.02  | $0.00 | $0.00  | $0.00  | $0.00  | $0.00   | $0.23          | $0.00 | $0.28      | $0.54  | 83.9%          |
| Normal               | Pro          | 229.6        | $0.74  | $1.05 | $0.10  | $0.00  | $0.30  | $0.00   | $0.23          | $0.01 | $0.28      | $2.73  | 80.8%          |
| Normal               | Team         | 229.6        | $0.74  | $1.05 | $0.10  | $0.00  | $0.30  | $0.00   | $0.23          | $0.01 | $0.28      | $2.73  | 83.8%          |
| Power                | Max 5x       | 2,618.9      | $11.27 | $3.16 | $0.40  | $0.00  | $1.17  | $0.25   | $0.24          | $0.03 | $0.28      | $16.80 | 78.8%          |
| Power                | Team Premium | 2,618.9      | $11.27 | $3.16 | $0.40  | $0.00  | $1.17  | $0.25   | $0.24          | $0.03 | $0.28      | $16.80 | 82.2%          |
| Research heavy       | Pro          | 1,394        | $1.77  | $0.53 | $0.00  | $0.00  | $5.20  | $0.00   | $0.23          | $0.01 | $0.28      | $8.02  | 54.3%          |
| Coding heavy         | Max 5x       | 7,902.1      | $38.14 | $0.00 | $0.00  | $0.00  | $0.21  | $1.16   | $0.23          | $0.02 | $0.28      | $40.05 | 55.6%          |
| Desktop agent heavy  | Max 20x      | 15,773.8     | $77.48 | $0.00 | $0.00  | $0.00  | $0.56  | $0.83   | $0.23          | $0.07 | $0.28      | $79.45 | 56.0%          |
| Multimodal heavy     | Max 20x      | 14,163       | $0.73  | $0.53 | $10.08 | $60.00 | $0.00  | $0.00   | $0.38          | $0.01 | $0.28      | $72.00 | 59.7%          |
| 95th percentile      | Max 20x      | 14,546.8     | $55.34 | $6.32 | $1.34  | $12.00 | $2.95  | $1.10   | $0.25          | $0.10 | $0.28      | $79.69 | 55.9%          |
| Automated or abusive | Max 20x      | 18,746       | $93.73 | $0.00 | $0.00  | $0.00  | $0.00  | $0.00   | $0.23          | $0.65 | $0.28      | $94.90 | 48.3%          |

### Break-even

Support $2.24 per paying user a month; engineering $11331.67 a month; 10 Free accounts per paying user at $0.83 each (typical). Fixed vendor costs $281.34 a month.

| Mix                                                  | Basis                                                               | Contribution per paying user | Paying users for fixed costs | With engineering |
| ---------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------- | ---------------------------- | ---------------- |
| Launch mix, web, United States                       | typical profile cost on current allowances                          | $13.54                       | 21                           | 858              |
| Launch mix, web, United States                       | worst case on current allowances, code on main                      | -$9.99                       | none                         | none             |
| Launch mix, web, United States                       | worst case on the proposed 50% token budget, everything in one pool | $5.44                        | 52                           | 2,135            |
| Same mix, half on iOS in the first subscription year | typical profile cost on current allowances                          | $9.41                        | 30                           | 1,235            |
| Same mix, half on iOS in the first subscription year | worst case on current allowances, code on main                      | -$14.12                      | none                         | none             |
| Same mix, half on iOS in the first subscription year | worst case on the proposed 50% token budget, everything in one pool | $3.48                        | 81                           | 3,338            |
| Same mix, half in India on the web                   | typical profile cost on current allowances                          | $14.42                       | 20                           | 806              |
| Same mix, half in India on the web                   | worst case on current allowances, code on main                      | -$9.11                       | none                         | none             |
| Same mix, half in India on the web                   | worst case on the proposed 50% token budget, everything in one pool | $5.90                        | 48                           | 1,969            |
| Teams, web, United States, monthly seats             | typical profile cost on current allowances                          | $26.74                       | 11                           | 435              |
| Teams, web, United States, monthly seats             | worst case on current allowances, code on main                      | -$1.93                       | none                         | none             |
| Teams, web, United States, monthly seats             | worst case on the proposed 50% token budget, everything in one pool | $11.13                       | 26                           | 1,044            |

### Token budgets at 50.0% worst-case margin

Owner decisions of 2026-10-10: a 50.0% worst-case margin, everyday chat on the fast OpenAI family (backups: the Anthropic small model and the Qwen flash family), hard tasks on the balanced OpenAI or Sonnet family, flagships manual on Max, and budgets that follow each channel's net revenue. Margin is measured on net revenue (price less tax, payment fee and store commission): credits = floor((net revenue x 0.5 - non-pool cost) / 0.005).

| Plan         | Today: monthly / weekly / 5-hour | Proposed: monthly / weekly / 5-hour | Change               | If margin is on list price | Worst margin (net / list) | Typical margin (net) |
| ------------ | -------------------------------- | ----------------------------------- | -------------------- | -------------------------- | ------------------------- | -------------------- |
| Basic        | 400 / 100 / 10                   | 450 / 113 / 16                      | 12.5% versus 400     | 350                        | 50.5% / 46.3%             | 91.2%                |
| Pro          | 2,000 / 500 / 50                 | 1,500 / 375 / 38                    | -25.0% versus 2,000  | 1,400                      | 52.1% / 49.2%             | 83.0%                |
| Max 5x       | 10,000 / 2,500 / 250             | 8,500 / 2,125 / 213                 | -15.0% versus 10,000 | 8,000                      | 50.1% / 47.9%             | 79.7%                |
| Max 20x      | 20,000 / 5,000 / 1,000           | 17,000 / 4,250 / 425                | -15.0% versus 20,000 | 16,000                     | 50.5% / 48.4%             | 58.3%                |
| Team         | 2,000 / 500 / 50                 | 2,000 / 500 / 50                    | 0.0% versus 2,000    | 1,800                      | 50.3% / 47.6%             | 86.5%                |
| Team Premium | 10,000 / 2,500 / 250             | 10,500 / 2,625 / 263                | 5.0% versus 10,000   | 10,000                     | 50.9% / 48.7%             | 83.8%                |

#### Budget by region and channel

Safe monthly credits at each price point, and the ratio to US web. Store rows use the US price unless marked India.

| Plan         | US web     | Rest of world web | India web     | iOS 30%      | iOS 15%       | Google Play 15% | India iOS 30% | India Play 15% |
| ------------ | ---------- | ----------------- | ------------- | ------------ | ------------- | --------------- | ------------- | -------------- |
| Basic        | 456 (1)    | 446 (0.98)        | 187 (0.41)    | 305 (0.67)   | 410 (0.9)     | 410 (0.9)       | 77 (0.17)     | 129 (0.28)     |
| Pro          | 1,579 (1)  | 1,549 (0.98)      | 1,587 (1.01)  | 1,091 (0.69) | 1,391 (0.88)  | 1,391 (0.88)    | 913 (0.58)    | 1,176 (0.74)   |
| Max 5x       | 8,519 (1)  | 8,369 (0.98)      | 8,557 (1)     | 5,959 (0.7)  | 7,459 (0.88)  | 7,459 (0.88)    | 5,065 (0.59)  | 6,379 (0.75)   |
| Max 20x      | 17,204 (1) | 16,904 (0.98)     | 21,696 (1.26) | 12,054 (0.7) | 15,054 (0.88) | 15,054 (0.88)   | 12,919 (0.75) | 16,204 (0.94)  |
| Team         | 2,012 (1)  | 1,975 (0.98)      | 1,581 (0.79)  | not sold     | not sold      | not sold        | not sold      | not sold       |
| Team Premium | 10,718 (1) | 10,531 (0.98)     | not sold      | not sold     | not sold      | not sold        | not sold      | not sold       |

#### What the budget buys, everyday model first

An everyday message is 1,500 tokens in and 400 out with 40.0% cached, except 3.0% of messages at 150,000 tokens in and 0.5% at 300,000, each priced at its long-context tier. That is 0.143 credits on the everyday route (0.059 without the long messages); the backups cost 0.402 (anthropic/claude-haiku-5-5) and 0.262 (qwen/qwen-3.8-flash). A premium message is the same shape on the dearer of anthropic/claude-sonnet-5-5 (2.52) and openai/gpt-6.1-sol (2.77). Voice uses the owner's 13 credits a minute; the model gives 10.53 typical and 15.92 heavy. An image is 6.72 credits.

| Plan         | Credits | Everyday messages | Premium messages | Voice minutes at 13 (typical / heavy) | Images | Lite videos (8 s) |
| ------------ | ------- | ----------------- | ---------------- | ------------------------------------- | ------ | ----------------- |
| Basic        | 450     | 3,151             | 162              | 34 (42 / 28)                          | 0      | 0                 |
| Pro          | 1,500   | 10,505            | 541              | 115 (142 / 94)                        | 223    | 0                 |
| Max 5x       | 8,500   | 59,532            | 3,069            | 653 (807 / 533)                       | 1,264  | 0                 |
| Max 20x      | 17,000  | 119,065           | 6,139            | 1,307 (1,614 / 1,067)                 | 2,529  | 132               |
| Team         | 2,000   | 14,007            | 722              | 153 (189 / 125)                       | 297    | 0                 |
| Team Premium | 10,500  | 73,540            | 3,792            | 807 (996 / 659)                       | 1,562  | 0                 |

#### Margin averaged across users

Typical profiles on the proposed routing, each capped at the proposed budget, weighted within each plan and blended by the launch plan mix on US web prices.

| Plan         | Profile weights                                                                                      | Price   | Net revenue | Average cost | Margin on net revenue | Margin on list price |
| ------------ | ---------------------------------------------------------------------------------------------------- | ------- | ----------- | ------------ | --------------------- | -------------------- |
| Basic        | Light 100.0%                                                                                         | $7.00   | $6.41       | $0.57        | 91.2%                 | 83.5%                |
| Pro          | Normal 80.0%, Research heavy 20.0%                                                                   | $20.00  | $18.88      | $4.17        | 77.9%                 | 73.6%                |
| Max 5x       | Power 70.0%, Coding heavy 30.0%                                                                      | $100.00 | $95.60      | $22.88       | 76.1%                 | 72.7%                |
| Max 20x      | 95th percentile 40.0%, Desktop agent heavy 30.0%, Multimodal heavy 20.0%, Automated or abusive 10.0% | $200.00 | $191.50     | $75.66       | 60.5%                 | 57.9%                |
| Team         | Normal 100.0%                                                                                        | $25.00  | $23.68      | $3.20        | 86.5%                 | 81.9%                |
| Team Premium | Power 100.0%                                                                                         | $125.00 | $119.58     | $19.40       | 83.8%                 | 80.1%                |
| **Blended**  | Basic 30.0%, Pro 55.0%, Max 5x 10.0%, Max 20x 5.0%                                                   | $33.10  | $31.44      | $8.54        | 72.9%                 | 69.2%                |

### Which allowances lose money

Each allowance priced alone at its worst case, against the US web price after fees, and against the lowest-revenue channel. "Loses money on its own" means that one allowance costs more than the plan brings in.

| Plan         | Allowance                                                                           | Worst cost | US web net revenue | Verdict, US web                                    | Lowest-revenue channel       | Verdict there                                 |
| ------------ | ----------------------------------------------------------------------------------- | ---------- | ------------------ | -------------------------------------------------- | ---------------------------- | --------------------------------------------- |
| Free         | credit pool (20 credits)                                                            | $0.10      | no revenue         | within the Free funding on its own                 | n/a                          | n/a                                           |
| Free         | voice backend tokens not charged on main                                            | $0.06      | no revenue         | within the Free funding on its own                 | n/a                          | n/a                                           |
| Free         | voice minutes outside credits on fix/voice-conversation (30 min)                    | $1.69      | no revenue         | above what a Free account can be funded on its own | n/a                          | n/a                                           |
| Free         | file storage (0.1 GiB)                                                              | $0.40      | no revenue         | within the Free funding on its own                 | n/a                          | n/a                                           |
| Free         | downloads (500 MiB a day)                                                           | $3.35      | no revenue         | above what a Free account can be funded on its own | n/a                          | n/a                                           |
| Free         | messages, semantic search and email at the Free daily caps                          | $1.09      | no revenue         | above what a Free account can be funded on its own | n/a                          | n/a                                           |
| Free         | platform-funded sandbox ($1 a day, outside credits)                                 | $30.44     | no revenue         | above what a Free account can be funded on its own | n/a                          | n/a                                           |
| Free         | 20 included searches                                                                | $0.28      | no revenue         | within the Free funding on its own                 | n/a                          | n/a                                           |
| Basic        | credit pool (400 credits)                                                           | $2.00      | $6.41              | fits on its own                                    | in ios monthly ($2.45)       | over the target-margin cost budget on its own |
| Basic        | voice backend tokens not charged on main                                            | $1.18      | $6.41              | fits on its own                                    | in ios monthly ($2.45)       | over the target-margin cost budget on its own |
| Basic        | voice minutes outside credits on fix/voice-conversation (300 min)                   | $23.88     | $6.41              | loses money on its own                             | in ios monthly ($2.45)       | loses money on its own                        |
| Basic        | file storage (1 GiB)                                                                | $0.04      | $6.41              | fits on its own                                    | in ios monthly ($2.45)       | fits on its own                               |
| Basic        | downloads (no cap, shown at the Free cap)                                           | $3.35      | $6.41              | over the target-margin cost budget on its own      | in ios monthly ($2.45)       | loses money on its own                        |
| Basic        | messages, semantic search and email at the Free daily caps                          | $1.09      | $6.41              | fits on its own                                    | in ios monthly ($2.45)       | over the target-margin cost budget on its own |
| Pro          | credit pool (2,000 credits)                                                         | $10.00     | $18.88             | over the target-margin cost budget on its own      | in ios monthly ($12.26)      | over the target-margin cost budget on its own |
| Pro          | voice backend tokens not charged on main                                            | $5.92      | $18.88             | fits on its own                                    | in ios monthly ($12.26)      | over the target-margin cost budget on its own |
| Pro          | voice minutes outside credits on fix/voice-conversation (300 min)                   | $23.88     | $18.88             | loses money on its own                             | in ios monthly ($12.26)      | loses money on its own                        |
| Pro          | file storage (10 GiB)                                                               | $0.27      | $18.88             | fits on its own                                    | in ios monthly ($12.26)      | fits on its own                               |
| Pro          | downloads (no cap, shown at the Free cap)                                           | $3.35      | $18.88             | fits on its own                                    | in ios monthly ($12.26)      | over the target-margin cost budget on its own |
| Pro          | messages, semantic search and email at the Free daily caps                          | $1.09      | $18.88             | fits on its own                                    | in ios monthly ($12.26)      | fits on its own                               |
| Max 5x       | credit pool (10,000 credits)                                                        | $50.00     | $95.60             | over the target-margin cost budget on its own      | in ios monthly ($61.32)      | over the target-margin cost budget on its own |
| Max 5x       | voice backend tokens not charged on main                                            | $29.60     | $95.60             | fits on its own                                    | in ios monthly ($61.32)      | over the target-margin cost budget on its own |
| Max 5x       | voice minutes outside credits on fix/voice-conversation (14,610 min, no hard bound) | $1162.96   | $95.60             | loses money on its own                             | in ios monthly ($61.32)      | loses money on its own                        |
| Max 5x       | file storage (unlimited, shown at 100 GiB)                                          | $2.14      | $95.60             | fits on its own                                    | in ios monthly ($61.32)      | fits on its own                               |
| Max 5x       | downloads (no cap, shown at the Free cap)                                           | $3.35      | $95.60             | fits on its own                                    | in ios monthly ($61.32)      | fits on its own                               |
| Max 5x       | messages, semantic search and email at the Free daily caps                          | $1.09      | $95.60             | fits on its own                                    | in ios monthly ($61.32)      | fits on its own                               |
| Max 20x      | credit pool (20,000 credits)                                                        | $100.00    | $191.50            | over the target-margin cost budget on its own      | us ios monthly ($140.00)     | over the target-margin cost budget on its own |
| Max 20x      | voice backend tokens not charged on main                                            | $59.20     | $191.50            | fits on its own                                    | us ios monthly ($140.00)     | over the target-margin cost budget on its own |
| Max 20x      | voice minutes outside credits on fix/voice-conversation (14,610 min, no hard bound) | $1162.96   | $191.50            | loses money on its own                             | us ios monthly ($140.00)     | loses money on its own                        |
| Max 20x      | file storage (unlimited, shown at 100 GiB)                                          | $2.66      | $191.50            | fits on its own                                    | us ios monthly ($140.00)     | fits on its own                               |
| Max 20x      | downloads (no cap, shown at the Free cap)                                           | $3.35      | $191.50            | fits on its own                                    | us ios monthly ($140.00)     | fits on its own                               |
| Max 20x      | messages, semantic search and email at the Free daily caps                          | $1.09      | $191.50            | fits on its own                                    | us ios monthly ($140.00)     | fits on its own                               |
| Team         | credit pool (2,000 credits)                                                         | $10.00     | $23.68             | fits on its own                                    | intl_usd web yearly ($18.86) | over the target-margin cost budget on its own |
| Team         | voice backend tokens not charged on main                                            | $5.92      | $23.68             | fits on its own                                    | intl_usd web yearly ($18.86) | fits on its own                               |
| Team         | voice minutes outside credits on fix/voice-conversation (300 min)                   | $23.88     | $23.68             | loses money on its own                             | intl_usd web yearly ($18.86) | loses money on its own                        |
| Team         | file storage (25 GiB)                                                               | $0.51      | $23.68             | fits on its own                                    | intl_usd web yearly ($18.86) | fits on its own                               |
| Team         | downloads (no cap, shown at the Free cap)                                           | $3.35      | $23.68             | fits on its own                                    | intl_usd web yearly ($18.86) | fits on its own                               |
| Team         | messages, semantic search and email at the Free daily caps                          | $1.09      | $23.68             | fits on its own                                    | intl_usd web yearly ($18.86) | fits on its own                               |
| Team Premium | credit pool (10,000 credits)                                                        | $50.00     | $119.58            | fits on its own                                    | intl_usd web yearly ($94.38) | over the target-margin cost budget on its own |
| Team Premium | voice backend tokens not charged on main                                            | $29.60     | $119.58            | fits on its own                                    | intl_usd web yearly ($94.38) | fits on its own                               |
| Team Premium | voice minutes outside credits on fix/voice-conversation (14,610 min, no hard bound) | $1162.96   | $119.58            | loses money on its own                             | intl_usd web yearly ($94.38) | loses money on its own                        |
| Team Premium | file storage (unlimited, shown at 100 GiB)                                          | $2.14      | $119.58            | fits on its own                                    | intl_usd web yearly ($94.38) | fits on its own                               |
| Team Premium | downloads (no cap, shown at the Free cap)                                           | $3.35      | $119.58            | fits on its own                                    | intl_usd web yearly ($94.38) | fits on its own                               |
| Team Premium | messages, semantic search and email at the Free daily caps                          | $1.09      | $119.58            | fits on its own                                    | intl_usd web yearly ($94.38) | fits on its own                               |

### Per-feature budget audit, superseded by token budgets

Kept to show where each price point stands with voice outside the pool, as on the voice branch. The recommendation is the token budget section below.

For each plan and price point: the worst-case budget is price x 0.5 minus fees and commission; non-pool costs come off first; the rest funds credits and voice.

| Plan         | Region   | Channel | Interval | Budget  | Available | Credits now | Max credits, voice as now | Max credits, no voice | Voice now (min) | Max voice min, credits as now | Flags                                                                                                                                                                                                   |
| ------------ | -------- | ------- | -------- | ------- | --------- | ----------- | ------------------------- | --------------------- | --------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basic        | us       | web     | monthly  | $2.91   | -$1.85    | 400         | 0                         | 0                     | 300             | 0                             | today: worst case loses money (-21.9%); voice branch: worst case loses money (-346.1%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                     |
| Basic        | intl_usd | web     | monthly  | $2.81   | -$1.95    | 400         | 0                         | 0                     | 300             | 0                             | today: worst case loses money (-23.4%); voice branch: worst case loses money (-347.6%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                     |
| Basic        | in       | web     | monthly  | $1.49   | -$3.27    | 400         | 0                         | 0                     | 300             | 0                             | today: worst case loses money (-106.4%); voice branch: worst case loses money (-656.7%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                    |
| Basic        | us       | ios     | monthly  | $1.40   | -$3.36    | 400         | 0                         | 0                     | 300             | 0                             | today: worst case loses money (-43.5%); voice branch: worst case loses money (-367.7%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                     |
| Basic        | in       | ios     | monthly  | $0.38   | -$4.37    | 400         | 0                         | 0                     | 300             | 0                             | today: worst case loses money (-133.2%); voice branch: worst case loses money (-683.5%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                    |
| Basic        | us       | android | monthly  | $2.45   | -$2.31    | 400         | 0                         | 0                     | 300             | 0                             | today: worst case loses money (-28.5%); voice branch: worst case loses money (-352.7%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                     |
| Basic        | in       | android | monthly  | $0.91   | -$3.85    | 400         | 0                         | 0                     | 300             | 0                             | today: worst case loses money (-120.5%); voice branch: worst case loses money (-670.8%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                    |
| Pro          | us       | web     | monthly  | $8.88   | $3.89     | 2,000       | 0                         | 778                   | 300             | 0                             | today: worst case loses money (-10.1%); voice branch: worst case loses money (-99.9%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                      |
| Pro          | intl_usd | web     | monthly  | $8.58   | $3.59     | 2,000       | 0                         | 718                   | 300             | 0                             | today: worst case loses money (-11.6%); voice branch: worst case loses money (-101.4%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                     |
| Pro          | in       | web     | monthly  | $8.67   | $3.68     | 2,000       | 0                         | 736                   | 300             | 0                             | today: worst case loses money (-9.2%); voice branch: worst case loses money (-96.1%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                       |
| Pro          | us       | ios     | monthly  | $4.00   | -$0.99    | 2,000       | 0                         | 0                     | 300             | 0                             | today: worst case loses money (-34.5%); voice branch: worst case loses money (-124.3%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                     |
| Pro          | in       | ios     | monthly  | $1.93   | -$3.06    | 2,000       | 0                         | 0                     | 300             | 0                             | today: worst case loses money (-41.9%); voice branch: worst case loses money (-128.8%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                     |
| Pro          | us       | android | monthly  | $7.00   | $2.01     | 2,000       | 0                         | 402                   | 300             | 0                             | today: worst case loses money (-19.5%); voice branch: worst case loses money (-109.3%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                     |
| Pro          | in       | android | monthly  | $4.55   | -$0.43    | 2,000       | 0                         | 0                     | 300             | 0                             | today: worst case loses money (-29.1%); voice branch: worst case loses money (-116.0%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                     |
| Max 5x       | us       | web     | monthly  | $45.60  | $38.74    | 10,000      | 0                         | 7,748                 | 14,610          | 0                             | today: worst case below target margin (9.1%); voice branch: worst case loses money (-1124.2%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads |
| Max 5x       | intl_usd | web     | monthly  | $44.10  | $37.24    | 10,000      | 0                         | 7,448                 | 14,610          | 0                             | today: worst case below target margin (7.6%); voice branch: worst case loses money (-1125.7%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads |
| Max 5x       | in       | web     | monthly  | $44.56  | $37.70    | 10,000      | 0                         | 7,540                 | 14,610          | 0                             | today: worst case below target margin (9.5%); voice branch: worst case loses money (-1086.9%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads |
| Max 5x       | us       | ios     | monthly  | $20.00  | $13.14    | 10,000      | 0                         | 2,628                 | 14,610          | 0                             | today: worst case loses money (-16.5%); voice branch: worst case loses money (-1149.8%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads       |
| Max 5x       | in       | ios     | monthly  | $9.64   | $2.78     | 10,000      | 0                         | 555                   | 14,610          | 0                             | today: worst case loses money (-24.3%); voice branch: worst case loses money (-1120.7%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads       |
| Max 5x       | us       | android | monthly  | $35.00  | $28.14    | 10,000      | 0                         | 5,628                 | 14,610          | 0                             | today: worst case loses money (-1.5%); voice branch: worst case loses money (-1134.8%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads        |
| Max 5x       | in       | android | monthly  | $22.78  | $15.92    | 10,000      | 0                         | 3,183                 | 14,610          | 0                             | today: worst case loses money (-11.6%); voice branch: worst case loses money (-1108.0%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads       |
| Max 20x      | us       | web     | monthly  | $91.50  | $84.11    | 20,000      | 0                         | 16,822                | 14,610          | 0                             | today: worst case below target margin (12.5%); voice branch: worst case loses money (-539.4%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads |
| Max 20x      | intl_usd | web     | monthly  | $88.50  | $81.11    | 20,000      | 0                         | 16,222                | 14,610          | 0                             | today: worst case below target margin (11.0%); voice branch: worst case loses money (-540.9%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads |
| Max 20x      | in       | web     | monthly  | $111.86 | $104.48   | 20,000      | 0                         | 20,895                | 14,610          | 56                            | today: worst case below target margin (28.8%); voice branch: worst case loses money (-398.3%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads |
| Max 20x      | us       | ios     | monthly  | $40.00  | $32.61    | 20,000      | 0                         | 6,522                 | 14,610          | 0                             | today: worst case loses money (-13.3%); voice branch: worst case loses money (-565.2%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads        |
| Max 20x      | in       | ios     | monthly  | $24.09  | $16.71    | 20,000      | 0                         | 3,341                 | 14,610          | 0                             | today: worst case loses money (-5.1%); voice branch: worst case loses money (-432.2%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads         |
| Max 20x      | us       | android | monthly  | $70.00  | $62.61    | 20,000      | 0                         | 12,522                | 14,610          | 0                             | today: worst case below target margin (1.7%); voice branch: worst case loses money (-550.2%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads  |
| Max 20x      | in       | android | monthly  | $56.94  | $49.56    | 20,000      | 0                         | 9,911                 | 14,610          | 0                             | today: worst case below target margin (7.6%); voice branch: worst case loses money (-419.5%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads  |
| Team         | us       | web     | monthly  | $11.18  | $5.95     | 2,000       | 0                         | 1,189                 | 300             | 0                             | today: worst case below target margin (10.1%); voice branch: worst case loses money (-61.7%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                               |
| Team         | us       | web     | yearly   | $9.15   | $3.93     | 2,000       | 0                         | 785                   | 300             | 0                             | today: worst case loses money (-10.0%); voice branch: worst case loses money (-99.8%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                      |
| Team         | intl_usd | web     | monthly  | $10.80  | $5.57     | 2,000       | 0                         | 1,114                 | 300             | 0                             | today: worst case below target margin (8.6%); voice branch: worst case loses money (-63.2%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                |
| Team         | intl_usd | web     | yearly   | $8.86   | $3.63     | 2,000       | 0                         | 725                   | 300             | 0                             | today: worst case loses money (-11.5%); voice branch: worst case loses money (-101.3%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                     |
| Team         | in       | web     | monthly  | $8.67   | $3.44     | 2,000       | 0                         | 687                   | 300             | 0                             | today: worst case loses money (-10.4%); voice branch: worst case loses money (-97.3%); voice minutes alone exceed the worst-case budget; unbounded: file downloads                                      |
| Team Premium | us       | web     | monthly  | $57.08  | $50.22    | 10,000      | 0                         | 10,043                | 14,610          | 2                             | today: worst case below target margin (26.5%); voice branch: worst case loses money (-880.2%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads |
| Team Premium | us       | web     | yearly   | $45.88  | $39.02    | 10,000      | 0                         | 7,803                 | 14,610          | 0                             | today: worst case below target margin (9.4%); voice branch: worst case loses money (-1123.9%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads |
| Team Premium | intl_usd | web     | monthly  | $55.20  | $48.34    | 10,000      | 0                         | 9,668                 | 14,610          | 0                             | today: worst case below target margin (25.0%); voice branch: worst case loses money (-881.7%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads |
| Team Premium | intl_usd | web     | yearly   | $44.38  | $37.52    | 10,000      | 0                         | 7,503                 | 14,610          | 0                             | today: worst case below target margin (7.9%); voice branch: worst case loses money (-1125.4%); voice minutes alone exceed the worst-case budget; unbounded: voice minutes, file storage, file downloads |

### Token budgets at 60% of list price, superseded by the 50% budgets above

One budget per plan in provider token cost, everything drawing it (owner decision of 2026-10-10). The safe maximum is floor((price x 0.4 - fees - commission - non-pool cost) / 0.005); non-pool cost uses the recommended storage, download and message caps. The proposal takes the United States web price and the window shape below.

| Plan         | US web price | Today: monthly / weekly / 5-hour | Proposed: monthly / weekly / 5-hour | Change               | Heaviest day, today / proposed | Worst margin | Typical margin | iOS price for same margin (first year / SBP) |
| ------------ | ------------ | -------------------------------- | ----------------------------------- | -------------------- | ------------------------------ | ------------ | -------------- | -------------------------------------------- |
| Basic        | $7.00        | 400 / 100 / 10                   | 250 / 63 / 16                       | -37.5% versus 400    | 12.0% / 25.2%                  | 60.6%        | 83.9%          | $9.16 / $7.54                                |
| Pro          | $20.00       | 2,000 / 500 / 50                 | 1,000 / 250 / 25                    | -50.0% versus 2,000  | 12.0% / 12.0%                  | 61.7%        | 80.8%          | $26.97 / $22.21                              |
| Max 5x       | $100.00      | 10,000 / 2,500 / 250             | 6,000 / 1,500 / 150                 | -40.0% versus 10,000 | 12.0% / 12.0%                  | 60.4%        | 78.8%          | $136.57 / $112.47                            |
| Max 20x      | $200.00      | 20,000 / 5,000 / 1,000           | 12,000 / 3,000 / 300                | -40.0% versus 20,000 | 24.0% / 12.0%                  | 60.9%        | 65.4%          | $273.57 / $225.29                            |
| Team         | $25.00       | 2,000 / 500 / 50                 | 1,300 / 325 / 33                    | -35.0% versus 2,000  | 12.0% / 12.2%                  | 61.6%        | 83.8%          | not sold in stores                           |
| Team Premium | $125.00      | 10,000 / 2,500 / 250             | 7,500 / 1,875 / 188                 | -25.0% versus 10,000 | 12.0% / 12.0%                  | 60.7%        | 82.2%          | not sold in stores                           |

Free: 10 Free accounts per paying user (9.1% conversion) and 25.0% of a paying user's typical contribution ($21.87) spent on Free fund $0.547 per Free account a month. Marginal storage, 20 MiB of downloads a day and messages take $0.421, leaving 25 credits (today 20, below the safe maximum by 20.0%). Proposed: 25 / 6 / 6 credits, with the $1-a-day platform sandbox and the 20 included searches folded into the pool. Free chat stays on zero-cost routes and the temporary free quota, outside the budget.

Window reasoning:

- A five-hour window of 2.5% of the month means a full day of back-to-back windows (24/5 = 4.8) reaches at most 12.0% of the month, so no single day can drain it.
- A weekly window of 25.0% means the month lasts at least four weeks at maximum use; it is today's shape on every paid plan.
- The five-hour window never drops below 1 worst-case voice minute, so a small plan can still hold a short call; on Basic that floor lifts the five-hour window above 2.5%, and the weekly window then bounds the heaviest day at 25%.
- dailyCredits stays 0: the five-hour window already bounds a day, and a third window would add a refusal reason without adding protection.
- Max 20x today allows 1,000 credits a five-hour window (5% of the month), so one heavy day can take 24% of the month and nearly a whole week; the proposal brings it to the same 2.5% shape as the other plans.

#### Safe maximum by region and channel

| Plan         | Region   | Channel | Interval | Price                | Net revenue | Safe max credits | Today  | Today versus safe max                    | Worst margin on the current budget, recommended caps |
| ------------ | -------- | ------- | -------- | -------------------- | ----------- | ---------------- | ------ | ---------------------------------------- | ---------------------------------------------------- |
| Basic        | us       | web     | monthly  | $7.00                | $6.41       | 257              | 400    | above the safe maximum by 55.6%          | 49.9%                                                |
| Basic        | intl_usd | web     | monthly  | $7.00                | $6.31       | 236              | 400    | above the safe maximum by 69.5%          | 48.4%                                                |
| Basic        | in       | web     | monthly  | INR 399 ($4.12)      | $3.55       | 48               | 400    | above the safe maximum by 733.3%         | 17.4%                                                |
| Basic        | us       | ios     | monthly  | $7.00                | $4.90       | 0                | 400    | no safe budget at this price and channel | 28.2%                                                |
| Basic        | in       | ios     | monthly  | INR 399 ($4.12)      | $2.45       | 0                | 400    | no safe budget at this price and channel | -9.5%                                                |
| Basic        | us       | android | monthly  | $7.00                | $5.95       | 165              | 400    | above the safe maximum by 142.4%         | 43.2%                                                |
| Basic        | in       | android | monthly  | INR 399 ($4.12)      | $2.97       | 0                | 400    | no safe budget at this price and channel | 3.3%                                                 |
| Pro          | us       | web     | monthly  | $20.00               | $18.88      | 1,067            | 2,000  | above the safe maximum by 87.4%          | 36.7%                                                |
| Pro          | intl_usd | web     | monthly  | $20.00               | $18.58      | 1,007            | 2,000  | above the safe maximum by 98.6%          | 35.2%                                                |
| Pro          | in       | web     | monthly  | INR 1,999 ($20.67)   | $19.00      | 1,007            | 2,000  | above the safe maximum by 98.6%          | 36.0%                                                |
| Pro          | us       | ios     | monthly  | $20.00               | $14.00      | 91               | 2,000  | above the safe maximum by 2097.8%        | 12.3%                                                |
| Pro          | in       | ios     | monthly  | INR 1,999 ($20.67)   | $12.26      | 0                | 2,000  | no safe budget at this price and channel | 3.4%                                                 |
| Pro          | us       | android | monthly  | $20.00               | $17.00      | 691              | 2,000  | above the safe maximum by 189.4%         | 27.3%                                                |
| Pro          | in       | android | monthly  | INR 1,999 ($20.67)   | $14.89      | 184              | 2,000  | above the safe maximum by 987.0%         | 16.1%                                                |
| Max 5x       | us       | web     | monthly  | $100.00              | $95.60      | 6,079            | 10,000 | above the safe maximum by 64.5%          | 40.4%                                                |
| Max 5x       | intl_usd | web     | monthly  | $100.00              | $94.10      | 5,779            | 10,000 | above the safe maximum by 73.0%          | 38.9%                                                |
| Max 5x       | in       | web     | monthly  | INR 9,999 ($103.37)  | $96.25      | 5,778            | 10,000 | above the safe maximum by 73.1%          | 39.6%                                                |
| Max 5x       | us       | ios     | monthly  | $100.00              | $70.00      | 959              | 10,000 | above the safe maximum by 942.8%         | 14.8%                                                |
| Max 5x       | in       | ios     | monthly  | INR 9,999 ($103.37)  | $61.32      | 0                | 10,000 | no safe budget at this price and channel | 5.8%                                                 |
| Max 5x       | us       | android | monthly  | $100.00              | $85.00      | 3,959            | 10,000 | above the safe maximum by 152.6%         | 29.8%                                                |
| Max 5x       | in       | android | monthly  | INR 9,999 ($103.37)  | $74.46      | 1,420            | 10,000 | above the safe maximum by 604.2%         | 18.5%                                                |
| Max 20x      | us       | web     | monthly  | $200.00              | $191.50     | 12,354           | 20,000 | above the safe maximum by 61.9%          | 40.9%                                                |
| Max 20x      | intl_usd | web     | monthly  | $200.00              | $188.50     | 11,754           | 20,000 | above the safe maximum by 70.2%          | 39.4%                                                |
| Max 20x      | in       | web     | monthly  | INR 24,999 ($258.44) | $241.08     | 14,791           | 20,000 | above the safe maximum by 35.2%          | 49.9%                                                |
| Max 20x      | us       | ios     | monthly  | $200.00              | $140.00     | 2,054            | 20,000 | above the safe maximum by 873.7%         | 15.1%                                                |
| Max 20x      | in       | ios     | monthly  | INR 24,999 ($258.44) | $153.31     | 0                | 20,000 | no safe budget at this price and channel | 16.0%                                                |
| Max 20x      | us       | android | monthly  | $200.00              | $170.00     | 8,054            | 20,000 | above the safe maximum by 148.3%         | 30.1%                                                |
| Max 20x      | in       | android | monthly  | INR 24,999 ($258.44) | $186.16     | 3,808            | 20,000 | above the safe maximum by 425.2%         | 28.7%                                                |
| Team         | us       | web     | monthly  | $25.00               | $23.68      | 1,380            | 2,000  | above the safe maximum by 44.9%          | 47.6%                                                |
| Team         | us       | web     | yearly   | $20.00               | $19.16      | 1,116            | 2,000  | above the safe maximum by 79.2%          | 37.9%                                                |
| Team         | intl_usd | web     | monthly  | $25.00               | $23.30      | 1,305            | 2,000  | above the safe maximum by 53.3%          | 46.1%                                                |
| Team         | intl_usd | web     | yearly   | $20.00               | $18.86      | 1,056            | 2,000  | above the safe maximum by 89.4%          | 36.4%                                                |
| Team         | in       | web     | monthly  | INR 1,999 ($20.67)   | $19.00      | 1,001            | 2,000  | above the safe maximum by 99.8%          | 35.8%                                                |
| Team Premium | us       | web     | monthly  | $125.00              | $119.58     | 7,676            | 10,000 | above the safe maximum by 30.3%          | 50.7%                                                |
| Team Premium | us       | web     | yearly   | $100.00              | $95.88      | 6,134            | 10,000 | above the safe maximum by 63.0%          | 40.7%                                                |
| Team Premium | intl_usd | web     | monthly  | $125.00              | $117.70     | 7,301            | 10,000 | above the safe maximum by 37.0%          | 49.2%                                                |
| Team Premium | intl_usd | web     | yearly   | $100.00              | $94.38      | 5,834            | 10,000 | above the safe maximum by 71.4%          | 39.2%                                                |

#### What the proposed budget buys

Each figure assumes the whole month's budget goes to that one thing. A message is the Normal profile's shape (1,200 tokens in, 450 out, 45.0% cached); a video is 8 seconds at 1080p.

| Plan         | Credits | Default-model messages | Best-model messages | Voice minutes, typical (heavy) | Images | Videos (lite model) | Searches | Deep research runs | Sandbox minutes |
| ------------ | ------- | ---------------------- | ------------------- | ------------------------------ | ------ | ------------------- | -------- | ------------------ | --------------- |
| Free         | 25      | not metered            | 0                   | 2 (2)                          | 0      | 0 (0)               | 8        | 0                  | 45              |
| Basic        | 250     | 925                    | 182                 | 23 (15)                        | 0      | 0 (0)               | 89       | 0                  | 454             |
| Pro          | 1,000   | 3,703                  | 729                 | 94 (62)                        | 148    | 0 (0)               | 357      | 4                  | 1,818           |
| Max 5x       | 6,000   | 22,222                 | 996                 | 569 (376)                      | 892    | 0 (0)               | 2,142    | 26                 | 10,909          |
| Max 20x      | 12,000  | 44,444                 | 1,993               | 1,139 (753)                    | 1,785  | 18 (93)             | 4,285    | 53                 | 21,818          |
| Team         | 1,300   | 4,814                  | 948                 | 123 (81)                       | 193    | 0 (0)               | 464      | 5                  | 2,363           |
| Team Premium | 7,500   | 27,777                 | 1,245               | 712 (471)                      | 1,116  | 0 (0)               | 2,678    | 33                 | 13,636          |

#### Credits per unit, for "about N left" in the app

| Unit                | Free        | Pro         | Max 20x |
| ------------------- | ----------- | ----------- | ------- |
| defaultModelMessage | not in plan | 0.27        | 0.27    |
| bestModelMessage    | not in plan | 1.37        | 6.02    |
| voiceMinuteTypical  | 10.12       | 10.53       | 10.53   |
| voiceMinuteWorst    | 11.25       | 15.92       | 15.92   |
| image               | not in plan | 6.72        | 6.72    |
| video               | not in plan | not in plan | 640     |
| videoLite           | not in plan | not in plan | 128     |
| searchCall          | 2.8         | 2.8         | 2.8     |
| deepResearchRun     | not in plan | 222.7       | 222.7   |
| sandboxMinute       | 0.55        | 0.55        | 0.55    |

### Temporary free quota

279 QwenCloud allocations (170,000,000 tokens, 686,230 seconds, 2,830 images, 200,000 chars, 1,010 calls) cost $0 while they last. 244 of them expire on 2026-10-21; the last live one on 2027-01-01; the terms review lapses on 2026-12-31. Exhaustion falls back to the upgrade prompt, not paid spend.

### Top-ups

| Top-up | Price   | Credits | Provider cost | Web margin |
| ------ | ------- | ------- | ------------- | ---------- |
| $20    | $20.00  | 1,000   | $5.00         | 69.4%      |
| $100   | $90.00  | 5,000   | $25.00        | 67.8%      |
| $1000  | $700.00 | 50,000  | $250.00       | 60.1%      |
