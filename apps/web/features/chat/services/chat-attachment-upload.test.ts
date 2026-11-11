import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestAuthority } from '@/lib/identity/request-authority';
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
    csrfMocks.getCsrfToken.mockReset().mockResolvedValue('csrf-token');
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

    const authority = createRequestAuthority({
      userId: 'owner-a',
      sessionId: 'session-a',
      isCurrent: () => true,
      getToken: async () => 'owner-a-token',
    });
    await expect(uploadChatAttachments([file], { onStatus }, authority)).resolves.toEqual([
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
    const presignInit = fetchMock.mock.calls[0]![1] as RequestInit;
    const storageInit = fetchMock.mock.calls[1]![1] as RequestInit;
    const completeInit = fetchMock.mock.calls[2]![1] as RequestInit;
    expect(new Headers(presignInit.headers).get('Authorization')).toBe('Bearer owner-a-token');
    expect(new Headers(completeInit.headers).get('Authorization')).toBe('Bearer owner-a-token');
    expect(new Headers(storageInit.headers).has('Authorization')).toBe(false);
    expect([presignInit.credentials, storageInit.credentials, completeInit.credentials]).toEqual([
      'omit',
      'omit',
      'omit',
    ]);
  });

  it('sends the captured Bearer, and only to the same-origin relay', async () => {
    const id = '32b71cf4-c0d1-4cc7-b6c4-776ece82f137';
    const relayUrl = `${window.location.origin}/api/uploads/chat-attachment/put?token=grant`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            storageKey: 'chat-attachments/user/key.txt',
            uploadUrl: relayUrl,
            uploadMethod: 'PUT',
            uploadHeaders: { 'Content-Type': 'text/plain', 'x-csrf-token': 'csrf-token' },
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
              name: 'notes.txt',
              mimeType: 'text/plain',
              byteCount: 5,
              type: 'file',
              url: `/api/files/${id}`,
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const authority = createRequestAuthority({
      userId: 'owner-a',
      sessionId: 'session-a',
      isCurrent: () => true,
      getToken: async () => 'owner-a-token',
    });

    await uploadChatAttachments(
      [new File(['hello'], 'notes.txt', { type: 'text/plain' })],
      {},
      authority,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      relayUrl,
      expect.objectContaining({ method: 'PUT' }),
    );
    const relayInit = fetchMock.mock.calls[1]![1] as RequestInit;
    const relayHeaders = new Headers(relayInit.headers);
    expect(relayHeaders.get('Authorization')).toBe('Bearer owner-a-token');
    expect(relayHeaders.get('x-csrf-token')).toBe('csrf-token');
    expect(relayHeaders.get('Content-Type')).toBe('text/plain');
    expect(relayInit.credentials).toBe('omit');
  });

  it('does not dispatch when the original session retires during CSRF preparation', async () => {
    let resolveCsrf!: (value: string) => void;
    csrfMocks.getCsrfToken.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveCsrf = resolve;
        }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const authority = createRequestAuthority({
      userId: 'owner-a',
      sessionId: 'session-a',
      isCurrent: () => true,
      getToken: async () => 'owner-a-token',
    });
    const upload = uploadChatAttachments(
      [new File(['hello'], 'notes.txt', { type: 'text/plain' })],
      {},
      authority,
    );
    const rejected = expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(csrfMocks.getCsrfToken).toHaveBeenCalled());
    authority.retire();
    resolveCsrf('csrf-token');
    await rejected;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not use a presign decoded after the session changes', async () => {
    let resolveBody!: (value: unknown) => void;
    const response = new Response(null, { status: 200 });
    vi.spyOn(response, 'json').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBody = resolve;
        }),
    );
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    let current = true;
    const authority = createRequestAuthority({
      userId: 'owner-a',
      sessionId: 'session-a',
      isCurrent: () => current,
      getToken: async () => 'owner-a-token',
    });
    const upload = uploadChatAttachments(
      [new File(['hello'], 'notes.txt', { type: 'text/plain' })],
      {},
      authority,
    );
    const rejected = expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(response.json).toHaveBeenCalled());
    current = false;
    resolveBody({
      storageKey: 'chat-attachments/owner-a/notes.txt',
      uploadUrl: 'https://upload.example.test/signed',
      uploadMethod: 'PUT',
      uploadHeaders: {},
    });
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
      retryable: true,
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
