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
    __resetCloudAccountSessionForTests();
    activateCloudAccount('billing-test-account');
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
    expect(result.current.error).toBe(
      'Native purchases are unavailable right now. Please try again shortly.',
    );
  });

  it('keeps native store exception details out of the purchase UI', async () => {
    mockFetchCatalog.mockResolvedValue({
      enabled: false,
      platform: 'ios',
      appAccountToken: null,
      products: [],
      unavailableReason: 'New purchases are unavailable.',
      unavailableCode: null,
    });

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      mockCallbacks['onError']?.(new Error('NativeStoreError: /private/receipt/path'));
    });

    expect(result.current.error).toBe('The store connection failed. Please try again.');
  });

  it('discards a catalog response after Cloud billing is disabled', async () => {
    let resolveCatalog: ((value: unknown) => void) | undefined;
    mockFetchCatalog.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCatalog = resolve;
      }),
    );
    const { result, rerender } = renderHook(({ enabled }) => useMobileIap({ enabled }), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(1));

    rerender({ enabled: false });
    await act(async () => {
      resolveCatalog?.({
        enabled: true,
        platform: 'ios',
        appAccountToken: accountToken,
        products: [],
        unavailableReason: null,
        unavailableCode: null,
      });
    });

    expect(result.current.catalog).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('cannot start a purchase from a stale catalog after Cloud billing is disabled', async () => {
    const product = {
      ...MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'subscription')!,
      productId: 'fixture.subscription.stale',
    };
    mockFetchCatalog.mockResolvedValue({
      enabled: true,
      platform: 'ios',
      appAccountToken: accountToken,
      products: [product],
      unavailableReason: null,
      unavailableCode: null,
    });
    const { result, rerender } = renderHook(({ enabled }) => useMobileIap({ enabled }), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));

    rerender({ enabled: false });
    await act(async () => result.current.purchase(product.key));

    expect(mockRequestPurchase).not.toHaveBeenCalled();
    expect(result.current.catalog).toBeNull();
  });

  it('does not open the store when the signed-in account changes during purchase preflight', async () => {
    const product = {
      ...MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'subscription')!,
      productId: 'fixture.subscription.account-switch',
    };
    Object.assign(mockIapState, {
      subscriptions: [{ id: product.productId, type: 'subs', displayPrice: '$20.00' }],
    });
    const readyCatalog = {
      enabled: true,
      platform: 'ios',
      appAccountToken: accountToken,
      products: [product],
      unavailableReason: null,
      unavailableCode: null,
    };
    let resolvePreflight: ((value: unknown) => void) | undefined;
    mockFetchCatalog.mockResolvedValueOnce(readyCatalog).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreflight = resolve;
      }),
    );
    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));

    let purchasePromise: Promise<void> | undefined;
    act(() => {
      purchasePromise = result.current.purchase(product.key);
    });
    activateCloudAccount('another-billing-account');
    await act(async () => {
      resolvePreflight?.(readyCatalog);
      await purchasePromise;
    });

    expect(mockRequestPurchase).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/account changed/i);
  });

  it('opens one store request when the same purchase is tapped twice before preflight finishes', async () => {
    const product = {
      ...MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'subscription')!,
      productId: 'fixture.subscription.single-sheet',
    };
    Object.assign(mockIapState, {
      subscriptions: [{ id: product.productId, type: 'subs', displayPrice: '$20.00' }],
    });
    const readyCatalog = {
      enabled: true,
      platform: 'ios',
      appAccountToken: accountToken,
      products: [product],
      unavailableReason: null,
      unavailableCode: null,
    };
    let resolvePreflight: ((value: unknown) => void) | undefined;
    mockFetchCatalog
      .mockResolvedValueOnce(readyCatalog)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePreflight = resolve;
        }),
      )
      .mockResolvedValue(readyCatalog);
    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));

    let firstPurchase!: Promise<void>;
    let secondPurchase!: Promise<void>;
    act(() => {
      firstPurchase = result.current.purchase(product.key);
      secondPurchase = result.current.purchase(product.key);
    });
    expect(mockFetchCatalog).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolvePreflight?.(readyCatalog);
      await Promise.all([firstPurchase, secondPurchase]);
    });
    expect(mockRequestPurchase).toHaveBeenCalledTimes(1);

    mockVerifyPurchase.mockResolvedValue({
      success: true,
      kind: 'subscription',
      productKey: product.key,
      status: 'already_processed',
      planTier: product.planTier,
      currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    });
    await act(async () => {
      mockCallbacks['onPurchaseSuccess']?.({
        productId: 'fixture.subscription.earlier',
        purchaseToken: 'fixture-earlier-purchase-token-long-enough',
        purchaseState: 'purchased',
      });
    });
    await waitFor(() => expect(mockFinishTransaction).toHaveBeenCalledTimes(1));
    await act(async () => result.current.purchase(product.key));
    expect(mockRequestPurchase).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockCallbacks['onPurchaseError']?.(new Error('Purchase canceled'));
    });
    await act(async () => result.current.purchase(product.key));
    expect(mockRequestPurchase).toHaveBeenCalledTimes(2);
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
      unavailableCode: null,
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

  it('reports a confirmed purchase accurately when the plan refresh fails', async () => {
    const definition = MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'top_up')!;
    const product = { ...definition, productId: 'fixture.topup.refresh-failure' };
    mockFetchCatalog.mockResolvedValue({
      enabled: true,
      platform: 'ios',
      appAccountToken: accountToken,
      products: [product],
      unavailableReason: null,
      unavailableCode: null,
    });
    mockVerifyPurchase.mockResolvedValue({
      success: true,
      kind: 'top_up',
      productKey: product.key,
      status: 'granted',
      unitsGranted: product.units,
    });
    mockRefreshTier.mockResolvedValueOnce(false);

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));
    act(() => {
      mockCallbacks['onPurchaseSuccess']?.({
        productId: product.productId,
        purchaseToken: 'fixture-confirmed-purchase-refresh-failure',
        purchaseState: 'purchased',
      });
    });

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Purchase confirmed. Your updated plan is taking longer to load. Reopen Billing to refresh it.',
      ),
    );
    expect(mockVerifyPurchase).toHaveBeenCalledTimes(1);
    expect(mockFinishTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ isConsumable: true }),
    );
    expect(result.current.lastResult?.status).toBe('granted');
  });

  it('does not acknowledge a receipt when its verification finishes after an account switch', async () => {
    const product = MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'top_up')!;
    mockFetchCatalog.mockResolvedValue({
      enabled: false,
      platform: 'ios',
      appAccountToken: null,
      products: [],
      unavailableReason: 'New purchases are unavailable.',
      unavailableCode: null,
    });
    let resolveVerification: ((value: unknown) => void) | undefined;
    mockVerifyPurchase.mockReturnValue(
      new Promise((resolve) => {
        resolveVerification = resolve;
      }),
    );

    renderHook(() => useMobileIap({ enabled: true }));
    act(() => {
      mockCallbacks['onPurchaseSuccess']?.({
        productId: 'fixture.apple.previous-topup',
        purchaseToken: 'fixture-account-switch-token-long-enough',
        purchaseState: 'purchased',
      });
    });
    await waitFor(() => expect(mockVerifyPurchase).toHaveBeenCalledTimes(1));

    activateCloudAccount('another-billing-account');
    await act(async () => {
      resolveVerification?.({
        success: true,
        kind: 'top_up',
        productKey: product.key,
        status: 'granted',
        unitsGranted: product.units,
      });
    });

    expect(mockFinishTransaction).not.toHaveBeenCalled();
    expect(mockRefreshTier).not.toHaveBeenCalled();
  });

  it('does not clear a new account purchase when an old receipt finishes verifying', async () => {
    const product = {
      ...MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'subscription')!,
      productId: 'fixture.subscription.shared-product',
    };
    const readyCatalog = {
      enabled: true,
      platform: 'ios',
      appAccountToken: accountToken,
      products: [product],
      unavailableReason: null,
      unavailableCode: null,
    };
    Object.assign(mockIapState, {
      subscriptions: [{ id: product.productId, type: 'subs', displayPrice: '$20.00' }],
    });
    mockFetchCatalog.mockResolvedValue(readyCatalog);
    let resolveVerification: ((value: unknown) => void) | undefined;
    mockVerifyPurchase.mockReturnValue(
      new Promise((resolve) => {
        resolveVerification = resolve;
      }),
    );

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));
    act(() => {
      mockCallbacks['onPurchaseSuccess']?.({
        productId: product.productId,
        purchaseToken: 'fixture-old-account-receipt-token',
        purchaseState: 'purchased',
      });
    });
    await waitFor(() => expect(mockVerifyPurchase).toHaveBeenCalledTimes(1));

    activateCloudAccount('another-billing-account');
    await act(async () => result.current.reload());
    await act(async () => result.current.purchase(product.key));
    expect(result.current.purchasingKey).toBe(product.key);

    await act(async () => {
      resolveVerification?.({
        success: true,
        kind: 'subscription',
        productKey: product.key,
        status: 'already_processed',
        planTier: product.planTier,
        currentPeriodEnd: '2026-10-01T00:00:00.000Z',
      });
    });

    expect(result.current.purchasingKey).toBe(product.key);
    await act(async () => result.current.purchase(product.key));
    expect(mockRequestPurchase).toHaveBeenCalledTimes(1);
    expect(mockFinishTransaction).not.toHaveBeenCalled();
  });

  it('verifies and restores a completed purchase after new purchases are disabled', async () => {
    const product = MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'top_up')!;
    mockFetchCatalog.mockResolvedValue({
      enabled: false,
      platform: 'ios',
      appAccountToken: null,
      products: [],
      unavailableReason: 'New purchases are unavailable.',
      unavailableCode: null,
    });
    mockVerifyPurchase.mockResolvedValue({
      success: true,
      kind: 'top_up',
      productKey: product.key,
      status: 'granted',
      unitsGranted: product.units,
    });

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(false));
    await act(async () => result.current.restore());
    expect(mockGetAvailablePurchases).toHaveBeenCalled();

    await act(async () => {
      mockCallbacks['onPurchaseSuccess']?.({
        productId: 'fixture.apple.previous-topup',
        purchaseToken: 'fixture-purchase-token-long-enough',
        purchaseState: 'purchased',
      });
    });

    expect(mockVerifyPurchase).toHaveBeenCalledWith({
      platform: 'ios',
      productId: 'fixture.apple.previous-topup',
      purchaseToken: 'fixture-purchase-token-long-enough',
    });
    expect(mockFinishTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ isConsumable: true }),
    );
    expect(mockRefreshTier).toHaveBeenCalled();
  });

  it('keeps Restore purchases in progress until the store finishes loading receipts', async () => {
    mockFetchCatalog.mockResolvedValue({
      enabled: false,
      platform: 'ios',
      appAccountToken: null,
      products: [],
      unavailableReason: 'New purchases are unavailable.',
      unavailableCode: null,
    });
    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let completeStoreFetch: (() => void) | undefined;
    mockGetAvailablePurchases.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          completeStoreFetch = resolve;
        }),
    );
    let restorePromise!: Promise<void>;
    act(() => {
      restorePromise = result.current.restore();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.restoring).toBe(true);

    await act(async () => {
      completeStoreFetch?.();
      await restorePromise;
    });
    expect(result.current.restoring).toBe(false);
  });

  it('does not finish a new account restore when an old account receipt completes', async () => {
    const subscription = MOBILE_IAP_PRODUCT_DEFINITIONS.find(
      (item) => item.kind === 'subscription',
    )!;
    mockFetchCatalog.mockResolvedValue({
      enabled: false,
      platform: 'ios',
      appAccountToken: null,
      products: [],
      unavailableReason: 'New purchases are unavailable.',
      unavailableCode: null,
    });
    let resolveVerification: ((value: unknown) => void) | undefined;
    mockVerifyPurchase.mockReturnValue(
      new Promise((resolve) => {
        resolveVerification = resolve;
      }),
    );
    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      mockCallbacks['onPurchaseSuccess']?.({
        productId: 'fixture.subscription.previous-account',
        purchaseToken: 'fixture-previous-account-restore-token',
        purchaseState: 'purchased',
      });
    });
    await waitFor(() => expect(mockVerifyPurchase).toHaveBeenCalledTimes(1));

    activateCloudAccount('new-restore-account');
    await act(async () => result.current.reload());
    let completeStoreFetch: (() => void) | undefined;
    mockGetAvailablePurchases.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          completeStoreFetch = resolve;
        }),
    );
    let restorePromise!: Promise<void>;
    act(() => {
      restorePromise = result.current.restore();
    });
    expect(result.current.restoring).toBe(true);

    await act(async () => {
      resolveVerification?.({
        success: true,
        kind: 'subscription',
        productKey: subscription.key,
        status: 'already_processed',
        planTier: subscription.planTier,
        currentPeriodEnd: '2026-10-01T00:00:00.000Z',
      });
    });
    expect(result.current.restoring).toBe(true);

    await act(async () => {
      completeStoreFetch?.();
      await restorePromise;
    });
    expect(result.current.restoring).toBe(false);
  });

  describe('every Restore purchases pass finishes', () => {
    const subscription = MOBILE_IAP_PRODUCT_DEFINITIONS.find(
      (item) => item.kind === 'subscription',
    )!;
    const verified = {
      success: true,
      kind: 'subscription',
      productKey: subscription.key,
      status: 'already_processed',
      planTier: subscription.planTier,
      currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    };

    function storeReceipt(purchaseToken: string | null, overrides: Record<string, unknown> = {}) {
      return {
        productId: 'fixture.subscription.restore',
        purchaseToken,
        purchaseState: 'purchased',
        ...overrides,
      };
    }

    async function renderBilling() {
      const hook = renderHook(() => useMobileIap({ enabled: true }));
      await waitFor(() => expect(hook.result.current.loading).toBe(false));
      return hook;
    }

    beforeEach(() => {
      mockFetchCatalog.mockResolvedValue({
        enabled: false,
        platform: 'ios',
        appAccountToken: null,
        products: [],
        unavailableReason: 'New purchases are unavailable.',
        unavailableCode: null,
      });
      mockVerifyPurchase.mockResolvedValue(verified);
    });

    it('after a purchase confirmed earlier in the same visit', async () => {
      const receipt = storeReceipt('fixture-buy-then-restore-token');
      const { result } = await renderBilling();
      await act(async () => {
        mockCallbacks['onPurchaseSuccess']?.(receipt);
      });
      await waitFor(() => expect(mockRefreshTier).toHaveBeenCalledTimes(1));

      Object.assign(mockIapState, { availablePurchases: [receipt] });
      await act(async () => result.current.restore());

      expect(result.current.error).toBeNull();
      expect(result.current.restoring).toBe(false);
      expect(mockVerifyPurchase).toHaveBeenCalledTimes(1);
      expect(mockFinishTransaction).toHaveBeenCalledTimes(1);
    });

    it('after Billing confirmed a stranded Google Play purchase on open', async () => {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
      Object.assign(mockIapState, {
        availablePurchases: [
          storeReceipt('fixture-stranded-then-restore-token', { isAcknowledgedAndroid: false }),
        ],
      });
      const { result } = await renderBilling();
      await waitFor(() => expect(mockRefreshTier).toHaveBeenCalledTimes(1));

      await act(async () => result.current.restore());

      expect(result.current.error).toBeNull();
      expect(result.current.restoring).toBe(false);
      expect(mockVerifyPurchase).toHaveBeenCalledTimes(1);
      expect(mockFinishTransaction).toHaveBeenCalledTimes(1);
    });

    it('when the store returns only a pending payment', async () => {
      const { result } = await renderBilling();
      Object.assign(mockIapState, {
        availablePurchases: [
          storeReceipt('fixture-pending-restore-token', { purchaseState: 'pending' }),
        ],
      });

      await act(async () => result.current.restore());

      await waitFor(() => expect(result.current.restoring).toBe(false));
      expect(result.current.error).toBe(
        'Payment is pending in the store. Access will update after payment completes.',
      );
      expect(mockVerifyPurchase).not.toHaveBeenCalled();
    });

    it('when the store returns a purchase without a token', async () => {
      const { result } = await renderBilling();
      Object.assign(mockIapState, { availablePurchases: [storeReceipt(null)] });

      await act(async () => result.current.restore());

      expect(result.current.error).toBeNull();
      expect(result.current.restoring).toBe(false);
      expect(mockVerifyPurchase).not.toHaveBeenCalled();
    });

    it('each time it is tapped again with the same receipts', async () => {
      const { result } = await renderBilling();
      Object.assign(mockIapState, {
        availablePurchases: [storeReceipt('fixture-restore-twice-token')],
      });

      await act(async () => result.current.restore());
      await waitFor(() => expect(result.current.restoring).toBe(false));
      expect(mockFinishTransaction).toHaveBeenCalledTimes(1);

      await act(async () => result.current.restore());

      expect(result.current.error).toBeNull();
      expect(result.current.restoring).toBe(false);
      expect(mockVerifyPurchase).toHaveBeenCalledTimes(1);
      expect(mockFinishTransaction).toHaveBeenCalledTimes(1);
    });

    it('only after every restored purchase is confirmed', async () => {
      let resolveSlowVerification: ((value: unknown) => void) | undefined;
      mockVerifyPurchase.mockResolvedValueOnce(verified).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSlowVerification = resolve;
        }),
      );
      const { result } = await renderBilling();
      Object.assign(mockIapState, {
        availablePurchases: [
          storeReceipt('fixture-restore-fast-token'),
          storeReceipt('fixture-restore-slow-token'),
        ],
      });

      await act(async () => result.current.restore());
      await waitFor(() => expect(mockRefreshTier).toHaveBeenCalledTimes(1));
      await act(async () => undefined);
      expect(mockVerifyPurchase).toHaveBeenCalledTimes(2);
      expect(result.current.restoring).toBe(true);

      await act(async () => {
        resolveSlowVerification?.(verified);
      });

      await waitFor(() => expect(result.current.restoring).toBe(false));
      expect(mockFinishTransaction).toHaveBeenCalledTimes(2);
    });
  });

  it('leaves an unverified purchase unfinished when new purchases are disabled', async () => {
    mockFetchCatalog.mockResolvedValue({
      enabled: false,
      platform: 'ios',
      appAccountToken: null,
      products: [],
      unavailableReason: 'New purchases are unavailable.',
      unavailableCode: null,
    });
    mockVerifyPurchase.mockRejectedValue(new Error('The store receipt could not be verified.'));

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(false));
    act(() => {
      mockCallbacks['onPurchaseSuccess']?.({
        productId: 'fixture.apple.previous-topup',
        purchaseToken: 'fixture-unverified-token-long-enough',
        purchaseState: 'purchased',
      });
    });

    await waitFor(() =>
      expect(result.current.error).toBe(
        'The purchase could not be verified yet. It has not been discarded. Try Restore purchases shortly.',
      ),
    );
    expect(mockFinishTransaction).not.toHaveBeenCalled();
    expect(mockRefreshTier).not.toHaveBeenCalled();
  });

  it('shows the store its own localized price, never a figure the app assembled', async () => {
    const definitions = MOBILE_IAP_PRODUCT_DEFINITIONS.filter(
      (item) => item.kind === 'subscription',
    );
    const product = { ...definitions[0]!, productId: 'fixture.subscription.localized' };
    Object.assign(mockIapState, {
      subscriptions: [
        {
          id: product.productId,
          type: 'subs',
          platform: 'ios',
          displayPrice: '\u00a518,800',
          currency: 'JPY',
          price: 18800,
        },
      ],
    });
    mockFetchCatalog.mockResolvedValue({
      enabled: true,
      platform: 'ios',
      appAccountToken: accountToken,
      products: [product],
      unavailableReason: null,
      unavailableCode: null,
    });

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));

    const price = result.current.priceFor(product.key);
    expect(price.label).toBe('\u00a518,800');
    expect(price.currency).toBe('JPY');
    expect(price.label).not.toMatch(/\$/);
  });

  it('prices an Android subscription from the offer the purchase will use', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const definitions = MOBILE_IAP_PRODUCT_DEFINITIONS.filter(
      (item) => item.kind === 'subscription',
    );
    const product = { ...definitions[0]!, productId: 'fixture.subscription.offer' };
    Object.assign(mockIapState, {
      subscriptions: [
        {
          id: product.productId,
          type: 'subs',
          platform: 'android',
          displayPrice: '',
          currency: 'EUR',
          subscriptionOffers: [
            {
              offerTokenAndroid: 'fixture-offer-token',
              displayPrice: '',
              currency: 'EUR',
              pricingPhasesAndroid: {
                pricingPhaseList: [
                  { formattedPrice: 'Free', priceAmountMicros: '0' },
                  { formattedPrice: '18,99\u00a0\u20ac', priceAmountMicros: '18990000' },
                ],
              },
            },
          ],
        },
      ],
    });
    mockFetchCatalog.mockResolvedValue({
      enabled: true,
      platform: 'android',
      appAccountToken: accountToken,
      products: [product],
      unavailableReason: null,
      unavailableCode: null,
    });

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.platform).toBe('android'));

    // The trial phase is not the price of the plan, and the product-level
    // displayPrice is empty on Android subscriptions.
    const price = result.current.priceFor(product.key);
    expect(price.label).toBe('18,99\u00a0\u20ac');
    expect(price.offerToken).toBe('fixture-offer-token');

    await act(async () => result.current.purchase(product.key));
    expect(mockRequestPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          google: expect.objectContaining({
            subscriptionOffers: [{ sku: product.productId, offerToken: price.offerToken }],
          }),
        }),
      }),
    );
  });

  it('reports no price rather than one the store never quoted', async () => {
    const definitions = MOBILE_IAP_PRODUCT_DEFINITIONS.filter(
      (item) => item.kind === 'subscription',
    );
    const product = { ...definitions[0]!, productId: 'fixture.subscription.missing' };
    mockFetchCatalog.mockResolvedValue({
      enabled: true,
      platform: 'ios',
      appAccountToken: accountToken,
      products: [product],
      unavailableReason: null,
      unavailableCode: null,
    });

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));

    expect(result.current.priceFor(product.key)).toEqual({
      label: null,
      currency: null,
      offerToken: null,
    });
  });

  it('does not open the store when upgrade access was revoked after the catalog loaded', async () => {
    const definition = MOBILE_IAP_PRODUCT_DEFINITIONS.find((item) => item.kind === 'subscription')!;
    const product = { ...definition, productId: 'fixture.subscription.gated' };
    Object.assign(mockIapState, {
      subscriptions: [{ id: product.productId, type: 'subs', displayPrice: '$20.00' }],
    });
    mockFetchCatalog
      .mockResolvedValueOnce({
        enabled: true,
        platform: 'ios',
        appAccountToken: accountToken,
        products: [product],
        unavailableReason: null,
        unavailableCode: null,
      })
      .mockResolvedValueOnce({
        enabled: false,
        platform: 'ios',
        appAccountToken: null,
        products: [],
        unavailableReason: 'Upgrade access is required.',
        unavailableCode: 'waitlist_access_required',
      });

    const { result } = renderHook(() => useMobileIap({ enabled: true }));
    await waitFor(() => expect(result.current.catalog?.enabled).toBe(true));
    await act(async () => result.current.purchase(product.key));

    expect(mockRequestPurchase).not.toHaveBeenCalled();
    expect(result.current.catalog?.unavailableCode).toBe('waitlist_access_required');
    expect(result.current.error).toBe('Upgrade access is required.');
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
      unavailableCode: null,
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
