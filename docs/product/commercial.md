# Commercial And Launch Model

Status: Current
Owner: Founder + commercial/platform lead
Last updated: 2026-08-17

## Bootstrap Rule

AGI should not burn founder money on unmanaged cloud usage. Local and BYOK can launch first because users bring their own compute or provider key. Managed compute and managed credits are in public alpha and open by default (founder decision, 2026-06-27); the private-beta/waitlist launch gate is removed and `AGI_MANAGED_COMPUTE_PRIVATE_BETA` is an incident-response kill-switch only. The ability to meter cost, prevent abuse, and survive refunds and disputes must keep pace with public usage but no longer gates access.

## Launch Posture

| Area          | Current posture                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local         | Core differentiation. Free to use where technically available.                                                                                        |
| BYOK          | Explicit provider trust boundary. User pays provider directly.                                                                                        |
| Managed cloud | Public alpha, open by default (2026-06-27); subscription/entitlement-gated, not waitlist-gated. Env kill-switch only.                                 |
| Mobile v1     | Small on-device Local LLMs + Cloud public alpha (open by default). No Mobile BYOK in v1.                                                              |
| Web           | Subscription-backed account/chat state through Neon. No Web BYOK. Cloud is public alpha, open by default (subscription/entitlement-gated).            |
| Desktop       | Local and BYOK-local store locally. Desktop Cloud requires a subscription/entitlement (public alpha, open by default) and Neon-backed account state.  |
| CLI/VS Code   | Developer/workspace scoped; no silent global chat sync.                                                                                               |
| Chrome        | Cloud-only. Eligible Managed Cloud chats automatically mirror to the shared signed-in account conversation history; browser-task state remains local. |

## Managed Credit Requirements

Managed cloud is open by default in public alpha (2026-06-27), so these controls must keep pace with public usage rather than gate access. They remain required GA-hardening work, build and prove them as usage scales:

- usage ledger,
- provider price table,
- quota reservation and settlement,
- provider discount accounting,
- fraud/risk controls,
- refund and chargeback policy,
- dispute reserve,
- tax/fee model,
- provider terms review,
- customer-visible retention/deletion rules.

## Payment Guidance

Cards and Stripe are acceptable for low-risk subscriptions and waitlist capture, but managed top-ups can attract fraud, disputes, stolen-card abuse, and margin loss. For enterprise managed credits, prefer invoice/ACH/wire and signed order forms before card top-ups.

## Subscription Ownership Across Web and Store

One user has one `subscriptions` row and exactly one billing owner: Stripe (web),
Apple, or Google. The row must never carry identifiers from two channels at once.
`apps/web/lib/server/subscription-billing-owner.ts` reads that as `unverified` and
fails every billing action closed, and store renewal notifications skip a row that
also holds a Stripe subscription id.

Precedence and migration are decided by
`apps/web/lib/server/subscription-owner-handoff.ts` and applied by every write path
(`apps/web/app/api/stripe-webhook/lib/db.ts`,
`apps/web/lib/services/mobile-iap-ledger-service.ts`):

- While the recorded owner is still entitled, the second channel loses. A store
  purchase is refused with a conflict, and a Stripe write leaves the existing owner
  in place and logs the refusal rather than taking the row over silently.
- Once the recorded owner is no longer entitled, cancelled, expired, or a store row
  past its paid-through date plus renewal grace, the new purchase takes ownership
  and the losing channel's identifiers are cleared in the same write, so exactly one
  effective entitlement survives.
- Cancellation stays with the channel that sold the subscription. Nothing in this
  policy cancels a live subscription on the user's behalf.

## Profit Target

AGI can target modest margin on managed usage, but only after all processor fees, refunds, chargebacks, taxes, provider cost, support cost, and abuse reserves are accounted for. The product should remain valuable without managed cloud because Local and BYOK are first-class.

## Enterprise Path

Enterprise launch needs:

- organization policy,
- audit logs,
- SSO/SCIM,
- role-based admin,
- provider/connector policy,
- managed-credit ledger,
- support and feedback links,
- release-fix traceability.

The current enterprise control-plane foundation is the first step, not the final enterprise product.

## Plan Change, Proration, And Subscription State Transitions

Upgrade (paid to strictly larger paid allowance) runs through `apps/web/app/api/upgrade`.
Stripe is called with `proration_behavior: 'always_invoice'` and the same signed
`proration_date` for both preview and apply, so the customer is invoiced only the
prorated difference for the remainder of the period and the renewal date is preserved.
Raw usage survives the change: `SubscriptionService.carryCreditsForUpgradePeriod`
refuses any non-upgrade delta and `CreditService.carryUsageIntoUpgradedPeriod` mutates
the existing `token_credits` row in place, `credits_used_cents` is never reset and
`top_up_allocated_cents` is never touched, so consumed usage and purchased balance both
carry forward. The adjustment is keyed by `upgrade_allocation_key`, so a replayed
webhook cannot allocate twice.

Downgrade is not a code path in this repository. `apps/web/app/api/upgrade` refuses a
non-upgrade target and directs the customer to the Stripe billing portal; the portal's
proration behavior is Stripe dashboard configuration, not repo state. The webhook
consequence is the policy that matters here: a mid-period tier change arrives with the
same `current_period_start`, so `updateSubscriptionFromStripeSubscription` takes the
`allocateCreditsForPeriod` branch. That is a no-op on an existing account, so the
already-granted billing-period allowance is not clawed back mid-period, while plan-tier
gates (model access, rolling caps, surface entitlement) drop immediately with
`plan_tier`. The smaller allowance takes effect at the next renewal, when
`reset_credits_for_period` allocates the new plan's budget and carries only unexpired
purchased balance.

State transitions are ranked by `apps/web/lib/services/subscription-access-policy.ts`,
which is the single ladder every access decision must read:

| Rank | Stored statuses                                                         | Access                                                                |
| ---- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 2    | `active`, `trialing`                                                    | Managed execution, plan features, purchased-credit spend, plan change |
| 1    | `incomplete`, `past_due`                                                | None of the above; remediation through the billing portal only        |
| 0    | `unpaid`, `paused`, `canceled`, `expired`, `incomplete_expired`, `none` | None of the above                                                     |

An unrecognized status ranks 0. Access is monotonic: no state lower on this ladder may
grant a capability a higher state withholds, on any plan tier, and the effective plan
tier collapses to `free` below rank 2. `isMonotonicSubscriptionTransition` states the
rule for a transition, and the webhook already refuses the specific resurrection case
where an out-of-order Stripe update would move a `canceled` row back to entitled.

Disputes and chargebacks share the rank-1 `past_due` state. `charge.dispute.created`
stores `past_due`, sets `cancel_at_period_end`, revokes the entire remaining credit
balance through `deduct_credits`, and writes a `plan_changed` audit event. Because the
revocation drives `credits_used_cents` to the allocation, the next
`reset_credits_for_period` carries zero purchased balance, a chargeback can never
restore purchased value at renewal. A top-up refund instead calls
`handle_top_up_refund`, which retires `top_up_allocated_cents` even after the balance
was spent.

## Allowance And Purchased Balance Are Distinct Entitlements

`public.token_credits` carries two balances in one cents ledger:
`credits_allocated_cents` is the spendable total and `top_up_allocated_cents` is the
purchased portion inside it.

| Attribute         | Included plan allowance   | Purchased balance                                                                      |
| ----------------- | ------------------------- | -------------------------------------------------------------------------------------- |
| Expiry            | End of the billing period | Carries across renewals; a purchase older than 12 months is excluded at the next carry |
| Refundable        | No                        | Yes, `handle_top_up_refund` retires the purchase even after it was spent               |
| Revocable         | Yes, on dispute           | Yes, on dispute                                                                        |
| Transferable      | No                        | No                                                                                     |
| Consumption order | First                     | Second, reachable only once the included allowance is exhausted                        |

The consumption order is enforced by `reserve_managed_usage_request_with_limits`, which
tags purchased-funded spend `is_overage` and excludes it from the plan window, and by
`resolveOverageHeadroomCents`, which passes
`least(credits_allocated_cents - credits_used_cents, top_up_allocated_cents)` as the
remaining purchased budget. Non-transferability is enforced by migration
`0126_credit_balance_transferability.sql`: the owner of a credit account and of a ledger
entry is immutable, so no write can detach a balance from the identity that paid for it
and from its refund and dispute path.

## Cost Of Goods Ledger

`managed_usage_requests.actual_cost_cents` is what the customer was charged. It is not a
cost figure and it says nothing about the capabilities that are not bought by the token.
Migration `0127_cogs_ledger.sql` adds the two tables that answer the margin question:

- `provider_cost_events`: one row per settled managed operation, written from
  `finalizeManagedUsageRequest`, which every managed capability settles through except
  video: a completed video job settles inside `finalize_video_generation_job`, so
  `finalizeVideoGenerationJob` emits its own event. It
  records the capability, the provider and model, the unit the capability is actually
  bought in (`token`, `image`, `second`, `minute`, `request`), how many of those units
  were consumed, what the provider cost, and what was billed. `source_ref` is the
  settlement identity, so a retried settlement cannot double count.
- `cogs_adjustments`: processing fees, refunds, chargebacks and their reserve,
  discounts, support goodwill and tax. Stripe fees, refunds and chargebacks are imported
  from `balanceTransactions.list` by the daily `/api/cron/reconcile-credits` run over a
  three-day trailing window, which is wide enough for late settlement and idempotent
  enough to overlap safely.

`cogs_summary(start, end)` is the only aggregation. `gross_margin_cents` is billed spend
less provider cost and every adjustment in the window. Both tables keep a nullable
`user_id`: account erasure nulls it and the cost record survives, because a financial
record with no payer is still a cost.
