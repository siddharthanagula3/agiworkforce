import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadChatAttachments } from './chat-attachment-upload';

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

    await expect(uploadChatAttachments([file])).resolves.toEqual([
      expect.objectContaining({ assetId: id, name: 'brief.pdf', type: 'file' }),
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

  it('rejects unsupported binaries before any network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['MZ'], 'installer.exe', { type: 'application/x-msdownload' });

    await expect(uploadChatAttachments([file])).rejects.toThrow('not supported');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
