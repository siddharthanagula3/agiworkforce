import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { WORKSPACE_FEATURES } from '@agiworkforce/types';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getNeonDb } from '@/lib/server/neon-db';
import { diagnoseMemberPolicy } from '@/lib/services/organization-policy-gate';
import type { PolicyAsk } from '@/lib/services/organization-policy-evaluator';
import { policyScopeSubjectExists } from '../policy-subject';
import { requireWorkspaceConsolePermission } from '../../workspace-access';

export const runtime = 'nodejs';

const POLICY_SURFACES = ['web', 'desktop', 'mobile', 'cli', 'vscode', 'chrome', 'api'] as const;

const QuerySchema = z
  .object({
    memberId: z.string().trim().min(1).max(255),
    feature: z.enum(WORKSPACE_FEATURES).optional(),
    surface: z.enum(POLICY_SURFACES).optional(),
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase())
      .optional(),
  })
  .strict();

const DENIED = 'Your workspace role does not allow reading workspace policy.';

async function handleDiagnose(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { organizationId } = await requireWorkspaceConsolePermission(
    request,
    'policy.manage',
    DENIED,
  );

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(
      [...request.nextUrl.searchParams.entries()].filter(([, value]) => value !== ''),
    ),
  );
  if (!parsed.success) {
    throw createError.validation('Invalid policy lookup', parsed.error.flatten());
  }
  const { memberId, feature, surface, country } = parsed.data;

  const db = getNeonDb();
  if (!(await policyScopeSubjectExists(db, organizationId, 'user', memberId))) {
    throw createError.notFound('That person is not a member of this workspace.').asUserSafe();
  }

  const ask: PolicyAsk | null = feature
    ? { resource: 'feature', feature, surface: surface ?? 'web', country: country ?? null }
    : surface
      ? { resource: 'managed_compute', surface, country: country ?? null }
      : null;

  const diagnosis = await diagnoseMemberPolicy(db, organizationId, memberId, ask);
  return NextResponse.json(
    { organizationId, memberId, ...diagnosis },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withErrorHandler(handleDiagnose);
