import { isManagedMediaIdempotencyKey, parseManagedMediaIdempotencyKey } from '@agiworkforce/utils';

const mockPost = jest.fn();
const mockGet = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
  ApiPaywallError: class extends Error {},
}));
jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { imageGen: true } }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => '12345678-abcd-4abc-8abc-1234567890ab',
}));

import { generateImage } from '../src/features/image/services/imagegen';
import { ApiHttpError } from '../services/apiErrors';

function sentHeaders(): Record<string, string> {
  const options = mockPost.mock.calls[0]?.[2] as { headers?: Record<string, string> } | undefined;
  return options?.headers ?? {};
}

describe('generateImage, idempotency', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({ success: true });
  });

  it('sends an Idempotency-Key', async () => {
    await generateImage({ prompt: 'an anime character' });

    expect(sentHeaders()['Idempotency-Key']).toBeTruthy();
  });

  it('sends a key the server will accept', async () => {
    await generateImage({ prompt: 'an anime character' });

    const key = sentHeaders()['Idempotency-Key']!;
    expect(isManagedMediaIdempotencyKey(key)).toBe(true);
    expect(parseManagedMediaIdempotencyKey(key)).toEqual({
      surface: 'mobile',
      operation: 'image',
      operationId: '12345678-abcd-4abc-8abc-1234567890ab',
    });
  });

  it('reuses a caller-supplied operation id across retries', async () => {
    await generateImage({ prompt: 'a cat' }, { operationId: 'retry-operation-1' });
    const first = sentHeaders()['Idempotency-Key'];

    mockPost.mockClear();
    await generateImage({ prompt: 'a cat' }, { operationId: 'retry-operation-1' });

    expect(sentHeaders()['Idempotency-Key']).toBe(first);
  });

  it('uses a fresh key for a new user action', async () => {
    await generateImage({ prompt: 'a cat' }, { operationId: 'operation-aaaa' });
    const first = sentHeaders()['Idempotency-Key'];

    mockPost.mockClear();
    await generateImage({ prompt: 'a dog' }, { operationId: 'operation-bbbb' });

    expect(sentHeaders()['Idempotency-Key']).not.toBe(first);
  });

  it('submits the request as a durable job', async () => {
    await generateImage({ prompt: 'an anime character' });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/media/image/generate',
      { prompt: 'an anime character', async: true },
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('follows a queued job until it completes', async () => {
    jest.useFakeTimers();
    const jobId = '0190a000-0000-4000-8000-000000000001';
    mockPost.mockResolvedValue({ success: true, job_id: jobId, status: 'queued', images: [] });
    mockGet
      .mockResolvedValueOnce({ success: true, job_id: jobId, status: 'processing', images: [] })
      .mockResolvedValueOnce({
        success: true,
        job_id: jobId,
        status: 'completed',
        images: [{ url: '/api/files/0190a000-0000-4000-8000-000000000002' }],
      });

    const pending = generateImage({ prompt: 'a lighthouse' });
    for (let i = 0; i < 3; i += 1) {
      await jest.advanceTimersByTimeAsync(2_000);
    }
    const result = await pending;

    expect(mockGet).toHaveBeenCalledWith(`/api/media/image/status?job_id=${jobId}`);
    expect(result.status).toBe('completed');
    expect(result.images?.[0]?.url).toBe('/api/files/0190a000-0000-4000-8000-000000000002');
    jest.useRealTimers();
  });

  it('falls back to a direct request where durable jobs are not deployed', async () => {
    mockPost
      .mockRejectedValueOnce(
        new ApiHttpError(
          'Durable image jobs are not available',
          503,
          'image_job_store_unavailable',
        ),
      )
      .mockResolvedValueOnce({ success: true, images: [{ url: 'https://cdn.test/x.png' }] });

    const result = await generateImage({ prompt: 'a lighthouse' });

    expect(mockPost).toHaveBeenLastCalledWith(
      '/api/media/image/generate',
      { prompt: 'a lighthouse' },
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(result.images?.[0]?.url).toBe('https://cdn.test/x.png');
  });

  it('keeps the fallback key stable across retries of the same turn', async () => {
    const unavailable = () =>
      new ApiHttpError('Durable image jobs are not available', 503, 'image_job_store_unavailable');
    mockPost.mockRejectedValueOnce(unavailable()).mockResolvedValueOnce({ success: true });
    await generateImage({ prompt: 'a lighthouse' }, { operationId: 'turn-operation-1' });
    const first = (mockPost.mock.calls[1]?.[2] as { headers: Record<string, string> }).headers[
      'Idempotency-Key'
    ];

    mockPost.mockReset();
    mockPost.mockRejectedValueOnce(unavailable()).mockResolvedValueOnce({ success: true });
    await generateImage({ prompt: 'a lighthouse' }, { operationId: 'turn-operation-1' });
    const second = (mockPost.mock.calls[1]?.[2] as { headers: Record<string, string> }).headers[
      'Idempotency-Key'
    ];

    expect(second).toBe(first);
    expect(isManagedMediaIdempotencyKey(first!)).toBe(true);
  });

  it('rejects an empty prompt before spending a key', async () => {
    await expect(generateImage({ prompt: '   ' })).rejects.toThrow(/non-empty prompt/);
    expect(mockPost).not.toHaveBeenCalled();
  });
});
