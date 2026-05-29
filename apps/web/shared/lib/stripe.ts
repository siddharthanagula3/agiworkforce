/**
 * Stripe payment integration utilities
 * Handles payment processing, subscriptions, and billing management
 */

import { loadStripe, Stripe, StripeElements, StripeElementsOptions } from '@stripe/stripe-js';

// ========================================
// Types and Interfaces
// ========================================

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status:
    | 'requires_payment_method'
    | 'requires_confirmation'
    | 'requires_action'
    | 'processing'
    | 'requires_capture'
    | 'canceled'
    | 'succeeded';
  client_secret: string;
  metadata?: Record<string, string>;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_account' | 'sepa_debit';
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
    country: string;
  };
  billing_details: {
    name?: string;
    email?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country?: string;
    };
  };
  created: number;
}

export interface Subscription {
  id: string;
  status:
    | 'incomplete'
    | 'incomplete_expired'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid';
  current_period_start: number;
  current_period_end: number;
  trial_start?: number;
  trial_end?: number;
  cancel_at_period_end: boolean;
  canceled_at?: number;
  ended_at?: number;
  items: {
    id: string;
    price: {
      id: string;
      nickname?: string;
      unit_amount: number;
      currency: string;
      recurring?: {
        interval: 'day' | 'week' | 'month' | 'year';
        interval_count: number;
      };
    };
    quantity: number;
  }[];
  metadata?: Record<string, string>;
}

export interface Invoice {
  id: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  currency: string;
  created: number;
  due_date?: number;
  paid_at?: number;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
  lines: {
    id: string;
    description?: string;
    amount: number;
    currency: string;
    period: {
      start: number;
      end: number;
    };
  }[];
}

export interface Price {
  id: string;
  nickname?: string;
  unit_amount: number;
  currency: string;
  type: 'one_time' | 'recurring';
  recurring?: {
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
    trial_period_days?: number;
  };
  metadata?: Record<string, string>;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  images: string[];
  metadata?: Record<string, string>;
  prices: Price[];
}

export interface Customer {
  id: string;
  email?: string;
  name?: string;
  phone?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  created: number;
  default_payment_method?: string;
  invoice_settings: {
    default_payment_method?: string;
  };
}

export interface CheckoutSession {
  id: string;
  url: string;
  status: 'open' | 'complete' | 'expired';
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  mode: 'payment' | 'setup' | 'subscription';
  success_url: string;
  cancel_url: string;
  customer?: string;
  customer_email?: string;
  expires_at: number;
}

// ========================================
// Stripe Configuration
// ========================================

export interface StripeConfig {
  publishableKey: string;
  appearance?: {
    theme?: 'stripe' | 'night' | 'flat';
    variables?: Record<string, string>;
    rules?: Record<string, Record<string, string>>;
  };
  elements?: StripeElementsOptions;
}

// ========================================
// Stripe Service Class
// ========================================

export class StripeService {
  private static instance: StripeService;
  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private config: StripeConfig;

  private constructor(config: StripeConfig) {
    this.config = config;
  }

  static getInstance(config: StripeConfig): StripeService {
    if (!StripeService.instance) {
      StripeService.instance = new StripeService(config);
    }
    return StripeService.instance;
  }

  // Initialize Stripe
  async initialize(): Promise<Stripe> {
    if (this.stripe) return this.stripe;

    this.stripe = await loadStripe(this.config.publishableKey);

    if (!this.stripe) {
      throw new Error('Failed to load Stripe');
    }

    return this.stripe;
  }

  // Get Stripe instance
  getStripe(): Stripe | null {
    return this.stripe;
  }

  // Create Elements instance
  createElements(options?: StripeElementsOptions): StripeElements | null {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    this.elements = this.stripe.elements({
      ...this.config.elements,
      ...options,
    });

    return this.elements;
  }

  // Get Elements instance
  getElements(): StripeElements | null {
    return this.elements;
  }

  // Payment Methods
  async createPaymentMethod(params: {
    type: 'card';
    card: unknown; // Stripe card element
    billing_details?: {
      name?: string;
      email?: string;
      address?: {
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        postal_code?: string;
        country?: string;
      };
    };
  }) {
    if (!this.stripe) throw new Error('Stripe not initialized');

    const { error, paymentMethod } = await this.stripe.createPaymentMethod(params);

    if (error) {
      throw new Error(error.message);
    }

    return paymentMethod;
  }

  // Payment Intent
  async confirmPayment(params: {
    elements: StripeElements;
    confirmParams: {
      return_url: string;
      payment_method?: {
        billing_details?: {
          name?: string;
          email?: string;
        };
      };
    };
    redirect?: 'always' | 'if_required';
  }) {
    if (!this.stripe) throw new Error('Stripe not initialized');

    const { error, paymentIntent } = await this.stripe.confirmPayment(params);

    if (error) {
      throw new Error(error.message);
    }

    return paymentIntent;
  }

  // Setup Intent (for saving payment methods)
  async confirmSetup(params: {
    elements: StripeElements;
    confirmParams: {
      return_url: string;
    };
    redirect?: 'always' | 'if_required';
  }) {
    if (!this.stripe) throw new Error('Stripe not initialized');

    const { error, setupIntent } = await this.stripe.confirmSetup(params);

    if (error) {
      throw new Error(error.message);
    }

    return setupIntent;
  }

  // Redirect to Checkout
  async redirectToCheckout(sessionId: string) {
    if (!this.stripe) throw new Error('Stripe not initialized');

    const { error } = await this.stripe.redirectToCheckout({ sessionId });

    if (error) {
      throw new Error(error.message);
    }
  }
}

// ========================================
// Default Configuration
// ========================================

// Note: PaymentAPI class and its dependent hooks (usePayment, useSubscription,
// usePaymentMethods) were removed. Billing UI was rewired to use /api/portal
// (see features/billing/services/stripe-payments.ts) and React Query hooks
// (see features/billing/hooks/use-billing-queries.ts). Nothing imported from
// this file any longer; PaymentAPI had zero external callers.

export const createStripeConfig = (publishableKey: string): StripeConfig => ({
  publishableKey,
  appearance: {
    theme: 'stripe',
    variables: {
      colorPrimary: '#0ea5e9',
      colorBackground: '#ffffff',
      colorText: '#1f2937',
      colorDanger: '#dc2626',
      fontFamily: 'system-ui, sans-serif',
      spacingUnit: '4px',
      borderRadius: '6px',
    },
  },
});

export default StripeService;
