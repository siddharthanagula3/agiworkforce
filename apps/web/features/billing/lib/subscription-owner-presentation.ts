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
