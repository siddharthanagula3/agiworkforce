import 'server-only';

import { z } from 'zod';
import { AccountDeletionScheduleTimestampSchema } from '@agiworkforce/cloud-contracts';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
import { getClerkAuthUser } from '@/lib/api-auth';
import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import {
  resolveDeletionStatus,
  scheduledDeletionProgress,
  type DeletionOutcome,
} from '@/lib/services/deletion-manifest';
import { recordAuditEvent } from '@/lib/security-audit';
import { pseudonymizeIdentifier } from '@/lib/server/pseudonymize';
import { CONTACT_EMAIL } from '@/lib/legal-constants';
import { SubscriptionService, type SubscriptionInfo } from '@/lib/services/subscription-service';
import {
  hasLiveBillingRelationship,
  subscriptionAccessRank,
} from '@/lib/services/subscription-access-policy';
import {
  BILLING_PLAN_PRICING,
  isBillingPlanTier,
  isFreeBillingPlanTier,
} from '@agiworkforce/types';
import { handleError } from '@/lib/error-handler';
import { isStepUpRequiredError, requireStepUp } from '@/lib/server/step-up-auth';
import { resolveSubscriptionBillingSource } from '@/lib/server/subscription-billing-owner';
import { isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';
import {
  reversePlanRenewalStop,
  stopPlanRenewalForAccountDeletion,
} from '@/lib/server/account-deletion-plan-renewal';
import type { AccountDeletionRenewalStop } from '@/lib/server/payments/stripe-provider';
import {
  STORE_BILLING_NAME,
  STORE_SUBSCRIPTION_MANAGEMENT_URL,
  isStoreBillingSource,
  type StoreBillingSource,
} from '@/lib/billing/store-subscription-management';

/**
 * What the account holder is told. The audit row keeps the full reason; a count
 * of legal holds or of internal stores is not theirs to read, and whether a hold
 * may be disclosed at all is a legal question this route must not answer.
 */
function deletionReceiptReason(outcome: DeletionOutcome): string {
  switch (outcome.status) {
    case 'pending':
      return outcome.reason;
    case 'partial':
      return 'Deletion has started and is not finished. It is retried automatically until everything is gone.';
    case 'blocked':
      return `Some of your data has to be kept for a legal reason, so nothing was deleted. Write to ${CONTACT_EMAIL} to find out more.`;
    case 'complete':
      return 'Everything in your account has been deleted.';
  }
}

export const runtime = 'nodejs';

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'",
  'X-Content-Type-Options': 'nosniff',
};

type DeletionPlan =
  | { kind: 'ending'; subscription: SubscriptionInfo }
  | { kind: 'renewal_stopped'; subscription: SubscriptionInfo; subscriptionId: string }
  | { kind: 'store_billed'; subscription: SubscriptionInfo; store: StoreBillingSource };

function scheduledDeletionResponse(
  request: NextRequest,
  scheduledFor: string,
  alreadyScheduled = false,
  plan: DeletionPlan | null = null,
): NextResponse {
  const outcome = resolveDeletionStatus(scheduledDeletionProgress(scheduledFor));
  const planNotice = plan ? ` ${deletionPlanNotice(plan)}` : '';
  return NextResponse.json(
    {
      message: `Account deletion ${alreadyScheduled ? 'is already scheduled' : 'scheduled'}. Cancellation deadline: ${scheduledFor}. Sign back in and cancel from Settings > Account before this deadline to keep your account. Erasure is processed after the deadline and may take longer.${planNotice}`,
      scheduledFor,
      status: outcome.status,
      statusReason: deletionReceiptReason(outcome),
      ...(plan?.kind === 'store_billed'
        ? {
            storeBilling: {
              store: plan.store,
              manageUrl: STORE_SUBSCRIPTION_MANAGEMENT_URL[plan.store],
            },
          }
        : {}),
    },
    { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
  );
}

function isPaidSubscription(
  subscription: SubscriptionInfo | null,
): subscription is SubscriptionInfo {
  if (!subscription) return false;
  const planTier = (subscription.plan_tier || 'free').trim().toLowerCase();
  if (isFreeBillingPlanTier(planTier)) return false;
  return hasLiveBillingRelationship(subscription.status);
}

/**
 * A plan already set to end with nothing left to collect cannot charge again,
 * so deleting gives up only its remaining paid time. Erasure ends it through
 * the same Stripe cancellation every due deletion runs before any row goes.
 */
function isEndingPaidPlan(subscription: SubscriptionInfo): boolean {
  return (
    subscription.cancel_at_period_end === true && subscriptionAccessRank(subscription.status) === 2
  );
}

function planLabel(subscription: SubscriptionInfo): string {
  const tier = subscription.plan_tier.trim().toLowerCase();
  return isBillingPlanTier(tier) ? BILLING_PLAN_PRICING[tier].label : subscription.plan_tier;
}

function deletionPlanNotice(plan: DeletionPlan): string {
  const label = planLabel(plan.subscription);
  switch (plan.kind) {
    case 'ending':
      return `Your ${label} plan, already cancelled, ends when erasure runs instead of on ${periodEndLabel(plan.subscription)}. Deleting does not refund the unused time, and you will not be charged again.`;
    case 'renewal_stopped':
      return `Your ${label} plan no longer renews and ends when erasure runs instead of on ${periodEndLabel(plan.subscription)}. Deleting does not refund the unused time, and you will not be charged again. Cancelling the deletion turns renewal back on.`;
    case 'store_billed':
      return `Your ${label} plan is billed by ${STORE_BILLING_NAME[plan.store]}, and deleting your account does not cancel it. ${STORE_BILLING_NAME[plan.store]} keeps charging you until you cancel it there: ${STORE_SUBSCRIPTION_MANAGEMENT_URL[plan.store]}`;
  }
}

function periodEndLabel(subscription: SubscriptionInfo): string {
  const end = subscription.current_period_end;
  return end instanceof Date && !Number.isNaN(end.getTime())
    ? end.toISOString().slice(0, 10)
    : 'the end of the current billing period';
}

interface SoleOwnedWorkspace {
  id: string;
  name: string | null;
}

/**
 * Workspaces this account is the ONLY owner of.
 *
 * Read through the privileged connection on purpose: `organization_members`
 * allows a user to see their own membership row and nothing else, so a scoped
 * read can say "I am an owner" but can never say whether anyone else is. The
 * question here is about the other rows.
 *
 * A workspace already scheduled for deletion is not counted: the owner has
 * already done the thing this guard would ask them to do, and both schedules
 * run down to their own purge.
 */
const SOLE_OWNED_WORKSPACES_SQL = `select o.id::text as id, o.name
       from public.organization_members mine
       join public.organizations o on o.id = mine.organization_id
      where mine.user_id = $1
        and mine.role = 'owner'
        and o.deletion_scheduled_for is null
        and not exists (
          select 1
            from public.organization_members others
           where others.organization_id = mine.organization_id
             and others.role = 'owner'
             and others.user_id <> $1
        )`;

async function listSoleOwnedWorkspaces(userId: string): Promise<SoleOwnedWorkspace[]> {
  return getNeonDb().query<SoleOwnedWorkspace>(SOLE_OWNED_WORKSPACES_SQL, [userId]);
}

function soleOwnerMessage(workspaces: SoleOwnedWorkspace[]): string {
  const named = workspaces
    .map((workspace) => workspace.name?.trim())
    .filter((name): name is string => Boolean(name));
  const subject =
    named.length > 0
      ? named.length === 1
        ? `the workspace ${named[0]}`
        : `these workspaces: ${named.join(', ')}`
      : workspaces.length === 1
        ? 'a workspace'
        : `${workspaces.length} workspaces`;
  return `You are the only owner of ${subject}. Nothing was deleted. Make someone else an owner in Settings > Organization, or delete the workspace there first, then delete your account.`;
}

type PlanAdmission =
  | { kind: 'none' }
  | { kind: 'plan'; plan: DeletionPlan }
  | { kind: 'stop_web_renewal'; subscription: SubscriptionInfo; subscriptionId: string }
  | { kind: 'refused'; subscription: SubscriptionInfo; message: string };

function admitPlan(subscription: SubscriptionInfo | null): PlanAdmission {
  if (!isPaidSubscription(subscription)) return { kind: 'none' };
  const plan = planLabel(subscription);
  if (subscriptionAccessRank(subscription.status) !== 2) {
    return {
      kind: 'refused',
      subscription,
      message: `A payment for your ${plan} plan is still being collected, so nothing was deleted. Delete your account once it is settled, or email ${CONTACT_EMAIL} for help.`,
    };
  }
  if (isEndingPaidPlan(subscription))
    return { kind: 'plan', plan: { kind: 'ending', subscription } };
  const source = resolveSubscriptionBillingSource(subscription);
  if (isStoreBillingSource(source)) {
    return { kind: 'plan', plan: { kind: 'store_billed', subscription, store: source } };
  }
  if (source === 'stripe' && isStripeSubscriptionId(subscription.stripe_subscription_id)) {
    return {
      kind: 'stop_web_renewal',
      subscription,
      subscriptionId: subscription.stripe_subscription_id,
    };
  }
  return {
    kind: 'refused',
    subscription,
    message: `Your ${plan} plan could not be matched to a purchase we can cancel, so nothing was deleted. Email ${CONTACT_EMAIL} to end it, then delete your account.`,
  };
}

function renewalStopPlan(
  stop: AccountDeletionRenewalStop,
  subscription: SubscriptionInfo,
  subscriptionId: string,
): DeletionPlan | null {
  switch (stop.outcome) {
    case 'stopped':
      return { kind: 'renewal_stopped', subscription, subscriptionId };
    case 'not_renewing':
      return { kind: 'ending', subscription };
    case 'ended':
    case 'scheduled_change':
      return null;
  }
}

function activeSubscriptionRefusal(
  request: NextRequest,
  subscription: SubscriptionInfo,
  message: string,
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      reason: 'active_subscription',
      planTier: subscription.plan_tier,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    },
    { status: 409, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
  );
}

const DeletionScheduleRowsSchema = z
  .array(
    z.object({
      deletion_requested_at: AccountDeletionScheduleTimestampSchema.nullable(),
      deletion_scheduled_for: AccountDeletionScheduleTimestampSchema.nullable(),
      can_cancel: z.boolean(),
    }),
  )
  .max(1);

type DeletionScheduleRow = z.infer<typeof DeletionScheduleRowsSchema>[number];

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'account-deletion-status');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    const authResult = await getClerkAuthUser(request);
    userId = authResult.userId;
  } catch (authError) {
    if (isAuthGateRefusal(authError)) {
      return unauthorizedResponseFor(authError);
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: SECURITY_HEADERS });
  }

  const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
  let row: DeletionScheduleRow | undefined;
  try {
    const rows = await db.query<DeletionScheduleRow>(
      `select case when deletion_requested_at is null then null
                   when deletion_requested_at >= '0001-01-01T00:00:00Z'::timestamptz
                    and deletion_requested_at < '10000-01-01T00:00:00Z'::timestamptz
                   then to_char(deletion_requested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                   else 'unsupported' end as deletion_requested_at,
              case when deletion_scheduled_for is null then null
                   when deletion_scheduled_for >= '0001-01-01T00:00:00Z'::timestamptz
                    and deletion_scheduled_for < '10000-01-01T00:00:00Z'::timestamptz
                   then to_char(deletion_scheduled_for at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                   else 'unsupported' end as deletion_scheduled_for,
              coalesce(deletion_scheduled_for > clock_timestamp(), false) as can_cancel
         from profiles where id = $1`,
      [userId],
    );
    row = DeletionScheduleRowsSchema.parse(rows)[0];
  } catch (error) {
    logger.error(
      { userId, error: error instanceof Error ? error.message : String(error) },
      'Could not read account deletion status',
    );
    return NextResponse.json(
      { error: 'Could not read account deletion status.' },
      { status: 500, headers: SECURITY_HEADERS },
    );
  }

  const scheduledFor = row?.deletion_scheduled_for ?? null;
  const pending = scheduledFor !== null;
  const canCancel = pending && row?.can_cancel === true;
  // The same outcome the audit row carries: what the deletion has reached is
  // the one question a receipt answers.
  const outcome = resolveDeletionStatus(scheduledDeletionProgress(scheduledFor));

  return NextResponse.json(
    {
      ...(pending ? { cancellationPrecondition: 'schedule-pair-v1' } : {}),
      pending,
      canCancel,
      requestedAt: pending ? (row?.deletion_requested_at ?? null) : null,
      scheduledFor,
      status: outcome.status,
      statusReason: deletionReceiptReason(outcome),
    },
    { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
  );
}

async function handleDelete(request: NextRequest) {
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
    if (isAuthGateRefusal(authError)) {
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

  const admission = admitPlan(subscription);

  if (admission.kind === 'refused') {
    logger.warn(
      {
        userId,
        planTier: admission.subscription.plan_tier,
        status: admission.subscription.status,
      },
      'Account deletion refused while a paid subscription is active',
    );
    return activeSubscriptionRefusal(request, admission.subscription, admission.message);
  }

  let soleOwned: SoleOwnedWorkspace[];
  try {
    soleOwned = await listSoleOwnedWorkspaces(userId);
  } catch (err) {
    logger.error({ userId, err }, 'Account deletion halted: workspace ownership lookup failed');
    return NextResponse.json(
      {
        error: `Your workspace ownership could not be verified, so nothing was deleted. Please try again, or contact ${CONTACT_EMAIL} if this persists.`,
      },
      { status: 503, headers: SECURITY_HEADERS },
    );
  }

  if (soleOwned.length > 0) {
    logger.warn(
      { userId, workspaceCount: soleOwned.length },
      'Account deletion refused while the account is the sole owner of a workspace',
    );
    return NextResponse.json(
      {
        error: soleOwnerMessage(soleOwned),
        reason: 'sole_organization_owner',
        workspaces: soleOwned.map((workspace) => ({ id: workspace.id, name: workspace.name })),
      },
      { status: 409, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
    );
  }

  try {
    await requireStepUp({
      userId,
      action: 'account.delete',
      request,
      endpoint: '/api/user/delete-account',
    });
  } catch (error) {
    if (!isStepUpRequiredError(error)) throw error;
    const refusal = handleError(error);
    for (const [name, value] of Object.entries({
      ...getCorsHeaders(request),
      ...SECURITY_HEADERS,
    })) {
      refusal.headers.set(name, value);
    }
    return refusal;
  }

  const subjectRef = pseudonymizeIdentifier(userId, 'delete-account-subject', 16);
  const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  let plan: DeletionPlan | null = admission.kind === 'plan' ? admission.plan : null;
  if (admission.kind === 'stop_web_renewal') {
    let stop: AccountDeletionRenewalStop;
    try {
      stop = await stopPlanRenewalForAccountDeletion(
        db,
        userId,
        admission.subscriptionId,
        scheduledFor,
      );
    } catch (err) {
      logger.error({ userId, err }, 'Account deletion halted: plan renewal could not be stopped');
      return NextResponse.json(
        {
          error: `Your plan's renewal could not be stopped, so nothing was deleted. Please try again, or contact ${CONTACT_EMAIL} if this persists.`,
        },
        { status: 503, headers: SECURITY_HEADERS },
      );
    }
    if (stop.outcome === 'scheduled_change') {
      logger.warn({ userId }, 'Account deletion refused while a plan change is scheduled');
      return activeSubscriptionRefusal(
        request,
        admission.subscription,
        `Your ${planLabel(admission.subscription)} plan has a scheduled change, so nothing was deleted. Keep your current plan in Settings > Billing, then delete your account.`,
      );
    }
    plan = renewalStopPlan(stop, admission.subscription, admission.subscriptionId);
  }

  const reverseRenewalStop = async () => {
    if (plan?.kind !== 'renewal_stopped') return;
    await reversePlanRenewalStop(db, userId, plan.subscriptionId, scheduledFor);
    plan = null;
  };

  let scheduled = false;
  try {
    let scheduledRows: number;
    try {
      scheduledRows = await db.execute(
        `update profiles
         set deletion_requested_at = $1,
             deletion_scheduled_for = $2
         where id = $3
           and deletion_scheduled_for is null`,
        [new Date().toISOString(), scheduledFor, userId],
      );
    } catch (updateErr: unknown) {
      logger.error(
        { userId, error: updateErr instanceof Error ? updateErr.message : String(updateErr) },
        'Account deletion scheduling failed',
      );
      await reverseRenewalStop();
      return NextResponse.json(
        {
          error: `Account deletion could not be scheduled. Nothing was deleted. Please try again, or contact ${CONTACT_EMAIL} if this persists.`,
        },
        { status: 500, headers: SECURITY_HEADERS },
      );
    }
    if (scheduledRows === 0) {
      await reverseRenewalStop();
      const [existing] = await db.query<{ deletion_scheduled_for: string | Date | null }>(
        `select deletion_scheduled_for from profiles where id = $1`,
        [userId],
      );
      if (existing) {
        const existingDeadline = existing.deletion_scheduled_for;
        if (existingDeadline !== null) {
          const deadlineMs =
            existingDeadline instanceof Date
              ? existingDeadline.getTime()
              : Date.parse(existingDeadline);
          if (Number.isFinite(deadlineMs) && deadlineMs > Date.now()) {
            return scheduledDeletionResponse(
              request,
              existingDeadline instanceof Date ? existingDeadline.toISOString() : existingDeadline,
              true,
              plan,
            );
          }
          return NextResponse.json(
            {
              error: Number.isFinite(deadlineMs)
                ? 'Account deletion is already scheduled and its cancellation window has closed. The schedule was not changed. This does not confirm that erasure is complete.'
                : 'The existing account deletion schedule could not be verified. The schedule was not changed.',
            },
            { status: 409, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
          );
        }
        return NextResponse.json(
          { error: 'Account deletion state changed. Refresh before trying again.' },
          { status: 409, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
        );
      }
      logger.error({ userId }, 'Account deletion matched no profiles row; nothing was scheduled');
      return NextResponse.json(
        {
          error: `Account deletion could not be scheduled because your profile record was not found. Nothing was deleted. Please contact ${CONTACT_EMAIL}.`,
        },
        { status: 500, headers: SECURITY_HEADERS },
      );
    }

    scheduled = true;
    logger.info({ userId, plan: plan?.kind ?? 'none' }, 'Account deletion scheduled');

    const scheduledOutcome = resolveDeletionStatus(scheduledDeletionProgress(scheduledFor));
    await recordAuditEvent({
      userId: null,
      eventType: 'account_deletion_requested',
      severity: 'warning',
      request,
      detail: {
        resourceType: 'account',
        subjectRef,
        status: scheduledOutcome.status,
        reason: scheduledOutcome.reason,
      },
    });

    return scheduledDeletionResponse(request, scheduledFor, false, plan);
  } catch (err) {
    logger.error({ userId, err }, 'Unexpected error during account deletion');
    if (!scheduled) await reverseRenewalStop();
    return NextResponse.json(
      { error: `An unexpected error occurred. Please contact ${CONTACT_EMAIL}.` },
      { status: 500, headers: SECURITY_HEADERS },
    );
  }
}

export const GET = withPrivateNoStore(handleGet);
export const DELETE = withPrivateNoStore(handleDelete);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
