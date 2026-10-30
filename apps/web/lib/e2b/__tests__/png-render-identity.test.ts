import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readPngRenderIdentity } from '../png-render-identity';

const identity = `matplotlib-v1:123e4567-e89b-12d3-a456-426614174000:${'a'.repeat(64)}`;
function metadataPng(value: string): Buffer {
  const text = Buffer.from(`agi-render-identity\0${value}`, 'latin1');
  const chunk = Buffer.alloc(12 + text.length);
  chunk.writeUInt32BE(text.length, 0);
  chunk.write('tEXt', 4, 'ascii');
  text.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + text.length)), 8 + text.length);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk]);
}

describe('PNG render identity', () => {
  it('reads only a validated generated figure identity', () => {
    expect(readPngRenderIdentity(metadataPng(identity))).toBe(identity);
    expect(readPngRenderIdentity(metadataPng('untrusted-image-name'))).toBeUndefined();
    expect(readPngRenderIdentity(Buffer.from('not png'))).toBeUndefined();
  });

  it('rejects truncated, oversized and corrupted metadata chunks without throwing', () => {
    const png = metadataPng(identity);
    expect(readPngRenderIdentity(png.subarray(0, png.length - 1))).toBeUndefined();
    const oversized = Buffer.from(png);
    oversized.writeUInt32BE(0xffffffff, 8);
    expect(readPngRenderIdentity(oversized)).toBeUndefined();
    png[png.length - 1] = (png[png.length - 1] ?? 0) ^ 1;
    expect(readPngRenderIdentity(png)).toBeUndefined();
  });
});
