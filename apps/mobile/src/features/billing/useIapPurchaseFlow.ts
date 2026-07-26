/**
 * IAP purchase flow — StoreKit 2 (iOS) / Play Billing (Android) via `react-native-iap`.
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
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import type {
  useIAP as UseIAP,
  deepLinkToSubscriptions as DeepLinkToSubscriptions,
  getAvailablePurchases as GetAvailablePurchases,
  Purchase,
  PurchaseError,
} from 'react-native-iap';
import type { BillingInterval } from '@agiworkforce/types';
import { api } from '@/services/api';
import { getAllIapSkus, getIapProductId, resolveTierFromSku } from './iapProducts';
import type { PurchasableTier } from './iapProducts';
import { useIapStore } from './iapStore';
import { useTierStore } from './store';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

function loadReactNativeIap(): {
  useIAP: typeof UseIAP;
  deepLinkToSubscriptions: typeof DeepLinkToSubscriptions;
  getAvailablePurchases: typeof GetAvailablePurchases;
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-iap');
}

const IAP_PLATFORM: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

interface IapVerifyResponse {
  success: boolean;
  planTier: string;
  status: string;
  currentPeriodEnd: string | null;
}

/**
 * Reports a completed purchase to `POST /api/mobile/iap/verify` for receipt
 * validation + tier activation. Must resolve before the caller finalizes the
 * transaction with the store (`finishTransaction`) — see the call sites below.
 *
 * `purchase.purchaseToken` is react-native-iap's unified field: the StoreKit 2
 * JWS representation on iOS, the Play Billing purchase token on Android — it
 * maps directly onto the verify route's `receipt` (iOS) / `purchaseToken`
 * (Android) fields.
 */
async function reportPurchaseToServer(purchase: Purchase): Promise<void> {
  const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
  const token = purchase.purchaseToken;
  if (!token) {
    throw new Error(
      `iap: purchase for ${purchase.productId} has no receipt/purchaseToken to verify`,
    );
  }

  await api.post<IapVerifyResponse>('/api/mobile/iap/verify', {
    platform,
    productId: purchase.productId,
    ...(platform === 'ios' ? { receipt: token } : { purchaseToken: token }),
  });
}

export interface UseIapPurchaseFlowResult {
  connected: boolean;
  purchase: (tier: PurchasableTier, interval: BillingInterval) => Promise<void>;
  restore: () => Promise<void>;
  manageSubscription: () => Promise<void>;
}

interface PurchaseAttempt {
  account: CloudAccountEpoch;
  productId: string;
}

function purchaseAttemptId(purchase: Purchase): string | null {
  if ('appAccountToken' in purchase && purchase.appAccountToken) {
    return purchase.appAccountToken;
  }
  if ('obfuscatedAccountIdAndroid' in purchase && purchase.obfuscatedAccountIdAndroid) {
    return purchase.obfuscatedAccountIdAndroid;
  }
  return null;
}

export function useIapPurchaseFlow(): UseIapPurchaseFlowResult {
  const startPurchase = useIapStore((s) => s.startPurchase);
  const markVerifying = useIapStore((s) => s.markVerifying);
  const markSuccess = useIapStore((s) => s.markSuccess);
  const markError = useIapStore((s) => s.markError);
  const setStatus = useIapStore((s) => s.setStatus);
  const purchaseAttemptsRef = useRef(new Map<string, PurchaseAttempt>());

  // Loaded on first render of whatever component calls this hook — see the
  // module-header comment for why this can't be a top-level import.
  const { useIAP, deepLinkToSubscriptions, getAvailablePurchases } = loadReactNativeIap();

  const { connected, requestPurchase, restorePurchases, finishTransaction, fetchProducts } = useIAP(
    {
      onPurchaseSuccess: (nativePurchase: Purchase) => {
        const attemptId = purchaseAttemptId(nativePurchase);
        const attempt = attemptId ? purchaseAttemptsRef.current.get(attemptId) : undefined;
        if (
          !attemptId ||
          !attempt ||
          attempt.productId !== nativePurchase.productId ||
          !isCloudAccountEpochCurrent(attempt.account)
        ) {
          if (attemptId) purchaseAttemptsRef.current.delete(attemptId);
          return;
        }
        void (async () => {
          markVerifying();
          try {
            await reportPurchaseToServer(nativePurchase);
            if (!isCloudAccountEpochCurrent(attempt.account)) return;
            // Only finalize with the store after the server confirms the
            // receipt is valid and the tier is activated — finishing first
            // would let a failed-verification purchase silently vanish from
            // the StoreKit/Play queue with no server record.
            await finishTransaction({ purchase: nativePurchase, isConsumable: false });
            if (!isCloudAccountEpochCurrent(attempt.account)) return;
            await useTierStore.getState().refreshTier();
            if (!isCloudAccountEpochCurrent(attempt.account)) return;
            markSuccess();
          } catch (err) {
            if (!isCloudAccountEpochCurrent(attempt.account)) return;
            markError(err instanceof Error ? err.message : 'Purchase verification failed');
          } finally {
            purchaseAttemptsRef.current.delete(attemptId);
          }
        })();
      },
      onPurchaseError: (error: PurchaseError) => {
        const matchingAttempts = Array.from(purchaseAttemptsRef.current.entries()).filter(
          ([, attempt]) => !error.productId || attempt.productId === error.productId,
        );
        // PurchaseError has no account token. Fail closed when more than one
        // attempt could match (for example, account A and B bought the same SKU).
        if (matchingAttempts.length !== 1) return;
        const [attemptId, attempt] = matchingAttempts[0]!;
        if (!isCloudAccountEpochCurrent(attempt.account)) return;
        markError(error.message);
        purchaseAttemptsRef.current.delete(attemptId);
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
      const purchaseOwner = captureCloudAccountEpoch();
      if (!purchaseOwner) {
        markError('Sign in to AGI Cloud before starting a subscription purchase.');
        return;
      }
      const sku = getIapProductId(tier, interval, IAP_PLATFORM);
      if (!sku) {
        markError(`iap: no product configured for ${tier}/${interval} on ${IAP_PLATFORM}`);
        return;
      }
      const attemptId = uuidv7();
      purchaseAttemptsRef.current.set(attemptId, { account: purchaseOwner, productId: sku });
      startPurchase(tier, interval);
      try {
        if (IAP_PLATFORM === 'ios') {
          await requestPurchase({
            type: 'subs',
            request: { apple: { sku, appAccountToken: attemptId } },
          });
        } else {
          await requestPurchase({
            type: 'subs',
            request: { google: { skus: [sku], obfuscatedAccountId: attemptId } },
          });
        }
      } catch (err) {
        if (isCloudAccountEpochCurrent(purchaseOwner)) {
          markError(err instanceof Error ? err.message : 'Purchase request failed');
        }
        purchaseAttemptsRef.current.delete(attemptId);
      }
    },
    [requestPurchase, startPurchase, markError],
  );

  const restore = useCallback(async () => {
    const restoreOwner = captureCloudAccountEpoch();
    if (!restoreOwner) {
      markError('Sign in to AGI Cloud before restoring subscription purchases.');
      return;
    }
    setStatus('restoring');
    try {
      await restorePurchases();
      if (!isCloudAccountEpochCurrent(restoreOwner)) return;
      // The hook's restore method populates reactive state and returns void.
      // Reading `availablePurchases` here would use this callback's pre-restore
      // render closure. Query the root API for the actual immutable result
      // after StoreKit/Play sync, then reconcile it with the server.
      const restoredPurchases = await getAvailablePurchases();
      if (!isCloudAccountEpochCurrent(restoreOwner)) return;
      const results = await Promise.allSettled(
        restoredPurchases.map((purchase) => reportPurchaseToServer(purchase)),
      );
      if (!isCloudAccountEpochCurrent(restoreOwner)) return;
      const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failure) {
        throw failure.reason instanceof Error
          ? failure.reason
          : new Error('One or more restored purchases failed verification');
      }
      await useTierStore.getState().refreshTier();
      if (!isCloudAccountEpochCurrent(restoreOwner)) return;
      markSuccess();
    } catch (err) {
      if (isCloudAccountEpochCurrent(restoreOwner)) {
        markError(err instanceof Error ? err.message : 'Restore purchases failed');
      }
    }
  }, [restorePurchases, getAvailablePurchases, setStatus, markSuccess, markError]);

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
