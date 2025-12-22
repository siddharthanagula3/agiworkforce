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

import { invoke } from '../lib/tauri-mock';

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
  llm_input_tokens: number;
  llm_output_tokens: number;
  browser_sessions: number;
  mcp_tool_calls: number;
  limit_automations?: number;
  limit_api_calls?: number;
  limit_storage_mb?: number;
  // Per-model usage breakdown
  model_usage?: ModelUsageStats[];
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

export interface TokenUsageEvent {
  model_id: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd?: number;
  timestamp?: number;
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
    try {
      await invoke('billing_initialize', {
        stripeApiKey,
        webhookSecret,
      });
      this.initialized = true;
    } catch (error) {
      console.warn('[StripeService] Failed to initialize:', error);
      this.initialized = false;
    }
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
    try {
      return await invoke<CustomerInfo>('stripe_create_customer', {
        email,
        name: name || null,
      });
    } catch (error) {
      console.error('[StripeService] Error creating customer:', error);
      throw error;
    }
  }

  /**
   * Get customer by email
   */
  static async getCustomerByEmail(email: string): Promise<CustomerInfo | null> {
    try {
      return await invoke<CustomerInfo | null>('stripe_get_customer_by_email', {
        email,
      });
    } catch (error) {
      console.warn('[StripeService] Error getting customer by email:', error);
      return null;
    }
  }

  /**
   * Create a new subscription
   */
  static async createSubscription(
    customerStripeId: string,
    priceId: string,
    planName: string,
    billingInterval: 'monthly' | 'yearly',
    trialDays?: number,
  ): Promise<SubscriptionInfo> {
    try {
      return await invoke<SubscriptionInfo>('stripe_create_subscription', {
        customerStripeId,
        priceId,
        trialDays: trialDays || null,
        planName,
        billingInterval,
      });
    } catch (error) {
      console.error('[StripeService] Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Get subscription details
   */
  static async getSubscription(stripeSubscriptionId: string): Promise<SubscriptionInfo> {
    try {
      return await invoke<SubscriptionInfo>('stripe_get_subscription', {
        stripeSubscriptionId,
      });
    } catch (error) {
      console.error('[StripeService] Error getting subscription:', error);
      throw error;
    }
  }

  /**
   * Update subscription (upgrade/downgrade)
   */
  static async updateSubscription(
    stripeSubscriptionId: string,
    newPriceId: string,
    newPlanName: string,
  ): Promise<SubscriptionInfo> {
    try {
      return await invoke<SubscriptionInfo>('stripe_update_subscription', {
        stripeSubscriptionId,
        newPriceId,
        newPlanName,
      });
    } catch (error) {
      console.error('[StripeService] Error updating subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription(stripeSubscriptionId: string): Promise<void> {
    try {
      await invoke('stripe_cancel_subscription', {
        stripeSubscriptionId,
      });
    } catch (error) {
      console.error('[StripeService] Error cancelling subscription:', error);
      throw error;
    }
  }

  /**
   * Get invoices for customer
   */
  static async getInvoices(customerStripeId: string): Promise<InvoiceInfo[]> {
    try {
      return await invoke<InvoiceInfo[]>('stripe_get_invoices', {
        customerStripeId,
      });
    } catch (error) {
      console.warn('[StripeService] Error getting invoices:', error);
      return [];
    }
  }

  /**
   * Get usage statistics
   */
  static async getUsage(
    customerId: string,
    periodStart: number,
    periodEnd: number,
  ): Promise<UsageStats> {
    try {
      return await invoke<UsageStats>('stripe_get_usage', {
        customerId,
        periodStart,
        periodEnd,
      });
    } catch (error) {
      console.warn('[StripeService] Error getting usage:', error);
      return {
        automations_executed: 0,
        api_calls_made: 0,
        storage_used_mb: 0,
        llm_tokens_used: 0,
        llm_input_tokens: 0,
        llm_output_tokens: 0,
        browser_sessions: 0,
        mcp_tool_calls: 0,
      };
    }
  }

  /**
   * Track usage event
   */
  static async trackUsage(
    customerId: string,
    usageType:
      | 'automation_execution'
      | 'api_call'
      | 'storage_mb'
      | 'llm_tokens'
      | 'llm_input_tokens'
      | 'llm_output_tokens'
      | 'browser_session'
      | 'mcp_tool_call',
    count: number,
    periodStart: number,
    periodEnd: number,
    metadata?: string,
  ): Promise<void> {
    try {
      await invoke('stripe_track_usage', {
        customerId,
        usageType,
        count,
        periodStart,
        periodEnd,
        metadata: metadata || null,
      });
    } catch (error) {
      console.warn('[StripeService] Error tracking usage:', error);
    }
  }

  /**
   * Track detailed LLM token usage with input/output breakdown
   */
  static async trackLLMUsage(
    customerId: string,
    event: TokenUsageEvent,
    periodStart: number,
    periodEnd: number,
  ): Promise<void> {
    const metadata = JSON.stringify({
      model_id: event.model_id,
      provider: event.provider,
      input_tokens: event.input_tokens,
      output_tokens: event.output_tokens,
      cost_usd: event.cost_usd,
      timestamp: event.timestamp || Date.now(),
    });

    // Track total tokens
    await this.trackUsage(
      customerId,
      'llm_tokens',
      event.input_tokens + event.output_tokens,
      periodStart,
      periodEnd,
      metadata,
    );

    // Track input tokens separately
    await this.trackUsage(
      customerId,
      'llm_input_tokens',
      event.input_tokens,
      periodStart,
      periodEnd,
      metadata,
    );

    // Track output tokens separately
    await this.trackUsage(
      customerId,
      'llm_output_tokens',
      event.output_tokens,
      periodStart,
      periodEnd,
      metadata,
    );
  }

  /**
   * Create Stripe billing portal session URL
   */
  static async createPortalSession(customerStripeId: string, returnUrl: string): Promise<string> {
    try {
      return await invoke<string>('stripe_create_portal_session', {
        customerStripeId,
        returnUrl,
      });
    } catch (error) {
      console.error('[StripeService] Error creating portal session:', error);
      throw error;
    }
  }

  /**
   * Get active subscription for customer
   */
  static async getActiveSubscription(customerId: string): Promise<SubscriptionInfo | null> {
    try {
      return await invoke<SubscriptionInfo | null>('stripe_get_active_subscription', {
        customerId,
      });
    } catch (error) {
      console.warn('[StripeService] Error getting active subscription:', error);
      return null;
    }
  }

  /**
   * Process webhook event (called by backend)
   */
  static async processWebhook(payload: string, signature: string): Promise<void> {
    try {
      await invoke('stripe_process_webhook', {
        payload,
        signature,
      });
    } catch (error) {
      console.error('[StripeService] Error processing webhook:', error);
    }
  }
}
