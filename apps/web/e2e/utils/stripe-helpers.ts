import Stripe from 'stripe';

export interface TestCardDetails {
  number: string;
  exp_month: number;
  exp_year: number;
  cvc: string;
}

export interface CheckoutSessionInfo {
  id: string;
  customer_email: string | null;
  customer: string | null;
  payment_status: string;
  subscription: string | null;
  amount_total: number | null;
  currency: string | null;
}

export interface SubscriptionInfo {
  id: string;
  customer: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  items: {
    data: Array<{
      price: {
        id: string;
        product: string;
      };
    }>;
  };
}

export class StripeHelpers {
  private stripe: Stripe;

  constructor(secretKey?: string) {
    const key = secretKey || process.env.STRIPE_SECRET_KEY;

    if (!key) {
      throw new Error(
        'Stripe secret key not provided. Set STRIPE_SECRET_KEY environment variable.',
      );
    }

    this.stripe = new Stripe(key, {
      apiVersion: '2025-12-15.clover' as Stripe.LatestApiVersion,
    });
  }

  /**
   * Get test card details for Stripe testing
   * Uses Stripe's standard test card: 4242 4242 4242 4242
   */
  getTestCardDetails(): TestCardDetails {
    return {
      number: '4242424242424242',
      exp_month: 12,
      exp_year: 25,
      cvc: '123',
    };
  }

  /**
   * Get another test card for specific scenarios
   * Uses Visa debit test card
   */
  getAlternateTestCard(): TestCardDetails {
    return {
      number: '4000002500003155',
      exp_month: 12,
      exp_year: 25,
      cvc: '123',
    };
  }

  /**
   * Get a declining test card
   */
  getDeclineTestCard(): TestCardDetails {
    return {
      number: '4000000000000002',
      exp_month: 12,
      exp_year: 25,
      cvc: '123',
    };
  }

  /**
   * Retrieve a checkout session from Stripe
   */
  async getCheckoutSession(sessionId: string): Promise<CheckoutSessionInfo> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);

    return {
      id: session.id,
      customer_email: session.customer_email,
      customer:
        typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
      payment_status: session.payment_status,
      subscription: typeof session.subscription === 'string' ? session.subscription : null,
      amount_total: session.amount_total,
      currency: session.currency,
    };
  }

  /**
   * Retrieve a subscription from Stripe
   */
  async getSubscription(subscriptionId: string): Promise<SubscriptionInfo> {
    const subscription = (await this.stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    })) as unknown as {
      id: string;
      customer: string | Stripe.Customer;
      status: string;
      current_period_start: number;
      current_period_end: number;
      cancel_at_period_end: boolean;
      items: { data: Array<{ price: { id: string; product: string } }> };
    };

    return {
      id: subscription.id,
      customer: typeof subscription.customer === 'string' ? subscription.customer : '',
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      items: {
        data: subscription.items.data.map((item) => ({
          price: {
            id: typeof item.price.id === 'string' ? item.price.id : '',
            product: typeof item.price.product === 'string' ? item.price.product : '',
          },
        })),
      },
    };
  }

  /**
   * Cancel a test subscription
   */
  async cancelTestSubscription(subscriptionId: string): Promise<void> {
    const subscription = await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    if (subscription.status === 'canceled') {
      throw new Error(`Failed to cancel subscription. Status: ${subscription.status}`);
    }
  }

  /**
   * Create a test customer
   */
  async createTestCustomer(email: string, name?: string): Promise<string> {
    const customer = await this.stripe.customers.create({
      email,
      name: name || 'Test Customer',
    });

    return customer.id;
  }

  /**
   * Delete a test customer
   */
  async deleteTestCustomer(customerId: string): Promise<void> {
    const result = await this.stripe.customers.del(customerId);
    if (!('deleted' in result && result.deleted === true)) {
      throw new Error(`Failed to delete customer ${customerId}`);
    }
  }

  /**
   * Get a test price ID (retrieves from Stripe)
   */
  async getTestPrice(priceId: string): Promise<Stripe.Price> {
    return this.stripe.prices.retrieve(priceId);
  }

  /**
   * List test products
   */
  async listTestProducts(limit: number = 10): Promise<Stripe.Product[]> {
    const products = await this.stripe.products.list({ limit });
    return products.data;
  }

  /**
   * List test prices for a product
   */
  async listTestPrices(productId: string, limit: number = 10): Promise<Stripe.Price[]> {
    const prices = await this.stripe.prices.list({ product: productId, limit });
    return prices.data;
  }

  /**
   * Get list of active subscriptions for a customer
   */
  async getCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    const subscriptions = await this.stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 10,
    });

    return subscriptions.data;
  }

  /**
   * Retrieve a customer from Stripe
   */
  async getCustomer(customerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    return this.stripe.customers.retrieve(customerId);
  }

  /**
   * Update a customer's metadata
   */
  async updateCustomerMetadata(
    customerId: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    await this.stripe.customers.update(customerId, { metadata });
  }
}
