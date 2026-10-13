import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { MOBILE_IAP_PRODUCT_DEFINITIONS } from '@agiworkforce/types';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

const mockFetchCatalog = jest.fn();
const mockVerifyPurchase = jest.fn();
const mockRefreshTier = jest.fn().mockResolvedValue(true);
const mockFinishTransaction = jest.fn().mockResolvedValue(undefined);
let mockCallbacks: Record<string, (...args: unknown[]) => void> = {};
const mockIapState: Record<string, unknown> = {
  connected: true,
  products: [],
  subscriptions: [],
  availablePurchases: [],
  activeSubscriptions: [],
  fetchProducts: jest.fn().mockResolvedValue(undefined),
  requestPurchase: jest.fn().mockResolvedValue(null),
  finishTransaction: mockFinishTransaction,
  getAvailablePurchases: jest.fn().mockResolvedValue(undefined),
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
  getPendingTransactionsIOS: jest.fn().mockResolvedValue([]),
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
import { ApiHttpError } from '@/services/apiErrors';

const accountToken = '00000000-0000-4000-8000-000000000001';
const purchaseToken = 'fixture-google-purchase-token-long-enough';
const subscription = {
  ...MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'subscription')!,
  productId: 'fixture.subscription.acknowledgement',
};

function androidCatalog() {
  return {
    enabled: true,
    platform: 'android',
    appAccountToken: accountToken,
    products: [subscription],
    unavailableReason: null,
    unavailableCode: null,
  };
}

function strandedPurchase(isAcknowledgedAndroid: boolean | null) {
  return {
    productId: subscription.productId,
    purchaseToken,
    purchaseState: 'purchased',
    isAcknowledgedAndroid,
  };
}

describe('native purchase acknowledgement and idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('billing-acknowledgement-account');
    mockFinishTransaction.mockResolvedValue(undefined);
    Object.assign(mockIapState, {
      connected: true,
      products: [],
      subscriptions: [],
      availablePurchases: [],
    });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mockFetchCatalog.mockResolvedValue(androidCatalog());
  });

  it('acknowledges a purchase the store still reports as unacknowledged, without crediting it twice', async () => {
    Object.assign(mockIapState, { availablePurchases: [strandedPurchase(false)] });
    mockVerifyPurchase.mockResolvedValue({
      success: true,
      kind: 'subscription',
      productKey: subscription.key,
      status: 'already_processed',
      planTier: subscription.planTier,
      currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));

    await waitFor(() => expect(mockFinishTransaction).toHaveBeenCalledTimes(1));
    expect(mockVerifyPurchase).toHaveBeenCalledTimes(1);
    expect(mockVerifyPurchase).toHaveBeenCalledWith({
      platform: 'android',
      productId: subscription.productId,
      purchaseToken,
    });
    expect(result.current.lastResult?.status).toBe('already_processed');
  });

  it('leaves a purchase the store already acknowledged alone', async () => {
    Object.assign(mockIapState, { availablePurchases: [strandedPurchase(true)] });

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));
    await act(async () => undefined);

    expect(mockVerifyPurchase).not.toHaveBeenCalled();
    expect(mockFinishTransaction).not.toHaveBeenCalled();
  });

  it('retries a failed acknowledgement for the same purchase token and never re-verifies it', async () => {
    mockVerifyPurchase.mockResolvedValue({
      success: true,
      kind: 'subscription',
      productKey: subscription.key,
      status: 'active',
      planTier: subscription.planTier,
      currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    });
    mockFinishTransaction.mockRejectedValueOnce(new Error('Play Billing service disconnected'));

    const { result, rerender } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));

    await act(async () => {
      mockCallbacks['onPurchaseSuccess']?.(strandedPurchase(false));
    });
    await waitFor(() => expect(result.current.error).toMatch(/confirm it again/i));
    expect(mockVerifyPurchase).toHaveBeenCalledTimes(1);
    expect(mockFinishTransaction).toHaveBeenCalledTimes(1);
    expect(mockRefreshTier).not.toHaveBeenCalled();

    Object.assign(mockIapState, { availablePurchases: [strandedPurchase(false)] });
    await act(async () => {
      rerender(undefined);
    });

    await waitFor(() => expect(mockFinishTransaction).toHaveBeenCalledTimes(2));
    expect(mockVerifyPurchase).toHaveBeenCalledTimes(1);
    expect(mockFinishTransaction.mock.calls[1]?.[0]).toMatchObject({
      purchase: expect.objectContaining({ purchaseToken }),
    });
    await waitFor(() => expect(mockRefreshTier).toHaveBeenCalledTimes(1));
  });

  it('acknowledges a redelivered purchase exactly once', async () => {
    mockVerifyPurchase.mockResolvedValue({
      success: true,
      kind: 'subscription',
      productKey: subscription.key,
      status: 'active',
      planTier: subscription.planTier,
      currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    });

    const { result, rerender } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));

    await act(async () => {
      mockCallbacks['onPurchaseSuccess']?.(strandedPurchase(false));
    });
    await waitFor(() => expect(mockFinishTransaction).toHaveBeenCalledTimes(1));

    Object.assign(mockIapState, { availablePurchases: [strandedPurchase(false)] });
    await act(async () => {
      rerender(undefined);
    });
    await act(async () => {
      mockCallbacks['onPurchaseSuccess']?.(strandedPurchase(false));
    });

    expect(mockFinishTransaction).toHaveBeenCalledTimes(1);
    expect(mockVerifyPurchase).toHaveBeenCalledTimes(1);
  });

  describe('a top-up the server granted and acknowledged before the device consumed it', () => {
    const topUp = {
      ...MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'top_up')!,
      productId: 'fixture.topup.acknowledgement',
    };
    const topUpToken = 'fixture-google-consumable-token-long-enough';
    const ownedTopUp = {
      productId: topUp.productId,
      purchaseToken: topUpToken,
      purchaseState: 'purchased',
      isAcknowledgedAndroid: true,
    };

    function alreadyGranted() {
      mockVerifyPurchase.mockResolvedValue({
        success: true,
        kind: 'top_up',
        productKey: topUp.key,
        status: 'already_processed',
        unitsGranted: topUp.units,
        storeAcknowledged: true,
      });
    }

    it('consumes it the next time Billing opens, so it can be bought again', async () => {
      mockFetchCatalog.mockResolvedValue({
        ...androidCatalog(),
        products: [subscription, topUp],
        consumableProductIds: [topUp.productId],
      });
      Object.assign(mockIapState, { availablePurchases: [ownedTopUp] });
      alreadyGranted();

      const { result } = renderHook(() => useMobileIap({ enabled: true }));
      await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));

      await waitFor(() => expect(mockFinishTransaction).toHaveBeenCalledTimes(1));
      expect(mockFinishTransaction).toHaveBeenCalledWith({
        purchase: expect.objectContaining({ purchaseToken: topUpToken }),
        isConsumable: true,
      });
      expect(mockVerifyPurchase).toHaveBeenCalledTimes(1);
      expect(result.current.lastResult?.status).toBe('already_processed');
    });

    it('consumes it even when top-ups are no longer offered to the account', async () => {
      mockFetchCatalog.mockResolvedValue({
        ...androidCatalog(),
        consumableProductIds: [topUp.productId],
      });
      Object.assign(mockIapState, { availablePurchases: [ownedTopUp] });
      alreadyGranted();

      const { result } = renderHook(() => useMobileIap({ enabled: true }));
      await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));

      await waitFor(() => expect(mockFinishTransaction).toHaveBeenCalledTimes(1));
      expect(mockFinishTransaction.mock.calls[0]?.[0]).toMatchObject({ isConsumable: true });
    });

    it('consumes it once, however often the store lists it', async () => {
      mockFetchCatalog.mockResolvedValue({
        ...androidCatalog(),
        consumableProductIds: [topUp.productId],
      });
      Object.assign(mockIapState, { availablePurchases: [ownedTopUp] });
      alreadyGranted();

      const { result, rerender } = renderHook(() => useMobileIap({ enabled: true }));
      await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));
      await waitFor(() => expect(mockFinishTransaction).toHaveBeenCalledTimes(1));

      Object.assign(mockIapState, { availablePurchases: [{ ...ownedTopUp }] });
      await act(async () => {
        rerender(undefined);
      });

      expect(mockFinishTransaction).toHaveBeenCalledTimes(1);
      expect(mockVerifyPurchase).toHaveBeenCalledTimes(1);
    });
  });

  it("shows the server's reason when it refuses a purchase the store completed", async () => {
    mockVerifyPurchase.mockRejectedValue(
      new ApiHttpError(
        "This purchase was made in the store's test environment, which this account is not set up to use. Nothing was charged.",
        403,
      ),
    );

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));
    await act(async () => {
      mockCallbacks['onPurchaseSuccess']?.(strandedPurchase(false));
    });

    await waitFor(() => expect(result.current.error).toMatch(/test environment/i));
    expect(mockFinishTransaction).not.toHaveBeenCalled();
  });

  it('keeps the retry message when verification fails for a reason that may pass', async () => {
    mockVerifyPurchase.mockRejectedValue(new ApiHttpError('Service unavailable', 503));

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));
    await act(async () => {
      mockCallbacks['onPurchaseSuccess']?.(strandedPurchase(false));
    });

    await waitFor(() => expect(result.current.error).toMatch(/could not be verified yet/i));
  });
});
