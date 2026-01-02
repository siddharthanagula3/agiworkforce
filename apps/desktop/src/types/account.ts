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

/** Response from fetch_credit_balance command */
export interface CreditBalanceResponse {
  has_credits: boolean;
  account_id: string | null;
  credits_allocated_cents: number;
  credits_used_cents: number;
  credits_remaining_cents: number;
  daily_limit_cents: number;
  daily_used_cents: number;
  daily_remaining_cents: number;
  period_start: string | null;
  period_end: string | null;
  last_daily_reset_at?: string | null;
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
