import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError, isAppError, type AppError } from '@/lib/errors';
import { assertAccountActive } from '@/lib/api-auth';
import { readJsonBody } from '@/lib/read-json-body';
import { logSecurityEvent } from '@/lib/security-audit';
import {
  isPlatformAdmin,
  PLATFORM_ADMIN_ENV_VAR,
} from '@/features/admin/lib/platform-admin-access';
import {
  readOperatorOverview,
  readRecentFeedback,
  readRecentUsers,
  resetUserUsage,
  previewBulkUsageReset,
  resetAllUsersUsage,
  grantBonusCredits,
} from '@/features/admin/services/operator-metrics';
import { readOperatorCosts } from '@/features/admin/services/operator-cost-metrics';
import { getRequestIdentity } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

function errorResponse(err: AppError): NextResponse {
  return NextResponse.json(
    { error: { code: err.code, message: err.message } },
    { status: err.statusCode },
  );
}

/**
 * Every response from this route is the platform's own books, so the gate is
 * the allowlist rather than the organisation-role check the enterprise console
 * uses. Both the read and the write path go through here, so there is one place
 * to audit rather than two that can drift.
 */
async function requirePlatformAdmin(): Promise<string> {
  const { subject: userId } = await getRequestIdentity();
  if (!userId) throw createError.unauthorized('Sign in required.');

  if (!isPlatformAdmin(userId, process.env[PLATFORM_ADMIN_ENV_VAR])) {
    // Deliberately not-found rather than forbidden: a 403 confirms the route
    // exists to an account that should not know it does.
    logger.warn({ userId }, 'Operator dashboard denied: not a platform admin');
    throw createError.notFound('Not found.');
  }

  await assertAccountActive(userId);
  return userId;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'admin-operator');
  if (limited) return limited;

  try {
    await requirePlatformAdmin();
    const view = request.nextUrl.searchParams.get('view') ?? 'overview';

    if (view === 'feedback') {
      return NextResponse.json({ feedback: await readRecentFeedback(100) });
    }
    if (view === 'users') {
      return NextResponse.json({ users: await readRecentUsers(100) });
    }
    if (view === 'costs') {
      return NextResponse.json({ costs: await readOperatorCosts() });
    }
    return NextResponse.json({ overview: await readOperatorOverview() });
  } catch (error) {
    if (isAppError(error)) return errorResponse(error);
    logger.error({ error }, 'Operator dashboard read failed');
    return errorResponse(createError.internal('Could not load the dashboard.'));
  }
}

/**
 * POST /api/admin/operator  { action: 'reset-usage', userId }
 *
 * Resetting usage rewrites live billing state, so it is a POST behind CSRF and
 * it writes a security-audit entry naming the operator who did it. A reset that
 * cannot be attributed afterwards is indistinguishable from usage that was
 * never recorded.
 */
export const BULK_RESET_CONFIRMATION = 'RESET ALL USAGE';
const MAX_GRANT_CENTS = 50_000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'admin-operator');
  if (limited) return limited;

  try {
    const actorId = await requirePlatformAdmin();
    const csrf = await requireCsrfToken(request);
    if (csrf) return NextResponse.json(await csrf.json(), { status: csrf.status });

    const body = await readJsonBody<{
      action?: string;
      userId?: string;
      amountCents?: number;
      reason?: string;
      confirm?: string;
    }>(request);

    // A preview mutates nothing, so it answers before any confirmation gate.
    if (body?.action === 'preview-reset-all') {
      return NextResponse.json(await previewBulkUsageReset());
    }

    if (body?.action === 'reset-all-usage') {
      // The blast radius is every active account, and re-running does not undo
      // it, so the operator has to type the phrase rather than land on a
      // button. Cheap friction against an irreversible fleet-wide write.
      if (body.confirm !== BULK_RESET_CONFIRMATION) {
        throw createError.validation(
          `Type "${BULK_RESET_CONFIRMATION}" to confirm a fleet-wide usage reset.`,
        );
      }
      const result = await resetAllUsersUsage(actorId);
      await logSecurityEvent({
        userId: actorId,
        eventType: 'admin_action',
        severity: 'critical',
        endpoint: '/api/operator',
        details: {
          action: 'reset-all-usage',
          affected_users: result.affectedUsers,
          cleared_cents: result.clearedCents,
        },
      });
      return NextResponse.json(result);
    }

    if (body?.action === 'grant-credits') {
      const targetUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
      if (!targetUserId) throw createError.validation('userId is required.');
      const amountCents = body.amountCents;
      if (!Number.isInteger(amountCents) || (amountCents as number) <= 0) {
        throw createError.validation('amountCents must be a positive whole number of cents.');
      }
      if ((amountCents as number) > MAX_GRANT_CENTS) {
        throw createError.validation(
          `A single grant is capped at $${MAX_GRANT_CENTS / 100}. Split a larger goodwill award.`,
        );
      }
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 280) : '';
      if (!reason) throw createError.validation('reason is required so the grant is explainable.');

      const result = await grantBonusCredits(targetUserId, amountCents as number, actorId, reason);
      await logSecurityEvent({
        userId: actorId,
        eventType: 'admin_action',
        severity: 'high',
        endpoint: '/api/operator',
        details: {
          action: 'grant-credits',
          target_user_id: targetUserId,
          amount_cents: amountCents,
          reason,
          granted: result.granted,
        },
      });
      return NextResponse.json(result);
    }

    if (body?.action !== 'reset-usage') {
      throw createError.validation('Unknown action.');
    }

    const targetUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!targetUserId) throw createError.validation('userId is required.');

    const result = await resetUserUsage(targetUserId, actorId);

    await logSecurityEvent({
      userId: actorId,
      eventType: 'admin_action',
      severity: 'high',
      endpoint: '/api/operator',
      details: {
        action: 'reset-usage',
        target_user_id: targetUserId,
        cleared_cents: result.clearedCents,
        found_period: result.reset,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (isAppError(error)) return errorResponse(error);
    logger.error({ error }, 'Operator action failed');
    return errorResponse(createError.internal('Could not complete the operator action.'));
  }
}
