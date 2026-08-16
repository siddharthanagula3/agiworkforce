import type { MeSubscriptionSource } from '@agiworkforce/cloud-contracts';

export type VisibleSubscriptionSource = MeSubscriptionSource | undefined;

export function billingOwnerPlanChangeMessage(source: VisibleSubscriptionSource): string {
  switch (source) {
    case 'apple':
      return 'Change or cancel this subscription with Apple before starting web billing.';
    case 'google':
      return 'Change or cancel this subscription with Google Play before starting web billing.';
    case 'manual':
      return 'This plan is managed by your organization. Contact an administrator to change it.';
    case 'stripe':
      return 'Resolve the current billing status in Manage billing before changing plans.';
    case 'none':
    default:
      return 'Billing ownership is not verified. Open Billing and refresh your account before changing plans.';
  }
}
export function billingOwnerPlanActionLabel(source: VisibleSubscriptionSource): string {
  switch (source) {
    case 'apple':
      return 'Manage with Apple';
    case 'google':
      return 'Manage with Google Play';
    case 'manual':
      return 'Contact administrator';
    default:
      return 'Review billing';
  }
}
