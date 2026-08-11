import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMediaModelAvailability } from './use-media-model-availability';

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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('admits only a runtime-validated server response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(validResponse), { status: 200 })),
    );
    const { result } = renderHook(() => useMediaModelAvailability());

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
    const { result } = renderHook(() => useMediaModelAvailability());

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
    const { result } = renderHook(() => useMediaModelAvailability());
    const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.signal;

    expect(result.current.status).toBe('loading');
    act(() => vi.advanceTimersByTime(10_000));

    expect(signal?.aborted).toBe(true);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/timed out/i);
    expect(result.current.admissionFor('catalog-image-fixture')).toBeUndefined();
  });

  it('aborts the request when its composer unmounts', () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => undefined),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderHook(() => useMediaModelAvailability());
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
    const { result } = renderHook(() => useMediaModelAvailability());

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('ready');
  });
});
