/**
 * Pricing Types for Outcome-Based Pricing System
 * Matches Rust backend pricing models
 */

export type PricingModel = 'free' | 'pay_per_result' | 'pro' | 'max' | 'enterprise';

export interface PricingPlan {
  id: string;
  name: string;
  pricing_model: PricingModel;
  base_price_usd?: number;
  annual_price_usd?: number;
  price_per_automation_usd?: number;
  included_hours?: number;
  features: string[];
  is_popular?: boolean;
  description?: string;
}

export interface UsageSummary {
  hours_used: number;
  hours_limit: number;
  automations_run: number;
  successful_automations: number;
  failed_automations: number;
  time_saved_hours: number;
  cost_saved_usd: number;
  billing_period_start: number;
  billing_period_end: number;
  percentage_used: number;
  days_remaining: number;
}

export interface BillableEvent {
  id: string;
  automation_id: string;
  employee_name: string;
  timestamp: number;
  success: boolean;
  time_saved_minutes: number;
  cost_saved_usd: number;
  billable_amount_usd: number;
  description?: string;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'refunded';

export interface Invoice {
  id: string;
  invoice_number: string;
  period_start: number;
  period_end: number;
  subtotal_usd: number;
  tax_usd: number;
  total_amount_usd: number;
  automations_run: number;
  value_delivered_usd: number;
  status: InvoiceStatus;
  items: BillableEvent[];
  created_at: number;
  paid_at?: number;
}

export interface CurrentBill {
  period_start: number;
  period_end: number;
  current_charges_usd: number;
  projected_total_usd: number;
  billable_events_count: number;
}

export interface ROIGuarantee {
  id: string;
  subscription_id: string;
  promised_hours: number;
  actual_hours: number;
  period_days: number;
  started_at: number;
  ends_at: number;
  refund_issued: boolean;
  refund_amount_usd?: number;
  status: 'active' | 'met' | 'exceeded' | 'failed';
}

export interface PlanChangeRequest {
  new_plan_id: string;
  user_id: string;
}

export interface PlanChangeEstimate {
  current_plan: PricingPlan;
  new_plan: PricingPlan;
  is_upgrade: boolean;
  prorated_amount_usd: number;
  credit_amount_usd: number;
  next_billing_date: number;
  changes: string[];
}

export interface CostEstimate {
  hours_per_month: number;
  hourly_rate_usd: number;
  value_saved_usd: number;
  plan_cost_usd: number;
  net_savings_usd: number;
  roi_multiplier: number;
}
