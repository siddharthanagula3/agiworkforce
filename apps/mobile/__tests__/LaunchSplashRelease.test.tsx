import { renderHook } from '@testing-library/react-native';

import {
  LAUNCH_SPLASH_MAX_HOLD_MS,
  holdLaunchSplash,
  useLaunchSplashRelease,
} from '@/src/shared/hooks/useLaunchSplash';

const mockPreventAutoHideAsync = jest.fn<Promise<boolean>, []>();
const mockHideAsync = jest.fn<Promise<boolean>, []>();

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: () => mockPreventAutoHideAsync(),
  hideAsync: () => mockHideAsync(),
}));

beforeEach(() => {
  mockPreventAutoHideAsync.mockReset().mockResolvedValue(true);
  mockHideAsync.mockReset().mockResolvedValue(true);
});

describe('holdLaunchSplash', () => {
  it('prevents the automatic hide', () => {
    holdLaunchSplash();

    expect(mockPreventAutoHideAsync).toHaveBeenCalledTimes(1);
  });

  it('swallows the rejection Expo throws when the splash is already gone', async () => {
    mockPreventAutoHideAsync.mockRejectedValue(new Error('No native splash screen registered'));

    expect(() => holdLaunchSplash()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});

describe('useLaunchSplashRelease', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the launch screen up while the app is not ready', () => {
    renderHook(({ isReady }) => useLaunchSplashRelease(isReady), {
      initialProps: { isReady: false },
    });

    jest.advanceTimersByTime(LAUNCH_SPLASH_MAX_HOLD_MS - 1);

    expect(mockHideAsync).not.toHaveBeenCalled();
  });

  it('hides as soon as the app reports ready', () => {
    const { rerender } = renderHook(({ isReady }) => useLaunchSplashRelease(isReady), {
      initialProps: { isReady: false },
    });

    expect(mockHideAsync).not.toHaveBeenCalled();

    rerender({ isReady: true });

    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });

  it('hides immediately when the app is already ready on mount', () => {
    renderHook(({ isReady }) => useLaunchSplashRelease(isReady), {
      initialProps: { isReady: true },
    });

    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });

  it('releases on the watchdog so a stuck startup is not a frozen launch image', () => {
    renderHook(({ isReady }) => useLaunchSplashRelease(isReady), {
      initialProps: { isReady: false },
    });

    jest.advanceTimersByTime(LAUNCH_SPLASH_MAX_HOLD_MS);

    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });

  it('never hides twice, so a late ready cannot flash the launch image back', () => {
    const { rerender } = renderHook(({ isReady }) => useLaunchSplashRelease(isReady), {
      initialProps: { isReady: false },
    });

    jest.advanceTimersByTime(LAUNCH_SPLASH_MAX_HOLD_MS);
    expect(mockHideAsync).toHaveBeenCalledTimes(1);

    rerender({ isReady: true });

    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });

  it('clears the watchdog on unmount', () => {
    const { unmount } = renderHook(({ isReady }) => useLaunchSplashRelease(isReady), {
      initialProps: { isReady: false },
    });

    unmount();
    jest.advanceTimersByTime(LAUNCH_SPLASH_MAX_HOLD_MS * 2);

    expect(mockHideAsync).not.toHaveBeenCalled();
  });
});
