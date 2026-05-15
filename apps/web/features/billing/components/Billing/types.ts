import React from 'react';

export const VALID_PLANS = ['free', 'hobby', 'pro', 'pro_plus', 'max', 'enterprise'] as const;
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
  plan: 'free' | 'hobby' | 'pro' | 'pro_plus' | 'max' | 'enterprise';
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

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price: number;
  popular?: boolean;
  savings?: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'pack_500',
    name: 'Starter Pack',
    credits: 500,
    price: 5,
  },
  {
    id: 'pack_1500',
    name: 'Popular Pack',
    credits: 1500,
    price: 12,
    popular: true,
    savings: 'Save 20%',
  },
  {
    id: 'pack_5000',
    name: 'Power Pack',
    credits: 5000,
    price: 35,
    savings: 'Save 30%',
  },
  {
    id: 'pack_15000',
    name: 'Enterprise Pack',
    credits: 15000,
    price: 90,
    savings: 'Save 40%',
  },
];

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
