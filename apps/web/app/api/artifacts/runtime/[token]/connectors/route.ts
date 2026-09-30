import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ArtifactRuntimeConnectorsRequestSchema,
  type ArtifactRuntimeConnectorsResponse,
} from '@agiworkforce/cloud-contracts';
import { assertAccountActive } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { artifactConnectorsGateResponse } from '@/lib/services/artifact-connector-gate';
import {
  describeArtifactConnectors,
  readRunnableArtifact,
} from '@/lib/services/artifact-runtime-service';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { PUBLISHED_TOKEN_REGEX } from '@/lib/services/published-artifact-service';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const UNAVAILABLE_MESSAGE = 'This app is no longer available.';

type RouteContext = { params: Promise<{ token: string }> };

function refusal(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}

async function handlePost(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token } = await context.params;
  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    return refusal(404, 'artifact_not_found', UNAVAILABLE_MESSAGE);
  }

  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf;
  const scoped = await getUserScopedDb(request);
  await assertAccountActive(scoped.userId, request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${scoped.userId}`);
  if (limited) return limited;

  const parsed = ArtifactRuntimeConnectorsRequestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return refusal(400, 'invalid_connectors', 'Name between one and ten connected apps.');
  }

  const artifact = await readRunnableArtifact(scoped.db, token);
  if (!artifact) return refusal(404, 'artifact_not_found', UNAVAILABLE_MESSAGE);

  const entitlement = await resolveEntitlementBundle(scoped.db, scoped.userId);
  const gate = await artifactConnectorsGateResponse(
    scoped.userId,
    request,
    entitlement.plan,
    NO_STORE,
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
    return refusal(
      403,
      'connectors_unavailable',
      'Your plan cannot use connected apps from published apps.',
    );
  }
  const body: ArtifactRuntimeConnectorsResponse = { connectors };
  return NextResponse.json(body, { headers: NO_STORE });
}

export const POST = withErrorHandler(handlePost);
