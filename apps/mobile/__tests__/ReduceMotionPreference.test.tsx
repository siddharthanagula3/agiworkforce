import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useReduceMotion } from '../src/ui/theme/useReduceMotion';

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
