import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import {
  ROLLING_SESSION_WINDOW_HOURS,
  ROLLING_WEEKLY_WINDOW_HOURS,
  rollingResetAt,
  toIsoTimestamp,
} from '@/lib/server/capability-limit-resets';
import {
  getPlanSessionUsageCapMicrousd,
  getPlanUsageBudgetMicrousd,
  getPlanWeeklyUsageCapMicrousd,
} from '@/lib/server/managed-usage-policy';
import { getRollingUsage } from '@/lib/server/rolling-usage';
import { getSpendableCredits } from '@/lib/server/spendable-credits';
import { CreditService } from '@/lib/services/credit-service';
import {
  createManagedUsageErrorBody,
  fingerprintManagedUsageRequest,
  type ManagedUsageRequestError,
} from '@/lib/services/managed-usage-request-service';

export type VoiceLimitResets = Readonly<Record<string, string | null>>;

export interface VoiceBudget {
  /**
   * False when the plan's own allowances, before any usage, cannot pay for a
   * single block and no overage covers it. Waiting for a window to reset would
   * never help, so the refusal must not say a limit was reached.
   */
  planFundsBlock: boolean;
  /** When each window that could refuse the next block resets. */
  resetsAt: VoiceLimitResets;
}

export const VOICE_USAGE_NOT_IN_PLAN = {
  code: 'voice_usage_not_in_plan',
  message:
    "Voice needs usage your plan doesn't include. Upgrade to talk with voice, or continue in text.",
} as const;

export interface VoiceReservationState {
  reservedMicrousd: number;
  extensionStatus: string | null;
  extensionMicrousd: number | null;
}

export const VOICE_BLOCK_OPERATION_PREFIX = 'provider:';
const VOICE_RESERVATION_KEY_PREFIX = 'agi.voice.live.';
const VOICE_RESERVATION_OPERATION = 'voice_live_session';

export function voiceBlockOperationKey(block: number): string {
  return `${VOICE_BLOCK_OPERATION_PREFIX}${block}`;
}

export interface VoiceReservationIdentity {
  idempotencyKey: string;
  requestHash: string;
  leaseToken: string;
}

/**
 * A session's reservation is named by its voice session record, so whatever
 * holds the record, the route that closes it or the sweep that settles an
 * abandoned one, can settle the reservation without the tab that opened it.
 */
export function voiceReservationIdentity(voiceSessionId: string): VoiceReservationIdentity {
  return {
    idempotencyKey: `${VOICE_RESERVATION_KEY_PREFIX}${voiceSessionId}`,
    requestHash: fingerprintManagedUsageRequest({
      operation: VOICE_RESERVATION_OPERATION,
      voiceSessionId,
    }),
    leaseToken: voiceSessionId,
  };
}

function amount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

export async function assessVoiceBudget(input: {
  db: DatabaseAdapter;
  userId: string;
  planTier: string;
  catalogVersion: number | null;
  blockMicrousd: number;
}): Promise<VoiceBudget> {
  const allowance = { tier: input.planTier, catalogVersion: input.catalogVersion };
  const sessionCap = getPlanSessionUsageCapMicrousd(allowance);
  const weeklyCap = getPlanWeeklyUsageCapMicrousd(allowance);
  const [session, weekly, balance, spendable] = await Promise.all([
    getRollingUsage(input.db, input.userId, ROLLING_SESSION_WINDOW_HOURS, false),
    getRollingUsage(input.db, input.userId, ROLLING_WEEKLY_WINDOW_HOURS, false),
    CreditService.getBalance(input.db, input.userId),
    getSpendableCredits(input.db, input.userId),
  ]);
  const overage = spendable.overageEnabled ? (spendable.availableMicrousd ?? 0) : 0;
  const planAllowance = Math.min(
    sessionCap ?? Number.POSITIVE_INFINITY,
    weeklyCap ?? Number.POSITIVE_INFINITY,
    getPlanUsageBudgetMicrousd(allowance),
  );
  return {
    planFundsBlock: planAllowance >= input.blockMicrousd || overage >= input.blockMicrousd,
    resetsAt: {
      rolling_five_hour_limit_reached: rollingResetAt(
        session.oldestAt,
        ROLLING_SESSION_WINDOW_HOURS,
      ),
      rolling_weekly_limit_reached: rollingResetAt(weekly.oldestAt, ROLLING_WEEKLY_WINDOW_HOURS),
      insufficient_credits: toIsoTimestamp(balance?.period_end),
    },
  };
}

export async function readVoiceReservation(input: {
  db: DatabaseAdapter;
  userId: string;
  idempotencyKey: string;
  requestHash: string;
  operationKey?: string;
}): Promise<VoiceReservationState | null> {
  const [row] = await input.db.query<{
    reserved_microusd: number | string | null;
    extension_status: string | null;
    extension_microusd: number | string | null;
  }>(
    `select request.estimated_cost_microusd as reserved_microusd,
            extension.status as extension_status,
            extension.estimated_cost_microusd as extension_microusd
       from public.managed_usage_requests request
       left join public.managed_usage_request_extensions extension
         on extension.request_id = request.id
        and extension.user_id = request.user_id
        and extension.operation_key = $4
      where request.user_id = $1
        and request.idempotency_key = $2
        and request.request_hash = $3
      limit 1`,
    [input.userId, input.idempotencyKey, input.requestHash, input.operationKey ?? ''],
  );
  const reservedMicrousd = amount(row?.reserved_microusd);
  if (!row || reservedMicrousd === null) return null;
  return {
    reservedMicrousd,
    extensionStatus: row.extension_status,
    extensionMicrousd: amount(row.extension_microusd),
  };
}

export function voiceJsonError(
  request: NextRequest,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json(
    {
      error: {
        message,
        code,
        type: status >= 500 ? 'api_error' : 'invalid_request_error',
        ...extra,
      },
    },
    { status, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
  );
}

export function voiceUsageErrorResponse(
  request: NextRequest,
  error: ManagedUsageRequestError,
  resets?: VoiceLimitResets,
): NextResponse {
  const body = createManagedUsageErrorBody(
    error,
    error.status === 402 || error.status === 429 ? 'insufficient_quota' : 'invalid_request_error',
  );
  const resetsAt = resets?.[error.code] ?? null;
  return NextResponse.json(resetsAt ? { error: { ...body.error, resets_at: resetsAt } } : body, {
    status: error.status,
    headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
  });
}
