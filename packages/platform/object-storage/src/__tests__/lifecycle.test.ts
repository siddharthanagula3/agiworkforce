import { describe, expect, it, vi } from 'vitest';
import { createMemoryObjectStore } from '../adapters/memory';
import { abortOrphanedMultipartUploads } from '../lifecycle';
import type { ObjectStore } from '../types';

const BUCKET = 'contract-bucket';
const CONTENT_TYPE = 'application/octet-stream';
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const START_MS = 1_700_000_000_000;

function storeAt(clock: { now: number }) {
  return createMemoryObjectStore({ now: () => clock.now });
}

describe('abortOrphanedMultipartUploads', () => {
  it('aborts an upload older than the age and leaves a fresh one open', async () => {
    const clock = { now: START_MS };
    const store = storeAt(clock);
    const stale = await store.createMultipartUpload({
      bucket: BUCKET,
      key: 'stale.bin',
      contentType: CONTENT_TYPE,
    });
    await store.uploadPart({ ...stale, partNumber: 1, body: new Uint8Array([1, 2]) });

    clock.now = START_MS + 2 * DAY_MS;
    await store.createMultipartUpload({
      bucket: BUCKET,
      key: 'fresh.bin',
      contentType: CONTENT_TYPE,
    });

    const swept = await abortOrphanedMultipartUploads(store, {
      bucket: BUCKET,
      now: clock.now,
      olderThanMs: DAY_MS,
    });

    expect(swept).toEqual({ supported: true, pending: 2, aborted: 1, failed: 0 });
    const remaining = await store.listPendingMultipartUploads(BUCKET);
    expect(remaining.map((upload) => upload.key)).toEqual(['fresh.bin']);
  });

  it('counts an abort that the host refuses instead of abandoning the sweep', async () => {
    const clock = { now: START_MS };
    const store = storeAt(clock);
    await store.createMultipartUpload({
      bucket: BUCKET,
      key: 'first.bin',
      contentType: CONTENT_TYPE,
    });
    await store.createMultipartUpload({
      bucket: BUCKET,
      key: 'second.bin',
      contentType: CONTENT_TYPE,
    });
    const abort = vi
      .spyOn(store, 'abortMultipartUpload')
      .mockRejectedValueOnce(new Error('host refused'))
      .mockResolvedValueOnce(undefined);

    const swept = await abortOrphanedMultipartUploads(store, {
      bucket: BUCKET,
      now: clock.now + 2 * DAY_MS,
      olderThanMs: DAY_MS,
    });

    expect(abort).toHaveBeenCalledTimes(2);
    expect(swept).toEqual({ supported: true, pending: 2, aborted: 1, failed: 1 });
  });

  it('reports that a store without multipart has nothing to sweep', async () => {
    const store: ObjectStore = {
      put: vi.fn(),
      get: vi.fn(),
      getStream: vi.fn(),
      head: vi.fn(),
      delete: vi.fn(),
      copyIfMatch: vi.fn(),
      presignPut: vi.fn(),
    };

    await expect(abortOrphanedMultipartUploads(store, { bucket: BUCKET })).resolves.toEqual({
      supported: false,
      pending: 0,
      aborted: 0,
      failed: 0,
    });
  });
});
