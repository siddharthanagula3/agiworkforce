import 'server-only';

import { randomUUID } from 'node:crypto';
import { creditsFromCents, creditsFromMicrousd } from '@agiworkforce/types';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import {
  bonusCreditExpiry,
  grantBonusCredits as grantBonusCreditLot,
} from '@/lib/services/bonus-credit-service';

export interface GrowthPoint {
  day: string;
  signups: number;
}

export interface OperatorOverview {
  users: { total: number; last7: number; last30: number };
  subscriptions: { byTier: Array<{ tier: string; status: string; count: number }> };
  feedback: { total: number; last7: number };
  beta: { pending: number; approved: number; rejected: number };
  growth: GrowthPoint[];
}

export interface FeedbackRow {
  id: string;
  userId: string | null;
  email: string | null;
  subject: string | null;
  message: string;
  createdAt: string;
  pagePath: string | null;
  screenshotKey: string | null;
}

export interface UserRow {
  id: string;
  email: string | null;
  displayName: string | null;
  planTier: string | null;
  status: string | null;
  creditsAllocated: number | null;
  creditsUsed: number | null;
  createdAt: string;
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const PG_UNDEFINED_TABLE = '42P01';

function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record['code'] === PG_UNDEFINED_TABLE ||
    /relation .* does not exist/.test(String(record['message'] ?? ''))
  );
}

export async function readOperatorOverview(): Promise<OperatorOverview> {
  const db = getNeonDb();

  // Counted in one round trip rather than four. These are whole-table counts on
  // an operator page, so the cost is the scan, not the number of statements.
  const [totals] = await db.query<{
    users_total: string;
    users_7: string;
    users_30: string;
    feedback_total: string;
    feedback_7: string;
  }>(
    `select
       (select count(*) from public.profiles) as users_total,
       (select count(*) from public.profiles where created_at > now() - interval '7 days') as users_7,
       (select count(*) from public.profiles where created_at > now() - interval '30 days') as users_30,
       (select count(*) from public.feedback) as feedback_total,
       (select count(*) from public.feedback where created_at > now() - interval '7 days') as feedback_7`,
  );

  const tiers = await db.query<{ plan_tier: string; status: string; count: string }>(
    `select plan_tier, status, count(*)::text as count
       from public.subscriptions
      group by plan_tier, status
      order by count(*) desc`,
  );

  // A pending migration must not take the whole dashboard down with it: every
  // other panel here answers a question that does not depend on this table.
  const beta = await db
    .query<{ status: string; count: string }>(
      `select status, count(*)::text as count
         from public.beta_applications
        group by status`,
    )
    .catch((error: unknown) => {
      if (!isMissingRelation(error)) throw error;
      logger.warn({ error }, 'Operator overview: beta_applications is not migrated yet');
      return [] as Array<{ status: string; count: string }>;
    });

  // generate_series so a day with no signups is a zero rather than a gap the
  // chart would silently close up.
  const growth = await db.query<{ day: string; signups: string }>(
    `select to_char(d.day, 'YYYY-MM-DD') as day,
            count(p.id)::text as signups
       from generate_series(
              date_trunc('day', now()) - interval '29 days',
              date_trunc('day', now()),
              interval '1 day'
            ) as d(day)
       left join public.profiles p
         on date_trunc('day', p.created_at) = d.day
      group by d.day
      order by d.day`,
  );

  const betaCounts = { pending: 0, approved: 0, rejected: 0 };
  for (const row of beta) {
    if (row.status === 'pending') betaCounts.pending = asNumber(row.count);
    if (row.status === 'approved') betaCounts.approved = asNumber(row.count);
    if (row.status === 'rejected') betaCounts.rejected = asNumber(row.count);
  }

  return {
    users: {
      total: asNumber(totals?.users_total),
      last7: asNumber(totals?.users_7),
      last30: asNumber(totals?.users_30),
    },
    subscriptions: {
      byTier: tiers.map((row) => ({
        tier: row.plan_tier,
        status: row.status,
        count: asNumber(row.count),
      })),
    },
    feedback: {
      total: asNumber(totals?.feedback_total),
      last7: asNumber(totals?.feedback_7),
    },
    beta: betaCounts,
    growth: growth.map((row) => ({ day: row.day, signups: asNumber(row.signups) })),
  };
}

export async function readRecentFeedback(limit = 50): Promise<FeedbackRow[]> {
  const db = getNeonDb();
  const rows = await db.query<{
    id: string;
    user_id: string | null;
    email: string | null;
    subject: string | null;
    message: string;
    created_at: string;
    metadata: Record<string, unknown> | null;
  }>(
    `select f.id, f.user_id, p.email, f.subject, f.message, f.created_at, f.metadata
       from public.feedback f
       left join public.profiles p on p.id = f.user_id
      order by f.created_at desc
      limit $1`,
    [Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email,
    subject: row.subject,
    message: row.message,
    createdAt: new Date(row.created_at).toISOString(),
    pagePath: typeof row.metadata?.['page_path'] === 'string' ? row.metadata['page_path'] : null,
    screenshotKey:
      typeof row.metadata?.['screenshot_key'] === 'string' ? row.metadata['screenshot_key'] : null,
  }));
}

export async function readRecentUsers(limit = 50): Promise<UserRow[]> {
  const db = getNeonDb();
  // The credit row is the CURRENT period only; an older period would show a
  // stale balance next to a live plan.
  const rows = await db.query<{
    id: string;
    email: string | null;
    display_name: string | null;
    plan_tier: string | null;
    status: string | null;
    credits_allocated_microusd: string | number | null;
    credits_used_microusd: string | number | null;
    created_at: string;
  }>(
    `select p.id, p.email, p.display_name,
            s.plan_tier, s.status,
            tc.credits_allocated_microusd, tc.credits_used_microusd,
            p.created_at
       from public.profiles p
       left join public.subscriptions s on s.user_id = p.id
       left join lateral (
         select credits_allocated_microusd, credits_used_microusd
           from public.token_credits
          where user_id = p.id and period_end > now()
          order by period_end desc
          limit 1
       ) tc on true
      order by p.created_at desc
      limit $1`,
    [Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    planTier: row.plan_tier,
    status: row.status,
    creditsAllocated:
      row.credits_allocated_microusd === null
        ? null
        : creditsFromMicrousd(Number(row.credits_allocated_microusd)),
    creditsUsed:
      row.credits_used_microusd === null
        ? null
        : creditsFromMicrousd(Number(row.credits_used_microusd)),
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/**
 * Zero the consumed usage on a user's current credit period.
 *
 * Deliberately does not touch `credits_allocated_cents`: the allocation is what
 * the plan grants, and rewriting it here would silently change what the user
 * paid for. Only consumption is reset, and a `reset` row is written to
 * credit_transactions so the change is attributable afterwards rather than
 * appearing as usage that evaporated.
 */
export async function resetUserUsage(
  userId: string,
  actorId: string,
): Promise<{ reset: boolean; clearedCredits: number }> {
  const db = getNeonDb();
  const [current] = await db.query<{
    id: string;
    credits_used_cents: number;
    credits_used_microusd: string | number;
  }>(
    `select id, credits_used_cents, credits_used_microusd
       from public.token_credits
      where user_id = $1 and period_end > now()
      order by period_end desc
      limit 1`,
    [userId],
  );

  if (!current) return { reset: false, clearedCredits: 0 };

  const clearedCents = Number(current.credits_used_cents) || 0;
  if (clearedCents === 0) return { reset: true, clearedCredits: 0 };

  await db.execute(
    `update public.token_credits
        set credits_used_cents = 0,
            flagship_used_today_cents = 0,
            updated_at = now()
      where id = $1`,
    [current.id],
  );

  await db.execute(
    `insert into public.credit_transactions
       (user_id, credit_account_id, transaction_type, amount_cents, metadata)
     values ($1, $2, 'reset', $3, $4)`,
    [
      userId,
      current.id,
      clearedCents,
      JSON.stringify({ reason: 'operator_dashboard_reset', actor_id: actorId }),
    ],
  );

  return {
    reset: true,
    clearedCredits: creditsFromMicrousd(Number(current.credits_used_microusd) || 0),
  };
}

export interface BulkResetPreview {
  affectedUsers: number;
  clearedCredits: number;
}

/**
 * Fleet-wide goodwill reset, used after an incident so nobody pays for a window
 * we broke.
 *
 * Split into a preview and an execute because this rewrites live billing state
 * for every active user at once and cannot be undone by re-running it, the
 * operator needs to see the blast radius ("2,431 users, 168,024 credits") before
 * committing. Allocation is never touched, only consumption, and each affected
 * account gets its own `reset` ledger row so the change stays attributable per
 * user rather than as one opaque bulk mutation.
 */
export async function previewBulkUsageReset(): Promise<BulkResetPreview> {
  const db = getNeonDb();
  const [row] = await db.query<{ affected: string; cleared: string }>(
    `select count(*)::text as affected,
            coalesce(sum(credits_used_microusd), 0)::text as cleared
       from public.token_credits
      where period_end > now() and credits_used_cents > 0`,
  );
  return {
    affectedUsers: Number(row?.affected ?? 0),
    clearedCredits: creditsFromMicrousd(Number(row?.cleared ?? 0)),
  };
}

export async function resetAllUsersUsage(actorId: string): Promise<BulkResetPreview> {
  const db = getNeonDb();
  const affected = await db.query<{
    id: string;
    user_id: string;
    cleared_cents: number;
    cleared_microusd: string | number;
  }>(
    `with before as (
       select id, user_id, credits_used_cents, credits_used_microusd
         from public.token_credits
        where period_end > now() and credits_used_cents > 0
          for update
     )
     update public.token_credits tc
        set credits_used_cents = 0,
            flagship_used_today_cents = 0,
            updated_at = now()
       from before
      where tc.id = before.id
      returning tc.id, tc.user_id, before.credits_used_cents as cleared_cents,
                before.credits_used_microusd as cleared_microusd`,
  );

  if (affected.length === 0) return { affectedUsers: 0, clearedCredits: 0 };

  const values: unknown[] = [];
  const tuples = affected.map((row, i) => {
    const base = i * 4;
    values.push(
      row.user_id,
      row.id,
      Number(row.cleared_cents) || 0,
      JSON.stringify({ reason: 'operator_bulk_reset', actor_id: actorId }),
    );
    return `($${base + 1}, $${base + 2}, 'reset', $${base + 3}, $${base + 4})`;
  });

  await db.execute(
    `insert into public.credit_transactions
       (user_id, credit_account_id, transaction_type, amount_cents, metadata)
     values ${tuples.join(', ')}`,
    values,
  );

  return {
    affectedUsers: affected.length,
    clearedCredits: creditsFromMicrousd(
      affected.reduce((sum, r) => sum + (Number(r.cleared_microusd) || 0), 0),
    ),
  };
}

export interface GoodwillGrant {
  granted: boolean;
  grantId: string | null;
  credits: number;
  expiresAt: string | null;
}

export async function grantBonusCredits(
  userId: string,
  amountCents: number,
  actorId: string,
): Promise<GoodwillGrant> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('Bonus credit must be a positive whole number of cents.');
  }
  const db = getNeonDb();
  const credits = creditsFromCents(amountCents);
  const [account] = await db.query<{ id: string }>(
    `select id from public.token_credits
      where user_id = $1 and period_end > now()
      order by period_end desc
      limit 1`,
    [userId],
  );
  if (!account) return { granted: false, grantId: null, credits, expiresAt: null };

  const grantedAt = new Date();
  const grantId = await grantBonusCreditLot(db, {
    userId,
    source: 'promo',
    credits,
    referenceId: `goodwill:${randomUUID()}`,
    createdBy: actorId,
    grantedAt,
  });
  return {
    granted: true,
    grantId,
    credits,
    expiresAt: bonusCreditExpiry(grantedAt).toISOString(),
  };
}
