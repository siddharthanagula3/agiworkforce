
import type { SubscriptionSource } from '../lib/cloudAccountTypes';

export interface CustomerInfo {
  id: string;
  stripe_customer_id: string;
  email: string;
  name?: string;
  created_at: number;
  updated_at: number;
}

export interface SubscriptionInfo {
  id: string;
  customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  plan_name: string;
  billing_interval: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  subscription_source: SubscriptionSource;
  cancel_at?: number;
  canceled_at?: number;
  trial_start?: number;
  trial_end?: number;
  amount: number;
  currency: string;
  created_at: number;
  updated_at: number;
}

export interface ModelUsageStats {
  model_id: string;
  model_name: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  request_count: number;
}

export interface UsageStats {
  automations_executed: number;
  api_calls_made: number;
  storage_used_mb: number;
  llm_tokens_used: number;
  llm_input_tokens: number;
  llm_output_tokens: number;
  browser_sessions: number;
  mcp_tool_calls: number;
  limit_automations?: number;
  limit_api_calls?: number;
  limit_storage_mb?: number;

  model_usage?: ModelUsageStats[];
}
