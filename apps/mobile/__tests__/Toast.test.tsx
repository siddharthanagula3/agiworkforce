import React from 'react';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { colors, lightColors, spacing } from '../src/ui/theme/tokens';
import { ToastHost, showToast } from '../src/shared/components/Toast';
import { FLOATING_PRIMARY_ACTION_LIST_PADDING } from '../src/shared/components/FloatingPrimaryAction';

const DEFAULT_MS = 5_000;
const ACTION_MS = 8_000;
const GUARD_MS = 400;

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

describe('ToastHost timing', () => {
  let recommended: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    recommended = jest.spyOn(AccessibilityInfo, 'getRecommendedTimeoutMillis');
    recommended.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('keeps an Undo toast for the recommended action timeout when it is longer than the action default', async () => {
    recommended.mockResolvedValue(12_000);
    const view = render(<ToastHost />);
    act(() => showToast('Chat archived', { label: 'Undo', onPress: jest.fn() }));
    await flushPromises();

    expect(recommended).toHaveBeenCalledWith(ACTION_MS);
    advance(ACTION_MS + 1_000);
    expect(view.queryByText('Chat archived')).toBeTruthy();
    advance(12_000 - ACTION_MS - 1_000);
    expect(view.queryByText('Chat archived')).toBeNull();
  });

  it('keeps an Undo toast longer than a plain one and never shortens it below the action default', async () => {
    recommended.mockResolvedValue(1_000);
    const view = render(<ToastHost />);
    act(() => showToast('Chat archived', { label: 'Undo', onPress: jest.fn() }));
    await flushPromises();

    advance(DEFAULT_MS + 1_000);
    expect(view.queryByText('Chat archived')).toBeTruthy();
    advance(ACTION_MS - DEFAULT_MS - 1_001);
    expect(view.queryByText('Chat archived')).toBeTruthy();
    advance(1);
    expect(view.queryByText('Chat archived')).toBeNull();
  });

  it('falls back to the action default when the recommended timeout cannot be read', async () => {
    recommended.mockRejectedValue(new Error('unavailable'));
    const view = render(<ToastHost />);
    act(() => showToast('Chat archived', { label: 'Undo', onPress: jest.fn() }));
    await flushPromises();

    advance(ACTION_MS - 1);
    expect(view.queryByText('Chat archived')).toBeTruthy();
    advance(1);
    expect(view.queryByText('Chat archived')).toBeNull();
  });

  it('keeps the default duration for a toast without an action and does not ask the platform', async () => {
    recommended.mockResolvedValue(30_000);
    const view = render(<ToastHost />);
    act(() => showToast('Copied'));
    await flushPromises();

    expect(recommended).not.toHaveBeenCalled();
    advance(DEFAULT_MS - 1);
    expect(view.queryByText('Copied')).toBeTruthy();
    advance(1);
    expect(view.queryByText('Copied')).toBeNull();
  });

  it('sits above the floating primary action so Undo never overlaps the button under it', async () => {
    recommended.mockResolvedValue(1_000);
    const view = render(<ToastHost />);
    act(() => showToast('Chat archived', { label: 'Undo', onPress: jest.fn() }));
    await flushPromises();

    const host = view.toJSON() as { props: { style: { bottom: number } } };
    expect(host.props.style.bottom).toBeGreaterThanOrEqual(FLOATING_PRIMARY_ACTION_LIST_PADDING);
    advance(ACTION_MS);
  });

  it('does not let a late duration answer for an earlier toast dismiss the newer one', async () => {
    let resolveEarlier: (ms: number) => void = () => undefined;
    recommended.mockReturnValueOnce(
      new Promise<number>((resolve) => {
        resolveEarlier = resolve;
      }),
    );
    const view = render(<ToastHost />);
    act(() => showToast('Chat archived', { label: 'Undo', onPress: jest.fn() }));
    act(() => showToast('Copied'));
    resolveEarlier(500);
    await flushPromises();

    advance(1_000);
    expect(view.queryByText('Copied')).toBeTruthy();
    expect(view.queryByText('Chat archived')).toBeNull();
    advance(DEFAULT_MS);
    expect(view.queryByText('Copied')).toBeNull();
  });

  describe('tap guard after a notice with an action', () => {
    const guardOf = (view: ReturnType<typeof render>) =>
      view.queryByTestId('toast-tap-guard', { includeHiddenElements: true });

    beforeEach(() => {
      recommended.mockResolvedValue(1_000);
      act(() => showToast('Reset'));
    });

    it('keeps an invisible block where the notice was so a late tap cannot reach what is under it', async () => {
      const onUndo = jest.fn();
      const view = render(<ToastHost />);
      act(() => showToast('Chat archived', { label: 'Undo', onPress: onUndo }));
      await flushPromises();
      expect(guardOf(view)).toBeNull();

      advance(ACTION_MS);
      expect(view.queryByText('Chat archived')).toBeNull();
      const guard = guardOf(view);
      expect(guard).toBeTruthy();
      expect(guard?.props.accessibilityElementsHidden).toBe(true);
      expect(guard?.props.importantForAccessibility).toBe('no-hide-descendants');
      const guardStyle = StyleSheet.flatten(guard?.props.style);
      expect(guardStyle.opacity).not.toBe(0);
      const transparent = [colors.transparent, lightColors.transparent];
      expect(transparent).toContain(guardStyle.backgroundColor);
      expect(transparent).toContain(guardStyle.borderColor);
      const guardMessage = view.getByText('Chat archived', { includeHiddenElements: true });
      expect(StyleSheet.flatten(guardMessage.props.style).opacity).toBe(0);
      expect(view.toJSON()).toMatchObject({ props: { pointerEvents: 'box-none' } });

      fireEvent.press(view.getByLabelText('Undo', { includeHiddenElements: true }));
      expect(onUndo).not.toHaveBeenCalled();

      advance(GUARD_MS - 1);
      expect(guardOf(view)).toBeTruthy();
      advance(1);
      expect(guardOf(view)).toBeNull();
    });

    it('keeps the block after the person taps Undo so a double tap cannot reach what is under it', async () => {
      const onUndo = jest.fn();
      const view = render(<ToastHost />);
      act(() => showToast('Chat archived', { label: 'Undo', onPress: onUndo }));
      await flushPromises();

      fireEvent.press(view.getByLabelText('Undo'));
      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(guardOf(view)).toBeTruthy();

      fireEvent.press(view.getByLabelText('Undo', { includeHiddenElements: true }));
      expect(onUndo).toHaveBeenCalledTimes(1);
      advance(GUARD_MS);
      expect(guardOf(view)).toBeNull();
    });

    it('adds no block after a notice without an action', async () => {
      const view = render(<ToastHost />);
      act(() => showToast('Copied'));
      await flushPromises();

      advance(DEFAULT_MS);
      expect(view.queryByText('Copied')).toBeNull();
      expect(guardOf(view)).toBeNull();
    });

    it('drops the block when a new notice arrives', async () => {
      const view = render(<ToastHost />);
      act(() => showToast('Chat archived', { label: 'Undo', onPress: jest.fn() }));
      await flushPromises();
      advance(ACTION_MS);
      expect(guardOf(view)).toBeTruthy();

      act(() => showToast('Copied'));
      expect(guardOf(view)).toBeNull();
      expect(view.queryByText('Copied')).toBeTruthy();
    });
  });
});

describe('ToastHost width', () => {
  const MESSAGE = 'Cloud changes haven’t synced.';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    jest.spyOn(AccessibilityInfo, 'getRecommendedTimeoutMillis').mockResolvedValue(ACTION_MS);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function showAtWindowWidth(width: number) {
    const window = { width, height: 800, scale: 3, fontScale: 2 };
    jest.spyOn(Dimensions, 'get').mockReturnValue(window);
    const view = render(<ToastHost />);
    act(() => showToast(MESSAGE, { label: 'Retry', onPress: jest.fn() }));
    return view;
  }

  it('stays inside the screen on a phone, whatever the text size', () => {
    const view = showAtWindowWidth(360);

    const body = StyleSheet.flatten(view.getByTestId('toast-body').props.style);
    expect(body.maxWidth).toBe(360 - 2 * spacing.lg);
  });

  it('keeps its own width on a tablet instead of spanning the window', () => {
    const view = showAtWindowWidth(1024);

    const body = StyleSheet.flatten(view.getByTestId('toast-body').props.style);
    expect(body.maxWidth).toBe(520);
  });

  it('keeps the action a full 44 point target while the message wraps', () => {
    const view = showAtWindowWidth(360);

    const action = StyleSheet.flatten(view.getByLabelText('Retry').props.style);
    expect(action.minHeight).toBe(44);
    expect(action.minWidth).toBe(44);
    expect(action.flexShrink).toBe(0);
  });
});
