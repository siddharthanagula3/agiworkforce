import { FEATURES } from '@/lib/v1FeatureFlags';

export const NATIVE_PURCHASES_UNAVAILABLE_MESSAGE =
  'In-app purchases are not available in this version.';

export function rejectNativePurchases(): never {
  throw new Error(NATIVE_PURCHASES_UNAVAILABLE_MESSAGE);
}

export function assertNativePurchasesEnabled(): void {
  if (!FEATURES.nativePurchases) rejectNativePurchases();
}
