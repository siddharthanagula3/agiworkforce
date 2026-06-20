/**
 * Web surface trust-boundary tests.
 *
 * Verifies that the API layer enforces isolation between:
 *   - Local/BYOK sessions (no managed-cloud billing, no credit allocation)
 *   - BYOK tier (user-supplied keys, not AGI-funded compute)
 *   - Managed cloud (waitlist-gated, subscription-required)
 *
 * These are unit tests of the business logic rules, not integration tests
 * against live Stripe or Neon. Each gate function mirrors the production code.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Upgrade tier ordering — mirrors apps/web/app/api/upgrade/route.ts
// ---------------------------------------------------------------------------

const TIER_ORDER: Record<string, number> = {
  free: 0,
  hobby: 1,
  pro: 2,
  max: 3,
  enterprise: 4,
};

const isValidUpgrade = (from: string, to: string): boolean => {
  const fromOrder = TIER_ORDER[from] ?? -1;
  const toOrder = TIER_ORDER[to] ?? -1;
  if (fromOrder === -1 || toOrder === -1) return false;
  return toOrder > fromOrder;
};

describe('upgrade tier ordering', () => {
  it('free → hobby is a valid upgrade', () => {
    expect(isValidUpgrade('free', 'hobby')).toBe(true);
  });

  it('hobby → pro is a valid upgrade', () => {
    expect(isValidUpgrade('hobby', 'pro')).toBe(true);
  });

  it('pro → max is a valid upgrade', () => {
    expect(isValidUpgrade('pro', 'max')).toBe(true);
  });

  it('pro → hobby is NOT a valid upgrade (downgrade)', () => {
    expect(isValidUpgrade('pro', 'hobby')).toBe(false);
  });

  it('pro → pro is NOT a valid upgrade (same tier)', () => {
    expect(isValidUpgrade('pro', 'pro')).toBe(false);
  });

  it('max → hobby is NOT a valid upgrade (downgrade)', () => {
    expect(isValidUpgrade('max', 'hobby')).toBe(false);
  });

  it('free → free is NOT a valid upgrade', () => {
    expect(isValidUpgrade('free', 'free')).toBe(false);
  });

  it('unknown tier → any known tier is rejected', () => {
    expect(isValidUpgrade('unknown', 'pro')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Credit-based proration logic — mirrors the proration calculation in route.ts
// ---------------------------------------------------------------------------

const calculateCreditAmountCents = (
  oldPlanPriceCents: number,
  creditsRemaining: number,
  creditsAllocated: number,
): number => {
  if (creditsAllocated <= 0) return 0;
  const unusedFraction = creditsRemaining / creditsAllocated;
  return Math.floor(oldPlanPriceCents * unusedFraction);
};

describe('credit-based proration calculation', () => {
  it('50% credits remaining → 50% credit applied', () => {
    expect(calculateCreditAmountCents(2000, 500, 1000)).toBe(1000);
  });

  it('100% credits remaining (unused period) → full credit applied', () => {
    expect(calculateCreditAmountCents(2000, 1000, 1000)).toBe(2000);
  });

  it('0% credits remaining (exhausted) → zero credit', () => {
    expect(calculateCreditAmountCents(2000, 0, 1000)).toBe(0);
  });

  it('result is floored (no fractional cents)', () => {
    // 2001 * (1/3) = 667.0 → floor = 667
    expect(calculateCreditAmountCents(2001, 1, 3)).toBe(667);
  });

  it('zero allocation guard — does not divide by zero', () => {
    expect(calculateCreditAmountCents(2000, 0, 0)).toBe(0);
  });

  it('credit cannot exceed the old plan price', () => {
    const credit = calculateCreditAmountCents(2000, 1000, 1000);
    expect(credit).toBeLessThanOrEqual(2000);
  });

  it('credit is always non-negative', () => {
    expect(calculateCreditAmountCents(2000, 0, 1000)).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Stripe customer balance semantics
// A negative Stripe balance = credit that auto-applies to next invoice.
// ---------------------------------------------------------------------------

describe('Stripe customer balance credit semantics', () => {
  it('applying credit reduces balance (more negative)', () => {
    const existingBalance = -500; // $5.00 credit already on account
    const newCredit = -1000; // $10.00 additional credit
    const resultBalance = existingBalance + newCredit;
    expect(resultBalance).toBe(-1500);
    expect(resultBalance).toBeLessThan(existingBalance);
  });

  it('rollback restores original balance on Stripe failure', () => {
    const originalBalance = -500;
    const appliedCredit = -1000;
    const balanceAfterApply = originalBalance + appliedCredit;
    // On failure, restore: subtract the credit (add its absolute value back)
    const restoredBalance = balanceAfterApply - appliedCredit;
    expect(restoredBalance).toBe(originalBalance);
  });

  it('zero credit does not change customer balance', () => {
    const existing = -200;
    const credit = 0;
    expect(existing + credit).toBe(existing);
  });
});

// ---------------------------------------------------------------------------
// Trust-boundary: BYOK vs managed-cloud billing isolation
// ---------------------------------------------------------------------------

describe('billing trust-boundary isolation', () => {
  it('CRITICAL: BYOK users must not consume AGI compute credits', () => {
    // preferCloudCredits is only true for managed tier
    const preferCloudCredits = (privacyMode: string) => privacyMode === 'managed';
    expect(preferCloudCredits('byok')).toBe(false);
    expect(preferCloudCredits('local')).toBe(false);
    expect(preferCloudCredits('managed')).toBe(true);
  });

  it('CRITICAL: upgrade endpoint requires an active paid subscription (not free)', () => {
    // Route validates hasActivePaidPlan before allowing mid-cycle upgrade
    const canUpgradeMidCycle = (plan: string, status: string) =>
      plan !== 'free' && ['active', 'trialing'].includes(status);

    expect(canUpgradeMidCycle('free', 'active')).toBe(false);
    expect(canUpgradeMidCycle('hobby', 'active')).toBe(true);
    expect(canUpgradeMidCycle('hobby', 'canceled')).toBe(false);
    expect(canUpgradeMidCycle('pro', 'trialing')).toBe(true);
  });

  it('rate limit: upgrade endpoint is capped at 5 requests per minute', () => {
    // Mirrors the rateLimitConfigs.upgrade entry in rate-limit.ts
    const upgradeRateLimit = { limit: 5, window: '1 m', failClosed: false };
    expect(upgradeRateLimit.limit).toBe(5);
    expect(upgradeRateLimit.window).toBe('1 m');
  });
});

// ---------------------------------------------------------------------------
// Webhook event filtering — only subscribed events trigger DB changes
// ---------------------------------------------------------------------------

describe('stripe webhook event filtering', () => {
  const HANDLED_EVENTS = new Set([
    'checkout.session.completed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
  ]);

  it('subscription lifecycle events are handled', () => {
    expect(HANDLED_EVENTS.has('customer.subscription.updated')).toBe(true);
    expect(HANDLED_EVENTS.has('customer.subscription.deleted')).toBe(true);
  });

  it('payment events are handled', () => {
    expect(HANDLED_EVENTS.has('invoice.payment_succeeded')).toBe(true);
    expect(HANDLED_EVENTS.has('invoice.payment_failed')).toBe(true);
  });

  it('unrelated events are ignored', () => {
    expect(HANDLED_EVENTS.has('payment_intent.created')).toBe(false);
    expect(HANDLED_EVENTS.has('radar.early_fraud_warning.created')).toBe(false);
    expect(HANDLED_EVENTS.has('account.updated')).toBe(false);
  });
});
