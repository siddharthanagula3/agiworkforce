import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CHAT_LARGE_FILE_POLICY, MAX_CHAT_ATTACHMENT_BYTES } from '../chat-attachments';
import { managedCloudChatFileIntakePath } from '../chat-file-intake';
import {
  CHAT_FILE_INTAKE_STATUS_READ_ATTEMPTS,
  ManagedCloudResumableUploadError,
  RESUMABLE_UPLOAD_INTAKE_STATUS_UNREADABLE,
  createManagedCloudResumableUploadClient,
  type ManagedCloudResumableUploadClientConfig,
  type ResumableUploadPart,
  type ResumableUploadPartSender,
  type ResumableUploadVisibility,
} from '../managed-cloud-resumable-upload-client';
import {
  CHAT_LARGE_FILE_UPLOAD_KIND,
  MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
  RESUMABLE_UPLOAD_PART_BYTES,
  RESUMABLE_UPLOAD_PART_CONCURRENCY,
  managedCloudResumableUploadPartsPath,
  managedCloudResumableUploadPath,
  managedCloudResumableUploadSessionPath,
} from '../resumable-uploads';

const request = {
  kind: 'chat-attachment' as const,
  fileName: 'fixture.txt',
  mimeType: 'text/plain',
  byteCount: 1,
  checksumSha256: 'a'.repeat(64),
};
const completed = {
  kind: 'chat-attachment',
  attachment: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'fixture.txt',
    mimeType: 'text/plain',
    byteCount: 1,
    type: 'file',
    url: '/api/files/00000000-0000-4000-8000-000000000001',
  },
};

type UploadFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function fixture() {
  const session = {
    uploadId: 'existing-upload',
    session: 'signed-session-fixture',
    partBytes: 1,
    partCount: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const sessions = {
    read: vi.fn(() => JSON.stringify(session)),
    write: vi.fn(),
    remove: vi.fn(),
  };
  const fetchImpl = vi.fn<UploadFetch>();
  const uploadFetchImpl = vi.fn<UploadFetch>();
  const client = createManagedCloudResumableUploadClient({
    sessions,
    fetchImpl,
    uploadFetchImpl,
  });
  return {
    session,
    sessions,
    fetchImpl,
    uploadFetchImpl,
    upload: (signal?: AbortSignal) => client.upload({ file: new Blob(['x']), request, signal }),
  };
}

describe('resumable upload completion recovery', () => {
  it('keys a chat attachment session exactly as earlier builds stored it', async () => {
    const { sessions, fetchImpl, upload } = fixture();
    fetchImpl.mockRejectedValue(new TypeError('offline'));

    await upload().catch(() => undefined);

    expect(sessions.read).toHaveBeenCalledWith(`chat-attachment::${'a'.repeat(64)}:1`);
  });

  it('recovers the existing receipt after progress reports a closed multipart upload', async () => {
    const f = fixture();
    f.fetchImpl
      .mockResolvedValueOnce(Response.json({ error: 'Closed' }, { status: 404 }))
      .mockResolvedValueOnce(Response.json(completed));

    await expect(f.upload()).resolves.toEqual(completed);

    expect(f.fetchImpl).toHaveBeenCalledTimes(2);
    expect(f.fetchImpl).toHaveBeenNthCalledWith(
      2,
      managedCloudResumableUploadPath(f.session.uploadId),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ session: f.session.session }),
      }),
    );
    expect(f.sessions.remove).toHaveBeenCalledOnce();
    expect(f.sessions.write).not.toHaveBeenCalled();
    expect(f.uploadFetchImpl).not.toHaveBeenCalled();
  });

  it('sends no session DELETE when a recovered completion is not aborted', async () => {
    const f = fixture();
    f.fetchImpl
      .mockResolvedValueOnce(Response.json({ error: 'Closed' }, { status: 404 }))
      .mockResolvedValueOnce(Response.json(completed));

    await expect(f.upload(new AbortController().signal)).resolves.toEqual(completed);

    expect(f.fetchImpl.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual([
      'GET',
      'POST',
    ]);
  });

  it('keeps the session and sends no DELETE when the person aborts a recovered completion', async () => {
    const f = fixture();
    const controller = new AbortController();
    f.fetchImpl.mockImplementation(async (_input, init) => {
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      if (init?.method === 'POST') {
        return new Promise<Response>((_resolve, reject) => {
          const error = new Error('cancelled');
          error.name = 'AbortError';
          init.signal?.addEventListener('abort', () => reject(error), { once: true });
          controller.abort();
        });
      }
      return Response.json({ error: 'Closed' }, { status: 404 });
    });

    await expect(f.upload(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });

    expect(f.fetchImpl.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toEqual([]);
    expect(f.sessions.remove).not.toHaveBeenCalled();
    expect(f.sessions.write).not.toHaveBeenCalled();
    expect(f.uploadFetchImpl).not.toHaveBeenCalled();
  });

  it('keeps the session and sends no DELETE when the person aborts the progress read', async () => {
    const f = fixture();
    const controller = new AbortController();
    f.fetchImpl.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const error = new Error('cancelled');
          error.name = 'AbortError';
          init?.signal?.addEventListener('abort', () => reject(error), { once: true });
          controller.abort();
        }),
    );

    await expect(f.upload(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });

    expect(f.fetchImpl.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual(['GET']);
    expect(f.sessions.remove).not.toHaveBeenCalled();
    expect(f.sessions.write).not.toHaveBeenCalled();
  });

  it('starts a fresh upload when the closed session has nothing left to complete', async () => {
    const f = fixture();
    const freshSession = {
      uploadId: 'fresh-upload',
      session: 'fresh-session-fixture',
      partBytes: 1,
      partCount: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    f.fetchImpl
      .mockResolvedValueOnce(Response.json({ error: 'Closed' }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ error: 'Not found' }, { status: 404 }))
      .mockResolvedValueOnce(Response.json(freshSession))
      .mockResolvedValueOnce(
        Response.json({
          parts: [
            {
              partNumber: 1,
              url: 'https://cloud.example/part',
              method: 'PUT',
              headers: {},
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json(completed));
    f.uploadFetchImpl.mockResolvedValueOnce(Response.json({ success: true }));

    await expect(f.upload()).resolves.toEqual(completed);

    expect(f.sessions.remove).toHaveBeenCalledTimes(2);
    expect(f.sessions.write).toHaveBeenCalledOnce();
    expect(f.sessions.write).toHaveBeenCalledWith(expect.any(String), JSON.stringify(freshSession));
    expect(f.uploadFetchImpl).toHaveBeenCalledOnce();
  });

  it.each([401, 403, 409, 429, 500, 503])(
    'preserves the cached session when the completion probe returns %s',
    async (status) => {
      const f = fixture();
      f.fetchImpl
        .mockResolvedValueOnce(Response.json({ error: 'Closed' }, { status: 404 }))
        .mockResolvedValueOnce(Response.json({ error: 'Unresolved completion' }, { status }));

      await expect(f.upload()).rejects.toMatchObject({ status });

      expect(f.fetchImpl).toHaveBeenCalledTimes(2);
      expect(f.sessions.remove).not.toHaveBeenCalled();
      expect(f.sessions.write).not.toHaveBeenCalled();
      expect(f.uploadFetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403, 409, 429, 500, 503])(
    'does not probe or replace a session when progress returns %s',
    async (status) => {
      const f = fixture();
      f.fetchImpl.mockResolvedValueOnce(Response.json({ error: 'Progress refused' }, { status }));

      await expect(f.upload()).rejects.toMatchObject({ status });

      expect(f.fetchImpl).toHaveBeenCalledOnce();
      expect(f.sessions.remove).not.toHaveBeenCalled();
      expect(f.sessions.write).not.toHaveBeenCalled();
      expect(f.uploadFetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each(['TypeError', 'AbortError'])(
    'preserves an uncertain completion probe interrupted by %s',
    async (name) => {
      const f = fixture();
      const interruption = new Error('Completion outcome unknown');
      interruption.name = name;
      f.fetchImpl
        .mockResolvedValueOnce(Response.json({ error: 'Closed' }, { status: 404 }))
        .mockRejectedValueOnce(interruption);

      await expect(f.upload()).rejects.toBe(interruption);

      expect(f.fetchImpl).toHaveBeenCalledTimes(2);
      expect(f.sessions.remove).not.toHaveBeenCalled();
      expect(f.sessions.write).not.toHaveBeenCalled();
      expect(f.uploadFetchImpl).not.toHaveBeenCalled();
    },
  );

  it('keeps the session after a lost completion response and recovers on the next attempt', async () => {
    const f = fixture();
    const networkError = new TypeError('Completion response lost');
    f.fetchImpl
      .mockResolvedValueOnce(
        Response.json({
          uploadId: f.session.uploadId,
          partBytes: 1,
          parts: [{ partNumber: 1, size: 1 }],
          bytesStored: 1,
        }),
      )
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(Response.json({ error: 'Closed' }, { status: 404 }))
      .mockResolvedValueOnce(Response.json(completed));

    await expect(f.upload()).rejects.toBe(networkError);
    expect(f.sessions.remove).not.toHaveBeenCalled();
    await expect(f.upload()).resolves.toEqual(completed);

    expect(f.fetchImpl).toHaveBeenCalledTimes(4);
    expect(f.sessions.remove).toHaveBeenCalledOnce();
    expect(f.sessions.write).not.toHaveBeenCalled();
    expect(f.uploadFetchImpl).not.toHaveBeenCalled();
  });

  it('retains a session after an ambiguous ordinary completion rejection', async () => {
    const f = fixture();
    f.fetchImpl
      .mockResolvedValueOnce(
        Response.json({
          uploadId: f.session.uploadId,
          partBytes: 1,
          parts: [{ partNumber: 1, size: 1 }],
          bytesStored: 1,
        }),
      )
      .mockResolvedValueOnce(Response.json({ error: 'Workspace changed' }, { status: 409 }));

    await expect(f.upload()).rejects.toMatchObject({ status: 409 });

    expect(f.sessions.remove).not.toHaveBeenCalled();
    expect(f.sessions.write).not.toHaveBeenCalled();
    expect(f.uploadFetchImpl).not.toHaveBeenCalled();
  });
});

describe('resumable upload relay identity', () => {
  const attachment = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'fixture.txt',
    mimeType: 'text/plain',
    byteCount: 1,
    type: 'file',
    url: '/api/files/00000000-0000-4000-8000-000000000001',
  };
  const request = {
    kind: 'chat-attachment' as const,
    fileName: 'fixture.txt',
    mimeType: 'text/plain',
    byteCount: 1,
    checksumSha256: createHash('sha256').update('x').digest('hex'),
  };
  function responses() {
    return vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          uploadId: 'upload-1',
          session: 'fixture-session',
          partBytes: 1,
          partCount: 1,
          expiresAt: '2099-01-01T00:00:00Z',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          parts: [
            {
              partNumber: 1,
              url: 'https://cloud.example/api/files/uploads/upload-1?session=fixture&partNumber=1',
              method: 'PUT',
              headers: {},
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ kind: 'chat-attachment', attachment }));
  }

  it('authenticates raw relay parts using the current account without a JSON content type', async () => {
    let calls = 0;
    const getHeaders = vi.fn(() => ({
      Authorization: `Bearer account-${++calls}`,
      'Content-Type': 'application/json',
    }));
    const uploadFetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      new Headers(init?.headers).get('Authorization') === 'Bearer account-3'
        ? Response.json({ success: true })
        : Response.json({}, { status: 401 }),
    );
    const client = createManagedCloudResumableUploadClient({
      baseUrl: 'https://cloud.example',
      getHeaders,
      fetchImpl: responses(),
      uploadFetchImpl,
      sessions: null,
    });
    await expect(client.upload({ file: new Blob(['x']), request })).resolves.toEqual({
      kind: 'chat-attachment',
      attachment,
    });
    expect(uploadFetchImpl).toHaveBeenCalledOnce();
    expect(new Headers(uploadFetchImpl.mock.calls[0]![1]!.headers).has('Content-Type')).toBe(false);
  });

  it('does not retry an account-boundary refusal as a network error', async () => {
    let calls = 0;
    const getHeaders = vi.fn(() => {
      if (++calls === 3) throw new Error('Account changed');
      return { Authorization: 'Bearer account' };
    });
    const uploadFetchImpl = vi.fn();
    const sleep = vi.fn();
    const client = createManagedCloudResumableUploadClient({
      baseUrl: 'https://cloud.example',
      getHeaders,
      fetchImpl: responses(),
      uploadFetchImpl,
      sessions: null,
      sleep,
    });
    await expect(client.upload({ file: new Blob(['x']), request })).rejects.toThrow(
      'Account changed',
    );
    expect(uploadFetchImpl).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
    expect(getHeaders).toHaveBeenCalledTimes(3);
  });
});

describe('a resumable upload with its own part sender', () => {
  const PART = 4;
  const bytes = 10;
  const parted = { ...request, byteCount: bytes };

  function server(segmentBytes?: number) {
    const signedFor: number[][] = [];
    const fetchImpl = vi.fn<UploadFetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/files/uploads') && init?.method === 'POST') {
        return Response.json({
          uploadId: 'parted-upload',
          session: 'parted-session',
          partBytes: PART,
          partCount: 3,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (url.endsWith('/parts')) {
        const { partNumbers } = JSON.parse(String(init?.body)) as { partNumbers: number[] };
        signedFor.push(partNumbers);
        return Response.json({
          parts: partNumbers.map((partNumber) => ({
            partNumber,
            url: `https://storage.example.test/part/${partNumber}?session=s`,
            method: 'PUT',
            headers: {},
            ...(segmentBytes ? { segmentBytes } : {}),
          })),
        });
      }
      if (url.endsWith(managedCloudResumableUploadPath('parted-upload'))) {
        return Response.json({
          ...completed,
          attachment: { ...completed.attachment, byteCount: bytes },
        });
      }
      return Response.json({ error: 'unexpected' }, { status: 500 });
    });
    return { fetchImpl, signedFor };
  }

  it('hands the sender each part range and reports what storage holds', async () => {
    const { fetchImpl } = server();
    const sendPart = vi.fn<ResumableUploadPartSender>(async () => 200);
    const onStored = vi.fn();
    const client = createManagedCloudResumableUploadClient({
      sessions: null,
      fetchImpl,
      sendPart,
      sleep: async () => undefined,
    });

    await client.upload({ file: { size: bytes }, request: parted, onStored });

    expect(sendPart.mock.calls.map(([part]) => [part.partNumber, part.start, part.end])).toEqual([
      [1, 0, 4],
      [2, 4, 8],
      [3, 8, 10],
    ]);
    expect(onStored.mock.calls.map(([stored]) => stored)).toEqual([0, 4, 8, 10]);
  });

  it('retries a part whose sender failed on the network and finishes the upload', async () => {
    const { fetchImpl } = server();
    const sendPart = vi
      .fn<(part: { partNumber: number }) => Promise<number>>()
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValue(200);
    const client = createManagedCloudResumableUploadClient({
      sessions: null,
      fetchImpl,
      sendPart,
      sleep: async () => undefined,
    });

    await expect(client.upload({ file: { size: bytes }, request: parted })).resolves.toMatchObject({
      kind: 'chat-attachment',
    });
    expect(sendPart.mock.calls.map(([part]) => part.partNumber)).toEqual([1, 1, 2, 3]);
  });

  it('sends a relayed part in segments no larger than the host takes, each at its offset', async () => {
    const { fetchImpl } = server(3);
    const sent: { url: string; body: string }[] = [];
    const uploadFetchImpl = vi.fn<UploadFetch>(async (input, init) => {
      sent.push({ url: String(input), body: await (init?.body as Blob).text() });
      return new Response(null, { status: 200 });
    });
    const client = createManagedCloudResumableUploadClient({
      sessions: null,
      fetchImpl,
      uploadFetchImpl,
      sleep: async () => undefined,
    });

    await client.upload({ file: new Blob(['abcdefghij']), request: parted });

    expect(sent).toEqual([
      { url: 'https://storage.example.test/part/1?session=s&offset=0', body: 'abc' },
      { url: 'https://storage.example.test/part/1?session=s&offset=3', body: 'd' },
      { url: 'https://storage.example.test/part/2?session=s&offset=0', body: 'efg' },
      { url: 'https://storage.example.test/part/2?session=s&offset=3', body: 'h' },
      { url: 'https://storage.example.test/part/3?session=s', body: 'ij' },
    ]);
  });

  it('starts a relayed part again from its first segment when a later segment fails', async () => {
    const { fetchImpl } = server(3);
    const sendPart = vi
      .fn<(part: { partNumber: number; start: number; end: number }) => Promise<number>>()
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(503)
      .mockResolvedValue(200);
    const client = createManagedCloudResumableUploadClient({
      sessions: null,
      fetchImpl,
      sendPart,
      sleep: async () => undefined,
    });

    await client.upload({ file: { size: bytes }, request: parted });

    expect(sendPart.mock.calls.map(([part]) => [part.partNumber, part.start, part.end])).toEqual([
      [1, 0, 3],
      [1, 3, 4],
      [1, 0, 3],
      [1, 3, 4],
      [2, 4, 7],
      [2, 7, 8],
      [3, 8, 10],
    ]);
  });

  it('refuses a source it cannot slice when no sender is configured', async () => {
    const { fetchImpl } = server();
    const client = createManagedCloudResumableUploadClient({ sessions: null, fetchImpl });

    await expect(client.upload({ file: { size: bytes }, request: parted })).rejects.toMatchObject({
      status: 400,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('a chat-large-file upload', () => {
  const INTAKE_ID = '00000000-0000-4000-8000-0000000000aa';
  const UPLOAD_ID = 'large-upload';
  const SESSION = 'large-session';
  const byteCount = MAX_CHAT_ATTACHMENT_BYTES + 1;
  const partBytes = RESUMABLE_UPLOAD_PART_BYTES;
  const partCount = Math.ceil(byteCount / partBytes);
  const largeRequest = {
    kind: CHAT_LARGE_FILE_UPLOAD_KIND as typeof CHAT_LARGE_FILE_UPLOAD_KIND,
    fileName: 'large.txt',
    mimeType: 'text/plain',
    byteCount,
    checksumSha256: 'b'.repeat(64),
    conversationId: 'conversation-1',
    temporary: true,
  };
  const attachment = { ...completed.attachment, name: 'large.txt', byteCount };
  const checking = { intake: { id: INTAKE_ID, state: 'checking' } };
  const ready = { intake: { id: INTAKE_ID, state: 'ready', attachment } };
  const { statusPollMinMs, statusPollMaxMs } = CHAT_LARGE_FILE_POLICY.intake;
  const sessionPath = managedCloudResumableUploadSessionPath(UPLOAD_ID, SESSION);
  const intakePath = managedCloudChatFileIntakePath(INTAKE_ID);

  type Answer = unknown | (() => Response);
  interface Call {
    method: string;
    path: string;
    body?: unknown;
  }

  function answer(value: Answer): Response {
    return typeof value === 'function' ? (value as () => Response)() : Response.json(value);
  }

  function largeServer(
    options: {
      statuses?: Answer[];
      onStatusRead?: (reads: number) => void;
      stored?: Map<number, number>;
      complete?: Answer;
      session?: { partBytes: number; partCount: number };
    } = {},
  ) {
    const calls: Call[] = [];
    const statuses = [...(options.statuses ?? [ready])];
    let statusReads = 0;
    const fetchImpl = vi.fn<UploadFetch>(async (input, init) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      calls.push({ method, path, ...(body === undefined ? {} : { body }) });
      if (path === MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH && method === 'POST') {
        return Response.json({
          uploadId: UPLOAD_ID,
          session: SESSION,
          partBytes,
          partCount,
          ...options.session,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      }
      if (path === sessionPath) {
        if (method === 'DELETE') return new Response(null, { status: 204 });
        const parts = [...(options.stored ?? new Map<number, number>()).entries()].map(
          ([partNumber, size]) => ({ partNumber, size }),
        );
        return Response.json({ uploadId: UPLOAD_ID, partBytes, parts, bytesStored: 0 });
      }
      if (path === managedCloudResumableUploadPartsPath(UPLOAD_ID)) {
        const { partNumbers } = body as { partNumbers: number[] };
        return Response.json({
          parts: partNumbers.map((partNumber) => ({
            partNumber,
            url: `https://storage.example.test/large/${partNumber}`,
            method: 'PUT',
            headers: {},
          })),
        });
      }
      if (path === managedCloudResumableUploadPath(UPLOAD_ID) && method === 'POST') {
        return options.complete === undefined
          ? Response.json({ kind: 'chat-attachment-intake', ...checking }, { status: 202 })
          : answer(options.complete);
      }
      if (path === intakePath) {
        if (method === 'DELETE') return new Response(null, { status: 204 });
        statusReads += 1;
        options.onStatusRead?.(statusReads);
        return answer(statuses.length > 1 ? statuses.shift() : statuses[0]);
      }
      return Response.json({ error: 'unexpected' }, { status: 500 });
    });
    return { fetchImpl, calls, statusReads: () => statusReads };
  }

  function memorySessions() {
    const values = new Map<string, string>();
    return {
      values,
      store: {
        read: (fingerprint: string) => values.get(fingerprint) ?? null,
        write: (fingerprint: string, value: string) => {
          values.set(fingerprint, value);
        },
        remove: (fingerprint: string) => {
          values.delete(fingerprint);
        },
      },
    };
  }

  function fakeVisibility(visible: boolean) {
    const listeners = new Set<() => void>();
    const state = { visible };
    const visibility: ResumableUploadVisibility = {
      isVisible: () => state.visible,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const set = (next: boolean) => {
      state.visible = next;
      for (const listener of [...listeners]) listener();
    };
    return { visibility, hide: () => set(false), show: () => set(true), listeners };
  }

  function largeClient(
    server: ReturnType<typeof largeServer>,
    extra: ManagedCloudResumableUploadClientConfig = {},
  ) {
    const sleeps: number[] = [];
    const sendPart = vi.fn<ResumableUploadPartSender>(async () => 200);
    const client = createManagedCloudResumableUploadClient({
      sessions: null,
      fetchImpl: server.fetchImpl,
      sendPart,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      visibility: null,
      ...extra,
    });
    return { client, sendPart, sleeps };
  }

  function pollSchedule(polls: number): number[] {
    const schedule: number[] = [];
    let delay = statusPollMinMs;
    for (let poll = 0; poll < polls; poll += 1) {
      schedule.push(delay);
      delay = Math.min(delay * 2, statusPollMaxMs);
    }
    return schedule;
  }

  function abortError(): Error {
    const error = new Error('cancelled');
    error.name = 'AbortError';
    return error;
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  it('creates the upload through the large create schema with the conversation and temporary flags', async () => {
    const server = largeServer();
    const { client } = largeClient(server);

    await expect(
      client.upload({ file: { size: byteCount }, request: largeRequest }),
    ).resolves.toEqual({ kind: 'chat-attachment', attachment });
    expect(server.calls[0]).toEqual({
      method: 'POST',
      path: MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
      body: largeRequest,
    });
    expect(
      server.calls.find((call) => call.path === managedCloudResumableUploadPath(UPLOAD_ID)),
    ).toEqual({
      method: 'POST',
      path: managedCloudResumableUploadPath(UPLOAD_ID),
      body: { session: SESSION },
    });
  });

  it('refuses a request the large create schema refuses before any request', async () => {
    const server = largeServer();
    const { client } = largeClient(server);
    const atInlineLimit = { ...largeRequest, byteCount: MAX_CHAT_ATTACHMENT_BYTES };

    await expect(
      client.upload({ file: { size: MAX_CHAT_ATTACHMENT_BYTES }, request: atInlineLimit }),
    ).rejects.toThrow();
    expect(server.fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['the web value by default', undefined, RESUMABLE_UPLOAD_PART_CONCURRENCY.web],
    [
      'the mobile value when configured',
      RESUMABLE_UPLOAD_PART_CONCURRENCY.mobile,
      RESUMABLE_UPLOAD_PART_CONCURRENCY.mobile,
    ],
  ])(
    'sends parts with the upload contract concurrency, %s',
    async (_label, partConcurrency, most) => {
      const server = largeServer();
      let inFlight = 0;
      let peak = 0;
      const sendPart = vi.fn<ResumableUploadPartSender>(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return 200;
      });
      const { client } = largeClient(server, {
        sendPart,
        ...(partConcurrency === undefined ? {} : { partConcurrency }),
      });

      await client.upload({ file: { size: byteCount }, request: largeRequest });

      expect(peak).toBe(most);
      expect(sendPart.mock.calls.map(([part]) => part.partNumber).sort((a, b) => a - b)).toEqual(
        Array.from({ length: partCount }, (_, index) => index + 1),
      );
    },
  );

  it('keeps sending a chat-attachment upload one part at a time against an old server', async () => {
    const small = { ...request, byteCount: 10 };
    const server = largeServer({
      session: { partBytes: 4, partCount: 3 },
      complete: { ...completed, attachment: { ...completed.attachment, byteCount: 10 } },
    });
    let inFlight = 0;
    let peak = 0;
    const sendPart = vi.fn<ResumableUploadPartSender>(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return 200;
    });
    const { client, sleeps } = largeClient(server, { sendPart });

    await expect(client.upload({ file: { size: 10 }, request: small })).resolves.toMatchObject({
      kind: 'chat-attachment',
    });

    expect(peak).toBe(1);
    expect(sendPart.mock.calls.map(([part]) => part.partNumber)).toEqual([1, 2, 3]);
    expect(server.calls).toEqual([
      { method: 'POST', path: MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH, body: small },
      {
        method: 'POST',
        path: managedCloudResumableUploadPartsPath(UPLOAD_ID),
        body: { session: SESSION, partNumbers: [1, 2, 3] },
      },
      {
        method: 'POST',
        path: managedCloudResumableUploadPath(UPLOAD_ID),
        body: { session: SESSION },
      },
    ]);
    expect(sleeps).toEqual([]);
  });

  it('polls the intake from the policy minimum, backing off to its maximum, until it is sealed', async () => {
    const server = largeServer({
      statuses: [checking, checking, checking, checking, checking, ready],
    });
    const sessions = memorySessions();
    const onCompleting = vi.fn();
    const { client, sleeps } = largeClient(server, { sessions: sessions.store });

    await expect(
      client.upload({ file: { size: byteCount }, request: largeRequest, onCompleting }),
    ).resolves.toEqual({ kind: 'chat-attachment', attachment });

    expect(server.statusReads()).toBe(6);
    expect(sleeps).toEqual(pollSchedule(6));
    expect(onCompleting).toHaveBeenCalledOnce();
    expect(sessions.values.size).toBe(0);
    expect(server.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
  });

  it.each([
    [
      'rejected',
      { refusalCode: 'malware', message: 'This file did not pass the safety check.' },
      422,
      'malware',
    ],
    [
      'failed',
      {
        failureCode: 'scan_unavailable',
        message: 'Checking files is unavailable. Try again later.',
      },
      503,
      'scan_unavailable',
    ],
    [
      'cancelled',
      { cancelReason: 'idle', message: 'This upload stopped. Attach the file again.' },
      409,
      'idle',
    ],
  ])('ends with the server copy when the intake is %s', async (state, fields, status, code) => {
    const server = largeServer({
      statuses: [checking, { intake: { id: INTAKE_ID, state, ...fields } }],
    });
    const { client } = largeClient(server);

    const error: unknown = await client
      .upload({ file: { size: byteCount }, request: largeRequest })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ManagedCloudResumableUploadError);
    expect(error).toMatchObject({ message: fields.message, status, code });
    expect(server.statusReads()).toBe(2);
    expect(server.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
  });

  it('names the file when a refusal carries no server copy', async () => {
    const server = largeServer({
      statuses: [{ intake: { id: INTAKE_ID, state: 'rejected', refusalCode: 'encrypted' } }],
    });
    const { client } = largeClient(server);

    await expect(
      client.upload({ file: { size: byteCount }, request: largeRequest }),
    ).rejects.toMatchObject({ message: expect.stringContaining('large.txt'), status: 422 });
  });

  it.each([
    ['a state this build does not know', { intake: { id: INTAKE_ID, state: 'quarantined' } }],
    ['a ready intake without its attachment', { intake: { id: INTAKE_ID, state: 'ready' } }],
    [
      'a refusal code this build does not know',
      {
        intake: { id: INTAKE_ID, state: 'rejected', refusalCode: 'too_spicy' },
      },
    ],
    [
      'another intake',
      { intake: { id: '00000000-0000-4000-8000-0000000000bb', state: 'checking' } },
    ],
    ['a body that is not an intake', { ok: true }],
    ['a body that is not JSON', () => new Response('not json', { status: 200 })],
  ])('stops polling and fails where the person sees it on %s', async (_label, status) => {
    const server = largeServer({ statuses: [status, ready] });
    const { client, sleeps } = largeClient(server);

    await expect(
      client.upload({ file: { size: byteCount }, request: largeRequest }),
    ).rejects.toMatchObject({
      message: 'Could not verify large.txt.',
      code: RESUMABLE_UPLOAD_INTAKE_STATUS_UNREADABLE,
    });
    expect(server.statusReads()).toBe(1);
    expect(sleeps).toEqual(pollSchedule(1));
  });

  it('fails without polling when the 202 itself does not parse', async () => {
    const server = largeServer({
      complete: () =>
        Response.json(
          { kind: 'chat-attachment-intake', intake: { id: INTAKE_ID, state: 'scanning' } },
          { status: 202 },
        ),
    });
    const { client } = largeClient(server);

    await expect(
      client.upload({ file: { size: byteCount }, request: largeRequest }),
    ).rejects.toMatchObject({ code: RESUMABLE_UPLOAD_INTAKE_STATUS_UNREADABLE });
    expect(server.statusReads()).toBe(0);
  });

  it('keeps polling through a busy status answer and stops at one that refuses', async () => {
    const busy = largeServer({
      statuses: [() => Response.json({ error: 'busy' }, { status: 503 }), ready],
    });
    await expect(
      largeClient(busy).client.upload({ file: { size: byteCount }, request: largeRequest }),
    ).resolves.toEqual({ kind: 'chat-attachment', attachment });
    expect(busy.statusReads()).toBe(2);

    const gone = largeServer({
      statuses: [() => Response.json({ error: 'Not found' }, { status: 404 }), ready],
    });
    await expect(
      largeClient(gone).client.upload({ file: { size: byteCount }, request: largeRequest }),
    ).rejects.toMatchObject({ status: 404 });
    expect(gone.statusReads()).toBe(1);
  });

  it('polls only while the page is visible', async () => {
    const page = fakeVisibility(true);
    const server = largeServer({
      statuses: [checking, ready],
      onStatusRead: (reads) => {
        if (reads === 1) page.hide();
      },
    });
    const { client } = largeClient(server, { visibility: page.visibility });

    const upload = client.upload({ file: { size: byteCount }, request: largeRequest });
    await vi.waitFor(() => expect(server.statusReads()).toBe(1));
    await settle();
    expect(server.statusReads()).toBe(1);

    page.show();
    await expect(upload).resolves.toEqual({ kind: 'chat-attachment', attachment });
    expect(server.statusReads()).toBe(2);
    expect(page.listeners.size).toBe(0);
  });

  it('does not poll a page that is hidden from the start until it is shown', async () => {
    const page = fakeVisibility(false);
    const server = largeServer();
    const { client } = largeClient(server, { visibility: page.visibility });

    const upload = client.upload({ file: { size: byteCount }, request: largeRequest });
    await vi.waitFor(() =>
      expect(
        server.calls.some((call) => call.path === managedCloudResumableUploadPath(UPLOAD_ID)),
      ).toBe(true),
    );
    await settle();
    expect(server.statusReads()).toBe(0);

    page.show();
    await expect(upload).resolves.toEqual({ kind: 'chat-attachment', attachment });
  });

  it('cancel before the 202 sends the session DELETE, after it the intake DELETE', async () => {
    const before = largeServer();
    const beforeController = new AbortController();
    const cancellingSender = vi.fn<ResumableUploadPartSender>(async (part: ResumableUploadPart) => {
      if (part.partNumber === 1) beforeController.abort();
      if (part.signal?.aborted) throw abortError();
      return 200;
    });
    await expect(
      largeClient(before, { sendPart: cancellingSender }).client.upload({
        file: { size: byteCount },
        request: largeRequest,
        signal: beforeController.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(before.calls.filter((call) => call.method === 'DELETE')).toEqual([
      { method: 'DELETE', path: sessionPath },
    ]);
    expect(
      before.calls.some((call) => call.path === managedCloudResumableUploadPath(UPLOAD_ID)),
    ).toBe(false);

    const afterController = new AbortController();
    const after = largeServer({
      statuses: [checking],
      onStatusRead: () => afterController.abort(),
    });
    await expect(
      largeClient(after).client.upload({
        file: { size: byteCount },
        request: largeRequest,
        signal: afterController.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(after.calls.filter((call) => call.method === 'DELETE')).toEqual([
      { method: 'DELETE', path: intakePath },
    ]);
  });

  it('sends the intake DELETE when the person cancels while the page is hidden', async () => {
    const page = fakeVisibility(false);
    const controller = new AbortController();
    const server = largeServer();
    const upload = largeClient(server, { visibility: page.visibility }).client.upload({
      file: { size: byteCount },
      request: largeRequest,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(page.listeners.size).toBe(1));

    controller.abort();

    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    expect(server.calls.filter((call) => call.method === 'DELETE')).toEqual([
      { method: 'DELETE', path: intakePath },
    ]);
    expect(page.listeners.size).toBe(0);
  });

  it('resumes after a drop by sending only the parts storage does not hold', async () => {
    const stored = new Map<number, number>();
    const server = largeServer({ stored });
    const sessions = memorySessions();
    const dropping = vi.fn<ResumableUploadPartSender>(async (part) => {
      if (part.partNumber === 3) throw new TypeError('connection lost');
      stored.set(part.partNumber, part.end - part.start);
      return 200;
    });

    await expect(
      largeClient(server, { sessions: sessions.store, sendPart: dropping }).client.upload({
        file: { size: byteCount },
        request: largeRequest,
      }),
    ).rejects.toMatchObject({ status: 0 });
    expect(sessions.values.size).toBe(1);
    const heldAfterDrop = new Set(stored.keys());
    expect(heldAfterDrop.has(3)).toBe(false);
    expect(heldAfterDrop.size).toBeGreaterThan(0);

    const resumed = vi.fn<ResumableUploadPartSender>(async () => 200);
    await expect(
      largeClient(server, { sessions: sessions.store, sendPart: resumed }).client.upload({
        file: { size: byteCount },
        request: largeRequest,
      }),
    ).resolves.toEqual({ kind: 'chat-attachment', attachment });

    const missing = Array.from({ length: partCount }, (_, index) => index + 1).filter(
      (partNumber) => !heldAfterDrop.has(partNumber),
    );
    expect(resumed.mock.calls.map(([part]) => part.partNumber).sort((a, b) => a - b)).toEqual(
      missing,
    );
    expect(
      server.calls.filter(
        (call) => call.method === 'POST' && call.path === MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
      ),
    ).toHaveLength(1);
    expect(sessions.values.size).toBe(0);
  });

  const { temporary: _temporary, ...savedChatRequest } = largeRequest;

  it.each([
    ['in a saved chat', savedChatRequest],
    ['in another conversation', { ...largeRequest, conversationId: 'conversation-2' }],
  ])(
    'starts a new upload for the same bytes attached %s after a drop, reusing nothing',
    async (_label, rebound) => {
      const stored = new Map<number, number>();
      const server = largeServer({ stored });
      const sessions = memorySessions();
      const dropping = vi.fn<ResumableUploadPartSender>(async (part) => {
        if (part.partNumber === 3) throw new TypeError('connection lost');
        stored.set(part.partNumber, part.end - part.start);
        return 200;
      });
      await expect(
        largeClient(server, { sessions: sessions.store, sendPart: dropping }).client.upload({
          file: { size: byteCount },
          request: largeRequest,
        }),
      ).rejects.toMatchObject({ status: 0 });
      expect(sessions.values.size).toBe(1);
      const callsBefore = server.calls.length;

      const fresh = vi.fn<ResumableUploadPartSender>(async () => 200);
      await expect(
        largeClient(server, { sessions: sessions.store, sendPart: fresh }).client.upload({
          file: { size: byteCount },
          request: rebound,
        }),
      ).resolves.toEqual({ kind: 'chat-attachment', attachment });

      const later = server.calls.slice(callsBefore);
      expect(later[0]).toEqual({
        method: 'POST',
        path: MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
        body: rebound,
      });
      expect(later.some((call) => call.path === sessionPath && call.method === 'GET')).toBe(false);
      expect(fresh.mock.calls.map(([part]) => part.partNumber).sort((a, b) => a - b)).toEqual(
        Array.from({ length: partCount }, (_, index) => index + 1),
      );
      expect(sessions.values.size).toBe(1);
    },
  );

  describe('a recovered completion', () => {
    async function seededSessions() {
      const sessions = memorySessions();
      const dropping = vi.fn<ResumableUploadPartSender>(async () => {
        throw new TypeError('connection lost');
      });
      await expect(
        largeClient(largeServer(), { sessions: sessions.store, sendPart: dropping }).client.upload({
          file: { size: byteCount },
          request: largeRequest,
        }),
      ).rejects.toMatchObject({ status: 0 });
      expect(sessions.values.size).toBe(1);
      return sessions;
    }

    function closedServer(complete: (init: RequestInit | undefined) => Promise<Response>) {
      const inner = largeServer();
      const calls: Call[] = [];
      const fetchImpl = vi.fn<UploadFetch>(async (input, init) => {
        const path = String(input);
        const method = init?.method ?? 'GET';
        calls.push({ method, path });
        if (path === sessionPath && method === 'GET') {
          return Response.json({ error: 'Closed' }, { status: 404 });
        }
        if (path === managedCloudResumableUploadPath(UPLOAD_ID) && method === 'POST') {
          return complete(init);
        }
        return inner.fetchImpl(input, init);
      });
      return { fetchImpl, calls, statusReads: inner.statusReads };
    }

    it('sends the session DELETE and forgets the session when the person aborts it', async () => {
      const sessions = await seededSessions();
      const controller = new AbortController();
      const server = closedServer(
        (init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(abortError()), { once: true });
            controller.abort();
          }),
      );

      await expect(
        largeClient(server, { sessions: sessions.store }).client.upload({
          file: { size: byteCount },
          request: largeRequest,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(server.calls.filter((call) => call.method === 'DELETE')).toEqual([
        { method: 'DELETE', path: sessionPath },
      ]);
      expect(sessions.values.size).toBe(0);
    });

    it('sends no DELETE when it is not aborted and settles through the intake', async () => {
      const sessions = await seededSessions();
      const server = closedServer(async () =>
        Response.json({ kind: 'chat-attachment-intake', ...checking }, { status: 202 }),
      );
      const intakeReads = largeServer({ statuses: [ready] });
      const everyCall: Call[] = [];
      const fetchImpl = vi.fn<UploadFetch>(async (input, init) => {
        everyCall.push({ method: init?.method ?? 'GET', path: String(input) });
        return String(input) === intakePath
          ? intakeReads.fetchImpl(input, init)
          : server.fetchImpl(input, init);
      });

      await expect(
        largeClient({ ...server, fetchImpl }, { sessions: sessions.store }).client.upload({
          file: { size: byteCount },
          request: largeRequest,
        }),
      ).resolves.toEqual({ kind: 'chat-attachment', attachment });

      expect(everyCall.filter((call) => call.method === 'DELETE')).toEqual([]);
      expect(everyCall.map((call) => `${call.method} ${call.path}`)).toEqual([
        `GET ${sessionPath}`,
        `POST ${managedCloudResumableUploadPath(UPLOAD_ID)}`,
        `GET ${intakePath}`,
      ]);
      expect(sessions.values.size).toBe(0);
    });

    it('sends the session DELETE and forgets the session when the person aborts the progress read', async () => {
      const sessions = await seededSessions();
      const controller = new AbortController();
      const inner = largeServer();
      const calls: Call[] = [];
      const fetchImpl = vi.fn<UploadFetch>(async (input, init) => {
        const path = String(input);
        const method = init?.method ?? 'GET';
        calls.push({ method, path });
        if (path === sessionPath && method === 'GET') {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(abortError()), { once: true });
            controller.abort();
          });
        }
        return inner.fetchImpl(input, init);
      });

      await expect(
        largeClient(
          { fetchImpl, calls, statusReads: inner.statusReads },
          { sessions: sessions.store },
        ).client.upload({
          file: { size: byteCount },
          request: largeRequest,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(calls.filter((call) => call.method === 'DELETE')).toEqual([
        { method: 'DELETE', path: sessionPath },
      ]);
      expect(calls.some((call) => call.path === managedCloudResumableUploadPath(UPLOAD_ID))).toBe(
        false,
      );
      expect(sessions.values.size).toBe(0);
    });

    it('sends the session DELETE when the person aborts before the progress read answers a closed upload', async () => {
      const sessions = await seededSessions();
      const controller = new AbortController();
      const inner = largeServer();
      const calls: Call[] = [];
      const fetchImpl = vi.fn<UploadFetch>(async (input, init) => {
        const path = String(input);
        const method = init?.method ?? 'GET';
        calls.push({ method, path });
        if (path === sessionPath && method === 'GET') {
          controller.abort();
          return Response.json({ error: 'Closed' }, { status: 404 });
        }
        return inner.fetchImpl(input, init);
      });

      await expect(
        largeClient(
          { fetchImpl, calls, statusReads: inner.statusReads },
          { sessions: sessions.store },
        ).client.upload({
          file: { size: byteCount },
          request: largeRequest,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(calls.filter((call) => call.method === 'DELETE')).toEqual([
        { method: 'DELETE', path: sessionPath },
      ]);
      expect(calls.some((call) => call.path === managedCloudResumableUploadPath(UPLOAD_ID))).toBe(
        false,
      );
      expect(sessions.values.size).toBe(0);
    });
  });

  describe('a cancel that lands while a response body is being read', () => {
    function bodyAbortedAfterHeaders(status: number, controller: AbortController): Response {
      const response = new Response(null, { status });
      Object.defineProperty(response, 'json', {
        value: async () => {
          controller.abort();
          throw abortError();
        },
      });
      return response;
    }

    it.each([
      ['an accepted completion', 202],
      ['a refused completion', 500],
    ])(
      'sends the session DELETE when the body of %s is cut by the cancel',
      async (_label, status) => {
        const controller = new AbortController();
        const server = largeServer({ complete: () => bodyAbortedAfterHeaders(status, controller) });

        await expect(
          largeClient(server).client.upload({
            file: { size: byteCount },
            request: largeRequest,
            signal: controller.signal,
          }),
        ).rejects.toMatchObject({ name: 'AbortError' });

        expect(server.calls.filter((call) => call.method === 'DELETE')).toEqual([
          { method: 'DELETE', path: sessionPath },
        ]);
      },
    );

    it('sends the intake DELETE when the body of a status read is cut by the cancel', async () => {
      const controller = new AbortController();
      const server = largeServer({
        statuses: [() => bodyAbortedAfterHeaders(200, controller)],
      });

      await expect(
        largeClient(server).client.upload({
          file: { size: byteCount },
          request: largeRequest,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(server.calls.filter((call) => call.method === 'DELETE')).toEqual([
        { method: 'DELETE', path: intakePath },
      ]);
    });

    it('reports an unreadable completion body as before when nobody cancelled', async () => {
      const server = largeServer({ complete: () => new Response('not json', { status: 202 }) });

      await expect(
        largeClient(server).client.upload({ file: { size: byteCount }, request: largeRequest }),
      ).rejects.toMatchObject({ message: 'Could not verify large.txt.' });
      expect(server.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
    });
  });

  it('gives up after four unanswered status reads without cancelling the intake', async () => {
    const offline = () => {
      throw new TypeError('offline');
    };
    const busy = () => Response.json({ error: 'busy' }, { status: 503 });
    const server = largeServer({ statuses: [offline, busy, offline, busy, ready] });
    const { client, sleeps } = largeClient(server);

    await expect(
      client.upload({ file: { size: byteCount }, request: largeRequest }),
    ).rejects.toMatchObject({ message: 'Could not verify large.txt.', status: 0 });
    expect(CHAT_FILE_INTAKE_STATUS_READ_ATTEMPTS).toBe(4);
    expect(server.statusReads()).toBe(CHAT_FILE_INTAKE_STATUS_READ_ATTEMPTS);
    expect(sleeps).toEqual(pollSchedule(CHAT_FILE_INTAKE_STATUS_READ_ATTEMPTS));
    expect(server.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
  });

  it('treats a status read aborted by something other than the person as unanswered', async () => {
    const controller = new AbortController();
    const server = largeServer({
      statuses: [
        () => {
          throw abortError();
        },
        ready,
      ],
    });
    const { client } = largeClient(server);

    await expect(
      client.upload({
        file: { size: byteCount },
        request: largeRequest,
        signal: controller.signal,
      }),
    ).resolves.toEqual({ kind: 'chat-attachment', attachment });
    expect(server.statusReads()).toBe(2);
    expect(server.calls.filter((call) => call.method === 'DELETE')).toEqual([]);
  });
});
