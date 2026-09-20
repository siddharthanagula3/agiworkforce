import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { createError } from '@/lib/errors';
import { logAdminDataAccess } from '@/lib/server/admin-data-access';
import { resolveComplianceCaller } from '@/lib/server/compliance-caller';
import { getNeonDb } from '@/lib/server/neon-db';
import { readLegalHold } from '@/lib/services/ediscovery-export-service';
import { countHeldResources, type HeldResourceCount } from '@/lib/services/legal-hold-gate';
import { LEGAL_HOLD_RESOURCE_TYPES } from '@/lib/services/retention-service';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface LegalHoldPreservationResponse {
  holdId: string;
  holdName: string;
  releasedAt: string | null;
  stores: HeldResourceCount[];
  preserved: number;
  /** Of those, rows whose bytes this product never stored and cannot produce. */
  referenceOnly: number;
  /** A hold that is active and selects nothing preserves no evidence. */
  preservesNothing: boolean;
}

async function handleGet(
  request: NextRequest,
  context: { params: Promise<{ holdId: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { holdId } = await context.params;
  if (!UUID_RE.test(holdId)) throw createError.validation('holdId must be a uuid');

  const caller = await resolveComplianceCaller(
    request,
    'content.govern',
    'Your workspace role does not allow reading what a legal hold preserves.',
  );

  const privileged = getNeonDb();
  const hold = await readLegalHold(privileged, caller.organizationId, holdId);
  if (!hold) throw createError.notFound('No legal hold with that id in this workspace.');

  const stores = await countHeldResources(privileged, hold, LEGAL_HOLD_RESOURCE_TYPES);
  const preserved = stores.reduce((total, store) => total + store.preserved, 0);
  const referenceOnly = stores.reduce((total, store) => total + store.referenceOnly, 0);

  await logAdminDataAccess(request, {
    userId: caller.actorUserId,
    organizationId: caller.organizationId,
    role: caller.role,
    resourceType: 'legal_hold',
    resourceId: hold.id,
    count: preserved,
  });

  const payload: LegalHoldPreservationResponse = {
    holdId: hold.id,
    holdName: hold.name,
    releasedAt: hold.releasedAt,
    stores,
    preserved,
    referenceOnly,
    preservesNothing: hold.releasedAt === null && preserved === referenceOnly,
  };
  return NextResponse.json(payload);
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
