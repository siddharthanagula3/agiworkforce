import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { AccessibilityInfo, Animated } from 'react-native';

jest.mock('../src/ui/theme', () => ({
  useThemeColors: () => ({
    teal: '#0f9b8e',
    accentText: '#ffffff',
    scrim: '#00000099',
    surfaceElevated: '#ffffff',
    textPrimary: '#111111',
    textMuted: '#777777',
  }),
  spacing: { sm: 8, lg: 16, '2xl': 24 },
  radii: { xl: 16, full: 999 },
}));

jest.mock('../hooks/useNetworkStatus', () => ({
  useNetworkStatus: jest.fn(() => ({ isOnline: true })),
}));

import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useReduceMotion } from '../src/ui/theme/useReduceMotion';
import { OfflineBanner } from '../src/features/edge-cases/components/OfflineBanner';

const mockedUseNetworkStatus = useNetworkStatus as unknown as jest.Mock;

type MotionListener = (enabled: boolean) => void;

function mockAccessibility(enabled: boolean): {
  emit: (next: boolean) => void;
  remove: jest.Mock;
  subscriptions: () => number;
} {
  const listeners = new Set<MotionListener>();
  const remove = jest.fn();
  let subscriptions = 0;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(enabled);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((event: string, listener: MotionListener) => {
      if (event === 'reduceMotionChanged') {
        subscriptions += 1;
        listeners.add(listener);
      }
      return { remove } as never;
    });
  return {
    emit: (next: boolean) => listeners.forEach((listener) => listener(next)),
    remove,
    subscriptions: () => subscriptions,
  };
}

async function primeReduceMotion(enabled: boolean): Promise<void> {
  const { result, unmount } = renderHook(() => useReduceMotion());
  await waitFor(() => expect(result.current).toBe(enabled));
  unmount();
}

const SAFE_AREA: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function withSafeArea(node: React.ReactElement): React.ReactElement {
  return <SafeAreaProvider initialMetrics={SAFE_AREA}>{node}</SafeAreaProvider>;
}

describe('useReduceMotion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscribes to the OS reduce-motion event and follows live changes', async () => {
    const { emit, remove } = mockAccessibility(false);

    const { result, unmount } = renderHook(() => useReduceMotion());

    await waitFor(() => expect(result.current).toBe(false));
    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
      'reduceMotionChanged',
      expect.any(Function),
    );

    act(() => emit(true));
    expect(result.current).toBe(true);

    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('shares one native subscription across concurrent consumers', async () => {
    const { emit, remove, subscriptions } = mockAccessibility(false);

    const first = renderHook(() => useReduceMotion());
    const second = renderHook(() => useReduceMotion());

    expect(subscriptions()).toBe(1);

    act(() => emit(true));
    await waitFor(() => {
      expect(first.result.current).toBe(true);
      expect(second.result.current).toBe(true);
    });

    first.unmount();
    expect(remove).not.toHaveBeenCalled();
    second.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('reduce-motion is honoured by mounted animated components', () => {
  let timing: jest.SpyInstance;
  let parallel: jest.SpyInstance;
  let setValue: jest.SpyInstance;

  beforeEach(() => {
    timing = jest
      .spyOn(Animated, 'timing')
      .mockImplementation(() => ({ start: jest.fn() }) as never);
    parallel = jest
      .spyOn(Animated, 'parallel')
      .mockImplementation(() => ({ start: jest.fn() }) as never);
    setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
    mockedUseNetworkStatus.mockReturnValue({ isOnline: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('snaps the offline banner into place when reduce motion turns on after mount', async () => {
    const { emit } = mockAccessibility(false);
    await primeReduceMotion(false);

    const screen = render(withSafeArea(<OfflineBanner />));
    act(() => emit(true));
    parallel.mockClear();
    setValue.mockClear();

    mockedUseNetworkStatus.mockReturnValue({ isOnline: false });
    screen.rerender(withSafeArea(<OfflineBanner />));

    expect(parallel).not.toHaveBeenCalled();
    expect(setValue).toHaveBeenCalledWith(0);
    expect(setValue).toHaveBeenCalledWith(1);
  });
});
