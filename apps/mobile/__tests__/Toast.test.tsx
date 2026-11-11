import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { ToastHost, showToast } from '../src/shared/components/Toast';

const DEFAULT_MS = 5_000;

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

  it('keeps an Undo toast for the recommended action timeout when it is longer than the default', async () => {
    recommended.mockResolvedValue(12_000);
    const view = render(<ToastHost />);
    act(() => showToast('Chat archived', { label: 'Undo', onPress: jest.fn() }));
    await flushPromises();

    expect(recommended).toHaveBeenCalledWith(DEFAULT_MS);
    advance(DEFAULT_MS + 1_000);
    expect(view.queryByText('Chat archived')).toBeTruthy();
    advance(12_000 - DEFAULT_MS - 1_000);
    expect(view.queryByText('Chat archived')).toBeNull();
  });

  it('never shortens an Undo toast below the default', async () => {
    recommended.mockResolvedValue(1_000);
    const view = render(<ToastHost />);
    act(() => showToast('Chat archived', { label: 'Undo', onPress: jest.fn() }));
    await flushPromises();

    advance(DEFAULT_MS - 1);
    expect(view.queryByText('Chat archived')).toBeTruthy();
    advance(1);
    expect(view.queryByText('Chat archived')).toBeNull();
  });

  it('falls back to the default when the recommended timeout cannot be read', async () => {
    recommended.mockRejectedValue(new Error('unavailable'));
    const view = render(<ToastHost />);
    act(() => showToast('Chat archived', { label: 'Undo', onPress: jest.fn() }));
    await flushPromises();

    advance(DEFAULT_MS - 1);
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
});
