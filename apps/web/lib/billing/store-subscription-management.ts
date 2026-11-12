export type StoreBillingSource = 'apple' | 'google';

export const STORE_SUBSCRIPTION_MANAGEMENT_URL: Readonly<Record<StoreBillingSource, string>> = {
  apple: 'https://apps.apple.com/account/subscriptions',
  google: 'https://play.google.com/store/account/subscriptions',
};

export const STORE_BILLING_NAME: Readonly<Record<StoreBillingSource, string>> = {
  apple: 'Apple',
  google: 'Google Play',
};

export function isStoreBillingSource(value: unknown): value is StoreBillingSource {
  return value === 'apple' || value === 'google';
}
