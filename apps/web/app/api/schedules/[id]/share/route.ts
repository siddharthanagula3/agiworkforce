import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { inspectOutboundContent } from '@/lib/security/outbound-content-inspection';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import {
  getSchedule,
  ScheduleNotFoundError,
  type ScheduleTask,
} from '@/lib/services/schedule-service';
import {
  saveScheduleShare,
  scheduleShareSnapshot,
  unshareSchedule,
} from '@/lib/services/schedule-share-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

async function handleShare(request: NextRequest, context: RouteContext) {
  const { db, userId } = await getUserScopedDb(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const { id } = await context.params;
  let task: ScheduleTask;
  try {
    task = await getSchedule(db, userId, id);
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) throw createError.notFound('Schedule not found');
    throw error;
  }
  const outbound = await inspectOutboundContent({
    channel: 'share',
    value: scheduleShareSnapshot(task),
    userId,
    organizationId: null,
    resourceId: task.id,
    auditUnblocked: false,
    resolveMode: () => resolveSecretHandlingPolicy(db, userId),
  });
  if (outbound.action === 'blocked') throw createError.validation(outbound.message);
  return NextResponse.json({ share: await saveScheduleShare(db, userId, task.id, outbound.value) });
}

async function handleUnshare(request: NextRequest, context: RouteContext) {
  const { db, userId } = await getUserScopedDb(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const { id } = await context.params;
  await unshareSchedule(db, userId, id);
  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(handleShare);
export const DELETE = withErrorHandler(handleUnshare);
