import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { softKeyboardInset, useSoftKeyboardInset } from '../soft-keyboard-inset';

const IPHONE_VIEWPORT_HEIGHT = 844;
const IOS_KEYBOARD_HEIGHT = 336;

class FakeVisualViewport extends EventTarget {
  height = IPHONE_VIEWPORT_HEIGHT;
  offsetTop = 0;

  cover(keyboardHeight: number) {
    this.height = IPHONE_VIEWPORT_HEIGHT - keyboardHeight;
    this.dispatchEvent(new Event('resize'));
  }
}

function installViewport(): FakeVisualViewport {
  const viewport = new FakeVisualViewport();
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  Object.defineProperty(window, 'innerHeight', {
    value: IPHONE_VIEWPORT_HEIGHT,
    configurable: true,
  });
  return viewport;
}

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
});

describe('softKeyboardInset', () => {
  it('reports the covered strip when the layout viewport does not resize', () => {
    expect(softKeyboardInset({ height: 508, offsetTop: 0 }, IPHONE_VIEWPORT_HEIGHT)).toBe(
      IOS_KEYBOARD_HEIGHT,
    );
  });

  it('reports nothing when the browser resized the layout viewport for the keyboard', () => {
    expect(softKeyboardInset({ height: 508, offsetTop: 0 }, 508)).toBe(0);
  });

  it('subtracts the page offset an iOS pan introduces', () => {
    expect(softKeyboardInset({ height: 508, offsetTop: 100 }, IPHONE_VIEWPORT_HEIGHT)).toBe(236);
  });

  it('ignores a shrink small enough to be collapsing browser chrome', () => {
    expect(softKeyboardInset({ height: 800, offsetTop: 0 }, IPHONE_VIEWPORT_HEIGHT)).toBe(0);
  });

  it('never reports a negative inset for an oversized visual viewport', () => {
    expect(softKeyboardInset({ height: 900, offsetTop: 0 }, IPHONE_VIEWPORT_HEIGHT)).toBe(0);
    expect(softKeyboardInset(null, IPHONE_VIEWPORT_HEIGHT)).toBe(0);
  });
});

describe('useSoftKeyboardInset', () => {
  it('lifts the composer when the keyboard opens and drops it when it closes', () => {
    const viewport = installViewport();
    const { result } = renderHook(() => useSoftKeyboardInset());

    expect(result.current).toBe(0);

    act(() => viewport.cover(IOS_KEYBOARD_HEIGHT));
    expect(result.current).toBe(IOS_KEYBOARD_HEIGHT);

    act(() => viewport.cover(0));
    expect(result.current).toBe(0);
  });

  it('stops listening once the composer unmounts', () => {
    const viewport = installViewport();
    const { result, unmount } = renderHook(() => useSoftKeyboardInset());

    act(() => viewport.cover(IOS_KEYBOARD_HEIGHT));
    const lifted = result.current;
    unmount();
    act(() => viewport.cover(0));

    expect(lifted).toBe(IOS_KEYBOARD_HEIGHT);
    expect(result.current).toBe(IOS_KEYBOARD_HEIGHT);
  });

  it('stays at zero on a browser with no visual viewport', () => {
    const { result } = renderHook(() => useSoftKeyboardInset());

    expect(result.current).toBe(0);
  });
});
