import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { MOBILE_IAP_PRODUCT_DEFINITIONS, type MobileIapCatalogProduct } from '@agiworkforce/types';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

const mockFetchCatalog = jest.fn();
const mockVerifyPurchase = jest.fn();
const mockRefreshTier = jest.fn().mockResolvedValue(true);
const mockFinishTransaction = jest.fn().mockResolvedValue(undefined);
const mockRequestPurchase = jest.fn().mockResolvedValue(null);
const mockUnfinishedTransactions = jest.fn().mockResolvedValue([]);
const mockStored = new Map<string, string>();
let mockCallbacks: Record<string, (...args: unknown[]) => void> = {};
const mockIapState: Record<string, unknown> = {
  connected: true,
  products: [],
  subscriptions: [],
  availablePurchases: [],
  activeSubscriptions: [],
  fetchProducts: jest.fn().mockResolvedValue(undefined),
  requestPurchase: mockRequestPurchase,
  finishTransaction: mockFinishTransaction,
  getAvailablePurchases: jest.fn().mockResolvedValue(undefined),
  getActiveSubscriptions: jest.fn().mockResolvedValue(undefined),
};

jest.mock('expo-iap', () => ({
  useIAP: jest.fn((callbacks: Record<string, (...args: unknown[]) => void>) => {
    mockCallbacks = callbacks;
    return mockIapState;
  }),
  getPendingTransactionsIOS: (...args: unknown[]) => mockUnfinishedTransactions(...args),
}));

jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStored.get(key),
    set: (key: string, value: string) => void mockStored.set(key, value),
    delete: (key: string) => void mockStored.delete(key),
  },
}));

jest.mock('@/src/features/billing/mobileIapService', () => ({
  fetchMobileIapCatalog: (...args: unknown[]) => mockFetchCatalog(...args),
  verifyMobileIapPurchase: (...args: unknown[]) => mockVerifyPurchase(...args),
}));

jest.mock('@/src/features/billing/store', () => ({
  useTierStore: (selector: (state: { refreshTier: typeof mockRefreshTier }) => unknown) =>
    selector({ refreshTier: mockRefreshTier }),
}));

import { useMobileIap } from '@/src/features/billing/useMobileIap';

const accountToken = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = 'billing-purchase-flow-account';
const productId = (key: string) => `fixture.${key}`;
const definition = (key: string) =>
  MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.key === key)!;
const catalogProduct = (key: string, android: boolean): MobileIapCatalogProduct => ({
  ...definition(key),
  productId: productId(key),
  ...(android && definition(key).kind === 'subscription'
    ? { googleOffer: { basePlanId: 'monthly', offerId: null } }
    : {}),
});
const ALL_KEYS = MOBILE_IAP_PRODUCT_DEFINITIONS.map((item) => item.key);

function catalog(platform: 'ios' | 'android', extra: Record<string, unknown> = {}) {
  return {
    enabled: true,
    platform,
    appAccountToken: accountToken,
    products: ALL_KEYS.map((key) => catalogProduct(key, platform === 'android')),
    unavailableReason: null,
    ...extra,
  };
}

function androidSubscription(key: string) {
  return {
    id: productId(key),
    type: 'subs',
    platform: 'android',
    displayPrice: 'first-offer-price',
    currency: 'USD',
    subscriptionOffers: [
      {
        id: 'launch',
        basePlanIdAndroid: 'monthly',
        offerTokenAndroid: `token-${key}-launch`,
        displayPrice: 'Free',
        price: 0,
        pricingPhasesAndroid: {
          pricingPhaseList: [
            { formattedPrice: 'Free', priceAmountMicros: '0' },
            { formattedPrice: 'US$20.00', priceAmountMicros: '20000000' },
          ],
        },
      },
      {
        id: 'yearly-base',
        basePlanIdAndroid: 'yearly',
        offerTokenAndroid: `token-${key}-yearly`,
        displayPrice: 'US$200.00',
        price: 200,
        pricingPhasesAndroid: {
          pricingPhaseList: [{ formattedPrice: 'US$200.00', priceAmountMicros: '200000000' }],
        },
      },
      {
        id: '',
        basePlanIdAndroid: 'monthly',
        offerTokenAndroid: `token-${key}-monthly`,
        displayPrice: 'US$20.00',
        price: 20,
        pricingPhasesAndroid: {
          pricingPhaseList: [{ formattedPrice: 'US$20.00', priceAmountMicros: '20000000' }],
        },
      },
    ],
  };
}

function iosProduct(key: string) {
  return {
    id: productId(key),
    type: definition(key).kind === 'subscription' ? 'subs' : 'in-app',
    platform: 'ios',
    displayPrice: `price:${key}`,
    currency: 'USD',
  };
}

function verified(key: string, extra: Record<string, unknown> = {}) {
  const item = definition(key);
  return {
    success: true,
    kind: item.kind,
    productKey: key,
    status: item.kind === 'subscription' ? 'active' : 'granted',
    ...extra,
  };
}

async function mountHook(platform: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
  mockFetchCatalog.mockResolvedValue(catalog(platform));
  const hook = renderHook(() => useMobileIap({ enabled: true }));
  await waitFor(() => expect(hook.result.current.catalog?.enabled).toBe(true));
  await act(async () => undefined);
  return hook;
}

function googleRequest() {
  return (
    mockRequestPurchase.mock.calls.at(-1)?.[0] as { request: { google: Record<string, unknown> } }
  ).request.google;
}

describe('buying through the store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStored.clear();
    __resetCloudAccountSessionForTests();
    activateCloudAccount(ACCOUNT_ID);
    mockFinishTransaction.mockResolvedValue(undefined);
    mockUnfinishedTransactions.mockResolvedValue([]);
    Object.assign(mockIapState, {
      connected: true,
      products: [],
      subscriptions: [],
      availablePurchases: [],
      activeSubscriptions: [],
    });
  });

  describe('Google Play offers and plan changes', () => {
    beforeEach(() => {
      Object.assign(mockIapState, {
        subscriptions: ALL_KEYS.filter((key) => key.startsWith('subscription')).map(
          androidSubscription,
        ),
      });
    });

    it('prices and buys the base plan the catalog names, never the first offer listed', async () => {
      const { result } = await mountHook('android');

      expect(result.current.priceFor('subscription_pro_monthly')).toMatchObject({
        label: 'US$20.00',
        offerToken: 'token-subscription_pro_monthly-monthly',
      });
      await act(async () => result.current.purchase('subscription_pro_monthly'));

      expect(googleRequest()).toMatchObject({
        skus: [productId('subscription_pro_monthly')],
        obfuscatedAccountId: accountToken,
        subscriptionOffers: [
          {
            sku: productId('subscription_pro_monthly'),
            offerToken: 'token-subscription_pro_monthly-monthly',
          },
        ],
      });
      expect(googleRequest()).not.toHaveProperty('subscriptionProductReplacementParams');
    });

    it('buys a named discounted offer when the catalog configures one', async () => {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
      const withOffer = catalog('android');
      withOffer.products = withOffer.products.map((product) =>
        product.key === 'subscription_pro_monthly'
          ? { ...product, googleOffer: { basePlanId: 'monthly', offerId: 'launch' } }
          : product,
      );
      mockFetchCatalog.mockResolvedValue(withOffer);
      const { result } = renderHook(() => useMobileIap({ enabled: true }));
      await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));

      expect(result.current.priceFor('subscription_pro_monthly')).toMatchObject({
        label: 'US$20.00',
        offerToken: 'token-subscription_pro_monthly-launch',
      });
    });

    it('refuses to start a purchase when the configured base plan is not in the store', async () => {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
      const misconfigured = catalog('android');
      misconfigured.products = misconfigured.products.map((product) =>
        product.key === 'subscription_pro_monthly'
          ? { ...product, googleOffer: { basePlanId: 'quarterly', offerId: null } }
          : product,
      );
      mockFetchCatalog.mockResolvedValue(misconfigured);
      const { result } = renderHook(() => useMobileIap({ enabled: true }));
      await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));

      expect(result.current.priceFor('subscription_pro_monthly').label).toBeNull();
      await act(async () => result.current.purchase('subscription_pro_monthly'));

      expect(mockRequestPurchase).not.toHaveBeenCalled();
      expect(result.current.error).toMatch(/offer for this plan/i);
    });

    it.each([
      ['an upgrade', 'subscription_max_monthly', 'charge-prorated-price'],
      ['a downgrade', 'subscription_basic_monthly', 'deferred'],
    ])(
      'replaces the owned plan on %s with the mode Play documents for it',
      async (_label, target, mode) => {
        Object.assign(mockIapState, {
          availablePurchases: [
            {
              productId: productId('subscription_pro_monthly'),
              purchaseToken: 'owned-pro-purchase-token',
              purchaseState: 'purchased',
              isAcknowledgedAndroid: true,
            },
          ],
        });
        const { result } = await mountHook('android');

        await act(async () => result.current.purchase(target as never));

        expect(googleRequest()).toMatchObject({
          purchaseToken: 'owned-pro-purchase-token',
          subscriptionProductReplacementParams: {
            oldProductId: productId('subscription_pro_monthly'),
            replacementMode: mode,
          },
        });
      },
    );

    it('uses the replacement modes the server sends in place of the defaults', async () => {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
      Object.assign(mockIapState, {
        availablePurchases: [
          {
            productId: productId('subscription_pro_monthly'),
            purchaseToken: 'owned-pro-purchase-token',
            purchaseState: 'purchased',
            isAcknowledgedAndroid: true,
          },
        ],
      });
      mockFetchCatalog.mockResolvedValue(
        catalog('android', {
          androidReplacementModes: {
            upgrade: 'with-time-proration',
            downgrade: 'without-proration',
          },
        }),
      );
      const { result } = renderHook(() => useMobileIap({ enabled: true }));
      await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));

      await act(async () => result.current.purchase('subscription_basic_monthly'));

      expect(googleRequest()).toMatchObject({
        subscriptionProductReplacementParams: { replacementMode: 'without-proration' },
      });
    });

    it('does not buy the plan the account already owns a second time', async () => {
      Object.assign(mockIapState, {
        availablePurchases: [
          {
            productId: productId('subscription_pro_monthly'),
            purchaseToken: 'owned-pro-purchase-token',
            purchaseState: 'purchased',
            isAcknowledgedAndroid: true,
          },
        ],
      });
      const { result } = await mountHook('android');

      await act(async () => result.current.purchase('subscription_pro_monthly'));

      expect(mockRequestPurchase).not.toHaveBeenCalled();
      expect(result.current.error).toBe('You are already on this plan.');
    });

    it('leaves the store acknowledgement to the server when the server already made it', async () => {
      mockVerifyPurchase.mockResolvedValue(
        verified('subscription_pro_monthly', { storeAcknowledged: true }),
      );
      const { result } = await mountHook('android');

      await act(async () => {
        mockCallbacks['onPurchaseSuccess']?.({
          productId: productId('subscription_pro_monthly'),
          purchaseToken: 'fresh-google-purchase-token',
          purchaseState: 'purchased',
          isAcknowledgedAndroid: false,
        });
      });

      await waitFor(() => expect(mockRefreshTier).toHaveBeenCalledTimes(1));
      expect(mockFinishTransaction).not.toHaveBeenCalled();
      expect(result.current.error).toBeNull();
    });

    it('still acknowledges on the device when the server could not', async () => {
      mockVerifyPurchase.mockResolvedValue(
        verified('subscription_pro_monthly', { storeAcknowledged: false }),
      );
      await mountHook('android');

      await act(async () => {
        mockCallbacks['onPurchaseSuccess']?.({
          productId: productId('subscription_pro_monthly'),
          purchaseToken: 'fresh-google-purchase-token',
          purchaseState: 'purchased',
          isAcknowledgedAndroid: false,
        });
      });

      await waitFor(() => expect(mockFinishTransaction).toHaveBeenCalledTimes(1));
      expect(mockFinishTransaction.mock.calls[0]?.[0]).toMatchObject({ isConsumable: false });
    });

    it('holds a payment that is still pending and completes it when Play confirms', async () => {
      const pending = {
        productId: productId('subscription_pro_monthly'),
        purchaseToken: 'slow-google-purchase-token',
        purchaseState: 'pending',
        isAcknowledgedAndroid: false,
      };
      const { result } = await mountHook('android');

      await act(async () => {
        mockCallbacks['onPurchaseSuccess']?.(pending);
      });

      expect(mockVerifyPurchase).not.toHaveBeenCalled();
      expect(mockFinishTransaction).not.toHaveBeenCalled();
      expect(result.current.awaitingApproval.has('subscription_pro_monthly')).toBe(true);
      expect(result.current.error).toBeNull();

      mockVerifyPurchase.mockResolvedValue(verified('subscription_pro_monthly'));
      await act(async () => {
        mockCallbacks['onPurchaseSuccess']?.({ ...pending, purchaseState: 'purchased' });
      });

      await waitFor(() => expect(mockVerifyPurchase).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(result.current.awaitingApproval.has('subscription_pro_monthly')).toBe(false),
      );
      expect(mockRequestPurchase).not.toHaveBeenCalled();
    });

    it('shows a pending payment found on the device after the app was reopened', async () => {
      Object.assign(mockIapState, {
        availablePurchases: [
          {
            productId: productId('top_up_10'),
            purchaseToken: 'slow-google-top-up-token',
            purchaseState: 'pending',
            isAcknowledgedAndroid: false,
          },
        ],
      });
      const { result } = await mountHook('android');

      expect(result.current.awaitingApproval.has('top_up_10')).toBe(true);
      expect(mockVerifyPurchase).not.toHaveBeenCalled();
    });
  });

  describe('App Store purchases', () => {
    beforeEach(() => {
      Object.assign(mockIapState, {
        subscriptions: ALL_KEYS.filter((key) => key.startsWith('subscription')).map(iosProduct),
        products: ALL_KEYS.filter((key) => key.startsWith('top_up')).map(iosProduct),
      });
    });

    it('buys a plan with the account token and lets the subscription group decide the change', async () => {
      const { result } = await mountHook('ios');

      await act(async () => result.current.purchase('subscription_max_monthly'));

      const call = mockRequestPurchase.mock.calls[0]?.[0] as {
        type: string;
        request: { apple: Record<string, unknown> };
      };
      expect(call.type).toBe('subs');
      expect(call.request.apple).toEqual({
        sku: productId('subscription_max_monthly'),
        appAccountToken: accountToken,
      });
    });

    it('does not open the store for a minor whose state requires guardian consent', async () => {
      mockStored.set(
        'age-assurance:v1',
        JSON.stringify({
          checkedAt: '2026-10-19T00:00:00.000Z',
          platform: 'ios',
          outcome: 'range',
          regulated: true,
          lowerBound: 13,
          upperBound: 15,
          guardianManaged: true,
          installId: null,
          significantChangeStatus: null,
        }),
      );
      const { result } = await mountHook('ios');

      await act(async () => result.current.purchase('subscription_max_monthly'));

      expect(mockRequestPurchase).not.toHaveBeenCalled();
      expect(result.current.error).toBe('A parent or guardian needs to approve purchases.');
    });

    it('treats Ask to Buy as waiting, not as a failed purchase', async () => {
      const { result } = await mountHook('ios');
      await act(async () => result.current.purchase('subscription_pro_monthly'));

      await act(async () => {
        mockCallbacks['onPurchaseError']?.({
          code: 'deferred-payment',
          message: 'Payment was deferred (pending approval)',
          productId: productId('subscription_pro_monthly'),
        });
      });

      expect(result.current.error).toBeNull();
      expect(result.current.purchasingKey).toBeNull();
      expect(result.current.awaitingApproval.has('subscription_pro_monthly')).toBe(true);
    });

    it('remembers a request that is waiting for approval across an app restart', async () => {
      const first = await mountHook('ios');
      await act(async () => first.result.current.purchase('top_up_20'));
      await act(async () => {
        mockCallbacks['onPurchaseError']?.({ code: 'deferred-payment', message: 'deferred' });
      });
      expect(first.result.current.awaitingApproval.has('top_up_20')).toBe(true);
      first.unmount();

      const second = await mountHook('ios');

      expect(second.result.current.awaitingApproval.has('top_up_20')).toBe(true);
    });

    it('completes a purchase approved while the app was closed, without a second purchase', async () => {
      const first = await mountHook('ios');
      await act(async () => first.result.current.purchase('subscription_pro_monthly'));
      await act(async () => {
        mockCallbacks['onPurchaseError']?.({ code: 'deferred-payment', message: 'deferred' });
      });
      first.unmount();
      mockRequestPurchase.mockClear();

      const approved = {
        productId: productId('subscription_pro_monthly'),
        purchaseToken: 'signed-transaction-approved-while-closed',
        purchaseState: 'purchased',
      };
      mockUnfinishedTransactions.mockResolvedValue([approved]);
      mockVerifyPurchase.mockResolvedValue(verified('subscription_pro_monthly'));
      const second = await mountHook('ios');

      await waitFor(() => expect(mockVerifyPurchase).toHaveBeenCalledTimes(1));
      expect(mockVerifyPurchase).toHaveBeenCalledWith({
        platform: 'ios',
        productId: productId('subscription_pro_monthly'),
        purchaseToken: 'signed-transaction-approved-while-closed',
      });
      await waitFor(() => expect(mockFinishTransaction).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(second.result.current.awaitingApproval.has('subscription_pro_monthly')).toBe(false),
      );
      expect(mockRequestPurchase).not.toHaveBeenCalled();
    });

    it('finishes a top-up as a consumable only after the server has verified it', async () => {
      const order: string[] = [];
      mockVerifyPurchase.mockImplementation(async () => {
        order.push('verify');
        return verified('top_up_10', { unitsGranted: 500 });
      });
      mockFinishTransaction.mockImplementation(async () => {
        order.push('finish');
      });
      const { result } = await mountHook('ios');

      await act(async () => result.current.purchase('top_up_10'));
      expect((mockRequestPurchase.mock.calls[0]?.[0] as { type: string }).type).toBe('in-app');
      await act(async () => {
        mockCallbacks['onPurchaseSuccess']?.({
          productId: productId('top_up_10'),
          purchaseToken: 'signed-top-up-transaction-token',
          purchaseState: 'purchased',
        });
      });

      await waitFor(() => expect(mockFinishTransaction).toHaveBeenCalledTimes(1));
      expect(order).toEqual(['verify', 'finish']);
      expect(mockFinishTransaction.mock.calls[0]?.[0]).toMatchObject({ isConsumable: true });
      expect(result.current.lastResult).toMatchObject({ kind: 'top_up', unitsGranted: 500 });
    });

    it('leaves a top-up unfinished when the server could not verify it, so it can be retried', async () => {
      mockVerifyPurchase.mockRejectedValue(new Error('network down'));
      const { result } = await mountHook('ios');

      await act(async () => {
        mockCallbacks['onPurchaseSuccess']?.({
          productId: productId('top_up_10'),
          purchaseToken: 'signed-top-up-transaction-token',
          purchaseState: 'purchased',
        });
      });

      await waitFor(() => expect(result.current.error).toMatch(/has not been discarded/i));
      expect(mockFinishTransaction).not.toHaveBeenCalled();
    });

    it('reports the plan the App Store will renew into', async () => {
      Object.assign(mockIapState, {
        activeSubscriptions: [
          {
            productId: productId('subscription_pro_monthly'),
            isActive: true,
            renewalInfoIOS: {
              willAutoRenew: true,
              autoRenewPreference: productId('subscription_basic_monthly'),
            },
          },
        ],
      });
      const { result } = await mountHook('ios');

      expect(result.current.scheduledProductKey).toBe('subscription_basic_monthly');
    });
  });
});
