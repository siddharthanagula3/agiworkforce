import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { TWO_FACTOR_SCOPE } from '@/app/api/settings/2fa/lib/scope';
import { readJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  STEP_UP_ACTIONS,
  STEP_UP_VERIFICATION_REQUIRED,
  stepUpActionSpec,
  type StepUpAction,
  type StepUpLevel,
} from '@/lib/server/step-up/actions';
import { createStepUpGrant } from '@/lib/server/step-up/grant-token';
import { stepUpLevelFor } from '@/lib/server/step-up/second-factor';
import { freshVerificationMinutes, readSessionFactorAge } from '@/lib/server/step-up/session-proof';

const ENDPOINT = '/api/auth/step-up';
const SECONDS_PER_MINUTE = 60;

const GrantRequestSchema = z
  .object({
    action: z.enum(Object.keys(STEP_UP_ACTIONS) as [StepUpAction, ...StepUpAction[]]),
    resourceId: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

const VERIFICATION_PROMPT: Readonly<Record<StepUpLevel, string>> = {
  second_factor: 'Confirm it is you with your authenticator app or a backup code.',
  first_factor: 'Confirm it is you with your password, a passkey or a code sent to your email.',
};

async function handleGrant(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request, TWO_FACTOR_SCOPE);

  const rateLimitResponse = await withRateLimit(request, 'auth-verify', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = GrantRequestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid step-up request', parsed.error.issues);
  }
  const { action, resourceId = null } = parsed.data;

  const level = await stepUpLevelFor(db, userId);
  const verifiedMinutesAgo = freshVerificationMinutes(
    await readSessionFactorAge(request),
    level,
    action,
  );
  if (verifiedMinutesAgo === null) {
    return NextResponse.json(
      {
        error: {
          code: STEP_UP_VERIFICATION_REQUIRED,
          message: VERIFICATION_PROMPT[level],
          details: { action, level },
        },
      },
      { status: 403 },
    );
  }

  const grant = createStepUpGrant({
    userId,
    action,
    resourceId,
    method: level,
    verifiedSecondsAgo: verifiedMinutesAgo * SECONDS_PER_MINUTE,
  });

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
      source: level,
      ...(resourceId ? { scope: resourceId } : {}),
    },
  });

  return NextResponse.json({
    token: grant.token,
    expiresAt: new Date(grant.expiresAt).toISOString(),
    method: level,
  });
}

async function handleReadiness(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, TWO_FACTOR_SCOPE);
  return NextResponse.json({
    level: await stepUpLevelFor(db, userId),
    actions: Object.fromEntries(
      (Object.keys(STEP_UP_ACTIONS) as StepUpAction[]).map((action) => [
        action,
        stepUpActionSpec(action),
      ]),
    ),
  });
}

export const POST = withErrorHandler(handleGrant);
export const GET = withErrorHandler(handleReadiness);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
