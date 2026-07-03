/**
 * Stripe Payment Integration Service
 * Handles all Stripe-related operations for AI employee subscriptions
 *
 * UPDATED: January 17, 2026 - Added authorization headers to all API calls
 */

import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';

// Employee purchase functions removed - hiring is now free

/**
 * Open Stripe Customer Portal for subscription management
 */
// Updated: Jan 17th 2026 - Added authorization header
export async function openBillingPortal(customerId: string): Promise<void> {
  void customerId;
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error('User not authenticated. Please log in to access billing.');
  }

  const response = await fetch('/api/portal', {
    method: 'POST',
    headers: await addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    }),
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to open billing portal');
  }

  const { url } = await response.json();

  // Redirect to Stripe Customer Portal
  window.location.href = url;
}

/**
 * Format price for display
 */
export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Check if Stripe is properly configured
 */
export function isStripeConfigured(): boolean {
  const publishableKey = process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'];
  return !!publishableKey && publishableKey.startsWith('pk_');
}

/**
 * Get Stripe configuration status for debugging
 */
export function getStripeConfig() {
  return {
    publishableKey: process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY']
      ? `${process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'].substring(0, 20)}...`
      : 'Not configured',
    isConfigured: isStripeConfigured(),
  };
}

/**
 * Create Pro Plan subscription and redirect to Stripe Checkout
 */
export async function upgradeToProPlan(data: {
  userId: string;
  userEmail: string;
  billingPeriod?: 'monthly' | 'yearly';
}): Promise<void> {
  return upgradeToPlan({ ...data, plan: 'pro' });
}

/**
 * Create Max Plan subscription and redirect to Stripe Checkout
 */
export async function upgradeToMaxPlan(data: {
  userId: string;
  userEmail: string;
  billingPeriod?: 'monthly' | 'yearly';
}): Promise<void> {
  return upgradeToPlan({ ...data, plan: 'max' });
}

/**
 * Create Hobby Plan subscription and redirect to Stripe Checkout
 */
export async function upgradeToHobbyPlan(data: {
  userId: string;
  userEmail: string;
  billingPeriod?: 'monthly' | 'yearly';
}): Promise<void> {
  return upgradeToPlan({ ...data, plan: 'hobby' });
}

/**
 * Create Basic Plan subscription and redirect to Stripe Checkout. Basic
 * prices by currency (USD/INR), not billing interval — see
 * app/api/checkout/route.ts and lib/pricing.ts.
 */
export async function upgradeToBasicPlan(data: {
  userId: string;
  userEmail: string;
  currency?: 'usd' | 'inr';
}): Promise<void> {
  return upgradeToPlan({ ...data, plan: 'basic' });
}

/**
 * Create Team Plan subscription and redirect to Stripe Checkout.
 */
export async function upgradeToTeamPlan(data: {
  userId: string;
  userEmail: string;
  billingPeriod?: 'monthly' | 'yearly';
}): Promise<void> {
  return upgradeToPlan({ ...data, plan: 'team' });
}

/**
 * Generic function to upgrade to any plan
 */
async function upgradeToPlan(data: {
  userId: string;
  userEmail: string;
  plan: 'hobby' | 'basic' | 'pro' | 'max' | 'team';
  billingPeriod?: 'monthly' | 'yearly';
  currency?: 'usd' | 'inr';
}): Promise<void> {
  void data.userId;
  void data.userEmail;
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error('User not authenticated. Please log in to upgrade.');
  }

  const billingInterval = data.billingPeriod === 'yearly' ? 'yearly' : 'monthly';

  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: await addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    }),
    body: JSON.stringify({
      // The checkout API's plan schema doesn't include 'hobby' (superseded by
      // 'basic'); callers still using upgradeToHobbyPlan are legacy and unrelated
      // to this pricing-page change, so we pass plan through unchanged here.
      plan: data.plan,
      billingInterval,
      ...(data.currency ? { currency: data.currency } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to create ${data.plan.toUpperCase()} subscription`);
  }

  const { url } = await response.json();

  // Redirect to Stripe Checkout
  if (url) {
    window.location.href = url;
  } else {
    throw new Error('No checkout URL received from server');
  }
}

/**
 * Upgrade an existing active subscription mid-cycle with credit-based proration.
 * The server calculates unused platform credits and applies them as a Stripe
 * customer balance credit that offsets the next invoice.
 */
export async function upgradePlanMidCycle(data: {
  plan: 'basic' | 'pro' | 'max';
  billingInterval?: 'monthly' | 'yearly';
}): Promise<{ creditAppliedUsd: string }> {
  const authToken = await getAuthToken();
  if (!authToken) throw new Error('User not authenticated. Please log in to upgrade.');

  const billingInterval = data.billingInterval ?? 'monthly';
  const response = await fetch('/api/upgrade', {
    method: 'POST',
    headers: await addCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    }),
    body: JSON.stringify({ plan: data.plan, billingInterval }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Failed to upgrade to ${data.plan}`);
  }

  const result = await response.json();
  return { creditAppliedUsd: result.creditAppliedUsd ?? '0.00' };
}

/**
 * Create Enterprise plan inquiry (Contact sales)
 */
export async function contactEnterpriseSales(data: {
  userId: string;
  userEmail: string;
  userName?: string;
  companyName?: string;
  message?: string;
}): Promise<void> {
  // In a real implementation, this would send an email or create a lead in CRM
  // For now, we'll just open the contact page or show a success message

  // You can implement this to send to your CRM or email service
  // For now, redirect to contact page with pre-filled info
  const params = new URLSearchParams({
    email: data.userEmail,
    plan: 'enterprise',
    ...(data.userName && { name: data.userName }),
    ...(data.companyName && { company: data.companyName }),
  });

  window.location.href = `/contact-sales?${params.toString()}`;
}
