import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { MOBILE_IAP_PRODUCT_DEFINITIONS } from '@agiworkforce/types';

const mockFetchCatalog = jest.fn();
const mockVerifyPurchase = jest.fn();
const mockRefreshTier = jest.fn().mockResolvedValue(undefined);
const mockFetchProducts = jest.fn().mockResolvedValue(undefined);
const mockRequestPurchase = jest.fn().mockResolvedValue(null);
const mockFinishTransaction = jest.fn().mockResolvedValue(undefined);
const mockGetAvailablePurchases = jest.fn().mockResolvedValue(undefined);
let mockCallbacks: Record<string, (...args: unknown[]) => void> = {};
const mockIapState: Record<string, unknown> = {
  connected: true,
  products: [],
  subscriptions: [],
  availablePurchases: [],
  activeSubscriptions: [],
  fetchProducts: mockFetchProducts,
  requestPurchase: mockRequestPurchase,
  finishTransaction: mockFinishTransaction,
  getAvailablePurchases: mockGetAvailablePurchases,
  restorePurchases: jest.fn(),
  getActiveSubscriptions: jest.fn(),
  hasActiveSubscriptions: jest.fn(),
  reconnect: jest.fn(),
};

jest.mock('expo-iap', () => ({
  useIAP: jest.fn((callbacks: Record<string, (...args: unknown[]) => void>) => {
    mockCallbacks = callbacks;
    return mockIapState;
  }),
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

describe('native mobile IAP hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(mockIapState, {
      connected: true,
      products: [],
      subscriptions: [],
      availablePurchases: [],
    });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  });

  it('does not contact AGI billing before the operating-system store is connected', async () => {
    Object.assign(mockIapState, { connected: false });
    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(mockFetchCatalog).not.toHaveBeenCalled();
  });

  it('does not expose JSON parser internals when the catalog deployment returns HTML', async () => {
    mockFetchCatalog.mockRejectedValueOnce(new Error('JSON Parse error: Unexpected character: <'));

    const { result } = renderHook(() => useMobileIap({ enabled: true }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.catalog).toBeNull();
    expect(result.current.error).toBe('Native purchases are unavailable right now.');
  });

  it('verifies a consumable on the server before acknowledging it to the store', async () => {
    const definition = MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'top_up')!;
    const product = { ...definition, productId: 'fixture.topup' };
    Object.assign(mockIapState, {
      products: [{ id: product.productId, type: 'in-app', displayPrice: '$10.00' }],
    });
    mockFetchCatalog.mockResolvedValue({
      enabled: true,
      platform: 'ios',
      appAccountToken: accountToken,
      products: [product],
      unavailableReason: null,
    });
    let resolveVerification: ((value: unknown) => void) | undefined;
    mockVerifyPurchase.mockReturnValue(
      new Promise((resolve) => {
        resolveVerification = resolve;
      }),
    );

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));
    await act(async () => result.current.purchase(product.key));
    expect(mockRequestPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'in-app',
        request: expect.objectContaining({
          apple: { sku: product.productId, appAccountToken: accountToken },
        }),
      }),
    );

    act(() => {
      mockCallbacks['onPurchaseSuccess']?.({
        productId: product.productId,
        purchaseToken: 'fixture-purchase-token-long-enough',
        purchaseState: 'purchased',
      });
    });
    await waitFor(() => expect(mockVerifyPurchase).toHaveBeenCalledTimes(1));
    expect(mockFinishTransaction).not.toHaveBeenCalled();

    await act(async () => {
      resolveVerification?.({
        success: true,
        kind: 'top_up',
        productKey: product.key,
        status: 'granted',
        unitsGranted: product.units,
      });
    });
    await waitFor(() =>
      expect(mockFinishTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ isConsumable: true }),
      ),
    );
    expect(mockRefreshTier).toHaveBeenCalled();
  });

  it('uses Google Play charge proration when replacing an active subscription', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const definitions = MOBILE_IAP_PRODUCT_DEFINITIONS.filter(
      (item) => item.kind === 'subscription',
    );
    const oldProduct = { ...definitions[0]!, productId: 'fixture.subscription.old' };
    const nextProduct = { ...definitions[1]!, productId: 'fixture.subscription.next' };
    Object.assign(mockIapState, {
      subscriptions: [
        {
          id: nextProduct.productId,
          type: 'subs',
          platform: 'android',
          displayPrice: '$20.00',
          subscriptionOffers: [{ offerTokenAndroid: 'fixture-offer-token' }],
        },
      ],
      availablePurchases: [
        {
          productId: oldProduct.productId,
          purchaseToken: 'fixture-old-token-long-enough',
        },
      ],
    });
    mockFetchCatalog.mockResolvedValue({
      enabled: true,
      platform: 'android',
      appAccountToken: accountToken,
      products: [oldProduct, nextProduct],
      unavailableReason: null,
    });

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.platform).toBe('android'));
    await act(async () => result.current.purchase(nextProduct.key));

    expect(mockRequestPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'subs',
        request: expect.objectContaining({
          google: expect.objectContaining({
            skus: [nextProduct.productId],
            purchaseToken: 'fixture-old-token-long-enough',
            subscriptionOffers: [{ sku: nextProduct.productId, offerToken: 'fixture-offer-token' }],
            subscriptionProductReplacementParams: {
              oldProductId: oldProduct.productId,
              replacementMode: 'charge-prorated-price',
            },
          }),
        }),
      }),
    );
  });
});
