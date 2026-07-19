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
import { useMediaGeneration } from './useMediaGeneration';

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
});
