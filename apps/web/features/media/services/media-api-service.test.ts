import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseManagedMediaIdempotencyKey } from '@agiworkforce/utils';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { generateImages, generateVideo, getVideoStatus, MediaApiError } from './media-api-service';

function authority() {
  return createRequestAuthority({
    userId: 'media-user',
    sessionId: 'media-session',
    isCurrent: () => true,
    getToken: async () => 'web-auth-token',
  });
}

describe('media API service idempotency', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates one Web image operation identity for each image action', async () => {
    const operationId = '0190a000-0000-7000-8000-000000000011';
    const randomUuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(operationId);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        images: [{ url: 'https://cdn.example/image.png' }],
        provider: 'google',
        model: 'image-model',
        latency_ms: 10,
      }),
    } as Response);

    await generateImages({ prompt: 'draw an observatory' }, authority());

    expect(randomUuid).toHaveBeenCalledOnce();
    const key = new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Idempotency-Key');
    if (!key) throw new Error('Image request did not include an Idempotency-Key');
    expect(parseManagedMediaIdempotencyKey(key)).toEqual({
      surface: 'web',
      operation: 'image',
      operationId,
    });
  });

  it('creates one Web video operation identity for each video action', async () => {
    const operationId = '0190a000-0000-7000-8000-000000000012';
    const randomUuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(operationId);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        task_id: 'video-task',
        status: 'queued',
        provider: 'google',
        estimated_duration_secs: 60,
      }),
    } as Response);

    await generateVideo({ prompt: 'animate an observatory' }, authority());

    expect(randomUuid).toHaveBeenCalledOnce();
    const key = new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Idempotency-Key');
    if (!key) throw new Error('Video request did not include an Idempotency-Key');
    expect(parseManagedMediaIdempotencyKey(key)).toEqual({
      surface: 'web',
      operation: 'video',
      operationId,
    });
  });

  it('preserves billing tier evidence from a video refusal', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          message: 'Video generation requires Max 20x.',
          code: 'plan_upgrade_required',
          type: 'invalid_request_error',
          current_plan: 'pro',
          required_plans: ['max_15x', 'enterprise', 42],
        },
      }),
    } as Response);

    await expect(
      generateVideo({ prompt: 'animate an observatory' }, authority()),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof MediaApiError &&
        error.currentPlan === 'pro' &&
        error.requiredPlans?.join(',') === 'max_15x,enterprise',
    );
  });
});

describe('media API captured session', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  it.each(['image', 'video', 'status'] as const)(
    'refuses %s after a token wait retires its owner',
    async (kind) => {
      let current = true;
      let resolveToken!: (token: string) => void;
      const token = new Promise<string>((resolve) => {
        resolveToken = resolve;
      });
      const owner = createRequestAuthority({
        userId: 'original-user',
        sessionId: 'original-session',
        isCurrent: () => current,
        getToken: () => token,
      });
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('unexpected dispatch'));
      const operation =
        kind === 'image'
          ? generateImages({ prompt: 'private original prompt' }, owner)
          : kind === 'video'
            ? generateVideo({ prompt: 'private original prompt' }, owner)
            : getVideoStatus('original-task', owner);
      const settled = operation.catch((error: unknown) => error);
      current = false;
      resolveToken('original-token');
      expect(await settled).toMatchObject({ name: 'AbortError' });
      expect(fetchMock).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    },
  );

  it('suppresses decoded status from a retired session and omits ambient cookies', async () => {
    let current = true;
    let resolveBody!: (body: unknown) => void;
    const body = new Promise<unknown>((resolve) => {
      resolveBody = resolve;
    });
    let enteredBody!: () => void;
    const reading = new Promise<void>((resolve) => {
      enteredBody = resolve;
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => {
        enteredBody();
        return body;
      },
    } as Response);
    const owner = createRequestAuthority({
      userId: 'original-user',
      sessionId: 'original-session',
      isCurrent: () => current,
      getToken: async () => 'original-token',
    });
    const settled = getVideoStatus('original-task', owner).catch((error: unknown) => error);
    await reading;
    current = false;
    resolveBody({
      success: true,
      task_id: 'original-task',
      status: 'completed',
      video_url: '/old',
    });
    expect(await settled).toMatchObject({ name: 'AbortError' });
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe('omit');
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer original-token',
    );
    vi.restoreAllMocks();
  });
});
