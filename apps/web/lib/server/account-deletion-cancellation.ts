import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { recordAuditEvent } from '@/lib/security-audit';
import { pseudonymizeIdentifier } from '@/lib/server/pseudonymize';
import { CONTACT_EMAIL } from '@/lib/legal-constants';
import { z } from 'zod';
import { AccountDeletionScheduleCancellationRequestSchema } from '@agiworkforce/cloud-contracts';
import {
  restorePlanRenewalAfterDeletionUndo,
  type AccountDeletionPlanRenewal,
} from '@/lib/server/account-deletion-plan-renewal';

type CancellationMode =
  | { kind: 'legacy' }
  | {
      kind: 'required-pair';
      requestSchema: typeof AccountDeletionScheduleCancellationRequestSchema;
    };

const LockedRowsSchema = z.array(z.object({ id: z.string() })).max(1);
const ScheduleStateSchema = z
  .array(
    z.object({
      has_schedule: z.boolean(),
      pair_matches: z.boolean(),
      eligible: z.boolean(),
      scheduled_for: z.string().nullable(),
    }),
  )
  .length(1);

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'",
  'X-Content-Type-Options': 'nosniff',
};

function cancellationMessage(planRenewal: AccountDeletionPlanRenewal | null): string {
  switch (planRenewal) {
    case 'restored':
      return 'Account deletion cancelled. Your plan renews again.';
    case 'not_restored':
      return "Account deletion cancelled. If deleting turned off your plan's renewal, turn it back on in Settings > Billing.";
    case null:
      return 'Account deletion cancelled.';
  }
}

export async function handleAccountDeletionCancellation(
  request: NextRequest,
  mode: CancellationMode,
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'account-deletion-cancel');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  let userId: string;
  let db: DatabaseAdapter;
  try {
    ({ db, userId } = await getUserScopedDb(request, { resolveOrganization: false }));
  } catch (authError) {
    if (isAuthGateRefusal(authError)) {
      return unauthorizedResponseFor(authError);
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: SECURITY_HEADERS });
  }

  let expectedSchedule: { scheduledFor: string; requestedAt: string | null } | undefined;
  if (mode.kind === 'required-pair') {
    const parsed = mode.requestSchema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'A valid expected deletion schedule is required.' },
        { status: 400, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
      );
    }
    expectedSchedule = parsed.data.expectedSchedule;
  }

  const subjectRef = pseudonymizeIdentifier(userId, 'delete-account-subject', 16);

  try {
    const outcome = await db.transaction(async (tx) => {
      const locked = LockedRowsSchema.parse(
        await tx.query('select id from profiles where id = $1 for update', [userId]),
      );
      if (locked.length === 0) return 'none';
      if (locked[0]?.id !== userId) throw new Error('Unexpected locked profile');
      const params = expectedSchedule
        ? [userId, expectedSchedule.scheduledFor, expectedSchedule.requestedAt]
        : [userId];
      const pairPredicate = expectedSchedule
        ? 'deletion_scheduled_for = $2::timestamptz and deletion_requested_at is not distinct from $3::timestamptz'
        : 'true';
      const readState = async () => {
        const rows = ScheduleStateSchema.parse(
          await tx.query(
            `select deletion_scheduled_for is not null as has_schedule,
                  coalesce((${pairPredicate}), false) as pair_matches,
                  coalesce(deletion_scheduled_for > clock_timestamp(), false) as eligible,
                  case when deletion_scheduled_for is null then null
                       when deletion_scheduled_for >= '0001-01-01T00:00:00Z'::timestamptz
                        and deletion_scheduled_for < '10000-01-01T00:00:00Z'::timestamptz
                       then to_char(deletion_scheduled_for at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                       else 'unsupported' end as scheduled_for
             from profiles where id = $1`,
            params,
          ),
        );
        return rows[0]!;
      };
      const state = await readState();
      if (!state.has_schedule) return 'none';
      if (!state.pair_matches) return 'changed';
      const cancelled = LockedRowsSchema.parse(
        await tx.query(
          `update profiles
            set deletion_requested_at = null, deletion_scheduled_for = null
          where id = $1
            and (${pairPredicate})
            and deletion_scheduled_for > clock_timestamp()
          returning id`,
          params,
        ),
      );
      if (cancelled.length === 1) {
        if (cancelled[0]?.id !== userId) throw new Error('Unexpected cancelled profile');
        return { cancelledSchedule: state.scheduled_for };
      }
      const current = await readState();
      if (!current.has_schedule) return 'none';
      if (!current.pair_matches) return 'changed';
      if (!current.eligible) return 'expired';
      throw new Error('Cancellation result could not be verified');
    });

    if (typeof outcome === 'object') {
      logger.info({ userId }, 'Account deletion cancelled inside the grace window');

      await recordAuditEvent({
        userId: null,
        eventType: 'account_deletion_cancelled',
        severity: 'info',
        request,
        detail: { resourceType: 'account', subjectRef, status: 'cancelled' },
      });

      const planRenewal = outcome.cancelledSchedule
        ? await restorePlanRenewalAfterDeletionUndo(db, userId, outcome.cancelledSchedule)
        : null;
      return NextResponse.json(
        {
          message: cancellationMessage(planRenewal),
          cancelled: true,
          ...(planRenewal ? { planRenewal } : {}),
        },
        { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
      );
    }

    if (outcome === 'none') {
      return NextResponse.json(
        { message: 'No account deletion is pending.', cancelled: false },
        { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
      );
    }

    if (outcome === 'changed') {
      return NextResponse.json(
        {
          error: 'The deletion schedule changed. Refresh before deciding whether to cancel.',
          cancelled: false,
          reason: 'schedule_changed',
        },
        { status: 409, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
      );
    }

    logger.warn({ userId }, 'Account deletion cancellation refused: grace window has closed');
    return NextResponse.json(
      {
        error: `The cancellation window has closed. This does not confirm that erasure is complete. Contact ${CONTACT_EMAIL} if you believe this is wrong.`,
        cancelled: false,
        reason: 'grace_window_expired',
      },
      { status: 409, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
    );
  } catch (err) {
    logger.error({ userId, err }, 'Unexpected error while cancelling account deletion');
    return NextResponse.json(
      { error: `An unexpected error occurred. Please contact ${CONTACT_EMAIL}.` },
      { status: 500, headers: SECURITY_HEADERS },
    );
  }
}

export function accountDeletionCancellationOptions(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
