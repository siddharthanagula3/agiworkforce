import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isExecutableVideoModel, modelsCatalog } from '@agiworkforce/types';
import { IMAGE_MODELS } from '@features/chat/lib/imageGenerationOptions';
import { useMediaStore } from '@shared/stores/media-store';
import { useMediaGeneration } from './useMediaGeneration';
import { createRequestAuthority } from '@/lib/identity/request-authority';

const identity = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'media-user', sessionId: 'media-session' },
  sdk: {
    loaded: true,
    user: { id: 'media-user' },
    session: {
      id: 'media-session', user: { id: 'media-user' },
      getToken: vi.fn(async (): Promise<string | null> => 'media-token'),
    },
  },
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => identity.auth,
  useClerk: () => identity.sdk,
}));

const imageModel = IMAGE_MODELS.find((model) => model.provider === 'google');
if (!imageModel) throw new Error('Catalog has no Google image fixture');
const videoModel = Object.values(modelsCatalog.models).find(isExecutableVideoModel);
if (!videoModel) throw new Error('Catalog has no executable video fixture');
const taskId = '11111111-1111-4111-8111-111111111111';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function replaceSession() {
  identity.sdk.session = {
    id: identity.auth.sessionId, user: { id: identity.auth.userId },
    getToken: vi.fn(async (): Promise<string | null> => 'replacement-token'),
  };
}

function response(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function imageBody() {
  return {
    images: [{ url: '/image' }], provider: 'google', catalog_model: imageModel!.id,
  };
}

function videoBody() {
  return {
    success: true, task_id: taskId, status: 'queued',
    provider: videoModel!.provider === 'open_router' ? 'openrouter' : videoModel!.provider,
    model: videoModel!.id, estimated_duration_secs: 90,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  useMediaStore.getState().reset();
  replaceSession();
});

afterEach(() => {
  cleanup();
  useMediaStore.getState().reset();
  vi.useRealTimers();
});

describe('media session retirement with the actual store', () => {
  it('prunes before refusing an already-retired observation authority', async () => {
    let current = true;
    const session = {
      userId: 'original', sessionId: 'original', isCurrent: () => current,
      getToken: async () => 'original-token',
    };
    const authority = createRequestAuthority(session);
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected dispatch'));
    const view = renderHook(() => useMediaGeneration());
    act(() => useMediaStore.getState().addJob({
      id: 'old-job', type: 'video', prompt: 'original', status: 'generating',
      createdAt: '2026-11-04T00:00:00.000Z',
    }, session));
    current = false;
    expect(useMediaStore.getState().jobs).toHaveLength(1);
    await act(async () => {
      await expect(view.result.current.watchVideoGeneration(taskId, { authority }))
        .rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(useMediaStore.getState().jobs).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prunes on rendered same-ID session replacement before deferred token settlement', async () => {
    const token = deferred<string | null>();
    const entered = deferred<void>();
    identity.sdk.session.getToken.mockImplementationOnce(() => {
      entered.resolve();
      return token.promise;
    });
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected dispatch'));
    const view = renderHook(() => useMediaGeneration());
    let settled!: Promise<unknown>;
    await act(async () => {
      settled = view.result.current.generateImage('old image').catch((error: unknown) => error);
      await entered.promise;
    });
    expect(useMediaStore.getState().jobs).toHaveLength(1);
    replaceSession();
    view.rerender();
    expect(useMediaStore.getState().jobs).toEqual([]);
    await act(async () => { token.resolve('old-token'); await settled; });
    expect(await settled).toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prunes SDK-only replacement on image settlement and permits new work', async () => {
    const body = deferred<unknown>();
    const entered = deferred<void>();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true, json: () => { entered.resolve(); return body.promise; },
    } as Response).mockResolvedValue(response(imageBody()));
    const view = renderHook(() => useMediaGeneration());
    let settled!: Promise<unknown>;
    await act(async () => {
      settled = view.result.current.generateImage('old image').catch((error: unknown) => error);
      await entered.promise;
    });
    replaceSession();
    await act(async () => { body.resolve(imageBody()); await settled; });
    expect(await settled).toMatchObject({ name: 'AbortError' });
    expect(useMediaStore.getState().jobs).toEqual([]);
    await act(async () => { await view.result.current.generateImage('new image'); });
    expect(useMediaStore.getState().jobs).toMatchObject([
      { prompt: 'new image', status: 'completed', resultUrl: '/image' },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps replacement work admitted before the old body settles', async () => {
    const body = deferred<unknown>();
    const entered = deferred<void>();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true, json: () => { entered.resolve(); return body.promise; },
    } as Response).mockResolvedValue(response(imageBody()));
    const view = renderHook(() => useMediaGeneration());
    let settled!: Promise<unknown>;
    await act(async () => {
      settled = view.result.current.generateImage('old image').catch((error: unknown) => error);
      await entered.promise;
    });
    replaceSession();
    view.rerender();
    await act(async () => { await view.result.current.generateImage('new image'); });
    const replacement = useMediaStore.getState().jobs[0];
    await act(async () => { body.resolve(imageBody()); await settled; });
    expect(await settled).toMatchObject({ name: 'AbortError' });
    expect(useMediaStore.getState().jobs).toEqual([replacement]);
  });

  it('preserves a current image across unmount and remount', async () => {
    const body = deferred<unknown>();
    const entered = deferred<void>();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: () => { entered.resolve(); return body.promise; },
    } as Response);
    const view = renderHook(() => useMediaGeneration());
    let pending!: ReturnType<typeof view.result.current.generateImage>;
    await act(async () => {
      pending = view.result.current.generateImage('kept image');
      await entered.promise;
    });
    const state = useMediaStore.getState();
    view.unmount();
    renderHook(() => useMediaGeneration());
    expect(useMediaStore.getState()).toBe(state);
    await act(async () => { body.resolve(imageBody()); await pending; });
    expect(useMediaStore.getState().jobs).toMatchObject([
      { prompt: 'kept image', status: 'completed' },
    ]);
  });

  it('retires a video whose start response body arrives under a replacement session', async () => {
    const body = deferred<unknown>();
    const entered = deferred<void>();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: () => { entered.resolve(); return body.promise; },
    } as Response);
    const view = renderHook(() => useMediaGeneration());
    let settled!: Promise<unknown>;
    await act(async () => {
      settled = view.result.current.startVideoGeneration('old video').catch((error: unknown) => error);
      await entered.promise;
    });
    replaceSession();
    await act(async () => { body.resolve(videoBody()); await settled; });
    expect(await settled).toMatchObject({ name: 'AbortError' });
    expect(useMediaStore.getState().jobs).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['sleep', 'body'] as const)('retires video observation across replacement during %s', async (phase) => {
    vi.useFakeTimers();
    const body = deferred<unknown>();
    const entered = deferred<void>();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(videoBody()))
      .mockResolvedValueOnce({
        ok: true, json: () => { entered.resolve(); return body.promise; },
      } as Response);
    const view = renderHook(() => useMediaGeneration());
    await act(async () => {
      const started = await view.result.current.startVideoGeneration('old video');
      const progress = vi.fn();
      const settled = view.result.current.watchVideoGeneration(taskId, {
        localJobId: started.localJobId, onProgress: progress,
      }).catch((error: unknown) => error);
      if (phase === 'body') {
        await vi.advanceTimersByTimeAsync(5_000);
        await entered.promise;
      }
      replaceSession();
      if (phase === 'sleep') await vi.advanceTimersByTimeAsync(5_000);
      else body.resolve({ success: true, task_id: taskId, status: 'completed', video_url: '/old-video' });
      expect(await settled).toMatchObject({ name: 'AbortError' });
      expect(progress).not.toHaveBeenCalled();
    });
    expect(useMediaStore.getState().jobs).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(phase === 'sleep' ? 1 : 2);
  });

  it.each(['deadline', 'network'] as const)('preserves current video after %s observation ends', async (reason) => {
    vi.useFakeTimers();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(videoBody()));
    if (reason === 'network') fetch.mockRejectedValueOnce(new Error('offline'));
    else fetch.mockResolvedValueOnce(response({ success: true, task_id: taskId, status: 'processing' }));
    const view = renderHook(() => useMediaGeneration());
    await act(async () => {
      const started = await view.result.current.startVideoGeneration('current video');
      const settled = view.result.current.watchVideoGeneration(taskId, {
        localJobId: started.localJobId, timeoutMs: 1,
      }).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(5_000);
      if (reason === 'deadline') expect(await settled).toMatchObject({ status: 'pending' });
      else expect(await settled).toMatchObject({ message: 'offline' });
    });
    expect(useMediaStore.getState().jobs).toMatchObject([
      { prompt: 'current video', status: 'generating' },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
