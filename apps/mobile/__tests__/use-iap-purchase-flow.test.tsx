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
import { renderHook, act } from '@testing-library/react-native';
import { useIapPurchaseFlow } from '@/src/features/billing/useIapPurchaseFlow';
import { useIapStore } from '@/src/features/billing/iapStore';

const mockRequestPurchase = jest.fn();
const mockRestorePurchases = jest.fn();
const mockFinishTransaction = jest.fn();
const mockFetchProducts = jest.fn();
const mockDeepLinkToSubscriptions = jest.fn();

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
}));

const mockApiPost = jest.fn();
jest.mock('@/services/api', () => ({
  api: { post: (...args: unknown[]) => mockApiPost(...args) },
}));

function iosPurchase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    productId: 'com.agiworkforce.app.sub.pro.monthly',
    purchaseToken: 'jws-representation-abc',
    platform: 'ios',
    ...overrides,
  };
}

describe('useIapPurchaseFlow — server reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAvailablePurchases = [];
    useIapStore.getState().reset();
  });

  it('reports a completed purchase to /api/mobile/iap/verify before finishing the transaction', async () => {
    mockApiPost.mockResolvedValue({
      success: true,
      planTier: 'pro',
      status: 'active',
      currentPeriodEnd: '2026-08-01T00:00:00.000Z',
      usageBudgetCents: 700,
    });
    mockFinishTransaction.mockResolvedValue(undefined);

    renderHook(() => useIapPurchaseFlow());
    const purchase = iosPurchase();

    await act(async () => {
      mockCapturedOptions.onPurchaseSuccess(purchase);
      // onPurchaseSuccess fires an internal async IIFE — flush microtasks.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockApiPost).toHaveBeenCalledWith('/api/mobile/iap/verify', {
      platform: 'ios',
      productId: 'com.agiworkforce.app.sub.pro.monthly',
      receipt: 'jws-representation-abc',
    });
    expect(mockFinishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false });
    expect(useIapStore.getState().status).toBe('success');
  });

  it('does not finish the transaction and surfaces an error when verification fails', async () => {
    mockApiPost.mockRejectedValue(new Error('Unknown product id'));

    renderHook(() => useIapPurchaseFlow());
    const purchase = iosPurchase();

    await act(async () => {
      mockCapturedOptions.onPurchaseSuccess(purchase);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFinishTransaction).not.toHaveBeenCalled();
    expect(useIapStore.getState().status).toBe('error');
    expect(useIapStore.getState().errorMessage).toBe('Unknown product id');
  });

  it('reconciles every restored purchase with the server on restore()', async () => {
    mockAvailablePurchases = [
      iosPurchase({ productId: 'com.agiworkforce.app.sub.pro.monthly', purchaseToken: 'tok-1' }),
      iosPurchase({ productId: 'com.agiworkforce.app.sub.max.monthly', purchaseToken: 'tok-2' }),
    ];
    mockRestorePurchases.mockResolvedValue(undefined);
    mockApiPost.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useIapPurchaseFlow());

    await act(async () => {
      await result.current.restore();
    });

    expect(mockRestorePurchases).toHaveBeenCalled();
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
    expect(useIapStore.getState().status).toBe('success');
  });

  it('surfaces an error if any restored purchase fails verification', async () => {
    mockAvailablePurchases = [iosPurchase({ purchaseToken: 'tok-bad' })];
    mockRestorePurchases.mockResolvedValue(undefined);
    mockApiPost.mockRejectedValue(new Error('receipt invalid'));

    const { result } = renderHook(() => useIapPurchaseFlow());

    await act(async () => {
      await result.current.restore();
    });

    expect(useIapStore.getState().status).toBe('error');
    expect(useIapStore.getState().errorMessage).toBe('receipt invalid');
  });
});
