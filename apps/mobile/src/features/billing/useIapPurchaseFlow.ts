/**
 * IAP purchase flow — StoreKit 2 (iOS) / Play Billing (Android) via `react-native-iap`.
 *
 * NOT wired to a real store yet: `iapProducts.ts` SKUs are placeholders (see that
 * file's header). This hook is the client-side half of subscription purchases;
 * server-side receipt verification is a separate, not-yet-built piece — see
 * `reportPurchaseToServer` below.
 *
 * Reference: Claude's iOS app Billing screen shows "Manage subscription" (opens
 * the native App Store subscription sheet) and "Restore purchases" — no in-app
 * Stripe/web checkout. This hook mirrors that: purchases go through StoreKit/Play
 * Billing exclusively, never a web checkout URL.
 *
 * `react-native-iap` is required lazily inside the hook body, not via a
 * top-level `import`, because its native module (NitroModules) isn't linked
 * in this build yet — a top-level import crashes at module-evaluation time
 * for EVERY consumer of this file's barrel, regardless of FEATURES.iap,
 * since static imports run before any runtime flag check. Deferring to a
 * call-time `require()` means the crash only becomes reachable once this
 * hook actually runs, which only happens when FEATURES.iap is true.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import type {
  useIAP as UseIAP,
  deepLinkToSubscriptions as DeepLinkToSubscriptions,
  Purchase,
  PurchaseError,
} from 'react-native-iap';
import type { BillingInterval } from '@agiworkforce/types';
import { getAllIapSkus, getIapProductId, resolveTierFromSku } from './iapProducts';
import type { PurchasableTier } from './iapProducts';
import { useIapStore } from './iapStore';

function loadReactNativeIap(): {
  useIAP: typeof UseIAP;
  deepLinkToSubscriptions: typeof DeepLinkToSubscriptions;
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-iap');
}

const IAP_PLATFORM: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

/**
 * Reports a completed purchase to the backend for receipt validation + tier
 * activation.
 *
 * BLOCKED: `/api/mobile/iap/*` does not exist yet — this is server work outside
 * this task's scope (see apps/web/app/api/). Wiring this to a real endpoint
 * without one would mean transactions get StoreKit/Play-finalized (money taken)
 * with no server record — i.e. worse than not shipping IAP at all. Left as a
 * clearly-marked stub so it fails loudly (throws) instead of silently
 * pretending to validate.
 */
async function reportPurchaseToServer(_purchase: Purchase): Promise<void> {
  throw new Error(
    'iap: server-side receipt verification endpoint does not exist yet ' +
      '(no apps/web/app/api/mobile/iap/* route) — see reportPurchaseToServer in useIapPurchaseFlow.ts',
  );
}

export interface UseIapPurchaseFlowResult {
  connected: boolean;
  purchase: (tier: PurchasableTier, interval: BillingInterval) => Promise<void>;
  restore: () => Promise<void>;
  manageSubscription: () => Promise<void>;
}

export function useIapPurchaseFlow(): UseIapPurchaseFlowResult {
  const startPurchase = useIapStore((s) => s.startPurchase);
  const markVerifying = useIapStore((s) => s.markVerifying);
  const markSuccess = useIapStore((s) => s.markSuccess);
  const markError = useIapStore((s) => s.markError);
  const setStatus = useIapStore((s) => s.setStatus);

  // Loaded on first render of whatever component calls this hook — see the
  // module-header comment for why this can't be a top-level import.
  const { useIAP, deepLinkToSubscriptions } = loadReactNativeIap();

  const { connected, requestPurchase, restorePurchases, finishTransaction, fetchProducts } = useIAP(
    {
      onPurchaseSuccess: (nativePurchase: Purchase) => {
        void (async () => {
          markVerifying();
          try {
            await reportPurchaseToServer(nativePurchase);
            // Only finalize with the store after the server confirms the
            // receipt is valid and the tier is activated — finishing first
            // would let a failed-verification purchase silently vanish from
            // the StoreKit/Play queue with no server record.
            await finishTransaction({ purchase: nativePurchase, isConsumable: false });
            markSuccess();
          } catch (err) {
            markError(err instanceof Error ? err.message : 'Purchase verification failed');
          }
        })();
      },
      onPurchaseError: (error: PurchaseError) => {
        markError(error.message);
      },
    },
  );

  // Prefetch product/subscription metadata once connected so `products`/
  // `subscriptions` state inside `useIAP` is populated for price display.
  useEffect(() => {
    if (!connected) return;
    const skus = getAllIapSkus(IAP_PLATFORM);
    if (skus.length === 0) return;
    void fetchProducts({ skus, type: 'subs' });
  }, [connected, fetchProducts]);

  const purchase = useCallback(
    async (tier: PurchasableTier, interval: BillingInterval) => {
      const sku = getIapProductId(tier, interval, IAP_PLATFORM);
      if (!sku) {
        markError(`iap: no product configured for ${tier}/${interval} on ${IAP_PLATFORM}`);
        return;
      }
      startPurchase(tier, interval);
      try {
        if (IAP_PLATFORM === 'ios') {
          await requestPurchase({
            type: 'subs',
            request: { apple: { sku } },
          });
        } else {
          await requestPurchase({
            type: 'subs',
            request: { google: { skus: [sku] } },
          });
        }
      } catch (err) {
        markError(err instanceof Error ? err.message : 'Purchase request failed');
      }
    },
    [requestPurchase, startPurchase, markError],
  );

  const restore = useCallback(async () => {
    setStatus('restoring');
    try {
      await restorePurchases();
      // Resolved purchases land in the hook's `availablePurchases` state via
      // `useIAP`; each still needs `reportPurchaseToServer` reconciliation,
      // which is blocked on the same missing backend endpoint noted above.
      markSuccess();
    } catch (err) {
      markError(err instanceof Error ? err.message : 'Restore purchases failed');
    }
  }, [restorePurchases, setStatus, markError]);

  const manageSubscription = useCallback(async () => {
    await deepLinkToSubscriptions();
  }, [deepLinkToSubscriptions]);

  return useMemo(
    () => ({ connected, purchase, restore, manageSubscription }),
    [connected, purchase, restore, manageSubscription],
  );
}

/** Exported for tests / SKU→tier resolution needs outside this hook. */
export { resolveTierFromSku };
