import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { TEAM_SEAT_TYPES, teamSeatPlanTier, type TeamSeatTypeChange } from '@agiworkforce/types';
import { IDEMPOTENCY_KEY_HEADER } from '@/lib/api-gateway-policy';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { invalidateActiveOrganizationCache } from '@/lib/server/request-context-cache';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { getStripeClient } from '@/lib/server/stripe-client';
import {
  SeatTypePaymentPendingError,
  SeatTypeWaitlistError,
  changeMemberSeatType,
  seatTypeWaitlistResponse,
  type SeatTypeChange,
} from '@/lib/services/team-seat-type-service';
import { requireTeamAdminAccess } from '../../team-admin-access';

const MEMBER_ID_RE = /^([0-9a-f-]{36}):(.+)$/;

const PatchSeatTypeSchema = z.object({ seatType: z.enum(TEAM_SEAT_TYPES) }).strict();

function parseMemberId(raw: string): { organizationId: string; userId: string } {
  const match = MEMBER_ID_RE.exec(raw);
  if (!match) {
    throw createError.validation('memberId must be in the format "<organizationId>:<userId>"');
  }
  return { organizationId: match[1]!, userId: match[2]! };
}

async function handleUpdateSeatType(
  request: NextRequest,
  context: { params: Promise<{ memberId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId: requesterId } = await getUserScopedDb(request);
  const { memberId } = await context.params;
  const { organizationId, userId: targetUserId } = parseMemberId(memberId);

  const parsed = PatchSeatTypeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }

  await requireTeamAdminAccess(db, requesterId, organizationId);

  let change: SeatTypeChange;
  try {
    change = await changeMemberSeatType(
      db,
      { privileged: getNeonDb(), stripe: getStripeClient() },
      {
        organizationId,
        administrator: { kind: 'member', userId: requesterId },
        targetUserId,
        seatType: parsed.data.seatType,
        idempotencyKey: request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim() || null,
      },
    );
  } catch (error) {
    if (error instanceof SeatTypeWaitlistError) return seatTypeWaitlistResponse();
    if (!(error instanceof SeatTypePaymentPendingError)) throw error;
    return NextResponse.json(
      {
        success: false,
        paymentActionRequired: true,
        message:
          'The charge for the Premium seat has to be completed before the seat changes. The member is still on a Standard seat. Pay the invoice, then assign the Premium seat again; the paid seat is used and nothing is charged twice.',
        ...(error.paymentUrl ? { paymentUrl: error.paymentUrl } : {}),
      },
      { status: 402 },
    );
  }

  await invalidateActiveOrganizationCache(targetUserId);

  if (change.seatType !== change.previousSeatType) {
    logger.info(
      { requesterId, organizationId, targetUserId, seatType: change.seatType },
      'Team member seat type changed',
    );
    await recordAuditEvent({
      userId: requesterId,
      eventType: 'plan_changed',
      request,
      organizationId,
      severity: 'warning',
      detail: {
        resourceType: 'organization_member',
        resourceId: targetUserId,
        organizationId,
        targetUserId,
        previousPlanTier: teamSeatPlanTier(change.previousSeatType),
        planTier: teamSeatPlanTier(change.seatType),
        source: 'seat_type',
        status: change.billing,
      },
    });
  }

  const body: TeamSeatTypeChange = {
    seatType: change.seatType,
    billing: change.billing,
    premiumPaidThrough: change.premiumPaidThrough,
    seats: change.seats,
  };
  return NextResponse.json(body);
}

export const PATCH = withErrorHandler(handleUpdateSeatType);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
