import { describe, expect, it } from 'vitest';

import {
  createManagedMediaIdempotencyKey,
  isManagedMediaIdempotencyKey,
  parseManagedMediaIdempotencyKey,
} from '../managedMediaIdempotency';

describe('managed media idempotency identity', () => {
  const operationId = '0190a000-0000-7000-8000-000000000001';

  it('is deterministic for retries of the same logical operation', () => {
    const identity = { surface: 'web', operation: 'image', operationId } as const;

    const first = createManagedMediaIdempotencyKey(identity);
    const retry = createManagedMediaIdempotencyKey(identity);

    expect(retry).toBe(first);
    expect(parseManagedMediaIdempotencyKey(first)).toEqual(identity);
    expect(isManagedMediaIdempotencyKey(first)).toBe(true);
  });

  it('separates image and video actions across all managed app surfaces', () => {
    const identities = [
      { surface: 'web', operation: 'image', operationId },
      { surface: 'mobile', operation: 'image', operationId },
      { surface: 'desktop', operation: 'video', operationId },
      { surface: 'web', operation: 'video', operationId },
    ] as const;

    const keys = identities.map(createManagedMediaIdempotencyKey);

    expect(new Set(keys).size).toBe(identities.length);
    expect(keys.map(parseManagedMediaIdempotencyKey)).toEqual(identities);
  });

  it('rejects short, unbounded, and path-bearing operation ids', () => {
    for (const invalidOperationId of [
      'short',
      'x'.repeat(73),
      '../secret-file',
      'folder/operation-id',
      'folder\\operation-id',
      'contains spaces',
    ]) {
      expect(() =>
        createManagedMediaIdempotencyKey({
          surface: 'web',
          operation: 'image',
          operationId: invalidOperationId,
        }),
      ).toThrow(/operationId/i);
    }
  });

  it('fails closed when parsing arbitrary, malformed, or overlong values', () => {
    for (const value of [
      'random-request-id',
      'agi.media.web.image.bad key',
      'agi.media.browser.image.0190a000-0000-7000-8000-000000000001',
      'agi.media.web.audio.0190a000-0000-7000-8000-000000000001',
      `agi.media.web.image.${'x'.repeat(73)}`,
      '/tmp/agi.media.web.image.0190a000-0000-7000-8000-000000000001',
    ]) {
      expect(parseManagedMediaIdempotencyKey(value)).toBeNull();
      expect(isManagedMediaIdempotencyKey(value)).toBe(false);
    }
  });
});
