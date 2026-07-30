/**
 * Regression coverage for the IAP server-reconciliation wiring: previously
 * `reportPurchaseToServer` in useIapPurchaseFlow.ts was a permanent stub that
 * threw (no verify endpoint existed). Now that
 * POST /api/mobile/iap/verify (apps/web) exists, this hook must actually call
 * it — with the receipt/purchaseToken correctly mapped per platform — before
 * finalizing the transaction, and must reconcile every restored purchase the
 * same way.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useIapPurchaseFlow } from '@/src/features/billing/useIapPurchaseFlow';
import { useIapStore } from '@/src/features/billing/iapStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

const mockRequestPurchase = jest.fn();
const mockRestorePurchases = jest.fn();
const mockFinishTransaction = jest.fn();
const mockFetchProducts = jest.fn();
const mockDeepLinkToSubscriptions = jest.fn();
const mockGetAvailablePurchases = jest.fn();
const mockRefreshTier = jest.fn();
const mockTierState = {
  billingStatus: 'none',
  billingSource: 'none',
};

let mockCapturedOptions: {
  onPurchaseSuccess: (p: any) => void;
  onPurchaseError: (e: any) => void;
};
let mockAvailablePurchases: any[] = [];

jest.mock('react-native-iap', () => ({
  useIAP: (options: any) => {
    mockCapturedOptions = options;
    return {
      connected: true,
      requestPurchase: mockRequestPurchase,
      restorePurchases: mockRestorePurchases,
      finishTransaction: mockFinishTransaction,
      fetchProducts: mockFetchProducts,
      get availablePurchases() {
        return mockAvailablePurchases;
      },
    };
  },
  deepLinkToSubscriptions: (...args: unknown[]) => mockDeepLinkToSubscriptions(...args),
  getAvailablePurchases: (...args: unknown[]) => mockGetAvailablePurchases(...args),
}));

const mockApiPost = jest.fn();
jest.mock('@/services/api', () => ({
  api: { post: (...args: unknown[]) => mockApiPost(...args) },
}));

jest.mock('@/src/features/billing/store', () => ({
  useTierStore: {
    getState: () => ({ refreshTier: mockRefreshTier, ...mockTierState }),
  },
}));

function iosPurchase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    productId: 'com.agiworkforce.app.sub.pro.monthly',
    purchaseToken: 'jws-representation-abc',
    platform: 'ios',
    ...overrides,
  };
}

function currentIosAttemptToken(): string {
  const request = mockRequestPurchase.mock.calls.at(-1)?.[0] as
    | { request?: { apple?: { appAccountToken?: string } } }
    | undefined;
  const token = request?.request?.apple?.appAccountToken;
  if (!token) throw new Error('Test purchase did not include an iOS app-account token');
  return token;
}

describe('useIapPurchaseFlow — server reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAvailablePurchases = [];
    __resetCloudAccountSessionForTests();
    activateCloudAccount('iap-test-user-a');
    useIapStore.getState().reset();
    mockRequestPurchase.mockResolvedValue(undefined);
    mockGetAvailablePurchases.mockImplementation(async () => mockAvailablePurchases);
    mockRefreshTier.mockResolvedValue(undefined);
    Object.assign(mockTierState, { billingStatus: 'none', billingSource: 'none' });
  });

  it('reports a completed purchase to /api/mobile/iap/verify before finishing the transaction', async () => {
    mockApiPost.mockResolvedValue({
      success: true,
      planTier: 'pro',
      status: 'active',
      currentPeriodEnd: '2026-08-01T00:00:00.000Z',
    });
    mockFinishTransaction.mockResolvedValue(undefined);

    const { result } = renderHook(() => useIapPurchaseFlow());
    let purchase!: ReturnType<typeof iosPurchase>;

    await act(async () => {
      await result.current.purchase('pro', 'monthly');
      purchase = iosPurchase({ appAccountToken: currentIosAttemptToken() });
      mockCapturedOptions.onPurchaseSuccess(purchase);
    });

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/mobile/iap/verify', {
        platform: 'ios',
        productId: 'com.agiworkforce.app.sub.pro.monthly',
        receipt: 'jws-representation-abc',
      });
      expect(mockFinishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false });
      expect(mockRefreshTier).toHaveBeenCalledTimes(1);
      expect(useIapStore.getState().status).toBe('success');
    });
  });

  it('does not finish the transaction and surfaces an error when verification fails', async () => {
    mockApiPost.mockRejectedValue(new Error('Unknown product id'));

    const { result } = renderHook(() => useIapPurchaseFlow());
    let purchase!: ReturnType<typeof iosPurchase>;

    await act(async () => {
      await result.current.purchase('pro', 'monthly');
      purchase = iosPurchase({ appAccountToken: currentIosAttemptToken() });
      mockCapturedOptions.onPurchaseSuccess(purchase);
    });

    await waitFor(() => {
      expect(mockFinishTransaction).not.toHaveBeenCalled();
      expect(useIapStore.getState().status).toBe('error');
      expect(useIapStore.getState().errorMessage).toBe('Unknown product id');
    });
  });

  it('cannot verify or repopulate purchase state after the account changes', async () => {
    let resolveVerification!: (value: unknown) => void;
    mockApiPost.mockReturnValue(
      new Promise((resolve) => {
        resolveVerification = resolve;
      }),
    );
    const { result } = renderHook(() => useIapPurchaseFlow());
    let purchase!: ReturnType<typeof iosPurchase>;

    await act(async () => {
      await result.current.purchase('pro', 'monthly');
      purchase = iosPurchase({ appAccountToken: currentIosAttemptToken() });
      mockCapturedOptions.onPurchaseSuccess(purchase);
    });
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1));

    activateCloudAccount('iap-test-user-b');
    useIapStore.getState().reset();
    await act(async () => {
      resolveVerification({ success: true });
      await Promise.resolve();
    });

    expect(mockFinishTransaction).not.toHaveBeenCalled();
    expect(useIapStore.getState()).toMatchObject({
      status: 'idle',
      pendingRequest: null,
      errorMessage: null,
    });
  });

  it('does not verify account A’s callback after account B starts the same SKU purchase', async () => {
    mockApiPost.mockResolvedValue({ success: true });
    mockFinishTransaction.mockResolvedValue(undefined);
    const { result } = renderHook(() => useIapPurchaseFlow());

    await act(async () => {
      await result.current.purchase('pro', 'monthly');
    });
    const accountAToken = currentIosAttemptToken();

    activateCloudAccount('iap-test-user-b');
    useIapStore.getState().reset();
    await act(async () => {
      await result.current.purchase('pro', 'monthly');
    });
    const accountBToken = currentIosAttemptToken();
    expect(accountBToken).not.toBe(accountAToken);
    mockApiPost.mockClear();

    await act(async () => {
      mockCapturedOptions.onPurchaseSuccess(
        iosPurchase({ appAccountToken: accountAToken, purchaseToken: 'account-a-receipt' }),
      );
      await Promise.resolve();
    });
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(useIapStore.getState().status).toBe('purchasing');

    await act(async () => {
      mockCapturedOptions.onPurchaseSuccess(
        iosPurchase({ appAccountToken: accountBToken, purchaseToken: 'account-b-receipt' }),
      );
    });
    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/mobile/iap/verify',
        expect.objectContaining({ receipt: 'account-b-receipt' }),
      );
      expect(useIapStore.getState().status).toBe('success');
    });
  });

  it('reconciles every restored purchase with the server on restore()', async () => {
    mockRestorePurchases.mockResolvedValue(undefined);
    mockApiPost.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useIapPurchaseFlow());
    // The hook rendered with an empty reactive list. StoreKit results arrive
    // during restore, so a correct implementation must query the returned
    // snapshot instead of reading that stale render closure.
    mockAvailablePurchases = [
      iosPurchase({ productId: 'com.agiworkforce.app.sub.pro.monthly', purchaseToken: 'tok-1' }),
      iosPurchase({ productId: 'com.agiworkforce.app.sub.max.monthly', purchaseToken: 'tok-2' }),
    ];

    let outcome: Awaited<ReturnType<typeof result.current.restore>> | undefined;
    await act(async () => {
      outcome = await result.current.restore();
    });

    expect(mockRestorePurchases).toHaveBeenCalled();
    expect(mockGetAvailablePurchases).toHaveBeenCalledTimes(1);
    expect(mockApiPost).toHaveBeenCalledTimes(2);
    expect(mockApiPost).toHaveBeenCalledWith('/api/mobile/iap/verify', {
      platform: 'ios',
      productId: 'com.agiworkforce.app.sub.pro.monthly',
      receipt: 'tok-1',
    });
    expect(mockApiPost).toHaveBeenCalledWith('/api/mobile/iap/verify', {
      platform: 'ios',
      productId: 'com.agiworkforce.app.sub.max.monthly',
      receipt: 'tok-2',
    });
    expect(mockRefreshTier).toHaveBeenCalledTimes(1);
    expect(useIapStore.getState().status).toBe('success');
    expect(outcome).toEqual({ kind: 'restored', tiers: ['pro', 'max'] });
  });

  it('returns an explicit no-purchases outcome without calling verification', async () => {
    mockAvailablePurchases = [];
    mockRestorePurchases.mockResolvedValue(undefined);

    const { result } = renderHook(() => useIapPurchaseFlow());
    let outcome: Awaited<ReturnType<typeof result.current.restore>> | undefined;
    await act(async () => {
      outcome = await result.current.restore();
    });

    expect(outcome).toEqual({ kind: 'none' });
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockRefreshTier).not.toHaveBeenCalled();
    expect(useIapStore.getState().status).toBe('success');
  });

  it('surfaces an error if any restored purchase fails verification', async () => {
    mockAvailablePurchases = [iosPurchase({ purchaseToken: 'tok-bad' })];
    mockRestorePurchases.mockResolvedValue(undefined);
    mockApiPost.mockRejectedValue(new Error('receipt invalid'));

    const { result } = renderHook(() => useIapPurchaseFlow());

    let outcome: Awaited<ReturnType<typeof result.current.restore>> | undefined;
    await act(async () => {
      outcome = await result.current.restore();
    });

    expect(useIapStore.getState().status).toBe('error');
    expect(useIapStore.getState().errorMessage).toBe('receipt invalid');
    expect(outcome).toEqual({ kind: 'failed', message: 'receipt invalid' });
  });

  it('blocks a second store purchase when the active subscription belongs to the web', async () => {
    Object.assign(mockTierState, { billingStatus: 'active', billingSource: 'stripe' });
    const { result } = renderHook(() => useIapPurchaseFlow());

    await act(async () => {
      await result.current.purchase('pro', 'monthly');
    });

    expect(mockRequestPurchase).not.toHaveBeenCalled();
    expect(useIapStore.getState()).toMatchObject({
      status: 'error',
      errorMessage: expect.stringContaining('AGI Workforce on the web'),
    });
  });
});
