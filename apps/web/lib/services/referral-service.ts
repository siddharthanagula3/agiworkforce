import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { formatCredits, isProPlanTier } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { getIdentityUser } from '@/lib/server/identity';
import {
  bonusCreditExpiry,
  getPrepaidCreditBalances,
  grantBonusCredits,
  revokeBonusCreditGrant,
} from '@/lib/services/bonus-credit-service';
import { recordNotification } from '@/lib/services/notification-service';
import {
  REFERRAL_PROGRAM,
  generateReferralCode,
  isReferralStatus,
  referralLink,
  type ReferralBlockReason,
  type ReferralProgramTerms,
  type ReferralStatus,
} from '@/lib/services/referral-program';
import { isDisposableEmail, normalizeEmailIdentity } from '@/lib/services/referral-signals';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_LISTED_FRIENDS = 100;
const NETWORK_REFRESH_INTERVAL = '1 day';

export interface ReferralFriend {
  id: string;
  status: ReferralStatus;
  joinedAt: string;
  rewardAt: string | null;
}

export interface ReferralOverview {
  code: string | null;
  link: string | null;
  program: ReferralProgramTerms;
  stats: {
    joined: number;
    subscribed: number;
    rewarded: number;
    creditsEarned: number;
  };
  bonus: {
    availableCredits: number;
    nextExpiry: string | null;
  };
  friends: ReferralFriend[];
}

export type ReferralAttributionOutcome = 'attributed' | 'blocked' | 'skipped';

export interface ReferralRewardSweepSummary {
  processed: number;
  rewarded: number;
  capped: number;
  blocked: number;
  failed: number;
  remaining: boolean;
}

interface ReferralRow {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  created_at: string | Date;
  signup_network_hash: string | null;
  friend_bonus_grant_id: string | null;
}

function toCount(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toTime(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const time = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isFinite(time) ? time : null;
}

export function referralSignupBlockReason(input: {
  friendEmail: string | null;
  referrerEmail: string | null;
  friendNetworkHash: string | null;
  referrerNetworkHash: string | null;
  referrerNetworkSeenAt: string | Date | null;
  signedUpAt: number;
}): ReferralBlockReason | null {
  if (isDisposableEmail(input.friendEmail)) return 'disposable_email';
  const friendIdentity = normalizeEmailIdentity(input.friendEmail);
  if (friendIdentity !== null && friendIdentity === normalizeEmailIdentity(input.referrerEmail)) {
    return 'email_alias';
  }
  const seenAt = toTime(input.referrerNetworkSeenAt);
  if (
    input.friendNetworkHash !== null &&
    input.friendNetworkHash === input.referrerNetworkHash &&
    seenAt !== null &&
    Math.abs(input.signedUpAt - seenAt) <= REFERRAL_PROGRAM.networkMatchDays * DAY_MS
  ) {
    return 'same_network';
  }
  return null;
}

export async function getReferralOverview(
  db: DatabaseAdapter,
  userId: string,
): Promise<ReferralOverview> {
  const [codeRow] = await db.query<{ code: string }>(
    'select code from public.referral_codes where user_id = $1 limit 1',
    [userId],
  );
  const friends = await db.query<{
    id: string;
    status: string;
    hold_until: string | Date | null;
    created_at: string | Date;
  }>(
    `select id, status, hold_until, created_at
       from public.referrals
      where referrer_id = $1 and status <> 'pending'
      order by created_at desc
      limit $2`,
    [userId, MAX_LISTED_FRIENDS],
  );
  const [counts] = await db.query<{ joined: string; subscribed: string; rewarded: string }>(
    `select count(*) filter (where status <> 'pending') as joined,
            count(*) filter (where status = any (array['converted', 'rewarded', 'capped'])) as subscribed,
            count(*) filter (where status = 'rewarded') as rewarded
       from public.referrals
      where referrer_id = $1`,
    [userId],
  );
  const [earned] = await db.query<{ credits: string | number }>(
    `select coalesce(sum(credits_granted), 0) as credits
       from public.bonus_credit_grants
      where user_id = $1 and source = 'referral_referrer' and revoked_at is null`,
    [userId],
  );
  const balances = await getPrepaidCreditBalances(db, userId);

  return {
    code: codeRow?.code ?? null,
    link: codeRow ? referralLink(codeRow.code) : null,
    program: REFERRAL_PROGRAM,
    stats: {
      joined: toCount(counts?.joined),
      subscribed: toCount(counts?.subscribed),
      rewarded: toCount(counts?.rewarded),
      creditsEarned: toCount(earned?.credits),
    },
    bonus: {
      availableCredits: balances.bonusCredits,
      nextExpiry: balances.nextBonusExpiry,
    },
    friends: friends
      .filter((row): row is typeof row & { status: ReferralStatus } => isReferralStatus(row.status))
      .map((row) => ({
        id: row.id,
        status: row.status,
        joinedAt: toIso(row.created_at) ?? new Date(0).toISOString(),
        rewardAt: row.status === 'converted' ? toIso(row.hold_until) : null,
      })),
  };
}

export async function recordReferrerNetwork(
  db: DatabaseAdapter,
  userId: string,
  networkHash: string | null,
): Promise<void> {
  if (!networkHash) return;
  await db.execute(
    `update public.referral_codes
        set network_hash = $2, network_seen_at = now()
      where user_id = $1
        and (network_hash is distinct from $2
             or network_seen_at < now() - $3::interval)`,
    [userId, networkHash, NETWORK_REFRESH_INTERVAL],
  );
}

export async function ensureReferralCode(
  db: DatabaseAdapter,
  userId: string,
  networkHash: string | null,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const [existing] = await db.query<{ code: string }>(
      'select code from public.referral_codes where user_id = $1 limit 1',
      [userId],
    );
    if (existing) {
      await recordReferrerNetwork(db, userId, networkHash);
      return existing.code;
    }
    const [created] = await db.query<{ code: string }>(
      `insert into public.referral_codes (user_id, code, network_hash, network_seen_at, created_by)
       values ($1, $2, $3::text, case when $3::text is null then null else now() end, $1)
       on conflict do nothing
       returning code`,
      [userId, generateReferralCode(), networkHash],
    );
    if (created) return created.code;
  }
  throw new Error('No unique referral code could be allocated');
}

export async function referralTrialDays(
  db: DatabaseAdapter,
  userId: string,
  plan: string,
): Promise<number | null> {
  if (!isProPlanTier(plan)) return null;
  const [row] = await db.query<{ id: string }>(
    `select id from public.referrals
      where referred_user_id = $1 and status = 'signed_up'
      limit 1`,
    [userId],
  );
  return row ? REFERRAL_PROGRAM.friendTrialDays : null;
}

export async function attributeReferralSignup(
  db: DatabaseAdapter,
  input: { userId: string; code: string; networkHash: string | null },
): Promise<ReferralAttributionOutcome> {
  const [owner] = await db.query<{
    user_id: string;
    network_hash: string | null;
    network_seen_at: string | Date | null;
    email: string | null;
  }>(
    `select codes.user_id, codes.network_hash, codes.network_seen_at, profiles.email
       from public.referral_codes codes
       left join public.profiles profiles on profiles.id = codes.user_id
      where codes.code = $1
      limit 1`,
    [input.code],
  );
  if (!owner || owner.user_id === input.userId) return 'skipped';

  const friend = await getIdentityUser(input.userId);
  const createdAt = friend?.createdAt ?? null;
  if (
    createdAt === null ||
    Date.now() - createdAt > REFERRAL_PROGRAM.newAccountWindowHours * HOUR_MS
  ) {
    return 'skipped';
  }

  const referrerEmail = owner.email ?? (await getIdentityUser(owner.user_id))?.primaryEmail ?? null;
  const blockedReason = referralSignupBlockReason({
    friendEmail: friend?.primaryEmail ?? null,
    referrerEmail,
    friendNetworkHash: input.networkHash,
    referrerNetworkHash: owner.network_hash,
    referrerNetworkSeenAt: owner.network_seen_at,
    signedUpAt: Date.now(),
  });

  const inserted = await db.query<{ id: string }>(
    `insert into public.referrals
       (referrer_id, referral_code, referred_user_id, status, blocked_reason, signup_network_hash)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (referred_user_id) do nothing
     returning id`,
    [
      owner.user_id,
      input.code,
      input.userId,
      blockedReason ? 'blocked' : 'signed_up',
      blockedReason,
      input.networkHash,
    ],
  );
  if (inserted.length === 0) return 'skipped';
  return blockedReason ? 'blocked' : 'attributed';
}

export async function referralDeviceOrNetworkBlock(
  db: DatabaseAdapter,
  referral: Pick<
    ReferralRow,
    'referrer_id' | 'referred_user_id' | 'created_at' | 'signup_network_hash'
  >,
): Promise<ReferralBlockReason | null> {
  const [shared] = await db.query<{ shared: boolean }>(
    `select exists (
              select 1
                from public.device_registrations friend_device
                join public.device_registrations referrer_device
                  on referrer_device.install_id = friend_device.install_id
               where friend_device.user_id = $1 and referrer_device.user_id = $2
            )
         or exists (
              select 1
                from public.device_installations friend_install
                join public.device_installations referrer_install
                  on referrer_install.device_id = friend_install.device_id
               where friend_install.account_id = $1 and referrer_install.account_id = $2
            ) as shared`,
    [referral.referred_user_id, referral.referrer_id],
  );
  if (shared?.shared) return 'same_device';

  const [network] = await db.query<{
    network_hash: string | null;
    network_seen_at: string | Date | null;
  }>('select network_hash, network_seen_at from public.referral_codes where user_id = $1', [
    referral.referrer_id,
  ]);
  const signedUpAt = toTime(referral.created_at);
  const seenAt = toTime(network?.network_seen_at);
  if (
    referral.signup_network_hash !== null &&
    referral.signup_network_hash === network?.network_hash &&
    signedUpAt !== null &&
    seenAt !== null &&
    Math.abs(signedUpAt - seenAt) <= REFERRAL_PROGRAM.networkMatchDays * DAY_MS
  ) {
    return 'same_network';
  }
  return null;
}

async function referrerRewardCounts(
  db: DatabaseAdapter,
  referrerId: string,
): Promise<{ month: number; year: number }> {
  const [row] = await db.query<{ month: string; year: string }>(
    `select count(*) filter (
              where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
            ) as month,
            count(*) filter (
              where created_at >= date_trunc('year', now() at time zone 'utc') at time zone 'utc'
            ) as year
       from public.bonus_credit_grants
      where user_id = $1 and source = 'referral_referrer' and revoked_at is null`,
    [referrerId],
  );
  return { month: toCount(row?.month), year: toCount(row?.year) };
}

async function settleDueReferral(
  db: DatabaseAdapter,
  referralId: string,
): Promise<'rewarded' | 'capped' | 'blocked' | 'skipped'> {
  return db.transaction(async (tx) => {
    const [referral] = await tx.query<ReferralRow>(
      `select id, referrer_id, referred_user_id, created_at, signup_network_hash,
              friend_bonus_grant_id
         from public.referrals
        where id = $1
          and status = 'converted'
          and hold_until <= now()
          and clawed_back_at is null
        for update`,
      [referralId],
    );
    if (!referral) return 'skipped';

    await tx.execute('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `referral-reward:${referral.referrer_id}`,
    ]);

    const blockedReason = await referralDeviceOrNetworkBlock(tx, referral);
    if (blockedReason) {
      if (referral.friend_bonus_grant_id) {
        await revokeBonusCreditGrant(
          tx,
          referral.friend_bonus_grant_id,
          'Referral bonus revoked: the referral did not qualify',
        );
      }
      await tx.execute(
        `update public.referrals
            set status = 'blocked', blocked_reason = $2
          where id = $1`,
        [referral.id, blockedReason],
      );
      return 'blocked';
    }

    const counts = await referrerRewardCounts(tx, referral.referrer_id);
    if (
      counts.month >= REFERRAL_PROGRAM.monthlyRewardCap ||
      counts.year >= REFERRAL_PROGRAM.yearlyRewardCap
    ) {
      await tx.execute(`update public.referrals set status = 'capped' where id = $1`, [
        referral.id,
      ]);
      return 'capped';
    }

    const grantedAt = new Date();
    const grantId = await grantBonusCredits(tx, {
      userId: referral.referrer_id,
      source: 'referral_referrer',
      credits: REFERRAL_PROGRAM.rewardCredits,
      referenceId: referral.id,
      grantedAt,
    });
    await tx.execute(
      `update public.referrals
          set status = 'rewarded',
              referrer_reward_grant_id = $2,
              reward_type = 'bonus_credits',
              reward_amount = $3,
              reward_issued_at = now()
        where id = $1`,
      [referral.id, grantId, REFERRAL_PROGRAM.rewardCredits],
    );
    const credits = formatCredits(REFERRAL_PROGRAM.rewardCredits, { maximumFractionDigits: 0 });
    const expiresOn = bonusCreditExpiry(grantedAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    await recordNotification(tx, {
      userId: referral.referrer_id,
      category: 'billing',
      severity: 'success',
      title: `You earned ${credits}`,
      message: `A friend you invited subscribed, so you earned ${credits}. They expire on ${expiresOn}.`,
      target: { kind: 'settings', id: 'referrals' },
      dedupeKey: `referral-reward:${referral.id}`,
    });
    return 'rewarded';
  });
}

export async function grantDueReferralRewards(
  db: DatabaseAdapter,
  maxReferrals: number,
): Promise<ReferralRewardSweepSummary> {
  const due = await db.query<{ id: string }>(
    `select id
       from public.referrals
      where status = 'converted'
        and hold_until <= now()
        and clawed_back_at is null
      order by hold_until
      limit $1`,
    [maxReferrals + 1],
  );
  const summary: ReferralRewardSweepSummary = {
    processed: 0,
    rewarded: 0,
    capped: 0,
    blocked: 0,
    failed: 0,
    remaining: due.length > maxReferrals,
  };
  for (const { id } of due.slice(0, maxReferrals)) {
    try {
      const outcome = await settleDueReferral(db, id);
      if (outcome === 'skipped') continue;
      summary.processed += 1;
      summary[outcome] += 1;
    } catch (error) {
      summary.failed += 1;
      logger.error({ error, referralId: id }, 'Referral reward could not be settled');
    }
  }
  return summary;
}
