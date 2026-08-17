import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getTierPolicy } from '@agiworkforce/types';
import { ManagedUsageRequestError } from './managed-usage-request-service';

export type TierMeteredUnit = 'video_seconds' | 'voice_minutes' | 'computer_use_requests';

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
  }
}

const NUMERIC_JSON_TEXT = String.raw`^[0-9]+(\.[0-9]+)?$`;

const CONSUMPTION_QUERIES: Readonly<
  Record<TierMeteredUnit, { sql: string; toUnits: (raw: number) => number }>
> = Object.freeze({
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
              case when usage->>'estimatedAudioSeconds' ~ '${NUMERIC_JSON_TEXT}'
                   then (usage->>'estimatedAudioSeconds')::double precision
                   else 0 end
            ), 0) as consumed
            from public.managed_usage_requests
           where user_id = $1
             and status = 'completed'
             and usage->>'operation' = 'transcription'
             and created_at >= date_trunc('month', now())`,
    toUnits: (raw: number) => Math.ceil(raw / 60),
  },
  computer_use_requests: {
    sql: `select count(*)::double precision as consumed
            from public.managed_usage_requests
           where user_id = $1
             and status = 'completed'
             and usage->>'quotaFeature' = 'computer_use'
             and created_at >= date_trunc('month', now())`,
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
  });

async function readConsumedTierUnits(
  db: DatabaseAdapter,
  userId: string,
  unit: TierMeteredUnit,
): Promise<number> {
  const { sql, toUnits } = CONSUMPTION_QUERIES[unit];
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
    throw new ManagedUsageRequestError(message, 429, code);
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
