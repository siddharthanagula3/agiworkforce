import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedCloudPublishedArtifactLookupQuerySchema,
  type ManagedCloudPublishedArtifactLookupResponse,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { describePublishedArtifactWorkspace } from '@/lib/services/published-artifact-workspace';
import {
  buildPublishedArtifactUrl,
  getOwnedPublishedArtifactSummaryByArtifactId,
  requiresSandboxedRender,
} from '@/lib/services/published-artifact-service';

export const runtime = 'nodejs';

async function handleLookup(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;

  const search = request.nextUrl.searchParams;
  const parsed = ManagedCloudPublishedArtifactLookupQuerySchema.safeParse({
    artifactId: search.get('artifactId'),
  });
  if (search.getAll('artifactId').length !== 1 || !parsed.success) {
    throw createError.validation('Invalid published artifact lookup');
  }
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const artifact = await getOwnedPublishedArtifactSummaryByArtifactId(db, {
    userId,
    artifactId: parsed.data.artifactId,
  });
  const body: ManagedCloudPublishedArtifactLookupResponse = {
    artifact:
      artifact === null
        ? null
        : {
            ...artifact,
            shareUrl: buildPublishedArtifactUrl(artifact.token),
            sandboxed: requiresSandboxedRender(artifact.kind),
          },
    workspace: await describePublishedArtifactWorkspace(db, organizationId),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withCorsRoute(withErrorHandler(handleLookup));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
