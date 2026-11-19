import { createHash } from 'node:crypto';
import { RESUMABLE_UPLOAD_PART_BYTES } from '@agiworkforce/cloud-contracts';

const mockFiles = new Map<string, Buffer>();
const mockUploads: { url: string; uri: string; body: Buffer; headers: Record<string, string> }[] =
  [];
const mockPartOutcomes: Array<'ok' | 'network' | 'refused' | 'hang'> = [];
const mockCancel = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  cacheDirectory: 'file:///cache/',
  readAsStringAsync: jest.fn(async (uri: string, options: { position: number; length: number }) => {
    const bytes = mockFiles.get(uri);
    if (!bytes) throw new Error(`missing ${uri}`);
    return bytes.subarray(options.position, options.position + options.length).toString('base64');
  }),
  writeAsStringAsync: jest.fn(async (uri: string, base64: string) => {
    mockFiles.set(uri, Buffer.from(base64, 'base64'));
  }),
  deleteAsync: jest.fn(async (uri: string) => {
    mockFiles.delete(uri);
  }),
  createUploadTask: jest.fn(
    (
      url: string,
      uri: string,
      options: { headers: Record<string, string> },
      onProgress?: (progress: { totalBytesSent: number }) => void,
    ) => {
      let release: ((value: undefined) => void) | null = null;
      return {
        uploadAsync: async () => {
          const outcome = mockPartOutcomes.shift() ?? 'ok';
          if (outcome === 'network') throw new Error('The network connection was lost.');
          if (outcome === 'hang') return new Promise((resolve) => (release = resolve));
          const body = mockFiles.get(uri) ?? Buffer.alloc(0);
          onProgress?.({ totalBytesSent: body.length });
          if (outcome === 'refused') return { status: 400, body: '', headers: {} };
          mockUploads.push({ url, uri, body, headers: options.headers });
          return { status: 200, body: '', headers: {} };
        },
        cancelAsync: async () => {
          mockCancel();
          release?.(undefined);
        },
      };
    },
  ),
}));

import { createUploadTask } from 'expo-file-system/legacy';
import {
  partedChatUploadSessions,
  uploadChatAttachmentInParts,
} from '@/src/features/chat/upload/partedChatUpload';

const FILE_URI = 'file:///documents/report.pdf';
const BYTE_COUNT = RESUMABLE_UPLOAD_PART_BYTES * 2 + 1234;
const CHECKSUM_OF = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function fileBytes(): Buffer {
  const bytes = Buffer.alloc(BYTE_COUNT);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 31) % 251;
  return bytes;
}

interface ServerState {
  created: Record<string, unknown>[];
  stored: Map<number, number>;
  aborted: number;
  completedWith: Record<string, unknown> | null;
  unavailable: boolean;
}

function reply(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function server(state: ServerState): typeof globalThis.fetch {
  return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/files/uploads' && method === 'POST') {
      if (state.unavailable) {
        return reply(
          { error: { code: 'CAPABILITY_UNAVAILABLE', message: 'Parted uploads are off.' } },
          { status: 503 },
        );
      }
      state.created.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return reply({
        uploadId: 'upload-1',
        session: 'session-1',
        partBytes: RESUMABLE_UPLOAD_PART_BYTES,
        partCount: 3,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    if (url.pathname === '/api/files/uploads/upload-1/parts') {
      const { partNumbers } = JSON.parse(String(init?.body)) as { partNumbers: number[] };
      return reply({
        parts: partNumbers.map((partNumber) => ({
          partNumber,
          url: `https://storage.example.test/upload-1/${partNumber}`,
          method: 'PUT',
          headers: {},
        })),
      });
    }
    if (url.pathname === '/api/files/uploads/upload-1' && method === 'GET') {
      return reply({
        uploadId: 'upload-1',
        partBytes: RESUMABLE_UPLOAD_PART_BYTES,
        parts: [...state.stored].map(([partNumber, size]) => ({ partNumber, size })),
        bytesStored: [...state.stored.values()].reduce((sum, size) => sum + size, 0),
      });
    }
    if (url.pathname === '/api/files/uploads/upload-1' && method === 'DELETE') {
      state.aborted += 1;
      return reply({ aborted: true });
    }
    if (url.pathname === '/api/files/uploads/upload-1' && method === 'POST') {
      state.completedWith = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return reply({
        kind: 'chat-attachment',
        attachment: {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'report.pdf',
          mimeType: 'application/pdf',
          byteCount: BYTE_COUNT,
          type: 'file',
          url: '/api/files/00000000-0000-4000-8000-000000000001',
        },
      });
    }
    return reply({ error: 'unexpected' }, { status: 500 });
  }) as unknown as typeof globalThis.fetch;
}

function freshState(): ServerState {
  return { created: [], stored: new Map(), aborted: 0, completedWith: null, unavailable: false };
}

function upload(
  state: ServerState,
  overrides: { signal?: AbortSignal; onProgress?: (sent: number, total: number) => void } = {},
) {
  return uploadChatAttachmentInParts({
    uri: FILE_URI,
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    byteCount: BYTE_COUNT,
    baseUrl: 'https://api.test.local',
    fetchImpl: server(state),
    getHeaders: async () => ({ Authorization: 'Bearer test-token' }),
    assertCurrent: () => undefined,
    trackTask: () => () => undefined,
    signal: overrides.signal ?? new AbortController().signal,
    conversationId: 'conversation-1',
    ...(overrides.onProgress ? { onProgress: overrides.onProgress } : {}),
  });
}

beforeEach(() => {
  mockFiles.clear();
  mockFiles.set(FILE_URI, fileBytes());
  mockUploads.length = 0;
  mockPartOutcomes.length = 0;
  mockCancel.mockClear();
  (createUploadTask as jest.Mock).mockClear();
  partedChatUploadSessions.remove(
    'chat-attachment::' + CHECKSUM_OF(fileBytes()) + ':' + BYTE_COUNT,
  );
});

describe('uploadChatAttachmentInParts', () => {
  it('sends the file in part-sized ranges read from disk, with its checksum, and reports progress', async () => {
    const state = freshState();
    const progress: number[] = [];

    const attachment = await upload(state, { onProgress: (sent) => progress.push(sent) });

    expect(attachment?.id).toBe('00000000-0000-4000-8000-000000000001');
    expect(state.created[0]).toMatchObject({
      kind: 'chat-attachment',
      fileName: 'report.pdf',
      byteCount: BYTE_COUNT,
      checksumSha256: CHECKSUM_OF(fileBytes()),
    });
    expect(mockUploads.map((part) => part.url)).toEqual([
      'https://storage.example.test/upload-1/1',
      'https://storage.example.test/upload-1/2',
      'https://storage.example.test/upload-1/3',
    ]);
    expect(Buffer.concat(mockUploads.map((part) => part.body)).equals(fileBytes())).toBe(true);
    expect(Math.max(...mockUploads.map((part) => part.body.length))).toBe(
      RESUMABLE_UPLOAD_PART_BYTES,
    );
    expect(progress.at(-1)).toBe(BYTE_COUNT);
    expect(state.completedWith).toMatchObject({
      session: 'session-1',
      conversationId: 'conversation-1',
    });
    expect([...mockFiles.keys()]).toEqual([FILE_URI]);
  });

  it('survives a part that fails on the network by sending that part again', async () => {
    const state = freshState();
    mockPartOutcomes.push('ok', 'network');

    await expect(upload(state)).resolves.not.toBeNull();

    expect(mockUploads.map((part) => part.url.split('/').pop())).toEqual(['1', '2', '3']);
  });

  it('resumes from the parts storage holds when the upload is tried again', async () => {
    const state = freshState();
    mockPartOutcomes.push('ok', 'refused');

    await expect(upload(state)).rejects.toMatchObject({ status: 400 });
    expect(mockUploads).toHaveLength(1);
    state.stored.set(1, RESUMABLE_UPLOAD_PART_BYTES);

    await expect(upload(state)).resolves.not.toBeNull();

    expect(state.created).toHaveLength(1);
    expect(mockUploads.map((part) => part.url.split('/').pop())).toEqual(['1', '2', '3']);
  });

  it('cancels the native part upload and the server session when the reader cancels', async () => {
    const state = freshState();
    const controller = new AbortController();
    mockPartOutcomes.push('hang');

    const pending = upload(state, { signal: controller.signal });
    while ((createUploadTask as jest.Mock).mock.calls.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(state.aborted).toBe(1);
    expect(state.completedWith).toBeNull();
    expect([...mockFiles.keys()]).toEqual([FILE_URI]);
  });

  it('hands back to the single-request upload when the server cannot take parts', async () => {
    const state = freshState();
    state.unavailable = true;

    await expect(upload(state)).resolves.toBeNull();
    expect(mockUploads).toHaveLength(0);
  });
});
