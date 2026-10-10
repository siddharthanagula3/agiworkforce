import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getTierPolicy } from '@agiworkforce/types';
import { getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import {
  createManagedUsageErrorBody,
  ManagedUsageRequestError,
} from '@/lib/services/managed-usage-request-service';
import { assertTierUnitAllowance } from '@/lib/services/tier-unit-quota-service';
import { LIVE_SESSION_CEILING_SECONDS } from '@/lib/voice/live-voice-billing';

const SECONDS_PER_MINUTE = 60;
const MINIMUM_REMAINING_MINUTES = 1;

export const VOICE_MINUTES_EXHAUSTED_CODE = 'voice_minutes_monthly_limit_reached';

export const VOICE_USAGE_NOT_IN_PLAN = {
  code: 'voice_usage_not_in_plan',
  message: "Voice isn't included in your plan. Upgrade to talk with voice, or continue in text.",
} as const;

/** A plan whose policy turns voice off, or grants it no minutes, has no voice to wait for. */
export function planIncludesVoice(planTier: string | null | undefined): boolean {
  const policy = getTierPolicy(planTier);
  return policy.allowVoice === true && policy.voiceMinutesPerMonth !== 0;
}

/**
 * How many more seconds of conversation the plan's monthly voice minutes
 * cover, up to one block. Voice is metered in its own minutes, so nothing here
 * reads or reserves the managed-usage spend windows chat draws on. Refuses with
 * the reset instant once less than a minute is left.
 */
export async function planVoiceMinutesBlock(input: {
  db: DatabaseAdapter;
  userId: string;
  planTier: string | null | undefined;
}): Promise<number> {
  const decision = await assertTierUnitAllowance({
    db: input.db,
    userId: input.userId,
    planTier: input.planTier,
    unit: 'voice_minutes',
    requestedUnits: MINIMUM_REMAINING_MINUTES,
  });
  if (decision.hardLimit === null) return LIVE_SESSION_CEILING_SECONDS;
  const remainingSeconds = Math.max(0, decision.hardLimit - decision.consumed) * SECONDS_PER_MINUTE;
  return Math.min(LIVE_SESSION_CEILING_SECONDS, remainingSeconds);
}

const RESET_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

export function voiceMinutesExhaustedMessage(resetsAt: string | null | undefined): string {
  const reset = resetsAt ? new Date(resetsAt) : null;
  const when =
    reset && Number.isFinite(reset.getTime())
      ? `They reset on ${RESET_DATE_FORMAT.format(reset)}.`
      : 'They reset at the start of next month.';
  return `You've used this month's voice minutes. ${when} Continue in text, or upgrade for more voice minutes.`;
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
): NextResponse {
  const resetsAt = error.limitContext?.resetsAt ?? null;
  if (error.code === VOICE_MINUTES_EXHAUSTED_CODE) {
    return voiceJsonError(request, 429, error.code, voiceMinutesExhaustedMessage(resetsAt), {
      ...(resetsAt ? { resets_at: resetsAt } : {}),
    });
  }
  const body = createManagedUsageErrorBody(
    error,
    error.status === 402 || error.status === 429 ? 'insufficient_quota' : 'invalid_request_error',
  );
  return NextResponse.json(body, {
    status: error.status,
    headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
  });
}

export function voiceBillingUnavailable(request: NextRequest): NextResponse {
  return voiceUsageErrorResponse(
    request,
    new ManagedUsageRequestError(
      'Managed usage billing is temporarily unavailable.',
      503,
      'billing_unavailable',
    ),
  );
}
