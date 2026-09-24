import { describe, expect, it } from 'vitest';
import { readExifOrientation } from '@agiworkforce/utils';

import {
  PICTURE_METADATA_REFUSAL,
  chatDraftRefusalNotes,
  prepareChatAttachment,
  prepareChatAttachments,
} from '../attachment-metadata';
import {
  PICTURE_NEEDLE,
  bytesOf,
  includesText,
  jpegWithLocation,
  jpegWithLocationBytes,
  onePixelPng,
} from './picture-fixtures';

describe('a picture on its way out of the browser', () => {
  it('leaves without its camera and location, and keeps its pixels', async () => {
    const original = jpegWithLocation();
    expect(includesText(await bytesOf(original), PICTURE_NEEDLE.camera)).toBe(true);

    const prepared = await prepareChatAttachment(original);
    if (prepared.status !== 'ready') throw new Error('expected the picture to be kept');
    const sent = await bytesOf(prepared.file);

    expect(includesText(sent, PICTURE_NEEDLE.camera)).toBe(false);
    expect(includesText(sent, PICTURE_NEEDLE.pixels)).toBe(true);
    expect(prepared.file.name).toBe('beach.jpg');
    expect(prepared.file.type).toBe('image/jpeg');
  });

  it('still stands the right way up once the rest is gone', async () => {
    const prepared = await prepareChatAttachment(jpegWithLocation('side.jpg', 6));
    if (prepared.status !== 'ready') throw new Error('expected the picture to be kept');
    const sent = await bytesOf(prepared.file);
    expect(readExifOrientation(sent.subarray(12))).toBe(6);
  });

  it('leaves the reader their own file exactly as it was', async () => {
    const source = jpegWithLocationBytes();
    const original = new File([source], 'beach.jpg', { type: 'image/jpeg' });
    const before = Array.from(await bytesOf(original));

    const prepared = await prepareChatAttachment(original);

    expect(prepared.status === 'ready' && prepared.file).not.toBe(original);
    expect(Array.from(await bytesOf(original))).toEqual(before);
    expect(original.size).toBe(before.length);
  });

  it('strips a picture whose type the browser left blank', async () => {
    const unlabelled = new File([jpegWithLocationBytes()], 'beach.jpg', { type: '' });
    const prepared = await prepareChatAttachment(unlabelled);
    if (prepared.status !== 'ready') throw new Error('expected the picture to be kept');
    expect(includesText(await bytesOf(prepared.file), PICTURE_NEEDLE.camera)).toBe(false);
  });

  it('hands a document back untouched, the same file object', async () => {
    const pdf = new File(['%PDF-1.7 camera notes'], 'notes.pdf', { type: 'application/pdf' });
    const text = new File(['GPS 37N'], 'notes.txt', { type: 'text/plain' });

    const prepared = await prepareChatAttachments([pdf, text]);

    expect(prepared.accepted[0]).toBe(pdf);
    expect(prepared.accepted[1]).toBe(text);
    expect(prepared.refused).toEqual([]);
  });

  it('keeps a real PNG', async () => {
    const prepared = await prepareChatAttachment(onePixelPng());
    expect(prepared.status).toBe('ready');
  });
});

describe('a picture that cannot be read', () => {
  it('is refused rather than sent as it was', async () => {
    const bytes = jpegWithLocationBytes();
    const truncated = new File([bytes.subarray(0, bytes.length - 2)], 'cut.jpg', {
      type: 'image/jpeg',
    });
    const mislabelled = new File(['%PDF-1.7'], 'report.png', { type: 'image/png' });

    const prepared = await prepareChatAttachments([truncated, mislabelled, onePixelPng()]);

    expect(prepared.refused).toEqual([
      { filename: 'cut.jpg', reason: PICTURE_METADATA_REFUSAL },
      { filename: 'report.png', reason: PICTURE_METADATA_REFUSAL },
    ]);
    expect(prepared.accepted.map((file) => file.name)).toEqual(['pixel.png']);
  });

  it('is named in the turn, in plain words, next to the other refusals', () => {
    expect(
      chatDraftRefusalNotes([
        { filename: 'cut.jpg', reason: PICTURE_METADATA_REFUSAL },
        { filename: 'huge.pdf', reason: 'too_large' },
      ]),
    ).toEqual([
      '[attachment unavailable: cut.jpg could not be sent because the location and camera details in it could not be removed.]',
      '[attachment unavailable: huge.pdf is larger than this chat can send.]',
    ]);
  });
});
