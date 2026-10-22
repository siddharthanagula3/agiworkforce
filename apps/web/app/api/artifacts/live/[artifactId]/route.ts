import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { assertAccountActive } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { readJsonBody } from '@/lib/read-json-body';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import {
  readLiveArtifact,
  readOwnedRunnableArtifact,
  removeLiveArtifact,
  saveLiveArtifact,
  setLiveArtifactRefreshPolicy,
} from '@/lib/services/artifact-runtime-service';
import {
  LiveArtifactBindingRequestSchema,
  LiveArtifactIdSchema,
  LiveArtifactPolicyRequestSchema,
  type LiveArtifactResponse,
} from '@/app/chat/live-artifacts/live-artifact-contract';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

type RouteContext = { params: Promise<{ artifactId: string }> };

function refusal(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}

function respond(body: LiveArtifactResponse): NextResponse {
  return NextResponse.json(body, { headers: NO_STORE });
}

const NOT_LIVE = 'This artifact is not live.';
const NOT_RUNNABLE =
  'Only an HTML or React artifact saved in one of your chats can use your connected apps.';

async function artifactIdFrom(context: RouteContext): Promise<string | null> {
  const { artifactId } = await context.params;
  return LiveArtifactIdSchema.safeParse(artifactId).success ? artifactId : null;
}

async function authorize(
  request: NextRequest,
  options: { mutating: boolean },
): Promise<UserScopedDb | Response> {
  if (options.mutating) {
    const csrf = await requireCsrfToken(request);
    if (csrf) return csrf;
  }
  const scoped = await getUserScopedDb(request);
  await assertAccountActive(scoped.userId, request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${scoped.userId}`);
  return limited ?? scoped;
}

function audit(
  request: NextRequest,
  scoped: UserScopedDb,
  artifactId: string,
  status: string,
  connectors: readonly string[],
): Promise<void> {
  return recordAuditEvent({
    userId: scoped.userId,
    organizationId: scoped.organizationId,
    request,
    eventType: 'connector_setting_changed',
    detail: {
      resourceType: 'live_artifact',
      resourceId: artifactId,
      status,
      scopes: [...connectors],
    },
  });
}

async function handleGet(request: NextRequest, context: RouteContext): Promise<Response> {
  const artifactId = await artifactIdFrom(context);
  if (!artifactId) return refusal(404, 'live_artifact_not_found', NOT_LIVE);
  const scoped = await authorize(request, { mutating: false });
  if (scoped instanceof Response) return scoped;
  return respond({ artifact: await readLiveArtifact(scoped.db, scoped, artifactId) });
}

async function handlePut(request: NextRequest, context: RouteContext): Promise<Response> {
  const artifactId = await artifactIdFrom(context);
  if (!artifactId) return refusal(404, 'artifact_not_found', NOT_RUNNABLE);
  const scoped = await authorize(request, { mutating: true });
  if (scoped instanceof Response) return scoped;

  const parsed = LiveArtifactBindingRequestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return refusal(
      400,
      'invalid_live_artifact',
      'Name one to ten connected apps and the tools this app may use.',
    );
  }
  const artifact = await readOwnedRunnableArtifact(scoped.db, scoped, artifactId);
  if (!artifact) return refusal(404, 'artifact_not_found', NOT_RUNNABLE);

  const saved = await saveLiveArtifact(scoped.db, {
    owner: scoped,
    artifact,
    connectors: parsed.data.connectors,
    allowedTools: parsed.data.allowedTools,
    refreshPolicy: parsed.data.refreshPolicy ?? null,
  });
  if (!saved) return refusal(404, 'artifact_not_found', NOT_RUNNABLE);
  await audit(request, scoped, artifactId, 'live_artifact_bound', saved.connectors);
  return respond({ artifact: saved });
}

async function handlePatch(request: NextRequest, context: RouteContext): Promise<Response> {
  const artifactId = await artifactIdFrom(context);
  if (!artifactId) return refusal(404, 'live_artifact_not_found', NOT_LIVE);
  const scoped = await authorize(request, { mutating: true });
  if (scoped instanceof Response) return scoped;

  const parsed = LiveArtifactPolicyRequestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return refusal(400, 'invalid_refresh_policy', 'Choose when this artifact refreshes.');
  }
  const updated = await setLiveArtifactRefreshPolicy(
    scoped.db,
    scoped,
    artifactId,
    parsed.data.refreshPolicy,
  );
  if (!updated) return refusal(404, 'live_artifact_not_found', NOT_LIVE);
  await audit(
    request,
    scoped,
    artifactId,
    `live_artifact_refresh_${updated.refreshPolicy}`,
    updated.connectors,
  );
  return respond({ artifact: updated });
}

async function handleDelete(request: NextRequest, context: RouteContext): Promise<Response> {
  const artifactId = await artifactIdFrom(context);
  if (!artifactId) return refusal(404, 'live_artifact_not_found', NOT_LIVE);
  const scoped = await authorize(request, { mutating: true });
  if (scoped instanceof Response) return scoped;

  const existing = await readLiveArtifact(scoped.db, scoped, artifactId);
  const removed = await removeLiveArtifact(scoped.db, scoped.userId, artifactId);
  if (!removed) return refusal(404, 'live_artifact_not_found', NOT_LIVE);
  await audit(request, scoped, artifactId, 'live_artifact_unbound', existing?.connectors ?? []);
  return respond({ artifact: null });
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handlePut);
export const PATCH = withErrorHandler(handlePatch);
export const DELETE = withErrorHandler(handleDelete);
