# W7 — Billing, metering and entitlements

[← all waves](../WAVES.md) · [register index](../README.md)

**Why now.** Money correctness is one domain with one shared context — Stripe configuration, the plan/entitlement model, the usage ledger and the paywall surfaces all touch the same code — and it must be settled before feature waves add more billable surface area. The order inside the wave is forced: Stripe is in TEST mode so no real customer can be charged and the live catalog contradicts published prices, which blocks the price/currency items; there is no usage ledger or COGS metering, which blocks spend caps, reconciliation and margin; and Enterprise is unlimited at $0 with a feature-gate subsystem that has zero production callers, which is the single largest revenue leak. Entitlement-adjacent items filed under other domains are pulled in so the ladder is defined once: SEC-68 (tier admission on explicit model selection), AI-25 (service tier and reasoning-effort enforcement) and MOB-07 (native IAP, the same work as BILL-44). Several items are founder-blocked on Stripe/store dashboards, so raise those requests on day one of the wave.

**Size.** 77 items (3 critical, 29 high, 34 medium, 11 low); 70 open.

**Done when.** A real card is charged in live mode for each published plan and currency, the amount matches the published price to the cent, and no plan resolves to a missing Price ID; automatic tax returns a non-zero rate where due. One billing/entitlement domain package is the only source of plan identity (stable IDs separate from display labels), exposes a machine-readable effective-entitlement endpoint, and cross-surface contract tests prove web, desktop, mobile, VS Code and CLI agree. Every provider-cost event — tokens, audio transcription, image, video, non-token costs — writes an idempotent usage-ledger row attributed to run, task, user, project and tenant; a replayed webhook and an out-of-order refund leave balances unchanged. Pre-execution reservation and spend caps block work before it runs on a consent-gated path, subscription allowance is separated from purchased credits, and a blocked user can actually buy credits from the surface the 402 points to. Provider and Stripe settlement are reconciled against the ledger on a schedule with a variance alert; gross margin is computed from settled revenue and the published margin claim either matches it or is removed. Feature gates have production callers with an exhaustiveness test across every plan and trust mode; explicit model selection, service tier and reasoning effort are clamped server-side by entitlement and unavailable options are shown honestly. Mobile IAP is live in both stores or explicitly gated off with the reason recorded; India pricing decisions (e-mandate ceiling, INR prices, seat threshold, Razorpay/OIDAR) are recorded as founder decisions and reflected in code; stale plan copy is gone.

| ID                    | Sev      | Item                                                                                                                                                                              | Effort |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [BILL-01](#bill-01)   | CRITICAL | Production Stripe runs in TEST mode — no real customer can be charged, and the live catalog contradicts published prices                                                          | M      |
| [BILL-04](#bill-04)   | CRITICAL | Enterprise is unlimited at $0 and the entire feature-gate subsystem has zero production callers                                                                                   | L      |
| [BILL-06](#bill-06)   | CRITICAL | Managed audio transcription incurs provider cost with no reservation, settlement or usage record                                                                                  | M      |
| [BILL-02](#bill-02)   | HIGH     | Stripe key mode and Price IDs are misaligned; four price env vars are missing so Team checkout fails closed                                                                       | M      |
| [BILL-03](#bill-03)   | HIGH     | Stripe automatic tax is enabled in code but its dashboard preconditions are unset, so VAT is collected at 0%                                                                      | S      |
| [BILL-05](#bill-05)   | HIGH     | Documented per-tier spend ceilings have zero runtime readers, and free-tier voice is contractually uncapped                                                                       | M      |
| [BILL-07](#bill-07)   | HIGH     | Non-token provider costs are not metered anywhere, so no real COGS ledger exists                                                                                                  | XL     |
| [BILL-08](#bill-08)   | HIGH     | No usage ledger attributes cost to run, task, user, project or tenant with idempotent event IDs                                                                                   | L      |
| [BILL-09](#bill-09)   | HIGH     | Spend caps and auto-reload are not enforced before execution and are not consent-gated                                                                                            | L      |
| [BILL-10](#bill-10)   | HIGH     | Provider and Stripe settlement data are never reconciled against internal usage                                                                                                   | L      |
| [BILL-13](#bill-13)   | HIGH     | No single billing and entitlement domain package — plan logic lives in Web-only ad hoc code                                                                                       | L      |
| [BILL-15](#bill-15)   | HIGH     | No machine-readable effective-entitlement endpoint and no cross-surface entitlement contract tests                                                                                | L      |
| [BILL-16](#bill-16)   | HIGH     | Enterprise custom/contract limits are only migrated on the web org path; other surfaces still use the old representation                                                          | L      |
| [BILL-17](#bill-17)   | HIGH     | Checkout is not proven idempotent and entitlement grant may not be strictly gated on authoritative payment confirmation                                                           | M      |
| [BILL-18](#bill-18)   | HIGH     | Upgrade/downgrade/proration policy is undefined and subscription state transitions are not proven monotonic                                                                       | L      |
| [BILL-19](#bill-19)   | HIGH     | Webhook signature, timestamp, event-ID and API-version verification plus dedup are not fully confirmed                                                                            | M      |
| [BILL-21](#bill-21)   | HIGH     | No real self-serve Team purchase path, and Team subscriptions are not bound to organization ownership                                                                             | L      |
| [BILL-23](#bill-23)   | HIGH     | Credit top-ups have fulfillment and a route but no purchase surface — the 402 error tells users to add credits with nowhere to buy them                                           | M      |
| [BILL-24](#bill-24)   | HIGH     | Subscription allowance is not separated from purchased credit balance                                                                                                             | M      |
| [BILL-33](#bill-33)   | HIGH     | Payment-fraud controls are largely absent and blocks have no reason codes or appeal path                                                                                          | XL     |
| [BILL-38](#bill-38)   | HIGH     | RBI's Rs 15,000 e-mandate ceiling makes two published INR prices legally unable to auto-renew                                                                                     | M      |
| [BILL-44](#bill-44)   | HIGH     | Mobile native IAP is fully built but dark, blocked on store products, migration 0112, credentials, listing copy and tax registration                                              | L      |
| [BILL-45](#bill-45)   | HIGH     | Pre-execution credit reservation landed in code but has no production migration or cron proof                                                                                     | S      |
| [BILL-46](#bill-46)   | HIGH     | Managed video generation storage is configured but awaiting a production redeploy and verification                                                                                | S      |
| [BILL-51](#bill-51)   | HIGH     | Capability gates are not proven exhaustive across all plans and trust modes                                                                                                       | M      |
| [BILL-58](#bill-58)   | HIGH     | The concurrency limiter and gateway rate limiter both fail open when Redis is unavailable, removing the backstop against cost amplification                                       | M      |
| [BILL-60](#bill-60)   | HIGH     | Organization-invitation expiry cron is implemented and idempotent but was never added to vercel.json, so a lapsed invitation holds a paid seat forever                            | S      |
| [BILL-63](#bill-63)   | HIGH     | Account deletion is not blocked by an active paid subscription, in either of two independently-built delete-account flows                                                         | M      |
| [BILL-72](#bill-72)   | HIGH     | No usage, budget, billing or security transactional email channels exist — only schedule-completion notifications were built on the new email transport                           | L      |
| [INFRA-49](#infra-49) | HIGH     | Organization-invitation expiry cron is fully implemented but never scheduled — lapsed invitations never release paid seats                                                        | S      |
| [INFRA-51](#infra-51) | HIGH     | Video-generation reconciliation sweep exists but is never scheduled — an abandoned job stays 'queued' forever, fully billed                                                       | M      |
| [MOB-07](#mob-07)     | HIGH     | Native iOS/Android in-app purchases are fully built but dark, blocked on store products, migrations and founder paperwork                                                         | L      |
| [AI-25](#ai-25)       | MEDIUM   | Model service tiers and reasoning-effort access are not enforced end to end                                                                                                       | L      |
| [BILL-11](#bill-11)   | MEDIUM   | No quality-adjusted cost or accepted-task economics are tracked                                                                                                                   | M      |
| [BILL-12](#bill-12)   | MEDIUM   | Prompt-cache and compression cost effects are not measured                                                                                                                        | M      |
| [BILL-14](#bill-14)   | MEDIUM   | Plan identity is not separated from display labels, so renames and regional pricing break stable IDs                                                                              | M      |
| [BILL-20](#bill-20)   | MEDIUM   | Billing self-service is portal-redirect only — no in-app invoice history, payment method display, or cancel-plan control, and portal authorization is unverified                  | M      |
| [BILL-22](#bill-22)   | MEDIUM   | Enterprise contract onboarding is incomplete and there are no delegated billing/admin roles with audit                                                                            | L      |
| [BILL-25](#bill-25)   | MEDIUM   | Refund-delta correctness is unconfirmed under replay, out-of-order delivery and partial refunds                                                                                   | M      |
| [BILL-26](#bill-26)   | MEDIUM   | Rolling usage windows are imprecisely defined and reset times may not derive from authoritative windows                                                                           | M      |
| [BILL-27](#bill-27)   | MEDIUM   | No per-project or per-team budgets, chargeback or showback despite it being advertised                                                                                            | L      |
| [BILL-28](#bill-28)   | MEDIUM   | Web-versus-store subscription ownership conflicts have no documented resolution policy                                                                                            | M      |
| [BILL-29](#bill-29)   | MEDIUM   | Gross margin is not computed from settled revenue, estimates are not separated from settled values, and no margin dashboards or alerts exist                                      | L      |
| [BILL-30](#bill-30)   | MEDIUM   | A published '40% gross margin' claim has no live calculation behind it                                                                                                            | S      |
| [BILL-32](#bill-32)   | MEDIUM   | Gift and promo codes lack ledger-backed issuance and redemption                                                                                                                   | M      |
| [BILL-34](#bill-34)   | MEDIUM   | Billing events are uncorrelated, there are no customer-safe diagnostics, and no operational billing alerts exist                                                                  | L      |
| [BILL-35](#bill-35)   | MEDIUM   | No data-retention or audit policy for financial records                                                                                                                           | M      |
| [BILL-36](#bill-36)   | MEDIUM   | Enterprise accounts are deliberately uncapped but have no spend observability at all                                                                                              | M      |
| [BILL-37](#bill-37)   | MEDIUM   | Basic tier displays $7 while the referenced Stripe price object is $8                                                                                                             | S      |
| [BILL-39](#bill-39)   | MEDIUM   | Stripe's 26-hour India card renewal delay and mandate-decline codes are unhandled                                                                                                 | M      |
| [BILL-40](#bill-40)   | MEDIUM   | INR pricing is published in code but not sellable — no active INR Stripe Prices exist                                                                                             | S      |
| [BILL-41](#bill-41)   | MEDIUM   | Currency support does not generalise — only USD and INR resolve, per-currency Price slots are missing for three plans, and the INR top-up rate is undecided                       | M      |
| [BILL-43](#bill-43)   | MEDIUM   | Razorpay integration has unanswered sales and tax questions that must be resolved before any code is written                                                                      | L      |
| [BILL-48](#bill-48)   | MEDIUM   | AGI Work runs carry no per-task cost or usage, so a long autonomous run is unpriced to the user                                                                                   | M      |
| [BILL-49](#bill-49)   | MEDIUM   | Three published pricing-page feature claims have no implementation behind them                                                                                                    | M      |
| [BILL-50](#bill-50)   | MEDIUM   | VS Code shows no credit balance and only a single aggregate usage bar with no per-model limits or reset schedule                                                                  | M      |
| [BILL-52](#bill-52)   | MEDIUM   | Gateway LLM rate limit may still be a flat 30/min for every tier including Pro and Max                                                                                            | M      |
| [BILL-53](#bill-53)   | MEDIUM   | Reasoning-effort access is not clamped server-side by entitlement and unavailable levels are not shown honestly                                                                   | M      |
| [BILL-54](#bill-54)   | MEDIUM   | Plugin plan entitlements have no authoritative installation or execution lifecycle to attach to                                                                                   | L      |
| [BILL-55](#bill-55)   | MEDIUM   | No storage or transfer quota exists per user, project or organization, and no surface shows account-level quota state                                                             | L      |
| [BILL-56](#bill-56)   | MEDIUM   | Stale and conflicting plan-pricing copy persists across docs and locale bundles                                                                                                   | S      |
| [BILL-61](#bill-61)   | MEDIUM   | Enterprise-Local licensing verification is fully implemented twice (TypeScript package and Rust crate) with no runtime consumer and no fixture-replay parity test between the two | M      |
| [BILL-68](#bill-68)   | MEDIUM   | No education-institution plan exists (no route, plan card, or billing-catalog entry)                                                                                              | XL     |
| [BILL-71](#bill-71)   | MEDIUM   | Unswept consumers of `subscription?.tier ?? 'free'` without a billing-readiness guard may still misreport a paying customer as Free                                               | S      |
| [SEC-68](#sec-68)     | MEDIUM   | resolveAutoRoute grants any catalog model on an explicit selection without applying subscription-tier admission                                                                   | M      |
| [WEB-62](#web-62)     | MEDIUM   | Unswept `subscription?.tier ?? 'free'` reads without a billing-readiness guard may still misrender plan state elsewhere                                                           | S      |
| [BILL-31](#bill-31)   | LOW      | referral_code field is stored but entirely unwired                                                                                                                                | M      |
| [BILL-42](#bill-42)   | LOW      | The 7-seat India Team threshold exists only as a documented decision, not a checkout check                                                                                        | S      |
| [BILL-47](#bill-47)   | LOW      | isManagedComputePrivateBetaEnabled() asserts the opposite of its return value                                                                                                     | S      |
| [BILL-59](#bill-59)   | LOW      | In-chat commerce and checkout are explicitly not planned — recorded so it is not re-raised as a gap                                                                               | S      |
| [BILL-62](#bill-62)   | LOW      | Three legacy-alias /api/usage/\* billing routes have zero callers anywhere in the monorepo                                                                                        | S      |
| [BILL-64](#bill-64)   | LOW      | Usage bars are model-class-scoped only — no per-named-model usage row exists in the contract or the UI                                                                            | M      |
| [BILL-65](#bill-65)   | LOW      | No named higher-usage seat SKU exists within the Team plan — Team models exactly one uniform $25/seat price                                                                       | L      |
| [BILL-66](#bill-66)   | LOW      | No self-serve Enterprise checkout path — the Enterprise card's only CTA is contact-sales                                                                                          | L      |
| [BILL-67](#bill-67)   | LOW      | No published per-model API pricing, cache-tier rates, named service tiers or batch discount, despite cache economics already being computed internally                            | M      |
| [BILL-69](#bill-69)   | LOW      | No disclosed nonprofit discount program or FAQ entry                                                                                                                              | S      |
| [BILL-70](#bill-70)   | LOW      | The in-app paywall shows the upgrade tier's name but never its price, though the price is already returned by the same call                                                       | S      |

---

### BILL-01 — Production Stripe runs in TEST mode — no real customer can be charged, and the live catalog contradicts published prices

`CRITICAL` · billing · effort M

**What.** agiworkforce.com serves real users with test-mode Stripe keys; every 'paid' subscription row including founder accounts on basic/max_15x is a test subscription. Live and test catalogs diverge (Pro $20/mo test vs $29.99/mo live; Basic, Max 15x and Team do not exist live at all), so flipping STRIPE_SECRET_KEY alone would charge Pro at $29.99 against a $20 page. Stripe key mode is runtime Vercel/Stripe configuration and is not determinable from the repo.

**Done when.** Founder decides whether the product takes money in public alpha; if going live, create live products/prices matching BILLING*PLAN_PRICING and repoint every STRIPE_PRICE*\* variable in Vercel Production in the same change as the secret-key swap, then re-run the upgrade flow with a real card.

**Where.** `packages/contracts/types/src/billing-catalog.ts`

**Blocked by.** Founder decision to go live plus creation of matching live Stripe products/prices

**From.** FoundersAssistance.md #26

**Folded in.** Production Stripe is in TEST mode — no real customer can be charged

### BILL-04 — Enterprise is unlimited at $0 and the entire feature-gate subsystem has zero production callers

`CRITICAL` · billing · effort L

**What.** ExecutionPlan item #29 was REVERTED because the original fix was inert (the fail-closed branch could not fire and no producer existed for the numeric arm). Reverting exposed a larger finding: hasFeature, checkFeatureAccess, checkAutomationLimit/checkApiCallLimit/checkStorageLimit, eight grace-period helpers and the whole constants/pricing.ts module have zero production callers — a dead subsystem, not a one-constant patch. BIZ-020 separately records a $0 Enterprise placeholder possibly remaining in calculations and customer-facing paths; billing-catalog.ts:102 now documents getPlanPriceCents('enterprise') as a compile error, so the catalog half may already be corrected while the dead gate subsystem is not.

**Done when.** Decide per helper whether the feature-gate subsystem is wired to real enforcement points or deleted; replace any remaining $0 Enterprise placeholder with an explicit contract-priced state that cannot be summed as revenue.

**Where.** `packages/contracts/types/src/billing-catalog.ts`, `apps/desktop/src/constants/pricing.ts`, `apps/desktop/src/constants/planFeatures.ts`

**From.** ExecutionPlan.md #29; AuditRemediationLedger.md BIZ-020

**Folded in.** Enterprise tier is unlimited at $0 price; local-only/BYOK quotas contradict themselves; whole feature-gate subsystem has zero production callers; $0 Enterprise placeholder may remain in calculations/customer-facing paths

### BILL-06 — Managed audio transcription incurs provider cost with no reservation, settlement or usage record

`CRITICAL` · billing · effort M

**What.** VERIFIED still present: grep across apps/web/app/api/llm/v1/audio/transcriptions/route.ts for reserveManagedUsage / settleManagedUsage / creditService returns zero matches, and the only billing-adjacent string in the file is a comment calling the route 'credit-spending'. The route authenticates, rate-limits, validates audio, checks managed-compute eligibility and forwards to the provider, but never reserves credits, settles actual cost, writes a usage record, or voids a failed reservation — despite costing roughly $2.50/1M input tokens upstream. It is bounded only by the rate limiter.

Also recorded by a later audit (Managed audio transcription route has no usage settlement (no credit reserve/settle/refund)): VOICE-MEDIA-009 (audit/parity-2026-08-15) pins the exact file: apps/web/app/api/media/transcribe/route.ts authenticates, CSRF-checks, rate-limits, validates and forwards to OpenAI Whisper with no reserve/settle/void/idempotency logic and no UsageRecord. Names a concrete fix pattern: reuse the image-generation route's reserve-before-call / settle-on-success / void-on-failure flow, keyed on audio duration. Source rates it MEDIUM against the register's CRITICAL — keep CRITICAL, since the route bills nothing for real provider spend.

**Done when.** Define a transcription usage unit, reserve an upper bound before provider execution, settle on success, void or refund on failure, make it idempotent, and emit a UsageRecord plus audit and metrics events on the same path chat and image routes already use.

**Where.** `apps/web/app/api/llm/v1/audio/transcriptions/route.ts`

**From.** docs/agent-context/known-flaws.md VOICE-TRANSCRIPTION-UNMETERED; gap-audit-2026-08-08.md GAP-P0-008; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** VOICE-TRANSCRIPTION-UNMETERED: managed-cloud audio transcription is free at point of use; Managed audio transcription incurs provider cost with no usage settlement

### BILL-02 — Stripe key mode and Price IDs are misaligned; four price env vars are missing so Team checkout fails closed

`HIGH` · billing · effort M

**What.** The localized pricing endpoint rejected every configured Pro/Max Price lookup because the supplied Stripe secret was test-mode while those Price IDs exist in live mode; Basic, Max 15x and Team Price IDs were absent locally. STRIPE_PRICE_TEAM_MONTHLY_USD, STRIPE_PRICE_TEAM_MONTHLY_INR, STRIPE_PRICE_TEAM_YEARLY_USD and STRIPE_PRICE_BASIC_MONTHLY_INR are missing or misnamed and logged on every production request. Separately, the Stripe CLI restricted key was refused product creation with more_permissions_required, so no live Team product exists; a temporary Prices-Write permission granted during the stale-price cleanup has not been revoked and is a standing risk on a live key.

Also recorded by a later audit (Team Stripe yearly checkout not wired; Team monthly unit_amount unverified; Team INR founder-undecided): docs/current/parity-implementation-matrix.md#2026-08-05 Founder Decisions (pricing correction) gives BILL-02 three concrete, actionable sub-items: (1) 'Yearly checkout is not yet wired: add STRIPE_PRICE_TEAM_YEARLY support end-to-end in the web Class-1 pass'; (2) 'verify the Stripe dashboard unit_amount behind STRIPE_PRICE_TEAM_MONTHLY_USD is $25.00 (catalog/Stripe mismatch fails checkout closed)'; (3) 'Team INR remains founder-undecided (₹1,999 currently configured; flag, not a contradiction)' — which also feeds BILL-40/BILL-41.

**Done when.** Verify STRIPE*SECRET_KEY, STRIPE_WEBHOOK_SECRET and every STRIPE_PRICE*\* belong to the same Stripe account and mode per environment; create the missing Basic/Max 15x/Team prices; configure the Customer Portal; redeploy; then revoke the temporary Prices-Write permission on the live restricted key.

**Where.** `apps/web/app/api/pricing/localized`

**Blocked by.** Stripe Dashboard restricted-key permissions and product creation (founder action)

**From.** FoundersAssistance.md #5; FoundersAssistance.md #18; FoundersAssistance.md #27; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Grant the Stripe CLI permission to create the live Team product; Align Stripe key mode, recurring Price IDs, and production checkout; Stale live prices — revoke temporary Prices-Write permission

### BILL-03 — Stripe automatic tax is enabled in code but its dashboard preconditions are unset, so VAT is collected at 0%

`HIGH` · billing · effort S · **unclear**

**What.** CRIT-003 originally recorded that checkout omitted automatic tax and tax-ID collection while terms placed tax obligations on users; gap-audit-2026-08-08 §8 records the code fix as landed. But automatic_tax:{enabled:true} silently returns 0% and under-collects VAT until Stripe Tax is enabled, an origin address is set, tax_behavior is set per Price, and jurisdictions are registered in the Stripe dashboard — none of which the repository can verify. BIZ-016 additionally records tax handling as incomplete for invoices, credit notes and refunds, and there is no test-mode coverage for taxable/non-taxable/invalid-address/refund/invoice flows.

Also recorded by a later audit (Sales tax / VAT / GST collection was missing at the only Checkout-Session creation site): wire-or-cut.md#2026-08-06 records the code half as now wired: apps/web/app/api/checkout/route.ts, the only Checkout-Session creation site, previously collected no tax while /terms asserted tax obligations to the customer; it now sets automatic_tax, tax_id_collection and customer_update.address. This narrows BILL-03 to exactly its remaining half — the Stripe dashboard preconditions (registrations/origin address) being unset, so automatic tax still computes 0%.

**Done when.** Complete the Stripe dashboard tax configuration (Stripe Tax on, origin address, per-Price tax_behavior, jurisdiction registrations), then add test-mode coverage for taxable, non-taxable, invalid-address, refund and invoice flows including credit notes.

**Where.** `apps/web/app/api/checkout/route.ts:332`

**Blocked by.** Stripe dashboard tax configuration (founder action)

**From.** AuditRemediationLedger.md CRIT-003; AuditRemediationLedger.md BIZ-016; gap-audit-2026-08-08.md §8; ExecutionPlan.md Founder actions #7; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Stripe checkout omits automatic tax collection; Tax handling incomplete for invoices/credit notes/refunds; Stripe automatic_tax preconditions unset (VAT under-collected at 0%)

### BILL-05 — Documented per-tier spend ceilings have zero runtime readers, and free-tier voice is contractually uncapped

`HIGH` · billing · effort M

**What.** VERIFIED still present: grep for videoSecondsPerMonth, computerUseSoftCap and voiceMinutesPerMonth across apps/, packages/ and services/ (excluding tests) returns only the declaration and assignment sites in packages/contracts/types/src/model-catalog.ts and its generated .d.ts — no consumer reads them. The fields are assigned in TIER_POLICIES_DEFINITION and documented as enforced, so the documented spend ceilings do not exist at runtime. Compounding this, the free tier sets allowVoice:true with no voiceMinutesPerMonth, and the field's own doc says null/undefined means uncapped.

**Done when.** Wire the caps to the metering path that actually debits video seconds, computer-use actions and voice minutes, failing closed when a cap is exceeded; give the free tier an explicit voice minute allowance rather than relying on an unread field.

**Where.** `packages/contracts/types/src/model-catalog.ts:989`, `packages/contracts/types/src/model-catalog.ts:1005`, `packages/contracts/types/src/model-catalog.ts:1030`

**From.** docs/agent-context/known-flaws.md BILLING-TIER-SPEND-CAPS-UNREAD-01; docs/agent-context/known-flaws.md BILLING-FREE-TIER-VOICE-UNCAPPED-01

**Folded in.** BILLING-TIER-SPEND-CAPS-UNREAD-01: documented video/computer-use/voice spend ceilings have zero runtime readers; BILLING-FREE-TIER-VOICE-UNCAPPED-01: Free tier voice transcription is unlimited by contract

### BILL-07 — Non-token provider costs are not metered anywhere, so no real COGS ledger exists

`HIGH` · billing · effort XL

**What.** SCALE-SPEND-001: web search, embeddings/rerank, sandbox/code execution, browser/cloud compute, image, video, speech, storage, transfer and third-party tool costs are not recorded. BIZ-033 extends the same gap to full COGS: token cost plus search, sandbox, image/video/audio, storage, transfer, infra allocation, Stripe fees, refunds, chargeback reserve, discounts and support adjustments are not all captured.

**Done when.** Define a cost event per non-token provider capability, emit it from each execution path, and aggregate into one COGS ledger covering provider spend, Stripe fees, refunds, chargeback reserve, discounts and support adjustments.

**From.** AuditRemediationLedger.md SCALE-SPEND-001; AuditRemediationLedger.md BIZ-033

**Folded in.** Non-token provider costs are not metered; No real cost ledger covering full COGS

### BILL-08 — No usage ledger attributes cost to run, task, user, project or tenant with idempotent event IDs

`HIGH` · billing · effort L

**What.** SCALE-SPEND-002 records that no single usage ledger exists with idempotent event IDs and a corrections/refunds path. SCALE-CON-002 notes idempotency keys are not present on all mutation entry points including payments and webhooks, which is the same missing primitive on the write side.

Also recorded by a later audit (Usage ledger is bucket-based/aggregate, not an itemized per-task debit ledger): agentic-modes-gap-15 (competitive-gap-2026-08-15) confirms real billing infrastructure exists (managed-usage-accounting-service.ts, overage/top-up APIs) but is bucket-based (session/weekly/weeklyFlagship/period) and aggregate; /settings/usage shows credit bars and analytics, not itemized per-task rows with sub-category breakdown. Recommends building itemized per-task debit rows ON TOP of the existing bucket accounting service rather than replacing it.

Also recorded by a later audit (Credit balance and top-up exist; the per-task debit ledger a user can inspect does not): G4 (models-reasoning-quotas domain) plus settings-12-gap: credit_transactions (apps/web/db/neon/0004_token_credits.sql:24-25) already records deduction/purchase/adjustment/refund/bonus with metadata and is written on every deduction/settlement (credit-service.ts:447-456), but no GET route surfaced it and BillingSection.tsx:901-952 showed only a lump balance. IMPORTANT: FIXES-APPLIED.md (2026-08-15, branch compliance/dpdp) reports this half shipped — 'Credit-history ledger surfaced from the real credit_transactions table' — so the user-visible-history portion of BILL-08 may now be closed; verify before re-scoping. The idempotent per-run/task/project/tenant attribution portion is untouched.

**Done when.** Introduce one append-only usage ledger keyed by idempotent event ID, carrying run/task/user/project/tenant dimensions, with an explicit corrections and refunds entry type rather than in-place mutation.

**From.** AuditRemediationLedger.md SCALE-SPEND-002; AuditRemediationLedger.md SCALE-CON-002; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** No usage ledger attributing cost to run/task/user/project/tenant

### BILL-09 — Spend caps and auto-reload are not enforced before execution and are not consent-gated

`HIGH` · billing · effort L

**What.** SCALE-SPEND-004: spend caps are not enforced before execution with deterministic fallback, queue or deny outcomes. BIZ-027: spend caps and auto-reload are not confirmed to be explicit-consent-gated, and limits, confirmation, failure and notification behaviour are not confirmed complete.

Also recorded by a later audit (Settings IA — Usage section Partial/Missing (weekly limits, credits spent, monthly spend limit, auto reload)): docs/current/parity-implementation-matrix.md#Settings IA — Usage and #Billing, Usage, Waitlist — Usage limits: monthly spend limit and auto-reload are recorded as Partial/Missing in the UI, matching BILL-09's finding that spend caps and auto-reload are neither enforced before execution nor consent-gated — the control surface is missing on the same axis as the enforcement.

**Done when.** Add budget admission control ahead of provider execution with deterministic degrade/queue/deny, and gate any auto-reload behind explicit user consent with a confirmation step and failure notification.

**From.** AuditRemediationLedger.md SCALE-SPEND-004; AuditRemediationLedger.md BIZ-027; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** No budget admission control or graceful degradation before execution; Spend caps/auto-reload not confirmed explicit-consent-gated

### BILL-10 — Provider and Stripe settlement data are never reconciled against internal usage

`HIGH` · billing · effort L

**What.** SCALE-SPEND-006: no comparison of internal usage with provider/Stripe settlement data and no drift alerting. BIZ-013: Stripe state is not periodically reconciled, so missed or out-of-order webhooks may never be repaired from authoritative provider state.

**Done when.** Add a scheduled reconciliation job that compares internal usage and subscription state against provider and Stripe settlement data, repairs drift from the authoritative source, and alerts on divergence beyond a threshold.

**From.** AuditRemediationLedger.md SCALE-SPEND-006; AuditRemediationLedger.md BIZ-013

**Folded in.** Provider invoices are not reconciled against internal usage; Stripe state not periodically reconciled

### BILL-13 — No single billing and entitlement domain package — plan logic lives in Web-only ad hoc code

`HIGH` · billing · effort L

**What.** BIZ-001: plan catalog, capabilities, limits, transitions, usage windows and display metadata live in Web-only ad hoc logic instead of one owned package. gap-audit GAP-P1-009 records the same fragmentation across surfaces more broadly.

**Done when.** Extract one owned billing/entitlement package holding the plan catalog, capability matrix, limits, transitions, usage windows and display metadata, and make every surface consume it.

**From.** AuditRemediationLedger.md BIZ-001; gap-audit-2026-08-08.md GAP-P1-009

**Folded in.** No single billing/entitlement domain package

### BILL-15 — No machine-readable effective-entitlement endpoint and no cross-surface entitlement contract tests

`HIGH` · billing · effort L

**What.** BIZ-006: no published endpoint returning plan, status, renewal, grace, capabilities, limits, reset times and policy source without exposing payment secrets. BIZ-007: Web, Desktop, Mobile, CLI, VS Code and Chrome are not proven to reach the same entitlement decision for the same account and capability. The mobile provider-switch tier divergence (mobile granted mid-thread switching at 'pro' while canonical logic restricted it to max/max_15x/enterprise) is the class of bug this would catch, and was fixed only after shipping.

**Done when.** Publish one effective-entitlement endpoint and add contract tests asserting every surface derives the same decision for the same account and capability.

**From.** AuditRemediationLedger.md BIZ-006; AuditRemediationLedger.md BIZ-007; docs/agent-context/known-flaws.md MOBILE-PROVIDER-SWITCH-GATE-DIVERGENCE-01

**Folded in.** No machine-readable effective-entitlement endpoint; No cross-surface entitlement contract tests

### BILL-16 — Enterprise custom/contract limits are only migrated on the web org path; other surfaces still use the old representation

`HIGH` · billing · effort L · **in-progress**

**What.** CRIT-002: toEnforceableLimit() lacked a 'custom' arm so enterprise custom connector/project limits collapsed to zero (catalog enterprise.projects:'custom' -> 0 -> validation error at org-sharing-service.ts:278). The BillingPlanLimit type, exhaustive conversion, tests and a duplicate-converter guard landed in commit 2a163f6af, but migrating the API, UI, usage policy and CLI/desktop caches to the canonical representation is still open — only the web org-entitlement path is confirmed migrated. BIZ-005 adds that the policy source is still not surfaced to admins or users.

**Done when.** Migrate the remaining API, UI, usage-policy and CLI/desktop cache consumers to the canonical BillingPlanLimit representation, and surface the policy source (catalog default vs contract override) wherever a limit is displayed or enforced.

**Where.** `apps/web/lib/services/org-entitlements.ts`, `apps/web/lib/services/free-plan-entitlements.ts`

**From.** AuditRemediationLedger.md CRIT-002; AuditRemediationLedger.md BIZ-005

**Folded in.** Enterprise custom connector/project limits can collapse to zero; Contract/custom limits and policy-source surfacing incomplete

### BILL-17 — Checkout is not proven idempotent and entitlement grant may not be strictly gated on authoritative payment confirmation

`HIGH` · billing · effort M

**What.** BIZ-008: duplicate clicks or callbacks could create duplicate customers, subscriptions or credits. BIZ-009: redirect success alone should not be trusted to grant entitlement. Money-movement guards do exist (duplicate-subscription refusal, idempotency keys, refund clawback in stripe-webhook handlers), so the gap is proof rather than total absence.

**Done when.** Add an idempotency key to checkout session creation keyed on user and plan, and assert in tests that entitlement is granted only from a verified webhook event, never from the redirect.

**Where.** `apps/web/app/api/stripe-webhook/lib/handlers.ts`

**From.** AuditRemediationLedger.md BIZ-008; AuditRemediationLedger.md BIZ-009; AuditRemediationLedger.md BIZ-041

**Folded in.** Checkout is not proven idempotent; Entitlement grant may not be strictly gated on authoritative payment confirmation

### BILL-18 — Upgrade/downgrade/proration policy is undefined and subscription state transitions are not proven monotonic

`HIGH` · billing · effort L

**What.** BIZ-010: effective time, unused-time credit, consumed-usage carry, reset behaviour, SCA/payment failure and cancellation are not fully defined. BIZ-011: raw usage is not confirmed preserved across plan changes, so upgrading might unintentionally grant a fresh allowance. BIZ-012: trial, grace, past-due, canceled, unpaid, paused, refunded, disputed and chargeback states are not confirmed to change access monotonically or reconcilably. A related fix already landed (refusing a plan change while a cancellation is pending), showing the state machine has real edges.

**Done when.** Write down the proration and state-transition policy explicitly, prove raw usage survives plan changes, and add tests asserting access changes are monotonic across every subscription state including disputes and chargebacks.

**From.** AuditRemediationLedger.md BIZ-010; AuditRemediationLedger.md BIZ-011; AuditRemediationLedger.md BIZ-012

**Folded in.** Upgrade/downgrade/proration policy undefined; Raw usage not confirmed preserved across plan changes; Trial/grace/past-due/canceled/unpaid/paused/refunded/disputed/chargeback states not confirmed monotonic

### BILL-19 — Webhook signature, timestamp, event-ID and API-version verification plus dedup are not fully confirmed

`HIGH` · billing · effort M

**What.** BIZ-014: deduplication and raw-event reference preservation are not confirmed complete. The webhook path has already produced two real defects — an unregistered Price threw and broke every legacy renewal after a price change (contradicting the 30-day price-protection promise in /terms), and refunds did not revoke plan access — both since fixed, which is evidence the surface needs the verification rather than that it has it.

**Done when.** Assert signature and timestamp validation, event-ID dedup, API-version pinning and raw-event retention in tests, and cover replayed and out-of-order deliveries.

**Where.** `apps/web/app/api/stripe-webhook/lib/handlers.ts`, `apps/web/app/api/stripe-webhook/lib/db.ts`

**From.** AuditRemediationLedger.md BIZ-014; ExecutionPlan.md #26

**Folded in.** Webhook signature/timestamp/event-ID/API-version verification not fully confirmed

### BILL-21 — No real self-serve Team purchase path, and Team subscriptions are not bound to organization ownership

`HIGH` · billing · effort L

**What.** BIZ-017: seat quantity, annual/monthly term, invitation, seat true-up, reduction, transfer, cancellation and pooled usage are not confirmed complete. BIZ-018: Team subscription is not confirmed bound to organization ownership and membership, creating personal/account ambiguity. A concrete instance already fired: a Team purchase made before org creation lost the paid seat count entirely, and with the seat floor raised to 2 this hit every new Team purchase. The path is also externally blocked because no live Team Stripe product exists (BILL-02).

Also recorded by a later audit (Team licensed-seat billing and pricing — not built): wire-or-cut.md#2026-07-30 Team Billing Boundary: no organization-linked licensed quantity, no Stripe quantity reconciliation, and no member-lifecycle enforcement exist; Team remains sales-assisted only. Exact seat prices and env paths were removed from the ledger, and an unmounted Desktop SQLite charge estimator was deleted. Reinforces the register's 'not bound to organization ownership' half, and pairs with the new seat-expiry cron gap (BILL-60).

**Done when.** Bind the Team subscription to the organization record at purchase time, and implement seat true-up, reduction, transfer and pooled usage with reconciliation against Stripe quantity.

**Where.** `apps/web/app/api/stripe-webhook/lib/seats.ts`, `apps/web/app/api/settings/organization/route.ts`

**From.** AuditRemediationLedger.md BIZ-017; AuditRemediationLedger.md BIZ-018; ExecutionPlan.md #25; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** No real self-serve Team purchase path; Team subscription not confirmed bound to organization ownership/membership

### BILL-23 — Credit top-ups have fulfillment and a route but no purchase surface — the 402 error tells users to add credits with nowhere to buy them

`HIGH` · billing · effort M · **in-progress**

**What.** VERIFIED partially remediated: apps/web/app/api/billing/top-up/ now exists with route.ts and route.test.ts, so an initiation route has landed since BIZ-022 was written. But the managed-chat 402 still returns the exact string 'Usage budget exhausted for this billing period. Upgrade your plan or add credits.' at request-processor.ts:1361 while no purchase-credits page exists under apps/web/app, and the route must not be exposed before migration 0111_credit_top_up_carry.sql is applied (the file is present in apps/web/db/neon/ but its applied state is not visible from the repo). On desktop the 'Buy a top-up' CapModal is permanently unreachable because nothing sets budget.enabled (useBudgetStore.setBudget has zero production callers), and even if reached it opens a billing pane that deliberately offers no top-up. PP-25 records the credit-alert UI as unmounted in production paths.

Also recorded by a later audit (PP-25: managed-cloud user who exhausts their period budget hits a broken path): PP-25 (docs/agent-context/HANDOFF.md §4, from phase4-capability-audit.md) is the observed symptom of BILL-23's dead end: the 402 tells users to add credits with nowhere to buy them, and a real managed-cloud user who exhausts their period budget lands on a broken path. Trace the budget-exhaustion flow end to end when closing BILL-23 rather than only shipping the purchase surface.

**Done when.** Apply migration 0111, ship a purchase surface reachable from the 402 error and from Settings > Billing on web and desktop, wire the desktop budget store so the cap modal can fire, and verify one authorized test-mode purchase grants the expected units exactly once including after webhook replay.

**Where.** `apps/web/app/api/billing/top-up/route.ts`, `apps/web/db/neon/0111_credit_top_up_carry.sql`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1361`, `packages/ui/unified-chat/src/stores/budgetStore.ts`

**Blocked by.** Migration 0111 must be applied to production Neon before the top-up route is exposed

**From.** AuditRemediationLedger.md BIZ-022; AuditRemediationLedger.md PP-25; docs/agent-context/phase4-capability-audit.md PP-25; audit/ui-gaps.md GAP-103; audit/ui-gaps.md GAP-280; FoundersAssistance.md #11; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Top-ups have fulfillment code but no purchase-initiation UI/API; Managed-chat 402 error tells users to 'add credits' with no credit-purchase surface; Desktop 'Buy a top-up' CapModal is permanently unreachable; No self-serve credit purchase / automatic recharge flow; Credits purchase and auto-reload are declined without billing product contracts; Apply the purchased-credit carry migration before exposing top-ups

### BILL-24 — Subscription allowance is not separated from purchased credit balance

`HIGH` · billing · effort M

**What.** BIZ-023: expiration, refundability, transfer and consumption priority between the recurring plan allowance and purchased credits are undefined. Recent work let purchased credits carry a user past rolling caps, which makes the separation load-bearing rather than theoretical.

**Done when.** Model plan allowance and purchased credits as distinct balances with explicit expiry, refundability, transferability and a documented consumption order, and enforce that order in the debit path.

**From.** AuditRemediationLedger.md BIZ-023

**Folded in.** Subscription allowance not separated from purchased credit balance

### BILL-33 — Payment-fraud controls are largely absent and blocks have no reason codes or appeal path

`HIGH` · billing · effort XL

**What.** BIZ-041 (triaged 2026-08-09): usage abuse is substantially implemented (Redis-backed per-endpoint velocity limits, fail-closed in production, per-plan concurrency, signed 429 attribution/audit in apps/web/lib/rate-limit.ts) and money movement has some guards (duplicate-subscription refusal, idempotency keys, refund clawback, dispute handling). But there is NO radar.early_fraud_warning.created handling, no captcha or bot check anywhere, no fraud/risk/abuse table in apps/web/db/neon/, no duplicate-account or shared-payment-instrument detection, no refund-abuse policy beyond per-charge clawback, and no case-queue admin console (apps/web/app/api/admin/security/route.ts is read-only). BIZ-042 adds that blocks tied to these controls have no auditable reason codes or appeal/support path. CAP-013 records fraud rules as a contract-only risk state that must not be exposed until events and enforcement exist. Whether Clerk's CAPTCHA/Turnstile is enabled on sign-up could not be confirmed from the repository either way and is recorded as unverified.

Also recorded by a later audit (Managed Cloud commercial, abuse, retention, deletion and provider-term controls must keep pace with public-alpha usage (GAP-11)): docs/current/source-of-truth.md P0 Gap List item 11 and the parity matrix's 'Abuse/fraud controls — Missing/Gated' row. GAP-11 frames the whole cluster as a live P0 now that managed cloud is public alpha and open by default, with AGI_MANAGED_COMPUTE_PRIVATE_BETA retained only as an incident-response kill switch — i.e. the access gate that previously bounded this exposure is gone, so metering, abuse, fraud, refunds, chargebacks, provider terms, retention and deletion controls are load-bearing today. Also touches BILL-07/BILL-08 (metering) and DPDP-37 (retention/deletion).

**Done when.** Founder sets risk appetite first; then handle early-fraud-warning webhooks, add a fraud/risk table and case queue, detect duplicate accounts and shared payment instruments, define a refund-abuse policy, and attach auditable reason codes plus an appeal path to every block. Separately confirm the Clerk CAPTCHA toggle and record the answer.

**Where.** `apps/web/lib/rate-limit.ts`, `apps/web/app/api/stripe-webhook/lib/handlers.ts`, `apps/web/app/api/admin/security/route.ts`

**Blocked by.** Founder risk-appetite decision — explicitly must not be closed as an audit fix

**From.** AuditRemediationLedger.md BIZ-041; AuditRemediationLedger.md BIZ-042; audit/capability-gaps.csv CAP-013; DPDP_PROGRESS.md §6; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Payment-fraud controls are largely absent (usage-abuse half is built); Fraud controls risk becoming silent authorization policy without appeal paths; Fraud rules (FraudRules); Unverified CAPTCHA/Turnstile status on Clerk-gated sign-up

### BILL-38 — RBI's Rs 15,000 e-mandate ceiling makes two published INR prices legally unable to auto-renew

`HIGH` · billing · effort M

**What.** RBI's AFA/3DS requirement applies to every recurring SaaS charge above Rs 15,000 (verified against Stripe's India recurring-payments documentation, 2026-08-14). Max 15x at Rs 24,999/mo and Team at 8+ seats (Rs 15,992+) cannot auto-renew on an Indian card, and this applies to any provider including Razorpay/UPI AutoPay which caps lower still. Nothing is broken in production today only because no INR Price exists yet.

**Done when.** Founder picks one of: price Max 15x INR at or under Rs 15,000, sell it annually or invoice-only, cap Indian Team self-serve at 7 seats routing 8+ to sales, or do not sell those tiers in India yet.

**Where.** `apps/web/lib/regional-pricing.ts`

**Blocked by.** Founder pricing decision

**From.** FoundersAssistance.md #28a

**Folded in.** Two published INR prices cannot legally auto-renew

### BILL-44 — Mobile native IAP is fully built but dark, blocked on store products, migration 0112, credentials, listing copy and tax registration

`HIGH` · billing · effort L

**What.** Sources disagree on framing: BIZ-031 records mobile IAP as deliberately not shipped (a founder product/legal decision that must not be closed as an audit fix), while FoundersAssistance #12 and #29 record it as fully implemented end to end and switched off behind MOBILE_IAP_ENABLED only because no store products or credentials exist. The implementation covers expo-iap client, server-side Apple/Google receipt verification, idempotent ledger, restore flow, renewal/cancellation/refund handling and store notification endpoints. Migration file 0112_mobile_native_iap.sql is present in the repo but its applied state is not visible. Enabling IAP is also what ships UPI on mobile, since Play Billing and Apple both support UPI natively and auto-convert regional prices; running AGI's own UPI checkout inside the iOS app would violate App Store guideline 3.1.1. Store listing copy currently states 'no in-app purchases in this version' and must be replaced with exact subscription and top-up disclosures at the same time.

Also recorded by a later audit (MS-5 StoreKit purchase + restore — external gate, billing flag stays honest until real): MS-5 (docs/current/parity-implementation-matrix.md#2026-08-01 Founder Scope Decisions) confirms BILL-44's blocked status from the founder-decision side: the external gate is App Store Connect product creation, and the stated discipline is that 'billing flag stays honest (off) until the flow is real' — i.e. the dark state is intentional, not an oversight, and must not be flipped before store products exist.

**Done when.** Work the founder checklist in order: Apple Paid Applications Agreement (gates the rest), Play Console merchant profile, 9 product IDs in both stores, store server credentials, apply migrations 0111 then 0112, set product-ID and verification env vars, update store listing copy, complete tax registration, run sandbox verification, then enable MOBILE_IAP_ENABLED.

**Where.** `apps/web/db/neon/0112_mobile_native_iap.sql`, `apps/web/lib/server/mobile-iap-store-verification.ts`, `packages/contracts/types/src/mobile-iap.ts`, `apps/web/app/api/mobile/iap/catalog`

**Blocked by.** App Store Connect and Google Play Console product/credential setup, Apple Paid Applications Agreement, tax registration (founder actions)

**From.** AuditRemediationLedger.md BIZ-031; FoundersAssistance.md #12; FoundersAssistance.md #29; docs/agent-context/known-flaws.md MOBILE-STORE-LISTING-NATIVE-BILLING-COPY; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Mobile IAP product IDs/store readiness not applicable — feature deliberately not shipped; Register and configure native Mobile subscriptions and top-ups; Mobile IAP is built and dark — the blockers are all accounts, not code; MOBILE-STORE-LISTING-NATIVE-BILLING-COPY: store listing copy needs updating once native IAP products are registered

### BILL-45 — Pre-execution credit reservation landed in code but has no production migration or cron proof

`HIGH` · billing · effort S · **in-progress**

**What.** BILLING-DEDUCT-DURABILITY-01: the token-enforcement service was replaced by a pre-execution reservation and active managed-compute paths now reserve credits before provider execution (fixed in code 2026-07-15), but production migration and cron proof was still pending when the row was last updated. The related GATEWAY-METERING-IDEMPOTENCY-01 double-charge fix records migrations 0060-0066 as applied to production, which may or may not cover this reservation path.

**Done when.** Confirm the reservation migration is applied to production Neon and that the settlement cron runs, then close the row with the observed evidence rather than the code change.

**From.** docs/agent-context/known-flaws.md BILLING-DEDUCT-DURABILITY-01

**Folded in.** BILLING-DEDUCT-DURABILITY-01: token-enforcement-service replaced by pre-execution reservation, prod migration proof pending

### BILL-46 — Managed video generation storage is configured but awaiting a production redeploy and verification

`HIGH` · billing · effort S · **in-progress**

**What.** CLOUDFLARE_R2_PRIVATE_BUCKET_NAME was absent so video generation reported storage_not_configured for every model, meaning billed generations produced nothing. The bucket was created, the R2 token rotated to an account-owned scope covering both buckets, and env vars set in Vercel production. The remaining step is to redeploy production and confirm via GET /api/media/availability. Related open defects on the same paid path are tracked in the web slice (generated videos are never persisted, and CSP has no media-src so the provider URL cannot render).

**Done when.** Redeploy production and verify GET /api/media/availability reports video storage as configured.

**Where.** `apps/web/lib/server/media-storage.ts`, `apps/web/lib/server/object-storage.ts`

**Blocked by.** Production redeploy and post-deploy verification

**From.** docs/agent-context/known-flaws.md WEB-VIDEO-PRIVATE-BUCKET-UNSET

**Folded in.** WEB-VIDEO-PRIVATE-BUCKET-UNSET: managed video generation config fixed, awaiting production redeploy

### BILL-51 — Capability gates are not proven exhaustive across all plans and trust modes

`HIGH` · billing · effort M

**What.** BIZ-004: free, basic, pro, max, max_15x, team, enterprise, local and user-key modes are not all confirmed exhaustively gated. Two concrete escapes have already shipped from this gap — mobile granting mid-thread provider switching at 'pro' when canonical logic restricts it to max/max_15x/enterprise, and a mobile paywall with eight tiers and no max_15x entry so a real gated feature fell through to the generic fallback paywall.

**Done when.** Make the capability matrix exhaustive over the plan and trust-mode product, with a type-level exhaustiveness check so a new plan or mode cannot compile until every gate has an explicit arm.

**Where.** `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx`

**From.** AuditRemediationLedger.md BIZ-004; docs/agent-context/known-flaws.md MOBILE-PROVIDER-SWITCH-GATE-DIVERGENCE-01; ExecutionPlan.md #58

**Folded in.** Capability gates not exhaustive across all plans/modes

### BILL-58 — The concurrency limiter and gateway rate limiter both fail open when Redis is unavailable, removing the backstop against cost amplification

`HIGH` · billing · effort M

**What.** VERIFIED still present: acquireManagedTurnSlot contains `if (!redis) { logger.warn(... 'admitting (spend caps still apply)'); return { admitted: true, ... }; }` — it fails open by design on Redis error. The CAP-052 red team calls this out as the one control that would cap parallel model-call fan-out and treats it as blocking. Separately, DPDP §6 records api-gateway rate limiting falling open to in-memory on Redis absence. RATE_LIMIT_REDIS_URL silently falling back to the Upstash REST URL (degrading to in-memory) was a related defect already fixed.

**Done when.** Make the concurrency limiter fail closed for managed and bridge-originated calls when Redis is unavailable, and give the gateway limiter the same fail-closed behaviour in production rather than degrading to in-memory.

**Where.** `apps/web/lib/rate-limit.ts:1252-1258`, `services/api-gateway/src/middleware/rateLimit.ts:60-99`

**From.** docs/design/cap-052-artifact-runtime-bridge-security-review-2026-08-05.md RT-5(a); DPDP_PROGRESS.md §6; ExecutionPlan.md #27

**Folded in.** RT-5(a) fail-open concurrency limiter; api-gateway rate limiting fail-open to in-memory on Redis absence

### BILL-60 — Organization-invitation expiry cron is implemented and idempotent but was never added to vercel.json, so a lapsed invitation holds a paid seat forever

`HIGH` · billing · effort S

**What.** DEAD-CODE-005, duplicate filing BACKEND-RUNTIME-005 (audit/parity-2026-08-15). The route's own doc comment states the consequence: 'A pending invitation HOLDS a licensed seat... If nothing ever flips a lapsed invitation to expired, that seat is never returned and a team silently locks itself out of the seats it paid for.' vercel.json wires exactly 9 crons and expire-organization-invitations — whose route directory exists — is not among them; no other caller exists anywhere in the repo. The handler itself is correct.

**Done when.** Add {"path": "/api/cron/expire-organization-invitations", "schedule": "0 5 \* \* \*"} (or another unused daily slot) to vercel.json's crons array.

**Where.** `apps/web/app/api/cron/expire-organization-invitations/route.ts`, `vercel.json`, `apps/web/db/neon/0085_organization_seats_lifecycle.sql`

**From.** audit/parity-2026-08-15/gaps/domain-dead-code (DEAD-CODE-005); audit/parity-2026-08-15/gaps/domain-backend-runtime (BACKEND-RUNTIME-005)

**Folded in.** DEAD-CODE-005; BACKEND-RUNTIME-005

### BILL-63 — Account deletion is not blocked by an active paid subscription, in either of two independently-built delete-account flows

`HIGH` · billing · effort M

**What.** settings-26-gap (competitive-gap-2026-08-15). AccountSection.tsx:193 and a separately-built second copy in PrivacySection.tsx:753-883 both call DELETE /api/user/delete-account with no subscription check in either UI flow, and the API route itself performs CSRF/rate-limit/auth checks only — no subscription, billing or cancel gate exists. A paying customer can therefore delete their account while a live Stripe subscription continues to bill.

**Done when.** Add a subscription-active check to the DELETE /api/user/delete-account handler (cancel-or-refuse), and consolidate the two independent delete-account UI implementations into one.

**Where.** `apps/web/features/settings/sections/AccountSection.tsx:193`, `apps/web/features/settings/sections/PrivacySection.tsx:753-883`, `apps/web/app/api/user/delete-account/route.ts`

**From.** audit/competitive-gap-2026-08-15/domains/settings (settings-26-gap); audit/competitive-gap-2026-08-15 — settings-26-gap (settings-26)

**Folded in.** Account deletion is not blocked by an active paid subscription, in either of two duplicate delete-account UI flows

### BILL-72 — No usage, budget, billing or security transactional email channels exist — only schedule-completion notifications were built on the new email transport

`HIGH` · billing · effort L

**What.** docs/adr/wire-or-cut.md#2026-08-06 'Notifications: the first send paths'. A backlog of six email channels was scoped; only mobile push and schedule-completion email were wired. The ledger records why the rest were deliberately deferred and why that deferral is itself a risk: 'billing emails carry financial retention/disclosure obligations and security emails are the channel an attacker most wants to suppress or spoof — neither built as a by-product of the notification transport work.' The transport primitive (notification-email-service.ts, extracted from the support-email path) now exists, so the gap is the missing senders and their content policy, not the plumbing.

**Done when.** Build the billing (invoice, payment failure, plan change), usage/budget (threshold, cap reached) and security (new device, password/MFA change, session revoked) senders on the existing sendTransactionalEmail primitive, with retention and spoof-resistance requirements decided per channel before shipping.

**Where.** `apps/web/lib/services/notification-email-service.ts`, `apps/web/lib/services/schedule-notification-service.ts`

**From.** docs/adr/wire-or-cut.md#2026-08-06 Notifications: the first send paths

### INFRA-49 — Organization-invitation expiry cron is fully implemented but never scheduled — lapsed invitations never release paid seats

`HIGH` · infra/ci · effort S

**What.** DEAD-CODE-005 / BACKEND-RUNTIME-005. The route's own doc comment states the consequence directly: 'A pending invitation HOLDS a licensed seat… If nothing ever flips a lapsed invitation to expired, that seat is never returned and a team silently locks itself out of the seats it paid for.' vercel.json wires exactly 9 crons; expire-organization-invitations (a 10th cron directory that exists) is not among them, and no other caller exists anywhere in the repo. The handler itself is correct and idempotent. Distinct from DPDP-16, which covers the unregistered waitlist/support-retention crons.

**Done when.** Add {"path": "/api/cron/expire-organization-invitations", "schedule": "0 5 \* \* \*"} to vercel.json's crons array — no handler change needed.

**Where.** `apps/web/app/api/cron/expire-organization-invitations/route.ts`, `vercel.json`, `apps/web/db/neon/0085_organization_seats_lifecycle.sql`

**From.** audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-005; audit/parity-2026-08-15/gaps/domain-backend-runtime.json BACKEND-RUNTIME-005

**Folded in.** DEAD-CODE-005; BACKEND-RUNTIME-005

### INFRA-51 — Video-generation reconciliation sweep exists but is never scheduled — an abandoned job stays 'queued' forever, fully billed

`HIGH` · infra/ci · effort M

**What.** VOICE-MEDIA-003. reconcileVideoGenerationJob only runs inside GET /api/media/video/status, i.e. only when a client is actively polling. reconcileDueVideoGenerationJobs, the cron-shaped sweep function, has zero production callers — grep confirms it is imported only by its own test — and vercel.json's cron list has no entry for it. Web mitigates the common case with an auto-resume-on-page-load effect (WebChatPage.tsx:2575-2610), but a user who never returns to the conversation loses the video permanently after provider retention expires.

**Done when.** Add a cron-triggered route mirroring run-schedules/route.ts's pattern that calls reconcileDueVideoGenerationJobs on an interval short enough to catch jobs before provider retention expires.

**Where.** `apps/web/lib/services/video-job-reconciliation-service.ts:582-611,735-760`, `apps/web/app/api/media/video/status/route.ts:321-407`, `vercel.json`

**From.** audit/parity-2026-08-15/gaps/domain-voice-media.json VOICE-MEDIA-003

### MOB-07 — Native iOS/Android in-app purchases are fully built but dark, blocked on store products, migrations and founder paperwork

`HIGH` · mobile · effort L

**What.** Mobile purchase UI, the StoreKit/Google Play client, server-side receipt verification, an idempotent ledger, restore flow, renewal/cancellation/refund handling and store notification endpoints are implemented and locally tested, but stay fail-closed until both stores contain the exact 5 subscription + 4 consumable products and migrations 0111 then 0112 are applied. Blocked on: the Apple Paid Applications Agreement and Small Business Program, a Play Console merchant profile (permanent, cannot be changed later), 9 product IDs in both stores, store server credentials, updated listing copy, tax registration, and the Max 15x India price decision. Turning IAP on is also what ships UPI on mobile, since Play Billing and Apple both support UPI natively; running AGI's own UPI checkout inside the iOS app would violate guideline 3.1.1. The earlier ledger entry recording this as 'resolved — deliberately not shipped' is superseded.

Also recorded by a later audit (MS-5 StoreKit purchase + restore — external gate, billing flag stays honest until real): Records the founder decision explicitly: MS-5 is approved to build but externally gated on App Store Connect products, and the billing feature flag is to stay off (honest) until the purchase/restore flow is real. Same blocking set as BILL-44 (store products, migration 0112, credentials, listing copy, tax registration).

**Done when.** Work the 8-item founder checklist in order starting with the Apple Paid Applications Agreement (which gates items 2-5), apply migrations 0111 and 0112, run sandbox verification, then set MOBILE_IAP_ENABLED=true.

**Where.** `apps/web/db/neon/0112_mobile_native_iap.sql`, `apps/web/lib/server/mobile-iap-store-verification.ts`, `apps/mobile/src/features/billing/subscriptionSource.ts:47-70`

**Blocked by.** founder: store agreements, merchant profile, product registration, tax registration (FoundersAssistance.md #12, #29)

**From.** FoundersAssistance.md (#12, #29); AuditRemediationLedger.md (BIZ-031); docs/agent-context/known-flaws.md (MOBILE-STORE-LISTING-NATIVE-BILLING-COPY); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** BIZ-031: Mobile IAP product IDs/store readiness not applicable — feature deliberately not shipped; MOBILE-STORE-LISTING-NATIVE-BILLING-COPY: store listing copy needs updating once native IAP products are registered

### AI-25 — Model service tiers and reasoning-effort access are not enforced end to end

`MEDIUM` · ai-routing · effort L

**What.** GAP-P1-007 bundles CAP-016 (batch tier), CAP-020 (reasoning-effort access) and CAP-021 (flex service tier): none has a canonical request contract, plan/entitlement admission, provider mapping, pricing, retry/fallback, usage settlement and UI availability all matching. CAP-020 specifically requires clamping server-side entitlements and showing unavailable effort levels honestly. GAP-P1-007 itself warns some of these rows may already be stale or cut and need revalidation before implementation. GAP-217 records the UI symptom: effortChipsFor returns r.supportedEfforts unfiltered with no availability allow-list to trim the picker.

**Done when.** Service tier and effort selection travel one contract from request through entitlement admission, provider mapping, pricing and settlement, so a user is only offered levels their plan and the resolved provider can actually serve.

**Where.** `apps/web/features/chat/components/Composer/ComposerFooter.tsx:109-111`

**From.** gap-audit-2026-08-08.md; capability-gaps.csv; ui-gaps.md

**Folded in.** GAP-P1-007 Model-routing controls not completely enforced end to end; CAP-020 Reasoning-effort access policy; CAP-021 Provider flex service tier; GAP-217 no reasoning-effort availability allow-list

### BILL-11 — No quality-adjusted cost or accepted-task economics are tracked

`MEDIUM` · billing · effort M

**What.** SCALE-SPEND-003: raw token price is optimised without tracking accepted-task cost, retries, escalations, human intervention, cache savings or failed-work cost. BIZ-037: accepted-task economics (cost per successful task, retry and escalation cost) are not implemented.

**Done when.** Emit a task outcome dimension alongside cost events so cost per accepted task, retry cost, escalation cost and failed-work cost can be computed.

**From.** AuditRemediationLedger.md SCALE-SPEND-003; AuditRemediationLedger.md BIZ-037

**Folded in.** No quality-adjusted cost metrics (accepted-task cost, retries, escalations); No accepted-task economics

### BILL-12 — Prompt-cache and compression cost effects are not measured

`MEDIUM` · billing · effort M

**What.** SCALE-SPEND-005: prompt-cache hit, semantic cache, compaction and retrieval cost are not tracked without double-counting. A related concrete defect was already fixed (cache pricing diverged between desktop and web, and prompt-cache-helper.ts hardcoded a flat 0.1 multiplier when DeepSeek is actually 0.02x), which shows the measurement gap has produced real revenue errors.

**Done when.** Record cache-hit and compaction token classes as distinct cost dimensions so savings and retrieval overhead are both measurable without double-counting.

**From.** AuditRemediationLedger.md SCALE-SPEND-005; ExecutionPlan.md #33

**Folded in.** Cache/compression cost effects are not measured

### BILL-14 — Plan identity is not separated from display labels, so renames and regional pricing break stable IDs

`MEDIUM` · billing · effort M

**What.** BIZ-003: stable plan IDs need to survive renaming and regional pricing, and separation is not confirmed. The mobile paywall test asserting a stale 'Upgrade to Max' label after 'Max 5x' became canonical is the concrete symptom of the same coupling.

**Done when.** Give every plan a stable non-display ID used by all persistence and gating, and drive labels from a separate display-metadata table keyed by that ID and locale.

**Where.** `packages/contracts/types/src/billing-catalog.ts:167`

**From.** AuditRemediationLedger.md BIZ-003; AuditRemediationLedger.md BASE-003 finding 6

**Folded in.** Plan identity not separated from display labels

### BILL-20 — Billing self-service is portal-redirect only — no in-app invoice history, payment method display, or cancel-plan control, and portal authorization is unverified

`MEDIUM` · billing · effort M

**What.** BIZ-015: customer portal and invoice access authorization is not confirmed complete and the risk of cross-customer object IDs is not confirmed closed. GAP-215: desktop BillingSettings renders dl rows plus one 'Manage billing' button with no invoice table, no card display and no cancel control. GAP-249: no cancel-plan section or 'cancels on <date>' state. GAP-256: web payment methods and cancellation are Stripe-portal redirects rather than inline controls.

Also recorded by a later audit (Settings IA — Billing section Partial/Missing by surface (current plan, adjust plan, invoices table)): docs/current/parity-implementation-matrix.md#Settings IA — Billing corroborates BILL-20's 'portal-redirect only' finding across surfaces, naming the specific missing rows: current plan, adjust plan, and an invoices table with due date/status/action columns.

**Done when.** Verify portal session creation is scoped to the authenticated customer, then surface invoice history, payment method and cancellation state in-app on web and desktop rather than deferring entirely to the Stripe portal.

**Where.** `apps/desktop/src/features/settings/BillingSettings.tsx`, `apps/web/features/settings/sections/BillingSection.tsx`

**From.** AuditRemediationLedger.md BIZ-015; audit/ui-gaps.md GAP-215; audit/ui-gaps.md GAP-249; audit/ui-gaps.md GAP-256; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Customer portal/invoice access authorization not confirmed complete; No in-app invoice history, payment-method display, or cancel-plan control; No cancel-plan section or 'cancels on <date>' state; Payment methods and plan cancellation are Stripe-portal redirects

### BILL-22 — Enterprise contract onboarding is incomplete and there are no delegated billing/admin roles with audit

`MEDIUM` · billing · effort L

**What.** BIZ-019: contract entitlements, invoice/ACH/wire references, term dates, seat and usage commitments, renewal and support contacts are not confirmed complete or explicitly marked request-only. BIZ-021: no delegated billing/admin roles exist with audit, and billing administrators must not automatically receive content access — which is not confirmed enforced.

**Done when.** Model contract entitlements and term data explicitly (or mark the path request-only in the UI), and introduce a billing-admin role that carries no content access, with an audit event on every billing mutation.

**From.** AuditRemediationLedger.md BIZ-019; AuditRemediationLedger.md BIZ-021

**Folded in.** Enterprise contract onboarding incomplete; No delegated billing/admin roles with audit

### BILL-25 — Refund-delta correctness is unconfirmed under replay, out-of-order delivery and partial refunds

`MEDIUM` · billing · effort M

**What.** BIZ-024: no confirmed tests cover replayed, out-of-order or partial refunds. A per-charge refund clawback exists in the Stripe webhook handlers, so the mechanism is present but its behaviour under these cases is untested.

**Done when.** Add tests covering replayed refund webhooks, out-of-order arrival relative to the charge, and partial refunds, asserting the credit delta is applied exactly once and never drives a negative balance.

**Where.** `apps/web/app/api/stripe-webhook/lib/handlers.ts`

**From.** AuditRemediationLedger.md BIZ-024

**Folded in.** Refund-delta correctness not confirmed under replay/out-of-order/partial refunds

### BILL-26 — Rolling usage windows are imprecisely defined and reset times may not derive from authoritative windows

`MEDIUM` · billing · effort M

**What.** BIZ-025: billing period, weekly, five-hour, flagship, voice, Work, media, concurrency and provider-specific constraints are not all precisely defined across products. BIZ-026: reset times and warnings may rely on client clocks or approximations instead of the authoritative window. PP-25 records that reset times and rolling windows are not reconciled across surfaces.

**Done when.** Define each rolling window once in the entitlement contract, return authoritative reset timestamps from the server, and make every surface render from that value rather than computing locally.

**From.** AuditRemediationLedger.md BIZ-025; AuditRemediationLedger.md BIZ-026; AuditRemediationLedger.md PP-25

**Folded in.** Rolling usage windows not precisely defined across products; Reset times/warnings may not derive from authoritative windows

### BILL-27 — No per-project or per-team budgets, chargeback or showback despite it being advertised

`MEDIUM` · billing · effort L

**What.** BIZ-028: per-project/team budgets and chargeback/showback are not confirmed implemented where advertised. PP-25 records the same absence of per-project/team usage and budgets. ENT-007 (primary home: enterprise controls) notes 19 modules under apps/web/app/api reference SLA/uptime vocabulary but quotas, budgets, chargeback and priority-support tiering do not follow from it.

**Done when.** Add budget objects scoped to project and team, enforce them in the admission path built for BILL-09, and expose showback reporting per scope.

**From.** AuditRemediationLedger.md BIZ-028; AuditRemediationLedger.md PP-25; AuditRemediationLedger.md ENT-007

**Folded in.** No per-project/team budgets or chargeback/showback where advertised

### BILL-28 — Web-versus-store subscription ownership conflicts have no documented resolution policy

`MEDIUM` · billing · effort M

**What.** BIZ-032: there is no documented ownership or migration policy producing one effective entitlement across web and store purchases. Mobile currently ships read-only store-source routing (apps/mobile/src/features/billing/subscriptionSource.ts) and historical-row renewal/grace handling, which is only sufficient while no native purchase exists — a precondition BILL-44 is about to remove.

**Done when.** Document and implement an ownership precedence rule for concurrent web and store subscriptions, plus a migration path when a user buys on the second channel, before native IAP is enabled.

**Where.** `apps/mobile/src/features/billing/subscriptionSource.ts:47-70`, `apps/web/lib/services/subscription-service.ts:113-137`

**From.** AuditRemediationLedger.md BIZ-032; AuditRemediationLedger.md BIZ-031

**Folded in.** Web-vs-store subscription ownership conflicts not fully resolved

### BILL-29 — Gross margin is not computed from settled revenue, estimates are not separated from settled values, and no margin dashboards or alerts exist

`MEDIUM` · billing · effort L

**What.** BIZ-034: gross margin is not computed from settled revenue and attributable COGS, and exclusion of local/user-key activity from managed-cloud revenue and COGS is not confirmed. BIZ-035: estimate, accrued and settled values are not separated, so estimates may be presented as audited fact. BIZ-036: no margin dashboards or alerts exist by plan, model, provider, capability or cohort, and role-based access to sensitive provider pricing is not confirmed.

**Done when.** Separate estimate/accrued/settled explicitly in the ledger, compute margin only from settled revenue and attributable COGS with local/BYOK activity excluded, and build dashboards and alerts with role-gated access to provider pricing.

**From.** AuditRemediationLedger.md BIZ-034; AuditRemediationLedger.md BIZ-035; AuditRemediationLedger.md BIZ-036

**Folded in.** Gross margin not computed from settled revenue/attributable COGS; Estimate/accrued/settled values not separated; No margin dashboards/alerts by plan/model/provider/capability/cohort

### BILL-30 — A published '40% gross margin' claim has no live calculation behind it

`MEDIUM` · billing · effort S

**What.** BIZ-038: the claim may be published without a live calculation and needs removal or qualification until one exists. This depends on BILL-29, since the calculation it asserts does not yet exist.

**Done when.** Remove or explicitly qualify the margin claim until the settled-revenue margin calculation from BILL-29 exists and can be cited.

**From.** AuditRemediationLedger.md BIZ-038

**Folded in.** '40% gross margin' claim may be published without a live calculation

### BILL-32 — Gift and promo codes lack ledger-backed issuance and redemption

`MEDIUM` · billing · effort M

**What.** BIZ-040: brute force, replay, stacking and negative-balance prevention are not confirmed for gift and promo codes.

Also recorded by a later audit (Promo/invite codes — Partial/Gated): docs/current/parity-implementation-matrix.md#Billing, Usage, Waitlist — Promo/invite codes confirms BILL-32's ledger-backed issuance/redemption gap from a second document; the adjacent 'Enterprise interest list — Partial/Gated' row is the waitlist half of the same surface.

**Done when.** Back code issuance and redemption with ledger entries, add rate limiting and single-use enforcement, define stacking rules explicitly, and assert redemption can never drive a negative balance.

**From.** AuditRemediationLedger.md BIZ-040; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Gift/promo codes lack ledger-backed issuance/redemption

### BILL-34 — Billing events are uncorrelated, there are no customer-safe diagnostics, and no operational billing alerts exist

`MEDIUM` · billing · effort L

**What.** BIZ-043: checkout, webhook, subscription, entitlement, usage, invoice and support events are not correlated. BIZ-044: current plan, source, last reconciliation, reset times, transaction references and a support code are not confirmed surfaced to customers. BIZ-045: no alerts exist for webhook lag, reconciliation drift, negative credits, duplicate grants, missing invoices, tax failure, high COGS or plan-gate anomalies. Observability breadth is a known constraint — SCALE-VER-006 records near-total absence of production tracing spans, though apps/web/lib/observability/span.ts now has production importers including the Stripe webhook route.

**Done when.** Attach a correlation ID across the checkout-to-usage chain, expose a customer-safe billing diagnostics panel with a support code, and add alerts for the named failure modes.

**Where.** `apps/web/lib/observability/span.ts`, `apps/web/app/api/stripe-webhook/route.ts`

**From.** AuditRemediationLedger.md BIZ-043; AuditRemediationLedger.md BIZ-044; AuditRemediationLedger.md BIZ-045; AuditRemediationLedger.md SCALE-VER-006

**Folded in.** Checkout/webhook/subscription/entitlement/usage/invoice/support events not correlated; No customer-safe billing diagnostics; No operational billing alerts

### BILL-35 — No data-retention or audit policy for financial records

`MEDIUM` · billing · effort M

**What.** BIZ-046: required-record retention versus sensitive-data minimisation is not confirmed for financial records. DPDP O-13 records the same gap from the privacy side — retention has no maximum age for billing rows, and two lifecycle cron routes exist but are not registered in vercel.json so they never run. Primary home is billing because the retention obligation here is statutory record-keeping; see DPDP-16 for the privacy-side duty.

**Done when.** Define a financial-record retention schedule that satisfies statutory record-keeping while minimising sensitive fields, register the lifecycle cron routes so they actually run, and record the policy in the DPA and privacy notice.

**Where.** `vercel.json`

**From.** AuditRemediationLedger.md BIZ-046; DPDP_PROGRESS.md O-13

**Folded in.** No data retention/audit policy for financial records

### BILL-36 — Enterprise accounts are deliberately uncapped but have no spend observability at all

`MEDIUM` · billing · effort M

**What.** unlimited:true and the large ledger allocation constant are deliberate design (contract-priced, not misconfigured), but there is no per-account spend report, threshold or alert — an operator cannot answer 'is this account above its contract?' from anything the system produces.

**Done when.** Add a schema for contracted value and a report comparing it against actual ledger spend, with thresholds and alerts, so an uncapped contract remains observable.

**Where.** `apps/web/lib/services/managed-usage-policy.ts:100`

**From.** docs/agent-context/known-flaws.md BILLING-ENTERPRISE-NO-SPEND-INSTRUMENT

**Folded in.** BILLING-ENTERPRISE-NO-SPEND-INSTRUMENT: enterprise accounts have a deliberately uncapped contract but no spend observability

### BILL-37 — Basic tier displays $7 while the referenced Stripe price object is $8

`MEDIUM` · billing · effort S

**What.** Catalog and display price is $7 (founder decision) but desktop's referenced Stripe price object is $8; whichever surface actually charges must point at a real $7 Stripe price. Code must not create Stripe prices, so this requires a founder Stripe action.

**Done when.** Founder creates a $7 Basic price in test and live modes and updates the env var; then assert in a test that the displayed price and the resolved Stripe price agree.

**Where.** `apps/desktop/src/constants/pricing.ts`

**Blocked by.** Founder must create a $7 Stripe price (test + live) and update the env var

**From.** docs/agent-context/known-flaws.md BASIC-STRIPE-PRICE-7-VS-8

**Folded in.** BASIC-STRIPE-PRICE-7-VS-8: Basic tier displays $7 but the underlying Stripe test price object is $8

### BILL-39 — Stripe's 26-hour India card renewal delay and mandate-decline codes are unhandled

`MEDIUM` · billing · effort M

**What.** VERIFIED still present: grep across apps/web/app/api/stripe-webhook and apps/web/lib for india_recurring_payment_mandate_canceled and payment_intent_mandate_invalid returns zero matches. Stripe issues a mandatory 24-hour pre-debit notification and waits 26 hours before charging Indian cards; the PaymentIntent sits in 'processing' that entire window and cannot be cancelled. Only needed once INR billing is real (BILL-40).

**Done when.** Handle the processing PaymentIntent state and the India-specific mandate decline codes in the Stripe webhook before INR billing goes live.

**Where.** `apps/web/app/api/stripe-webhook`

**From.** FoundersAssistance.md #28b

**Folded in.** Stripe delays every Indian card renewal by 26 hours

### BILL-40 — INR pricing is published in code but not sellable — no active INR Stripe Prices exist

`MEDIUM` · billing · effort S

**What.** STRIPE_PRICE_BASIC_MONTHLY_INR and STRIPE_PRICE_TEAM_MONTHLY_INR are read by lib/pricing.ts and unset in every environment because no active INR Price exists in Stripe; the only one that existed (Basic Rs 399) is archived. The system fails closed correctly (checkoutReady:false) so India currently sees USD pricing rather than a broken button.

**Done when.** Once BILL-38's pricing decision is made, create the corresponding INR Prices in Stripe and set the env vars.

**Where.** `apps/web/lib/pricing.ts`

**Blocked by.** Resolution of BILL-38's pricing decision

**From.** FoundersAssistance.md #28c

**Folded in.** INR is published but not sellable

### BILL-41 — Currency support does not generalise — only USD and INR resolve, per-currency Price slots are missing for three plans, and the INR top-up rate is undecided

`MEDIUM` · billing · effort M

**What.** Only USD and INR have currency resolution paths, so EUR/GBP/JPY/BRL buyers are served plain USD pricing; adding one currency means editing three files across two packages. Only Basic and Team have per-currency Price ID slots — pro, max and max_15x have none. Separately, /api/billing/top-up previously hardcoded currency:'usd'; because a top-up is a PaymentIntent rather than an invoice Stripe would not have rejected it, it would have silently charged a second currency with undisclosed forex and cross-border fees. That was fixed 2026-08-14 (the route now reads the live subscription currency and refuses non-USD subscribers, failing closed if Stripe is unreachable), but the INR price of one top-up unit remains undecided because exchange rates vary Rs 57-125/$ across plans.

**Done when.** Build a currency-keyed price table before adding a sixth currency, add per-currency Price ID slots for pro/max/max_15x, and have the founder set the INR top-up unit price or keep top-ups USD-only by explicit policy.

**Where.** `apps/web/app/api/billing/top-up/route.ts`

**Blocked by.** Founder decision on INR top-up unit pricing

**From.** FoundersAssistance.md #29d; FoundersAssistance.md #28d

**Folded in.** Only USD and INR have currency resolution paths; Only Basic and Team have per-currency Price ID slots; Top-ups were USD-only against regional plans

### BILL-43 — Razorpay integration has unanswered sales and tax questions that must be resolved before any code is written

`MEDIUM` · billing · effort L

**What.** Razorpay's international-payments documentation covers one-time collection only and does not confirm recurring subscriptions for a foreign entity; if one-time only it cannot replace Stripe for subscriptions. Cross-border pricing is quoted case-by-case (~3%+GST). Razorpay International is a payment service provider, not merchant of record, so the OIDAR GST registration and 18% remittance obligation stays with AGI Automation LLC — neither Stripe Tax nor Razorpay covers it, while a merchant-of-record alternative would, at higher cost and without UPI parity. Adding Razorpay also means a second billing provider: a second webhook surface, subscription lifecycle, reconciliation, and a fourth resolveSubscriptionBillingSource owner.

**Done when.** Ask Razorpay sales the recurring-for-foreign-entity question first, then confirm the OIDAR GST position with an accountant, before any integration work begins.

**Where.** `apps/web/lib/services/subscription-service.ts`

**Blocked by.** Razorpay sales answer on recurring support for foreign entities, plus accountant confirmation of the OIDAR GST position

**From.** FoundersAssistance.md #28e

**Folded in.** Razorpay — what to ask sales before any code is written

### BILL-48 — AGI Work runs carry no per-task cost or usage, so a long autonomous run is unpriced to the user

`MEDIUM` · billing · effort M

**What.** CloudAgentRunSchema carries provider, model and state but no usage or cost fields, and TaskDetailPanel never renders any. PP-13 records the same absence of per-task cost or usage surfaced to the user.

Also recorded by a later audit (AGI Work usage is not disclosed as a separate pool from chat): agentic-modes-gap-02 (competitive-gap-2026-08-15): packages/contracts/types/src/usage-vocabulary.ts:28 defines only 'session'|'weekly'|'weeklyFlagship'|'period' buckets with no agiwork/cowork bucket, and no settings copy or UI discloses which pool AGI Work draws from. Cheapest honest fix is an explicit in-product statement that AGI Work turns draw from the same session/weekly/period pool as chat, independent of the per-task cost work BILL-48 describes.

**Done when.** Add usage and cost fields to the cloud agent run record, populate them from the settlement path, and render per-task cost in the task detail panel.

**Where.** `packages/contracts/cloud-contracts/src/cloud-agent-runs.ts:47-65`, `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`

**From.** docs/agent-context/phase4-capability-audit.md PP-13; AuditRemediationLedger.md PP-13; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** AGI Work has no per-task cost/token usage tracked or surfaced

### BILL-49 — Three published pricing-page feature claims have no implementation behind them

`MEDIUM` · billing · effort M

**What.** F-7: proFeature2 'Priority routing across providers' has no backing implementation anywhere in apps/web/lib, apps/web/app/api or packages/ai — a grep for priority/tier routing returns nothing. It is a product-capability claim so it must be built or cut across ten locale bundles. F-8: enterpriseFeature2 ('Custom capacity and dedicated support') and enterpriseFeature4 ('Annual contract with a dedicated account manager') are staffing commitments rather than product features and were left deliberately, needing founder confirmation of intent to staff.

**Done when.** Founder decides whether to build priority routing or cut the claim from all ten locale bundles, and confirms whether the enterprise staffing commitments are real; remove any claim that survives neither test.

**Where.** `packages/ui/i18n/locales/*/pricing.json`

**Blocked by.** Founder product decision on priority routing and enterprise staffing commitments

**From.** DPDP_PROGRESS.md F-7; DPDP_PROGRESS.md F-8

**Folded in.** proFeature2 'Priority routing across providers' claim has no backing implementation; enterpriseFeature2 and enterpriseFeature4 pricing claims are unbacked in code

### BILL-50 — VS Code shows no credit balance and only a single aggregate usage bar with no per-model limits or reset schedule

`MEDIUM` · billing · effort M

**What.** GAP-297: credit-service.ts and /api/llm/v1/credits/balance exist on web but apps/extension-vscode has no credits surface at all, in the IDE where credits are actually spent. GAP-298: usageMeter.ts computes a single usagePercentage and one resetsAt, with no per-model limits, reset schedule or empty state.

**Done when.** Consume the effective-entitlement endpoint from BILL-15 in the VS Code extension to render credit balance, per-model limits and authoritative reset times.

**Where.** `apps/extension-vscode/src/data/usageMeter.ts:55-120`

**From.** audit/ui-gaps.md GAP-297; audit/ui-gaps.md GAP-298

**Folded in.** Credits balance and top-up are absent from the IDE where credits are spent; Usage is a single aggregate bar — no per-model limits, reset schedule or empty state

### BILL-52 — Gateway LLM rate limit may still be a flat 30/min for every tier including Pro and Max

`MEDIUM` · billing · effort M · **unclear**

**What.** Sources disagree. known-flaws GATEWAY-RATE-LIMIT-NOT-TIER-AWARE-01 records the code comment documenting a tier-aware limit while the actual config is a flat {windowMs:60000, max:30}, with planGate.ts setting req.planTier but no rate-limit code reading it. ExecutionPlan #27 records the flat-across-all-122-configs finding as fixed on 2026-08-09, including the note that a flat 20 msg/min was below the 12 concurrent turns sold to max_15x. Which state is live was not re-verified.

**Done when.** Re-read services/api-gateway/src/middleware/rateLimit.ts against planGate.ts, and either confirm the tier-aware limit landed or wire req.planTier into the limiter and correct the comment.

**Where.** `services/api-gateway/src/middleware/rateLimit.ts`, `services/api-gateway/src/middleware/planGate.ts`

**From.** docs/agent-context/known-flaws.md GATEWAY-RATE-LIMIT-NOT-TIER-AWARE-01; ExecutionPlan.md #27

**Folded in.** GATEWAY-RATE-LIMIT-NOT-TIER-AWARE-01: llm-completions rate limit flat 30/min for every tier; Rate limits flat across all 122 configs — no tier awareness anywhere

### BILL-53 — Reasoning-effort access is not clamped server-side by entitlement and unavailable levels are not shown honestly

`MEDIUM` · billing · effort M

**What.** CAP-020: server-side entitlements must clamp reasoning effort and the UI must show unavailable effort levels honestly, which is not implemented. GAP-217 records that effortChipsFor returns r.supportedEfforts unfiltered with no entitlement allow-list trimming the picker. gap-audit GAP-P1-007 groups this with batch and flex tier as routing controls not enforced end to end; those two (CAP-016, CAP-021) have their primary home in the ai-routing slice.

**Done when.** Clamp reasoning effort server-side against the caller's entitlement and render unavailable levels as explicitly gated rather than silently offering them.

**Where.** `apps/web/features/chat/components/Composer/ComposerFooter.tsx:109-111`

**From.** audit/capability-gaps.csv CAP-020; audit/ui-gaps.md GAP-217; gap-audit-2026-08-08.md GAP-P1-007

**Folded in.** Reasoning-effort access policy (EffortAccess); No reasoning-effort availability allow-list to trim the model picker

### BILL-54 — Plugin plan entitlements have no authoritative installation or execution lifecycle to attach to

`MEDIUM` · billing · effort L

**What.** CAP-008: plugin plan entitlements require an authoritative installation and execution lifecycle first, which does not exist — the hosted registry shipped read-only with no install path, and the CLI has no registry-backed install. Related governance items (CAP-009 org plugin policy, CAP-010 org skill policy) have their primary home in the security/enterprise slice.

**Done when.** Build the plugin install/execution lifecycle first, then attach plan entitlement checks to install and execution rather than to catalogue display.

**Where.** `apps/cli/src/features/plugins/registry.rs`

**From.** audit/capability-gaps.csv CAP-008; audit/capability-gaps.csv CAP-046

**Folded in.** Plugin plan entitlements (PluginEntitlements)

### BILL-55 — No storage or transfer quota exists per user, project or organization, and no surface shows account-level quota state

`MEDIUM` · billing · effort L

**What.** SCALE-GROW-007: no storage or transfer quotas exist per user, project or org, with no deterministic cleanup and no user-visible quota state. GAP-279: there is no account-level cloud storage quota screen with a Files/Images breakdown on web. GAP-043: mobile explicitly declines account storage quota totals because the cloud publishes no enforceable byte policy, and StorageScopeNotice states the following totals are device-only — an honest disclosure of the same missing policy. PP-09 separately records that file quotas, versions, retention and deletion propagation are all unconfirmed.

Also recorded by a later audit (No storage-quota disclosure anywhere in settings): settings-11-gap (competitive-gap-2026-08-15): grepping every settings section for 'Storage' (excluding localStorage/sessionStorage matches) returns zero UI results — no numeric quota, usage bar, or per-category breakdown on any surface. Adds a sequencing note: if no per-account cap is actually enforced server-side, re-scope the claim rather than build a decorative meter.

Also recorded by a later audit (No storage-quota disclosure anywhere in settings (settings-11-gap)): Confirms the UI half: grepping every settings section for 'Storage' (excluding localStorage/sessionStorage) returns zero results — no numeric quota, usage bar or per-category breakdown on any surface checked. Fix guidance: if a per-account cap is enforced server-side, surface exact usage-vs-cap numbers; otherwise re-scope the claim rather than build a decorative meter.

**Done when.** Define an enforceable byte quota per user, project and org, enforce it at upload admission, implement deterministic cleanup, and surface remaining quota on web and mobile.

**From.** AuditRemediationLedger.md SCALE-GROW-007; AuditRemediationLedger.md PP-09; audit/ui-gaps.md GAP-279; audit/ui-gaps.md GAP-043; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** No storage/transfer quotas per user/project/org; No account-level cloud storage quota screen (Files/Images breakdown); Account storage quota totals are declined until the Cloud publishes an enforceable byte policy

### BILL-56 — Stale and conflicting plan-pricing copy persists across docs and locale bundles

`MEDIUM` · billing · effort S

**What.** BIZ-002: stale Team pricing of $30 may still exist alongside the current $25/seat/month and $240/seat/year, with older decisions and snapshot tests needing removal. DOC-016 records the same Team price conflict plus stale tier names as not fully corrected. PP-25 additionally records education-plan claims as undecided. A related stale-tier-name defect (retired 'Hobby' tier leaking into privacy, terms and refund-policy copy) appears already corrected — a grep of those three pages returns no 'Hobby' match.

**Done when.** Sweep pricing copy, snapshot tests and locale bundles for stale tier names and prices, drive the displayed price from the catalog, and either substantiate or remove the education-plan claim.

**From.** AuditRemediationLedger.md BIZ-002; AuditRemediationLedger.md DOC-016; AuditRemediationLedger.md PP-25

**Folded in.** Stale Team pricing ($30) may still exist alongside current $25/seat pricing; Team price conflict and stale tier names not fully corrected

### BILL-61 — Enterprise-Local licensing verification is fully implemented twice (TypeScript package and Rust crate) with no runtime consumer and no fixture-replay parity test between the two

`MEDIUM` · billing · effort M

**What.** BACKEND-RUNTIME-007, CROSS-SURFACE-009 and DEAD-CODE-019 (audit/parity-2026-08-15). packages/contracts/licensing self-documents as 'NOT wired into any app runtime'; crates/agiworkforce-licensing/src/lib.rs:19-21 states the same for the byte-for-byte Rust reimplementation; zero non-test callers exist for either. Unlike packages/client/sync — which keeps its TS and Rust halves honest via a golden-fixture replay suite (src/**fixtures**/cursor-compare.json) — no such test exists between the two licensing implementations, so their signed-container verification behavior could already have diverged. docs/decisions/2026-07-30-enterprise-local-verifier-retention.md is cited as the founder decision that may explain the pre-build.

**Done when.** Confirm with the founder whether this is intentionally pre-built-ahead-of-need and record that explicitly; before either implementation is wired into a real enforcement path, add a shared fixture set and a replay test on both the TS and Rust sides mirroring packages/client/sync's pattern.

**Where.** `packages/contracts/licensing/src/index.ts:9-11`, `packages/contracts/licensing/src/verify.ts:57`, `crates/agiworkforce-licensing/src/lib.rs:19-21`, `packages/client/sync/src/__fixtures__/cursor-compare.json`

**From.** audit/parity-2026-08-15/gaps/domain-backend-runtime (BACKEND-RUNTIME-007); audit/parity-2026-08-15/gaps/domain-cross-surface (CROSS-SURFACE-009); audit/parity-2026-08-15/gaps/domain-dead-code (DEAD-CODE-019, licensing half)

**Folded in.** BACKEND-RUNTIME-007; CROSS-SURFACE-009; DEAD-CODE-019

### BILL-68 — No education-institution plan exists (no route, plan card, or billing-catalog entry)

`MEDIUM` · billing · effort XL

**What.** G9 (models-reasoning-controls-quotas-pricing domain, competitive-gap-2026-08-15). Grepping apps/web/app and the pricing i18n bundle for education/Edu/teachers finds no route, plan card, or billing-catalog entry. Majority convergence across benchmarked competitors.

**Done when.** Would need a new plan tier, a checkout path, and institutional-status verification; treat as a product decision before any code.

**Where.** `apps/web/app/pricing/page.tsx`, `packages/contracts/types/src/billing-catalog.ts`

**From.** audit/competitive-gap-2026-08-15/domains/models-reasoning-controls-quotas-pricing (G9, claim mqp-24)

### BILL-71 — Unswept consumers of `subscription?.tier ?? 'free'` without a billing-readiness guard may still misreport a paying customer as Free

`MEDIUM` · billing · effort S

**What.** QA-004 follow-up (audit/manual-qa-2026-08-15.md). The P0 itself is fixed — a MAX 15X account had been shown Free as 'Your current plan' with a $7 Basic downgrade labelled 'Upgrade', because commit 04b6b8acb added an `unauthenticated` flag to web-auth-store that two consumers never adopted (billing-policy.ts's readiness helper returned true on the 401-no-error case, and WebChatPage.tsx:3820 read the tier with no readiness guard). The QA note records the unresolved half verbatim: 'the whole class is "consumers that read subscription?.tier ?? \'free\' without a readiness guard". Grepping for that exact pattern across surfaces would likely find more.' That sweep was never run.

**Done when.** Run a repo-wide grep for `subscription?.tier ?? 'free'` and equivalent patterns across every surface, and route each match through the billing-policy readiness guard added by the QA-004 fix.

**Where.** `apps/web/shared/stores/billing-policy.ts`, `apps/web/features/chat/pages/WebChatPage.tsx:3820`, `apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx`

**From.** audit/manual-qa-2026-08-15.md#QA-004 (follow-up)

### SEC-68 — resolveAutoRoute grants any catalog model on an explicit selection without applying subscription-tier admission

`MEDIUM` · security/auth · effort M

**What.** F24 (2/3 panel, MEDIUM): the caller-supplied `selection` takes the `!alias` branch of resolveAutoRoute, where the only gate is evaluateEligibility (lifecycle, trust mode, runtime profile, harness, capabilities, context size). The tier gates — normalizeTier → tierMaximumProfiles clamp and tierAllowedSlots — are computed later and therefore run only on the alias/Auto branch, so an explicit flagship model key returns status:'selected' with reason:'explicit' for any subscription tier. scheduled-agent-executor.ts is a caller that treats resolveAutoRoute as its model-access authority: it passes selection: task.model and never calls canAccessModel/checkModelTierAccess, unlike the chat-completions request processor which does. task.model is user-supplied and validated only for catalog membership. A user on a low tier stores a flagship model on a recurring schedule and the turn runs on AGI's server-held key. The continuity pin re-admits a caller-supplied currentModelKey through the same tier-free path. Primary home is authorization (an entitlement check that can be routed around); billing owns the cost consequence.

**Done when.** Tier admission is applied on the explicit branch as well as the alias branch — the selection's routing slot is rejected when absent from policy.tierAllowedSlots for the normalized tier — with the check folded into evaluateEligibility so every call site including the continuity pin inherits it; scheduled-agent-executor calls canAccessModel before routing and schedule-service validates model against the creator's tier at write time.

**Where.** `packages/ai/routing/src/auto.ts:636,678-688,723`, `apps/web/lib/services/scheduled-agent-executor.ts:72`, `apps/web/lib/services/schedule-service.ts:286`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2244`

**From.** CLAUDE-SECURITY-RESULTS.md (F24)

### WEB-62 — Unswept `subscription?.tier ?? 'free'` reads without a billing-readiness guard may still misrender plan state elsewhere

`MEDIUM` · billing · effort S

**What.** manual-qa-2026-08-15 QA-004 'Worth a follow-up': the fixed P0 (a Max 15x subscriber shown as Free, with a $7 downgrade offered as 'Upgrade') was one instance of the class 'consumers that read subscription?.tier ?? "free" without a readiness guard'. billing-policy.ts was hardened and two known call sites fixed, but the repo-wide grep for the pattern was recommended and never performed.

**Done when.** Grep the repo for the pattern and route every remaining match through the billing-policy readiness guard added by the QA-004 fix.

**Where.** `apps/web/shared/stores/billing-policy.ts`, `apps/web/features/chat/pages/WebChatPage.tsx:3820`

**From.** audit/manual-qa-2026-08-15.md#QA-004 follow-up

### BILL-31 — referral_code field is stored but entirely unwired

`LOW` · billing · effort M

**What.** BIZ-039: attribution, eligibility, anti-self-referral, reward settlement, expiration, reversal and privacy handling are all undefined for the referral_code field.

**Done when.** Either implement the referral lifecycle end to end (attribution, eligibility, anti-self-referral, settlement, expiry, reversal) or remove the field and any UI that collects it.

**From.** AuditRemediationLedger.md BIZ-039

**Folded in.** referral_code field is unused/unwired

### BILL-42 — The 7-seat India Team threshold exists only as a documented decision, not a checkout check

`LOW` · billing · effort S

**What.** Recorded as engineering work surfaced by the India billing investigation: 'The 7-seat Team threshold as a real checkout check, not a docs note.' Depends on the BILL-38 decision.

**Done when.** Enforce the seat cap at checkout time for Indian Team self-serve purchases, routing 8+ seats to sales.

**Blocked by.** Depends on BILL-38 pricing decision

**From.** FoundersAssistance.md #29d

**Folded in.** 7-seat Team threshold for India exists only as a documented decision

### BILL-47 — isManagedComputePrivateBetaEnabled() asserts the opposite of its return value

`LOW` · billing · effort S

**What.** The function returns true when managed compute is OPEN (public alpha). Both call sites read it correctly so behaviour is sound today, but the name is misleading and risks a future misread on the kill-switch path.

**Done when.** Rename the function to match its semantics (for example isManagedComputeOpen) and update both call sites.

**From.** docs/agent-context/known-flaws.md 2026-08-08 narrative

**Folded in.** isManagedComputePrivateBetaEnabled() name asserts the opposite of its return value

### BILL-59 — In-chat commerce and checkout are explicitly not planned — recorded so it is not re-raised as a gap

`LOW` · billing · effort S · **wontfix**

**What.** CAP-047: founder declined on 2026-08-05; no agentic purchasing or checkout surface is planned. gap-audit §7.3 lists it as an explicit product decision, not an accidental omission, and instructs that it should not be built unless a founder decision changes.

**Done when.** No action. Do not re-report as a capability gap; revisit only on an explicit founder decision.

**From.** audit/capability-gaps.csv CAP-047; gap-audit-2026-08-08.md §7.3

**Folded in.** In-chat commerce and checkout (Commerce;InstantCheckout)

### BILL-62 — Three legacy-alias /api/usage/\* billing routes have zero callers anywhere in the monorepo

`LOW` · billing · effort S

**What.** BACKEND-RUNTIME-008 and DEAD-CODE-010 (audit/parity-2026-08-15). apps/web/app/api/usage/{analytics,history,providers}/route.ts each self-document as 'Legacy alias' and each wrap the identical getManagedUsageSummary(userId) call; repo-wide grep finds zero non-route-file, non-test callers. The sibling /api/billing/analytics uses the same pattern but IS live (called from Desktop's billingUsage.ts), and the live web Settings > Usage panel calls the base /api/usage route — confirming these three are the dead outliers.

**Done when.** Delete the three dead route files; keep /api/billing/analytics until Desktop migrates to the base /api/usage route, or add a comment if a documented external/partner contract references them.

**Where.** `apps/web/app/api/usage/analytics/route.ts`, `apps/web/app/api/usage/history/route.ts`, `apps/web/app/api/usage/providers/route.ts`

**From.** audit/parity-2026-08-15/gaps/domain-backend-runtime (BACKEND-RUNTIME-008); audit/parity-2026-08-15/gaps/domain-dead-code (DEAD-CODE-010); audit/parity-2026-08-15/gaps/domain-backend-runtime.json BACKEND-RUNTIME-008; audit/parity-2026-08-15/gaps/domain-dead-code.json DEAD-CODE-010

**Folded in.** BACKEND-RUNTIME-008; DEAD-CODE-010; Three orphaned /api/usage/\* legacy alias routes have zero callers anywhere in the monorepo

### BILL-64 — Usage bars are model-class-scoped only — no per-named-model usage row exists in the contract or the UI

`LOW` · billing · effort M

**What.** G1/G3 (models-reasoning-controls-quotas-pricing domain, competitive-gap-2026-08-15). UsageSection.tsx:137-139,243-252 buckets usage by model class (e.g. flagship_weekly_usage_percentage); the usage contract has no per-model-id field at all, so a specific model that becomes a differentiated cost driver cannot be shown on its own bar.

**Done when.** Add a model-scoped usage row and a fifth UsageBar if a specific model becomes a differentiated cost driver; requires a per-model-id field in the usage summary contract.

**Where.** `apps/web/features/settings/sections/UsageSection.tsx:137-139,243-252`

**From.** audit/competitive-gap-2026-08-15/domains/models-reasoning-controls-quotas-pricing (G3, claim mqp-09)

### BILL-65 — No named higher-usage seat SKU exists within the Team plan — Team models exactly one uniform $25/seat price

`LOW` · billing · effort L

**What.** G5 (models-reasoning-controls-quotas-pricing domain, competitive-gap-2026-08-15). packages/contracts/types/src/billing-catalog.ts:142,167,227-249's Team entry models a single uniform per-seat SKU; no second seat type exists anywhere in checkout or member management.

**Done when.** Add a seat-type dimension to Team checkout and member management if pursued; single-competitor differentiator, low priority.

**Where.** `packages/contracts/types/src/billing-catalog.ts:142,167,227-249`

**From.** audit/competitive-gap-2026-08-15/domains/models-reasoning-controls-quotas-pricing (G5, claim mqp-17)

### BILL-66 — No self-serve Enterprise checkout path — the Enterprise card's only CTA is contact-sales

`LOW` · billing · effort L

**What.** G6 (models-reasoning-controls-quotas-pricing domain, competitive-gap-2026-08-15). apps/web/app/pricing/page.tsx:856-887 exposes only contactSalesCta -> /contact-sales; no self-serve alternative exists anywhere in the pricing flow.

**Done when.** Low priority unless self-serve enterprise volume becomes a stated goal; would need a checkout path plus contract-limit provisioning.

**Where.** `apps/web/app/pricing/page.tsx:856-887`

**From.** audit/competitive-gap-2026-08-15/domains/models-reasoning-controls-quotas-pricing (G6, claim mqp-18)

### BILL-67 — No published per-model API pricing, cache-tier rates, named service tiers or batch discount, despite cache economics already being computed internally

`LOW` · billing · effort M

**What.** G8 (models-reasoning-controls-quotas-pricing domain, competitive-gap-2026-08-15). apps/web/app/api-docs/page.tsx is a curl quick-start plus a link to /openapi.json with zero pricing information, while apps/web/lib/prompt-cache-helper.ts and apps/web/lib/cost-tracker.ts already compute cache-tier cost effects internally.

**Done when.** Publish a pricing-reference page surfacing what is already metered internally (read model prices from the canonical catalog, never hardcoded); it need not mirror any single competitor's service_tier model.

**Where.** `apps/web/app/api-docs/page.tsx`, `apps/web/lib/prompt-cache-helper.ts`, `apps/web/lib/cost-tracker.ts`

**From.** audit/competitive-gap-2026-08-15/domains/models-reasoning-controls-quotas-pricing (G8, claim mqp-21)

### BILL-69 — No disclosed nonprofit discount program or FAQ entry

`LOW` · billing · effort S

**What.** G10 (models-reasoning-controls-quotas-pricing domain, competitive-gap-2026-08-15). Grepping apps/web/app and the pricing i18n bundle for 'nonprofit' finds no program, discount percentage, or FAQ entry.

**Done when.** Mostly a policy plus FAQ-copy decision if applied via a Stripe coupon at Team/Enterprise checkout.

**Where.** `apps/web/app/pricing/page.tsx`

**From.** audit/competitive-gap-2026-08-15/domains/models-reasoning-controls-quotas-pricing (G10, claim mqp-25)

### BILL-70 — The in-app paywall shows the upgrade tier's name but never its price, though the price is already returned by the same call

`LOW` · billing · effort S

**What.** G11 (models-reasoning-controls-quotas-pricing domain, competitive-gap-2026-08-15). InlinePaywallCard.tsx:201-202,234-239 builds CTA strings from getBillingPlanPricing(requiredTier).label only ('Upgrade to Pro'); the same call already returns monthlyPriceUsd, which is discarded.

**Done when.** Interpolate monthlyPriceUsd into the existing CTA strings — no new data plumbing required.

**Where.** `apps/web/features/chat/components/InlinePaywallCard.tsx:201-202,234-239`

**From.** audit/competitive-gap-2026-08-15/domains/models-reasoning-controls-quotas-pricing (G11, claim mqp-26)
