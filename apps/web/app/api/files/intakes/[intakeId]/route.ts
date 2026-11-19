import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { ManagedCloudChatFileIntakeStatusResponse } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { chatFileSchemaReady } from '@/lib/server/chat-file-intake/schema';
import { readIntakeStatus, type ChatFileIntakeRow } from '@/lib/server/chat-file-intake/store';
import {
  cancelChatFileIntake,
  defaultIntakeTransitionDeps,
} from '@/lib/server/chat-file-intake/transitions';
import { chatFileIntakeForClient } from '../../uploads/resumable-upload';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ intakeId: string }> };

const INTAKE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function intakeNotFound(): never {
  throw createError.notFound('Upload not found');
}

async function intakeScope(request: NextRequest, context: RouteContext) {
  const { db, userId } = await getUserScopedDb(request);
  const { intakeId } = await context.params;
  return { db, userId, intakeId };
}

/**
 * Only an intake that exists is read, and a database without the intake
 * tables has none, so it is never sent a statement that names them.
 */
async function assertIntakeCanExist(
  db: Awaited<ReturnType<typeof getUserScopedDb>>['db'],
  intakeId: string,
): Promise<void> {
  if (!INTAKE_ID.test(intakeId) || !(await chatFileSchemaReady(db, { cached: true }))) {
    intakeNotFound();
  }
}

function statusResponse(row: ChatFileIntakeRow): NextResponse {
  const body: ManagedCloudChatFileIntakeStatusResponse = { intake: chatFileIntakeForClient(row) };
  return NextResponse.json(body);
}

async function handleStatus(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { db, userId, intakeId } = await intakeScope(request, context);

  const rateLimitResponse = await withRateLimit(request, 'uploads-intake-status', userId);
  if (rateLimitResponse) return rateLimitResponse;

  await assertIntakeCanExist(db, intakeId);
  const row = await readIntakeStatus(db, { userId, intakeId });
  if (!row) intakeNotFound();
  return statusResponse(row);
}

/**
 * The cancel after the upload finished. From `sealing` on the file is already
 * being added, so the answer is the intake as it stands; a second cancel
 * answers the cancelled intake again.
 */
async function handleCancel(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { db, userId, intakeId } = await intakeScope(request, context);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'uploads-intake-status', userId);
  if (rateLimitResponse) return rateLimitResponse;

  await assertIntakeCanExist(db, intakeId);
  const result = await cancelChatFileIntake(defaultIntakeTransitionDeps(db, userId), {
    userId,
    intakeId,
  });
  if (result.outcome === 'missing') intakeNotFound();
  return statusResponse(result.row);
}

export const GET = withCorsRoute(withErrorHandler(handleStatus));
export const DELETE = withCorsRoute(withErrorHandler(handleCancel));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
