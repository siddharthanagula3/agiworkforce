import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn(async () => 'web-auth-token'),
}));

import { parseManagedMediaIdempotencyKey } from '@agiworkforce/utils';
import { generateImages, generateVideo, MediaApiError } from './media-api-service';

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

    await generateImages({ prompt: 'draw an observatory' });

    expect(randomUuid).toHaveBeenCalledOnce();
    const key = (fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)[
      'Idempotency-Key'
    ];
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

    await generateVideo({ prompt: 'animate an observatory' });

    expect(randomUuid).toHaveBeenCalledOnce();
    const key = (fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)[
      'Idempotency-Key'
    ];
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
          message: 'Video generation requires Max 15x.',
          code: 'plan_upgrade_required',
          type: 'invalid_request_error',
          current_plan: 'pro',
          required_plans: ['max_15x', 'enterprise', 42],
        },
      }),
    } as Response);

    await expect(generateVideo({ prompt: 'animate an observatory' })).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof MediaApiError &&
        error.currentPlan === 'pro' &&
        error.requiredPlans?.join(',') === 'max_15x,enterprise',
    );
  });
});
