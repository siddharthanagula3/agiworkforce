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
  daily_reset_at?: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  name?: string;
  avatar_url?: string;
  credits?: CreditBalance | null;
}
