import { renderHook } from '@testing-library/react-native';
import { MOBILE_IAP_PRODUCT_DEFINITIONS } from '@agiworkforce/types';
import { FEATURES } from '@/lib/v1FeatureFlags';

const mockUseIAP = jest.fn(() => {
  throw new Error('The native store must not connect in the free-first release.');
});
const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('expo-iap', () => ({
  useIAP: () => mockUseIAP(),
  getPendingTransactionsIOS: jest.fn(),
}));
jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import { useMobileIap } from '@/src/features/billing/useMobileIap';
import {
  fetchMobileIapCatalog,
  joinBillingUpgradeWaitlist,
  redeemBillingUpgradeCode,
  verifyMobileIapPurchase,
} from '@/src/features/billing/mobileIapService';

describe('free-first native purchase boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ships with native purchases disabled in the canonical build flags', () => {
    expect(FEATURES).toHaveProperty('nativePurchases', false);
  });

  it('never mounts the auto-connecting store hook, including after account enablement', async () => {
    const { result, rerender } = renderHook(({ enabled }) => useMobileIap({ enabled }), {
      initialProps: { enabled: false },
    });
    rerender({ enabled: true });

    expect(result.current).toMatchObject({
      connected: false,
      loading: false,
      restoring: false,
      purchasingKey: null,
      catalog: null,
      lastResult: null,
    });
    expect(result.current.storeProducts.size).toBe(0);
    await expect(result.current.purchase(MOBILE_IAP_PRODUCT_DEFINITIONS[0]!.key)).rejects.toThrow(
      'In-app purchases are not available in this version.',
    );
    await expect(result.current.restore()).rejects.toThrow('In-app purchases');
    await expect(result.current.reload()).rejects.toThrow('In-app purchases');
    expect(mockUseIAP).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('rejects catalog, receipt, code and upgrade requests before network access', async () => {
    await expect(fetchMobileIapCatalog()).rejects.toThrow('In-app purchases');
    await expect(
      verifyMobileIapPurchase({
        platform: 'ios',
        productId: 'fixture.product',
        purchaseToken: 'fixture.receipt',
      }),
    ).rejects.toThrow('In-app purchases');
    await expect(redeemBillingUpgradeCode('AGI2026')).rejects.toThrow('In-app purchases');
    await expect(joinBillingUpgradeWaitlist('pro')).rejects.toThrow('In-app purchases');
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
