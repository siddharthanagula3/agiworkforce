import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sha256HexOfBlob, sha256HexOfBlobInSlices, type IncrementalSha256 } from '../file-digest';
import { RESUMABLE_UPLOAD_LARGE_PART_BYTES } from '../resumable-uploads';

function patternedBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = (index * 31 + 7) % 251;
  return bytes;
}

function nodeSha256(): IncrementalSha256 {
  const hash = createHash('sha256');
  return {
    update: (bytes) => hash.update(bytes),
    digest: () => new Uint8Array(hash.digest()),
  };
}

async function webCryptoHex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

describe('sha256HexOfBlobInSlices', () => {
  it('equals the WebCrypto digest of the same bytes across several default slices', async () => {
    const bytes = patternedBytes(RESUMABLE_UPLOAD_LARGE_PART_BYTES * 2 + 12_345);
    const blob = new Blob([bytes]);

    await expect(sha256HexOfBlobInSlices(blob, nodeSha256)).resolves.toBe(
      await webCryptoHex(bytes),
    );
  });

  it.each([7, 64, 1_000, 4_096])(
    'equals the WebCrypto digest with slices of %i bytes',
    async (sliceBytes) => {
      const bytes = patternedBytes(2_003);

      await expect(
        sha256HexOfBlobInSlices(new Blob([bytes]), nodeSha256, { sliceBytes }),
      ).resolves.toBe(await webCryptoHex(bytes));
    },
  );

  it('agrees with the whole-file digest the inline path uses', async () => {
    const blob = new Blob([patternedBytes(50_000)]);

    await expect(sha256HexOfBlobInSlices(blob, nodeSha256, { sliceBytes: 4_096 })).resolves.toBe(
      await sha256HexOfBlob(blob),
    );
  });

  it('feeds every slice to the hasher it is given and returns that hasher digest', async () => {
    const bytes = patternedBytes(2_500);
    const fed: number[] = [];
    const recording = (): IncrementalSha256 => {
      const inner = nodeSha256();
      return {
        update: (slice) => {
          fed.push(slice.byteLength);
          return inner.update(slice);
        },
        digest: () => inner.digest(),
      };
    };

    await expect(
      sha256HexOfBlobInSlices(new Blob([bytes]), recording, { sliceBytes: 1_000 }),
    ).resolves.toBe(await webCryptoHex(bytes));
    expect(fed).toEqual([1_000, 1_000, 500]);
  });

  it('hashes an empty file to the digest of no bytes', async () => {
    await expect(sha256HexOfBlobInSlices(new Blob([]), nodeSha256)).resolves.toBe(
      await webCryptoHex(new Uint8Array(0)),
    );
  });

  it('reads one slice at a time from the file', async () => {
    const bytes = patternedBytes(10_000);
    const blob = new Blob([bytes]);
    const ranges: Array<[number, number]> = [];
    const recording = {
      size: blob.size,
      slice(start: number, end: number) {
        ranges.push([start, end]);
        return blob.slice(start, end);
      },
    } as Blob;

    await expect(
      sha256HexOfBlobInSlices(recording, nodeSha256, { sliceBytes: 4_000 }),
    ).resolves.toBe(await webCryptoHex(bytes));
    expect(ranges).toEqual([
      [0, 4_000],
      [4_000, 8_000],
      [8_000, 10_000],
    ]);
  });

  it('stops between slices when the upload is cancelled', async () => {
    const controller = new AbortController();
    const blob = new Blob([patternedBytes(10_000)]);
    let reads = 0;
    const cancelling = {
      size: blob.size,
      slice(start: number, end: number) {
        reads += 1;
        if (reads === 2) controller.abort();
        return blob.slice(start, end);
      },
    } as Blob;

    await expect(
      sha256HexOfBlobInSlices(cancelling, nodeSha256, {
        sliceBytes: 1_000,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(reads).toBe(2);
  });

  it.each([0, -1, 2.5, Number.NaN])(
    'reads in the default slice size when asked for %s bytes per slice',
    async (sliceBytes) => {
      const bytes = patternedBytes(RESUMABLE_UPLOAD_LARGE_PART_BYTES + 3);
      const blob = new Blob([bytes]);
      const ranges: Array<[number, number]> = [];
      const recording = {
        size: blob.size,
        slice(start: number, end: number) {
          ranges.push([start, end]);
          if (ranges.length > 2) throw new Error('read past the expected slices');
          return blob.slice(start, end);
        },
      } as Blob;

      await expect(sha256HexOfBlobInSlices(recording, nodeSha256, { sliceBytes })).resolves.toBe(
        await webCryptoHex(bytes),
      );
      expect(ranges).toEqual([
        [0, RESUMABLE_UPLOAD_LARGE_PART_BYTES],
        [RESUMABLE_UPLOAD_LARGE_PART_BYTES, RESUMABLE_UPLOAD_LARGE_PART_BYTES + 3],
      ]);
    },
  );

  describe('while timers are held back, as in a hidden tab', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('still finishes by yielding through a message task', async () => {
      const realSetTimeout = globalThis.setTimeout;
      const bytes = patternedBytes(5_000);
      const expected = await webCryptoHex(bytes);
      const zeroDelayTimers = vi.fn();
      vi.stubGlobal('setTimeout', ((handler: () => void, delay?: number) => {
        if (!delay) {
          zeroDelayTimers();
          return 0;
        }
        return realSetTimeout(handler, delay);
      }) as typeof setTimeout);

      const outcome = await Promise.race([
        sha256HexOfBlobInSlices(new Blob([bytes]), nodeSha256, { sliceBytes: 1_000 }),
        new Promise((resolve) => realSetTimeout(() => resolve('held'), 2_000)),
      ]);

      expect(outcome).toBe(expected);
      expect(zeroDelayTimers).not.toHaveBeenCalled();
    });
  });
});
