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
import { UNPRICED, storePrice, type StorePrice } from './storePricing';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

type StoreProduct = Product | ProductSubscription;
type FinishTransaction = (input: { purchase: Purchase; isConsumable?: boolean }) => Promise<void>;

class PurchasePreflightError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}

export interface MobileIapState {
  connected: boolean;
  loading: boolean;
  restoring: boolean;
  purchasingKey: MobileIapProductKey | null;
  catalog: MobileIapCatalogResponse | null;
  storeProducts: ReadonlyMap<string, StoreProduct>;
  /** The store's own localized price for a product, and the offer it belongs to. */
  priceFor: (key: MobileIapProductKey) => StorePrice;
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
  return 'The store could not complete this purchase. Please try again.';
}

function awaitingStoreAcknowledgement(purchase: Purchase): boolean {
  return 'isAcknowledgedAndroid' in purchase && purchase.isAcknowledgedAndroid === false;
}

export function useMobileIap({ enabled }: { enabled: boolean }): MobileIapState {
  const refreshTier = useTierStore((state) => state.refreshTier);
  const [catalog, setCatalog] = useState<MobileIapCatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [restoreFetchCompleted, setRestoreFetchCompleted] = useState(false);
  const [purchasingKey, setPurchasingKey] = useState<MobileIapProductKey | null>(null);
  const purchaseInFlight = useRef(false);
  const pendingPurchaseProductId = useRef<string | null>(null);
  const pendingPurchaseAccount = useRef<CloudAccountEpoch | null>(null);
  const restoringAccount = useRef<CloudAccountEpoch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<MobileIapVerifyResponse | null>(null);
  const catalogRef = useRef<MobileIapCatalogResponse | null>(null);
  const catalogAccountRef = useRef<CloudAccountEpoch | null>(null);
  const catalogRequestRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const processingTokens = useRef(new Set<string>());
  const verifiedTokens = useRef(
    new Map<string, { account: CloudAccountEpoch; kind: MobileIapVerifyResponse['kind'] }>(),
  );
  const acknowledgedTokens = useRef(new Set<string>());
  const unacknowledgedTokens = useRef(new Set<string>());
  const finishTransactionRef = useRef<FinishTransaction | null>(null);
  const releasePurchase = useCallback((productId?: string, account?: CloudAccountEpoch | null) => {
    if (productId && pendingPurchaseProductId.current !== productId) return;
    if (
      account &&
      pendingPurchaseAccount.current &&
      (pendingPurchaseAccount.current.ownerId !== account.ownerId ||
        pendingPurchaseAccount.current.epoch !== account.epoch)
    )
      return;
    pendingPurchaseProductId.current = null;
    pendingPurchaseAccount.current = null;
    purchaseInFlight.current = false;
    setPurchasingKey(null);
  }, []);

  const finishRestore = useCallback((account: CloudAccountEpoch) => {
    if (restoringAccount.current !== account) return;
    restoringAccount.current = null;
    setRestoreFetchCompleted(false);
    setRestoring(false);
  }, []);

  const acknowledgeOnce = useCallback(
    async (
      token: string,
      purchase: Purchase,
      isConsumable: boolean,
      finishTransaction: FinishTransaction,
    ): Promise<boolean> => {
      if (acknowledgedTokens.current.has(token)) return true;
      try {
        await finishTransaction({ purchase, isConsumable });
        acknowledgedTokens.current.add(token);
        unacknowledgedTokens.current.delete(token);
        return true;
      } catch {
        unacknowledgedTokens.current.add(token);
        return false;
      }
    },
    [],
  );

  const processPurchase = useCallback(
    async (purchase: Purchase, finishTransaction: FinishTransaction) => {
      const account = captureCloudAccountEpoch();
      if (!account) {
        releasePurchase(purchase.productId, account);
        setError('Sign in to the Cloud account used for this purchase before restoring it.');
        return;
      }
      if (purchase.purchaseState === 'pending') {
        releasePurchase(purchase.productId, account);
        setError('Payment is pending in the store. Access will update after payment completes.');
        return;
      }
      const token = purchase.purchaseToken?.trim();
      const platform = Platform.OS;
      if ((platform !== 'ios' && platform !== 'android') || !token || !purchase.productId) {
        releasePurchase(purchase.productId || undefined, account);
        setError('The store returned a purchase that AGI could not safely match.');
        return;
      }
      if (processingTokens.current.has(token)) return;
      processingTokens.current.add(token);
      setError(null);
      try {
        // The purchase token is the idempotency key: a replay is answered from the
        // server ledger as already_processed and is never credited a second time.
        const cached = verifiedTokens.current.get(token);
        let kind =
          cached?.account.ownerId === account.ownerId && cached.account.epoch === account.epoch
            ? cached.kind
            : null;
        if (!kind) {
          const result = await verifyMobileIapPurchase({
            platform,
            productId: purchase.productId,
            purchaseToken: token,
          });
          if (!isCloudAccountEpochCurrent(account)) return;
          kind = result.kind;
          verifiedTokens.current.set(token, { account, kind });
          setLastResult(result);
        }
        if (!isCloudAccountEpochCurrent(account)) return;
        const acknowledged = await acknowledgeOnce(
          token,
          purchase,
          kind === 'top_up',
          finishTransaction,
        );
        if (!acknowledged) {
          setError('The store has not confirmed this purchase yet. AGI will confirm it again.');
          return;
        }
        if (!isCloudAccountEpochCurrent(account)) return;
        let refreshed = false;
        try {
          refreshed = await refreshTier();
        } catch {
          refreshed = false;
        }
        if (!refreshed && isCloudAccountEpochCurrent(account)) {
          setError(
            'Purchase confirmed. Your updated plan is taking longer to load. Reopen Billing to refresh it.',
          );
        }
      } catch {
        if (!isCloudAccountEpochCurrent(account)) return;
        setError(
          'The purchase could not be verified yet. It has not been discarded. Try Restore purchases shortly.',
        );
      } finally {
        processingTokens.current.delete(token);
        releasePurchase(purchase.productId, account);
      }
    },
    [acknowledgeOnce, refreshTier, releasePurchase],
  );

  const iap = useIAP({
    onPurchaseSuccess: (purchase) => {
      const finishTransaction = finishTransactionRef.current;
      if (!finishTransaction) {
        releasePurchase(purchase.productId);
        setError('The native store connection is not ready to finish this purchase.');
        return;
      }
      void processPurchase(purchase, finishTransaction);
    },
    onPurchaseError: (purchaseError) => {
      releasePurchase();
      setError(purchaseErrorMessage(purchaseError));
    },
    onError: () => setError('The store connection failed. Please try again.'),
  });
  finishTransactionRef.current = iap.finishTransaction;
  const {
    connected: storeConnected,
    fetchProducts: fetchStoreProducts,
    getAvailablePurchases: getStoreAvailablePurchases,
  } = iap;

  const reload = useCallback(async () => {
    const request = ++catalogRequestRef.current;
    const account = captureCloudAccountEpoch();
    if (!enabled || !storeConnected || !account) {
      catalogRef.current = null;
      catalogAccountRef.current = null;
      setCatalog(null);
      setCatalogLoading(false);
      return;
    }
    setCatalogLoading(true);
    setError(null);
    try {
      const nextCatalog = await fetchMobileIapCatalog();
      if (
        request !== catalogRequestRef.current ||
        !enabledRef.current ||
        !isCloudAccountEpochCurrent(account)
      )
        return;
      catalogRef.current = nextCatalog;
      catalogAccountRef.current = account;
      setCatalog(nextCatalog);
    } catch {
      if (
        request !== catalogRequestRef.current ||
        !enabledRef.current ||
        !isCloudAccountEpochCurrent(account)
      )
        return;
      setCatalog(null);
      catalogRef.current = null;
      catalogAccountRef.current = null;
      setError('Native purchases are unavailable right now. Please try again shortly.');
    } finally {
      if (request === catalogRequestRef.current) setCatalogLoading(false);
    }
  }, [enabled, storeConnected]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!enabled || !storeConnected || catalogLoading) return;
    if (catalog?.enabled) {
      const subscriptions = catalog.products
        .filter((product) => product.kind === 'subscription')
        .map((product) => product.productId);
      const topUps = catalog.products
        .filter((product) => product.kind === 'top_up')
        .map((product) => product.productId);
      if (subscriptions.length > 0) void fetchStoreProducts({ skus: subscriptions, type: 'subs' });
      if (topUps.length > 0) void fetchStoreProducts({ skus: topUps, type: 'in-app' });
    }
    void getStoreAvailablePurchases({
      onlyIncludeActiveItemsIOS: true,
      includeSuspendedAndroid: false,
    });
  }, [
    catalog,
    catalogLoading,
    enabled,
    fetchStoreProducts,
    getStoreAvailablePurchases,
    storeConnected,
  ]);

  useEffect(() => {
    if (!enabled || !storeConnected) return;
    const restoreAccount = restoring && restoreFetchCompleted ? restoringAccount.current : null;
    const restoreScan = isCloudAccountEpochCurrent(restoreAccount);
    const dispatched: Promise<void>[] = [];
    for (const purchase of iap.availablePurchases) {
      const token = purchase.purchaseToken?.trim();
      if (!token || acknowledgedTokens.current.has(token)) continue;
      const stranded =
        awaitingStoreAcknowledgement(purchase) || unacknowledgedTokens.current.has(token);
      if (!restoreScan && !stranded) continue;
      dispatched.push(processPurchase(purchase, iap.finishTransaction));
    }
    if (!restoreAccount) return;
    if (restoreScan && dispatched.length > 0) {
      void Promise.allSettled(dispatched).then(() => finishRestore(restoreAccount));
    } else {
      finishRestore(restoreAccount);
    }
  }, [
    enabled,
    finishRestore,
    iap.availablePurchases,
    iap.finishTransaction,
    processPurchase,
    restoring,
    restoreFetchCompleted,
    storeConnected,
  ]);

  const storeProducts = useMemo(
    () =>
      new Map<string, StoreProduct>(
        [...iap.products, ...iap.subscriptions].map((product) => [product.id, product]),
      ),
    [iap.products, iap.subscriptions],
  );

  const priceFor = useCallback(
    (key: MobileIapProductKey): StorePrice => {
      if (!isCloudAccountEpochCurrent(catalogAccountRef.current)) return UNPRICED;
      const product = catalogRef.current?.products.find((candidate) => candidate.key === key);
      if (!product) return UNPRICED;
      return storePrice(storeProducts.get(product.productId));
    },
    [storeProducts],
  );

  const purchase = useCallback(
    async (key: MobileIapProductKey) => {
      if (purchaseInFlight.current) return;
      const account = catalogAccountRef.current;
      if (
        !enabledRef.current ||
        !iap.connected ||
        !catalogRef.current?.enabled ||
        !isCloudAccountEpochCurrent(account)
      ) {
        setError('This native store product is not available in the current build.');
        return;
      }
      purchaseInFlight.current = true;
      pendingPurchaseAccount.current = account;
      setError(null);
      setLastResult(null);
      setPurchasingKey(key);
      try {
        const currentCatalog = await fetchMobileIapCatalog();
        if (!enabledRef.current || !isCloudAccountEpochCurrent(account)) {
          throw new PurchasePreflightError(
            'The Cloud account changed before this purchase started.',
          );
        }
        catalogRef.current = currentCatalog;
        catalogAccountRef.current = account;
        setCatalog(currentCatalog);
        const product = currentCatalog.products.find((candidate) => candidate.key === key);
        if (!currentCatalog.enabled || !currentCatalog.appAccountToken || !product) {
          throw new PurchasePreflightError(
            currentCatalog.unavailableCode === 'waitlist_access_required'
              ? 'Upgrade access is required.'
              : 'This purchase is no longer available.',
          );
        }
        const storeProduct = storeProducts.get(product.productId);
        if (!storeProduct) {
          throw new PurchasePreflightError(
            'The store has not returned pricing for this product. Try again.',
          );
        }
        pendingPurchaseProductId.current = product.productId;
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

        const offerToken = storePrice(storeProduct).offerToken;
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
        releasePurchase(undefined, account);
        setError(
          requestError instanceof PurchasePreflightError
            ? requestError.userMessage
            : 'The store could not start this purchase. Please try again.',
        );
      }
    },
    [iap, releasePurchase, storeProducts],
  );

  const restore = useCallback(async () => {
    const account = captureCloudAccountEpoch();
    if (!iap.connected || !enabled || !account) {
      setError('Sign in to AGI Cloud and connect to the store before restoring purchases.');
      return;
    }
    setError(null);
    setLastResult(null);
    restoringAccount.current = account;
    setRestoreFetchCompleted(false);
    setRestoring(true);
    try {
      await iap.getAvailablePurchases({
        onlyIncludeActiveItemsIOS: true,
        includeSuspendedAndroid: false,
      });
      if (isCloudAccountEpochCurrent(account)) setRestoreFetchCompleted(true);
      else finishRestore(account);
    } catch {
      finishRestore(account);
      if (isCloudAccountEpochCurrent(account)) {
        setError('Purchases could not be restored. Please try again.');
      }
    }
  }, [enabled, finishRestore, iap]);

  return {
    connected: iap.connected,
    loading: catalogLoading || (enabled && !storeConnected && error === null),
    restoring,
    purchasingKey,
    catalog,
    storeProducts,
    priceFor,
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
