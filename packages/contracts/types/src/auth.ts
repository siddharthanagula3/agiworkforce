/**
 * Unified Auth Types
 *
 * Shared authentication types for the AGI Workforce platform.
 * Used across desktop, web, Chrome extension, VS Code extension, and mobile.
 *
 * @module auth
 * @packageDocumentation
 */

export type AccountAuthState =
  { status: 'signed-out' } | { status: 'signed-in'; expiresAt?: number } | { status: 'expired' };

export interface SubscriptionInfo {
  plan_tier: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  current_period_end?: string;
}
