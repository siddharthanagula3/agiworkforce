/**
 * Stripe service - Frontend wrapper for Tauri billing commands
 * 
 * Note: Stripe MCP tools are also available for the AGI agent to use directly.
 * When Stripe MCP server is enabled and connected, the agent can use Stripe MCP tools
 * (e.g., mcp_stripe_create_customer, mcp_stripe_list_customers, etc.) for billing operations.
 * 
 * To enable Stripe MCP:
 * 1. Store your Stripe secret key in Windows Credential Manager:
 *    - Service: agiworkforce-mcp-stripe
 *    - Key: STRIPE_SECRET_KEY
 * 2. Enable Stripe MCP in MCP configuration at %APPDATA%/agiworkforce/mcp-servers-config.json
 */

import { invoke } from '@tauri-apps/api/core';

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
  cancel_at?: number;
  canceled_at?: number;
  trial_start?: number;
  trial_end?: number;
  amount: number;
  currency: string;
  created_at: number;
  updated_at: number;
}

export interface InvoiceInfo {
  id: string;
  customer_id: string;
  subscription_id?: string;
  stripe_invoice_id: string;
  invoice_number?: string;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  currency: string;
  status: string;
  invoice_pdf?: string;
  hosted_invoice_url?: string;
  period_start: number;
  period_end: number;
  due_date?: number;
  paid_at?: number;
  created_at: number;
}

export interface UsageStats {
  automations_executed: number;
  api_calls_made: number;
  storage_used_mb: number;
  llm_tokens_used: number;
  browser_sessions: number;
  mcp_tool_calls: number;
  limit_automations?: number;
  limit_api_calls?: number;
  limit_storage_mb?: number;
}

export class StripeService {
  private static initialized = false;

  /**
   * Initialize the Stripe service with API keys
   * 
   * Note: This initializes the Rust-based Stripe client. Stripe MCP tools are available
   * separately when the Stripe MCP server is enabled and connected. The AGI agent can
   * use either the Tauri commands (via this service) or Stripe MCP tools directly.
   */
  static async initialize(stripeApiKey: string, webhookSecret: string): Promise<void> {
    await invoke('billing_initialize', {
      stripeApiKey,
      webhookSecret,
    });
    this.initialized = true;
  }

  /**
   * Check if service is initialized
   */
  static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Create a new Stripe customer
   */
  static async createCustomer(email: string, name?: string): Promise<CustomerInfo> {
    return await invoke<CustomerInfo>('stripe_create_customer', {
      email,
      name: name || null,
    });
  }

  /**
   * Get customer by email
   */
  static async getCustomerByEmail(email: string): Promise<CustomerInfo | null> {
    return await invoke<CustomerInfo | null>('stripe_get_customer_by_email', {
      email,
    });
  }

  /**
   * Create a new subscription
   */
  static async createSubscription(
    customerStripeId: string,
    priceId: string,
    planName: string,
    billingInterval: 'monthly' | 'yearly',
    trialDays?: number
  ): Promise<SubscriptionInfo> {
    return await invoke<SubscriptionInfo>('stripe_create_subscription', {
      customerStripeId,
      priceId,
      trialDays: trialDays || null,
      planName,
      billingInterval,
    });
  }

  /**
   * Get subscription details
   */
  static async getSubscription(stripeSubscriptionId: string): Promise<SubscriptionInfo> {
    return await invoke<SubscriptionInfo>('stripe_get_subscription', {
      stripeSubscriptionId,
    });
  }

  /**
   * Update subscription (upgrade/downgrade)
   */
  static async updateSubscription(
    stripeSubscriptionId: string,
    newPriceId: string,
    newPlanName: string
  ): Promise<SubscriptionInfo> {
    return await invoke<SubscriptionInfo>('stripe_update_subscription', {
      stripeSubscriptionId,
      newPriceId,
      newPlanName,
    });
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription(stripeSubscriptionId: string): Promise<void> {
    await invoke('stripe_cancel_subscription', {
      stripeSubscriptionId,
    });
  }

  /**
   * Get invoices for customer
   */
  static async getInvoices(customerStripeId: string): Promise<InvoiceInfo[]> {
    return await invoke<InvoiceInfo[]>('stripe_get_invoices', {
      customerStripeId,
    });
  }

  /**
   * Get usage statistics
   */
  static async getUsage(
    customerId: string,
    periodStart: number,
    periodEnd: number
  ): Promise<UsageStats> {
    return await invoke<UsageStats>('stripe_get_usage', {
      customerId,
      periodStart,
      periodEnd,
    });
  }

  /**
   * Track usage event
   */
  static async trackUsage(
    customerId: string,
    usageType: 'automation_execution' | 'api_call' | 'storage_mb' | 'llm_tokens' | 'browser_session' | 'mcp_tool_call',
    count: number,
    periodStart: number,
    periodEnd: number,
    metadata?: string
  ): Promise<void> {
    await invoke('stripe_track_usage', {
      customerId,
      usageType,
      count,
      periodStart,
      periodEnd,
      metadata: metadata || null,
    });
  }

  /**
   * Create Stripe billing portal session URL
   */
  static async createPortalSession(
    customerStripeId: string,
    returnUrl: string
  ): Promise<string> {
    return await invoke<string>('stripe_create_portal_session', {
      customerStripeId,
      returnUrl,
    });
  }

  /**
   * Get active subscription for customer
   */
  static async getActiveSubscription(customerId: string): Promise<SubscriptionInfo | null> {
    return await invoke<SubscriptionInfo | null>('stripe_get_active_subscription', {
      customerId,
    });
  }

  /**
   * Process webhook event (called by backend)
   */
  static async processWebhook(payload: string, signature: string): Promise<void> {
    await invoke('stripe_process_webhook', {
      payload,
      signature,
    });
  }
}
