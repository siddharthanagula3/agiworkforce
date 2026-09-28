import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { canUseBillingPlanCapability } from '@agiworkforce/types';
import {
  DATA_REGIONS,
  DATA_REGION_IDS,
  DataRegionUnavailableError,
  type DataRegionId,
} from '@agiworkforce/compliance';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { readJsonBody } from '@/lib/read-json-body';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  cancelOrganizationRegionMove,
  isRegionProvisioned,
  readOrganizationRegion,
  requestOrganizationRegionMove,
  type OrganizationRegionState,
} from '@/lib/server/data-region';
import { resolveOrganizationEntitlementPlan } from '@/lib/services/org-entitlements';
import { requireWorkspaceConsolePermission } from '../workspace-access';

export const runtime = 'nodejs';

const MoveSchema = z.object({ region: z.enum(DATA_REGION_IDS) }).strict();

const VIEW_DENIED = 'Your workspace role does not allow viewing the workspace data region.';
const MANAGE_DENIED = 'Your workspace role does not allow moving the workspace data region.';

export interface DataRegionOption {
  id: DataRegionId;
  label: string;
  available: boolean;
}

export interface WorkspaceDataRegionResponse {
  organizationId: string;
  region: OrganizationRegionState;
  regions: DataRegionOption[];
  canMove: boolean;
}

async function canMoveRegion(organizationId: string): Promise<boolean> {
  const plan = await resolveOrganizationEntitlementPlan(organizationId);
  return canUseBillingPlanCapability(plan, 'enterprise_controls');
}

async function respond(
  organizationId: string,
  region: OrganizationRegionState,
): Promise<NextResponse> {
  const body: WorkspaceDataRegionResponse = {
    organizationId,
    region,
    regions: DATA_REGION_IDS.map((id) => ({
      id,
      label: DATA_REGIONS[id].label,
      available: isRegionProvisioned(id),
    })),
    canMove: await canMoveRegion(organizationId),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { organizationId } = await requireWorkspaceConsolePermission(
    request,
    'admin.policy.view',
    VIEW_DENIED,
  );
  return respond(organizationId, await readOrganizationRegion(getNeonDb(), organizationId));
}

async function handleMove(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, organizationId } = await requireWorkspaceConsolePermission(
    request,
    'admin.policy.manage',
    MANAGE_DENIED,
  );
  if (!(await canMoveRegion(organizationId))) {
    throw createError
      .forbidden('Choosing where workspace data is stored requires an active Enterprise plan.')
      .asUserSafe();
  }

  const parsed = MoveSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid data region', parsed.error.issues);
  }

  const db = getNeonDb();
  const current = await readOrganizationRegion(db, organizationId);
  if (current.effective === parsed.data.region) {
    throw createError
      .validation(
        `This workspace's data is already stored in ${DATA_REGIONS[parsed.data.region].label}.`,
      )
      .asUserSafe();
  }

  try {
    const region = await requestOrganizationRegionMove({
      db,
      organizationId,
      actorUserId: userId,
      target: parsed.data.region,
    });
    return respond(organizationId, region);
  } catch (error) {
    if (error instanceof DataRegionUnavailableError) {
      throw createError
        .conflict(
          `${DATA_REGIONS[parsed.data.region].label} is not available yet, so data cannot be moved there.`,
        )
        .asUserSafe();
    }
    throw error;
  }
}

async function handleCancel(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, organizationId } = await requireWorkspaceConsolePermission(
    request,
    'admin.policy.manage',
    MANAGE_DENIED,
  );
  const region = await cancelOrganizationRegionMove({
    db: getNeonDb(),
    organizationId,
    actorUserId: userId,
  });
  return respond(organizationId, region);
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handleMove);
export const DELETE = withErrorHandler(handleCancel);
