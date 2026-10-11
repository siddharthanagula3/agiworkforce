import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  getTierPolicy,
  isFreeBillingPlanTier,
  normalizeBillingPlanTier,
} from '@agiworkforce/types';
import { exhaustedTierUnitRefusal } from '@/lib/services/tier-unit-quota-service';
import type { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';
import { LIVE_VOICE_BLOCK_SECONDS, LIVE_VOICE_LEASE_SECONDS } from './live-voice-billing';

const SECONDS_PER_MINUTE = 60;
const GRANT_EVENT = 'free_voice_seconds_granted';
const SETTLED_EVENT = 'free_voice_seconds_settled';
const USER_LOCK_PREFIX = 'free-voice:';

/**
 * How long a grant nobody settled still counts against the month. A running
 * call renews its grant every block and a call whose tab went away is settled
 * by the voice session sweep within the session lease, so a grant older than
 * both belongs to an attempt that died before it could settle and used nothing.
 */
const UNSETTLED_GRANT_SECONDS = LIVE_VOICE_LEASE_SECONDS + LIVE_VOICE_BLOCK_SECONDS;

export type FreeVoiceUse = 'live' | 'dictation';

export interface FreeVoiceSessionState {
  grantedSeconds: number;
  /** Null while the session is still running. */
  settledSeconds: number | null;
}

export type FreeVoiceGrant =
  | {
      granted: true;
      grantedSeconds: number;
      /** False when this stretch had already been given to the session. */
      fresh: boolean;
    }
  | { granted: false; reason: 'allowance_used' | 'session_settled'; resetsAt: string };

/**
 * The seconds of voice a plan with no paid usage ledger is given each calendar
 * month, or null for a plan whose voice is paid from its usage budget instead.
 */
export function freeVoiceAllowanceSeconds(planTier: string | null | undefined): number | null {
  if (!isFreeBillingPlanTier(planTier)) return null;
  const minutes = getTierPolicy(planTier).voiceMinutesPerMonth ?? 0;
  return Math.max(0, Math.trunc(minutes)) * SECONDS_PER_MINUTE;
}

/**
 * What a session already running on the allowance is held to. Its owner's plan
 * can change mid-call, and the session keeps the funding it was admitted on.
 */
export const FREE_VOICE_SESSION_ALLOWANCE_SECONDS =
  freeVoiceAllowanceSeconds(normalizeBillingPlanTier(null)) ?? 0;

function periodOf(instant: Date): string {
  return `${instant.getUTCFullYear()}-${String(instant.getUTCMonth() + 1).padStart(2, '0')}`;
}

function periodStart(period: string): Date {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1));
}

function periodReset(period: string): string {
  const start = periodStart(period);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)).toISOString();
}

function wholeSeconds(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

async function lockUser(tx: DatabaseAdapter, userId: string): Promise<void> {
  await tx.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `${USER_LOCK_PREFIX}${userId}`,
  ]);
}

async function readSession(
  db: DatabaseAdapter,
  userId: string,
  sessionId: string,
): Promise<(FreeVoiceSessionState & { period: string | null }) | null> {
  const [row] = await db.query<{
    events: number | string;
    granted: number | string | null;
    settled: number | string | null;
    period: string | null;
  }>(
    `select count(*) as events,
            coalesce(sum(quantity) filter (where event_type = $3), 0) as granted,
            max(quantity) filter (where event_type = $4) as settled,
            min(metadata->>'period') as period
       from public.usage_events
      where user_id = $1
        and event_type in ($3, $4)
        and metadata->>'sessionId' = $2`,
    [userId, sessionId, GRANT_EVENT, SETTLED_EVENT],
  );
  if (!row || wholeSeconds(row.events) === 0) return null;
  return {
    grantedSeconds: wholeSeconds(row.granted),
    settledSeconds: row.settled === null ? null : wholeSeconds(row.settled),
    period: row.period,
  };
}

async function readConsumedSeconds(
  db: DatabaseAdapter,
  userId: string,
  period: string,
): Promise<number> {
  const [row] = await db.query<{ consumed: number | string | null }>(
    `select coalesce(sum(
              case
                when sessions.settled is not null then sessions.settled
                when sessions.last_granted_at >= now() - make_interval(secs => $6)
                  then sessions.granted
                else 0
              end
            ), 0) as consumed
       from (
         select metadata->>'sessionId' as session_id,
                coalesce(sum(quantity) filter (where event_type = $3), 0) as granted,
                max(quantity) filter (where event_type = $4) as settled,
                max(created_at) filter (where event_type = $3) as last_granted_at
           from public.usage_events
          where user_id = $1
            and event_type in ($3, $4)
            and metadata->>'period' = $2
            and created_at >= $5::timestamptz
          group by 1
       ) sessions`,
    [
      userId,
      period,
      GRANT_EVENT,
      SETTLED_EVENT,
      periodStart(period).toISOString(),
      UNSETTLED_GRANT_SECONDS,
    ],
  );
  return wholeSeconds(row?.consumed);
}

/** The seconds of this calendar month's allowance an account has used. */
export async function readFreeVoiceConsumedSeconds(
  db: DatabaseAdapter,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  return readConsumedSeconds(db, userId, periodOf(now));
}

export async function readFreeVoiceSession(
  db: DatabaseAdapter,
  userId: string,
  sessionId: string,
): Promise<FreeVoiceSessionState | null> {
  const state = await readSession(db, userId, sessionId);
  return state
    ? { grantedSeconds: state.grantedSeconds, settledSeconds: state.settledSeconds }
    : null;
}

/**
 * Gives a session its next stretch of the month's allowance, or refuses when
 * the month cannot hold it. A running session counts for everything it has
 * been granted, so two sessions cannot both be admitted on the same remainder.
 * Asking again for a stretch already given changes nothing.
 */
export async function grantFreeVoiceSeconds(input: {
  db: DatabaseAdapter;
  userId: string;
  sessionId: string;
  use: FreeVoiceUse;
  grantKey: string;
  seconds: number;
  limitSeconds: number;
  now?: Date;
}): Promise<FreeVoiceGrant> {
  const seconds = Math.max(1, Math.ceil(input.seconds));
  return input.db.transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const session = await readSession(tx, input.userId, input.sessionId);
    const period = session?.period ?? periodOf(input.now ?? new Date());
    if (session && session.settledSeconds !== null) {
      return { granted: false, reason: 'session_settled', resetsAt: periodReset(period) };
    }
    const [existing] = await tx.query<{ id: string }>(
      `select id
         from public.usage_events
        where user_id = $1
          and event_type = $3
          and metadata->>'sessionId' = $2
          and metadata->>'grantKey' = $4
        limit 1`,
      [input.userId, input.sessionId, GRANT_EVENT, input.grantKey],
    );
    if (existing) {
      return { granted: true, grantedSeconds: session?.grantedSeconds ?? seconds, fresh: false };
    }

    const consumed = await readConsumedSeconds(tx, input.userId, period);
    if (consumed + seconds > input.limitSeconds) {
      return { granted: false, reason: 'allowance_used', resetsAt: periodReset(period) };
    }
    await tx.execute(
      `insert into public.usage_events (user_id, event_type, quantity, metadata)
       values ($1, $2, $3, $4::jsonb)`,
      [
        input.userId,
        GRANT_EVENT,
        seconds,
        JSON.stringify({
          sessionId: input.sessionId,
          grantKey: input.grantKey,
          period,
          use: input.use,
        }),
      ],
    );
    return {
      granted: true,
      grantedSeconds: (session?.grantedSeconds ?? 0) + seconds,
      fresh: true,
    };
  });
}

/**
 * Ends a session at what it used, never more than it was granted, and returns
 * the rest of its grant to the month. Null when the session holds no grant, so
 * a caller can tell a session this allowance funded from one it did not.
 */
export async function settleFreeVoiceSeconds(input: {
  db: DatabaseAdapter;
  userId: string;
  sessionId: string;
  usedSeconds: number;
}): Promise<number | null> {
  return input.db.transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const session = await readSession(tx, input.userId, input.sessionId);
    if (!session) return null;
    if (session.settledSeconds !== null) return session.settledSeconds;
    const billedSeconds = Math.min(
      session.grantedSeconds,
      Math.max(0, Math.ceil(input.usedSeconds)),
    );
    await tx.execute(
      `insert into public.usage_events (user_id, event_type, quantity, metadata)
       values ($1, $2, $3, $4::jsonb)`,
      [
        input.userId,
        SETTLED_EVENT,
        billedSeconds,
        JSON.stringify({ sessionId: input.sessionId, period: session.period }),
      ],
    );
    return billedSeconds;
  });
}

export function freeVoiceAllowanceUsedError(resetsAt: string): ManagedUsageRequestError {
  const refusal = exhaustedTierUnitRefusal('voice_minutes');
  refusal.limitContext = { resetsAt, alternativeModel: null };
  return refusal;
}
