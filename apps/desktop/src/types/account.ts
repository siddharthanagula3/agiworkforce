import type {
  ManagedUsageBalance,
  ManagedUsageBalanceResponse,
  ManagedUsageSubscription,
} from '@agiworkforce/types';

export interface DeviceLinkResponse {
  link_code: string;
  device_id: string;
  verify_url: string;
  qr_code_url?: string;
  expires_at: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
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
  name?: string;
  avatar_url?: string;
  credits?: CreditBalance | null;
}

export type SubscriptionInfo = ManagedUsageSubscription;
export type CreditsInfo = ManagedUsageBalance;
export type CreditBalanceResponse = ManagedUsageBalanceResponse;

// STB-6: `DeductCreditsResponse` (the response type for the `report_llm_usage`
// Tauri command) was removed. The command posts to /api/llm/v1/credits/deduct,
// a route that has never existed, and client-driven credit deduction was
// retired platform-wide — /api/usage/deduct now returns 410 ENDPOINT_RETIRED
// because managed operations deduct server-side. The type had no consumers.
