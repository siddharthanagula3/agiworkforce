import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { EffectiveWorkspacePolicyResponse } from '@agiworkforce/types';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEffectiveWorkspaceControls } from '@/lib/services/organization-policy-gate';

export const runtime = 'nodejs';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getUserScopedDb(request);
  const effective = await resolveEffectiveWorkspaceControls(getNeonDb(), userId, request);

  const etag = effective
    ? `"${effective.organizationId}:${effective.revision}:${effective.controls.appliedOverrideIds.join(',')}"`
    : '"unscoped"';
  const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' };

  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers });
  }

  const body: EffectiveWorkspacePolicyResponse = effective
    ? {
        organizationId: effective.organizationId,
        governed: true,
        revision: effective.revision,
        controls: effective.controls,
        code: effective.code,
      }
    : { organizationId: null, governed: false, revision: 0, controls: null, code: null };

  return NextResponse.json(body, { headers });
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
