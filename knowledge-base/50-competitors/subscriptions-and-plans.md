---
id: "COMP-subscriptions-and-plans"
type: "competitor-trace"
title: "Subscriptions and plans"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Subscriptions and plans: competitors to requirements

Claude and ChatGPT both sell a ladder of individual plans, team seats and contract Enterprise, with web, Apple and Google billing, credits past plan limits, refunds, promotions and education programs. AGI has most of the web billing machinery built, behind a paid-upgrade waitlist the owner keeps on. Mobile sells nothing in v1. Main gaps: annual individual billing, gifts, wallet, education and verified-user programs, API credits, per-member admin budgets, and credit notes. All competitor facts reviewed 2026-11-22.

**How the products divide this topic.** All competitor evidence is from the 2026-11-22 catalogue (area 'Plans, billing and usage': 288 Claude-side and 355 ChatGPT-side lines). Claude means the chat product (support.claude.com, claude.com/pricing). Claude Code (code.claude.com) is the separate coding tool; it signs in with the same Pro, Max, Ultra, Team or Enterprise plan and shares one usage pool with Claude chat, and an API key switches it to API billing. ChatGPT means help.openai.com and chatgpt.com pages. Codex (learn.chatgpt.com and some help.openai.com pages) is the separate coding tool; it is included in ChatGPT plans, shares one allowance pool with ChatGPT Work, and also signs in with an API key. Plan names in the catalogue are Claude Free/Pro/Max/Ultra/Team/Enterprise and ChatGPT Free/Go/Plus/Pro (three tiers)/Business/Enterprise/Edu. Many offers are US-only, region-limited or time-limited (teacher plans to 2028, student offer ended 2026-10-31); these limits are stated per capability. Model names are left out on purpose. AGI plan names come from packages/contracts/types/src/billing-catalog.ts (labels Free, Basic, Premium, Max, Ultra, Team, Team Premium, Enterprise; stored ids pro and max_15x differ from labels). Ledger briefs 81 and 83 still use older plan names (Max 5x, Max 15x); I used the code. Ledger line numbers can drift; recheck before citing.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-subscriptions-and-plans-01](#cap-subscriptions-and-plans-01) | Free plan with limited usage | yes | yes | built | seen working by a person |
| [CAP-subscriptions-and-plans-02](#cap-subscriptions-and-plans-02) | Individual paid plan ladder | yes | yes | built | seen working by a person |
| [CAP-subscriptions-and-plans-03](#cap-subscriptions-and-plans-03) | Annual billing for individual plans | yes | no | partly built | code inspected only |
| [CAP-subscriptions-and-plans-04](#cap-subscriptions-and-plans-04) | Plan comparison and plan-gated feature explanations | yes | yes | built | seen failing by a person |
| [CAP-subscriptions-and-plans-05](#cap-subscriptions-and-plans-05) | Buying or upgrading a paid plan | yes | yes | off by decision | seen working by a person |
| [CAP-subscriptions-and-plans-06](#cap-subscriptions-and-plans-06) | Mid-cycle upgrade with proration | yes | unknown | built | code inspected only |
| [CAP-subscriptions-and-plans-07](#cap-subscriptions-and-plans-07) | Downgrade at end of period | unknown | partly | partly built | not verified |
| [CAP-subscriptions-and-plans-08](#cap-subscriptions-and-plans-08) | Cancel, end-of-term access and resume | yes | yes | built | code inspected only |
| [CAP-subscriptions-and-plans-09](#cap-subscriptions-and-plans-09) | One billing owner and store-managed subscriptions | yes | yes | built | code inspected only |
| [CAP-subscriptions-and-plans-10](#cap-subscriptions-and-plans-10) | Mobile in-app purchase and restore | yes | yes | off by decision | not verified |
| [CAP-subscriptions-and-plans-11](#cap-subscriptions-and-plans-11) | Payment methods, billing address, tax ID and local currency | yes | yes | partly built | code inspected only |
| [CAP-subscriptions-and-plans-12](#cap-subscriptions-and-plans-12) | Invoices, receipts and billing history | yes | yes | partly built | code inspected only |
| [CAP-subscriptions-and-plans-13](#cap-subscriptions-and-plans-13) | Refunds and legal withdrawal rights | yes | yes | built | code inspected only |
| [CAP-subscriptions-and-plans-14](#cap-subscriptions-and-plans-14) | Failed payment and grace handling | partly | yes | partly built | seen failing by a person |
| [CAP-subscriptions-and-plans-15](#cap-subscriptions-and-plans-15) | Credits past plan limits | yes | yes | built | seen failing by a person |
| [CAP-subscriptions-and-plans-16](#cap-subscriptions-and-plans-16) | Discounted prepaid usage bundles | yes | no | not built | not verified |
| [CAP-subscriptions-and-plans-17](#cap-subscriptions-and-plans-17) | One subscription shared across apps and coding tools | yes | yes | built | code inspected only |
| [CAP-subscriptions-and-plans-18](#cap-subscriptions-and-plans-18) | Promotions, promo codes and trials | partly | yes | partly built | code inspected only |
| [CAP-subscriptions-and-plans-19](#cap-subscriptions-and-plans-19) | Gifts, gift cards and wallet balance | partly | yes | not built | not verified |
| [CAP-subscriptions-and-plans-20](#cap-subscriptions-and-plans-20) | Team plan with standard and premium seats | yes | yes | partly built | not verified |
| [CAP-subscriptions-and-plans-21](#cap-subscriptions-and-plans-21) | Team seat assignment and billing administration | yes | yes | built | code inspected only |
| [CAP-subscriptions-and-plans-22](#cap-subscriptions-and-plans-22) | Admin spend limits and requests for more usage | yes | yes | partly built | not verified |
| [CAP-subscriptions-and-plans-23](#cap-subscriptions-and-plans-23) | Enterprise plan with contract and invoice billing | yes | yes | partly built | code inspected only |
| [CAP-subscriptions-and-plans-24](#cap-subscriptions-and-plans-24) | Moving between personal, team and enterprise plans | yes | yes | not built | not verified |
| [CAP-subscriptions-and-plans-25](#cap-subscriptions-and-plans-25) | Education, teacher, nonprofit and verified-user programs | yes | yes | not built | not verified |
| [CAP-subscriptions-and-plans-26](#cap-subscriptions-and-plans-26) | Monthly API credits bundled with top plans | yes | yes | not built | not verified |
| [CAP-subscriptions-and-plans-27](#cap-subscriptions-and-plans-27) | Device and card limits on paid accounts | unknown | yes | not built | not verified |
| [CAP-subscriptions-and-plans-28](#cap-subscriptions-and-plans-28) | Coding tool access by plan | yes | yes | built | code inspected only |
| [CAP-subscriptions-and-plans-29](#cap-subscriptions-and-plans-29) | Local mode and BYOK at no charge | partly | partly | built | not verified |
| [CAP-subscriptions-and-plans-30](#cap-subscriptions-and-plans-30) | Grandfathered plan versions and price-change notice | unknown | unknown | partly built | code inspected only |
| [CAP-subscriptions-and-plans-31](#cap-subscriptions-and-plans-31) | Ads on lower plans | unknown | yes | not built | not verified |

## CAP-subscriptions-and-plans-01 Free plan with limited usage

A no-cost plan with its own usage limits and a defined feature bundle.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://claude.com/pricing](https://claude.com/pricing): [2026-11-22] Free at $0 with limited usage per five hours and per week; chat, web search, file creation, code execution, memory, connectors, artifacts. Plans: Free. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): [2026-11-22] Free $0: unlimited text chats with abuse guardrails, limited uploads, images, voice, deep research, memory. Plans: Free. Apps: web, desktop, ios, android.
  - [https://help.openai.com/en/articles/20001354](https://help.openai.com/en/articles/20001354): [2026-11-22] Free and Go everyday text chat unlimited subject to abuse safeguards; Support cannot reset limits. Plans: Free, Go. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Launch Posture: Managed Free public alpha for signed-in users; Local free where available)). A Free plan exists on every app with a defined, server-enforced bundle. Local mode stays free on mobile and desktop.

**With different models, providers and the one subscription.** Free allowances are counted in AGI credits, not per model. The plan catalog says which model families Free can pick. Local mode needs no plan and no AGI credits; sign-in is a separate matter.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile show a Free bundle; CLI, VS Code, Chrome read the same entitlement. Free usage screens show Upgrade only, by owner decision. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S81.02, S81.27
- Comparison list ids: none matched; rows without an id: web: 'Free plan' (no list_id)
- Code: `packages/contracts/types/src/billing-catalog.ts:179`; `apps/web/app/pricing/page.tsx:1170`; `apps/mobile/src/features/settings/cloud-billing/index.tsx:51`

**Gap.** Two seen defects: Free upgrade page shows a usage meter against the owner decision (W-16, W-18). Known flaw: Free allowance is above Basic in some windows (audit/registers/known-flaws.md PLAN-PAID-ALLOWANCES-BELOW-FREE-01).

**Acceptance criteria**

1. Sign in as Free on each app: the plan shows as Free and no meter appears on the upgrade screen.
2. Send until the Free limit: the message names the reset time and offers Upgrade only.
3. Use Local mode signed out of any plan: chat works with no credits used.

**Verification: seen working by a person.** scorecards/web.csv W-19 free: usage screen shows only 'Upgrade for higher capacity'. Seen failing: web-problems W-16 and W-18 free show 'Usage this period 0%' meter on Upgrade page.

## CAP-subscriptions-and-plans-02 Individual paid plan ladder

A set of paid personal tiers with rising prices and usage, from a low-cost tier to a top tier.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://claude.com/pricing](https://claude.com/pricing): [2026-11-22] Pro $20 monthly or $17 annual; Max $100 with 5x Pro usage; Ultra $200, no five-hour limit for verified accounts, 10x weekly. Plans: Pro, Max, Ultra. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan](https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan): [2026-11-22] Ultra is $200 a month, formerly Max 20x. Plans: Ultra. Apps: web, desktop, ios, android, cli.
- **ChatGPT: yes**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): [2026-11-22] Free $0, Go $8 (may include ads), Plus $20, Pro from $100 in three tiers (100, 200, 500). Plans: Free, Go, Plus, Pro. Apps: web, desktop, ios, android.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Plan Presentation And Usage Windows: names and prices owned by billing-catalog.ts)). AGI sells a ladder of individual plans whose names, prices and allowances come only from the plan catalog and show the same on every app.

**With different models, providers and the one subscription.** Plans gate model families and allowances through the catalog, never a hard-coded model. Provider cost changes do not change what a subscriber bought (see grandfathering).

**Current implementation, as this trace read it on 2026-11-24: built.** Basic $7, Premium $20, Max $100, Ultra $200 defined once; shown on web pricing, desktop and mobile plan lists. Purchase is closed by the waitlist gate. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S100.01, S100.02, S81.03, S81.04, S81.05, S81.06, S81.07
- Comparison list ids: W26; rows without an id: web: 'Low-price plan (Go $8)'; web: 'Standard plan at $20'; web: '$100 plan with 5x usage'; web: '$200 plan'
- Code: `packages/contracts/types/src/billing-catalog.ts:166-230`; `apps/web/app/pricing/page.tsx:785-818`

**Gap.** No equivalent of ChatGPT's $500 tier (W26). Whether to add one is an owner choice.

**Acceptance criteria**

1. Open pricing on web, desktop and mobile: names and prices match billing-catalog.ts.
2. Change a price in the catalog only: all apps show the new price after deploy.
3. Plan page states what '5x' multiplies.

**Verification: seen working by a person.** scorecards/web.csv W-1 subscribed: Billing shows 'Premium plan, Active, $20/mo' and the Upgrade dialog marks Premium as current. Other tiers code inspected only.

## CAP-subscriptions-and-plans-03 Annual billing for individual plans

A cheaper yearly price option with the saving shown and the switch from monthly to annual.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10185996-how-to-change-your-pro-plan-from-monthly-to-annual-billing](https://support.claude.com/en/articles/10185996-how-to-change-your-pro-plan-from-monthly-to-annual-billing): [2026-11-22] Pro switches to annual immediately; unused monthly time is credited on the first annual invoice. Plans: Pro. Apps: web.
  - [https://claude.com/pricing](https://claude.com/pricing): [2026-11-22] Max and Ultra are monthly only. Plans: Max, Ultra. Apps: web, desktop, ios, android.
- **ChatGPT: no**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): [2026-11-22] Go, Plus, Pro and Business pay by card with monthly billing; only Business and Enterprise annual. Plans: Go, Plus, Pro, Business. Apps: web.
  - [https://help.openai.com/en/articles/11989085-what-is-chatgpt-go](https://help.openai.com/en/articles/11989085-what-is-chatgpt-go): [2026-11-22] Go is monthly billing, no annual option. Plans: Go. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity (Claude only)). Offer a yearly price on individual plans where the owner chooses, with the saving shown and credit for unused monthly time on switching.

**With different models, providers and the one subscription.** Cadence changes billing only; entitlements and credits stay in the same ledger. A store-billed account follows the store's rules.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Only Team and Team Premium have yearly prices in the catalog. Ledger S83.02 says a monthly/annual toggle is done, which matches Team only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S81.17, S83.02
- Comparison list ids: W29
- Code: `packages/contracts/types/src/billing-catalog.ts:209-224`; `apps/web/app/pricing/page.tsx:1046`

**Gap.** No yearly price for Basic, Premium, Max or Ultra.

**Acceptance criteria**

1. Open pricing, switch to yearly: each individual plan shows its yearly price and saving.
2. Switch a monthly subscriber to yearly: the preview shows credit for unused time and the new renewal date.

**Verification: code inspected only.** billing-catalog.ts has yearlyPriceUsd only on team and team_premium; no person run.

## CAP-subscriptions-and-plans-04 Plan comparison and plan-gated feature explanations

A page or dialog that compares plans and says what each plan adds and why a blocked feature needs one.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://claude.com/pricing](https://claude.com/pricing): [2026-11-22] Plan matrix across Free, Pro, Max, Ultra; one usage pool across web, desktop, mobile and Claude Code. Plans: All plans. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): [2026-11-22] Feature list in plan comparison for Free, Go, Plus, Pro. Plans: Free, Go, Plus, Pro. Apps: web, desktop, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md rule 11 (one account and entitlement span the suite)). Every app can show what each plan includes and tells a blocked user which plan unlocks the feature.

**With different models, providers and the one subscription.** Lists read the catalog and model families, not literal model names. In Local mode the page says local features need no plan.

**Current implementation, as this trace read it on 2026-11-24: built.** Web pricing page and upgrade dialog; mobile plans list; CLI 'plans' command; VS Code compare command. Chrome unverified. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S81.09, S81.28, S83.01
- Comparison list ids: MP9; rows without an id: web: 'Compare plans page'; cli: 'List what each plan includes inside the CLI'; vscode: 'Compare plans and upgrade from the editor'
- Code: `apps/web/app/pricing/page.tsx:1384`; `apps/cli/src/lib.rs:7743`; `apps/mobile/src/features/settings/plans/index.tsx:59`

**Gap.** Seen defect: Basic plan card 'What changes' omits scheduled tasks (W-16). Mobile list partial (MP9). Chrome unverified.

**Acceptance criteria**

1. As Free, open a paid-only feature: the message names the plan that unlocks it.
2. Compare the plan card text with the catalog for every plan; no feature is missing.
3. Open plans in CLI and VS Code: same plans and prices as web.

**Verification: seen failing by a person.** web-problems W-16 free: Basic card lists only two changes. Gated messages for Connectors and Code seen working (scorecards W-17, W-18 free).

## CAP-subscriptions-and-plans-05 Buying or upgrading a paid plan

A signed-in user starts and completes checkout for a paid plan.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8325609-how-do-i-sign-up-for-the-pro-plan](https://support.claude.com/en/articles/8325609-how-do-i-sign-up-for-the-pro-plan): [2026-11-22] Settings > Billing > Upgrade plan; choose monthly or annual; pay by card; renews automatically. Plans: Pro. Apps: web, desktop.
  - [https://support.claude.com/en/articles/9266495-how-do-i-sign-up-for-claude-pro](https://support.claude.com/en/articles/9266495-how-do-i-sign-up-for-claude-pro) (this address is not in the saved catalogue; treat as unverified): [2026-11-22] Upgrade to Pro inside the iOS app. Plans: Pro. Apps: ios.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus): [2026-11-22] Profile menu > Upgrade plan > Get Plus. Plans: Plus. Apps: web.
  - [https://help.openai.com/en/articles/7905739-chatgpt-ios-app-upgrading-to-a-paid-subscription](https://help.openai.com/en/articles/7905739-chatgpt-ios-app-upgrading-to-a-paid-subscription): [2026-11-22] iOS upgrade in-app via Apple or via web checkout; offered plans depend on country. Plans: Plus, Pro. Apps: ios.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Paid Acquisition Gate)). Checkout is built and tested on web. Paid acquisition stays behind the waitlist or access-code gate until the founder opens it; the gate is one policy switch, not a per-app fork.

**With different models, providers and the one subscription.** Access codes authorize acquisition only, not a second subscription. Local and BYOK keep working with no purchase.

**Current implementation, as this trace read it on 2026-11-24: off by decision.** Web and desktop checkout built but closed by waitlist; mobile sells nothing in v1; CLI and VS Code send users to web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S100.14, S83.03, S83.28
- Comparison list ids: none matched; rows without an id: web: 'Buying or upgrading a plan' (Off by decision); mobile: 'Upgrade through the in-app store purchase' (Off by decision); cli: 'Slash command /upgrade' (Off by decision)
- Code: `apps/web/app/api/checkout/route.ts:308`; `apps/web/features/billing/services/upgrade-waitlist.ts`; `apps/mobile/src/features/billing/storePurchases.json (nativePurchases false)`

**Gap.** By decision, no live paid purchase. Checkout never run against a real sale; paid-launch gate evidence not accepted yet.

**Acceptance criteria**

1. As Free on web: Upgrade shows the waitlist and access-code step and takes no card.
2. With a valid access code: checkout completes and the plan shows Active on all apps.
3. On mobile: no purchase control appears.

**Verification: seen working by a person.** scorecards W-16, W-18 free: Upgrade leads to waitlist and access-code form; wrong code gives 'Enter a valid access code.' Real checkout not seen.

## CAP-subscriptions-and-plans-06 Mid-cycle upgrade with proration

Moving to a bigger plan takes effect now, with a credit for unused time shown before paying.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11049741-what-is-the-max-plan](https://support.claude.com/en/articles/11049741-what-is-the-max-plan): [2026-11-22] Moving between plans prorates; annual Pro balance above the Max price becomes account credit; Google Play charges full price and adds days. Plans: Pro, Max, Ultra. Apps: web.
  - [https://support.claude.com/en/articles/16607638-understanding-your-pro-max-or-ultra-plan-invoices](https://support.claude.com/en/articles/16607638-understanding-your-pro-max-or-ultra-plan-invoices): [2026-11-22] Mid-cycle upgrade resets the billing cycle with proration. Plans: Pro, Max, Ultra. Apps: web.
- **ChatGPT: unknown**
  - [https://help.openai.com/en/articles/9275245-chatgpt-free-tier-faq](https://help.openai.com/en/articles/9275245-chatgpt-free-tier-faq): [2026-11-22] Free-tier limits reset on upgrading to Plus, Pro or Business. Catalogue does not show proration rules for personal plans. Plans: Free. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Plan Change, Proration, And Subscription State Transitions)). An upgrade starts a new period now; the user sees credit, charge today and the next renewal date first; used credits and purchased balance carry over.

**With different models, providers and the one subscription.** Plan tier gates change at once on all apps from the one entitlement; spent usage is never reset.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and desktop built; mobile partial and closed with store purchases. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S81.23, S83.05
- Comparison list ids: none matched; rows without an id: web: 'Upgrade mid-cycle charges the prorated difference' (Off by decision)
- Code: `apps/web/lib/server/stripe-plan-change.ts:105`; `apps/web/features/billing/components/UpgradeConfirmDialog.tsx:248`; `apps/web/app/api/upgrade/preview/route.ts:46`

**Gap.** None known beyond the purchase gate.

**Acceptance criteria**

1. Preview an upgrade: credit, charge today and renewal date shown and equal the invoice.
2. After upgrade, used credits are unchanged and the new tier's models unlock on every app.
3. Replaying the webhook does not add credits twice.

**Verification: code inspected only.** No person has completed a paid upgrade in the scorecards.

## CAP-subscriptions-and-plans-07 Downgrade at end of period

Moving to a smaller plan, shown first, taking effect at the end of the paid period.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/16607638-understanding-your-pro-max-or-ultra-plan-invoices](https://support.claude.com/en/articles/16607638-understanding-your-pro-max-or-ultra-plan-invoices): [2026-11-22] Catalogue shows upgrade proration and cancellation but not downgrade rules. Plans: Pro, Max, Ultra. Apps: web.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/11989085-what-is-chatgpt-go](https://help.openai.com/en/articles/11989085-what-is-chatgpt-go): [2026-11-22] Downgrade from Plus or Pro to Go takes effect at cycle end without refund. Plans: Go. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/20001624-chatgpt-business-single-seat-configuration](https://help.openai.com/en/articles/20001624-chatgpt-business-single-seat-configuration): [2026-11-22] Business owners can schedule a seat reduction at the next billing cycle. Plans: Business. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Downgrade is not a code path; plan-tier gates drop, allowance changes at renewal) and ledger S81.24). A downgrade is reviewed first (price, features, limits, date), applies at period end, and access is kept until then.

**With different models, providers and the one subscription.** Model access follows the new tier from the stated date on every app; local use is unaffected.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop have a downgrade review dialog. The commercial doc says the upgrade API refuses a downgrade and sends users to the billing portal; the ledger says scheduling is done. Mobile defers to the store or web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S81.24, S83.04
- Comparison list ids: none matched
- Code: `apps/web/features/billing/components/DowngradeReviewDialog.tsx:140`; `docs/product/commercial.md (Plan Change section)`

**Gap.** Doc and ledger disagree on whether downgrade is a built path; needs a live test.

**Acceptance criteria**

1. Pick a lower plan: a review lists changes and the effective date; nothing changes until confirmed.
2. Until the date the higher plan still works; after it the lower limits apply.
3. Cancel the scheduled change: plan stays.

**Verification: not verified.** No person run; source documents disagree.

## CAP-subscriptions-and-plans-08 Cancel, end-of-term access and resume

A user cancels from the product, keeps access to period end, and can undo before it ends.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8325617-cancel-your-pro-max-or-ultra-subscription](https://support.claude.com/en/articles/8325617-cancel-your-pro-max-or-ultra-subscription): [2026-11-22] Cancel in Settings > Billing or the store; effective at period end; cancel 24 hours before billing; credits need an active plan. Plans: Pro, Max, Ultra. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7232927-canceling-your-chatgpt-subscription](https://help.openai.com/en/articles/7232927-canceling-your-chatgpt-subscription): [2026-11-22] Settings > Billing > Cancel plan; access continues to period end; uninstalling the app does not cancel store subscriptions. Plans: Plus, Pro, Business. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers): [2026-11-22] Cancellation keeps access to period end and is undoable. Plans: Pro. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Subscription Ownership: cancellation stays with the selling channel)). Cancel is self-serve, shows the end date and what is kept, and can be undone before the date. Cancellation stays with the channel that sold the plan; AGI never cancels a live subscription for the user.

**With different models, providers and the one subscription.** After the end date the account reads Free on every app; Local and BYOK keep working. Destructive steps use the confirm pattern from AGENTS.md section 9.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and desktop cancel and resume; mobile shows the cancel date and sends to store or web; VS Code shows scheduled cancellation. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S83.21, S83.22, S83.23, S83.24
- Comparison list ids: none matched; rows without an id: web: 'Cancel plan'; mobile: 'Cancel a subscription on the platform it was bought on' (Off by decision)
- Code: `apps/web/app/api/billing/resume-cancellation/route.ts`; `apps/web/features/billing/components/BillingPlanNotices.tsx:197`; `apps/web/features/settings/sections/BillingSection.tsx`

**Gap.** None known in code; not seen live.

**Acceptance criteria**

1. Cancel on web: the plan card shows the end date and 'access until'.
2. Resume before the date: the plan card returns to normal.
3. After the date: every app shows Free.

**Verification: code inspected only.** Cancel dialog only taken to a confirm step in scorecards for chats, not for plans.

## CAP-subscriptions-and-plans-09 One billing owner and store-managed subscriptions

Each subscription is billed and cancelled in the one place it was bought (web, Apple or Google); other places point there and warn before double billing.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12386328-request-a-refund-for-a-paid-claude-plan](https://support.claude.com/en/articles/12386328-request-a-refund-for-a-paid-claude-plan): [2026-11-22] iOS purchases are refunded by Apple only and must be cancelled separately. Plans: Pro, Max, Ultra, Team. Apps: ios, web.
  - [https://support.claude.com/en/articles/12938695-how-to-redeem-a-claude-gift-subscription](https://support.claude.com/en/articles/12938695-how-to-redeem-a-claude-gift-subscription): [2026-11-22] Gift redemption blocked while a mobile subscription is active. Plans: Pro, Max, Ultra. Apps: ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001043-how-do-i-avoid-being-charged-twice-if-i-subscribe-to-chatgpt-on-ios-android-and-the-web](https://help.openai.com/en/articles/20001043-how-do-i-avoid-being-charged-twice-if-i-subscribe-to-chatgpt-on-ios-android-and-the-web): [2026-11-22] Apple, Google Play and web subscriptions bill and cancel separately; switch by cancelling at the first store and waiting. Plans: Go, Plus, Pro. Apps: ios, android, web.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Subscription Ownership Across The Suite) and requirements.md section on one account and entitlement). One user, one subscription row, one billing owner. A second channel is refused while the first is entitled; the user is told where to manage it.

**With different models, providers and the one subscription.** All apps read the same entitlement whichever channel owns it. Local and BYOK are outside this.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile show store-managed notices and duplicate warnings. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S100.15, S81.27, S83.26, S83.27
- Comparison list ids: MP12; rows without an id: web: 'Store-billed subscriptions managed in the store'
- Code: `apps/web/lib/server/subscription-billing-owner.ts:94`; `apps/web/lib/server/subscription-owner-handoff.ts`; `apps/mobile/src/features/billing/subscriptionSource.ts:41`

**Gap.** Mobile alert partial (MP12).

**Acceptance criteria**

1. Account with a store plan opens web Billing: it says to manage in the store, with a link.
2. Try web checkout while a store plan is active: refused with a clear message.
3. After the store plan lapses, web checkout takes ownership and clears the store ids.

**Verification: code inspected only.** No person run of a two-channel case.

## CAP-subscriptions-and-plans-10 Mobile in-app purchase and restore

Buying, managing and restoring a plan through the Apple or Google store inside the phone app.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9612892-how-do-i-sign-up-for-claude-pro](https://support.claude.com/en/articles/9612892-how-do-i-sign-up-for-claude-pro) (this address is not in the saved catalogue; treat as unverified): [2026-11-22] Upgrade to Pro inside the Android app. Plans: Pro. Apps: android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7905739-chatgpt-ios-app-upgrading-to-a-paid-subscription](https://help.openai.com/en/articles/7905739-chatgpt-ios-app-upgrading-to-a-paid-subscription): [2026-11-22] Upgrade from an Upgrade button or Settings; Apple handles the purchase; in-app purchases may be unavailable in some countries. Plans: Plus, Pro. Apps: ios.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Mobile v1; Paid Acquisition Gate)). Mobile v1 sells nothing in the app and shows no purchase, upgrade, top-up or restore control. When the owner turns store purchase on, it opens with no waitlist or access code.

**With different models, providers and the one subscription.** Mobile reads the same entitlement as every app. On-device Local models are free and need no purchase.

**Current implementation, as this trace read it on 2026-11-24: off by decision.** Purchase, receipt check, confirmation and restore code built but switched off. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S100.17, S83.03, S83.25
- Comparison list ids: none matched; rows without an id: mobile: 'Restore earlier purchases' (Off by decision); mobile: 'In-app subscription prices (store billed)' (Off by decision)
- Code: `apps/mobile/src/features/billing/storePurchases.json`; `apps/web/lib/server/mobile-iap-catalog.ts:26`; `apps/mobile/lib/v1FeatureFlags.ts:6`

**Gap.** Store products and server flag not live; untested against real store sandboxes in the evidence.

**Acceptance criteria**

1. v1 build: no purchase, upgrade, top-up or restore control anywhere in the app.
2. Store build with the flag on: buy, kill the app, reopen, restore: plan active once, no second charge.

**Verification: not verified.** Owner deferral; no person run.

## CAP-subscriptions-and-plans-11 Payment methods, billing address, tax ID and local currency

Saved cards, billing address that sets tax, VAT or tax ID on invoices, and prices in the buyer's currency.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8325618-paid-plan-billing-faqs](https://support.claude.com/en/articles/8325618-paid-plan-billing-faqs): [2026-11-22] Add, remove and default cards; different invoice name; web accepts cards only. Plans: Pro, Max, Ultra. Apps: web.
  - [https://support.claude.com/en/articles/12997130-understanding-your-billing-address-and-tax-calculation](https://support.claude.com/en/articles/12997130-understanding-your-billing-address-and-tax-calculation): [2026-11-22] Billing address sets tax; a fixed address can be locked via Support. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/9402418-why-was-my-card-declined](https://support.claude.com/en/articles/9402418-why-was-my-card-declined): [2026-11-22] Cards; ACH for self-serve Enterprise; no PayPal or Venmo. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10421635-multicurrency-billing](https://help.openai.com/en/articles/10421635-multicurrency-billing): [2026-11-22] About 80 local currencies; regional payment methods on Go, Plus, Pro; to switch currency cancel and resubscribe. Plans: Go, Plus, Pro. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/9038389-updating-billing-information-tax-id-and-vat-id](https://help.openai.com/en/articles/9038389-updating-billing-information-tax-id-and-vat-id): [2026-11-22] Edit billing info and Tax ID; changes apply to future invoices only. Apps: web.

**AGI requirement** (inferred; source: competitor parity; ledger S83.06, S83.09-S83.12). Users manage cards, billing address and tax or VAT ID in the product, see tax and total before paying, and pay in a supported local currency.

**With different models, providers and the one subscription.** Payments go only through the payment provider layer; the same data serves every app. Local mode needs no payment details.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop built; local currency and tax shown; regional methods and tax-exemption request partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S83.06, S83.09, S83.10, S83.11, S83.12
- Comparison list ids: W53, WP17, WP21, WP24, WP29; rows without an id: web: 'Pay in local currency at checkout'
- Code: `apps/web/lib/billing/tax-policy.ts:94`; `apps/web/app/api/billing/payment-methods/route.ts:80`; `apps/web/lib/server/localized-pricing-service.ts`

**Gap.** Billing-information edit partial (WP24), UPI/Pix/bank debit missing (W53), tax-exemption request partial (WP29).

**Acceptance criteria**

1. Add a card, set it default, remove another: invoice shows the default.
2. Enter a VAT ID: the next invoice carries it and tax drops where law allows.
3. Checkout shows tax and total before payment.

**Verification: code inspected only.** Not covered by a person-run scorecard.

## CAP-subscriptions-and-plans-12 Invoices, receipts and billing history

A list of past bills and payments with downloadable invoices and receipts, plus credit notes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16607638-understanding-your-pro-max-or-ultra-plan-invoices](https://support.claude.com/en/articles/16607638-understanding-your-pro-max-or-ultra-plan-invoices): [2026-11-22] Invoice emailed per renewal; view in Settings > Billing > Invoices; app-store plans are receipted by the store. Plans: Pro, Max, Ultra. Apps: web, ios, android.
  - [https://support.claude.com/en/articles/16607668-understanding-your-team-plan-invoices](https://support.claude.com/en/articles/16607668-understanding-your-team-plan-invoices): [2026-11-22] Team invoices cover renewal, seat change and credit notes. Plans: Team. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12356340-finding-past-chatgpt-invoices](https://help.openai.com/en/articles/12356340-finding-past-chatgpt-invoices): [2026-11-22] Invoices list in Billing settings; store receipts from Apple or Google. Plans: Go, Plus, Pro, Business. Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; ledger S83.16-S83.20, S83.32). Users see a list of past bills and credit purchases and download invoices and receipts; credit notes appear when issued.

**With different models, providers and the one subscription.** One billing history on all apps for a web-billed account; store-billed accounts link to the store.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop have history, invoice and receipt download and refund status; mobile opens web invoices; credit notes and auto-reload history missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S83.16, S83.17, S83.18, S83.19, S83.20, S83.32, S83.33
- Comparison list ids: none matched; rows without an id: web: 'Invoices list with link to each invoice'
- Code: `apps/web/features/settings/sections/BillingSection.tsx:1273`; `apps/web/app/api/billing/receipts/route.ts:1`; `apps/web/lib/services/billing-invoice-service.ts:46`

**Gap.** Credit-note display (S83.19) and auto-reload history (S83.33) missing on every app; mobile shows no credit purchases (S83.32).

**Acceptance criteria**

1. After a payment, the list shows it and the PDF downloads.
2. A refunded payment shows its refund status.
3. An issued credit note is visible (not yet possible).

**Verification: code inspected only.** Ledger and code; no person run.

## CAP-subscriptions-and-plans-13 Refunds and legal withdrawal rights

A way to request a refund, with fixed rules by region and by purchase channel.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12386328-request-a-refund-for-a-paid-claude-plan](https://support.claude.com/en/articles/12386328-request-a-refund-for-a-paid-claude-plan): [2026-11-22] Get help > Claude Refund Request; non-refundable except under terms or law; EEA and UK prorated refund within 14 days; credits non-refundable with exceptions. Plans: Pro, Max, Ultra, Team. Apps: web, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7232895-how-do-i-request-a-refund-for-my-chatgpt-subscription](https://help.openai.com/en/articles/7232895-how-do-i-request-a-refund-for-my-chatgpt-subscription): [2026-11-22] Discretionary refund within seven days for unused individual plans; EU, UK, Turkey prorated within 14 days; Korea and Brazil rules; Apple purchases refunded by Apple. Plans: Plus, Pro. Apps: web, ios.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Plan Change section: refund and withdrawal rules)). Users request refunds in the product; EU, EEA and UK users get the 14-day right, prorated by credits used when immediate access was requested; refunds change credits and plan only through the payment webhook.

**With different models, providers and the one subscription.** A refund takes back the refunded share of plan allowance, never purchased credits of other periods; store purchases are refunded by the store.

**Current implementation, as this trace read it on 2026-11-24: built.** Web refund form, refund status on web and desktop; mobile says refunds go through the store. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S100.19, S83.20
- Comparison list ids: none matched; rows without an id: web: 'Refund request'; web: 'Regional refund rights (EU, UK 14-day withdrawal)'; mobile: 'Refund requests (Apple and Google only, or Get help flow)' (Off by decision)
- Code: `apps/web/app/refund-policy/RefundRequestForm.tsx`; `apps/web/lib/billing/withdrawal-consent.ts`; `apps/web/lib/services/billing-refund-service.ts`

**Gap.** None known in code; legal copy under owner and legal review.

**Acceptance criteria**

1. EU test customer within 14 days: refund equals unused share of credits.
2. Customer without recorded consent: full refund.
3. Refund webhook alone changes credits and plan.

**Verification: code inspected only.** Payment test mode not run by a person in the evidence.

## CAP-subscriptions-and-plans-14 Failed payment and grace handling

When a renewal fails, the user is told what access remains and how to fix it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/11818288-why-am-i-being-asked-to-verify-my-payment-method](https://support.claude.com/en/articles/11818288-why-am-i-being-asked-to-verify-my-payment-method): [2026-11-22] Payment method verification prompt appears; the catalogue does not describe renewal grace. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7242622-troubleshooting-chatgpt-plus-or-pro-renewal-payments](https://help.openai.com/en/articles/7242622-troubleshooting-chatgpt-plus-or-pro-renewal-payments): [2026-11-22] A failed renewal shows an outstanding invoice under Billing, may offer PayPal; paying does not authorize future automatic payments. Plans: Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (state ladder in subscription-access-policy.ts)). A failed renewal puts the account in a defined state with a clear message and a way to pay on every app; access never rises as state falls.

**With different models, providers and the one subscription.** Past-due drops managed access on every app at once; Local and BYOK still work.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Notices on web, desktop, mobile, CLI, VS Code, Chrome. A person saw the Billing page say Active after the period had ended, and chat failed with a billing-period error. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S81.25, S83.14, S83.15
- Comparison list ids: none matched; rows without an id: web: 'Failed renewal keeps the plan and shows how to pay'
- Code: `apps/web/features/billing/components/BillingPlanNotices.tsx:112`; `apps/web/app/payment-failure/page.tsx:47`; `apps/cli/src/usage_summary.rs:557`

**Gap.** Billing says Active while the period ended and no credits exist (W-12, W-14, W-19). The error says to check Billing, which shows no period or renewal date.

**Acceptance criteria**

1. Lapse a period: Billing shows Past due or Ended with the date and a Pay now action.
2. The chat error names the same state and the fix.
3. Pay: access returns without a restart.

**Verification: seen failing by a person.** web-problems W-12, W-14, W-19 subscribed: 'billing period ended on Nov 19, 2026' while Billing says Active.

## CAP-subscriptions-and-plans-15 Credits past plan limits

After included usage is gone, the user can pay for more with credits, set a monthly cap, and auto-reload.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans): [2026-11-22] Enable usage credits in Settings > Usage; monthly spend limit; auto-reload; credits need an active paid plan; 12-month expiry from Dec 7 2026. Plans: Pro, Max, Ultra. Apps: web, ios, android, cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans): [2026-11-22] Pay-as-you-go credits after included usage; automatic reload with minimum, target and monthly cap on Plus and Pro. Plans: Free, Go, Plus, Pro. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Allowance And Purchased Balance Are Distinct Entitlements)). Purchased credits are a separate balance, off by default, spent only after plan allowance, within a personal cap, with 12-month expiry and an 'on credits now' notice.

**With different models, providers and the one subscription.** Credits pay for managed usage on any provider route. They are never spent in Local mode or on BYOK, which the user pays directly.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and desktop built; CLI, VS Code and Chrome point to web; mobile off by decision. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S100.07, S100.08, S81.20, S81.21
- Comparison list ids: W46, WP19; rows without an id: web: 'Buy credits in preset amounts'; web: 'Automatic credit reload'; web: 'Monthly spend limit for credits'
- Code: `apps/web/app/api/billing/overage/route.ts:102`; `apps/web/app/api/billing/top-up/route.ts:164`; `apps/web/features/billing/components/AutoReloadPanel.tsx`

**Gap.** No 'now using credits' notice (W46); expiry display partial (WP19); seen defect: credit banner and sidebar meter stale after image generations (W-7).

**Acceptance criteria**

1. With credits off, hit the limit: send is refused and Add credits is offered.
2. Turn credits on with a cap: next turn runs on credits and says so.
3. Purchased balance carries to the next period; allowance does not.

**Verification: seen failing by a person.** web-problems W-7 subscribed: banner and meter stale until reload; image send fails silently at credit limit.

## CAP-subscriptions-and-plans-16 Discounted prepaid usage bundles

Pre-buying credits in fixed amounts at a discount.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/14246112-buy-usage-bundles](https://support.claude.com/en/articles/14246112-buy-usage-bundles): [2026-11-22] $50, $250 or $1000 bundles at 10%, 20% or 30% off; one pool across Claude apps and Claude Code; used only after plan usage; non-refundable. Plans: Pro, Max, Ultra, Team. Apps: web, desktop, ios, android, cli.
- **ChatGPT: no**
  - [https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans): [2026-11-22] Credits bought in preset or custom amounts; catalogue shows no bundle discount. Plans: Free, Go, Plus, Pro. Apps: web.

**AGI requirement** (proposed; source: competitor parity (Claude only)). Not a requirement unless the owner chooses it. If built, bundles sit in the same ledger as purchased credits.

**With different models, providers and the one subscription.** Would be a price-only change to purchased credits; no model or provider link.

**Current implementation, as this trace read it on 2026-11-24: not built.** No bundles in any app. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W36
- Code: `searched: usage bundle in apps/web (comparison-web.csv W36)` (not found)

**Gap.** Whole feature; margin and refund model undecided.

**Acceptance criteria**

1. If chosen: buying a bundle adds the stated credits and shows the discount.
2. Bundle credits spend only after plan allowance.

**Verification: not verified.** Absent in code per ledger search.

## CAP-subscriptions-and-plans-17 One subscription shared across apps and coding tools

One plan and one usage pool apply on web, desktop, phone and the coding tool.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan): [2026-11-22] All activity in Claude and Claude Code counts together; an API key in the environment overrides the subscription. Plans: Pro, Max, Ultra. Apps: cli, ide, web.
- **ChatGPT and Codex: yes**
  - [https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan): [2026-11-22] Codex, Work, Excel and Workspace Agents share one allowance or credit pool; /status in the CLI shows it. Plans: All plans. Apps: cli, desktop.
  - [https://learn.chatgpt.com/docs/pricing.md](https://learn.chatgpt.com/docs/pricing.md): [2026-11-22] Codex access depends on the ChatGPT plan; API-key sign-in is separate. Plans: Free, Go, Plus, Business, Pro. Apps: web, desktop, cli, ide.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md rule 11; docs/product/requirements.md section on one account and entitlement). One account, one entitlement and one usage pool on all six apps; no surface sells its own subscription.

**With different models, providers and the one subscription.** Any model or provider used through AGI-managed routes draws the same credits. BYOK and Local use do not draw them; a key set in the tool changes who pays and the tool says so.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile, CLI, VS Code, Chrome and API read the same entitlement; Chrome tasks and CLI use count against the same allowance. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S100.03, S81.27
- Comparison list ids: none matched; rows without an id: web: 'One usage pool across web, desktop, mobile and code'; cli: 'CLI usage counts against the same allowance as chat'; vscode: 'One usage pool shared by the editor and the apps'; chrome: 'Browser tasks count toward the same plan usage as chat'
- Code: `apps/web/lib/services/entitlement-resolution.ts:253`; `apps/cli/src/lib.rs:1057`; `apps/extension-vscode/src/data/usagePresentation.ts`

**Gap.** None known; cross-app agreement not seen by a person.

**Acceptance criteria**

1. Use credits in CLI, then open web Usage: figures agree.
2. Upgrade on web: CLI, VS Code and Chrome show the new plan after refresh.
3. Set a provider key in the CLI: the tool says usage is billed to that key.

**Verification: code inspected only.** Scorecards cover web only.

## CAP-subscriptions-and-plans-18 Promotions, promo codes and trials

Codes and offers that give a discount, free period or trial, with clear end and renewal terms.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/8325606-what-is-the-pro-plan](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan): [2026-11-22] No standing discounts or coupons for individual plans; occasional promotions. Plans: Pro, Max, Ultra. Apps: web.
  - [https://support.claude.com/en/articles/11107691-why-is-a-coupon-or-promotion-not-available-for-my-account](https://support.claude.com/en/articles/11107691-why-is-a-coupon-or-promotion-not-available-for-my-account): [2026-11-22] Promotions limited to first-time paid subscribers. Apps: ios, android, web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10492689-chatgpt-plus-promotions-and-referrals](https://help.openai.com/en/articles/10492689-chatgpt-plus-promotions-and-referrals): [2026-11-22] Partner promo codes redeemed by link; one per subscriber; renews at standard rate after the promo. Plans: Plus. Apps: web.
  - [https://help.openai.com/en/articles/8381046-chatgpt-promotional-subscriptionsfree-trial-invites-faq](https://help.openai.com/en/articles/8381046-chatgpt-promotional-subscriptionsfree-trial-invites-faq): [2026-11-22] Trial invites; cancel 24 hours before renewal. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (access codes authorize acquisition, not a second subscription); ledger S83.07, S83.08, S81.18, S81.19). Codes and trials are applied to the account, visible, and show length, end date, price after and how to cancel. They authorize acquisition only.

**With different models, providers and the one subscription.** A promo changes price or period, never the model list; entitlement stays the single account plan.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Promo field, trial terms and expiry job built on web and desktop; the comparison marks promo code at checkout off by decision. Referral bonus credits built. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S100.22, S100.23, S81.18, S81.19, S83.07, S83.08
- Comparison list ids: none matched; rows without an id: web: 'Promotion code at checkout' (Off by decision); web: 'Promo code redemption at checkout' (Off by decision); web: 'Referral bonus credits'; mobile: 'Promo codes, gift redemption and partner offers' (Off by decision)
- Code: `apps/web/features/billing/components/UpgradePromotionCode.tsx:31`; `apps/web/lib/services/code-trial-expiry.ts:36`; `apps/web/app/api/cron/expire-code-trials/route.ts:16`

**Gap.** Promo path off while purchasing is gated; not seen live.

**Acceptance criteria**

1. Enter a valid code: the order shows the discount and the price after.
2. A trial shows its end date and what is charged after.
3. An expired trial reverts to Free on all apps.

**Verification: code inspected only.** Wrong access code message seen (W-18 free) but not promo codes.

## CAP-subscriptions-and-plans-19 Gifts, gift cards and wallet balance

Buying a plan or credits for someone else, or holding a prepaid wallet balance used for charges.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/12938627-how-to-gift-a-claude-subscription](https://support.claude.com/en/articles/12938627-how-to-gift-a-claude-subscription): [2026-11-22] Gift subscriptions by email or link; purchasing is currently unavailable for all accounts; earlier gifts expire after 365 days. Plans: Pro, Max, Ultra. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001417-gifting-credits-in-chatgpt](https://help.openai.com/en/articles/20001417-gifting-credits-in-chatgpt): [2026-11-22] Plus and Pro users buy prepaid gift credits and share a claim link. Plans: Plus, Pro (buy). Apps: web.
  - [https://help.openai.com/en/articles/20001491-buying-and-redeeming-openai-gift-cards](https://help.openai.com/en/articles/20001491-buying-and-redeeming-openai-gift-cards): [2026-11-22] US gift cards $15 to $250 redeemed into a wallet balance used first for subscriptions, upgrades and credits (web only). Plans: Free, Go, Plus, Pro, Business. Apps: web.

**AGI requirement** (proposed; source: competitor parity (ChatGPT; Claude paused)). Owner decision needed. If built, gifted value lands in the same account ledger with the same refund and dispute rules.

**With different models, providers and the one subscription.** A pure payment feature; no model or provider effect.

**Current implementation, as this trace read it on 2026-11-24: not built.** No gift or redeem flow; a wallet-style transaction history is partial on web. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W32, W41, W52, WP35
- Code: `searched: gift in apps/web (comparison-web.csv W41, W52)` (not found)

**Gap.** Gifts, gift cards, wallet.

**Acceptance criteria**

1. If chosen: a recipient redeems a gift once and the plan or credits show on all apps.
2. A refunded gift is removed through the refund path.

**Verification: not verified.** Absent in code per ledger search.

## CAP-subscriptions-and-plans-20 Team plan with standard and premium seats

A shared plan for a group, bought per seat, with a bigger seat tier and an admin who owns billing.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9266767-what-is-the-team-plan](https://support.claude.com/en/articles/9266767-what-is-the-team-plan): [2026-11-22] Minimum two members, up to 150 seats; Standard $25 monthly or $20 annual, Premium $125 or $100 per member; limits per member. Plans: Team. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/9267289-how-is-my-team-plan-bill-calculated](https://support.claude.com/en/articles/9267289-how-is-my-team-plan-bill-calculated): [2026-11-22] Seat adds and upgrades prorate at once; removing a member gives no credit. Plans: Team. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8542115-chatgpt-business-general-faq](https://help.openai.com/en/articles/8542115-chatgpt-business-general-faq): [2026-11-22] Business Standard $25 monthly or $20 annual; Premium $125 or $100; mix seat types; may start with one paid seat. Plans: Business. Apps: web.
  - [https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes](https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes): [2026-11-22] ChatGPT Team renamed ChatGPT Business on 2025-08-29. Plans: Business. Apps: web.

**AGI requirement** (inferred; source: competitor parity; ledger S83.28). A team owner buys a seat count and two seat types, adds seats with proration, and billing stays one subscription for the workspace.

**With different models, providers and the one subscription.** Seat type sets allowance and model-family access from the catalog. Team usage is pooled through the workspace spend limit; Local mode on a member's device needs no seat.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web checkout accepts seat count and seat type; the first Team purchase hits the waitlist gate (403); desktop partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S81.16, S83.28
- Comparison list ids: none matched; rows without an id: web: 'Team or Business plan with standard and premium seats'
- Code: `packages/contracts/types/src/billing-catalog.ts:209-224`; `apps/web/app/api/checkout/route.ts:245`; `apps/web/lib/validations/checkout.ts:52`

**Gap.** Team purchase closed by the waitlist; premium seats not sold in every interval or currency (checkout route messages).

**Acceptance criteria**

1. With access, buy two seats: invoice shows seat count and tax.
2. Add a seat: charge is prorated and the renewal date is unchanged.
3. Premium seat: higher allowance shows for that member only.

**Verification: not verified.** No person run on any team purchase.

## CAP-subscriptions-and-plans-21 Team seat assignment and billing administration

Owners assign seats, see seats used and licensed, set billing contacts, view invoices and cancel the team plan.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12997503-team-plan-billing-faqs](https://support.claude.com/en/articles/12997503-team-plan-billing-faqs): [2026-11-22] Owner sets billing email and invoice name, views invoices in Organization settings > Billing; cards only; tax-exempt via Support. Plans: Team. Apps: web.
  - [https://support.claude.com/en/articles/9267323-cancel-your-organization-s-team-plan-subscription](https://support.claude.com/en/articles/9267323-cancel-your-organization-s-team-plan-subscription): [2026-11-22] Owner cancels; access lasts to cycle end. Plans: Team. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8792536-managing-billing-and-seats-in-chatgpt-business](https://help.openai.com/en/articles/8792536-managing-billing-and-seats-in-chatgpt-business): [2026-11-22] Owners review invoices, seats, change cadence at renewal, enter Tax ID, add credits, cancel; no invoice, ACH or PO on self-serve. Plans: Business. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W22 (workspace administration: invites, seat limits, role changes, removal)). Admins see seats used and licensed, invite and remove members, hold a billing contact, and cancel the workspace plan.

**With different models, providers and the one subscription.** Admin policy can limit which models, providers and connectors members use; it cannot reach into Local-mode chats.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop and mobile show seats and invitations. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S83.29, S83.30
- Comparison list ids: none matched; rows without an id: web: 'Plan limits for Team: shared usage and workspace spend limit'
- Code: `apps/web/features/workspace-console/components/WorkspaceBillingSummary.tsx:124`; `apps/web/app/api/settings/team/invitations/route.ts:75`; `apps/mobile/app/(app)/settings/workspace.tsx:268`

**Gap.** None known; not run live.

**Acceptance criteria**

1. Invite beyond the seat count: blocked with a message to add seats.
2. Remove a member: seat frees and billing follows the stated rule.
3. Non-admins cannot open billing.

**Verification: code inspected only.** Not in a person-run scorecard.

## CAP-subscriptions-and-plans-22 Admin spend limits and requests for more usage

Admins cap spend for the workspace, groups and individuals; blocked members can ask for more; admins get alerts.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13799932-manage-groups-and-group-spend-limits](https://support.claude.com/en/articles/13799932-manage-groups-and-group-spend-limits) (this address is not in the saved catalogue; treat as unverified): [2026-11-22] Group spend limits and multi-group resolution setting; blocked-by-limit view. Plans: Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/17005973-manage-pooled-group-budgets-on-enterprise](https://support.claude.com/en/articles/17005973-manage-pooled-group-budgets-on-enterprise) (this address is not in the saved catalogue; treat as unverified): [2026-11-22] User message when the team budget runs out. Plans: Enterprise. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001001-manage-usage-limits-and-overages-](https://help.openai.com/en/articles/20001001-manage-usage-limits-and-overages-) (this address is not in the saved catalogue; treat as unverified): [2026-11-22] Workspace overage limit and monthly USD budget; alerts; limits by group and individual overrides. Plans: Enterprise, Edu. Apps: web.
  - [https://help.openai.com/en/articles/20001155-managing-credits-and-spend-contro](https://help.openai.com/en/articles/20001155-managing-credits-and-spend-contro) (this address is not in the saved catalogue; treat as unverified): [2026-11-22] Business monthly credit limits per seat type and per user. Plans: Business. Apps: web.

**AGI requirement** (inferred; source: competitor parity; ledger S83.29 and S100.13). Admins set per-member, group and seat-type limits, see who is blocked or near a limit, and members can request more.

**With different models, providers and the one subscription.** Limits count AGI credits across all providers. They never cap Local mode or a user's own BYOK key.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Workspace spend limit and alerts built on web; per-member, group, seat-type limits, request-more and blocked-members view missing; CLI and desktop partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S100.13, S81.16
- Comparison list ids: C14, D4, DP5, V2, W23, W25, W27, W45, W49, WP30
- Code: `apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:165`; `apps/web/app/api/settings/organization/spend-limit/route.ts`

**Gap.** Per-member and group budgets, request-more flow and admin blocked view.

**Acceptance criteria**

1. Set a per-member cap: that member is stopped at the cap and sees who to ask.
2. The member presses Request more: the admin sees it.
3. Alerts reach the chosen people at the chosen thresholds.

**Verification: not verified.** Absent or partial per ledger; no person run.

## CAP-subscriptions-and-plans-23 Enterprise plan with contract and invoice billing

A contract-priced plan, bought through sales or in some cases self-serve, billed by invoice or token usage.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9797531-what-is-the-enterprise-plan](https://support.claude.com/en/articles/9797531-what-is-the-enterprise-plan): [2026-11-22] Single seat fee plus usage at API rates; self-serve minimum 20 seats, card or ACH; sales-assisted minimum 50 seats with invoicing; SSO, SCIM, audit logs. Plans: Enterprise. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001520-token-based-billing-for-chatgpt-enterprise](https://help.openai.com/en/articles/20001520-token-based-billing-for-chatgpt-enterprise): [2026-11-22] Eligible agreements meter Chat, Work and Codex in tokens, invoiced monthly in arrears. Plans: Enterprise. Apps: web.
  - [https://help.openai.com/en/articles/8156167-invoice-dates-for-chatgpt-and-api-](https://help.openai.com/en/articles/8156167-invoice-dates-for-chatgpt-and-api-) (this address is not in the saved catalogue; treat as unverified): [2026-11-22] Enterprise billing set by agreement. Plans: Enterprise. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Payment Guidance; Enterprise Path)). Enterprise is contract priced, with billing contacts, purchase orders, invoices and offline payment records; card top-ups are not the default for enterprise credits.

**With different models, providers and the one subscription.** Contract terms set model and provider policy for the organization and the credit pool; a region policy can restrict routes. Local mode stays under organization policy only where the owner has defined it.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web contract screen, billing contacts and PO and invoice workflows built. Self-serve Enterprise purchase missing (W31). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S100.21, S100.25, S83.30, S83.31
- Comparison list ids: W31; rows without an id: web: 'Enterprise plan with custom pricing'; web: 'Workspace credit balance, usage report download and invoices for admin'
- Code: `apps/web/features/workspace-console/components/WorkspaceEnterpriseContract.tsx:270`; `apps/web/lib/services/enterprise-contracts/invoicing.ts:287`; `apps/web/db/neon/0288_enterprise_offline_payment_records.sql:33`

**Gap.** Self-serve Enterprise (a Claude-only option) not built; launch needs SSO and SCIM and a managed-credit ledger per commercial.md.

**Acceptance criteria**

1. Record a PO: the PO number prints on the invoice.
2. Enterprise admin sees billing contacts and the contract.
3. Offline payment is recorded and shown on the balance.

**Verification: code inspected only.** Ledger and code; no person run.

## CAP-subscriptions-and-plans-24 Moving between personal, team and enterprise plans

Merging a personal account into a team, or upgrading Team to Enterprise, with the personal plan ended and refunded.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12997503-team-plan-billing-faqs](https://support.claude.com/en/articles/12997503-team-plan-billing-faqs): [2026-11-22] Upgrading a personal plan to Team in place cancels it with a prorated refund about 24 hours after the Team payment; opt-out available. Plans: Pro, Max, Ultra, Team. Apps: web.
  - [https://support.claude.com/en/articles/13779868-migrate-your-organization-from-team-to-enterprise](https://support.claude.com/en/articles/13779868-migrate-your-organization-from-team-to-enterprise): [2026-11-22] Self-serve Team to Enterprise keeps chats, projects, members; 20-seat minimum; irreversible. Plans: Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8801890-migrating-your-personal-workspace-to-chatgpt-business-or-enterprise](https://help.openai.com/en/articles/8801890-migrating-your-personal-workspace-to-chatgpt-business-or-enterprise): [2026-11-22] Merging into Business cancels the personal subscription with a prorated refund except store subscriptions; wallet funds and credits do not move. Plans: Business. Apps: web.

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 9 (irreversible actions name the consequence)). Joining a workspace never leaves a user paying twice; the personal plan ends with a stated refund and the user sees what moves and what does not.

**With different models, providers and the one subscription.** The user's one entitlement changes owner; Local chats stay on the device and do not move to the workspace.

**Current implementation, as this trace read it on 2026-11-24: not built.** No personal-to-workspace merge or Team-to-Enterprise migration path found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W24
- Code: `searched: merge personal subscription, domain claim refund (comparison-web.csv W24)` (not found)

**Gap.** Whole flow, including refund of the personal plan.

**Acceptance criteria**

1. Join a workspace with a paid personal plan: a prompt names the refund and cancellation first.
2. After the join, one active plan and one invoice.

**Verification: not verified.** Absent in code per ledger search.

## CAP-subscriptions-and-plans-25 Education, teacher, nonprofit and verified-user programs

Free or discounted plans for verified teachers, students, researchers, nonprofits, veterans and clinicians.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/15926041-claude-for-teachers-your-data-and-our-terms](https://support.claude.com/en/articles/15926041-claude-for-teachers-your-data-and-our-terms): [2026-11-22] Free Pro-level access for verified US K-12 educators through 2028-07-30; not for students. Plans: Claude for Teachers. Apps: web, desktop.
  - [https://support.claude.com/en/articles/11139144-use-claude-for-education-at-your-university](https://support.claude.com/en/articles/11139144-use-claude-for-education-at-your-university): [2026-11-22] University-sponsored Education plan. Plans: Education. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/8325606-what-is-the-pro-plan](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan): [2026-11-22] Nonprofit pricing on Team and Enterprise. Plans: Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12844995-chatgpt-for-teachers](https://help.openai.com/en/articles/12844995-chatgpt-for-teachers): [2026-11-22] Free through June 2028 for verified US K-12 educators. Plans: Teachers. Apps: web.
  - [https://help.openai.com/en/articles/20001493-chatgpt-back-to-school-offer-for-students](https://help.openai.com/en/articles/20001493-chatgpt-back-to-school-offer-for-students): [2026-11-22] Four free months of Plus for verified US students; claim by 2026-10-31. Plans: Plus. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/12803158-chatgpt-plus-for-service-members-veterans-retirees-terms-of-service](https://help.openai.com/en/articles/12803158-chatgpt-plus-for-service-members-veterans-retirees-terms-of-service): [2026-11-22] One free year of Plus for verified US service members and veterans. Plans: Plus. Apps: web.

**AGI requirement** (proposed; source: competitor parity). Owner decision needed on which programs to run. If built, they use a verification partner and a normal entitlement grant with an end date.

**With different models, providers and the one subscription.** A grant is a plan entitlement like any other; it changes allowance, not model choice. Local mode stays free for everyone without verification.

**Current implementation, as this trace read it on 2026-11-24: not built.** None of these programs exist in the web app. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W18, W19, W20, W22, W37, W38, W39, W40, W42, W57; rows without an id: mobile: 'Student, teacher and country promotions' (Off by decision)
- Code: `searched: teachers, edu_plan, sheerid, nonprofit in apps/web (comparison-web.csv W19, W20, W22)` (not found)

**Gap.** All programs.

**Acceptance criteria**

1. If chosen: a verified teacher gets the stated plan with an end date and no card.
2. A non-verified user cannot claim it.
3. The grant ends cleanly on the end date.

**Verification: not verified.** Absent in code per ledger search.

## CAP-subscriptions-and-plans-26 Monthly API credits bundled with top plans

Top plans include a monthly amount of developer API credits, claimed by linking an API organization.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-ul](https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-ul) (this address is not in the saved catalogue; treat as unverified): [2026-11-22] Max, Ultra and Team get monthly Platform API credits claimed by linking a Console organization; they expire each cycle and do not work in apps. Plans: Max, Ultra, Team. Apps: web, cli.
- **ChatGPT: yes**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): [2026-11-22] Pro from $100 in three tiers with matching monthly API credits. Plans: Pro. Apps: web.

**AGI requirement** (proposed; source: competitor parity). Owner decision needed. If built, bundled developer credits are a separate balance from plan usage and clearly labelled.

**With different models, providers and the one subscription.** Would be spent on the AGI developer API through any provider route; separate from chat allowance.

**Current implementation, as this trace read it on 2026-11-24: not built.** A developer console with usage and billing pages exists (partial); no bundled monthly credits. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S81.26
- Comparison list ids: W21, W44, WP20, WP23
- Code: `apps/web/app/api/developers/usage/route.ts:8`

**Gap.** Bundled credits and linking.

**Acceptance criteria**

1. If chosen: a Max subscriber links an API org and sees the monthly amount, with an expiry date.
2. Credits do not fund chat.

**Verification: not verified.** Absent per ledger search.

## CAP-subscriptions-and-plans-27 Device and card limits on paid accounts

A cap on devices and cards per paid personal account to limit sharing and abuse.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/11818288-why-am-i-being-asked-to-verify-my-payment-method](https://support.claude.com/en/articles/11818288-why-am-i-being-asked-to-verify-my-payment-method): [2026-11-22] Only a payment-method verification prompt is shown; no device cap in the catalogue. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001559-understanding-card-and-device-limits-in-chatgpt](https://help.openai.com/en/articles/20001559-understanding-card-and-device-limits-in-chatgpt): [2026-11-22] Go, Plus and Pro count toward per-device and per-card limits; hitting one blocks a purchase or shows Device limit reached. Plans: Go, Plus, Pro. Apps: web, ios, android, desktop.

**AGI requirement** (proposed; source: docs/product/commercial.md (Managed Credit Requirements: fraud/risk controls)). Not required. Abuse controls for paid and free accounts are the paid-launch gate (fraud and risk controls).

**With different models, providers and the one subscription.** Must not limit Local mode, which is free and device-bound.

**Current implementation, as this trace read it on 2026-11-24: not built.** No device or card limit. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W48; rows without an id: mobile: 'Device limit warning on paid accounts' (Off by decision)
- Code: `searched: device limit in apps/web (comparison-web.csv W48)` (not found)

**Gap.** Feature absent; the need is an owner choice.

**Acceptance criteria**

1. If chosen: a user over the cap sees which devices count and how to free one.

**Verification: not verified.** Absent per ledger search.

## CAP-subscriptions-and-plans-28 Coding tool access by plan

The terminal and editor coding tool signs in with the same plan and shows what the plan includes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://claude.com/product/claude-code](https://claude.com/product/claude-code): [2026-11-22] Claude Code is included with Pro, Max, Ultra, Team, Enterprise and Console. Plans: Pro, Max, Ultra, Team, Enterprise, Console. Apps: cli, desktop.
  - [https://support.claude.com/en/articles/14553413-claude-code-cheatsheet](https://support.claude.com/en/articles/14553413-claude-code-cheatsheet): [2026-11-22] /cost, /usage and /context show spend and limits. Plans: Pro, Max, Ultra, Team, Enterprise. Apps: cli.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/pricing.md](https://learn.chatgpt.com/docs/pricing.md): [2026-11-22] Codex access listed for Free, Go, Plus, Business, Pro; Business adds larger cloud VMs and credits. Plans: Free, Go, Plus, Business, Pro. Apps: web, desktop, cli, ide.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (CLI/VS Code entitled through the same account)). CLI and VS Code show the account plan, usage and upgrade path from the same entitlement and handle a missing plan with a clear message.

**With different models, providers and the one subscription.** The tools may run Local or BYOK without a plan; managed models need the entitlement. The tool states which route is billing.

**Current implementation, as this trace read it on 2026-11-24: built.** CLI has plans, /usage, /cost, /budget; VS Code shows plan usage and comparison. Upgrade commands off by decision. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S81.09, S81.14, S81.27
- Comparison list ids: VP3; rows without an id: cli: 'List what each plan includes inside the CLI'; cli: 'Slash command /upgrade' (Off by decision); vscode: 'Compare plans and upgrade from the editor'
- Code: `apps/cli/src/lib.rs:7743`; `apps/cli/src/tui/tui_app.rs:6439`; `apps/extension-vscode/src/core/commandSetup.ts:2076`

**Gap.** VP3 partial; CLI missing status-line plan usage (C25) and 75/95% spend warnings (C24); /upgrade off by decision.

**Acceptance criteria**

1. Signed in on a paid plan: /usage in the CLI matches web Usage.
2. On a plan without access: the tool names the plan that unlocks it.
3. With a BYOK key set: the tool says usage bills to the key.

**Verification: code inspected only.** No person run of CLI or VS Code billing.

## CAP-subscriptions-and-plans-29 Local mode and BYOK at no charge

Using the product with on-device models or the user's own provider key without paying AGI.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: partly**
  - [https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-max-or-ultra-plan): [2026-11-22] An API key in the environment makes Claude Code bill API usage instead of the subscription. Apps: cli.
- **Codex: partly**
  - [https://learn.chatgpt.com/docs/pricing.md](https://learn.chatgpt.com/docs/pricing.md): [2026-11-22] API-key sign-in for Codex is a separate path from a plan. Plans: API key. Apps: cli, ide.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Launch Posture: Local core differentiation; BYOK user pays provider)). Local mode is free on desktop and mobile. BYOK is free of AGI charge and the user pays the provider. Neither sends data to AGI servers without consent; sign-in is a separate matter from payment.

**With different models, providers and the one subscription.** Plans in the catalog list Local Mode and Local Mode plus BYOK at $0 as first-class tiers. Entitlements for managed features still read the one account.

**Current implementation, as this trace read it on 2026-11-24: built.** Catalog tiers local-only and byok at $0; mobile has on-device models and no BYOK in v1; web has no BYOK. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S81.02
- Comparison list ids: none matched
- Code: `packages/contracts/types/src/billing-catalog.ts:166-179`; `apps/mobile/src/features/billing/storePurchases.json`

**Gap.** No competitor chat product offers free local inference; evidence only shows API-key paths for the coding tools. Not compared in the catalogue.

**Acceptance criteria**

1. Airplane mode on mobile: a local chat works with no plan.
2. BYOK in CLI: no AGI credits used; the label shows the provider.
3. Cloud request from Local mode requires an explicit consent step.

**Verification: not verified.** Not in the web scorecards.

## CAP-subscriptions-and-plans-30 Grandfathered plan versions and price-change notice

Existing subscribers keep the price and allowances they bought; changes need notice and only apply at renewal.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://claude.com/pricing](https://claude.com/pricing): [2026-11-22] Catalogue lines do not state a price-change or grandfathering rule; commercial.md cites consumer terms read 2026-09-27, which is not in this corpus. Apps: web.
- **ChatGPT: unknown**
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): [2026-11-22] Catalogue lines do not state a price-change rule. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/commercial.md (Grandfathered Plans And Catalog Versions)). A subscriber keeps what they bought through the plan catalog version. A move needs 30 days' notice by email and in product, applies at renewal, and states the right to cancel first.

**With different models, providers and the one subscription.** Allowances are versioned in credits, so a model or provider swap does not change a subscriber's allowance.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Version stored and resolved on all entitlement reads; the notice flow is not in the evidence. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S81.01, S81.22
- Comparison list ids: none matched
- Code: `apps/web/lib/services/plan-catalog-service.ts`; `apps/web/app/api/stripe-webhook/lib/db.ts:773`; `packages/contracts/types/src/managed-usage-limits.ts:92`

**Gap.** No notice flow or test of a version move was found.

**Acceptance criteria**

1. Reprice the catalog: an existing subscriber's next invoice is unchanged.
2. A planned move shows 30-day notice in email and product, with a cancel link.

**Verification: code inspected only.** Code read only.

## CAP-subscriptions-and-plans-31 Ads on lower plans

Advertising shown on low-cost or free tiers, with an ad-free choice.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://claude.com/pricing](https://claude.com/pricing): [2026-11-22] Catalogue shows no ads on Claude plans. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001354](https://help.openai.com/en/articles/20001354): [2026-11-22] Everyday chat limits for Free and Go; see ads line below. Plans: Free, Go. Apps: web, ios, android.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): [2026-11-22] Go $8 may include ads. Plans: Go. Apps: web, desktop, ios, android.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). No requirement to show ads. Left to the owner.

**With different models, providers and the one subscription.** Ads would need a privacy and trust-boundary review; they must never touch Local chats.

**Current implementation, as this trace read it on 2026-11-24: not built.** No ads on any app. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: web: 'Ads on lower plans' (Better); mobile: 'Ads notice on the cheaper paid plan' (N/A)
- Code: `searched: sponsored, advertis in apps/web (comparison-web.csv)` (not found)

**Gap.** None unless the owner decides to add ads.

**Acceptance criteria**

1. No ad appears on any plan on any app.

**Verification: not verified.** Absence per ledger search.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to add an annual price for individual plans (only Claude shows it; ChatGPT individual plans are monthly).
- Whether to add a tier above Ultra (ChatGPT shows a $500 tier; Claude does not).
- Whether to match gift subscriptions, gift cards and a wallet balance (ChatGPT only; Claude's gifts are paused).
- Whether to run education, teacher, student, veteran, clinician or nonprofit programs, and which verification partner to use.
- Whether to bundle monthly API credits with top plans (both show them).
- Whether to sell discounted prepaid bundles (Claude only).
- Whether to add a device and card limit on paid accounts (ChatGPT only).
- Whether to offer self-serve Enterprise purchase (Claude only) or keep Enterprise sales-led.
- Whether to ever show ads on lower plans (ChatGPT only).
- When to open paid purchasing and retire the waitlist; no purchase surface works until then.
- Whether per-member and group admin budgets belong in the first paid Team launch.
- Whether to build the personal-to-workspace merge with refund before the first Team sale.

## Could not establish

- Whether the owner decision 'no subscription sales on any surface before 2027-01-01' (2026-11-15) is written in docs/decisions; only the waitlist and mobile v1 deferrals were found in docs/product/commercial.md.
- Downgrade behaviour in code: commercial.md says the upgrade API refuses a downgrade and sends users to the billing portal; ledger S83.04 and S81.24 say a downgrade review dialog is done. Not tested.
- Claude downgrade rules, Claude renewal grace and ChatGPT personal-plan proration are not shown in the catalogue (has: unknown).
- Claude or ChatGPT price-change and grandfathering rules; commercial.md cites terms of use that are not in the saved corpus.
- Whether any competitor offers free on-device inference in its chat product; the catalogue is silent.
- Whether Chrome plan explanations work (ledger says unverified for S81.07, S81.08, S81.09, S81.28).
- Real checkout, upgrade, refund and cancellation have not been run by a person; scorecards cover web only and stop at the waitlist.
- Ledger line numbers were not rechecked against the current tree; a few spot checks showed drift (for example BillingSection.tsx:828 is now a price row).
- I did not open saved page files; detail came from the catalogue lines only.
