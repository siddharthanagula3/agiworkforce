import { afterEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSearchAllowance } from './use-search-allowance';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('stops waiting when the read request hangs and ignores a late answer', async () => {
  vi.useFakeTimers();
  let resolveCheck!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>((resolve) => (resolveCheck = resolve))),
  );
  const { result } = renderHook(() => useSearchAllowance(true, 'account-1'));
  expect(result.current.allowance.status).toBe('checking');

  act(() => vi.advanceTimersByTime(10_000));
  expect(result.current.allowance.status).toBe('unavailable');
  await act(async () => {
    resolveCheck(
      new Response(JSON.stringify({ status: 'available', used: 1, limit: 20, windowDays: 30 })),
    );
  });
  expect(result.current.allowance.status).toBe('unavailable');
});

it('keeps a valid result after the timeout window has passed', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'available', used: 1, limit: 20, windowDays: 30 })),
    ),
  );
  const { result } = renderHook(() => useSearchAllowance(true, 'account-1'));
  await act(async () => Promise.resolve());
  expect(result.current.allowance.status).toBe('available');

  act(() => vi.advanceTimersByTime(10_000));
  expect(result.current.allowance.status).toBe('available');
});
