import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { effectivePlanTier } from '@/lib/entitlement';
import { logger } from '@/lib/logger';
import { getManagedUsageSummary } from '@/lib/services/managed-usage-summary-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  getOperatorMappedConnectorIds,
  getUserCustomConnectorSummaries,
  getUserGithubInstallations,
} from '@/lib/user-connector-tools';
import type {
  SupportAccountCitation,
  SupportAccountConnector,
  SupportAccountContext,
  SupportAccountEmail,
  SupportAccountPlan,
  SupportAccountUsage,
} from './types';
import { getIdentityUser } from '@/lib/server/identity';

export const SUPPORT_API_KEY_CEILING = 20;

const IDENTITY_LOOKUP_TIMEOUT_MS = 1500;
const PG_UNDEFINED_TABLE = '42P01';

function isUndefinedTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    ((error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE ||
      String((error as Record<string, unknown>)['message'] ?? '').includes('does not exist'))
  );
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function resolveSubscriptionSource(
  subscription: {
    stripe_subscription_id?: string | null;
    apple_original_transaction_id?: string | null;
    google_purchase_token?: string | null;
  } | null,
): SupportAccountPlan['subscriptionSource'] {
  if (!subscription) return 'none';
  if (subscription.stripe_subscription_id) return 'stripe';
  if (subscription.apple_original_transaction_id) return 'apple';
  if (subscription.google_purchase_token) return 'google';
  return 'manual';
}

async function resolveConnectors(
  db: DatabaseAdapter,
  userId: string,
): Promise<SupportAccountConnector[]> {
  const connectors: SupportAccountConnector[] = [];

  let rows: { id: string; connector_id: string; connected_at: string }[] = [];
  try {
    rows = await db.query<{ id: string; connector_id: string; connected_at: string }>(
      `select id, connector_id, connected_at
         from user_connectors
        where user_id = $1 and is_active = true
        order by connected_at desc`,
      [userId],
    );
  } catch (error) {
    if (!isUndefinedTable(error)) throw error;
    logger.warn({ userId }, 'user_connectors not migrated; support context reports no connectors');
  }

  const operatorMapped = getOperatorMappedConnectorIds();
  for (const row of rows) {
    if (!operatorMapped.has(row.connector_id)) continue;
    connectors.push({
      id: row.id,
      connectorId: row.connector_id,
      source: 'user',
      connectedAt: toIso(row.connected_at),
    });
  }

  const installations = await getUserGithubInstallations(userId);
  if (installations.length > 0 && !connectors.some((c) => c.connectorId === 'github')) {
    connectors.push({
      id: `github-app-${installations[0]!.installationId}`,
      connectorId: 'github',
      source: 'github-app',
      connectedAt: null,
    });
  }

  const custom = await getUserCustomConnectorSummaries(db, userId);
  for (const c of custom) {
    connectors.push({
      id: c.id,
      connectorId: `custom-${c.shortId}`,
      source: 'custom',
      connectedAt: toIso(c.createdAt),
    });
  }

  return connectors;
}

async function resolveApiKeyCount(db: DatabaseAdapter, userId: string): Promise<number> {
  const [row] = await db.query<{ count: string }>(
    `select count(*) as count from public.api_keys where user_id = $1 and revoked_at is null`,
    [userId],
  );
  const parsed = Number.parseInt(row?.count ?? '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function resolveEmail(userId: string): Promise<SupportAccountEmail> {
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const user = await Promise.race([
      getIdentityUser(userId).finally(() => {
        if (timer) clearTimeout(timer);
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('identity user lookup timeout')),
          IDENTITY_LOOKUP_TIMEOUT_MS,
        );
      }),
    ]);
    if (!user?.primaryEmail) return { present: false, verified: 'unknown' };
    return { present: true, verified: user.primaryEmailVerification };
  } catch (error) {
    logger.warn({ userId, error }, 'Support account context could not resolve email verification');
    return { present: false, verified: 'unknown' };
  }
}

async function resolveUsage(
  db: DatabaseAdapter,
  userId: string,
): Promise<SupportAccountUsage | null> {
  try {
    const summary = await getManagedUsageSummary(db, userId);
    return {
      usagePercentage: summary.usage_percentage,
      sessionUsagePercentage: summary.session_usage_percentage,
      weeklyUsagePercentage: summary.weekly_usage_percentage,
      flagshipWeeklyUsagePercentage: summary.flagship_weekly_usage_percentage,
      usageResetAt: summary.usage_reset_at ?? null,
      sessionResetAt: summary.session_reset_at ?? null,
      weeklyResetAt: summary.weekly_reset_at ?? null,
      hasUsageRemaining: summary.has_usage_remaining,
    };
  } catch (error) {
    logger.warn({ userId, error }, 'Support account context could not resolve managed usage');
    return null;
  }
}

/**
 * Resolve the read-only account context for ONE authenticated user.
 *
 * @param userId - MUST come from `getClerkAuthUser(request)`. Never from a
 *   request body, a query parameter, or model output.
 */
export async function resolveSupportAccountContext(
  db: DatabaseAdapter,
  userId: string,
): Promise<SupportAccountContext> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('resolveSupportAccountContext requires an authenticated user id');
  }

  const [subscription, usage, connectors, apiKeyCount, email] = await Promise.all([
    SubscriptionService.getSubscription(db, userId),
    resolveUsage(db, userId),
    resolveConnectors(db, userId),
    resolveApiKeyCount(db, userId),
    resolveEmail(userId),
  ]);

  const tier = subscription?.plan_tier || 'free';
  const status = subscription?.status || 'none';
  const effectiveTier = effectivePlanTier(subscription?.plan_tier, subscription?.status);

  return {
    plan: {
      tier,
      effectiveTier,
      displayName: tier.charAt(0).toUpperCase() + tier.slice(1),
      status,
      currentPeriodEnd: toIso(subscription?.current_period_end),
      subscriptionSource: resolveSubscriptionSource(subscription ?? null),
    },
    usage,
    connectors,
    apiKeys: {
      activeCount: apiKeyCount,
      atCeiling: apiKeyCount >= SUPPORT_API_KEY_CEILING,
    },
    email,
    resolvedAt: new Date().toISOString(),
  };
}

export function buildSupportAccountCitations(
  context: SupportAccountContext,
): SupportAccountCitation[] {
  const citations: SupportAccountCitation[] = [
    { id: 'account:plan', label: 'Your account, Plan', href: '/settings/billing' },
  ];
  if (context.usage) {
    citations.push({ id: 'account:usage', label: 'Your account, Usage', href: '/settings/usage' });
  }
  if (context.connectors.length > 0) {
    citations.push({
      id: 'account:connectors',
      label: 'Your account, Connectors',
      href: '/settings/connections',
    });
  }
  if (context.apiKeys.activeCount > 0) {
    citations.push({
      id: 'account:api-keys',
      label: 'Your account, API keys',
      href: '/settings/account',
    });
  }
  return citations;
}
