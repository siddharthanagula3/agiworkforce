import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  getPendingTransactionsIOS,
  useIAP,
  type Product,
  type ProductSubscription,
  type Purchase,
  type PurchaseError,
} from 'expo-iap';
import {
  MOBILE_IAP_DEFAULT_ANDROID_REPLACEMENT_MODES,
  mobileIapPlanChangeDirection,
  type MobileIapCatalogResponse,
  type MobileIapProductKey,
  type MobileIapVerifyResponse,
} from '@agiworkforce/types';
import {
  clearAwaitingApproval,
  markAwaitingApproval,
  readAwaitingApproval,
} from './awaitingApproval';
import { useTierStore } from './store';
import { fetchMobileIapCatalog, verifyMobileIapPurchase } from './mobileIapService';
import { UNPRICED, storePrice, type StorePrice } from './storePricing';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { ApiHttpError } from '@/services/apiErrors';

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
  /** Purchases the store is holding for payment or for a family organiser's approval. */
  awaitingApproval: ReadonlySet<MobileIapProductKey>;
  /** The plan the store will switch to at the next renewal, when it has told us. */
  scheduledProductKey: MobileIapProductKey | null;
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

// StoreKit reports Ask to Buy as `deferred-payment` and Play reports a payment
// still in progress as `pending`. Neither is a failure: the transaction arrives
// later through the purchase listener or the next unfinished-transaction sweep.
function isAwaitingApproval(error: PurchaseError | Error): boolean {
  const code = 'code' in error ? String(error.code) : '';
  return code === 'deferred-payment' || code === 'pending';
}

function awaitingStoreAcknowledgement(purchase: Purchase): boolean {
  return 'isAcknowledgedAndroid' in purchase && purchase.isAcknowledgedAndroid === false;
}

// Play keeps a consumable in the buyer's library until the device consumes it,
// and the server's acknowledgement does not: one still listed after it was
// granted blocks buying the same top-up again.
function awaitingConsumption(
  purchase: Purchase,
  consumableProductIds: readonly string[] | undefined,
): boolean {
  return (
    Platform.OS === 'android' &&
    purchase.purchaseState === 'purchased' &&
    consumableProductIds?.includes(purchase.productId) === true
  );
}

const PURCHASE_REFUSAL_STATUSES: ReadonlySet<number> = new Set([403, 409]);
const UNVERIFIED_PURCHASE_MESSAGE =
  'The purchase could not be verified yet. It has not been discarded. Try Restore purchases shortly.';

// A refusal the server explains, such as a plan another channel already bills or
// a test purchase on an account not set up for one, is shown as the server put it.
function verificationFailureMessage(error: unknown): string {
  return error instanceof ApiHttpError && PURCHASE_REFUSAL_STATUSES.has(error.status)
    ? error.message
    : UNVERIFIED_PURCHASE_MESSAGE;
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
  const [askedApproval, setAskedApproval] = useState<readonly MobileIapProductKey[]>([]);
  const pendingPurchaseKey = useRef<MobileIapProductKey | null>(null);
  const catalogRef = useRef<MobileIapCatalogResponse | null>(null);
  const catalogAccountRef = useRef<CloudAccountEpoch | null>(null);
  const catalogRequestRef = useRef(0);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const processingTokens = useRef(new Set<string>());
  const verifiedTokens = useRef(
    new Map<
      string,
      {
        account: CloudAccountEpoch;
        kind: MobileIapVerifyResponse['kind'];
        storeAcknowledged: boolean;
      }
    >(),
  );
  const sweptUnfinishedFor = useRef<CloudAccountEpoch | null>(null);
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
    pendingPurchaseKey.current = null;
    purchaseInFlight.current = false;
    setPurchasingKey(null);
  }, []);

  const keyForProductId = useCallback(
    (productId: string | null | undefined): MobileIapProductKey | null =>
      catalogRef.current?.products.find((product) => product.productId === productId)?.key ?? null,
    [],
  );

  const noteAwaitingApproval = useCallback((key: MobileIapProductKey | null) => {
    const account = captureCloudAccountEpoch();
    if (!key || !account) return;
    setAskedApproval(markAwaitingApproval(account.ownerId, key));
  }, []);

  const settleAwaitingApproval = useCallback((key: MobileIapProductKey | null) => {
    const account = captureCloudAccountEpoch();
    if (!key || !account) return;
    setAskedApproval(clearAwaitingApproval(account.ownerId, key));
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
        const pendingKey = keyForProductId(purchase.productId);
        noteAwaitingApproval(pendingKey);
        releasePurchase(purchase.productId, account);
        if (!pendingKey) {
          setError('Payment is pending in the store. Access will update after payment completes.');
        }
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
        const reusable =
          cached?.account.ownerId === account.ownerId && cached.account.epoch === account.epoch
            ? cached
            : null;
        let kind = reusable?.kind ?? null;
        let storeAcknowledged = reusable?.storeAcknowledged ?? false;
        if (!kind) {
          const result = await verifyMobileIapPurchase({
            platform,
            productId: purchase.productId,
            purchaseToken: token,
          });
          if (!isCloudAccountEpochCurrent(account)) return;
          kind = result.kind;
          storeAcknowledged = result.storeAcknowledged === true;
          verifiedTokens.current.set(token, { account, kind, storeAcknowledged });
          setLastResult(result);
          settleAwaitingApproval(keyForProductId(purchase.productId));
        }
        if (!isCloudAccountEpochCurrent(account)) return;
        // A consumable is always finished here, because only the device can consume
        // it. A subscription the server already acknowledged with Play needs nothing
        // more, and asking Play to acknowledge it twice is reported as a failure.
        const settledByServer =
          platform === 'android' && kind === 'subscription' && storeAcknowledged;
        if (settledByServer) {
          acknowledgedTokens.current.add(token);
          unacknowledgedTokens.current.delete(token);
        }
        const acknowledged =
          settledByServer ||
          (await acknowledgeOnce(token, purchase, kind === 'top_up', finishTransaction));
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
      } catch (verificationError) {
        if (!isCloudAccountEpochCurrent(account)) return;
        setError(verificationFailureMessage(verificationError));
      } finally {
        processingTokens.current.delete(token);
        releasePurchase(purchase.productId, account);
      }
    },
    [
      acknowledgeOnce,
      keyForProductId,
      noteAwaitingApproval,
      refreshTier,
      releasePurchase,
      settleAwaitingApproval,
    ],
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
      if (isAwaitingApproval(purchaseError)) {
        noteAwaitingApproval(
          keyForProductId(purchaseError.productId) ?? pendingPurchaseKey.current,
        );
        releasePurchase();
        return;
      }
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
    getActiveSubscriptions: getStoreActiveSubscriptions,
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
      setAskedApproval(readAwaitingApproval(account.ownerId));
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
      if (subscriptions.length > 0) {
        void fetchStoreProducts({ skus: subscriptions, type: 'subs' });
        void getStoreActiveSubscriptions(subscriptions);
      }
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
    getStoreActiveSubscriptions,
    getStoreAvailablePurchases,
    storeConnected,
  ]);

  // A purchase approved while the app was closed is an unfinished StoreKit
  // transaction that no listener was mounted to receive. It is verified and
  // finished here, once per account, the first time Billing opens.
  useEffect(() => {
    if (Platform.OS !== 'ios' || !enabled || !storeConnected || catalogLoading || !catalog) return;
    const account = catalogAccountRef.current;
    if (!account || !isCloudAccountEpochCurrent(account)) return;
    if (sweptUnfinishedFor.current === account) return;
    sweptUnfinishedFor.current = account;
    const finishTransaction = iap.finishTransaction;
    void getPendingTransactionsIOS()
      .then((unfinished) =>
        Promise.allSettled(
          unfinished.map((purchase) => processPurchase(purchase, finishTransaction)),
        ),
      )
      .catch(() => {
        sweptUnfinishedFor.current = null;
      });
  }, [catalog, catalogLoading, enabled, iap.finishTransaction, processPurchase, storeConnected]);

  useEffect(() => {
    if (!enabled || !storeConnected) return;
    const restoreAccount = restoring && restoreFetchCompleted ? restoringAccount.current : null;
    const restoreScan = isCloudAccountEpochCurrent(restoreAccount);
    const dispatched: Promise<void>[] = [];
    for (const purchase of iap.availablePurchases) {
      const token = purchase.purchaseToken?.trim();
      if (!token || acknowledgedTokens.current.has(token)) continue;
      const stranded =
        awaitingStoreAcknowledgement(purchase) ||
        unacknowledgedTokens.current.has(token) ||
        awaitingConsumption(purchase, catalog?.consumableProductIds);
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
    catalog,
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
      return storePrice(storeProducts.get(product.productId), product.googleOffer);
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
        pendingPurchaseKey.current = product.key;
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

        const offerToken = storePrice(storeProduct, product.googleOffer).offerToken;
        if (Platform.OS === 'android' && !offerToken) {
          throw new PurchasePreflightError(
            'The store has not returned the offer for this plan. Try again.',
          );
        }
        const ownedAndroidPurchase =
          Platform.OS === 'android'
            ? iap.availablePurchases.find(
                (candidate) =>
                  candidate.purchaseState === 'purchased' &&
                  currentCatalog.products.some(
                    (catalogProduct) =>
                      catalogProduct.kind === 'subscription' &&
                      catalogProduct.productId === candidate.productId,
                  ),
              )
            : undefined;
        const ownedProduct = currentCatalog.products.find(
          (candidate) => candidate.productId === ownedAndroidPurchase?.productId,
        );
        const direction =
          ownedProduct?.kind === 'subscription'
            ? mobileIapPlanChangeDirection(ownedProduct.planTier, product.planTier)
            : null;
        if (ownedProduct && !direction) {
          throw new PurchasePreflightError('You are already on this plan.');
        }
        const replacementModes =
          currentCatalog.androidReplacementModes ?? MOBILE_IAP_DEFAULT_ANDROID_REPLACEMENT_MODES;

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
              ...(ownedAndroidPurchase?.purchaseToken && direction
                ? {
                    purchaseToken: ownedAndroidPurchase.purchaseToken,
                    subscriptionProductReplacementParams: {
                      oldProductId: ownedAndroidPurchase.productId,
                      replacementMode: replacementModes[direction],
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

  const awaitingApproval = useMemo(() => {
    const keys = new Set<MobileIapProductKey>(askedApproval);
    for (const candidate of iap.availablePurchases) {
      if (candidate.purchaseState !== 'pending') continue;
      const key = catalog?.products.find(
        (product) => product.productId === candidate.productId,
      )?.key;
      if (key) keys.add(key);
    }
    return keys;
  }, [askedApproval, catalog, iap.availablePurchases]);

  const scheduledProductKey = useMemo(() => {
    for (const active of iap.activeSubscriptions) {
      const next = active.renewalInfoIOS?.autoRenewPreference;
      if (!next || next === active.productId || active.renewalInfoIOS?.willAutoRenew === false) {
        continue;
      }
      const key = catalog?.products.find((product) => product.productId === next)?.key;
      if (key) return key;
    }
    return null;
  }, [catalog, iap.activeSubscriptions]);

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
    awaitingApproval,
    scheduledProductKey,
    purchase,
    restore,
    reload,
  };
}
