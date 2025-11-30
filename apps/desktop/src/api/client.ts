/**
 * API Client Interfaces for AGI Workforce Web Backend
 *
 * This file defines the TypeScript interfaces for communication with the
 * AGI Workforce web backend. These are placeholders for future implementation.
 *
 * The actual HTTP calls will be made from Rust (Tauri commands) for better
 * security and to avoid CORS issues.
 *
 * See: docs/ACCOUNT_INTEGRATION.md for implementation details
 */

import type { PlanTier, SubscriptionStatus } from '../stores/accountStore';

// ============================================================================
// Configuration
// ============================================================================

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.agiworkforce.com';

export const API_ENDPOINTS = {
  // Authentication
  deviceLink: '/api/device/link',
  devicePoll: '/api/device/poll',
  oauthToken: '/oauth/token',
  oauthRevoke: '/oauth/revoke',
  refreshToken: '/oauth/refresh',

  // User Profile
  me: '/api/me',
  updateProfile: '/api/me',

  // Plans & Subscription
  plans: '/api/plans',
  subscription: '/api/subscription',
  subscriptions: '/api/subscriptions',

  // Billing
  invoices: '/api/invoices',
  usage: '/api/usage',
  currentBill: '/api/billing/current',

  // Features
  featureFlags: '/api/features',
} as const;

// ============================================================================
// Request/Response Types
// ============================================================================

// --- Authentication ---

export interface DeviceLinkRequest {
  device_name?: string;
  device_type?: 'desktop' | 'mobile' | 'web';
}

export interface DeviceLinkResponse {
  link_code: string; // e.g., "ABC-123"
  device_id: string; // UUID
  expires_at: number; // Unix timestamp
  qr_code_url?: string; // URL to QR code image
  verify_url: string; // URL for user to visit
}

export interface DevicePollRequest {
  device_id: string;
}

export interface DevicePollResponse {
  status: 'pending' | 'approved' | 'denied' | 'expired';
  access_token?: string;
  refresh_token?: string;
  user?: UserProfile;
}

export interface OAuthTokenRequest {
  grant_type: 'authorization_code' | 'refresh_token';
  code?: string;
  refresh_token?: string;
  client_id: string;
  redirect_uri?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number; // seconds
  scope?: string;
}

// --- User Profile ---

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: number;
  updated_at: number;
  plan: {
    tier: PlanTier;
    display_name: string;
    status: SubscriptionStatus;
    current_period_end: number | null;
  };
  feature_flags: Record<string, boolean>;
}

export interface UpdateProfileRequest {
  name?: string;
  avatar_url?: string;
}

// --- Plans & Subscription ---

export interface PricingPlan {
  id: string;
  tier: PlanTier;
  name: string;
  display_name: string;
  description: string;
  price_monthly_usd: number;
  price_annual_usd: number;
  features: string[];
  limits: {
    automations: number | null; // null = unlimited
    api_calls: number | null;
    storage_gb: number | null;
    team_members: number | null;
  };
  is_popular?: boolean;
  is_available: boolean;
}

export interface CreateSubscriptionRequest {
  plan_id: string;
  payment_method_id?: string; // Stripe payment method ID
  billing_period: 'monthly' | 'annual';
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at?: number | null;
  trial_end?: number | null;
  stripe_subscription_id?: string;
}

export interface UpdateSubscriptionRequest {
  plan_id?: string; // Change plan
  cancel_at_period_end?: boolean; // Cancel subscription
}

// --- Billing ---

export interface Invoice {
  id: string;
  invoice_number: string;
  user_id: string;
  subscription_id: string;
  period_start: number;
  period_end: number;
  subtotal_usd: number;
  tax_usd: number;
  total_usd: number;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  due_date: number;
  paid_at?: number | null;
  hosted_invoice_url?: string; // Stripe hosted invoice URL
  invoice_pdf_url?: string;
}

export interface UsageSummary {
  period_start: number;
  period_end: number;
  automations_executed: number;
  api_calls_made: number;
  storage_used_gb: number;
  limits: {
    automations: number | null;
    api_calls: number | null;
    storage_gb: number | null;
  };
  percentage_used: {
    automations: number;
    api_calls: number;
    storage: number;
  };
}

export interface CurrentBill {
  period_start: number;
  period_end: number;
  base_charge_usd: number;
  usage_charge_usd: number;
  total_usd: number;
  next_billing_date: number;
}

// ============================================================================
// API Client Interface (for Tauri commands to implement)
// ============================================================================

/**
 * This interface defines the shape of API calls that will be implemented
 * as Tauri commands in Rust. The frontend will call these using `invoke()`.
 *
 * Example implementation in Rust:
 *
 * ```rust
 * #[tauri::command]
 * async fn device_link_initiate(
 *   request: DeviceLinkRequest
 * ) -> Result<DeviceLinkResponse, String> {
 *   // Make HTTP request to API_BASE_URL + /api/device/link
 *   // Return response
 * }
 * ```
 *
 * Example usage in frontend:
 *
 * ```typescript
 * const response = await invoke<DeviceLinkResponse>(
 *   'device_link_initiate',
 *   { request: { device_name: 'My Desktop' } }
 * );
 * ```
 */
export interface TauriAPIClient {
  // Authentication
  deviceLinkInitiate(request: DeviceLinkRequest): Promise<DeviceLinkResponse>;
  deviceLinkPoll(request: DevicePollRequest): Promise<DevicePollResponse>;
  oauthExchange(request: OAuthTokenRequest): Promise<OAuthTokenResponse>;
  oauthRefresh(refreshToken: string): Promise<OAuthTokenResponse>;
  oauthRevoke(token: string): Promise<void>;

  // User Profile
  fetchUserProfile(accessToken: string): Promise<UserProfile>;
  updateUserProfile(accessToken: string, updates: UpdateProfileRequest): Promise<UserProfile>;

  // Plans
  fetchPlans(): Promise<PricingPlan[]>;

  // Subscription
  fetchSubscription(accessToken: string): Promise<Subscription>;
  createSubscription(
    accessToken: string,
    request: CreateSubscriptionRequest,
  ): Promise<Subscription>;
  updateSubscription(
    accessToken: string,
    subscriptionId: string,
    request: UpdateSubscriptionRequest,
  ): Promise<Subscription>;
  cancelSubscription(accessToken: string, subscriptionId: string): Promise<void>;

  // Billing
  fetchInvoices(accessToken: string): Promise<Invoice[]>;
  fetchUsage(accessToken: string): Promise<UsageSummary>;
  fetchCurrentBill(accessToken: string): Promise<CurrentBill>;
}

// ============================================================================
// Tauri Command Names (for reference)
// ============================================================================

/**
 * These are the exact command names that should be registered in Rust.
 * Keep this in sync with actual Rust implementations.
 */
export const TAURI_COMMANDS = {
  // Auth
  deviceLinkInitiate: 'device_link_initiate',
  deviceLinkPoll: 'device_link_poll',
  oauthExchange: 'oauth_exchange',
  oauthRefresh: 'oauth_refresh',
  oauthRevoke: 'oauth_revoke',

  // Profile
  fetchUserProfile: 'fetch_user_profile',
  updateUserProfile: 'update_user_profile',

  // Plans
  fetchPlans: 'fetch_pricing_plans',

  // Subscription
  fetchSubscription: 'fetch_subscription',
  createSubscription: 'create_subscription',
  updateSubscription: 'update_subscription',
  cancelSubscription: 'cancel_subscription',

  // Billing
  fetchInvoices: 'fetch_invoices',
  fetchUsage: 'fetch_usage',
  fetchCurrentBill: 'fetch_current_bill',
} as const;

// ============================================================================
// Error Types
// ============================================================================

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string>,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Helper to check if an error is network-related
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof Error) {
    return (
      error.message.includes('network') ||
      error.message.includes('fetch') ||
      error.message.includes('offline')
    );
  }
  return false;
}

/**
 * Helper to check if an error is auth-related
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AuthenticationError) return true;
  if (error instanceof Error) {
    return (
      error.message.includes('unauthorized') ||
      error.message.includes('401') ||
      error.message.includes('token')
    );
  }
  return false;
}
