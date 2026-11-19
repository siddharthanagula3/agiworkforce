import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

let mockFocusCallbacks: Array<() => void | (() => void)> = [];

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(() => {
      mockFocusCallbacks.push(callback);
      return callback();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

import { useGreetingTime } from '../useGreetingTime';

const MORNING = new Date(2026, 10, 16, 8, 0, 0);
const EVENING = new Date(2026, 10, 16, 20, 0, 0);

describe('useGreetingTime', () => {
  let appStateHandlers: Array<(state: string) => void>;
  const remove = jest.fn();

  beforeEach(() => {
    mockFocusCallbacks = [];
    appStateHandlers = [];
    remove.mockClear();
    jest.useFakeTimers({ now: MORNING });
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      handler: (state: string) => void,
    ) => {
      appStateHandlers.push(handler);
      return { remove };
    }) as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('starts at the time the screen opens', () => {
    const { result } = renderHook(() => useGreetingTime());
    expect(result.current.getTime()).toBe(MORNING.getTime());
  });

  it('keeps the same time across renders', () => {
    const { result, rerender } = renderHook(() => useGreetingTime());
    act(() => {
      jest.setSystemTime(EVENING);
    });
    rerender({});
    expect(result.current.getTime()).toBe(MORNING.getTime());
  });

  it('takes the current time when the screen gains focus again', () => {
    const { result } = renderHook(() => useGreetingTime());
    act(() => {
      jest.setSystemTime(EVENING);
      mockFocusCallbacks[0]?.();
    });
    expect(result.current.getTime()).toBe(EVENING.getTime());
  });

  it('takes the current time when the app returns to the foreground', () => {
    const { result } = renderHook(() => useGreetingTime());
    act(() => {
      jest.setSystemTime(EVENING);
      appStateHandlers[0]?.('active');
    });
    expect(result.current.getTime()).toBe(EVENING.getTime());
  });

  it('does not move when the app goes to the background', () => {
    const { result } = renderHook(() => useGreetingTime());
    act(() => {
      jest.setSystemTime(EVENING);
      appStateHandlers[0]?.('background');
    });
    expect(result.current.getTime()).toBe(MORNING.getTime());
  });

  it('stops listening to the app state when the screen goes away', () => {
    const { unmount } = renderHook(() => useGreetingTime());
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
