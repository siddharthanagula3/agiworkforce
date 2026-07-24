/**
 * Entitlement is a function of subscription STATUS, never of `plan_tier` alone.
 *
 * `plan_tier` is re-derived from the Stripe price on every
 * `customer.subscription.updated` event (see stripe-webhook/lib/db.ts), so a
 * canceled subscription whose price is still a paid price keeps a paid
 * `plan_tier` in the row — only `status` flips to `canceled`. Any code that
 * grants a paid capability off `plan_tier` without checking `status` therefore
 * leaks full paid access to canceled / unpaid users, and is also vulnerable to
 * out-of-order webhook replays that rewrite `plan_tier` back to paid.
 *
 * The chat-completions chokepoint (chat/completions/lib/auth-gate.ts) already
 * gates on exactly these statuses; this helper is the shared source of truth so
 * every other entitlement read (e.g. /api/me capability flags) stays consistent
 * with it.
 *
 * Cancellation policy: a subscription that is `active` with
 * `cancel_at_period_end = true` is still fully entitled — the user keeps paid
 * access through the billing period they paid for. Downgrade happens only when
 * Stripe flips `status` to `canceled` at the terminal `customer.subscription.deleted`
 * event. There is no mid-period cutoff and no prorated adjustment.
 */

export {
  ENTITLED_SUBSCRIPTION_STATUSES,
  effectivePlanTier,
  isEntitledSubscriptionStatus as isEntitledStatus,
} from '@agiworkforce/types';
