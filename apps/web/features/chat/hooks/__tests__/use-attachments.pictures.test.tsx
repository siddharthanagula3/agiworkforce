import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { resolveChatAttachmentMimeType } from '@/lib/chat-attachment-policy';
import { PICTURE_METADATA_REFUSAL } from '@features/chat/lib/attachment-metadata';
import {
  PICTURE_NEEDLE,
  bytesOf,
  includesText,
  jpegWithLocation,
  jpegWithLocationBytes,
} from '@features/chat/lib/__tests__/picture-fixtures';
import { useAttachments } from '../use-attachments';

function notes(name = 'notes.txt'): File {
  return new File(['GPS 37N'], name, { type: 'text/plain' });
}

describe('a picture added to the draft', () => {
  it('is held back until its metadata is gone, and the draft says it is still preparing', async () => {
    const { result } = renderHook(() => useAttachments());

    act(() => result.current.addFiles([jpegWithLocation('beach.jpg')]));
    expect(result.current.preparing).toBe(true);
    expect(result.current.attachments).toHaveLength(0);

    await waitFor(() => expect(result.current.preparing).toBe(false));
    const held = result.current.attachments[0];
    if (!held) throw new Error('the picture was not attached');
    expect(includesText(await bytesOf(held), PICTURE_NEEDLE.camera)).toBe(false);
    expect(result.current.previews[0]?.file).toBe(held);
  });

  it('is refused by name, with a sentence the reader can act on', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useAttachments({ onError }));
    const whole = jpegWithLocationBytes();

    act(() =>
      result.current.addFiles([
        new File([whole.subarray(0, 20)], 'cut.jpg', { type: 'image/jpeg' }),
      ]),
    );

    await waitFor(() => expect(result.current.preparing).toBe(false));
    expect(result.current.attachments).toEqual([]);
    expect(result.current.refused).toEqual([
      { filename: 'cut.jpg', reason: PICTURE_METADATA_REFUSAL },
    ]);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/^"cut\.jpg" was not attached\./));
  });

  it('frees its slot when it is refused', async () => {
    const { result } = renderHook(() => useAttachments({ maxFiles: 1 }));
    act(() => result.current.addFiles([new File(['%PDF'], 'fake.png', { type: 'image/png' })]));
    await waitFor(() => expect(result.current.preparing).toBe(false));

    act(() => result.current.addFiles([notes()]));
    expect(result.current.attachments.map((file) => file.name)).toEqual(['notes.txt']);
  });

  it('counts against the file limit while it is still being prepared', () => {
    const { result } = renderHook(() => useAttachments({ maxFiles: 1 }));

    act(() => result.current.addFiles([jpegWithLocation('beach.jpg')]));
    act(() => result.current.addFiles([notes()]));

    expect(result.current.refused).toEqual([{ filename: 'notes.txt', reason: 'too_many' }]);
  });

  it('never lands in a draft that was cleared while it was being prepared', async () => {
    const { result } = renderHook(() => useAttachments());

    act(() => result.current.addFiles([jpegWithLocation('beach.jpg')]));
    act(() => result.current.clearAll());

    await waitFor(() => expect(result.current.preparing).toBe(false));
    expect(result.current.attachments).toEqual([]);
    expect(result.current.previews).toEqual([]);
  });
});

describe('a document added to the draft', () => {
  it('is attached at once, the same file, with nothing to wait for', () => {
    const { result } = renderHook(() => useAttachments());
    const document = notes();

    act(() => result.current.addFiles([document]));

    expect(result.current.preparing).toBe(false);
    expect(result.current.attachments[0]).toBe(document);
  });

  it('keeps its place behind a picture that is still being prepared', async () => {
    const { result } = renderHook(() => useAttachments());

    act(() => result.current.addFiles([jpegWithLocation('beach.jpg')]));
    act(() => result.current.addFiles([notes()]));

    await waitFor(() => expect(result.current.preparing).toBe(false));
    expect(result.current.attachments.map((file) => file.name)).toEqual(['beach.jpg', 'notes.txt']);
  });
});

describe('a HEIC photo', () => {
  const heic = [
    ['IMG_0001.heic', 'image/heic'],
    ['IMG_0002.heif', 'image/heif'],
    ['IMG_0003.heic', 'image/heic-sequence'],
    ['IMG_0004.heif', 'image/heif-sequence'],
    ['IMG_0005.HEIC', ''],
  ] as const;

  it.each(heic)(
    'is refused by name rather than handed to a provider that may not read it: %s',
    (name, type) => {
      const { result } = renderHook(() => useAttachments());

      act(() => result.current.addFiles([new File(['ftypheic'], name, { type })]));

      expect(result.current.attachments).toEqual([]);
      expect(result.current.refused).toEqual([{ filename: name, reason: 'unsupported' }]);
      expect(resolveChatAttachmentMimeType(name, type)).toBeNull();
    },
  );
});
