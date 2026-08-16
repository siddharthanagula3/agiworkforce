import type { SubscriptionSource } from './cloudAccountTypes';

const TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  'none',
  'canceled',
  'cancelled',
  'expired',
  'incomplete_expired',
]);

export interface DesktopSubscriptionOwnerPolicy {
  source: SubscriptionSource;
  sourceLabel: string;
  description: string;
  canOpenStripePortal: boolean;
  canStartStripePlanChange: boolean;
  stripeActionBlockedReason: string | null;
}

function isTerminalSubscriptionStatus(status: string): boolean {
  return TERMINAL_SUBSCRIPTION_STATUSES.has(status.trim().toLowerCase());
}

export function getDesktopSubscriptionOwnerPolicy(
  source: SubscriptionSource,
  status: string,
  ownershipVerified: boolean,
): DesktopSubscriptionOwnerPolicy {
  if (!ownershipVerified) {
    return {
      source,
      sourceLabel: 'Not verified',
      description:
        'Billing ownership could not be verified. Refresh your account before changing plans.',
      canOpenStripePortal: false,
      canStartStripePlanChange: false,
      stripeActionBlockedReason:
        'Billing ownership could not be verified. Refresh your account before changing plans.',
    };
  }

  const terminal = isTerminalSubscriptionStatus(status);
  switch (source) {
    case 'stripe':
      return {
        source,
        sourceLabel: 'AGI Workforce on the web',
        description: 'This subscription is managed securely through Stripe.',
        canOpenStripePortal: true,
        canStartStripePlanChange: true,
        stripeActionBlockedReason: null,
      };
    case 'apple':
      return {
        source,
        sourceLabel: 'Apple',
        description: terminal
          ? 'Your Apple-managed subscription has ended. You can start a new web subscription.'
          : 'This subscription is managed by Apple. Change or cancel it where it was purchased.',
        canOpenStripePortal: false,
        canStartStripePlanChange: terminal,
        stripeActionBlockedReason: terminal
          ? null
          : 'This subscription is managed by Apple. Change it where it was purchased.',
      };
    case 'google':
      return {
        source,
        sourceLabel: 'Google Play',
        description: terminal
          ? 'Your Google Play-managed subscription has ended. You can start a new web subscription.'
          : 'This subscription is managed by Google Play. Change or cancel it where it was purchased.',
        canOpenStripePortal: false,
        canStartStripePlanChange: terminal,
        stripeActionBlockedReason: terminal
          ? null
          : 'This subscription is managed by Google Play. Change it where it was purchased.',
      };
    case 'manual':
      return {
        source,
        sourceLabel: 'Your organization',
        description: terminal
          ? 'Your organization-managed subscription has ended. You can start a new web subscription.'
          : 'This subscription is managed by your organization. Contact an administrator to change it.',
        canOpenStripePortal: false,
        canStartStripePlanChange: terminal,
        stripeActionBlockedReason: terminal
          ? null
          : 'This subscription is managed by your organization. Contact an administrator to change it.',
      };
    case 'none':
      return {
        source,
        sourceLabel: 'No billing provider',
        description: terminal
          ? 'No paid subscription is active. You can compare plans at any time.'
          : 'The active subscription has no verified billing owner. Refresh your account before changing plans.',
        canOpenStripePortal: false,
        canStartStripePlanChange: terminal,
        stripeActionBlockedReason: terminal
          ? null
          : 'Your subscription record is still active but has no verified billing owner. Refresh your account before changing plans.',
      };
    case 'unknown':
      return {
        source,
        sourceLabel: 'Another platform',
        description: terminal
          ? 'No active billing owner was reported. You can start a new web subscription.'
          : 'This subscription is managed on another platform. Change it where it was purchased.',
        canOpenStripePortal: false,
        canStartStripePlanChange: terminal,
        stripeActionBlockedReason: terminal
          ? null
          : 'This subscription is managed on another platform. Change it where it was purchased.',
      };
  }
}
