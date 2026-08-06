/**
 * @file Read-only account context for the support agent.
 *
 * OWNERSHIP RULE (the whole point of this module):
 * `resolveSupportAccountContext` takes a `userId` that its CALLER obtained from
 * `getClerkAuthUser(request)`. There is no overload, no request parameter and no
 * variant that accepts an identifier from a request body, a query string, or a
 * model. If a future caller wants to resolve "some other user", it has to add
 * that capability itself — it cannot get it here by accident.
 *
 * USAGE POLICY:
 * This module must never import `lib/server/managed-usage-policy`. That module's
 * docblock is explicit: its allowance values "must never be serialized into
 * pricing, usage, or client configuration responses. Public clients get
 * percentages and reset times only." We therefore read the already-public
 * percentage contract from `managed-usage-summary-service` instead. A unit test
 * asserts this file's import list, so the rule survives an edit.
 */

import 'server-only';

import { effectivePlanTier } from '@/lib/entitlement';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
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

/** Mirrors the ceiling enforced by POST /api/settings/api-keys. */
export const SUPPORT_API_KEY_CEILING = 20;

const CLERK_LOOKUP_TIMEOUT_MS = 1500;
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

/** Same derivation /api/me uses, so the two surfaces cannot disagree. */
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

async function resolveConnectors(userId: string): Promise<SupportAccountConnector[]> {
  const db = getNeonDb();
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

  // Same filter /api/connectors GET applies: a row for an id the operator has
  // not mapped has no runtime effect, so reporting it would be a fake state.
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

  // Custom MCP connectors: the row id and the namespaced `custom-<shortId>` are
  // kept; the user-authored display NAME and the endpoint URL are dropped here.
  // Both are user-controlled strings and neither is needed to talk about, or to
  // revoke, the connector.
  const custom = await getUserCustomConnectorSummaries(userId);
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

async function resolveApiKeyCount(userId: string): Promise<number> {
  const db = getNeonDb();
  const [row] = await db.query<{ count: string }>(
    `select count(*) as count from public.api_keys where user_id = $1 and revoked_at is null`,
    [userId],
  );
  const parsed = Number.parseInt(row?.count ?? '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Email verification state, capped the same way /api/me caps its Clerk lookup.
 *
 * A timeout or a Clerk outage yields `'unknown'`, never `'unverified'`. The
 * difference matters: "your email is not verified" is an actionable claim and
 * the agent must not make it because a network call was slow.
 */
async function resolveEmail(userId: string): Promise<SupportAccountEmail> {
  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const user = await Promise.race([
      client.users.getUser(userId).finally(() => {
        if (timer) clearTimeout(timer);
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('clerk getUser timeout')),
          CLERK_LOOKUP_TIMEOUT_MS,
        );
      }),
    ]);
    const primary = user.primaryEmailAddress;
    if (!primary) return { present: false, verified: 'unknown' };
    const status = primary.verification?.status ?? null;
    if (status === 'verified') return { present: true, verified: 'verified' };
    if (status === null) return { present: true, verified: 'unknown' };
    return { present: true, verified: 'unverified' };
  } catch (error) {
    logger.warn({ userId, error }, 'Support account context could not resolve email verification');
    return { present: false, verified: 'unknown' };
  }
}

async function resolveUsage(userId: string): Promise<SupportAccountUsage | null> {
  try {
    const summary = await getManagedUsageSummary(userId);
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
    // Degrade to "I don't know your usage" rather than guessing a number. The
    // answer layer treats a null fact as unciteable and abstains.
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
export async function resolveSupportAccountContext(userId: string): Promise<SupportAccountContext> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('resolveSupportAccountContext requires an authenticated user id');
  }

  const [subscription, usage, connectors, apiKeyCount, email] = await Promise.all([
    SubscriptionService.getSubscription(userId),
    resolveUsage(userId),
    resolveConnectors(userId),
    resolveApiKeyCount(userId),
    resolveEmail(userId),
  ]);

  const tier = subscription?.plan_tier || 'free';
  const status = subscription?.status || 'none';
  // Entitlement is a function of STATUS, not raw tier (lib/entitlement.ts). The
  // raw tier is kept only so billing UI can honestly say "Pro — canceled".
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

/**
 * Citations for account-grounded claims. The answer layer's mandatory-citation
 * rule ("an answer with no source becomes an abstention") is satisfiable for
 * account facts without the answer layer inventing a source string.
 */
export function buildSupportAccountCitations(
  context: SupportAccountContext,
): SupportAccountCitation[] {
  const citations: SupportAccountCitation[] = [
    { id: 'account:plan', label: 'Your account — Plan', href: '/settings/billing' },
  ];
  if (context.usage) {
    citations.push({ id: 'account:usage', label: 'Your account — Usage', href: '/settings/usage' });
  }
  if (context.connectors.length > 0) {
    citations.push({
      id: 'account:connectors',
      label: 'Your account — Connectors',
      href: '/settings/connections',
    });
  }
  if (context.apiKeys.activeCount > 0) {
    citations.push({
      id: 'account:api-keys',
      label: 'Your account — API keys',
      href: '/settings/account',
    });
  }
  return citations;
}
