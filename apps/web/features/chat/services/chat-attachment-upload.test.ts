import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadChatAttachments } from './chat-attachment-upload';
import {
  PICTURE_NEEDLE,
  bytesOf,
  includesText,
  jpegWithLocation,
  jpegWithLocationBytes,
} from '@features/chat/lib/__tests__/picture-fixtures';

const csrfMocks = vi.hoisted(() => ({ getCsrfToken: vi.fn() }));

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: csrfMocks.getCsrfToken }));

describe('uploadChatAttachments', () => {
  beforeEach(() => {
    csrfMocks.getCsrfToken.mockResolvedValue('csrf-token');
  });

  it('presigns, uploads, and completes an owner-scoped attachment', async () => {
    const id = '32b71cf4-c0d1-4cc7-b6c4-776ece82f137';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storageKey: 'chat-attachments/user/key.pdf',
            uploadUrl: 'https://upload.example.test/signed',
            uploadMethod: 'PUT',
            uploadHeaders: { 'Content-Type': 'application/pdf' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            attachment: {
              id,
              name: 'brief.pdf',
              mimeType: 'application/pdf',
              byteCount: 4,
              type: 'file',
              url: `/api/files/${id}`,
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['%PDF'], 'brief.pdf', { type: 'application/pdf' });
    const onStatus = vi.fn();

    await expect(uploadChatAttachments([file], { onStatus })).resolves.toEqual([
      expect.objectContaining({ assetId: id, name: 'brief.pdf', type: 'file' }),
    ]);
    expect(onStatus.mock.calls.map(([status]) => status.phase)).toEqual([
      'preparing',
      'uploading',
      'verifying',
      'complete',
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://upload.example.test/signed',
      expect.objectContaining({ method: 'PUT', body: file }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/uploads/chat-attachment/complete',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reports the exact failed file without inventing byte progress', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storageKey: 'chat-attachments/user/key.txt',
            uploadUrl: 'https://upload.example.test/signed',
            uploadMethod: 'PUT',
            uploadHeaders: { 'Content-Type': 'text/plain' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const onStatus = vi.fn();

    await expect(
      uploadChatAttachments([new File(['hello'], 'notes.txt', { type: 'text/plain' })], {
        onStatus,
      }),
    ).rejects.toThrow('Could not upload notes.txt to storage.');

    expect(onStatus).toHaveBeenLastCalledWith({
      index: 0,
      fileName: 'notes.txt',
      phase: 'failed',
      error: 'Could not upload notes.txt to storage.',
    });
    expect(onStatus.mock.calls.flat()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ percent: expect.any(Number) })]),
    );
  });

  it('rejects unsupported binaries before any network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['MZ'], 'installer.exe', { type: 'application/x-msdownload' });

    await expect(uploadChatAttachments([file])).rejects.toThrow('not supported');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('puts a photo into storage without the camera and place it was taken', async () => {
    const id = '32b71cf4-c0d1-4cc7-b6c4-776ece82f138';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storageKey: 'chat-attachments/user/key.jpg',
            uploadUrl: 'https://upload.example.test/signed',
            uploadMethod: 'PUT',
            uploadHeaders: { 'Content-Type': 'image/jpeg' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            attachment: {
              id,
              name: 'beach.jpg',
              mimeType: 'image/jpeg',
              byteCount: 4,
              type: 'image',
              url: `/api/files/${id}`,
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await uploadChatAttachments([jpegWithLocation('beach.jpg')]);

    const put = fetchMock.mock.calls[1]?.[1] as { body: Blob } | undefined;
    if (!put) throw new Error('nothing was put into storage');
    const stored = await bytesOf(put.body);
    expect(includesText(stored, PICTURE_NEEDLE.camera)).toBe(false);
    expect(includesText(stored, PICTURE_NEEDLE.pixels)).toBe(true);
  });

  it('refuses a picture it cannot clean before anything leaves the browser', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const whole = jpegWithLocationBytes();
    const cut = new File([whole.subarray(0, whole.length - 2)], 'cut.jpg', { type: 'image/jpeg' });

    await expect(uploadChatAttachments([cut])).rejects.toThrow(
      '"cut.jpg" was not uploaded. The location and camera details in a picture are removed before it leaves your device, and this file could not be read well enough to do that. Save a copy from a photo app and upload that instead.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
