import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PERSONAL_WORKSPACE_SELECTOR } from '@agiworkforce/types';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { persistActiveWorkspaceSelection } from '@/lib/services/active-workspace-service';
import {
  listAccountWorkspaces,
  organizationForWorkspace,
} from '@/features/workspaces/server/workspace-service';

export const runtime = 'nodejs';

const SelectionSchema = z.object({ workspaceId: z.string().trim().min(1).max(64) }).strict();

// The one workspace list and the one way to switch, for all six surfaces. A
// surface deriving its own list diverges as soon as a tenant has two.
async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request, {
    resolveOrganization: false,
  });
  const workspaces = await listAccountWorkspaces(db, userId);
  const active = organizationId
    ? (workspaces.find((workspace) => workspace.organizationId === organizationId) ?? null)
    : null;

  return NextResponse.json(
    {
      workspaces,
      activeWorkspaceId: active?.id ?? null,
      activeOrganizationId: organizationId ?? null,
      scope: organizationId ? 'organization' : 'personal',
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handleSelect(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const parsed = SelectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Select a valid workspace', parsed.error.issues);
  }

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });
  const requested = parsed.data.workspaceId;

  let organizationId: string | null;
  if (requested === PERSONAL_WORKSPACE_SELECTOR) {
    organizationId = null;
  } else {
    const workspaces = await listAccountWorkspaces(db, userId);
    const resolved = organizationForWorkspace(workspaces, requested);
    if (resolved === undefined) {
      throw createError.forbidden('You are not a member of that workspace').asUserSafe();
    }
    organizationId = resolved;
  }

  await db.transaction(async (tx) => {
    await tx.query(
      `select pg_advisory_xact_lock(hashtextextended('agi:active-workspace:' || $1, 0))`,
      [userId],
    );
    await persistActiveWorkspaceSelection(tx, userId, organizationId);
  });

  return NextResponse.json({
    workspaceId: requested === PERSONAL_WORKSPACE_SELECTOR ? null : requested,
    activeOrganizationId: organizationId,
    scope: organizationId ? 'organization' : 'personal',
  });
}

export const GET = withErrorHandler(handleList);
export const PUT = withErrorHandler(handleSelect);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
