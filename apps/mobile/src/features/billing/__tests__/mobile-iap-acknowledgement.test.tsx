import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { MOBILE_IAP_PRODUCT_DEFINITIONS } from '@agiworkforce/types';

const mockFetchCatalog = jest.fn();
const mockVerifyPurchase = jest.fn();
const mockRefreshTier = jest.fn().mockResolvedValue(undefined);
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
});
