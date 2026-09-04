import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useManagedUsageSummary } from '../useManagedUsageSummary';

const originalFetch = global.fetch;

function summary(sessionUsagePercentage: number) {
  return {
    plan_tier: 'pro',
    usage_percentage: 10,
    usage_reset_at: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(),
    has_usage_remaining: true,
    period_start: new Date(Date.now() - 25 * 24 * 60 * 60_000).toISOString(),
    period_end: new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString(),
    subscription_status: 'active',
    session_usage_percentage: sessionUsagePercentage,
    session_reset_at: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
    weekly_usage_percentage: 10,
    weekly_reset_at: new Date(Date.now() + 4 * 24 * 60 * 60_000).toISOString(),
    flagship_weekly_usage_percentage: 10,
    flagship_weekly_reset_at: new Date(Date.now() + 4 * 24 * 60 * 60_000).toISOString(),
  };
}

afterEach(() => {
  vi.useRealTimers();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('useManagedUsageSummary', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('re-reads /api/usage while the tab is visible so a mid-session climb is seen', async () => {
    let percentage = 20;
    const fetchMock = vi.fn(
      async () => ({ ok: true, json: async () => summary(percentage) }) as Response,
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useManagedUsageSummary());
    await waitFor(() => expect(result.current.usage?.session_usage_percentage).toBe(20));

    percentage = 95;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(301_000);
    });

    await waitFor(() => expect(result.current.usage?.session_usage_percentage).toBe(95));
  });

  it('does not poll a hidden tab, and re-reads as soon as it becomes visible again', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => summary(20) }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');

    renderHook(() => useManagedUsageSummary());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    visibility.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('reports a failed background re-read as stale without blanking the numbers', async () => {
    let ok = true;
    const fetchMock = vi.fn(async () => ({ ok, json: async () => summary(20) }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useManagedUsageSummary());
    await waitFor(() => expect(result.current.usage?.session_usage_percentage).toBe(20));
    expect(result.current.stale).toBe(false);

    ok = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(301_000);
    });

    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.usage?.session_usage_percentage).toBe(20);
    expect(result.current.error).toBeNull();
  });
});
