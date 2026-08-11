import type { ApiPaywallError, ApiPaywallRecoveryAction } from '@/services/api';

export type PaywallRecoveryAction = ApiPaywallRecoveryAction;

/** Presentation state retained after an API refusal reaches the chat UI. */
export interface PaywallErrorState {
  feature: string;
  requiredTier: string;
  reason: string;
  code: string | null;
  recoveryAction: ApiPaywallRecoveryAction;
}

/**
 * Preserve the server refusal's recovery semantics at every chat entry point.
 * Keeping this mapping pure and shared prevents image/video/new/existing-chat
 * callbacks from silently dropping `subscription_inactive` into an upgrade UI.
 */
export function paywallErrorStateFromApiError(error: ApiPaywallError): PaywallErrorState {
  return {
    feature: error.feature,
    requiredTier: error.requiredTier,
    reason: error.reason,
    code: error.code,
    recoveryAction: error.recoveryAction,
  };
}

/**
 * Message persisted into a failed agent activity for the same refusal.
 * Prefer the bounded server explanation; the fallback must describe the real
 * recovery instead of telling an inactive subscriber to upgrade.
 */
export function paywallActivityErrorFromApiError(error: ApiPaywallError): string {
  const reason = error.reason.trim();
  if (reason) return reason;
  switch (error.recoveryAction) {
    case 'manage_billing':
      return 'Your subscription is inactive. Update billing to continue.';
    case 'subscribe':
      return 'An active subscription is required to continue.';
    case 'upgrade':
      return 'This feature is unavailable on your current plan.';
  }
}
