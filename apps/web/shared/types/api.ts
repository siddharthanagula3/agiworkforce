
import { PlanTier, BillingInterval } from '@/lib/validations/checkout';

export interface CheckoutRequest {
  plan: PlanTier;
  billingInterval: BillingInterval;
}

export interface CheckoutResponse {
  url: string;
}

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

export interface PortalResponse {
  url: string;
}

export interface SyncSubscriptionResponse {
  success: boolean;
  message: string;
  stripe_price_id: string;
}

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

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}
