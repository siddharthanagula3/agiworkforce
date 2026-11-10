import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mediaStoreMocks = vi.hoisted(() => ({
  addJob: vi.fn(),
  updateJob: vi.fn(),
  retireStaleJobs: vi.fn(),
}));

vi.mock('@shared/stores/media-store', () => ({
  useMediaStore: () => mediaStoreMocks,
}));

vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn(async () => 'web-auth-token'),
}));

const identity = vi.hoisted(() => ({ sessionId: 'media-session', userId: 'media-user' }));

vi.mock('@clerk/nextjs', async () => {
  const { createClerkSessionFixture } =
    await import('@/lib/identity/__tests__/clerk-session-fixture');
  const { getAuthToken } = await import('@shared/lib/get-auth-token');
  return createClerkSessionFixture(() => ({
    getToken: getAuthToken,
    isLoaded: true,
    isSignedIn: true,
    userId: identity.userId,
    sessionId: identity.sessionId,
  }));
});

import { parseManagedMediaIdempotencyKey } from '@agiworkforce/utils';
import { isExecutableVideoModel, modelsCatalog } from '@agiworkforce/types';
import type { VideoInputImages } from '@features/media/services/media-api-service';
import { IMAGE_MODELS } from '@features/chat/lib/imageGenerationOptions';
import { IMAGE_GENERATION_FUNCTION_LIMIT_MS } from '@/lib/deadline-policy';
import { getAuthToken } from '@shared/lib/get-auth-token';
import {
  cancelImageGenerations,
  IMAGE_GENERATION_CANCELLED_CODE,
  IMAGE_JOB_IN_PROGRESS_CODE,
  useMediaGeneration,
  MediaGenerationApiError,
} from './useMediaGeneration';

const GOOGLE_IMAGE_MODEL = IMAGE_MODELS.find((model) => model.provider === 'google');
if (!GOOGLE_IMAGE_MODEL) throw new Error('Catalog has no Google image model fixture');
const VIDEO_MODEL = Object.values(modelsCatalog.models).find(isExecutableVideoModel);
if (!VIDEO_MODEL) throw new Error('Catalog has no executable video model fixture');
const VIDEO_PROVIDER = VIDEO_MODEL.provider === 'open_router' ? 'openrouter' : VIDEO_MODEL.provider;
if (VIDEO_PROVIDER !== 'google' && VIDEO_PROVIDER !== 'runway' && VIDEO_PROVIDER !== 'openrouter') {
  throw new Error('Catalog video model has no supported Web provider mapping');
}
const VIDEO_TASK_ID = '11111111-1111-4111-8111-111111111111';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

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
    const error = new MediaGenerationApiError('Max 20x is required.', {
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
    identity.userId = 'media-user';
    identity.sessionId = 'media-session';
  });

  it.each(['account', 'session'] as const)(
    'does not dispatch an image after a replacement %s during authentication',
    async (kind) => {
      const token = deferred<string | null>();
      const entered = deferred<void>();
      vi.mocked(getAuthToken).mockImplementationOnce(() => {
        entered.resolve();
        return token.promise;
      });
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('unexpected dispatch'));
      const view = renderHook(() => useMediaGeneration());
      const settled = view.result.current
        .generateImage('original private image')
        .catch((error: unknown) => error);
      await entered.promise;
      if (kind === 'account') identity.userId = 'replacement-user';
      identity.sessionId = 'replacement-session';
      view.rerender();
      token.resolve('original-token');
      expect(await settled).toMatchObject({ name: 'AbortError' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mediaStoreMocks.updateJob).not.toHaveBeenCalled();
    },
  );

  it('does not publish an image whose body arrives after the session changes', async () => {
    const body = deferred<unknown>();
    const entered = deferred<void>();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => {
        entered.resolve();
        return body.promise;
      },
    } as Response);
    const view = renderHook(() => useMediaGeneration());
    const settled = view.result.current
      .generateImage('original image')
      .catch((error: unknown) => error);
    await entered.promise;
    identity.sessionId = 'replacement-session';
    view.rerender();
    body.resolve({
      images: [{ url: '/original-image' }],
      provider: GOOGLE_IMAGE_MODEL.provider,
      catalog_model: GOOGLE_IMAGE_MODEL.id,
    });
    expect(await settled).toMatchObject({ name: 'AbortError' });
    expect(mediaStoreMocks.updateJob).not.toHaveBeenCalled();
  });

  it('does not poll an old task after its observation sleep crosses sessions', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('unexpected poll'));
      const view = renderHook(() => useMediaGeneration());
      const progress = vi.fn();
      const settled = view.result.current
        .watchVideoGeneration(VIDEO_TASK_ID, { onProgress: progress })
        .catch((error: unknown) => error);
      identity.sessionId = 'replacement-session';
      view.rerender();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await settled).toMatchObject({ name: 'AbortError' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(progress).not.toHaveBeenCalled();
      expect(mediaStoreMocks.updateJob).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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
      expect.objectContaining({ isCurrent: expect.any(Function) }),
    );
    const request = fetchMock.mock.calls[0]?.[1];
    const key = new Headers(request?.headers).get('Idempotency-Key');
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
    expect(mediaStoreMocks.addJob).toHaveBeenCalledWith(
      expect.objectContaining({ size: '3:4' }),
      expect.objectContaining({ isCurrent: expect.any(Function) }),
    );
  });

  it('serializes a mask edit of an image the caller already holds', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        images: [{ url: 'https://cdn.example/edited.png' }],
        provider: GOOGLE_IMAGE_MODEL.provider,
        catalog_model: GOOGLE_IMAGE_MODEL.id,
      }),
    } as Response);
    const { result } = renderHook(() => useMediaGeneration());

    await act(async () => {
      await expect(
        result.current.generateImage('repaint the sky', {
          provider: 'google',
          model: GOOGLE_IMAGE_MODEL.id,
          operation: 'inpaint',
          sourceImageBase64: 'c291cmNl',
          maskImageBase64: 'bWFzaw==',
        }),
      ).resolves.toMatchObject({ imageUrl: 'https://cdn.example/edited.png' });
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      prompt: 'repaint the sky',
      provider: 'google',
      model: GOOGLE_IMAGE_MODEL.id,
      operation: 'inpaint',
      source_image: { b64_json: 'c291cmNl' },
      mask_image: { b64_json: 'bWFzaw==' },
    });
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

  describe('generateImage durable job identity', () => {
    const JOB_ID = '22222222-2222-4222-8222-222222222222';
    const IMAGE_URL = 'https://cdn.example/resumed.png';

    function jsonResponse(status: number, body: unknown): Response {
      return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
    }

    function snapshot(overrides: Record<string, unknown>) {
      return {
        job_id: JOB_ID,
        provider: GOOGLE_IMAGE_MODEL.provider,
        model: GOOGLE_IMAGE_MODEL.id,
        images: [],
        ...overrides,
      };
    }

    function routeFetch(handlers: Record<string, () => Response>) {
      return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        const path = Object.keys(handlers).find((candidate) => url.includes(candidate));
        if (!path) throw new Error(`unexpected request ${url}`);
        return handlers[path]!();
      });
    }

    function requestedPaths(fetchMock: ReturnType<typeof routeFetch>): string[] {
      return fetchMock.mock.calls.map(
        ([input]) => new URL(String(input), 'http://app.test').pathname,
      );
    }

    it('keeps the server job id of a retryable failure on the error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(422, {
          success: false,
          error: 'The provider was busy.',
          job_id: JOB_ID,
          retryable: true,
        }),
      );
      const { result } = renderHook(() => useMediaGeneration());

      await act(async () => {
        await expect(result.current.generateImage('draw a retryable fixture')).rejects.toSatisfy(
          (error: unknown) => error instanceof MediaGenerationApiError && error.jobId === JOB_ID,
        );
      });
    });

    it('does not keep a job id the server says cannot be retried', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(422, {
          success: false,
          error: 'The prompt was refused.',
          job_id: JOB_ID,
          retryable: false,
        }),
      );
      const { result } = renderHook(() => useMediaGeneration());

      await act(async () => {
        await expect(result.current.generateImage('draw a refused fixture')).rejects.toSatisfy(
          (error: unknown) => error instanceof MediaGenerationApiError && error.jobId === undefined,
        );
      });
    });

    it('retries the existing job on its own reservation instead of submitting a new generation', async () => {
      const fetchMock = routeFetch({
        '/api/media/image/status': () =>
          jsonResponse(200, snapshot({ status: 'failed', retryable: true })),
        '/api/media/image/retry': () =>
          jsonResponse(200, snapshot({ status: 'completed', images: [{ url: IMAGE_URL }] })),
      });
      const { result } = renderHook(() => useMediaGeneration());

      await act(async () => {
        await expect(
          result.current.generateImage('draw a retryable fixture', { resumeJobId: JOB_ID }),
        ).resolves.toEqual({
          imageUrl: IMAGE_URL,
          provider: GOOGLE_IMAGE_MODEL.provider,
          model: GOOGLE_IMAGE_MODEL.id,
        });
      });

      expect(requestedPaths(fetchMock)).toEqual([
        '/api/media/image/status',
        '/api/media/image/retry',
      ]);
      const retry = fetchMock.mock.calls[1]?.[1];
      expect(JSON.parse(String(retry?.body))).toEqual({ job_id: JOB_ID });
    });

    it('adopts the image the original job already delivered without charging again', async () => {
      const fetchMock = routeFetch({
        '/api/media/image/status': () =>
          jsonResponse(200, snapshot({ status: 'completed', images: [{ url: IMAGE_URL }] })),
      });
      const { result } = renderHook(() => useMediaGeneration());

      await act(async () => {
        await expect(
          result.current.generateImage('draw a delivered fixture', { resumeJobId: JOB_ID }),
        ).resolves.toMatchObject({ imageUrl: IMAGE_URL });
      });

      expect(requestedPaths(fetchMock)).toEqual(['/api/media/image/status']);
    });

    it('waits for a job that is still running rather than starting a second one', async () => {
      const fetchMock = routeFetch({
        '/api/media/image/status': () => jsonResponse(200, snapshot({ status: 'processing' })),
      });
      const { result } = renderHook(() => useMediaGeneration());

      await act(async () => {
        await expect(
          result.current.generateImage('draw a running fixture', { resumeJobId: JOB_ID }),
        ).rejects.toSatisfy(
          (error: unknown) =>
            error instanceof MediaGenerationApiError &&
            error.code === IMAGE_JOB_IN_PROGRESS_CODE &&
            error.jobId === JOB_ID,
        );
      });

      expect(requestedPaths(fetchMock)).toEqual(['/api/media/image/status']);
    });

    it('treats a retry that finds the job already running as still in progress', async () => {
      routeFetch({
        '/api/media/image/status': () =>
          jsonResponse(200, snapshot({ status: 'failed', retryable: true })),
        '/api/media/image/retry': () =>
          jsonResponse(409, { error: { message: 'This image job is already running.' } }),
      });
      const { result } = renderHook(() => useMediaGeneration());

      await act(async () => {
        await expect(
          result.current.generateImage('draw a raced fixture', { resumeJobId: JOB_ID }),
        ).rejects.toSatisfy(
          (error: unknown) =>
            error instanceof MediaGenerationApiError && error.code === IMAGE_JOB_IN_PROGRESS_CODE,
        );
      });
    });

    it('starts a new generation once the original job is settled and cannot be retried', async () => {
      const fetchMock = routeFetch({
        '/api/media/image/status': () =>
          jsonResponse(200, snapshot({ status: 'failed', retryable: false })),
        '/api/media/image/generate': () =>
          jsonResponse(200, {
            images: [{ url: IMAGE_URL }],
            provider: GOOGLE_IMAGE_MODEL.provider,
            catalog_model: GOOGLE_IMAGE_MODEL.id,
          }),
      });
      const { result } = renderHook(() => useMediaGeneration());

      await act(async () => {
        await expect(
          result.current.generateImage('draw a settled fixture', { resumeJobId: JOB_ID }),
        ).resolves.toMatchObject({ imageUrl: IMAGE_URL });
      });

      expect(requestedPaths(fetchMock)).toEqual([
        '/api/media/image/status',
        '/api/media/image/generate',
      ]);
    });
  });

  describe('generateImage cancellation admission', () => {
    it.each(['resolve', 'reject'] as const)(
      'Stop during authentication prevents generation when authentication later %s',
      async (outcome) => {
        const auth = deferred<string | null>();
        const enteredAuth = deferred<void>();
        vi.mocked(getAuthToken).mockImplementationOnce(() => {
          enteredAuth.resolve();
          return auth.promise;
        });
        const fetchMock = vi
          .spyOn(globalThis, 'fetch')
          .mockRejectedValue(new Error('Unexpected media dispatch'));
        const { result } = renderHook(() => useMediaGeneration());
        const pending = result.current.generateImage('cancel before dispatch', {
          cancelScope: 'fixture-auth-scope',
        });
        const settled = pending.catch((error: unknown) => error);
        await enteredAuth.promise;

        expect(cancelImageGenerations('another-scope')).toBe(false);
        expect(cancelImageGenerations('fixture-auth-scope')).toBe(true);
        expect(cancelImageGenerations('fixture-auth-scope')).toBe(false);
        if (outcome === 'resolve') auth.resolve('late-auth-token');
        else auth.reject(new Error('late auth failure'));

        expect(await settled).toMatchObject({ code: IMAGE_GENERATION_CANCELLED_CODE });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mediaStoreMocks.updateJob).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({ status: 'failed', errorMessage: 'You stopped this image.' }),
        );
        expect(cancelImageGenerations('fixture-auth-scope')).toBe(false);
      },
    );

    it('keeps a successful paid image body delivered after Stop in the same session', async () => {
      const body = deferred<unknown>();
      const reading = deferred<void>();
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        if (input === '/api/media/image/cancel')
          return Promise.resolve({ status: 200 } as Response);
        return Promise.resolve({
          ok: true,
          json: () => {
            reading.resolve();
            return body.promise;
          },
        } as Response);
      });
      const view = renderHook(() => useMediaGeneration());
      const pending = view.result.current.generateImage('accepted image', {
        cancelScope: 'paid-delivery',
      });
      await reading.promise;
      expect(cancelImageGenerations('paid-delivery')).toBe(true);
      body.resolve({
        images: [{ url: '/paid-image' }],
        provider: GOOGLE_IMAGE_MODEL.provider,
        catalog_model: GOOGLE_IMAGE_MODEL.id,
      });
      await expect(pending).resolves.toMatchObject({ imageUrl: '/paid-image' });
      expect(mediaStoreMocks.updateJob).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'completed' }),
      );
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });

    it('does not retry durable cancellation under a replacement session', async () => {
      vi.useFakeTimers();
      try {
        const dispatched = deferred<void>();
        const cancelled = deferred<void>();
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
          if (input === '/api/media/image/cancel') {
            cancelled.resolve();
            return Promise.resolve({ status: 404 } as Response);
          }
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Stopped', 'AbortError')),
            );
            dispatched.resolve();
          });
        });
        const view = renderHook(() => useMediaGeneration());
        const settled = view.result.current
          .generateImage('old image', { cancelScope: 'cancel-retry' })
          .catch((error: unknown) => error);
        await dispatched.promise;
        expect(cancelImageGenerations('cancel-retry')).toBe(true);
        await cancelled.promise;
        expect(await settled).toMatchObject({ code: IMAGE_GENERATION_CANCELLED_CODE });
        identity.sessionId = 'replacement-session';
        view.rerender();
        await vi.advanceTimersByTimeAsync(1_000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('cleans up ordinary authentication failures without issuing a media request', async () => {
      const failure = new Error('auth unavailable');
      vi.mocked(getAuthToken).mockRejectedValueOnce(failure);
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Unexpected media dispatch'));
      const { result } = renderHook(() => useMediaGeneration());

      await expect(
        result.current.generateImage('auth failure', { cancelScope: 'fixture-auth-failure' }),
      ).rejects.toBe(failure);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(cancelImageGenerations('fixture-auth-failure')).toBe(false);
      expect(mediaStoreMocks.updateJob).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'failed', errorMessage: 'auth unavailable' }),
      );
    });

    it('still requests durable cancellation after generation dispatch', async () => {
      const dispatched = deferred<void>();
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        if (input === '/api/media/image/cancel') {
          return Promise.resolve({ status: 200 } as Response);
        }
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
          dispatched.resolve();
        });
      });
      const { result } = renderHook(() => useMediaGeneration());
      const pending = result.current.generateImage('cancel after dispatch', {
        cancelScope: 'fixture-dispatched-scope',
      });
      const settled = pending.catch((error: unknown) => error);
      await dispatched.promise;

      expect(cancelImageGenerations('fixture-dispatched-scope')).toBe(true);
      expect(await settled).toMatchObject({ code: IMAGE_GENERATION_CANCELLED_CODE });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

      const request = fetchMock.mock.calls[0]?.[1];
      const key = new Headers(request?.headers).get('Idempotency-Key');
      expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/media/image/cancel');
      expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
        idempotency_key: key,
      });
      expect(request?.signal?.aborted).toBe(true);
    });
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

    it.each([
      [
        'a first frame',
        { kind: 'first_frame', imageBase64: 'Zmlyc3Q=' } satisfies VideoInputImages,
        { first_frame_image: { b64_json: 'Zmlyc3Q=' } },
      ],
      [
        'reference images',
        { kind: 'reference', imagesBase64: ['b25l', 'dHdv'] } satisfies VideoInputImages,
        { reference_images: [{ b64_json: 'b25l' }, { b64_json: 'dHdv' }] },
      ],
    ])('serializes %s into the video request', async (_label, inputImages, expected) => {
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
        await result.current.startVideoGeneration('animate the photo', {
          modelId: VIDEO_MODEL.id,
          inputImages,
        });
      });

      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
        string,
        unknown
      >;
      expect(body).toMatchObject(expected);
      expect(
        Object.keys(body).filter((key) => key.endsWith('image') || key.endsWith('images')),
      ).toEqual(Object.keys(expected));
    });

    it('sends no image fields when the video has no input images', async () => {
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
        await result.current.startVideoGeneration('a cat surfing', { modelId: VIDEO_MODEL.id });
      });

      const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
        string,
        unknown
      >;
      expect(body).not.toHaveProperty('first_frame_image');
      expect(body).not.toHaveProperty('reference_images');
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
          expect.objectContaining({ isCurrent: expect.any(Function) }),
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

    it('reports provider progress on every poll, not only at the client deadline', async () => {
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
        const onProgress = vi.fn();
        const { result } = renderHook(() => useMediaGeneration());
        const started = await result.current.startVideoGeneration('fixture prompt');
        const watched = result.current.watchVideoGeneration(started.taskId, {
          timeoutMs: 30_000,
          onProgress,
        });
        await vi.advanceTimersByTimeAsync(11_000);

        expect(onProgress).toHaveBeenCalledWith({ taskStatus: 'processing', progress: 42 });
        expect(onProgress.mock.calls.length).toBeGreaterThan(1);

        await vi.advanceTimersByTimeAsync(30_000);
        await watched;
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
            message: 'Video generation is available on Max 20x and Enterprise plans.',
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
            err.message.includes('Max 20x'),
        );
      });

      expect(mediaStoreMocks.updateJob).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'failed' }),
      );
    });
  });
});
