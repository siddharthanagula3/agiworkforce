import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@shared/stores/query-client';
import { useMediaModelAvailability } from './use-media-model-availability';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderAvailabilityHook() {
  return renderHook(() => useMediaModelAvailability(), { wrapper });
}

const validResponse = {
  catalog_version: '1',
  image_storage_configured: true,
  video_storage_configured: true,
  image_schema_configured: true,
  video_schema_configured: true,
  checked_at: '2026-08-09T12:00:00.000Z',
  models: [
    {
      model_id: 'catalog-image-fixture',
      name: 'Catalog image fixture',
      kind: 'image',
      provider: 'google',
      state: 'enabled',
    },
  ],
};

describe('useMediaModelAvailability', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('two mounted consumers within the cache window issue one request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(validResponse), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = renderAvailabilityHook();
    const second = renderAvailabilityHook();

    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('admits only a runtime-validated server response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(validResponse), { status: 200 })),
    );
    const { result } = renderAvailabilityHook();

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.admissionFor('catalog-image-fixture')?.state).toBe('enabled');
  });

  it('fails closed on a malformed payload and retries the availability request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ models: 'not-an-array' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(validResponse), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderAvailabilityHook();

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.admissionFor('catalog-image-fixture')).toBeUndefined();

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed instead of leaving the composer in Checking forever', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => undefined),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderAvailabilityHook();
    const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.signal;

    expect(result.current.status).toBe('loading');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.runAllTimersAsync();
    });

    expect(signal?.aborted).toBe(true);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/took too long/i);
    expect(result.current.admissionFor('catalog-image-fixture')).toBeUndefined();
  });

  it('surfaces plain language instead of transport or contract detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    const { result } = renderAvailabilityHook();

    await waitFor(() => expect(result.current.status).toBe('error'), { timeout: 3_000 });
    expect(result.current.error).not.toMatch(/HTTP|500|contract|schema|payload/i);
    expect(result.current.error).toMatch(/image and video models/i);
  });

  it('aborts the request when its composer unmounts', () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => undefined),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderAvailabilityHook();
    const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.signal;

    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('honors Retry-After once before accepting a valid deployment response', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', { status: 429, headers: { 'Retry-After': '1' } }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(validResponse), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderAvailabilityHook();

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.runAllTimersAsync();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('ready');
  });
});
