import type { ApiPaywallError, ApiPaywallRecoveryAction } from '@/services/api';

export type PaywallRecoveryAction = ApiPaywallRecoveryAction;

export interface PaywallErrorState {
  feature: string;
  requiredTier: string;
  reason: string;
  code: string | null;
  recoveryAction: ApiPaywallRecoveryAction;
}

export function paywallErrorStateFromApiError(error: ApiPaywallError): PaywallErrorState {
  return {
    feature: error.feature,
    requiredTier: error.requiredTier,
    reason: error.reason,
    code: error.code,
    recoveryAction: error.recoveryAction,
  };
}

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
