import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mediaStoreMocks = vi.hoisted(() => ({
  addJob: vi.fn(),
  updateJob: vi.fn(),
}));

vi.mock('@shared/stores/media-store', () => ({
  useMediaStore: () => mediaStoreMocks,
}));

vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn(async () => 'web-auth-token'),
}));

import { parseManagedMediaIdempotencyKey } from '@agiworkforce/utils';
import { useMediaGeneration, MediaGenerationApiError } from './useMediaGeneration';

describe('useMediaGeneration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('creates one stable managed-media identity for an image user action', async () => {
    const operationId = '0190a000-0000-7000-8000-000000000001';
    const randomUuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(operationId);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ images: [{ url: 'https://cdn.example/generated.png' }] }),
    } as Response);
    const { result } = renderHook(() => useMediaGeneration());

    await act(async () => {
      await expect(result.current.generateImage('draw a lighthouse')).resolves.toBe(
        'https://cdn.example/generated.png',
      );
    });

    expect(randomUuid).toHaveBeenCalledOnce();
    expect(mediaStoreMocks.addJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: operationId, type: 'image', prompt: 'draw a lighthouse' }),
    );
    const request = fetchMock.mock.calls[0]?.[1];
    const key = (request?.headers as Record<string, string>)['Idempotency-Key'];
    if (!key) throw new Error('Image request did not include an Idempotency-Key');
    expect(parseManagedMediaIdempotencyKey(key)).toEqual({
      surface: 'web',
      operation: 'image',
      operationId,
    });
  });

  /**
   * Video is asynchronous: POST returns a task id and the status route is
   * polled. Fake timers drive the poll so the test does not sleep 5s per tick.
   */
  describe('generateVideo', () => {
    it('starts a task, polls status, and resolves with the finished URLs', async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              success: true,
              task_id: 'google_abc123',
              status: 'queued',
              provider: 'google',
              estimated_duration_secs: 90,
            }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, task_id: 'google_abc123', status: 'processing' }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              success: true,
              task_id: 'google_abc123',
              status: 'completed',
              video_url: 'https://cdn.example/clip.mp4',
              thumbnail_url: 'https://cdn.example/clip.jpg',
            }),
          } as Response);

        const { result } = renderHook(() => useMediaGeneration());
        const pending = result.current.generateVideo('a cat surfing');
        const settled = pending.then((value) => value);

        await vi.advanceTimersByTimeAsync(15_000);
        await expect(settled).resolves.toEqual({
          videoUrl: 'https://cdn.example/clip.mp4',
          thumbnailUrl: 'https://cdn.example/clip.jpg',
        });

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/media/video/generate');
        expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
          '/api/media/video/status?task_id=google_abc123',
        );
        expect(mediaStoreMocks.addJob).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'video', prompt: 'a cat surfing', status: 'generating' }),
        );
        expect(mediaStoreMocks.updateJob).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            status: 'completed',
            resultUrl: 'https://cdn.example/clip.mp4',
          }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    /**
     * The regression this guards: the route's 403 body nests the sentinel at
     * `error.code`, and the old client threw `new Error(data.error)` — i.e.
     * "[object Object]" — so `isPaywall` was false and a Basic/Pro user got a
     * generic failure instead of the InlinePaywallCard.
     */
    it('classifies the route 403 as a paywall so the caller can render the upgrade card', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: 'Video generation is available on Max 15x and Enterprise plans.',
            type: 'invalid_request_error',
            code: 'plan_upgrade_required',
          },
        }),
      } as Response);

      const { result } = renderHook(() => useMediaGeneration());

      await act(async () => {
        await expect(result.current.generateVideo('a cat surfing')).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof MediaGenerationApiError &&
            err.isPaywall &&
            err.code === 'plan_upgrade_required' &&
            err.message.includes('Max 15x'),
        );
      });

      expect(mediaStoreMocks.updateJob).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'failed' }),
      );
    });
  });
});
