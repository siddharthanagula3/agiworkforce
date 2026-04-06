import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExecutionSidecarAutoOpen } from '../useExecutionSidecarAutoOpen';
import { useChatStore } from '../../stores/chat/chatStore';
import { useExecutionSidecarStore } from '../../stores/executionSidecarStore';

describe('useExecutionSidecarAutoOpen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useChatStore.getState().resetOnLogout();
    useExecutionSidecarStore.getState().reset();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    useChatStore.getState().resetOnLogout();
    useExecutionSidecarStore.getState().reset();
  });

  it('opens the sidecar when the canonical loop state becomes active', () => {
    renderHook(() => useExecutionSidecarAutoOpen());

    act(() => {
      useChatStore.getState().setAgenticLoopStatus({
        active: true,
        conversationId: 42,
        iteration: 0,
        maxIterations: 5,
      });
    });

    expect(useExecutionSidecarStore.getState().isOpen).toBe(true);
    expect(useExecutionSidecarStore.getState().isCollapsed).toBe(false);
  });

  it('does not auto-open when the user already closed the sidecar this session', () => {
    useExecutionSidecarStore.getState().close();

    renderHook(() => useExecutionSidecarAutoOpen());

    act(() => {
      useChatStore.getState().setAgenticLoopStatus({
        active: true,
        conversationId: 42,
        iteration: 0,
        maxIterations: 5,
      });
    });

    expect(useExecutionSidecarStore.getState().isOpen).toBe(false);
  });

  it('collapses the sidecar three seconds after the loop ends', () => {
    renderHook(() => useExecutionSidecarAutoOpen());

    act(() => {
      useChatStore.getState().setAgenticLoopStatus({
        active: true,
        conversationId: 42,
        iteration: 0,
        maxIterations: 5,
      });
    });

    expect(useExecutionSidecarStore.getState().isOpen).toBe(true);
    expect(useExecutionSidecarStore.getState().isCollapsed).toBe(false);

    act(() => {
      useChatStore.getState().setAgenticLoopStatus(null);
    });

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(useExecutionSidecarStore.getState().isCollapsed).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(useExecutionSidecarStore.getState().isCollapsed).toBe(true);
  });

  it('cancels a pending collapse when a new loop starts before the timer fires', () => {
    renderHook(() => useExecutionSidecarAutoOpen());

    act(() => {
      useChatStore.getState().setAgenticLoopStatus({
        active: true,
        conversationId: 42,
        iteration: 0,
        maxIterations: 5,
      });
      useExecutionSidecarStore.getState().expand();
      useChatStore.getState().setAgenticLoopStatus(null);
    });

    act(() => {
      vi.advanceTimersByTime(2000);
      useChatStore.getState().setAgenticLoopStatus({
        active: true,
        conversationId: 42,
        iteration: 1,
        maxIterations: 5,
      });
      vi.advanceTimersByTime(1000);
    });

    expect(useExecutionSidecarStore.getState().isOpen).toBe(true);
    expect(useExecutionSidecarStore.getState().isCollapsed).toBe(false);
  });
});
