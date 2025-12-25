/**
 * API request and response types
 */

import { PlanTier, BillingInterval } from '@/lib/validations/checkout';

// Checkout API
export interface CheckoutRequest {
  plan: PlanTier;
  billingInterval: BillingInterval;
}

export interface CheckoutResponse {
  url: string;
}

// Me API
export interface MeResponse {
  id: string;
  email: string | null;
  name: string;
  avatar_url: string | null;
  created_at: number;
  updated_at: number;
  plan: {
    tier: string;
    display_name: string;
    status: string;
    current_period_end: number | null;
  };
  feature_flags: {
    beta_features: boolean;
    advanced_model_access: boolean;
  };
}

// Device API
export interface DeviceLinkRequest {
  device_id: string;
  device_name?: string;
  device_type?: 'desktop' | 'mobile' | 'tablet' | 'other';
}

export interface DeviceLinkResponse {
  user_code: string;
  verify_url: string;
  expires_in: number;
}

export interface DevicePollRequest {
  device_id: string;
}

export interface DevicePollResponse {
  status: 'pending' | 'approved' | 'denied' | 'expired';
  access_token?: string;
  refresh_token?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

// Claim Offer API
export interface ClaimOfferRequest {
  code: string;
}

export interface ClaimOfferResponse {
  success: boolean;
  planTier: string;
  trialDays: number;
  discountPercent: number;
  subscription: {
    id: string;
    plan_tier: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
  } | null;
}

// Portal API
export interface PortalResponse {
  url: string;
}

// Sync Subscription API
export interface SyncSubscriptionResponse {
  success: boolean;
  message: string;
  stripe_price_id: string;
}

// Health Check API
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      message?: string;
    };
    stripe: {
      status: 'healthy' | 'unhealthy';
      message?: string;
    };
    environment: {
      status: 'healthy' | 'unhealthy';
      missing: string[];
    };
  };
}

// Error Response
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}
