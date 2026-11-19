import { BackHandler, Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import {
  useBottomSheetPresence,
  useHardwareBackDismiss,
  useSystemScreenSheet,
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

describe('useSystemScreenSheet', () => {
  const originalOS = Platform.OS;
  function setPlatform(os: 'ios' | 'android') {
    Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
  }

  function sheetMethods(): BottomSheet {
    return {
      snapToIndex: jest.fn(),
      snapToPosition: jest.fn(),
      expand: jest.fn(),
      collapse: jest.fn(),
      close: jest.fn(),
      forceClose: jest.fn(),
    };
  }

  function renderSheetHook() {
    const inner = sheetMethods();
    const sheetRef: { current: BottomSheet | null } = { current: inner };
    const forwardedRef: { current: BottomSheet | null } = { current: null };
    const closeSheet = jest.fn();
    const onUnmount = jest.fn();
    const hook = renderHook(() =>
      useSystemScreenSheet({ forwardedRef, sheetRef, closeSheet, onUnmount }),
    );
    return { hook, inner, sheetRef, forwardedRef, closeSheet, onUnmount };
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  });

  it('on Android unmounts the sheet without a close animation and launches a frame later', () => {
    setPlatform('android');
    const { hook, closeSheet, onUnmount } = renderSheetHook();
    const launch = jest.fn();
    expect(hook.result.current.mounted).toBe(true);

    act(() => hook.result.current.launch(launch));

    expect(hook.result.current.mounted).toBe(false);
    expect(onUnmount).toHaveBeenCalledTimes(1);
    expect(closeSheet).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();

    act(() => jest.runOnlyPendingTimers());
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('on Android launches once for a second request in the same frame', () => {
    setPlatform('android');
    const { hook } = renderSheetHook();
    const first = jest.fn();
    const second = jest.fn();

    act(() => {
      hook.result.current.launch(first);
      hook.result.current.launch(second);
    });
    act(() => jest.runOnlyPendingTimers());

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('on Android launches again after the first one ran', () => {
    setPlatform('android');
    const { hook, forwardedRef } = renderSheetHook();
    const launch = jest.fn();

    act(() => hook.result.current.launch(launch));
    act(() => jest.runOnlyPendingTimers());
    act(() => forwardedRef.current?.snapToIndex(0));
    act(() => hook.result.current.launch(launch));
    act(() => jest.runOnlyPendingTimers());

    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('mounts a fresh sheet open when it is asked to open after a launch', () => {
    setPlatform('android');
    const { hook, inner, sheetRef, forwardedRef } = renderSheetHook();
    act(() => hook.result.current.launch(jest.fn()));
    act(() => jest.runOnlyPendingTimers());
    const unmountedGeneration = hook.result.current.generation;
    sheetRef.current = null;

    act(() => forwardedRef.current?.close());
    act(() => forwardedRef.current?.snapToIndex(-1));
    expect(hook.result.current.mounted).toBe(false);

    act(() => forwardedRef.current?.snapToIndex(0));

    expect(hook.result.current).toMatchObject({
      mounted: true,
      index: 0,
      generation: unmountedGeneration,
    });
    expect(unmountedGeneration).toBeGreaterThan(0);
    expect(inner.snapToIndex).not.toHaveBeenCalled();
    expect(inner.close).not.toHaveBeenCalled();
  });

  it('keeps the sheet out while a launch waits for its frame, then opens it after', () => {
    setPlatform('android');
    const { hook, forwardedRef } = renderSheetHook();
    const launch = jest.fn();
    act(() => hook.result.current.launch(launch));

    act(() => forwardedRef.current?.snapToIndex(0));
    expect(hook.result.current.mounted).toBe(false);

    act(() => jest.runOnlyPendingTimers());
    expect(launch).toHaveBeenCalledTimes(1);
    expect(hook.result.current.mounted).toBe(false);

    act(() => forwardedRef.current?.snapToIndex(0));
    expect(hook.result.current).toMatchObject({ mounted: true, index: 0 });
  });

  it('passes every call to the sheet while it is mounted', () => {
    setPlatform('android');
    const { inner, forwardedRef } = renderSheetHook();

    act(() => {
      forwardedRef.current?.snapToIndex(0);
      forwardedRef.current?.expand();
      forwardedRef.current?.close();
    });

    expect(inner.snapToIndex).toHaveBeenCalledWith(0, undefined);
    expect(inner.expand).toHaveBeenCalledTimes(1);
    expect(inner.close).toHaveBeenCalledTimes(1);
  });

  it('drops a launch whose screen leaves before the frame', () => {
    setPlatform('android');
    const { hook } = renderSheetHook();
    const launch = jest.fn();

    act(() => hook.result.current.launch(launch));
    hook.unmount();
    act(() => jest.runOnlyPendingTimers());

    expect(launch).not.toHaveBeenCalled();
  });

  it('on iOS closes the sheet and launches at once, keeping it mounted', () => {
    setPlatform('ios');
    const { hook, closeSheet, onUnmount } = renderSheetHook();
    const launch = jest.fn();

    act(() => hook.result.current.launch(launch));

    expect(closeSheet).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(onUnmount).not.toHaveBeenCalled();
    expect(hook.result.current).toMatchObject({ mounted: true, index: -1, generation: 0 });
  });
});
