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
import { isExecutableVideoModel, modelsCatalog } from '@agiworkforce/types';
import { IMAGE_MODELS } from '@features/chat/lib/imageGenerationOptions';
import { IMAGE_GENERATION_FUNCTION_LIMIT_MS } from '@/lib/deadline-policy';
import { useMediaGeneration, MediaGenerationApiError } from './useMediaGeneration';

const GOOGLE_IMAGE_MODEL = IMAGE_MODELS.find((model) => model.provider === 'google');
if (!GOOGLE_IMAGE_MODEL) throw new Error('Catalog has no Google image model fixture');
const VIDEO_MODEL = Object.values(modelsCatalog.models).find(isExecutableVideoModel);
if (!VIDEO_MODEL) throw new Error('Catalog has no executable video model fixture');
const VIDEO_PROVIDER = VIDEO_MODEL.provider === 'open_router' ? 'openrouter' : VIDEO_MODEL.provider;
if (VIDEO_PROVIDER !== 'google' && VIDEO_PROVIDER !== 'runway' && VIDEO_PROVIDER !== 'openrouter') {
  throw new Error('Catalog video model has no supported Web provider mapping');
}
const VIDEO_TASK_ID = '11111111-1111-4111-8111-111111111111';

describe('MediaGenerationApiError billing recovery', () => {
  it.each([
    ['plan_upgrade_required', 'upgrade'],
    ['insufficient_credits', 'upgrade'],
    ['subscription_required', 'subscribe'],
    ['subscription_inactive', 'manage_billing'],
  ] as const)('maps %s to %s', (code, recoveryAction) => {
    const error = new MediaGenerationApiError('fixture refusal', { status: 403, code });

    expect(error.isPaywall).toBe(true);
    expect(error.recoveryAction).toBe(recoveryAction);
  });

  it('does not turn an unrelated 403 authorization failure into an upgrade prompt', () => {
    const error = new MediaGenerationApiError('You do not own this task.', {
      status: 403,
      code: 'forbidden',
    });

    expect(error.isPaywall).toBe(false);
    expect(error.recoveryAction).toBeNull();
  });

  it('keeps required plan and server account evidence for the account-aware page resolver', () => {
    const error = new MediaGenerationApiError('Max 15x is required.', {
      status: 403,
      code: 'plan_upgrade_required',
      currentPlan: 'pro',
      requiredPlans: ['max_15x', 'enterprise'],
    });

    expect(error.currentPlan).toBe('pro');
    expect(error.requiredPlans).toEqual(['max_15x', 'enterprise']);
  });
});

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
      json: async () => ({
        images: [{ url: 'https://cdn.example/generated.png' }],
        provider: GOOGLE_IMAGE_MODEL.provider,
        catalog_model: GOOGLE_IMAGE_MODEL.id,
      }),
    } as Response);
    const { result } = renderHook(() => useMediaGeneration());

    await act(async () => {
      await expect(result.current.generateImage('draw a lighthouse')).resolves.toEqual({
        imageUrl: 'https://cdn.example/generated.png',
        provider: GOOGLE_IMAGE_MODEL.provider,
        model: GOOGLE_IMAGE_MODEL.id,
      });
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

  it('serializes an exact image aspect_ratio without collapsing it to legacy size', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        images: [{ url: 'https://cdn.example/portrait.png' }],
        provider: GOOGLE_IMAGE_MODEL.provider,
        catalog_model: GOOGLE_IMAGE_MODEL.id,
      }),
    } as Response);
    const { result } = renderHook(() => useMediaGeneration());

    await act(async () => {
      await expect(
        result.current.generateImage('draw a portrait', {
          aspectRatio: '3:4',
          provider: 'google',
          model: GOOGLE_IMAGE_MODEL.id,
          conversationId: '0190a000-0000-7000-8000-000000000091',
        }),
      ).resolves.toEqual({
        imageUrl: 'https://cdn.example/portrait.png',
        provider: GOOGLE_IMAGE_MODEL.provider,
        model: GOOGLE_IMAGE_MODEL.id,
      });
    });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({
      prompt: 'draw a portrait',
      conversation_id: '0190a000-0000-7000-8000-000000000091',
      aspect_ratio: '3:4',
      provider: 'google',
      model: GOOGLE_IMAGE_MODEL.id,
    });
    expect(mediaStoreMocks.addJob).toHaveBeenCalledWith(expect.objectContaining({ size: '3:4' }));
  });

  it('rejects an asset whose response omits canonical model provenance', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ images: [{ url: 'https://cdn.example/unattributed.png' }] }),
    } as Response);
    const { result } = renderHook(() => useMediaGeneration());

    await act(async () => {
      await expect(result.current.generateImage('draw a fixture')).rejects.toThrow(
        /canonical model provenance/i,
      );
    });

    expect(mediaStoreMocks.updateJob).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('preserves a bounded structured Retry-After for an explicit image retry', async () => {
    const now = Date.parse('2026-08-10T12:00:00.000Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: 'The image generation service is temporarily busy.',
        retry_after_seconds: 7,
      }),
    } as Response);
    const { result } = renderHook(() => useMediaGeneration());

    await act(async () => {
      await expect(result.current.generateImage('draw a retry fixture')).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof MediaGenerationApiError &&
          error.status === 429 &&
          error.resetAt === new Date(now + 7_000).toISOString(),
      );
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects an unbounded structured Retry-After instead of disabling retry indefinitely', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: 'The image generation service is temporarily busy.',
        retry_after_seconds: 301,
      }),
    } as Response);
    const { result } = renderHook(() => useMediaGeneration());

    await act(async () => {
      await expect(result.current.generateImage('draw a bounded retry fixture')).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof MediaGenerationApiError &&
          error.status === 429 &&
          error.resetAt === undefined,
      );
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  describe('generateImage deadline', () => {
    it('aborts and reports an image-specific notice once the shared deadline elapses', async () => {
      vi.useFakeTimers();
      try {
        vi.spyOn(globalThis, 'fetch').mockImplementation(
          (_input, init) =>
            new Promise((_resolve, reject) => {
              const signal = init?.signal;
              signal?.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              });
            }),
        );
        const { result } = renderHook(() => useMediaGeneration());
        const pending = result.current.generateImage('a slow lighthouse');
        const settled = pending.catch((error: unknown) => error);

        await vi.advanceTimersByTimeAsync(IMAGE_GENERATION_FUNCTION_LIMIT_MS);

        const error = await settled;
        expect(error).toBeInstanceOf(MediaGenerationApiError);
        const timeoutError = error as MediaGenerationApiError;
        expect(timeoutError.message).toBe(
          'The image did not finish in time. Try again or pick another image model.',
        );
        expect(timeoutError.code).toBe('image_generation_timeout');
        expect(mediaStoreMocks.updateJob).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({
            status: 'failed',
            errorMessage:
              'The image did not finish in time. Try again or pick another image model.',
          }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not abort a response that finishes before the deadline', async () => {
      vi.useFakeTimers();
      try {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          json: async () => ({
            images: [{ url: 'https://cdn.example/fast.png' }],
            provider: GOOGLE_IMAGE_MODEL.provider,
            catalog_model: GOOGLE_IMAGE_MODEL.id,
          }),
        } as Response);
        const { result } = renderHook(() => useMediaGeneration());

        const value = await result.current.generateImage('a fast lighthouse');

        expect(value.imageUrl).toBe('https://cdn.example/fast.png');
        expect(mediaStoreMocks.updateJob).not.toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ status: 'failed' }),
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('generateVideo', () => {
    it('serializes the complete catalog-backed output tuple', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          task_id: VIDEO_TASK_ID,
          status: 'queued',
          provider: VIDEO_PROVIDER,
          model: VIDEO_MODEL.id,
          estimated_duration_secs: 210,
        }),
      } as Response);
      const { result } = renderHook(() => useMediaGeneration());

      await act(async () => {
        await result.current.startVideoGeneration('a portrait launch film', {
          modelId: VIDEO_MODEL.id,
          aspectRatio: '21:9',
          resolution: '480p',
          durationSecs: 8,
        });
      });

      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
        prompt: 'a portrait launch film',
        model: VIDEO_MODEL.id,
        aspect_ratio: '21:9',
        resolution: '480p',
        duration_secs: 8,
      });
    });

    it('starts a task, polls status, and resolves with the finished URLs', async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              success: true,
              task_id: VIDEO_TASK_ID,
              status: 'queued',
              provider: VIDEO_PROVIDER,
              model: VIDEO_MODEL.id,
              estimated_duration_secs: 90,
            }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, task_id: VIDEO_TASK_ID, status: 'processing' }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              success: true,
              task_id: VIDEO_TASK_ID,
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
          status: 'completed',
          taskId: VIDEO_TASK_ID,
          videoUrl: 'https://cdn.example/clip.mp4',
          thumbnailUrl: 'https://cdn.example/clip.jpg',
        });

        expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/media/video/generate');
        expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
          `/api/media/video/status?task_id=${VIDEO_TASK_ID}`,
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

    it('resumes a reloaded placeholder with status GETs and never repeats the provider-start POST', async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = vi
          .spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              success: true,
              task_id: VIDEO_TASK_ID,
              status: 'queued',
              provider: VIDEO_PROVIDER,
              model: VIDEO_MODEL.id,
              estimated_duration_secs: 90,
            }),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              success: true,
              task_id: VIDEO_TASK_ID,
              status: 'completed',
              video_url: '/api/files/22222222-2222-4222-8222-222222222222',
            }),
          } as Response);
        const first = renderHook(() => useMediaGeneration());
        const started = await first.result.current.startVideoGeneration('fixture prompt', {
          conversationId: '33333333-3333-4333-8333-333333333333',
          assistantMessageId: '44444444-4444-4444-8444-444444444444',
        });
        first.unmount();

        const reloaded = renderHook(() => useMediaGeneration());
        const resumed = reloaded.result.current.watchVideoGeneration(started.taskId);
        await vi.advanceTimersByTimeAsync(5_000);
        await expect(resumed).resolves.toMatchObject({
          status: 'completed',
          taskId: VIDEO_TASK_ID,
        });

        expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
        expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'GET')).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns a resumable active state at the client deadline instead of a terminal failure', async () => {
      vi.useFakeTimers();
      try {
        vi.spyOn(globalThis, 'fetch')
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              success: true,
              task_id: VIDEO_TASK_ID,
              status: 'queued',
              provider: VIDEO_PROVIDER,
              model: VIDEO_MODEL.id,
              estimated_duration_secs: 90,
            }),
          } as Response)
          .mockResolvedValue({
            ok: true,
            json: async () => ({
              success: true,
              task_id: VIDEO_TASK_ID,
              status: 'processing',
              progress: 42,
            }),
          } as Response);
        const { result } = renderHook(() => useMediaGeneration());
        const started = await result.current.startVideoGeneration('fixture prompt');
        const watched = result.current.watchVideoGeneration(started.taskId, { timeoutMs: 1 });
        await vi.advanceTimersByTimeAsync(5_000);

        await expect(watched).resolves.toEqual({
          status: 'pending',
          taskId: VIDEO_TASK_ID,
          taskStatus: 'processing',
          progress: 42,
        });
        expect(mediaStoreMocks.updateJob).not.toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ status: 'failed' }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('classifies the route 403 as a paywall so the caller can render the upgrade card', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: 'Video generation is available on Max 15x and Enterprise plans.',
            type: 'invalid_request_error',
            code: 'plan_upgrade_required',
            current_plan: 'pro',
            required_plans: ['max_15x', 'enterprise'],
          },
        }),
      } as Response);

      const { result } = renderHook(() => useMediaGeneration());

      await act(async () => {
        await expect(result.current.generateVideo('a cat surfing')).rejects.toSatisfy(
          (err: unknown) =>
            err instanceof MediaGenerationApiError &&
            err.isPaywall &&
            err.recoveryAction === 'upgrade' &&
            err.code === 'plan_upgrade_required' &&
            err.currentPlan === 'pro' &&
            err.requiredPlans?.[0] === 'max_15x' &&
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
