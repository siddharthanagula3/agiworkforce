import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { clerkClient } from '@clerk/nextjs/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { eraseUserAccountData } from '@/lib/server/account-erasure';
import { recordAuditEvent } from '@/lib/security-audit';
import { pseudonymizeIdentifier } from '@/lib/server/pseudonymize';
import { CONTACT_EMAIL } from '@/lib/legal-constants';
import { SubscriptionService, type SubscriptionInfo } from '@/lib/services/subscription-service';
import { hasLiveBillingRelationship } from '@/lib/services/subscription-access-policy';

export const runtime = 'nodejs';

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'",
  'X-Content-Type-Options': 'nosniff',
};

const PG_UNDEFINED_COLUMN = '42703';

function isMissingDeletionColumns(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as Record<string, unknown>)['code'] === PG_UNDEFINED_COLUMN;
}

function isPaidSubscription(
  subscription: SubscriptionInfo | null,
): subscription is SubscriptionInfo {
  if (!subscription) return false;
  const planTier = (subscription.plan_tier || 'free').trim().toLowerCase();
  if (planTier === 'free') return false;
  return hasLiveBillingRelationship(subscription.status);
}

function periodEndLabel(subscription: SubscriptionInfo): string {
  const end = subscription.current_period_end;
  return end instanceof Date && !Number.isNaN(end.getTime())
    ? end.toISOString().slice(0, 10)
    : 'the end of the current billing period';
}

function activeSubscriptionMessage(subscription: SubscriptionInfo): string {
  const plan = subscription.plan_tier;
  if (subscription.cancel_at_period_end) {
    return `Your ${plan} plan is already cancelled and stays active until ${periodEndLabel(subscription)}. Nothing was deleted, you can delete your account once the plan has ended, or email ${CONTACT_EMAIL} to have it removed sooner.`;
  }
  return `Cancel your ${plan} plan before deleting your account. Nothing was deleted, and billing continues until you cancel in Settings > Billing. Email ${CONTACT_EMAIL} if you need help.`;
}

interface DeletionScheduleRow {
  deletion_requested_at: string | null;
  deletion_scheduled_for: string | null;
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'account-deletion-status');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    const authResult = await getClerkAuthUser(request);
    userId = authResult.userId;
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: SECURITY_HEADERS });
  }

  const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
  let row: DeletionScheduleRow | undefined;
  try {
    const rows = await db.query<DeletionScheduleRow>(
      `select deletion_requested_at, deletion_scheduled_for from profiles where id = $1`,
      [userId],
    );
    row = rows[0];
  } catch (error) {
    if (!isMissingDeletionColumns(error)) {
      logger.error(
        { userId, error: error instanceof Error ? error.message : String(error) },
        'Could not read account deletion status',
      );
      return NextResponse.json(
        { error: 'Could not read account deletion status.' },
        { status: 500, headers: SECURITY_HEADERS },
      );
    }
  }

  const scheduledFor = row?.deletion_scheduled_for ?? null;
  const pending = scheduledFor !== null;
  const canCancel = pending && new Date(scheduledFor).getTime() > Date.now();

  return NextResponse.json(
    {
      pending,
      canCancel,
      requestedAt: pending ? (row?.deletion_requested_at ?? null) : null,
      scheduledFor,
    },
    { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
  );
}

export async function DELETE(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'user-data-delete');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  let userId: string;
  try {
    const authResult = await getClerkAuthUser(request);
    userId = authResult.userId;
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: SECURITY_HEADERS });
  }

  const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });

  let subscription: SubscriptionInfo | null;
  try {
    subscription = await SubscriptionService.getSubscription(db, userId);
  } catch (err) {
    logger.error({ userId, err }, 'Account deletion halted: subscription lookup failed');
    return NextResponse.json(
      {
        error: `Your billing status could not be verified, so nothing was deleted. Please try again, or contact ${CONTACT_EMAIL} if this persists.`,
      },
      { status: 503, headers: SECURITY_HEADERS },
    );
  }

  if (isPaidSubscription(subscription)) {
    logger.warn(
      { userId, planTier: subscription.plan_tier, status: subscription.status },
      'Account deletion refused while a paid subscription is active',
    );
    return NextResponse.json(
      {
        error: activeSubscriptionMessage(subscription),
        reason: 'active_subscription',
        planTier: subscription.plan_tier,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      },
      { status: 409, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
    );
  }

  const subjectRef = pseudonymizeIdentifier(userId, 'delete-account-subject', 16);

  try {
    try {
      const scheduledRows = await db.execute(
        `update profiles
         set deletion_requested_at = $1,
             deletion_scheduled_for = $2
         where id = $3`,
        [
          new Date().toISOString(),
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          userId,
        ],
      );

      if (scheduledRows === 0) {
        logger.error({ userId }, 'Account deletion matched no profiles row; nothing was scheduled');
        return NextResponse.json(
          {
            error: `Account deletion could not be scheduled because your profile record was not found. Nothing was deleted. Please contact ${CONTACT_EMAIL}.`,
          },
          { status: 500, headers: SECURITY_HEADERS },
        );
      }
    } catch (updateErr: unknown) {
      const updateErrMsg = updateErr instanceof Error ? updateErr.message : String(updateErr);

      if (!isMissingDeletionColumns(updateErr)) {
        logger.error({ userId, error: updateErrMsg }, 'Account deletion scheduling failed');
        return NextResponse.json(
          {
            error: `Account deletion could not be scheduled. Nothing was deleted. Please try again, or contact ${CONTACT_EMAIL} if this persists.`,
          },
          { status: 500, headers: SECURITY_HEADERS },
        );
      }

      logger.warn(
        { userId, error: updateErrMsg },
        'Deletion columns are not provisioned; attempting immediate delete',
      );

      try {
        const erasure = await eraseUserAccountData(userId);
        if (!erasure.complete) {
          logger.error({ userId, erasure }, 'Immediate account erasure was incomplete');
          return NextResponse.json(
            {
              error: `Account deletion did not finish. Some of your data has already been removed and the rest is still stored; your sign-in still works. Please contact ${CONTACT_EMAIL} so the erasure can be completed.`,
            },
            { status: 500, headers: SECURITY_HEADERS },
          );
        }
        const client = await clerkClient();
        await client.users.deleteUser(userId);
      } catch (clerkErr: unknown) {
        const errMsg = clerkErr instanceof Error ? clerkErr.message : String(clerkErr);
        logger.error({ userId, error: errMsg }, 'Account deletion failed');
        return NextResponse.json(
          { error: `Account deletion failed. Please contact ${CONTACT_EMAIL}.` },
          { status: 500, headers: SECURITY_HEADERS },
        );
      }

      logger.info({ userId }, 'Account deleted immediately (soft delete unavailable)');

      await recordAuditEvent({
        userId: null,
        eventType: 'account_deletion_requested',
        severity: 'warning',
        request,
        detail: { resourceType: 'account', subjectRef, status: 'erased_immediately' },
      });

      return NextResponse.json(
        { message: 'Account deleted successfully.' },
        { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
      );
    }

    logger.info({ userId }, 'Account deletion scheduled');

    await recordAuditEvent({
      userId: null,
      eventType: 'account_deletion_requested',
      severity: 'warning',
      request,
      detail: { resourceType: 'account', subjectRef, status: 'scheduled' },
    });

    return NextResponse.json(
      {
        message: `Account deletion scheduled. Your account and all data will be permanently deleted within 24 hours. Sign back in and cancel from Settings > Account any time before then to keep your account.`,
        scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
    );
  } catch (err) {
    logger.error({ userId, err }, 'Unexpected error during account deletion');
    return NextResponse.json(
      { error: `An unexpected error occurred. Please contact ${CONTACT_EMAIL}.` },
      { status: 500, headers: SECURITY_HEADERS },
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
