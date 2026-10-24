import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useModelCatalogue } from '../use-model-catalogue';

const READY_BODY = {
  models: [
    {
      id: 'model-a',
      developer: 'dev-a',
      developerLabel: 'Developer A',
      admitted: true,
    },
    {
      id: 'model-b',
      developer: 'dev-a',
      developerLabel: 'Developer A',
      admitted: false,
    },
  ],
  count: 2,
  planLabel: 'Plan',
};

function stubFetch(responses: Array<{ ok: boolean; body?: unknown }>) {
  const calls: number[] = [];
  const fetchMock = vi.fn(() => {
    const next = responses[Math.min(calls.length, responses.length - 1)];
    calls.push(Date.now());
    return Promise.resolve({
      ok: next?.ok ?? false,
      status: next?.ok ? 200 : 503,
      json: () => Promise.resolve(next?.body ?? {}),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useModelCatalogue', () => {
  it('settles into a single error state after one failed request', async () => {
    const fetchMock = stubFetch([{ ok: false }]);
    const { result } = renderHook(() => useModelCatalogue(true));

    await waitFor(() => expect(result.current.status).toBe('error'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('error');
  });

  it('retries only when asked and then reports the catalogue', async () => {
    const fetchMock = stubFetch([{ ok: false }, { ok: true, body: READY_BODY }]);
    const { result } = renderHook(() => useModelCatalogue(true));
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.count).toBe(2);
    expect(result.current.developers).toEqual([
      { key: 'dev-a', label: 'Developer A', admittedCount: 1, totalCount: 2 },
    ]);
  });

  it('loads once per mount and ignores a retry after success', async () => {
    const fetchMock = stubFetch([{ ok: true, body: READY_BODY }]);
    const { result, rerender } = renderHook(({ enabled }) => useModelCatalogue(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ enabled: false });
    rerender({ enabled: true });
    act(() => result.current.retry());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('ready');
  });

  it('does not request anything while disabled', () => {
    const fetchMock = stubFetch([{ ok: true, body: READY_BODY }]);
    const { result } = renderHook(() => useModelCatalogue(false));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});
