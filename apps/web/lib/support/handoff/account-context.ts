import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getManagedUsageSummary } from '@/lib/services/managed-usage-summary-service';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { logger } from '@/lib/logger';
import type { HandoffAccountContext } from '@agiworkforce/cloud-contracts/support';

const LOOKUP_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise).catch((error: unknown) => {
      logger.warn({ error, label }, 'Support handoff account lookup failed');
      return null;
    }),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS);
    }),
  ]);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const ANONYMOUS_ACCOUNT_CONTEXT: HandoffAccountContext = {
  signedIn: false,
  userId: null,
  planTier: null,
  subscriptionStatus: null,
  currentPeriodEnd: null,
  usagePercentage: null,
  usageResetAt: null,
  hasUsageRemaining: null,
};

/**
 * @param userId a Clerk user id already verified by the route. Never accept one
 *               from a request body.
 */
export async function buildHandoffAccountContext(
  db: DatabaseAdapter | null,
  userId: string | null,
): Promise<HandoffAccountContext> {
  if (!userId || !db) return ANONYMOUS_ACCOUNT_CONTEXT;

  const [entitlement, usage] = await Promise.all([
    withTimeout(resolveEntitlementBundle(db, userId), 'subscription'),
    withTimeout(getManagedUsageSummary(db, userId), 'managed-usage'),
  ]);
  const subscription = entitlement?.subscription ?? null;

  const degradedParts: string[] = [];
  if (!entitlement) degradedParts.push('subscription lookup unavailable');
  if (!usage) degradedParts.push('usage lookup unavailable');

  return {
    signedIn: true,
    userId,
    planTier: subscription?.plan_tier ?? usage?.plan_tier ?? null,
    subscriptionStatus: subscription?.status ?? usage?.subscription_status ?? null,
    currentPeriodEnd: toIso(subscription?.current_period_end ?? null),
    usagePercentage: usage?.usage_percentage ?? null,
    usageResetAt: usage?.usage_reset_at ?? null,
    hasUsageRemaining: usage?.has_usage_remaining ?? null,
    ...(degradedParts.length ? { degraded: degradedParts.join('; ') } : {}),
  };
}
