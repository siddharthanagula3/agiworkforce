import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetManagedUsageSummaryForTest,
  useManagedUsageSummary,
} from '../useManagedUsageSummary';

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
  // The reading is shared by every copy of the hook, so it outlives a test
  // unless it is cleared: without this a later test reads the previous one's
  // number and the failure looks like a bug in the hook.
  __resetManagedUsageSummaryForTest();
  vi.useRealTimers();
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('useManagedUsageSummary', () => {
  beforeEach(() => {
    __resetManagedUsageSummaryForTest();
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

/**
 * Four components mount this hook at once on a chat route: the page, the shell,
 * the composer and the settings section. Each copy used to hold its own state,
 * run its own mount fetch, its own five minute timer and its own visibility
 * listener, so one turn asked `/api/usage` four times and the four answers could
 * disagree with each other while they landed.
 *
 * These count REQUESTS rather than renders, because the request count is the
 * defect. A test that counted renders would pass either way.
 */
describe('the usage reading is shared, not fetched per component', () => {
  beforeEach(() => {
    __resetManagedUsageSummaryForTest();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  function mockUsage() {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => summary(20) }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it('asks once when one component mounts', async () => {
    const fetchMock = mockUsage();

    const { result } = renderHook(() => useManagedUsageSummary());
    await waitFor(() => expect(result.current.usage).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks once when four components mount together', async () => {
    const fetchMock = mockUsage();

    const page = renderHook(() => useManagedUsageSummary());
    const shell = renderHook(() => useManagedUsageSummary());
    const composer = renderHook(() => useManagedUsageSummary());
    const settings = renderHook(() => useManagedUsageSummary());

    await waitFor(() => expect(page.result.current.usage).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const copy of [shell, composer, settings]) {
      expect(copy.result.current.usage?.session_usage_percentage).toBe(20);
    }
  });

  it('gives a component that mounts later the reading already loaded', async () => {
    const fetchMock = mockUsage();

    const first = renderHook(() => useManagedUsageSummary());
    await waitFor(() => expect(first.result.current.usage).not.toBeNull());

    const later = renderHook(() => useManagedUsageSummary());
    await waitFor(() => expect(later.result.current.usage).not.toBeNull());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still goes to the server when something asks for a refresh', async () => {
    const fetchMock = mockUsage();

    const { result } = renderHook(() => useManagedUsageSummary());
    await waitFor(() => expect(result.current.usage).not.toBeNull());

    await act(async () => {
      await result.current.refresh();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('revalidates once for all copies, not once per copy', async () => {
    const fetchMock = mockUsage();

    const page = renderHook(() => useManagedUsageSummary());
    renderHook(() => useManagedUsageSummary());
    renderHook(() => useManagedUsageSummary());
    await waitFor(() => expect(page.result.current.usage).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(301_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops revalidating once the last copy unmounts', async () => {
    const fetchMock = mockUsage();

    const only = renderHook(() => useManagedUsageSummary());
    await waitFor(() => expect(only.result.current.usage).not.toBeNull());
    only.unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(301_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
