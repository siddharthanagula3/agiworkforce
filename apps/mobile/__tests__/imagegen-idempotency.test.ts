/**
 * Mobile image generation sent NO `Idempotency-Key`, so every request failed
 * with "Idempotency-Key header is required for Managed Cloud chat" before the
 * route did any work — image generation was completely broken on mobile while
 * Web (`useMediaGeneration.ts`) and Desktop (`CloudRuntime.ts`) both built the
 * key with the shared helper.
 *
 * These pin the header's presence AND its shape, because the route does not
 * merely require a header: it parses the key with
 * `parseManagedMediaIdempotencyKey` and rejects anything that does not identify
 * one managed-media image operation.
 */

import { isManagedMediaIdempotencyKey, parseManagedMediaIdempotencyKey } from '@agiworkforce/utils';

// `mock`-prefixed so Jest allows the hoisted factory below to reference it.
const mockPost = jest.fn();

jest.mock('@/services/api', () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
  ApiPaywallError: class extends Error {},
}));
jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { imageGen: true } }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => '12345678-abcd-4abc-8abc-1234567890ab',
}));

import { generateImage } from '../src/features/image/services/imagegen';

function sentHeaders(): Record<string, string> {
  const options = mockPost.mock.calls[0]?.[2] as { headers?: Record<string, string> } | undefined;
  return options?.headers ?? {};
}

describe('generateImage — idempotency', () => {
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
    // The route parses this, it does not merely check for presence.
    expect(isManagedMediaIdempotencyKey(key)).toBe(true);
    expect(parseManagedMediaIdempotencyKey(key)).toEqual({
      surface: 'mobile',
      operation: 'image',
      operationId: '12345678-abcd-4abc-8abc-1234567890ab',
    });
  });

  it('reuses a caller-supplied operation id across retries', async () => {
    // Reusing the identity is what makes a retried request settle once instead
    // of billing the user twice — the reason the header exists.
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

    // Two distinct generations must not collapse into one billed operation.
    expect(sentHeaders()['Idempotency-Key']).not.toBe(first);
  });

  it('still posts the request body unchanged', async () => {
    await generateImage({ prompt: 'an anime character' });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/media/image/generate',
      { prompt: 'an anime character' },
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('rejects an empty prompt before spending a key', async () => {
    await expect(generateImage({ prompt: '   ' })).rejects.toThrow(/non-empty prompt/);
    expect(mockPost).not.toHaveBeenCalled();
  });
});
