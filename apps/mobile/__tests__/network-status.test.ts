import { isReachableNetworkState } from '@/hooks/useNetworkStatus';

describe('isReachableNetworkState', () => {
  it('treats a connected network with unreachable internet as offline', () => {
    expect(
      isReachableNetworkState({
        isConnected: true,
        isInternetReachable: false,
      }),
    ).toBe(false);
  });

  it('treats unknown internet reachability as offline until NetInfo confirms it', () => {
    expect(
      isReachableNetworkState({
        isConnected: true,
        isInternetReachable: null,
      }),
    ).toBe(false);
  });

  it('treats connected and internet-reachable state as online', () => {
    expect(
      isReachableNetworkState({
        isConnected: true,
        isInternetReachable: true,
      }),
    ).toBe(true);
  });
});
