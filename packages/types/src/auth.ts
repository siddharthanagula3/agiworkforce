/**
 * Authentication types for sessions, tokens, and bridge messages.
 */

/** OAuth/JWT token response */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/** Authenticated user profile */
export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  credits?: number;
}

/** Subscription information */
export interface SubscriptionInfo {
  plan_tier: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  current_period_end?: string;
}

/** Bridge message for extension/desktop communication */
export interface BridgeMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

/** Bridge response wrapper */
export interface BridgeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Connection status for bridge/extension */
export type BridgeStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';
