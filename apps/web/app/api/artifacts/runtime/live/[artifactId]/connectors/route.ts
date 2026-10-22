import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ArtifactRuntimeConnectorsRequestSchema,
  type ArtifactRuntimeConnectorsResponse,
} from '@agiworkforce/cloud-contracts';
import { assertAccountActive } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { artifactConnectorsGateResponse } from '@/lib/services/artifact-connector-gate';
import {
  describeArtifactConnectors,
  readOwnedRunnableArtifact,
} from '@/lib/services/artifact-runtime-service';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import {
  ARTIFACT_RUNTIME_NO_STORE,
  artifactRuntimeRefusal,
} from '@/app/api/artifacts/runtime/artifact-completion';
import {
  LIVE_ARTIFACT_CONNECTORS_PARAM,
  LiveArtifactIdSchema,
} from '@/app/chat/live-artifacts/live-artifact-contract';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ artifactId: string }> };

const NOT_FOUND_MESSAGE = 'Only an app saved in one of your chats can use your connected apps.';

async function handleGet(request: NextRequest, context: RouteContext): Promise<Response> {
  const { artifactId } = await context.params;
  if (!LiveArtifactIdSchema.safeParse(artifactId).success) {
    return artifactRuntimeRefusal(404, 'artifact_not_found', NOT_FOUND_MESSAGE);
  }

  const scoped = await getUserScopedDb(request);
  await assertAccountActive(scoped.userId, request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${scoped.userId}`);
  if (limited) return limited;

  const parsed = ArtifactRuntimeConnectorsRequestSchema.safeParse({
    connectors: request.nextUrl.searchParams.getAll(LIVE_ARTIFACT_CONNECTORS_PARAM),
  });
  if (!parsed.success) {
    return artifactRuntimeRefusal(
      400,
      'invalid_connectors',
      'Name between one and ten connected apps.',
    );
  }

  const artifact = await readOwnedRunnableArtifact(scoped.db, scoped, artifactId);
  if (!artifact) return artifactRuntimeRefusal(404, 'artifact_not_found', NOT_FOUND_MESSAGE);

  const entitlement = await resolveEntitlementBundle(scoped.db, scoped.userId);
  const gate = await artifactConnectorsGateResponse(
    scoped.userId,
    request,
    entitlement.plan,
    ARTIFACT_RUNTIME_NO_STORE,
  );
  if (gate) return gate;

  const connectors = await describeArtifactConnectors({
    db: scoped.db,
    userId: scoped.userId,
    organizationId: scoped.organizationId,
    planTier: entitlement.plan,
    connectors: [...new Set(parsed.data.connectors)],
    request,
  });
  if (!connectors) {
    return artifactRuntimeRefusal(
      403,
      'connectors_unavailable',
      'Your plan cannot use connected apps from artifacts.',
    );
  }
  const body: ArtifactRuntimeConnectorsResponse = { connectors };
  return NextResponse.json(body, { headers: ARTIFACT_RUNTIME_NO_STORE });
}

export const GET = withErrorHandler(handleGet);
