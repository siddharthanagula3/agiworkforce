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
import { conversationHoldsGoogleUserData } from '@/lib/connectors/google-user-data';
import {
  bindingCovers,
  readLiveArtifact,
  readOwnedRunnableArtifact,
  recordLiveArtifactRefresh,
} from '@/lib/services/artifact-runtime-service';
import {
  artifactRuntimeRefusal,
  respondToArtifactCompletion,
} from '@/app/api/artifacts/runtime/artifact-completion';
import { LiveArtifactIdSchema } from '@/app/chat/live-artifacts/live-artifact-contract';

export const runtime = 'nodejs';
export const maxDuration = 300;

type RouteContext = { params: Promise<{ artifactId: string }> };

const NOT_FOUND_MESSAGE = 'Only an app saved in one of your chats can use AI here.';

async function handlePost(request: NextRequest, context: RouteContext): Promise<Response> {
  const { artifactId } = await context.params;
  if (!LiveArtifactIdSchema.safeParse(artifactId).success) {
    return artifactRuntimeRefusal(404, 'artifact_not_found', NOT_FOUND_MESSAGE);
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

  const artifact = await readOwnedRunnableArtifact(scoped.db, scoped, artifactId);
  if (!artifact) return artifactRuntimeRefusal(404, 'artifact_not_found', NOT_FOUND_MESSAGE);

  const connectors = [...new Set(parsed.data.connectors)];
  const binding = await readLiveArtifact(scoped.db, scoped, artifactId);
  if (!bindingCovers(binding, connectors)) {
    return artifactRuntimeRefusal(
      409,
      'live_binding_required',
      'Allow this app to use your connected apps before it reads them.',
    );
  }

  return respondToArtifactCompletion({
    request,
    scoped,
    subject: { kind: 'owned', artifactId },
    prompt: parsed.data.prompt,
    connectors,
    allowedTools: connectors.length > 0 && binding ? binding.allowedTools : [],
    sourceHoldsGoogleUserData: () =>
      conversationHoldsGoogleUserData(scoped.db, scoped.userId, artifact.conversationId),
    ...(binding
      ? { onCompleted: () => recordLiveArtifactRefresh(scoped.db, scoped.userId, artifactId) }
      : {}),
  });
}

export const POST = withErrorHandler(handlePost);
