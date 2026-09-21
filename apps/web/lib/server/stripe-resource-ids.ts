const STRIPE_SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]+$/;
const STRIPE_CUSTOMER_ID = /^cus_[A-Za-z0-9]+$/;
const STRIPE_CHECKOUT_SESSION_ID = /^cs_(?:test|live)_[A-Za-z0-9]+$/;

export function isStripeSubscriptionId(value: unknown): value is string {
  return typeof value === 'string' && STRIPE_SUBSCRIPTION_ID.test(value);
}

export function isStripeCustomerId(value: unknown): value is string {
  return typeof value === 'string' && STRIPE_CUSTOMER_ID.test(value);
}

export function isStripeCheckoutSessionId(value: unknown): value is string {
  return typeof value === 'string' && STRIPE_CHECKOUT_SESSION_ID.test(value);
}

// Stripe answers `resource_missing` when the id names nothing in this account,
// which is a definite answer about the object rather than an outage.
export function isStripeResourceMissing(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'resource_missing'
  );
}
