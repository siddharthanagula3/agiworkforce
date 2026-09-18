import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { TWO_FACTOR_SCOPE } from '@/app/api/settings/2fa/lib/scope';
import { readJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { STEP_UP_ACTIONS, stepUpActionSpec, type StepUpAction } from '@/lib/server/step-up/actions';
import { createStepUpGrant } from '@/lib/server/step-up/grant-token';
import { hasEnrolledSecondFactor, verifySecondFactor } from '@/lib/server/step-up/verify-factor';

const ENDPOINT = '/api/auth/step-up';

const ChallengeSchema = z
  .object({
    action: z.enum(Object.keys(STEP_UP_ACTIONS) as [StepUpAction, ...StepUpAction[]]),
    resourceId: z.string().trim().min(1).max(255).optional(),
    code: z.string().trim().min(1).max(64),
  })
  .strict();

async function handleChallenge(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request, TWO_FACTOR_SCOPE);

  const rateLimitResponse = await withRateLimit(request, '2fa-verify', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = ChallengeSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid step-up challenge', parsed.error.issues);
  }
  const { action, resourceId = null, code } = parsed.data;

  const result = await verifySecondFactor(db, userId, code);

  if (!result.ok) {
    logger.warn({ userId, action, failure: result.failure }, 'Step-up challenge refused');
    await recordAuditEvent({
      userId,
      eventType: 'step_up_failed',
      outcome: 'failure',
      severity: 'warning',
      request,
      endpoint: ENDPOINT,
      organizationId,
      detail: {
        resourceType: 'step_up',
        resourceId: action,
        reason: result.failure,
        ...(resourceId ? { scope: resourceId } : {}),
      },
    });
    return NextResponse.json(
      { error: { code: 'STEP_UP_FAILED', message: describeFailure(result.failure) } },
      { status: result.failure === 'not_enrolled' ? 409 : 401 },
    );
  }

  const grant = createStepUpGrant({ userId, action, resourceId, method: result.method });

  await recordAuditEvent({
    userId,
    eventType: 'step_up_satisfied',
    severity: 'info',
    request,
    endpoint: ENDPOINT,
    organizationId,
    detail: {
      resourceType: 'step_up',
      resourceId: action,
      source: result.method,
      ...(resourceId ? { scope: resourceId } : {}),
      ...(typeof result.backupCodesRemaining === 'number'
        ? { count: result.backupCodesRemaining }
        : {}),
    },
  });

  return NextResponse.json({
    token: grant.token,
    expiresAt: new Date(grant.expiresAt).toISOString(),
    method: result.method,
    ...(typeof result.backupCodesRemaining === 'number'
      ? { backupCodesRemaining: result.backupCodesRemaining }
      : {}),
  });
}

function describeFailure(failure: string): string {
  switch (failure) {
    case 'not_enrolled':
      return 'Turn on two-factor authentication before performing this action.';
    case 'replayed_code':
      return 'That code has already been used. Wait for your authenticator to show the next one.';
    case 'spent_backup_code':
      return 'That backup code has already been spent.';
    default:
      return 'That code was not accepted. Check your authenticator app, then try again.';
  }
}

async function handleReadiness(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, TWO_FACTOR_SCOPE);
  const enrolled = await hasEnrolledSecondFactor(db, userId);
  return NextResponse.json({
    enrolled,
    actions: Object.fromEntries(
      (Object.keys(STEP_UP_ACTIONS) as StepUpAction[]).map((action) => [
        action,
        stepUpActionSpec(action),
      ]),
    ),
  });
}

export const POST = withErrorHandler(handleChallenge);
export const GET = withErrorHandler(handleReadiness);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
