import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  FREE_DAILY_CAPS,
  getFreeDailyCap,
  getTierPolicy,
  type FreeDailyCap,
  type RateCardFeature,
} from '@agiworkforce/types';
import { AppError, ErrorCode } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { countUserFeatureUnitsSince } from './cogs-ledger-service';
import { resolveEntitledPlanTier } from './entitlement-resolution';
import { ManagedUsageRequestError, UPGRADE_HREF } from './managed-usage-request-service';

export const TIER_METERED_UNITS = [
  'voice_minutes',
  'video_seconds',
  'computer_use_requests',
] as const;

export type FreeDailyUnit =
  'message_writes' | 'conversation_creates' | 'egress_bytes' | 'email_sends' | 'vector_queries';

export type MonthlyMeteredUnit = (typeof TIER_METERED_UNITS)[number];

export type TierMeteredUnit = MonthlyMeteredUnit | FreeDailyUnit;

const FREE_DAILY_CAP_BY_UNIT: Readonly<Record<FreeDailyUnit, FreeDailyCap>> = Object.freeze({
  message_writes: 'messageWrites',
  conversation_creates: 'conversationCreates',
  egress_bytes: 'egressBytes',
  email_sends: 'emailSends',
  vector_queries: 'vectorQueries',
});

export interface TierUnitAllowance {
  hardLimit: number | null;
  softLimit: number | null;
}

export interface TierUnitQuotaDecision {
  unit: TierMeteredUnit;
  hardLimit: number | null;
  softLimit: number | null;
  consumed: number;
  requested: number;
  softLimitReached: boolean;
}

export function getTierUnitAllowance(
  planTier: string | null | undefined,
  unit: TierMeteredUnit,
): TierUnitAllowance {
  const policy = getTierPolicy(planTier);
  switch (unit) {
    case 'video_seconds':
      return { hardLimit: policy.videoSecondsPerMonth ?? null, softLimit: null };
    case 'voice_minutes':
      return { hardLimit: policy.voiceMinutesPerMonth ?? null, softLimit: null };
    case 'computer_use_requests':
      return {
        hardLimit: policy.computerUseHardCap ?? null,
        softLimit: policy.computerUseSoftCap ?? null,
      };
    default:
      return {
        hardLimit: getFreeDailyCap(planTier, FREE_DAILY_CAP_BY_UNIT[unit]),
        softLimit: null,
      };
  }
}

const NUMERIC_JSON_TEXT = String.raw`^[0-9]+(\.[0-9]+)?$`;

const SECONDS_PER_MINUTE = 60;
const TRANSCRIPTION_OPERATION = 'transcription';
const LIVE_VOICE_SESSION_OPERATION = 'voice_live_session';

const BYTES_PER_GIBIBYTE = 1024 ** 3;
const UTC_DAY_START = `date_trunc('day', now() at time zone 'utc') at time zone 'utc'`;

type ConsumptionReader =
  | { sql: string; toUnits: (raw: number) => number }
  | { features: readonly RateCardFeature[]; toUnits: (raw: number) => number };

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const CONSUMPTION_QUERIES: Readonly<Record<TierMeteredUnit, ConsumptionReader>> = Object.freeze({
  video_seconds: {
    sql: `select coalesce(sum(duration_secs), 0)::double precision as consumed
            from public.video_generation_jobs
           where user_id = $1
             and status <> 'failed'
             and created_at >= date_trunc('month', now())`,
    toUnits: (raw: number) => Math.ceil(raw),
  },
  voice_minutes: {
    sql: `select coalesce(sum(
              case
                when usage->>'operation' = '${TRANSCRIPTION_OPERATION}'
                     and usage->>'estimatedAudioSeconds' ~ '${NUMERIC_JSON_TEXT}'
                then (usage->>'estimatedAudioSeconds')::double precision
                when usage->>'operation' = '${LIVE_VOICE_SESSION_OPERATION}'
                     and usage->>'billedSeconds' ~ '${NUMERIC_JSON_TEXT}'
                then (usage->>'billedSeconds')::double precision
                else 0 end
            ), 0) as consumed
            from public.managed_usage_requests
           where user_id = $1
             and status in ('reserved', 'provider_started', 'completed')
             and usage->>'operation' in ('${TRANSCRIPTION_OPERATION}', '${LIVE_VOICE_SESSION_OPERATION}')
             and created_at >= date_trunc('month', now())`,
    toUnits: (raw: number) => Math.ceil(raw / SECONDS_PER_MINUTE),
  },
  computer_use_requests: {
    sql: `select count(*)::double precision as consumed
            from public.managed_usage_requests
           where user_id = $1
             and status in ('reserved', 'provider_started', 'completed')
             and usage->>'quotaFeature' = 'computer_use'
             and created_at >= date_trunc('month', now())`,
    toUnits: (raw: number) => Math.ceil(raw),
  },
  message_writes: {
    sql: `select count(*)::double precision as consumed
            from public.web_messages message
            join public.web_conversations conversation
              on conversation.id = message.conversation_id
           where conversation.user_id = $1
             and conversation.updated_at >= ${UTC_DAY_START}
             and message.created_at >= ${UTC_DAY_START}`,
    toUnits: (raw: number) => Math.ceil(raw),
  },
  conversation_creates: {
    sql: `select count(*)::double precision as consumed
            from public.web_conversations conversation
           where conversation.user_id = $1
             and conversation.updated_at >= ${UTC_DAY_START}
             and conversation.created_at >= ${UTC_DAY_START}`,
    toUnits: (raw: number) => Math.ceil(raw),
  },
  egress_bytes: {
    features: ['network_egress_gib'],
    toUnits: (raw: number) => Math.ceil(raw * BYTES_PER_GIBIBYTE),
  },
  email_sends: {
    features: ['email_message_request'],
    toUnits: (raw: number) => Math.ceil(raw),
  },
  vector_queries: {
    features: ['vector_query_request'],
    toUnits: (raw: number) => Math.ceil(raw),
  },
});

const EXHAUSTED_UNIT_ERRORS: Readonly<Record<TierMeteredUnit, { code: string; message: string }>> =
  Object.freeze({
    video_seconds: {
      code: 'video_seconds_monthly_limit_reached',
      message:
        'Your plan’s monthly video generation allowance is used up. Wait for the next month or upgrade for more video seconds.',
    },
    voice_minutes: {
      code: 'voice_minutes_monthly_limit_reached',
      message:
        'Your plan’s monthly voice allowance is used up. Wait for the next month or upgrade for more voice minutes.',
    },
    computer_use_requests: {
      code: 'computer_use_monthly_limit_reached',
      message:
        'Your plan’s monthly computer use allowance is used up. Wait for the next month or upgrade for a higher limit.',
    },
    message_writes: {
      code: 'free_daily_message_limit_reached',
      message: `Free accounts can save ${FREE_DAILY_CAPS.messageWrites.toLocaleString('en-US')} messages a day, and today’s are used up. Save more after midnight UTC, or upgrade for a higher limit.`,
    },
    conversation_creates: {
      code: 'free_daily_conversation_limit_reached',
      message: `Free accounts can start ${FREE_DAILY_CAPS.conversationCreates.toLocaleString('en-US')} conversations a day, and today’s are used up. Start more after midnight UTC, or upgrade for a higher limit.`,
    },
    egress_bytes: {
      code: 'free_daily_download_limit_reached',
      message: `Free accounts can download ${Math.round(FREE_DAILY_CAPS.egressBytes / 1024 ** 2).toLocaleString('en-US')} MB of files a day, and today’s allowance is used up. Download more after midnight UTC, or upgrade for a higher limit.`,
    },
    email_sends: {
      code: 'free_daily_email_limit_reached',
      message: `Free accounts can send ${FREE_DAILY_CAPS.emailSends.toLocaleString('en-US')} emails a day, and today’s are used up. Send more after midnight UTC, or upgrade for a higher limit.`,
    },
    vector_queries: {
      code: 'free_daily_search_limit_reached',
      message: `Free accounts can run ${FREE_DAILY_CAPS.vectorQueries.toLocaleString('en-US')} semantic searches of their files and chats a day, and today’s are used up. Results use keyword matching until midnight UTC, or upgrade for a higher limit.`,
    },
  });

async function readConsumedTierUnits(
  db: DatabaseAdapter,
  userId: string,
  unit: TierMeteredUnit,
): Promise<number> {
  const reader = CONSUMPTION_QUERIES[unit];
  if ('features' in reader) {
    let units: number;
    try {
      units = await countUserFeatureUnitsSince(userId, reader.features, startOfUtcDay(new Date()));
    } catch {
      throw new ManagedUsageRequestError(
        'Managed usage billing is temporarily unavailable.',
        503,
        'billing_unavailable',
      );
    }
    return Number.isFinite(units) && units > 0 ? reader.toUnits(units) : 0;
  }
  const { sql, toUnits } = reader;
  let rows: Array<{ consumed: number | string | null }> | undefined;
  try {
    rows = await db.query<{ consumed: number | string | null }>(sql, [userId]);
  } catch {
    throw new ManagedUsageRequestError(
      'Managed usage billing is temporarily unavailable.',
      503,
      'billing_unavailable',
    );
  }
  const row = rows?.[0];
  if (!row) {
    throw new ManagedUsageRequestError(
      'Managed usage billing is temporarily unavailable.',
      503,
      'billing_unavailable',
    );
  }
  const raw = Number(row.consumed ?? 0);
  return Number.isFinite(raw) && raw > 0 ? toUnits(raw) : 0;
}

export interface TierUnitUsage extends TierUnitAllowance {
  unit: MonthlyMeteredUnit;
  consumed: number;
}

export interface TierUnitUsagePeriod {
  periodStart: string;
  resetAt: string;
  units: TierUnitUsage[];
}

async function readTierUnitPeriod(
  db: DatabaseAdapter,
): Promise<{ periodStart: string; resetAt: string }> {
  const [period] = await db.query<{ period_start: string | Date; reset_at: string | Date }>(
    `select date_trunc('month', now()) as period_start,
            date_trunc('month', now()) + interval '1 month' as reset_at`,
  );
  if (!period) {
    throw new ManagedUsageRequestError(
      'Managed usage billing is temporarily unavailable.',
      503,
      'billing_unavailable',
    );
  }
  return {
    periodStart: new Date(period.period_start).toISOString(),
    resetAt: new Date(period.reset_at).toISOString(),
  };
}

export async function readTierUnitUsage(
  db: DatabaseAdapter,
  userId: string,
  planTier: string | null | undefined,
): Promise<TierUnitUsagePeriod> {
  const [period, consumed] = await Promise.all([
    readTierUnitPeriod(db),
    Promise.all(TIER_METERED_UNITS.map((unit) => readConsumedTierUnits(db, userId, unit))),
  ]);
  return {
    ...period,
    units: TIER_METERED_UNITS.map((unit, index) => ({
      unit,
      consumed: consumed[index] ?? 0,
      ...getTierUnitAllowance(planTier, unit),
    })),
  };
}

export async function assertTierUnitAllowance(input: {
  db: DatabaseAdapter;
  userId: string;
  planTier: string | null | undefined;
  unit: TierMeteredUnit;
  requestedUnits: number;
}): Promise<TierUnitQuotaDecision> {
  const { hardLimit, softLimit } = getTierUnitAllowance(input.planTier, input.unit);
  const requested = Math.max(0, Math.ceil(input.requestedUnits));
  if (hardLimit === null && softLimit === null) {
    return {
      unit: input.unit,
      hardLimit: null,
      softLimit: null,
      consumed: 0,
      requested,
      softLimitReached: false,
    };
  }

  const consumed = await readConsumedTierUnits(input.db, input.userId, input.unit);
  if (hardLimit === null) {
    return {
      unit: input.unit,
      hardLimit: null,
      softLimit,
      consumed,
      requested,
      softLimitReached: softLimit !== null && consumed + requested > softLimit,
    };
  }
  if (consumed + requested > hardLimit) {
    const { code, message } = EXHAUSTED_UNIT_ERRORS[input.unit];
    const refusal = new ManagedUsageRequestError(message, 429, code);
    try {
      refusal.limitContext = {
        resetsAt: (await readTierUnitPeriod(input.db)).resetAt,
        alternativeModel: null,
      };
    } catch (error) {
      logger.warn(
        { error, userId: input.userId, unit: input.unit },
        'Monthly allowance reset could not be read; the refusal is sent without it',
      );
    }
    throw refusal;
  }

  return {
    unit: input.unit,
    hardLimit,
    softLimit,
    consumed,
    requested,
    softLimitReached: softLimit !== null && consumed + requested > softLimit,
  };
}

export class FreeDailyLimitError extends AppError {
  constructor(
    readonly unit: FreeDailyUnit,
    readonly limitCode: string,
    message: string,
    readonly resetsAt: string,
  ) {
    super(ErrorCode.RATE_LIMIT_EXCEEDED, message, 429, {
      code: limitCode,
      resetsAt,
      recovery: { action: 'upgrade', href: UPGRADE_HREF },
    });
    this.name = 'FreeDailyLimitError';
    Object.setPrototypeOf(this, FreeDailyLimitError.prototype);
    this.asUserSafe();
  }
}

export function freeDailyLimitError(unit: FreeDailyUnit): FreeDailyLimitError {
  const { code, message } = EXHAUSTED_UNIT_ERRORS[unit];
  const today = startOfUtcDay(new Date());
  const resetsAt = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1),
  );
  return new FreeDailyLimitError(unit, code, message, resetsAt.toISOString());
}

export async function hasDailyAllowance(input: {
  db: DatabaseAdapter;
  userId: string;
  planTier: string | null | undefined;
  unit: FreeDailyUnit;
  requestedUnits: number;
}): Promise<boolean> {
  const { hardLimit } = getTierUnitAllowance(input.planTier, input.unit);
  if (hardLimit === null) return true;
  let consumed: number;
  try {
    consumed = await readConsumedTierUnits(input.db, input.userId, input.unit);
  } catch (error) {
    logger.error(
      {
        event: 'free_daily_cap_unreadable',
        unit: input.unit,
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      },
      'A Free daily cap could not read its count; the request is allowed',
    );
    return true;
  }
  return consumed + Math.max(0, Math.ceil(input.requestedUnits)) <= hardLimit;
}

export async function assertFreeDailyAllowance(input: {
  db: DatabaseAdapter;
  userId: string;
  requested: Partial<Record<FreeDailyUnit, number>>;
}): Promise<void> {
  const units = (Object.keys(input.requested) as FreeDailyUnit[]).filter(
    (unit) => (input.requested[unit] ?? 0) > 0,
  );
  if (units.length === 0) return;
  const planTier = await resolveEntitledPlanTier(input.db, input.userId);
  for (const unit of units) {
    const allowed = await hasDailyAllowance({
      db: input.db,
      userId: input.userId,
      planTier,
      unit,
      requestedUnits: input.requested[unit] ?? 0,
    });
    if (!allowed) throw freeDailyLimitError(unit);
  }
}
