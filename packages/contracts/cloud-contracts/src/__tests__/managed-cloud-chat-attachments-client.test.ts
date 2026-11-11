import { describe, expect, it, vi } from 'vitest';

import { MAX_CHAT_ATTACHMENT_MESSAGE_BYTES, chatAttachmentSizeLabel } from '../chat-attachments';
import {
  ManagedCloudChatAttachmentHttpError,
  createManagedCloudChatAttachmentsClient,
  isRetryableAttachmentUploadError,
} from '../managed-cloud-chat-attachments-client';
import { ManagedCloudResumableUploadError } from '../managed-cloud-resumable-upload-client';

describe('createManagedCloudChatAttachmentsClient', () => {
  it('accepts a HTTP upload proxy only on the exact configured loopback origin', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          storageKey: 'owned/fixture.txt',
          uploadUrl: 'http://localhost:3000/api/uploads/chat-attachment/put',
          uploadMethod: 'PUT',
          uploadHeaders: {},
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          attachment: {
            id: '00000000-0000-4000-8000-000000000001',
            name: 'fixture.txt',
            mimeType: 'text/plain',
            byteCount: 1,
            type: 'file',
            url: '/api/files/00000000-0000-4000-8000-000000000001',
          },
        }),
      );
    const uploadFetchImpl = vi.fn(async () => Response.json({ success: true }));
    const client = createManagedCloudChatAttachmentsClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
      uploadFetchImpl,
    });
    await expect(
      client.upload([new File(['x'], 'fixture.txt', { type: 'text/plain' })]),
    ).resolves.toHaveLength(1);
    expect(uploadFetchImpl).toHaveBeenCalledOnce();
  });

  describe('a direct storage upload that carries required headers', () => {
    const ENCRYPTION_HEADERS = {
      'x-amz-server-side-encryption': 'aws:kms',
      'x-amz-server-side-encryption-aws-kms-key-id': 'key-id',
    };
    const SIGNED_URL =
      'https://storage.example.test/object?X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost%3Bx-amz-server-side-encryption%3Bx-amz-server-side-encryption-aws-kms-key-id';
    const ATTACHMENT = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'fixture.txt',
      mimeType: 'text/plain',
      byteCount: 1,
      type: 'file',
      url: '/api/files/00000000-0000-4000-8000-000000000001',
    };

    function presignResponse(uploadHeaders: Record<string, string>) {
      return Response.json({
        storageKey: 'owned/fixture.txt',
        uploadUrl: SIGNED_URL,
        uploadMethod: 'PUT',
        uploadHeaders,
      });
    }

    it('sends every header the server returned, encryption included', async () => {
      const uploadHeaders = { 'Content-Type': 'text/plain', ...ENCRYPTION_HEADERS };
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(presignResponse(uploadHeaders))
        .mockResolvedValueOnce(Response.json({ attachment: ATTACHMENT }));
      const uploadFetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
      const client = createManagedCloudChatAttachmentsClient({ fetchImpl, uploadFetchImpl });

      await client.upload([new File(['x'], 'fixture.txt', { type: 'text/plain' })]);

      const sent = new Headers(
        (uploadFetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
      );
      expect(Object.fromEntries(sent.entries())).toEqual({
        'content-type': 'text/plain',
        'x-amz-server-side-encryption': 'aws:kms',
        'x-amz-server-side-encryption-aws-kms-key-id': 'key-id',
      });
    });

    it('refuses to send an upload that omits a header the url was signed with', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(presignResponse({ 'Content-Type': 'text/plain' }));
      const uploadFetchImpl = vi.fn();
      const client = createManagedCloudChatAttachmentsClient({ fetchImpl, uploadFetchImpl });

      await expect(
        client.upload([new File(['x'], 'fixture.txt', { type: 'text/plain' })]),
      ).rejects.toThrow('x-amz-server-side-encryption');
      expect(uploadFetchImpl).not.toHaveBeenCalled();
    });
  });

  it('authenticates a configured API relay PUT using fresh account headers', async () => {
    let credential = 0;
    const getHeaders = vi.fn(async () => ({
      Authorization: `Bearer account-${++credential}`,
      'Content-Type': 'application/json',
    }));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          storageKey: 'owned/fixture.txt',
          uploadUrl: 'http://localhost:3000/api/uploads/chat-attachment/put?token=fixture',
          uploadMethod: 'PUT',
          uploadHeaders: { 'Content-Type': 'text/plain' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          attachment: {
            id: '00000000-0000-4000-8000-000000000001',
            name: 'fixture.txt',
            mimeType: 'text/plain',
            byteCount: 1,
            type: 'file',
            url: '/api/files/00000000-0000-4000-8000-000000000001',
          },
        }),
      );
    const uploadFetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Headers(init?.headers).get('Authorization') === 'Bearer account-2'
        ? Response.json({ success: true })
        : Response.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const client = createManagedCloudChatAttachmentsClient({
      baseUrl: 'http://localhost:3000',
      getHeaders,
      fetchImpl,
      uploadFetchImpl,
    });
    await expect(
      client.upload([new File(['x'], 'fixture.txt', { type: 'text/plain' })]),
    ).resolves.toHaveLength(1);
    const init = uploadFetchImpl.mock.calls[0]![1]!;
    expect(init).toMatchObject({ credentials: 'include', redirect: 'error' });
    expect(new Headers(init.headers).get('Content-Type')).toBe('text/plain');
    expect(getHeaders).toHaveBeenCalledTimes(3);
  });

  it('stops before the PUT if cancellation arrives while refreshing relay credentials', async () => {
    const controller = new AbortController();
    let calls = 0;
    const getHeaders = vi.fn(() => {
      if (++calls === 2) controller.abort();
      return { Authorization: 'Bearer account' };
    });
    const fetchImpl = vi.fn(async () =>
      Response.json({
        storageKey: 'owned/fixture.txt',
        uploadUrl: 'http://localhost:3000/api/uploads/chat-attachment/put?token=fixture',
        uploadMethod: 'PUT',
        uploadHeaders: { 'Content-Type': 'text/plain' },
      }),
    );
    const uploadFetchImpl = vi.fn();
    const client = createManagedCloudChatAttachmentsClient({
      baseUrl: 'http://localhost:3000',
      getHeaders,
      fetchImpl,
      uploadFetchImpl,
    });
    await expect(
      client.upload([new File(['x'], 'fixture.txt', { type: 'text/plain' })], {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(uploadFetchImpl).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    ['http://localhost:3000', 'http://localhost:3001/private'],
    ['http://localhost:3000', 'http://127.0.0.1:3000/private'],
    ['http://localhost:3000', 'http://localhost.untrusted.example:3000/private'],
    ['http://localhost:3000', 'http://user:password@localhost:3000/private'],
    ['http://remote.example', 'http://remote.example/private'],
  ])('refuses an insecure upload outside %s at %s', async (baseUrl, uploadUrl) => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        storageKey: 'owned/fixture.txt',
        uploadUrl,
        uploadMethod: 'PUT',
        uploadHeaders: {},
      }),
    );
    const uploadFetchImpl = vi.fn();
    const client = createManagedCloudChatAttachmentsClient({ baseUrl, fetchImpl, uploadFetchImpl });
    await expect(
      client.upload([new File(['x'], 'fixture.txt', { type: 'text/plain' })]),
    ).rejects.toThrow('insecure upload');
    expect(uploadFetchImpl).not.toHaveBeenCalled();
  });

  it('propagates cancellation through the presign request and stops before storage upload', async () => {
    const controller = new AbortController();
    let capturedSignal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      });
    });
    const uploadFetchImpl = vi.fn();
    const client = createManagedCloudChatAttachmentsClient({
      baseUrl: 'https://cloud.example',
      getHeaders: () => ({ Authorization: 'Bearer test' }),
      fetchImpl,
      uploadFetchImpl,
    });

    const upload = client.upload([new File(['hello'], 'note.txt', { type: 'text/plain' })], {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    controller.abort();

    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    expect(capturedSignal).toBe(controller.signal);
    expect(uploadFetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an already-aborted upload before requesting credentials or egress', async () => {
    const controller = new AbortController();
    controller.abort();
    const getHeaders = vi.fn();
    const fetchImpl = vi.fn();
    const client = createManagedCloudChatAttachmentsClient({
      baseUrl: 'https://cloud.example',
      getHeaders,
      fetchImpl,
    });

    await expect(
      client.upload([new File(['hello'], 'note.txt', { type: 'text/plain' })], {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(getHeaders).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses files over the per-message total before any request, naming that total', async () => {
    const fetchImpl = vi.fn();
    const client = createManagedCloudChatAttachmentsClient({
      baseUrl: 'https://cloud.example',
      fetchImpl,
    });
    const half = Math.floor(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES / 2) + 1;
    const files = ['first.pdf', 'second.pdf'].map(
      (name) => new File([new Uint8Array(half)], name, { type: 'application/pdf' }),
    );

    await expect(client.upload(files)).rejects.toThrow(
      `Chat attachments are limited to ${chatAttachmentSizeLabel(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES)} total per message.`,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('attachment upload failure status', () => {
  async function failedStatus(completion: Response) {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          storageKey: 'owned/fixture.txt',
          uploadUrl: 'http://localhost:3000/api/uploads/chat-attachment/put',
          uploadMethod: 'PUT',
          uploadHeaders: {},
        }),
      )
      .mockResolvedValueOnce(completion);
    const statuses: Array<{ phase: string; retryable?: boolean; error?: string }> = [];
    const client = createManagedCloudChatAttachmentsClient({
      baseUrl: 'http://localhost:3000',
      fetchImpl,
      uploadFetchImpl: vi.fn(async () => Response.json({ success: true })),
    });
    await expect(
      client.upload([new File(['x'], 'fixture.txt', { type: 'text/plain' })], {
        onStatus: (status) => statuses.push(status),
      }),
    ).rejects.toThrow();
    return statuses.find((status) => status.phase === 'failed');
  }

  it('marks a content refusal as not retryable and keeps the server reason', async () => {
    const failed = await failedStatus(
      Response.json(
        {
          error: {
            message: 'This file could not be attached because its contents failed a safety check.',
          },
        },
        { status: 400 },
      ),
    );

    expect(failed?.retryable).toBe(false);
    expect(failed?.error).toMatch(/safety check/);
  });

  it('marks a server error as retryable', async () => {
    const failed = await failedStatus(Response.json({ error: 'busy' }, { status: 503 }));

    expect(failed?.retryable).toBe(true);
  });
});

describe('which attachment upload failures offer a manual retry', () => {
  const interrupted = (status: number) =>
    new ManagedCloudResumableUploadError('The upload was interrupted.', status);

  it('offers it after the network failed on every automatic attempt of a part', () => {
    expect(isRetryableAttachmentUploadError(interrupted(0))).toBe(true);
  });

  it('offers it for a busy or throttled server, and for a single-part network failure', () => {
    for (const status of [408, 425, 429, 500, 503]) {
      expect(isRetryableAttachmentUploadError(interrupted(status)), String(status)).toBe(true);
      expect(
        isRetryableAttachmentUploadError(new ManagedCloudChatAttachmentHttpError('busy', status)),
        String(status),
      ).toBe(true);
    }
    expect(isRetryableAttachmentUploadError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('withholds it from a refusal and from anything that is not an upload failure', () => {
    for (const status of [400, 401, 403, 404, 413]) {
      expect(isRetryableAttachmentUploadError(interrupted(status)), String(status)).toBe(false);
      expect(
        isRetryableAttachmentUploadError(new ManagedCloudChatAttachmentHttpError('no', status)),
        String(status),
      ).toBe(false);
    }
    expect(isRetryableAttachmentUploadError(new DOMException('stopped', 'AbortError'))).toBe(false);
    expect(isRetryableAttachmentUploadError(new Error('other'))).toBe(false);
  });
});

describe('chatAttachmentSizeLabel', () => {
  it('names a byte count in mebibytes', () => {
    expect(chatAttachmentSizeLabel(12 * 1024 * 1024)).toBe('12 MiB');
    expect(chatAttachmentSizeLabel(2.5 * 1024 * 1024)).toBe('2.5 MiB');
  });
});
