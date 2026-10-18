import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { objectChecksum } from '../checksum';

const BYTES = new Uint8Array([1, 2, 3, 4, 5]);

describe('object checksums', () => {
  it('computes the sha-256 of the bytes in base64', () => {
    expect(objectChecksum(BYTES)).toBe(createHash('sha256').update(BYTES).digest('base64'));
  });
});
