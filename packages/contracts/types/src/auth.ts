/**
 * Unified Auth Types
 *
 * Shared authentication types for the AGI Workforce platform.
 * Used across desktop, web, Chrome extension, VS Code extension, and mobile.
 *
 * @module auth
 * @packageDocumentation
 */

export interface AuthUser {
  id: string;

  email: string;

  name?: string;

  avatar?: string;

  role?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  credits?: number;
}

export interface AuthSession {
  accessToken: string;

  refreshToken: string;

  user: AuthUser;

  expiresAt: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface DeviceAuthorizationStartResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  interval: number;
  expires_in: number;
}

export type AccountAuthState =
  | { status: 'signed-out' }
  | { status: 'signed-in'; expiresAt?: number }
  | { status: 'expired' };

export interface SubscriptionInfo {
  plan_tier: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  current_period_end?: string;
}

export interface DesktopAuthTokenPayload {
  session: AuthSession;

  issuedAt: number;

  expiresAt: number;

  nonce: string;
}

export interface AuthSessionRequest {
  type: 'GET_AUTH_SESSION';
  timestamp: number;
}

export interface AuthSessionResponse {
  type: 'AUTH_SESSION';
  success: boolean;
  session?: AuthSession;
  error?: string;
}

export interface BridgeMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface BridgeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export type BridgeConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export type BridgeStatus = BridgeConnectionStatus;
