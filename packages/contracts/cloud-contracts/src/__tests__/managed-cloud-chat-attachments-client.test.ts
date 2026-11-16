import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '@agiworkforce/types';
import {
  CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE,
  CHAT_LARGE_FILE_POLICY,
  MANAGED_CLOUD_CHAT_ATTACHMENT_COMPLETE_PATH,
  MANAGED_CLOUD_CHAT_ATTACHMENT_PRESIGN_PATH,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  chatAttachmentLimitsFromWire,
  chatAttachmentSizeLabel,
  chatLargeFileKindMaxBytes,
  type ChatAttachmentLimits,
} from '../chat-attachments';
import { managedCloudChatFileIntakePath } from '../chat-file-intake';
import {
  ManagedCloudChatAttachmentHttpError,
  createManagedCloudChatAttachmentsClient,
  isRetryableAttachmentUploadError,
  type IncrementalSha256,
  type ManagedCloudChatAttachmentUploadStatus,
} from '../managed-cloud-chat-attachments-client';
import {
  ManagedCloudResumableUploadError,
  RESUMABLE_UPLOAD_INTAKE_STATUS_UNREADABLE,
} from '../managed-cloud-resumable-upload-client';
import {
  CHAT_LARGE_FILE_UPLOAD_KIND,
  MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
  RESUMABLE_UPLOAD_PART_BYTES,
  managedCloudResumableUploadPartsPath,
  managedCloudResumableUploadPath,
} from '../resumable-uploads';

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

  it('refuses an image one byte over the image ceiling before any request, as not retryable', async () => {
    const fetchImpl = vi.fn();
    const onStatus = vi.fn();
    const client = createManagedCloudChatAttachmentsClient({
      baseUrl: 'https://cloud.example',
      fetchImpl,
    });
    const image = new File([new Uint8Array(MAX_CHAT_IMAGE_ATTACHMENT_BYTES + 1)], 'photo.png', {
      type: 'image/png',
    });

    await expect(client.upload([image], { onStatus })).rejects.toThrow(
      CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'failed', retryable: false }),
    );
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

describe('chat attachment uploads and the large file option', () => {
  const MIB = 1024 * 1024;
  const INTAKE_ID = '00000000-0000-4000-8000-0000000000aa';
  const STORAGE = 'https://storage.example.test';
  const offeringLimits: ChatAttachmentLimits = chatAttachmentLimitsFromWire({
    max_file_bytes: CHAT_LARGE_FILE_POLICY.largeFiles.maxBytes,
    max_image_bytes: MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
    max_message_bytes: CHAT_LARGE_FILE_POLICY.largeFiles.maxMessageBytes,
    max_files_per_message: CHAT_LARGE_FILE_POLICY.largeFiles.maxCount,
    large_files_available: true,
    storage_remaining_bytes: null,
    inline_message_bytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  });

  interface Call {
    method: string;
    url: string;
    body?: unknown;
  }

  function attachmentFor(name: string, byteCount: number, index = 1) {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    return { id, name, mimeType: 'text/plain', byteCount, type: 'file', url: `/api/files/${id}` };
  }

  function sizedFile(name: string, type: string, size: number): File {
    return { name, type, size, slice: () => new Blob([]) } as unknown as File;
  }

  function server(
    options: { intakeStatuses?: unknown[]; create?: () => Response; partBytes?: number } = {},
  ) {
    const calls: Call[] = [];
    const statuses = [...(options.intakeStatuses ?? [])];
    let created: { fileName: string; byteCount: number } | null = null;
    let presigned = 0;
    const record = (method: string, url: string, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      calls.push({ method, url, ...(body === undefined ? {} : { body }) });
      return body;
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = record(method, url, init) as Record<string, unknown> | undefined;
      if (url === MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH) {
        if (options.create) return options.create();
        created = { fileName: String(body?.['fileName']), byteCount: Number(body?.['byteCount']) };
        const partBytes = options.partBytes ?? RESUMABLE_UPLOAD_PART_BYTES;
        return Response.json({
          uploadId: 'upload-1',
          session: 'session-1',
          partBytes,
          partCount: Math.ceil(created.byteCount / partBytes),
          expiresAt: '2099-01-01T00:00:00Z',
        });
      }
      if (url === managedCloudResumableUploadPartsPath('upload-1')) {
        const { partNumbers } = body as unknown as { partNumbers: number[] };
        return Response.json({
          parts: partNumbers.map((partNumber) => ({
            partNumber,
            url: `${STORAGE}/part/${partNumber}`,
            method: 'PUT',
            headers: {},
          })),
        });
      }
      if (url === managedCloudResumableUploadPath('upload-1')) {
        if (created && created.byteCount > MAX_CHAT_ATTACHMENT_BYTES) {
          return Response.json(
            { kind: 'chat-attachment-intake', intake: { id: INTAKE_ID, state: 'checking' } },
            { status: 202 },
          );
        }
        return Response.json({
          kind: 'chat-attachment',
          attachment: attachmentFor(created?.fileName ?? '', created?.byteCount ?? 0),
        });
      }
      if (url === managedCloudChatFileIntakePath(INTAKE_ID)) {
        if (method === 'DELETE') return new Response(null, { status: 204 });
        return Response.json(statuses.length > 1 ? statuses.shift() : statuses[0]);
      }
      if (url === MANAGED_CLOUD_CHAT_ATTACHMENT_PRESIGN_PATH) {
        presigned += 1;
        return Response.json({
          storageKey: `owned/${presigned}`,
          uploadUrl: `${STORAGE}/object/${presigned}`,
          uploadMethod: 'PUT',
          uploadHeaders: {},
        });
      }
      if (url === MANAGED_CLOUD_CHAT_ATTACHMENT_COMPLETE_PATH) {
        return Response.json({
          attachment: attachmentFor(
            String(body?.['fileName']),
            Number(body?.['byteCount']),
            presigned,
          ),
        });
      }
      return Response.json({ error: 'unexpected' }, { status: 500 });
    });
    const uploadFetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      record(init?.method ?? 'GET', String(input));
      return new Response(null, { status: 200 });
    });
    return { calls, fetchImpl, uploadFetchImpl };
  }

  function nodeSha256(): IncrementalSha256 {
    const hash = createHash('sha256');
    return {
      update: (bytes) => hash.update(bytes),
      digest: () => new Uint8Array(hash.digest()),
    };
  }

  function clientFor(
    fixture: ReturnType<typeof server>,
    limits?: ChatAttachmentLimits,
    createSha256: (() => IncrementalSha256) | null = nodeSha256,
  ) {
    return createManagedCloudChatAttachmentsClient({
      fetchImpl: fixture.fetchImpl,
      uploadFetchImpl: fixture.uploadFetchImpl,
      sessions: null,
      sleep: async () => undefined,
      visibility: null,
      ...(limits ? { limits } : {}),
      ...(createSha256 ? { createSha256 } : {}),
    });
  }

  function sha256Hex(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  describe('without the option', () => {
    const fiveMib = new Uint8Array(5 * MIB).fill(7);

    it.each([
      ['a server that predates large files', undefined],
      ['a handshake that offers large files', offeringLimits],
    ])(
      'sends a 5 MiB file with the request sequence of today, against %s',
      async (_label, limits) => {
        const fixture = server();

        await expect(
          clientFor(fixture, limits).upload([
            new File([fiveMib], 'notes.txt', { type: 'text/plain' }),
          ]),
        ).resolves.toEqual([attachmentFor('notes.txt', fiveMib.byteLength)]);

        expect(fixture.calls).toEqual([
          {
            method: 'POST',
            url: MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
            body: {
              kind: 'chat-attachment',
              fileName: 'notes.txt',
              mimeType: 'text/plain',
              byteCount: fiveMib.byteLength,
              checksumSha256: sha256Hex(fiveMib),
            },
          },
          {
            method: 'POST',
            url: managedCloudResumableUploadPartsPath('upload-1'),
            body: { session: 'session-1', partNumbers: [1] },
          },
          { method: 'PUT', url: `${STORAGE}/part/1` },
          {
            method: 'POST',
            url: managedCloudResumableUploadPath('upload-1'),
            body: { session: 'session-1' },
          },
        ]);
      },
    );

    it.each([
      ['a server that predates large files', undefined],
      ['a handshake that offers large files', offeringLimits],
    ])(
      'refuses a 30 MiB file with the copy of today and no request, against %s',
      async (_label, limits) => {
        const fixture = server();

        await expect(
          clientFor(fixture, limits).upload([sizedFile('report.pdf', 'application/pdf', 30 * MIB)]),
        ).rejects.toThrow(
          `Chat attachments are limited to ${chatAttachmentSizeLabel(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES)} total per message.`,
        );
        expect(fixture.calls).toEqual([]);
      },
    );

    it('never raises the count above the compiled one, and lowers it to the limits it is given', async () => {
      const fixture = server();
      const tiny = (count: number) =>
        Array.from(
          { length: count },
          (_, index) => new File(['x'], `f${index}.txt`, { type: 'text/plain' }),
        );

      await expect(
        clientFor(fixture, offeringLimits).upload(tiny(MAX_CHAT_ATTACHMENT_COUNT + 1)),
      ).rejects.toThrow(`Attach at most ${MAX_CHAT_ATTACHMENT_COUNT} files per message.`);
      await expect(
        clientFor(fixture, { ...offeringLimits, maxFilesPerMessage: 2 }).upload(tiny(3)),
      ).rejects.toThrow('Attach at most 2 files per message.');
      await expect(
        clientFor(fixture, { ...offeringLimits, maxMessageBytes: 2 }).upload(tiny(3)),
      ).rejects.toThrow(
        `Chat attachments are limited to ${chatAttachmentSizeLabel(2)} total per message.`,
      );
      expect(fixture.calls).toEqual([]);
    });

    it('keeps the compiled ceilings when a given limit is not a usable number', async () => {
      const fixture = server();
      const tiny = (count: number) =>
        Array.from(
          { length: count },
          (_, index) => new File(['x'], `f${index}.txt`, { type: 'text/plain' }),
        );

      for (const unusable of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
        const limits = {
          ...offeringLimits,
          maxFilesPerMessage: unusable,
          maxMessageBytes: unusable,
        };
        await expect(
          clientFor(fixture, limits).upload(tiny(MAX_CHAT_ATTACHMENT_COUNT + 1)),
        ).rejects.toThrow(`Attach at most ${MAX_CHAT_ATTACHMENT_COUNT} files per message.`);
        await expect(
          clientFor(fixture, limits).upload([sizedFile('report.pdf', 'application/pdf', 30 * MIB)]),
        ).rejects.toThrow(
          `Chat attachments are limited to ${chatAttachmentSizeLabel(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES)} total per message.`,
        );
      }
      expect(fixture.calls).toEqual([]);
    });
  });

  describe('with the option', () => {
    const largeBytes = new Uint8Array(MAX_CHAT_ATTACHMENT_BYTES + 1);
    for (let index = 0; index < largeBytes.length; index += 4099) largeBytes[index] = index % 251;
    const ready = {
      intake: {
        id: INTAKE_ID,
        state: 'ready',
        attachment: attachmentFor('large.txt', largeBytes.byteLength, 9),
      },
    };
    const checking = { intake: { id: INTAKE_ID, state: 'checking' } };

    it('creates a file over the inline limit as a large file and resolves once it is sealed', async () => {
      const fixture = server({ intakeStatuses: [checking, ready] });
      const statuses: ManagedCloudChatAttachmentUploadStatus[] = [];

      await expect(
        clientFor(fixture).upload([new File([largeBytes], 'large.txt', { type: 'text/plain' })], {
          largeFiles: true,
          conversationId: 'conversation-1',
          temporary: true,
          onStatus: (status) => statuses.push(status),
        }),
      ).resolves.toEqual([ready.intake.attachment]);

      expect(fixture.calls[0]).toEqual({
        method: 'POST',
        url: MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
        body: {
          kind: CHAT_LARGE_FILE_UPLOAD_KIND,
          fileName: 'large.txt',
          mimeType: 'text/plain',
          byteCount: largeBytes.byteLength,
          checksumSha256: sha256Hex(largeBytes),
          conversationId: 'conversation-1',
          temporary: true,
        },
      });
      expect(fixture.calls.filter((call) => call.method === 'PUT')).toHaveLength(
        Math.ceil(largeBytes.byteLength / RESUMABLE_UPLOAD_PART_BYTES),
      );
      expect(
        fixture.calls.find((call) => call.url === managedCloudResumableUploadPath('upload-1')),
      ).toEqual({
        method: 'POST',
        url: managedCloudResumableUploadPath('upload-1'),
        body: { session: 'session-1' },
      });
      expect(
        fixture.calls.filter((call) => call.url === managedCloudChatFileIntakePath(INTAKE_ID)),
      ).toHaveLength(2);
      expect(statuses.map((status) => status.phase)).toEqual([
        'preparing',
        'uploading',
        'verifying',
        'complete',
      ]);
    });

    it('keeps a small file on the path of today', async () => {
      const fixture = server();

      await clientFor(fixture).upload([new File(['x'], 'small.txt', { type: 'text/plain' })], {
        largeFiles: true,
      });

      expect(fixture.calls.map((call) => call.url)).toEqual([
        MANAGED_CLOUD_CHAT_ATTACHMENT_PRESIGN_PATH,
        `${STORAGE}/object/1`,
        MANAGED_CLOUD_CHAT_ATTACHMENT_COMPLETE_PATH,
      ]);
    });

    it('keeps a file of exactly the inline limit on the path of today', async () => {
      const fixture = server();
      const atLimit = new Uint8Array(MAX_CHAT_ATTACHMENT_BYTES).fill(3);

      await expect(
        clientFor(fixture).upload([new File([atLimit], 'edge.txt', { type: 'text/plain' })], {
          largeFiles: true,
        }),
      ).resolves.toEqual([attachmentFor('edge.txt', atLimit.byteLength)]);

      expect(fixture.calls[0]).toEqual({
        method: 'POST',
        url: MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
        body: {
          kind: 'chat-attachment',
          fileName: 'edge.txt',
          mimeType: 'text/plain',
          byteCount: atLimit.byteLength,
          checksumSha256: sha256Hex(atLimit),
        },
      });
      expect(
        fixture.calls.some((call) => call.url === managedCloudChatFileIntakePath(INTAKE_ID)),
      ).toBe(false);
    });

    it('refuses a file over the inline limit before any request when no hasher is set up', async () => {
      const fixture = server();
      const statuses: ManagedCloudChatAttachmentUploadStatus[] = [];

      const error: unknown = await clientFor(fixture, undefined, null)
        .upload(
          [
            new File(['x'], 'small.txt', { type: 'text/plain' }),
            new File([largeBytes], 'large.txt', { type: 'text/plain' }),
          ],
          { largeFiles: true, onStatus: (status) => statuses.push(status) },
        )
        .catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        `large.txt is larger than ${chatAttachmentSizeLabel(MAX_CHAT_ATTACHMENT_BYTES)}, and this app cannot upload a file that large.`,
      );
      expect(isRetryableAttachmentUploadError(error)).toBe(false);
      expect(fixture.calls).toEqual([]);
      expect(statuses).toEqual([]);

      const smallOnly = server();
      await expect(
        clientFor(smallOnly, undefined, null).upload(
          [new File(['x'], 'small.txt', { type: 'text/plain' })],
          { largeFiles: true },
        ),
      ).resolves.toHaveLength(1);
    });

    it('keeps the compiled inline budget and kind cap when a given limit is not a usable number', async () => {
      const fixture = server();
      const limits = {
        ...offeringLimits,
        inlineMessageBytes: Number.NaN,
        maxFileBytes: Number.NaN,
      };
      const htmlCap = chatLargeFileKindMaxBytes('page.html', 'text/html') ?? 0;

      await expect(
        clientFor(fixture, limits).upload(
          ['a.png', 'b.png', 'c.png'].map((name) => sizedFile(name, 'image/png', 10 * MIB)),
          { largeFiles: true },
        ),
      ).rejects.toThrow(
        `Chat attachments are limited to ${chatAttachmentSizeLabel(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES)} total per message.`,
      );
      await expect(
        clientFor(fixture, limits).upload([sizedFile('page.html', 'text/html', htmlCap + 1)], {
          largeFiles: true,
        }),
      ).rejects.toThrow(
        `"page.html" is larger than the ${htmlCap / MIB} MB chat attachment limit.`,
      );
      expect(fixture.calls).toEqual([]);
    });

    it('refuses a file over its kind cap before any request', async () => {
      const fixture = server();
      const htmlCap = chatLargeFileKindMaxBytes('page.html', 'text/html') ?? 0;
      expect(htmlCap).toBeGreaterThan(MAX_CHAT_ATTACHMENT_BYTES);

      await expect(
        clientFor(fixture).upload([sizedFile('page.html', 'text/html', htmlCap + 1)], {
          largeFiles: true,
        }),
      ).rejects.toThrow(
        `"page.html" is larger than the ${htmlCap / MIB} MB chat attachment limit.`,
      );
      await expect(
        clientFor(fixture).upload(
          [sizedFile('photo.png', 'image/png', MAX_CHAT_ATTACHMENT_BYTES + 1)],
          {
            largeFiles: true,
          },
        ),
      ).rejects.toThrow(CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE);
      await expect(
        clientFor(fixture, { ...offeringLimits, maxFileBytes: 30 * MIB }).upload(
          [sizedFile('notes.txt', 'text/plain', 30 * MIB + 1)],
          { largeFiles: true },
        ),
      ).rejects.toThrow('"notes.txt" is larger than the 30 MB chat attachment limit.');
      expect(fixture.calls).toEqual([]);
    });

    it('passes the large count and refuses one more', async () => {
      const { maxCount } = CHAT_LARGE_FILE_POLICY.largeFiles;
      const tiny = (count: number) =>
        Array.from(
          { length: count },
          (_, index) => new File(['x'], `f${index}.txt`, { type: 'text/plain' }),
        );
      const passing = server();

      await expect(
        clientFor(passing).upload(tiny(maxCount), { largeFiles: true }),
      ).resolves.toHaveLength(maxCount);

      const refusing = server();
      await expect(
        clientFor(refusing).upload(tiny(maxCount + 1), { largeFiles: true }),
      ).rejects.toThrow(`Attach at most ${maxCount} files per message.`);
      expect(refusing.calls).toEqual([]);
    });

    it('refuses three 10 MiB files with the message-size copy of today', async () => {
      const fixture = server();
      const files = ['a.png', 'b.png', 'c.png'].map((name) =>
        sizedFile(name, 'image/png', 10 * MIB),
      );

      await expect(clientFor(fixture).upload(files, { largeFiles: true })).rejects.toThrow(
        `Chat attachments are limited to ${chatAttachmentSizeLabel(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES)} total per message.`,
      );
      expect(fixture.calls).toEqual([]);
    });

    it('holds the total to the large ceiling, lowered by the limits it is given', async () => {
      const fixture = server();
      const files = ['a.txt', 'b.txt'].map((name) => sizedFile(name, 'text/plain', 30 * MIB));

      await expect(
        clientFor(fixture, { ...offeringLimits, maxMessageBytes: 50 * MIB }).upload(files, {
          largeFiles: true,
        }),
      ).rejects.toThrow(
        `Chat attachments are limited to ${chatAttachmentSizeLabel(50 * MIB)} total per message.`,
      );
      expect(fixture.calls).toEqual([]);
    });

    it('reports an unreadable intake status as a failure a retry cannot fix', async () => {
      const fixture = server({
        intakeStatuses: [{ intake: { id: INTAKE_ID, state: 'quarantined' } }],
      });
      const statuses: ManagedCloudChatAttachmentUploadStatus[] = [];

      const error: unknown = await clientFor(fixture)
        .upload([new File([largeBytes], 'large.txt', { type: 'text/plain' })], {
          largeFiles: true,
          onStatus: (status) => statuses.push(status),
        })
        .catch((reason: unknown) => reason);

      expect(error).toMatchObject({ code: RESUMABLE_UPLOAD_INTAKE_STATUS_UNREADABLE });
      expect(isRetryableAttachmentUploadError(error)).toBe(false);
      expect(statuses[statuses.length - 1]).toMatchObject({
        phase: 'failed',
        error: 'Could not verify large.txt.',
        retryable: false,
      });
      expect(
        fixture.calls.filter((call) => call.url === managedCloudChatFileIntakePath(INTAKE_ID)),
      ).toHaveLength(1);
    });

    it('never sends a large file through the single-request path when parts are unavailable', async () => {
      const fixture = server({
        create: () =>
          Response.json(
            {
              error: {
                code: ErrorCode.CAPABILITY_UNAVAILABLE,
                message: 'Uploads in parts are off.',
              },
            },
            { status: 503 },
          ),
      });

      await expect(
        clientFor(fixture).upload([new File([largeBytes], 'large.txt', { type: 'text/plain' })], {
          largeFiles: true,
        }),
      ).rejects.toBeInstanceOf(ManagedCloudResumableUploadError);
      expect(fixture.calls.map((call) => call.url)).toEqual([MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH]);
    });
  });
});
