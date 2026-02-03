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

/** Subscription information from credits API */
export interface SubscriptionInfo {
  plan_tier: string;
  status: string;
  current_period_end?: string;
}

/** Credits information from credits API */
export interface CreditsInfo {
  monthly_allocated_cents: number;
  monthly_remaining_cents: number;
  monthly_used_cents: number;
  monthly_reset_at: string;
  seconds_until_monthly_reset: number;
  daily_limit_cents: number;
  daily_used_cents: number;
  daily_remaining_cents: number;
  daily_reset_at: string;
  seconds_until_daily_reset: number;
}

/** Formatted credits for display */
export interface FormattedCredits {
  monthly_remaining: string;
  monthly_allocated: string;
  daily_remaining: string;
  daily_limit: string;
}

/** Response from fetch_credit_balance command */
export interface CreditBalanceResponse {
  object: string;
  subscription: SubscriptionInfo;
  credits: CreditsInfo;
  formatted: FormattedCredits;
}

/** Response from report_llm_usage command */
export interface DeductCreditsResponse {
  success: boolean;
  remaining_cents?: number;
  error?: string;
  code?: string; // 'DAILY_CREDIT_LIMIT_REACHED' | 'MONTHLY_CREDIT_LIMIT_REACHED' | 'NO_ACCOUNT'
  daily_limit?: number;
  daily_used?: number;
  daily_remaining?: number;
  reset_in_hours?: number;
}
