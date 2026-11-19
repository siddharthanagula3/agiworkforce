import { describe, expect, it, vi } from 'vitest';
import { createMemoryObjectStore } from '../adapters/memory';
import { abortOrphanedMultipartUploads, deleteObjectsUnderPrefix } from '../lifecycle';
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
      presignGet: vi.fn(),
    };

    await expect(abortOrphanedMultipartUploads(store, { bucket: BUCKET })).resolves.toEqual({
      supported: false,
      pending: 0,
      aborted: 0,
      failed: 0,
    });
  });
});

describe('deleteObjectsUnderPrefix', () => {
  async function seed(store: ReturnType<typeof storeAt>, keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      await store.put({
        bucket: BUCKET,
        key,
        body: new Uint8Array([1]),
        contentType: CONTENT_TYPE,
      });
    }
  }

  async function keysLeft(store: ReturnType<typeof storeAt>): Promise<string[]> {
    return (await store.listObjects(BUCKET, '')).map((object) => object.key);
  }

  it('deletes every object under the prefix and nothing beside it', async () => {
    const store = storeAt({ now: START_MS });
    await seed(store, ['pieces/a/1', 'pieces/a/2', 'pieces/ab/1', 'kept/1']);

    const swept = await deleteObjectsUnderPrefix(store, { bucket: BUCKET, prefix: 'pieces/a/' });

    expect(swept).toEqual({ supported: true, listed: 2, deleted: 2, failed: 0 });
    expect(await keysLeft(store)).toEqual(['kept/1', 'pieces/ab/1']);
  });

  it('with an age, deletes only the objects written at least that long ago', async () => {
    const clock = { now: START_MS };
    const store = storeAt(clock);
    await seed(store, ['pieces/old']);
    clock.now = START_MS + DAY_MS;
    await seed(store, ['pieces/young']);

    const swept = await deleteObjectsUnderPrefix(store, {
      bucket: BUCKET,
      prefix: 'pieces/',
      olderThanMs: DAY_MS,
      now: clock.now,
    });

    expect(swept).toEqual({ supported: true, listed: 2, deleted: 1, failed: 0 });
    expect(await keysLeft(store)).toEqual(['pieces/young']);
  });

  it('keeps an object whose write time the host did not report from an age sweep', async () => {
    const store = storeAt({ now: START_MS });
    await seed(store, ['pieces/unknown']);
    vi.spyOn(store, 'listObjects').mockResolvedValue([
      { key: 'pieces/unknown', lastModifiedMs: undefined },
    ]);

    const swept = await deleteObjectsUnderPrefix(store, {
      bucket: BUCKET,
      prefix: 'pieces/',
      olderThanMs: DAY_MS,
      now: START_MS + 2 * DAY_MS,
    });

    expect(swept.deleted).toBe(0);
    expect(await store.head(BUCKET, 'pieces/unknown')).not.toBeNull();
  });

  it('deletes no more objects than the limit in one call', async () => {
    const store = storeAt({ now: START_MS });
    await seed(store, ['pieces/1', 'pieces/2', 'pieces/3']);

    const swept = await deleteObjectsUnderPrefix(store, {
      bucket: BUCKET,
      prefix: 'pieces/',
      limit: 2,
    });

    expect(swept).toMatchObject({ supported: true, deleted: 2, failed: 0 });
    expect(await keysLeft(store)).toEqual(['pieces/3']);
  });

  it('pages past the young objects that sort first to reach the old ones', async () => {
    const clock = { now: START_MS };
    const store = storeAt(clock);
    await seed(store, ['pieces/z-old']);
    clock.now = START_MS + DAY_MS;
    const young = Array.from({ length: 1_001 }, (_, index) => `pieces/a-${index}`);
    await seed(store, young);
    const listObjects = vi.spyOn(store, 'listObjects');

    const swept = await deleteObjectsUnderPrefix(store, {
      bucket: BUCKET,
      prefix: 'pieces/',
      olderThanMs: DAY_MS,
      now: clock.now,
      limit: 1,
    });

    expect(swept).toEqual({ supported: true, listed: 1_002, deleted: 1, failed: 0 });
    expect(listObjects.mock.calls.length).toBeGreaterThan(1);
    expect(await store.head(BUCKET, 'pieces/z-old')).toBeNull();
    expect(await keysLeft(store)).toHaveLength(1_001);
  });

  it('lists no more keys than the scan limit in one call', async () => {
    const clock = { now: START_MS };
    const store = storeAt(clock);
    await seed(store, ['pieces/z-old']);
    clock.now = START_MS + DAY_MS;
    await seed(store, ['pieces/a', 'pieces/b', 'pieces/c']);
    const listObjects = vi.spyOn(store, 'listObjects');

    const swept = await deleteObjectsUnderPrefix(store, {
      bucket: BUCKET,
      prefix: 'pieces/',
      olderThanMs: DAY_MS,
      now: clock.now,
      scanLimit: 2,
    });

    expect(swept).toEqual({ supported: true, listed: 2, deleted: 0, failed: 0 });
    expect(listObjects).toHaveBeenCalledTimes(1);
    expect(listObjects).toHaveBeenCalledWith(BUCKET, 'pieces/', 2, undefined);
    expect(await store.head(BUCKET, 'pieces/z-old')).not.toBeNull();
  });

  it('deletes only the listed objects whose key the filter accepts', async () => {
    const store = storeAt({ now: START_MS });
    await seed(store, ['pieces/a/org-1/1', 'pieces/a/org-2/1', 'pieces/b/org-1/1']);

    const swept = await deleteObjectsUnderPrefix(store, {
      bucket: BUCKET,
      prefix: 'pieces/',
      matching: (key) => key.split('/')[2] === 'org-1',
    });

    expect(swept).toEqual({ supported: true, listed: 3, deleted: 2, failed: 0 });
    expect(await keysLeft(store)).toEqual(['pieces/a/org-2/1']);
  });

  it('counts a delete the host refuses and carries on', async () => {
    const store = storeAt({ now: START_MS });
    await seed(store, ['pieces/1', 'pieces/2']);
    vi.spyOn(store, 'delete').mockRejectedValueOnce(new Error('host refused'));

    const swept = await deleteObjectsUnderPrefix(store, { bucket: BUCKET, prefix: 'pieces/' });

    expect(swept).toEqual({ supported: true, listed: 2, deleted: 1, failed: 1 });
  });

  it('refuses an empty prefix rather than sweeping the whole bucket', async () => {
    const store = storeAt({ now: START_MS });
    await seed(store, ['kept/1']);

    await expect(deleteObjectsUnderPrefix(store, { bucket: BUCKET, prefix: '' })).rejects.toThrow(
      /prefix/u,
    );
    expect(await keysLeft(store)).toEqual(['kept/1']);
  });

  it('reports that a store without listing has nothing it can sweep', async () => {
    const store: ObjectStore = {
      put: vi.fn(),
      get: vi.fn(),
      getStream: vi.fn(),
      head: vi.fn(),
      delete: vi.fn(),
      copyIfMatch: vi.fn(),
      presignPut: vi.fn(),
      presignGet: vi.fn(),
    };

    await expect(
      deleteObjectsUnderPrefix(store, { bucket: BUCKET, prefix: 'pieces/' }),
    ).resolves.toEqual({ supported: false, listed: 0, deleted: 0, failed: 0 });
    expect(store.delete).not.toHaveBeenCalled();
  });
});
