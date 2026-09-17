import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';

/**
 * Where an escalation sits in the queue.
 *
 * `support_tier` was already negotiated per enterprise contract and stored on
 * `organization_billing_contracts`, but nothing read it, so an enterprise
 * customer waited behind a free-tier visitor. This is the one place that
 * translates a contracted tier into queue order.
 *
 * The mapping is deliberately coarse. A tier nobody recognises resolves to
 * `normal` rather than to the top, because an unrecognised value in a Stripe
 * metadata field is a typo far more often than it is a promise.
 */

export const HANDOFF_PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const;

export type HandoffPriority = (typeof HANDOFF_PRIORITIES)[number];

export const DEFAULT_HANDOFF_PRIORITY: HandoffPriority = 'normal';

const TIER_PRIORITY: Readonly<Record<string, HandoffPriority>> = Object.freeze({
  platinum: 'urgent',
  premier: 'urgent',
  enterprise: 'high',
  gold: 'high',
  priority: 'high',
  business: 'high',
  standard: 'normal',
  silver: 'normal',
  basic: 'low',
});

export function isHandoffPriority(value: unknown): value is HandoffPriority {
  return typeof value === 'string' && (HANDOFF_PRIORITIES as readonly string[]).includes(value);
}

export function priorityForSupportTier(tier: string | null | undefined): HandoffPriority {
  if (!tier) return DEFAULT_HANDOFF_PRIORITY;
  return TIER_PRIORITY[tier.trim().toLowerCase()] ?? DEFAULT_HANDOFF_PRIORITY;
}

/** Lower sorts first. Used by the queue reader's `order by`. */
export function priorityRank(priority: HandoffPriority): number {
  return HANDOFF_PRIORITIES.indexOf(priority);
}

export interface ResolvedSupportPriority {
  priority: HandoffPriority;
  supportTier: string | null;
}

const ANONYMOUS: ResolvedSupportPriority = {
  priority: DEFAULT_HANDOFF_PRIORITY,
  supportTier: null,
};

/**
 * Resolves the contracted support tier for whoever is escalating.
 *
 * Fails open to `normal`: a database hiccup must never stop an escalation, and
 * being answered in ordinary order is a far smaller harm than not being
 * answered at all.
 */
export async function resolveSupportPriority(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string | null,
): Promise<ResolvedSupportPriority> {
  if (!userId) return ANONYMOUS;

  try {
    const rows = await db.query<{ support_tier: string | null }>(
      `select c.support_tier
         from public.organization_billing_contracts c
         join public.organization_members m
           on m.organization_id = c.organization_id
        where m.user_id = $1
          and c.support_tier is not null
          and c.ended_at is null`,
      [userId],
    );

    let best = ANONYMOUS;
    for (const row of rows) {
      const candidate = priorityForSupportTier(row.support_tier);
      if (best.supportTier === null || priorityRank(candidate) < priorityRank(best.priority)) {
        best = { priority: candidate, supportTier: row.support_tier };
      }
    }
    return best;
  } catch (error) {
    logger.warn({ error, userId }, '[support-handoff] support tier unreadable; queueing as normal');
    return ANONYMOUS;
  }
}
