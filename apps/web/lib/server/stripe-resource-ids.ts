const STRIPE_SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]+$/;
const STRIPE_CUSTOMER_ID = /^cus_[A-Za-z0-9]+$/;

export function isStripeSubscriptionId(value: unknown): value is string {
  return typeof value === 'string' && STRIPE_SUBSCRIPTION_ID.test(value);
}

export function isStripeCustomerId(value: unknown): value is string {
  return typeof value === 'string' && STRIPE_CUSTOMER_ID.test(value);
}
