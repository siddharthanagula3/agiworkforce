import 'server-only';

import { NextRequest } from 'next/server';
import {
  ARTIFACT_RUNTIME_MAX_PROMPT_CHARS,
  ArtifactRuntimeCompleteRequestSchema,
} from '@agiworkforce/cloud-contracts';
import { assertAccountActive } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { readRunnableArtifact } from '@/lib/services/artifact-runtime-service';
import { publishedArtifactSourceHoldsGoogleUserData } from '@/lib/connectors/google-user-data-runs';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  PUBLISHED_TOKEN_REGEX,
  publishedArtifactUsesConnectors,
} from '@/lib/services/published-artifact-service';
import {
  artifactRuntimeRefusal,
  respondToArtifactCompletion,
} from '@/app/api/artifacts/runtime/artifact-completion';

export const runtime = 'nodejs';
export const maxDuration = 300;

type RouteContext = { params: Promise<{ token: string }> };

const UNAVAILABLE_MESSAGE = 'This app is no longer available.';

async function handlePost(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token } = await context.params;
  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    return artifactRuntimeRefusal(404, 'artifact_not_found', UNAVAILABLE_MESSAGE);
  }

  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf;
  const scoped = await getUserScopedDb(request);
  await assertAccountActive(scoped.userId, request);
  const limited = await withRateLimit(request, 'llm-completion', `user:${scoped.userId}`);
  if (limited) return limited;

  const parsed = ArtifactRuntimeCompleteRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return artifactRuntimeRefusal(
      400,
      'invalid_prompt',
      `Send a prompt of 1 to ${ARTIFACT_RUNTIME_MAX_PROMPT_CHARS.toLocaleString('en-US')} characters.`,
    );
  }

  const artifact = await readRunnableArtifact(scoped.db, token);
  if (!artifact) return artifactRuntimeRefusal(404, 'artifact_not_found', UNAVAILABLE_MESSAGE);
  // Only an app its publisher bound to connected apps may read a viewer's, so
  // the shared-data refusal for such apps cannot be sidestepped.
  if (
    parsed.data.connectors.length > 0 &&
    artifact.ownerUserId !== scoped.userId &&
    !(await publishedArtifactUsesConnectors(scoped.db, artifact.publishedArtifactId))
  ) {
    return artifactRuntimeRefusal(
      403,
      'connectors_not_declared',
      'This app was not published with connected apps, so it cannot use yours.',
    );
  }

  // The source chat belongs to the app's owner, not the viewer, so it is read
  // on the service connection.
  return respondToArtifactCompletion({
    request,
    scoped,
    subject: { kind: 'published', publishedArtifactId: artifact.publishedArtifactId },
    prompt: parsed.data.prompt,
    connectors: parsed.data.connectors,
    allowedTools: parsed.data.allowedTools,
    sourceHoldsGoogleUserData: () =>
      publishedArtifactSourceHoldsGoogleUserData(getNeonDb(), artifact.publishedArtifactId),
  });
}

export const POST = withErrorHandler(handlePost);
