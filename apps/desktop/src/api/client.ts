import type { PlanTier, SubscriptionStatus } from '../stores/auth';

// Re-export from centralized config so existing imports continue to work.
export { API_BASE_URL } from './config';

export const API_ENDPOINTS = {
  deviceLink: '/api/device/link',
  devicePoll: '/api/device/poll',
  oauthToken: '/oauth/token',
  oauthRevoke: '/oauth/revoke',
  refreshToken: '/oauth/refresh',

  me: '/api/me',
  updateProfile: '/api/me',

  plans: '/api/plans',
  subscription: '/api/subscription',
  subscriptions: '/api/subscriptions',

  invoices: '/api/invoices',
  usage: '/api/usage',
  currentBill: '/api/billing/current',

  featureFlags: '/api/features',
} as const;

export interface DeviceLinkRequest {
  device_name?: string;
  device_type?: 'desktop' | 'mobile' | 'web';
}

export interface DeviceLinkResponse {
  link_code: string;
  device_id: string;
  expires_at: number;
  qr_code_url?: string;
  verify_url: string;
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
  expires_in: number;
  scope?: string;
}

export interface CreditBalance {
  account_id?: string;
  period_start?: string;
  period_end?: string;
  allocated_cents?: number;
  used_cents?: number;
  remaining_cents?: number;
  percentage_used?: number;
  daily_limit_cents?: number;
  daily_used_cents?: number;
  daily_remaining_cents?: number;
  daily_reset_at?: string; // ISO timestamp
}

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
  credits?: CreditBalance | null;
}

export interface UpdateProfileRequest {
  name?: string;
  avatar_url?: string;
}

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
    automations: number | null;
    api_calls: number | null;
    storage_gb: number | null;
    team_members: number | null;
  };
  is_popular?: boolean;
  is_available: boolean;
}

export interface CreateSubscriptionRequest {
  plan_id: string;
  payment_method_id?: string;
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
  plan_id?: string;
  cancel_at_period_end?: boolean;
}

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
  hosted_invoice_url?: string;
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

export interface TauriAPIClient {
  deviceLinkInitiate(request: DeviceLinkRequest): Promise<DeviceLinkResponse>;
  deviceLinkPoll(request: DevicePollRequest): Promise<DevicePollResponse>;
  oauthExchange(request: OAuthTokenRequest): Promise<OAuthTokenResponse>;
  oauthRefresh(refreshToken: string): Promise<OAuthTokenResponse>;
  oauthRevoke(token: string): Promise<void>;

  fetchUserProfile(accessToken: string): Promise<UserProfile>;
  updateUserProfile(accessToken: string, updates: UpdateProfileRequest): Promise<UserProfile>;

  fetchPlans(): Promise<PricingPlan[]>;

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

  fetchInvoices(accessToken: string): Promise<Invoice[]>;
  fetchUsage(accessToken: string): Promise<UsageSummary>;
  fetchCurrentBill(accessToken: string): Promise<CurrentBill>;
}

export const TAURI_COMMANDS = {
  deviceLinkInitiate: 'device_link_initiate',
  deviceLinkPoll: 'device_link_poll',
  oauthExchange: 'oauth_exchange',
  oauthRefresh: 'oauth_refresh',
  oauthRevoke: 'oauth_revoke',

  fetchUserProfile: 'fetch_user_profile',
  updateUserProfile: 'update_user_profile',

  fetchPlans: 'fetch_pricing_plans',

  fetchSubscription: 'fetch_subscription',
  createSubscription: 'create_subscription',
  updateSubscription: 'update_subscription',
  cancelSubscription: 'cancel_subscription',

  fetchInvoices: 'fetch_invoices',
  fetchUsage: 'fetch_usage',
  fetchCurrentBill: 'fetch_current_bill',
} as const;

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
