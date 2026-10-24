const mockGetStorefront = jest.fn();

jest.mock('expo-iap', () => ({
  getStorefront: () => mockGetStorefront(),
}));

import { Platform } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  storefrontAllowsWebBillingLinks,
  useWebBillingLinksAllowed,
} from '@/src/features/billing/webBillingLinks';

describe('web billing links follow the store country', () => {
  const originalOS = Platform.OS;

  function setOS(os: typeof Platform.OS) {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  }

  afterEach(() => {
    setOS(originalOS);
    mockGetStorefront.mockReset();
  });

  it('allows them only on the United States App Store storefront', () => {
    expect(storefrontAllowsWebBillingLinks('ios', 'USA')).toBe(true);
    expect(storefrontAllowsWebBillingLinks('ios', ' usa ')).toBe(true);
    expect(storefrontAllowsWebBillingLinks('ios', 'GBR')).toBe(false);
    expect(storefrontAllowsWebBillingLinks('ios', null)).toBe(false);
    expect(storefrontAllowsWebBillingLinks('android', 'USA')).toBe(false);
    expect(storefrontAllowsWebBillingLinks('android', 'US')).toBe(false);
  });

  it('never asks the store on Android', () => {
    setOS('android');
    mockGetStorefront.mockResolvedValue('USA');

    const { result } = renderHook(() => useWebBillingLinksAllowed());

    expect(result.current).toBe(false);
    expect(mockGetStorefront).not.toHaveBeenCalled();
  });

  it('turns them on once a US iOS storefront is read', async () => {
    setOS('ios');
    mockGetStorefront.mockResolvedValue('USA');

    const { result } = renderHook(() => useWebBillingLinksAllowed());

    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it.each([
    ['a non-US storefront', () => mockGetStorefront.mockResolvedValue('GBR')],
    ['an unreadable storefront', () => mockGetStorefront.mockRejectedValue(new Error('offline'))],
  ])('keeps them off on iOS with %s', async (_case, arrange) => {
    setOS('ios');
    arrange();

    const { result } = renderHook(() => useWebBillingLinksAllowed());

    await waitFor(() => expect(mockGetStorefront).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(result.current).toBe(false);
  });
});
