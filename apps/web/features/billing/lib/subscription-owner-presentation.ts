import type { MeBillingOwner, MeSubscriptionSource } from '@agiworkforce/cloud-contracts';
import { COMPANY_SITE_NAME } from '@agiworkforce/types';

export interface VisibleBillingOwnership {
  subscription_source?: MeSubscriptionSource;
  billing_owner?: MeBillingOwner;
}

export const PERSONAL_GRANT_PLAN_SENTENCE = `This plan was set up for your account by ${COMPANY_SITE_NAME}.`;

export const PERSONAL_GRANT_SUPPORT_PATH = '/support';

export function isPersonalGrantPlan(
  ownership: VisibleBillingOwnership | null | undefined,
): boolean {
  return ownership?.subscription_source === 'manual' && ownership.billing_owner === 'personal';
}

export type PlanPeriodEndKind = 'renews' | 'trial' | 'ends' | 'period';

export interface PlanPeriodEndSubject extends VisibleBillingOwnership {
  status?: string | null;
  cancel_at_period_end?: boolean;
}

const RENEWING_BILLING_SOURCES: ReadonlySet<MeSubscriptionSource> = new Set([
  'stripe',
  'apple',
  'google',
]);

/**
 * A plan granted without a purchase carries a period end that nothing
 * enforces, so it gets no renewal or end date unless it is set to end.
 */
export function planPeriodEndKind(
  subject: PlanPeriodEndSubject | null | undefined,
  options: { endingSoon?: boolean } = {},
): PlanPeriodEndKind | null {
  if (!subject) return null;
  const status = (subject.status ?? '').trim().toLowerCase();
  const endingSoon = options.endingSoon ?? subject.cancel_at_period_end === true;
  const source = subject.subscription_source;
  if (source === 'manual') {
    if (endingSoon) return 'ends';
    return status === 'trialing' ? 'trial' : null;
  }
  if (endingSoon || status === 'canceled' || status === 'cancelled') return 'ends';
  if (status === 'trialing') return 'trial';
  if (status === 'active' && source !== undefined && RENEWING_BILLING_SOURCES.has(source)) {
    return 'renews';
  }
  return 'period';
}

export function billingOwnerPlanChangeMessage(
  ownership: VisibleBillingOwnership | null | undefined,
): string {
  switch (ownership?.subscription_source) {
    case 'apple':
      return 'Change or cancel this subscription with Apple before starting web billing.';
    case 'google':
      return 'Change or cancel this subscription with Google Play before starting web billing.';
    case 'manual':
      return isPersonalGrantPlan(ownership)
        ? `${PERSONAL_GRANT_PLAN_SENTENCE} Contact support to change it.`
        : 'This plan is managed by your organization. Contact an administrator to change it.';
    case 'stripe':
      return 'Resolve the current billing status in Manage billing before changing plans.';
    case 'none':
    default:
      return 'Billing ownership is not verified. Open Billing and refresh your account before changing plans.';
  }
}

export function billingOwnerPlanActionLabel(
  ownership: VisibleBillingOwnership | null | undefined,
): string {
  switch (ownership?.subscription_source) {
    case 'apple':
      return 'Manage with Apple';
    case 'google':
      return 'Manage with Google Play';
    case 'manual':
      return isPersonalGrantPlan(ownership) ? 'Contact support' : 'Contact administrator';
    default:
      return 'Review billing';
  }
}

export function billingOwnerPlanActionHref(
  ownership: VisibleBillingOwnership | null | undefined,
): string {
  return isPersonalGrantPlan(ownership) ? PERSONAL_GRANT_SUPPORT_PATH : '/settings/billing';
}
