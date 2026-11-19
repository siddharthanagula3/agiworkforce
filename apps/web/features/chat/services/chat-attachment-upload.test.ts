import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_FILE_INTAKE_STATUS_READ_ATTEMPTS,
  CHAT_LARGE_FILE_POLICY,
  CHAT_LARGE_FILE_UPLOAD_KIND,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  type ChatAttachmentLimits,
} from '@agiworkforce/cloud-contracts';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { useBillingStore } from '@/shared/stores/web-auth-store';
import { uploadChatAttachments, type KeptAfterCancel } from './chat-attachment-upload';
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

const MIB = 1024 * 1024;
const LARGE_FILE_BYTES = MAX_CHAT_ATTACHMENT_BYTES + 1;
const PART_BYTES = 16 * MIB;
const STORAGE_ORIGIN = 'https://storage.example.test';
const ASSET_ID = '7a5d0c1e-2b3f-4c4d-8e5f-6a7b8c9d0e1f';
const SMALL_ASSET_ID = '7a5d0c1e-2b3f-4c4d-8e5f-6a7b8c9d0e20';

const OFFER: ChatAttachmentLimits = {
  maxFileBytes: CHAT_LARGE_FILE_POLICY.largeFiles.maxBytes,
  maxImageBytes: MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  maxMessageBytes: CHAT_LARGE_FILE_POLICY.largeFiles.maxMessageBytes,
  maxFilesPerMessage: CHAT_LARGE_FILE_POLICY.largeFiles.maxCount,
  largeFilesAvailable: true,
  storageRemainingBytes: null,
  inlineMessageBytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
};

type IntakeAnswer =
  | { state: 'checking' }
  | { state: 'ready' }
  | { state: 'cancelled' }
  | { state: 'rejected' }
  | { state: 'failed' };

const REFUSAL = 'report.pdf was not attached because it contains malware.';
const SCAN_UNAVAILABLE = 'Could not check report.pdf. Try again.';

interface CallRecord {
  method: string;
  url: string;
  body: unknown;
}

function largePdf(name = 'report.pdf', seed = 7): File {
  const bytes = new Uint8Array(LARGE_FILE_BYTES);
  for (let index = 0; index < bytes.length; index += 997) bytes[index] = (index + seed) % 251;
  return new File([bytes], name, { type: 'application/pdf' });
}

async function sha256Of(file: File): Promise<string> {
  return createHash('sha256')
    .update(new Uint8Array(await file.arrayBuffer()))
    .digest('hex');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function intakeBody(id: string, answer: IntakeAnswer, fileName: string) {
  if (answer.state === 'ready') {
    return {
      id,
      state: 'ready',
      attachment: {
        id: ASSET_ID,
        name: fileName,
        mimeType: 'application/pdf',
        byteCount: LARGE_FILE_BYTES,
        type: 'file',
        url: `/api/files/${ASSET_ID}`,
      },
    };
  }
  if (answer.state === 'cancelled') return { id, state: 'cancelled', cancelReason: 'client' };
  if (answer.state === 'rejected') {
    return { id, state: 'rejected', refusalCode: 'malware', message: REFUSAL };
  }
  if (answer.state === 'failed') {
    return { id, state: 'failed', failureCode: 'scan_unavailable', message: SCAN_UNAVAILABLE };
  }
  return { id, state: 'checking' };
}

interface LargeFileServerOptions {
  completeAnswer?: IntakeAnswer;
  cancelAnswer?: IntakeAnswer;
  statusAnswer?: IntakeAnswer;
  statusAnswers?: IntakeAnswer[];
  sessionCancelAnswer?: unknown;
  holdComplete?: boolean;
  holdParts?: boolean;
  createDelayMs?: number;
  holdFirstCreate?: Promise<void>;
  statusHangs?: boolean;
  statusUnanswered?: number;
  mediaDeleted?: boolean;
  failPart?: number;
  storedParts?: number[];
}

function intakeIdFor(uploadId: string): string {
  return `0b1c2d3e-4f50-4a6b-8c7d-${uploadId.replace(/\D/g, '').padStart(12, '0')}`;
}

/** Answers the large file routes the way the server does, recording every request. */
function largeFileServer(options: LargeFileServerOptions = {}) {
  const calls: CallRecord[] = [];
  let creates = 0;
  let createsInFlight = 0;
  let mostCreatesInFlight = 0;
  let failPart = options.failPart;
  const fileNames = new Map<string, string>();
  const smallFiles = new Map<string, { fileName: string; mimeType: string; byteCount: number }>();
  const statusAnswers = [...(options.statusAnswers ?? [])];
  const untilCancelled = (signal: AbortSignal | null | undefined) =>
    new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener('abort', () =>
        reject(Object.assign(new Error('The request was cancelled.'), { name: 'AbortError' })),
      );
    });

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, window.location.origin);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : init.body;
    calls.push({ method, url: href, body });

    if (url.origin === STORAGE_ORIGIN) {
      if (options.holdParts) return untilCancelled(init.signal);
      const partNumber = Number(url.pathname.split('/').pop());
      if (failPart === partNumber) {
        failPart = undefined;
        return new Response(null, { status: 400 });
      }
      return new Response(null, { status: 200, headers: { ETag: `"etag-${partNumber}"` } });
    }

    const segments = url.pathname.split('/').filter(Boolean);
    if (url.pathname === '/api/files/uploads' && method === 'POST') {
      creates += 1;
      createsInFlight += 1;
      mostCreatesInFlight = Math.max(mostCreatesInFlight, createsInFlight);
      await new Promise((resolve) => setTimeout(resolve, options.createDelayMs ?? 0));
      if (creates === 1) await options.holdFirstCreate;
      createsInFlight -= 1;
      const request = body as {
        kind: string;
        byteCount: number;
        fileName: string;
        mimeType: string;
      };
      const uploadId = `upload-${creates}`;
      fileNames.set(uploadId, request.fileName);
      if (request.kind !== CHAT_LARGE_FILE_UPLOAD_KIND) smallFiles.set(uploadId, request);
      return json({
        uploadId,
        session: `signed-${creates}`,
        partBytes: PART_BYTES,
        partCount: Math.ceil(request.byteCount / PART_BYTES),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
    }
    if (segments[0] === 'api' && segments[1] === 'files' && segments[2] === 'uploads') {
      const uploadId = segments[3] ?? '';
      if (segments[4] === 'parts' && method === 'POST') {
        const { partNumbers } = body as { partNumbers: number[] };
        return json({
          parts: partNumbers.map((partNumber) => ({
            partNumber,
            url: `${STORAGE_ORIGIN}/${uploadId}/${partNumber}`,
            method: 'PUT',
            headers: {},
          })),
        });
      }
      if (method === 'GET') {
        const stored = options.storedParts ?? [];
        return json({
          uploadId,
          partBytes: PART_BYTES,
          parts: stored.map((partNumber) => ({ partNumber, size: PART_BYTES })),
          bytesStored: stored.length * PART_BYTES,
        });
      }
      if (method === 'DELETE') return json(options.sessionCancelAnswer ?? { aborted: true });
      const small = smallFiles.get(uploadId);
      if (method === 'POST' && small) {
        return json({
          kind: 'chat-attachment',
          attachment: {
            id: SMALL_ASSET_ID,
            name: small.fileName,
            mimeType: small.mimeType,
            byteCount: small.byteCount,
            type: 'file',
            url: `/api/files/${SMALL_ASSET_ID}`,
          },
        });
      }
      if (method === 'POST' && options.holdComplete) return untilCancelled(init.signal);
      if (method === 'POST') {
        return json(
          {
            kind: 'chat-attachment-intake',
            intake: intakeBody(
              intakeIdFor(uploadId),
              options.completeAnswer ?? { state: 'ready' },
              fileNames.get(uploadId) ?? 'report.pdf',
            ),
          },
          202,
        );
      }
    }
    if (segments[0] === 'api' && segments[1] === 'files' && segments[2] === 'intakes') {
      const intakeId = segments[3] ?? '';
      if (method === 'GET' && options.statusHangs) {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('The read was cancelled.'), { name: 'AbortError' })),
          );
        });
      }
      if (method === 'GET' && options.statusUnanswered) {
        return new Response(null, { status: options.statusUnanswered });
      }
      const answer =
        method === 'DELETE'
          ? (options.cancelAnswer ?? { state: 'cancelled' })
          : (statusAnswers.shift() ?? options.statusAnswer ?? { state: 'cancelled' });
      return json({ intake: intakeBody(intakeId, answer, 'report.pdf') });
    }
    if (url.pathname === '/api/media' && method === 'DELETE') {
      return json({ success: options.mediaDeleted ?? true });
    }
    return new Response(null, { status: 404 });
  });

  return {
    fetchMock,
    calls,
    creates: () => creates,
    mostCreatesInFlight: () => mostCreatesInFlight,
  };
}

function ownerAuthority(userId = 'owner-a') {
  return createRequestAuthority({
    userId,
    sessionId: `session-${userId}`,
    isCurrent: () => true,
    getToken: async () => `${userId}-token`,
  });
}

function requestLine(call: CallRecord): string {
  return `${call.method} ${call.url}`;
}

function completeSent(call: CallRecord): boolean {
  return call.method === 'POST' && call.url === '/api/files/uploads/upload-1';
}

function intakeReads(server: ReturnType<typeof largeFileServer>): string[] {
  return server.calls.filter((call) => call.url.startsWith('/api/files/intakes/')).map(requestLine);
}

async function cancelWhen(
  server: ReturnType<typeof largeFileServer>,
  reached: (call: CallRecord) => boolean,
  file: File,
  authority = ownerAuthority(),
  temporary = false,
) {
  const controller = new AbortController();
  const onKeptAfterCancel = vi.fn<(kept: readonly KeptAfterCancel[]) => void>();
  const settled = uploadChatAttachments(
    [file],
    { signal: controller.signal, onKeptAfterCancel, ...(temporary ? { temporary } : {}) },
    authority,
  ).then(
    () => null,
    (error: unknown) => error,
  );
  await vi.waitFor(() => expect(server.calls.some(reached)).toBe(true), { timeout: 10_000 });
  controller.abort();
  return { error: await settled, onKeptAfterCancel };
}

describe('uploadChatAttachments with the large file handshake', { timeout: 30_000 }, () => {
  beforeEach(() => {
    csrfMocks.getCsrfToken.mockReset().mockResolvedValue('csrf-token');
    window.localStorage.clear();
  });

  afterEach(() => {
    useBillingStore.setState({ attachmentLimits: null });
    vi.unstubAllGlobals();
  });

  it('keeps a file over the inline limit out of the network when large files were not offered', async () => {
    const server = largeFileServer();
    vi.stubGlobal('fetch', server.fetchMock);

    await expect(uploadChatAttachments([largePdf()], {}, ownerAuthority())).rejects.toThrow(
      '25 MiB',
    );
    expect(server.calls).toEqual([]);
  });

  it('refuses a file over the inline limit before any request for a caller that declines large files, with the message of today', async () => {
    const refusalWithoutOffer = largeFileServer();
    vi.stubGlobal('fetch', refusalWithoutOffer.fetchMock);
    const today = await uploadChatAttachments([largePdf()], {}, ownerAuthority()).then(
      () => null,
      (error: unknown) => (error as Error).message,
    );
    expect(today).toContain('25 MiB');

    useBillingStore.setState({ attachmentLimits: OFFER });
    const onStatus = vi.fn();
    const server = largeFileServer();
    vi.stubGlobal('fetch', server.fetchMock);

    await expect(
      uploadChatAttachments([largePdf()], { declineLargeFiles: true, onStatus }, ownerAuthority()),
    ).rejects.toThrow(today!);
    expect(server.calls).toEqual([]);
    expect(
      Object.keys(window.localStorage).filter((key) => key.includes('chat-large-file-upload')),
    ).toEqual([]);
  });

  it('refuses a file over the inline limit sent with another file, for a caller that declines large files', async () => {
    useBillingStore.setState({ attachmentLimits: OFFER });
    const server = largeFileServer();
    vi.stubGlobal('fetch', server.fetchMock);
    const small = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    await expect(
      uploadChatAttachments([small, largePdf()], { declineLargeFiles: true }, ownerAuthority()),
    ).rejects.toThrow('25 MiB');
    expect(server.calls).toEqual([]);
  });

  it('sends a file of 25 MiB or less with the requests of today for a caller that declines large files under an offering handshake', async () => {
    const run = async (
      declineLargeFiles: boolean,
      attachmentLimits: ChatAttachmentLimits | null,
    ) => {
      useBillingStore.setState({ attachmentLimits });
      const server = largeFileServer();
      vi.stubGlobal('fetch', server.fetchMock);
      const file = new File([new Uint8Array(5 * MIB).fill(65)], 'log.txt', { type: 'text/plain' });
      await uploadChatAttachments(
        [file],
        { conversationId: 'conversation-1', ...(declineLargeFiles ? { declineLargeFiles } : {}) },
        ownerAuthority(),
      );
      return server.calls.map((call) => JSON.stringify(call));
    };

    const today = await run(false, null);
    expect(today.length).toBeGreaterThan(0);
    expect(await run(true, OFFER)).toEqual(today);
  });

  it.each([
    ['no handshake', null],
    ['a handshake without the offer', { ...OFFER, largeFilesAvailable: false }],
    ['an offering handshake', OFFER],
  ] as const)(
    'sends a file of 25 MiB or less with exactly the requests of today under %s',
    async (_label, limits) => {
      const run = async (attachmentLimits: ChatAttachmentLimits | null) => {
        useBillingStore.setState({ attachmentLimits });
        const id = '32b71cf4-c0d1-4cc7-b6c4-776ece82f139';
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(
            json({
              storageKey: 'chat-attachments/user/key.txt',
              uploadUrl: 'https://upload.example.test/signed',
              uploadMethod: 'PUT',
              uploadHeaders: { 'Content-Type': 'text/plain' },
            }),
          )
          .mockResolvedValueOnce(new Response(null, { status: 200 }))
          .mockResolvedValueOnce(
            json({
              attachment: {
                id,
                name: 'notes.txt',
                mimeType: 'text/plain',
                byteCount: 5,
                type: 'file',
                url: `/api/files/${id}`,
              },
            }),
          );
        vi.stubGlobal('fetch', fetchMock);
        const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
        await uploadChatAttachments(
          [file],
          { conversationId: 'conversation-1', temporary: false },
          ownerAuthority(),
        );
        return fetchMock.mock.calls.map(([url, init]) => {
          const request = init as RequestInit;
          return [
            url,
            request.method,
            typeof request.body === 'string' ? request.body : 'file body',
            Object.fromEntries(new Headers(request.headers).entries()),
            request.credentials,
          ];
        });
      };

      const today = await run(null);
      expect(await run(limits)).toEqual(today);
    },
  );

  it('sends a file of 25 MiB or less that goes in parts with the requests of today beside a large file', async () => {
    const small = new File([new Uint8Array(6 * MIB).fill(65)], 'log.txt', { type: 'text/plain' });
    const normalized = (calls: CallRecord[]) =>
      calls.map((call) =>
        JSON.stringify(call)
          .replace(/upload-\d+/g, 'upload')
          .replace(/signed-\d+/g, 'signed'),
      );

    const today = largeFileServer();
    vi.stubGlobal('fetch', today.fetchMock);
    await uploadChatAttachments([small], {}, ownerAuthority());

    useBillingStore.setState({ attachmentLimits: OFFER });
    const offered = largeFileServer();
    vi.stubGlobal('fetch', offered.fetchMock);
    await expect(
      uploadChatAttachments([largePdf(), small], {}, ownerAuthority()),
    ).resolves.toHaveLength(2);

    const smallFileCalls = offered.calls.filter((call) => call.url.includes('upload-2'));
    const smallFileCreate = offered.calls.filter(
      (call) =>
        call.url === '/api/files/uploads' &&
        (call.body as { kind?: string }).kind === 'chat-attachment',
    );
    expect(normalized([...smallFileCreate, ...smallFileCalls])).toEqual(normalized(today.calls));
    expect(
      Object.keys(window.localStorage).filter((key) => key.includes('chat-attachment:')),
    ).toEqual([]);
  });

  it('uploads a file over the inline limit as a large chat file once the handshake offers it', async () => {
    useBillingStore.setState({ attachmentLimits: OFFER });
    const server = largeFileServer();
    vi.stubGlobal('fetch', server.fetchMock);
    const file = largePdf();
    const onStatus = vi.fn();

    await expect(
      uploadChatAttachments(
        [file],
        { conversationId: 'conversation-1', temporary: true, onStatus },
        ownerAuthority(),
      ),
    ).resolves.toEqual([
      expect.objectContaining({ assetId: ASSET_ID, name: 'report.pdf', size: LARGE_FILE_BYTES }),
    ]);

    const create = server.calls.find(
      (call) => call.method === 'POST' && call.url === '/api/files/uploads',
    );
    expect(create?.body).toEqual({
      kind: CHAT_LARGE_FILE_UPLOAD_KIND,
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      byteCount: LARGE_FILE_BYTES,
      checksumSha256: await sha256Of(file),
      conversationId: 'conversation-1',
      temporary: true,
    });
    expect(server.calls.filter((call) => call.method === 'PUT').map(requestLine)).toEqual([
      `PUT ${STORAGE_ORIGIN}/upload-1/1`,
      `PUT ${STORAGE_ORIGIN}/upload-1/2`,
    ]);
    expect(onStatus.mock.calls.map(([status]) => status.phase)).toEqual([
      'preparing',
      'uploading',
      'verifying',
      'complete',
    ]);
  });

  it('never has two large file creates open at once', async () => {
    useBillingStore.setState({ attachmentLimits: OFFER });
    const server = largeFileServer({ createDelayMs: 300 });
    vi.stubGlobal('fetch', server.fetchMock);

    await Promise.all([
      uploadChatAttachments([largePdf('first.pdf', 1)], {}, ownerAuthority()),
      uploadChatAttachments([largePdf('second.pdf', 2)], {}, ownerAuthority()),
    ]);

    expect(server.creates()).toBe(2);
    expect(server.mostCreatesInFlight()).toBe(1);
  });

  it.each([
    [
      'ready, with the attachment already in the Library',
      { state: 'ready' } as const,
      expect.objectContaining({ assetId: ASSET_ID, name: 'report.pdf', size: LARGE_FILE_BYTES }),
    ],
    ['still being checked', { state: 'checking' } as const, undefined],
  ])(
    'keeps a file whose intake the cancel could no longer stop (%s), with what removing it needs',
    async (_label, statusAnswer, attachment) => {
      useBillingStore.setState({ attachmentLimits: OFFER });
      const server = largeFileServer({
        completeAnswer: { state: 'checking' },
        cancelAnswer: { state: 'checking' },
        statusAnswer,
      });
      vi.stubGlobal('fetch', server.fetchMock);
      const file = largePdf();
      const controller = new AbortController();
      const onKeptAfterCancel = vi.fn();

      const settled = uploadChatAttachments(
        [file],
        { signal: controller.signal, onKeptAfterCancel },
        ownerAuthority(),
      ).then(
        () => null,
        (error: unknown) => error,
      );
      await vi.waitFor(
        () =>
          expect(
            server.calls.some(
              (call) => call.method === 'POST' && call.url === '/api/files/uploads/upload-1',
            ),
          ).toBe(true),
        { timeout: 10_000 },
      );
      controller.abort();

      expect(await settled).toMatchObject({ name: 'AbortError' });
      expect(onKeptAfterCancel).toHaveBeenCalledTimes(1);
      expect(onKeptAfterCancel).toHaveBeenCalledWith([
        {
          file,
          intakeId: intakeIdFor('upload-1'),
          attachment,
          settle: expect.any(Function),
          discard: expect.any(Function),
        },
      ]);
      const intakeCalls = server.calls
        .filter((call) => call.url.startsWith('/api/files/intakes/'))
        .map((call) => call.method);
      expect(intakeCalls).toEqual(['DELETE', 'GET']);
    },
  );

  it('stops waiting for the status read after a cancel once the poll limit passes, and keeps nothing', async () => {
    useBillingStore.setState({ attachmentLimits: OFFER });
    const pollLimit = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(pollLimit.signal);
    try {
      const server = largeFileServer({
        completeAnswer: { state: 'checking' },
        cancelAnswer: { state: 'checking' },
        statusHangs: true,
      });
      vi.stubGlobal('fetch', server.fetchMock);
      const controller = new AbortController();
      const onKeptAfterCancel = vi.fn();

      const settled = uploadChatAttachments(
        [largePdf()],
        { signal: controller.signal, onKeptAfterCancel },
        ownerAuthority(),
      ).then(
        () => null,
        (error: unknown) => error,
      );
      await vi.waitFor(
        () =>
          expect(
            server.calls.some(
              (call) => call.method === 'POST' && call.url === '/api/files/uploads/upload-1',
            ),
          ).toBe(true),
        { timeout: 10_000 },
      );
      controller.abort();
      await vi.waitFor(() =>
        expect(
          server.calls.some(
            (call) => call.method === 'GET' && call.url.startsWith('/api/files/intakes/'),
          ),
        ).toBe(true),
      );
      pollLimit.abort();

      expect(await settled).toMatchObject({ name: 'AbortError' });
      expect(timeout).toHaveBeenCalledWith(CHAT_LARGE_FILE_POLICY.intake.statusPollMaxMs);
      expect(onKeptAfterCancel).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
    }
  });

  it('lets a large file waiting for its turn to create leave as soon as it is cancelled', async () => {
    useBillingStore.setState({ attachmentLimits: OFFER });
    let releaseFirstCreate!: () => void;
    const server = largeFileServer({
      holdFirstCreate: new Promise<void>((resolve) => {
        releaseFirstCreate = resolve;
      }),
    });
    vi.stubGlobal('fetch', server.fetchMock);
    const first = uploadChatAttachments([largePdf('first.pdf', 1)], {}, ownerAuthority()).then(
      (attachments) => attachments,
      (error: unknown) => error,
    );
    try {
      await vi.waitFor(() => expect(server.creates()).toBe(1), { timeout: 10_000 });
      const secondToken = vi.fn(async () => 'owner-a-token');
      const secondAuthority = createRequestAuthority({
        userId: 'owner-a',
        sessionId: 'session-owner-a',
        isCurrent: () => true,
        getToken: secondToken,
      });
      const controller = new AbortController();
      let secondSettled = false;
      const second = uploadChatAttachments(
        [largePdf('second.pdf', 2)],
        { signal: controller.signal },
        secondAuthority,
      ).then(
        () => null,
        (error: unknown) => error,
      );
      void second.finally(() => {
        secondSettled = true;
      });
      await vi.waitFor(() => expect(secondToken).toHaveBeenCalled(), { timeout: 10_000 });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(secondSettled).toBe(false);

      controller.abort();

      await vi.waitFor(() => expect(secondSettled).toBe(true), { timeout: 2_000 });
      expect(await second).toMatchObject({ name: 'AbortError' });
      expect(server.creates()).toBe(1);
    } finally {
      releaseFirstCreate();
      await first;
    }
    expect(await first).toHaveLength(1);
    expect(server.creates()).toBe(1);
  });

  it('drops a file whose intake the cancel stopped, as today', async () => {
    useBillingStore.setState({ attachmentLimits: OFFER });
    const server = largeFileServer({
      completeAnswer: { state: 'checking' },
      cancelAnswer: { state: 'cancelled' },
      statusAnswer: { state: 'cancelled' },
    });
    vi.stubGlobal('fetch', server.fetchMock);
    const controller = new AbortController();
    const onKeptAfterCancel = vi.fn();

    const settled = uploadChatAttachments(
      [largePdf()],
      { signal: controller.signal, onKeptAfterCancel },
      ownerAuthority(),
    ).then(
      () => null,
      (error: unknown) => error,
    );
    await vi.waitFor(
      () =>
        expect(
          server.calls.some(
            (call) => call.method === 'POST' && call.url === '/api/files/uploads/upload-1',
          ),
        ).toBe(true),
      { timeout: 10_000 },
    );
    controller.abort();

    expect(await settled).toMatchObject({ name: 'AbortError' });
    expect(onKeptAfterCancel).not.toHaveBeenCalled();
  });

  it('resumes a large file after a reload by sending only the parts storage is missing', async () => {
    useBillingStore.setState({ attachmentLimits: OFFER });
    const file = largePdf();
    const interrupted = largeFileServer({ failPart: 2 });
    vi.stubGlobal('fetch', interrupted.fetchMock);
    await expect(uploadChatAttachments([file], {}, ownerAuthority())).rejects.toThrow();

    const otherOwner = largeFileServer({ storedParts: [1] });
    vi.stubGlobal('fetch', otherOwner.fetchMock);
    await expect(
      uploadChatAttachments([file], {}, ownerAuthority('owner-b')),
    ).resolves.toHaveLength(1);
    expect(otherOwner.creates()).toBe(1);
    expect(otherOwner.calls.map(requestLine)).not.toContain(
      'GET /api/files/uploads/upload-1?session=signed-1',
    );

    const resumed = largeFileServer({ storedParts: [1] });
    vi.stubGlobal('fetch', resumed.fetchMock);
    await expect(uploadChatAttachments([file], {}, ownerAuthority())).resolves.toHaveLength(1);

    expect(resumed.creates()).toBe(0);
    expect(resumed.calls.filter((call) => call.method === 'PUT').map(requestLine)).toEqual([
      `PUT ${STORAGE_ORIGIN}/upload-1/2`,
    ]);
  });

  it('keeps a file whose cancel landed while its complete request was in flight, from the intake the cancel names', async () => {
    useBillingStore.setState({ attachmentLimits: OFFER });
    const server = largeFileServer({
      holdComplete: true,
      sessionCancelAnswer: { aborted: true, intake: { id: intakeIdFor('upload-1') } },
      statusAnswer: { state: 'ready' },
    });
    vi.stubGlobal('fetch', server.fetchMock);
    const file = largePdf();

    const { error, onKeptAfterCancel } = await cancelWhen(server, completeSent, file);

    expect(error).toMatchObject({ name: 'AbortError' });
    expect(server.calls.map(requestLine)).toContain(
      'DELETE /api/files/uploads/upload-1?session=signed-1',
    );
    expect(onKeptAfterCancel).toHaveBeenCalledWith([
      {
        file,
        intakeId: intakeIdFor('upload-1'),
        attachment: expect.objectContaining({ assetId: ASSET_ID }),
        settle: expect.any(Function),
        discard: expect.any(Function),
      },
    ]);
    expect(intakeReads(server)).toEqual([`GET /api/files/intakes/${intakeIdFor('upload-1')}`]);
  });

  it.each([
    ['without an intake', { aborted: true }],
    ['with a null intake', { aborted: true, intake: null }],
    ['with an intake id that is not one', { aborted: true, intake: { id: 'not-an-intake' } }],
    ['with an intake that has no id', { aborted: true, intake: {} }],
  ])(
    'treats a cancel answer %s as a cancel that worked, and reads nothing',
    async (_label, sessionCancelAnswer) => {
      useBillingStore.setState({ attachmentLimits: OFFER });
      const server = largeFileServer({
        holdComplete: true,
        sessionCancelAnswer,
        statusAnswer: { state: 'ready' },
      });
      vi.stubGlobal('fetch', server.fetchMock);

      const { error, onKeptAfterCancel } = await cancelWhen(server, completeSent, largePdf());

      expect(error).toMatchObject({ name: 'AbortError' });
      expect(server.calls.map(requestLine)).toContain(
        'DELETE /api/files/uploads/upload-1?session=signed-1',
      );
      expect(onKeptAfterCancel).not.toHaveBeenCalled();
      expect(intakeReads(server)).toEqual([]);
    },
  );

  it.each([
    ['no handshake', null],
    ['an offering handshake', OFFER],
  ] as const)(
    'never reads an intake after cancelling a file of 25 MiB or less under %s',
    async (_label, limits) => {
      useBillingStore.setState({ attachmentLimits: limits });
      const server = largeFileServer({
        holdParts: true,
        sessionCancelAnswer: { aborted: true, intake: { id: intakeIdFor('upload-1') } },
        statusAnswer: { state: 'ready' },
      });
      vi.stubGlobal('fetch', server.fetchMock);
      const small = new File([new Uint8Array(6 * MIB).fill(65)], 'log.txt', { type: 'text/plain' });
      const authority = ownerAuthority();

      const { error, onKeptAfterCancel } = await cancelWhen(
        server,
        (call) => call.method === 'PUT',
        small,
        authority,
      );

      expect(error).toMatchObject({ name: 'AbortError' });
      expect(onKeptAfterCancel).not.toHaveBeenCalled();
      expect(intakeReads(server)).toEqual([]);
    },
  );

  describe('a file the cancel came too late for', () => {
    async function keptFile(
      statusAnswers: IntakeAnswer[],
      authority = ownerAuthority(),
    ): Promise<KeptAfterCancel> {
      useBillingStore.setState({ attachmentLimits: OFFER });
      const server = largeFileServer({
        completeAnswer: { state: 'checking' },
        cancelAnswer: { state: 'checking' },
        statusAnswers,
      });
      vi.stubGlobal('fetch', server.fetchMock);
      const file = largePdf();
      const { onKeptAfterCancel } = await cancelWhen(server, completeSent, file, authority);
      expect(onKeptAfterCancel).toHaveBeenCalledTimes(1);
      const kept = onKeptAfterCancel.mock.calls[0]?.[0][0];
      expect(kept?.file).toBe(file);
      return kept!;
    }

    it('reuses the ready copy when the same File is sent again, with no request', async () => {
      const authority = ownerAuthority();
      const { file } = await keptFile([{ state: 'ready' }], authority);
      const again = largeFileServer();
      vi.stubGlobal('fetch', again.fetchMock);
      const onStatus = vi.fn();

      await expect(uploadChatAttachments([file], { onStatus }, authority)).resolves.toEqual([
        expect.objectContaining({ assetId: ASSET_ID, name: 'report.pdf' }),
      ]);
      expect(again.calls).toEqual([]);
      expect(onStatus.mock.calls.map(([status]) => status.phase)).toEqual([
        'verifying',
        'complete',
      ]);
    });

    it('waits for a copy still being checked and sends it once ready, without uploading it again', async () => {
      const authority = ownerAuthority();
      const { file } = await keptFile([{ state: 'checking' }], authority);
      const again = largeFileServer({ statusAnswers: [{ state: 'checking' }, { state: 'ready' }] });
      vi.stubGlobal('fetch', again.fetchMock);

      await expect(uploadChatAttachments([file], {}, authority)).resolves.toEqual([
        expect.objectContaining({ assetId: ASSET_ID }),
      ]);
      expect(intakeReads(again)).toEqual([
        `GET /api/files/intakes/${intakeIdFor('upload-1')}`,
        `GET /api/files/intakes/${intakeIdFor('upload-1')}`,
      ]);
      expect(again.creates()).toBe(0);
    });

    it('refuses a copy the check rejects with the server reason, without uploading it', async () => {
      const authority = ownerAuthority();
      const { file } = await keptFile([{ state: 'checking' }], authority);
      const again = largeFileServer({ statusAnswers: [{ state: 'rejected' }] });
      vi.stubGlobal('fetch', again.fetchMock);
      const onStatus = vi.fn();

      await expect(uploadChatAttachments([file], { onStatus }, authority)).rejects.toThrow(REFUSAL);
      expect(onStatus.mock.calls.at(-1)?.[0]).toEqual({
        index: 0,
        fileName: 'report.pdf',
        phase: 'failed',
        error: REFUSAL,
        retryable: false,
      });
      expect(again.creates()).toBe(0);
    });

    it('hands a kept copy back again when the send that reuses it is cancelled too', async () => {
      const authority = ownerAuthority();
      const { file } = await keptFile([{ state: 'checking' }], authority);
      const again = largeFileServer({ statusAnswers: [{ state: 'ready' }] });
      vi.stubGlobal('fetch', again.fetchMock);
      const controller = new AbortController();
      const onKeptAfterCancel = vi.fn<(kept: readonly KeptAfterCancel[]) => void>();
      const onStatus = vi.fn();

      const settled = uploadChatAttachments(
        [file],
        { signal: controller.signal, onKeptAfterCancel, onStatus },
        authority,
      ).then(
        () => null,
        (error: unknown) => error,
      );
      await vi.waitFor(() =>
        expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ phase: 'verifying' })),
      );
      controller.abort();

      expect(await settled).toMatchObject({ name: 'AbortError' });
      expect(onKeptAfterCancel).toHaveBeenCalledWith([
        expect.objectContaining({ file, intakeId: intakeIdFor('upload-1') }),
      ]);
      const [[kept]] = onKeptAfterCancel.mock.calls as [[readonly KeptAfterCancel[]]];
      await expect(kept[0]!.settle(authority)).resolves.toMatchObject({ state: 'ready' });
      expect(again.creates()).toBe(0);
    });

    it('uploads afresh for another account', async () => {
      const { file } = await keptFile([{ state: 'ready' }], ownerAuthority('owner-a'));
      const again = largeFileServer();
      vi.stubGlobal('fetch', again.fetchMock);

      await expect(
        uploadChatAttachments([file], {}, ownerAuthority('owner-b')),
      ).resolves.toHaveLength(1);
      expect(again.creates()).toBe(1);
    });

    it.each([
      ['ready', { state: 'ready' } as const, { state: 'ready' } as const],
      ['still being checked', { state: 'checking' } as const, { state: 'ready' } as const],
    ])('settles a copy that is %s as ready', async (_label, keptAnswer, laterAnswer) => {
      const authority = ownerAuthority();
      const kept = await keptFile([keptAnswer], authority);
      const again = largeFileServer({ statusAnswers: [laterAnswer] });
      vi.stubGlobal('fetch', again.fetchMock);

      await expect(kept.settle(authority)).resolves.toEqual({
        state: 'ready',
        attachment: expect.objectContaining({ assetId: ASSET_ID }),
      });
    });

    it('settles a copy the check rejects as refused with the server reason', async () => {
      const authority = ownerAuthority();
      const kept = await keptFile([{ state: 'checking' }], authority);
      const again = largeFileServer({ statusAnswers: [{ state: 'rejected' }] });
      vi.stubGlobal('fetch', again.fetchMock);

      await expect(kept.settle(authority)).resolves.toEqual({
        state: 'refused',
        message: REFUSAL,
      });
    });

    it('deletes a removed ready copy through the Library delete, and a later send uploads afresh', async () => {
      const authority = ownerAuthority();
      const kept = await keptFile([{ state: 'ready' }], authority);
      const { file } = kept;
      const again = largeFileServer();
      vi.stubGlobal('fetch', again.fetchMock);

      await kept.discard(authority);

      expect(again.calls.map(requestLine)).toEqual([`DELETE /api/media?id=${ASSET_ID}`]);
      const [, init] = again.fetchMock.mock.calls[0]!;
      expect(new Headers(init?.headers).get('x-csrf-token')).toBe('csrf-token');
      await expect(uploadChatAttachments([file], {}, authority)).resolves.toHaveLength(1);
      expect(again.creates()).toBe(1);
    });

    it('waits for a removed copy still being checked, then deletes it once ready', async () => {
      const authority = ownerAuthority();
      const kept = await keptFile([{ state: 'checking' }], authority);
      const again = largeFileServer({ statusAnswers: [{ state: 'ready' }] });
      vi.stubGlobal('fetch', again.fetchMock);

      await kept.discard(authority);

      expect(again.calls.map(requestLine)).toEqual([
        `GET /api/files/intakes/${intakeIdFor('upload-1')}`,
        `DELETE /api/media?id=${ASSET_ID}`,
      ]);
    });

    it('settles and deletes a copy whose read began on a send that has since ended', async () => {
      const authority = ownerAuthority();
      const { file } = await keptFile([{ state: 'checking' }], authority);
      const again = largeFileServer({ statusAnswers: [{ state: 'ready' }] });
      vi.stubGlobal('fetch', again.fetchMock);
      const sendAuthority = ownerAuthority();
      const controller = new AbortController();
      const onKeptAfterCancel = vi.fn<(kept: readonly KeptAfterCancel[]) => void>();
      const onStatus = vi.fn();

      const settled = uploadChatAttachments(
        [file],
        { signal: controller.signal, onKeptAfterCancel, onStatus },
        sendAuthority,
      ).then(
        () => null,
        (error: unknown) => error,
      );
      await vi.waitFor(() =>
        expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ phase: 'verifying' })),
      );
      controller.abort();
      expect(await settled).toMatchObject({ name: 'AbortError' });
      sendAuthority.retire();
      const [[kept]] = onKeptAfterCancel.mock.calls as [[readonly KeptAfterCancel[]]];

      await expect(kept[0]!.settle(authority)).resolves.toMatchObject({ state: 'ready' });
      await kept[0]!.discard(authority);
      expect(again.calls.map(requestLine)).toEqual([
        `GET /api/files/intakes/${intakeIdFor('upload-1')}`,
        `DELETE /api/media?id=${ASSET_ID}`,
      ]);
    });

    it.each([
      ['rejected', { state: 'rejected' } as const, REFUSAL],
      ['failed', { state: 'failed' } as const, SCAN_UNAVAILABLE],
      ['cancelled', { state: 'cancelled' } as const, '"report.pdf" could not be attached.'],
    ])(
      'forgets a copy whose check ended %s, so the same File uploads afresh',
      async (_label, ended, message) => {
        const authority = ownerAuthority();
        const kept = await keptFile([{ state: 'checking' }], authority);
        const ending = largeFileServer({ statusAnswers: [ended] });
        vi.stubGlobal('fetch', ending.fetchMock);
        await expect(kept.settle(authority)).resolves.toEqual({ state: 'refused', message });

        const again = largeFileServer();
        vi.stubGlobal('fetch', again.fetchMock);
        await expect(uploadChatAttachments([kept.file], {}, authority)).resolves.toHaveLength(1);
        expect(again.creates()).toBe(1);
        await kept.discard(authority);
        expect(again.calls.filter((call) => call.url.startsWith('/api/media'))).toEqual([]);
      },
    );

    it('says so when the Library did not delete a removed copy', async () => {
      const authority = ownerAuthority();
      const kept = await keptFile([{ state: 'ready' }], authority);
      const again = largeFileServer({ mediaDeleted: false });
      vi.stubGlobal('fetch', again.fetchMock);

      await expect(kept.discard(authority)).rejects.toThrow(
        'Could not delete report.pdf. Delete it in your Library.',
      );
      expect(again.calls.map(requestLine)).toEqual([`DELETE /api/media?id=${ASSET_ID}`]);
    });

    it('stops reading a copy after as many unanswered reads as the upload allows, and reads again later', async () => {
      const authority = ownerAuthority();
      const kept = await keptFile([{ state: 'checking' }], authority);
      const silent = largeFileServer({ statusUnanswered: 503 });
      vi.stubGlobal('fetch', silent.fetchMock);
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      try {
        const unanswered = kept.settle(authority);
        await vi.advanceTimersByTimeAsync(
          CHAT_LARGE_FILE_POLICY.intake.statusPollMaxMs * CHAT_FILE_INTAKE_STATUS_READ_ATTEMPTS,
        );
        await expect(unanswered).resolves.toEqual({
          state: 'refused',
          message: 'Could not verify report.pdf.',
        });
        expect(intakeReads(silent)).toHaveLength(CHAT_FILE_INTAKE_STATUS_READ_ATTEMPTS);

        const answering = largeFileServer({ statusAnswers: [{ state: 'ready' }] });
        vi.stubGlobal('fetch', answering.fetchMock);
        const later = kept.settle(authority);
        await vi.advanceTimersByTimeAsync(CHAT_LARGE_FILE_POLICY.intake.statusPollMinMs);
        await expect(later).resolves.toMatchObject({ state: 'ready' });
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      ['an ordinary copy into a Temporary Chat', false, true],
      ['a Temporary Chat copy into an ordinary chat', true, false],
    ])(
      'does not send %s: it deletes that copy and uploads the file afresh',
      async (_label, keptTemporary, sentTemporary) => {
        useBillingStore.setState({ attachmentLimits: OFFER });
        const server = largeFileServer({
          completeAnswer: { state: 'checking' },
          cancelAnswer: { state: 'checking' },
          statusAnswers: [{ state: 'ready' }],
        });
        vi.stubGlobal('fetch', server.fetchMock);
        const file = largePdf();
        const authority = ownerAuthority();
        const { onKeptAfterCancel } = await cancelWhen(
          server,
          completeSent,
          file,
          authority,
          keptTemporary,
        );
        expect(onKeptAfterCancel).toHaveBeenCalledTimes(1);
        const again = largeFileServer();
        vi.stubGlobal('fetch', again.fetchMock);

        await expect(
          uploadChatAttachments([file], { temporary: sentTemporary }, authority),
        ).resolves.toHaveLength(1);

        const lines = again.calls.map(requestLine);
        const create = again.calls.find(
          (call) => call.method === 'POST' && call.url === '/api/files/uploads',
        );
        expect(lines.indexOf(`DELETE /api/media?id=${ASSET_ID}`)).toBe(0);
        expect(again.creates()).toBe(1);
        expect((create?.body as { temporary?: boolean }).temporary === true).toBe(sentTemporary);
      },
    );
  });
});
