import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  useIAP,
  type Product,
  type ProductSubscription,
  type Purchase,
  type PurchaseError,
} from 'expo-iap';
import type {
  MobileIapCatalogProduct,
  MobileIapCatalogResponse,
  MobileIapProductKey,
  MobileIapVerifyResponse,
} from '@agiworkforce/types';
import { useTierStore } from './store';
import { fetchMobileIapCatalog, verifyMobileIapPurchase } from './mobileIapService';

type StoreProduct = Product | ProductSubscription;
type FinishTransaction = (input: { purchase: Purchase; isConsumable?: boolean }) => Promise<void>;

export interface MobileIapState {
  connected: boolean;
  loading: boolean;
  restoring: boolean;
  purchasingKey: MobileIapProductKey | null;
  catalog: MobileIapCatalogResponse | null;
  storeProducts: ReadonlyMap<string, StoreProduct>;
  error: string | null;
  lastResult: MobileIapVerifyResponse | null;
  purchase: (key: MobileIapProductKey) => Promise<void>;
  restore: () => Promise<void>;
  reload: () => Promise<void>;
}

function purchaseErrorMessage(error: PurchaseError | Error): string {
  const message = error.message.trim();
  if (
    /cancel/i.test(message) ||
    ('code' in error && String(error.code).includes('user-cancelled'))
  ) {
    return 'Purchase canceled.';
  }
  return message || 'The store could not complete this purchase.';
}

export function useMobileIap({ enabled }: { enabled: boolean }): MobileIapState {
  const refreshTier = useTierStore((state) => state.refreshTier);
  const [catalog, setCatalog] = useState<MobileIapCatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [purchasingKey, setPurchasingKey] = useState<MobileIapProductKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<MobileIapVerifyResponse | null>(null);
  const catalogRef = useRef<MobileIapCatalogResponse | null>(null);
  const processingTokens = useRef(new Set<string>());
  const finishTransactionRef = useRef<FinishTransaction | null>(null);

  const processPurchase = useCallback(
    async (purchase: Purchase, finishTransaction: FinishTransaction) => {
      if (purchase.purchaseState === 'pending') {
        setError('Payment is pending in the store. Access will update after payment completes.');
        return;
      }
      const currentCatalog = catalogRef.current;
      const token = purchase.purchaseToken?.trim();
      const product = currentCatalog?.products.find(
        (candidate) => candidate.productId === purchase.productId,
      );
      if (!currentCatalog?.enabled || !currentCatalog.platform || !token || !product) {
        setError('The store returned a purchase that AGI could not safely match.');
        return;
      }
      if (processingTokens.current.has(token)) return;
      processingTokens.current.add(token);
      setError(null);
      try {
        const result = await verifyMobileIapPurchase({
          platform: currentCatalog.platform,
          productId: product.productId,
          purchaseToken: token,
        });
        // Finish only after the server has atomically recorded the entitlement
        // or grant. If this call fails, StoreKit/Play replays the transaction;
        // the server receipt is idempotent and the next attempt finishes it.
        await finishTransaction({ purchase, isConsumable: product.kind === 'top_up' });
        setLastResult(result);
        await refreshTier();
      } catch (purchaseError) {
        setError(
          purchaseError instanceof Error
            ? purchaseError.message
            : 'The purchase could not be verified. It has not been discarded.',
        );
      } finally {
        processingTokens.current.delete(token);
        setPurchasingKey(null);
        setRestoring(false);
      }
    },
    [refreshTier],
  );

  const iap = useIAP({
    onPurchaseSuccess: (purchase) => {
      const finishTransaction = finishTransactionRef.current;
      if (!finishTransaction) {
        setError('The native store connection is not ready to finish this purchase.');
        return;
      }
      void processPurchase(purchase, finishTransaction);
    },
    onPurchaseError: (purchaseError) => {
      setPurchasingKey(null);
      setError(purchaseErrorMessage(purchaseError));
    },
    onError: (iapError) => setError(iapError.message),
  });
  finishTransactionRef.current = iap.finishTransaction;
  const {
    connected: storeConnected,
    fetchProducts: fetchStoreProducts,
    getAvailablePurchases: getStoreAvailablePurchases,
  } = iap;

  const reload = useCallback(async () => {
    if (!enabled || !storeConnected) {
      catalogRef.current = null;
      setCatalog(null);
      setCatalogLoading(false);
      return;
    }
    setCatalogLoading(true);
    setError(null);
    try {
      const nextCatalog = await fetchMobileIapCatalog();
      catalogRef.current = nextCatalog;
      setCatalog(nextCatalog);
    } catch (catalogError) {
      setCatalog(null);
      catalogRef.current = null;
      setError(
        catalogError instanceof Error
          ? catalogError.message
          : 'Native purchases are unavailable right now.',
      );
    } finally {
      setCatalogLoading(false);
    }
  }, [enabled, storeConnected]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!storeConnected || !catalog?.enabled) return;
    const subscriptions = catalog.products
      .filter((product) => product.kind === 'subscription')
      .map((product) => product.productId);
    const topUps = catalog.products
      .filter((product) => product.kind === 'top_up')
      .map((product) => product.productId);
    if (subscriptions.length > 0) void fetchStoreProducts({ skus: subscriptions, type: 'subs' });
    if (topUps.length > 0) void fetchStoreProducts({ skus: topUps, type: 'in-app' });
    void getStoreAvailablePurchases({
      onlyIncludeActiveItemsIOS: true,
      includeSuspendedAndroid: false,
    });
  }, [catalog, fetchStoreProducts, getStoreAvailablePurchases, storeConnected]);

  useEffect(() => {
    if (!restoring) return;
    for (const purchase of iap.availablePurchases) {
      void processPurchase(purchase, iap.finishTransaction);
    }
    if (iap.availablePurchases.length === 0) setRestoring(false);
  }, [iap.availablePurchases, iap.finishTransaction, processPurchase, restoring]);

  const storeProducts = useMemo(
    () =>
      new Map<string, StoreProduct>(
        [...iap.products, ...iap.subscriptions].map((product) => [product.id, product]),
      ),
    [iap.products, iap.subscriptions],
  );

  const purchase = useCallback(
    async (key: MobileIapProductKey) => {
      const currentCatalog = catalogRef.current;
      const product = currentCatalog?.products.find((candidate) => candidate.key === key);
      if (
        !iap.connected ||
        !currentCatalog?.enabled ||
        !currentCatalog.appAccountToken ||
        !product
      ) {
        setError('This native store product is not available in the current build.');
        return;
      }
      const storeProduct = storeProducts.get(product.productId);
      if (!storeProduct) {
        setError('The store has not returned pricing for this product. Try again.');
        return;
      }

      setError(null);
      setLastResult(null);
      setPurchasingKey(key);
      try {
        if (product.kind === 'top_up') {
          await iap.requestPurchase({
            type: 'in-app',
            request: {
              apple: {
                sku: product.productId,
                appAccountToken: currentCatalog.appAccountToken,
              },
              google: {
                skus: [product.productId],
                obfuscatedAccountId: currentCatalog.appAccountToken,
              },
            },
          });
          return;
        }

        const androidProduct =
          storeProduct.type === 'subs' && storeProduct.platform === 'android' ? storeProduct : null;
        const offerToken = androidProduct?.subscriptionOffers.find(
          (offer) => typeof offer.offerTokenAndroid === 'string',
        )?.offerTokenAndroid;
        const existingAndroidSubscription =
          Platform.OS === 'android'
            ? iap.availablePurchases.find((candidate) =>
                currentCatalog.products.some(
                  (catalogProduct) =>
                    catalogProduct.kind === 'subscription' &&
                    catalogProduct.productId === candidate.productId,
                ),
              )
            : undefined;

        await iap.requestPurchase({
          type: 'subs',
          request: {
            apple: {
              sku: product.productId,
              appAccountToken: currentCatalog.appAccountToken,
            },
            google: {
              skus: [product.productId],
              obfuscatedAccountId: currentCatalog.appAccountToken,
              ...(offerToken
                ? { subscriptionOffers: [{ sku: product.productId, offerToken }] }
                : {}),
              ...(existingAndroidSubscription?.purchaseToken &&
              existingAndroidSubscription.productId !== product.productId
                ? {
                    purchaseToken: existingAndroidSubscription.purchaseToken,
                    subscriptionProductReplacementParams: {
                      oldProductId: existingAndroidSubscription.productId,
                      replacementMode: 'charge-prorated-price' as const,
                    },
                  }
                : {}),
            },
          },
        });
      } catch (requestError) {
        setPurchasingKey(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'The store could not start this purchase.',
        );
      }
    },
    [iap, storeProducts],
  );

  const restore = useCallback(async () => {
    if (!iap.connected || !catalogRef.current?.enabled) {
      setError('The native store is not connected.');
      return;
    }
    setError(null);
    setLastResult(null);
    setRestoring(true);
    try {
      await iap.getAvailablePurchases({
        onlyIncludeActiveItemsIOS: true,
        includeSuspendedAndroid: false,
      });
    } catch (restoreError) {
      setRestoring(false);
      setError(
        restoreError instanceof Error ? restoreError.message : 'Purchases could not be restored.',
      );
    }
  }, [iap]);

  return {
    connected: iap.connected,
    loading: catalogLoading || (enabled && !storeConnected && error === null),
    restoring,
    purchasingKey,
    catalog,
    storeProducts,
    error,
    lastResult,
    purchase,
    restore,
    reload,
  };
}

export function mobileIapProductByKey(
  catalog: MobileIapCatalogResponse | null,
  key: MobileIapProductKey,
): MobileIapCatalogProduct | null {
  return catalog?.products.find((product) => product.key === key) ?? null;
}
