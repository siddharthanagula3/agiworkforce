import { BackHandler } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import {
  useBottomSheetPresence,
  useHardwareBackDismiss,
} from '@/src/shared/hooks/useHardwareBackDismiss';

type BackListener = () => boolean | null | undefined;

let listeners: BackListener[] = [];
let removed = 0;

function pressHardwareBack(): boolean {
  for (let i = listeners.length - 1; i >= 0; i -= 1) {
    if (listeners[i]?.()) return true;
  }
  return false;
}

beforeEach(() => {
  listeners = [];
  removed = 0;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    listeners.push(handler as BackListener);
    return {
      remove: () => {
        removed += 1;
        listeners = listeners.filter((listener) => listener !== handler);
      },
    };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useHardwareBackDismiss', () => {
  it('registers nothing while the sheet is closed', () => {
    const dismiss = jest.fn();
    renderHook(() => useHardwareBackDismiss(false, dismiss));

    expect(BackHandler.addEventListener).not.toHaveBeenCalled();
    expect(pressHardwareBack()).toBe(false);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('closes the open sheet and reports the back press as handled', () => {
    const dismiss = jest.fn();
    renderHook(() => useHardwareBackDismiss(true, dismiss));

    expect(BackHandler.addEventListener).toHaveBeenCalledWith(
      'hardwareBackPress',
      expect.any(Function),
    );
    expect(pressHardwareBack()).toBe(true);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('lets back reach the screen again once the sheet has closed', () => {
    const dismiss = jest.fn();
    const { rerender } = renderHook(({ open }) => useHardwareBackDismiss(open, dismiss), {
      initialProps: { open: true },
    });

    rerender({ open: false });

    expect(removed).toBe(1);
    expect(pressHardwareBack()).toBe(false);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('removes its listener when the sheet unmounts while open', () => {
    const { unmount } = renderHook(() => useHardwareBackDismiss(true, jest.fn()));

    unmount();

    expect(listeners).toHaveLength(0);
  });

  it('keeps the newest open sheet first when the one under it re-renders', () => {
    const lower = jest.fn();
    const upper = jest.fn();
    const below = renderHook(({ onBack }) => useHardwareBackDismiss(true, onBack), {
      initialProps: { onBack: () => lower() },
    });
    renderHook(() => useHardwareBackDismiss(true, upper));

    below.rerender({ onBack: () => lower() });

    expect(BackHandler.addEventListener).toHaveBeenCalledTimes(2);
    expect(pressHardwareBack()).toBe(true);
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });

  it('calls the latest dismiss handler without registering again', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ onBack }) => useHardwareBackDismiss(true, onBack), {
      initialProps: { onBack: first },
    });

    rerender({ onBack: second });
    pressHardwareBack();

    expect(BackHandler.addEventListener).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('useBottomSheetPresence', () => {
  it('is present from the start of the opening slide, before the sheet reports its index', () => {
    const { result } = renderHook(() => useBottomSheetPresence());
    expect(result.current[0]).toBe(false);

    act(() => result.current[1].onAnimate(-1, 0));

    expect(result.current[0]).toBe(true);
  });

  it('is gone when a close that interrupted the opening ends without an index change', () => {
    const { result } = renderHook(() => useBottomSheetPresence());
    act(() => result.current[1].onAnimate(-1, 0));

    act(() => result.current[1].onClose());

    expect(result.current[0]).toBe(false);
  });

  it('follows the settled index and stays present while a close is still sliding', () => {
    const { result } = renderHook(() => useBottomSheetPresence());

    act(() => result.current[1].onChange(0));
    expect(result.current[0]).toBe(true);

    act(() => result.current[1].onAnimate(0, -1));
    expect(result.current[0]).toBe(true);

    act(() => result.current[1].onChange(-1));
    expect(result.current[0]).toBe(false);
  });

  it('keeps the same handlers across renders', () => {
    const { result, rerender } = renderHook(() => useBottomSheetPresence());
    const first = result.current[1];

    rerender({});

    expect(result.current[1]).toBe(first);
  });
});
