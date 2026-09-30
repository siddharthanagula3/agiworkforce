import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ChatCodeRunRequestSchema, type ChatCodeRunResponse } from '@agiworkforce/cloud-contracts';
import { requireCsrfToken } from '@/lib/csrf';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { e2bCutoverEnabled } from '@/lib/e2b/gate';
import { EXECUTE_CODE_TOOL } from '@/lib/e2b/execution-tools';
import { getE2BExecutor } from '@/lib/e2b/runtime';
import { managedCloudE2BSessionScope } from '@/lib/e2b/session-store';
import {
  codeExecutionUnavailableMessage,
  type E2BUnavailableCause,
} from '@/lib/e2b/unavailability';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { assertCapabilityAvailable } from '@/lib/feature-flags/capability-gate';
import { buildFlagSubject } from '@/lib/feature-flags/flag-evaluation-service';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { resolveCloudCodeExecutionPolicy } from '@/lib/server/code-execution-policy';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import {
  buildManagedComputeAccessGateResponse,
  evaluateManagedComputeAccess,
} from '@/lib/services/managed-compute-access';

export const runtime = 'nodejs';
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

async function handleCodeRun(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    throw createError.notFound('Conversation not found');
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }
  const parsed = ChatCodeRunRequestSchema.safeParse(rawBody);
  if (!parsed.success) throw createError.validation('Invalid code run', parsed.error);

  if (!e2bCutoverEnabled()) {
    throw createError.serviceUnavailable('Running code is not available on this deployment.');
  }

  const [conversation] = await db.query<{ id: string }>(
    `select id
       from web_conversations
      where id = $1
        and user_id = $2
        and organization_id is not distinct from $3
        and deleted_at is null
      limit 1`,
    [id, userId, organizationId],
  );
  if (!conversation) throw createError.notFound('Conversation not found');

  const surface = resolveCloudChatSurface(request);
  const entitlement = await resolveEntitlementBundle(db, userId);
  await assertCapabilityAvailable(
    buildFlagSubject(request, {
      userId,
      workspaceId: organizationId,
      role: null,
      plan: entitlement.plan,
      surface,
    }),
    'canUseCloudExecution',
    'Running code',
  );

  const policy = await resolveCloudCodeExecutionPolicy(db, userId);
  if (!policy.allowed) {
    throw createError
      .forbidden(
        policy.reason === 'disabled'
          ? 'Running code is turned off for this account. Turn it on in Settings, Capabilities.'
          : 'Running code is temporarily unavailable. Try again shortly.',
      )
      .asUserSafe();
  }

  const access = await evaluateManagedComputeAccess(db, userId, entitlement.subscription, surface, {
    request,
  });
  const accessGate = buildManagedComputeAccessGateResponse(access);
  if (accessGate) return accessGate;

  const scope = managedCloudE2BSessionScope(userId, id);
  let cause: E2BUnavailableCause | null = null;
  const executor = await getE2BExecutor(scope, (unavailable) => {
    cause ??= unavailable;
  });
  if (!executor) {
    throw createError.serviceUnavailable(codeExecutionUnavailableMessage(cause)).asUserSafe();
  }

  const startedAt = Date.now();
  try {
    const result = await executor.runCode({ ...parsed.data, signal: request.signal });
    await recordAuditEvent({
      userId,
      organizationId,
      request,
      surface,
      eventType: 'tool_executed',
      outcome: result.ok ? 'success' : 'failure',
      detail: {
        resourceType: 'tool',
        resourceId: EXECUTE_CODE_TOOL,
        source: 'code-execution',
        status: result.ok ? 'completed' : 'failed',
        conversationId: id,
        durationMs: Date.now() - startedAt,
      },
    });
    const body: ChatCodeRunResponse = {
      ok: result.ok,
      output: result.output,
      error: result.error ?? null,
      images: result.pngResults ?? [],
    };
    return NextResponse.json(body);
  } finally {
    try {
      await executor.dispose();
    } catch (error) {
      logger.warn({ error, conversationId: id }, '[code-runs] sandbox session was not saved');
    }
  }
}

export const POST = withCorsRoute(withErrorHandler(handleCodeRun));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
