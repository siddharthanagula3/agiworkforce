import React from 'react';

// pro_plus removed 2026-06-20; 'hobby' renamed to 'basic' 2026-07-02.
// Locked tiers are free, basic, pro, max, team, enterprise.
export const VALID_PLANS = ['free', 'basic', 'pro', 'max', 'enterprise'] as const;
export type PlanTier = (typeof VALID_PLANS)[number];

export const VALID_STATUSES = ['active', 'cancelled', 'past_due', 'unpaid'] as const;
export type BillingStatus = (typeof VALID_STATUSES)[number];

export function isValidPlan(plan: unknown): plan is PlanTier {
  return typeof plan === 'string' && VALID_PLANS.includes(plan as PlanTier);
}

export function isValidStatus(status: unknown): status is BillingStatus {
  return typeof status === 'string' && VALID_STATUSES.includes(status as BillingStatus);
}

export function normalizePlan(plan: unknown): PlanTier {
  return isValidPlan(plan) ? plan : 'free';
}

export function normalizeStatus(status: unknown): BillingStatus {
  return isValidStatus(status) ? status : 'active';
}

export interface LLMUsage {
  provider: string;
  tokens: number;
  cost: number;
  limit: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

export interface BillingInfo {
  plan: 'free' | 'basic' | 'pro' | 'max' | 'enterprise';
  status: 'active' | 'cancelled' | 'past_due' | 'unpaid';
  current_period_start: string;
  current_period_end: string;
  price: number;
  currency: string;
  features: string[];
  usage: {
    totalTokens: number;
    totalLimit: number;
    totalCost: number;
    llmUsage: LLMUsage[];
  };
  invoices: {
    id: string;
    date: string;
    amount: number;
    status: 'paid' | 'pending' | 'failed';
    download_url: string;
  }[];
}

const VALID_CURRENCY_RE = /^[A-Z]{3}$/;

export function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatCurrency(amount: number, currency: string) {
  const safeCurrency = VALID_CURRENCY_RE.test(currency) ? currency : 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrency,
  }).format(amount);
}

export function safePercentage(used: number, limit: number): number {
  if (limit <= 0 || used < 0) return 0;
  return Math.min((used / limit) * 100, 100);
}
