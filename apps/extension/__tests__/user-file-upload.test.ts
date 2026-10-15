/** @vitest-environment node */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserFileChecksum,
  parseBrowserUploadBinding,
  parseBrowserUploadedFilesMetadata,
  resolveUploadedUserFiles,
  uploadSelectedUserFiles,
  type BrowserUploadBinding,
  type BrowserUploadedFileMetadata,
} from '../src/features/computer-use/userFileUpload';
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
} from '@agiworkforce/cloud-contracts';

type FreeTrialClientModule = typeof import('../src/features/cloud-bridge/freeTrialClient');

const auth = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../src/features/cloud-bridge/freeTrialClient', async (importOriginal) => ({
  ...(await importOriginal<FreeTrialClientModule>()),
  getManagedCloudAuthContext: auth.get,
}));

const owner = { accountId: 'account-a', authIncarnation: 'session-a' };
const binding: BrowserUploadBinding = {
  requestId: 'request-a',
  runId: 'run-a',
  runGeneration: 1,
  tabId: 17,
  tabUrl: 'https://approved.example/upload',
  targetSignature: 'input|file|file||Upload',
  owner,
};
const fileId = '00000000-0000-4000-8000-000000000001';
const bytes = new TextEncoder().encode('synthetic browser upload fixture');
const fetchMock = vi.fn<typeof fetch>();

async function approvedFile(): Promise<BrowserUploadedFileMetadata> {
  return {
    attachment: {
      id: fileId,
      name: 'fixture.txt',
      mimeType: 'text/plain',
      byteCount: bytes.length,
      type: 'file',
      url: `/api/files/${fileId}`,
    },
    checksumSha256: await browserFileChecksum(bytes),
  };
}

beforeEach(() => {
  vi.stubEnv('VITE_AGI_WEB_API_BASE_URL', 'http://localhost:3000');
  vi.stubEnv('VITE_API_BASE_URL', '');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  auth.get.mockReset().mockResolvedValue({ owner, token: 'owned-token' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('user-approved browser file upload', () => {
  it('uses the canonical inspected pipeline and only returns its completed reference', async () => {
    const metadata = await approvedFile();
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          storageKey: 'chat-attachments/account-a/fixture.txt',
          uploadUrl: 'http://localhost:3000/api/uploads/chat-attachment/put?key=owned',
          uploadMethod: 'PUT',
          uploadHeaders: { 'Content-Type': 'text/plain' },
        }),
      )
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ attachment: metadata.attachment }));
    const result = await uploadSelectedUserFiles(
      [new File([bytes], 'fixture.txt', { type: 'text/plain' })],
      binding,
    );
    expect(result).toEqual([metadata]);
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/api/uploads/presign',
      '/api/uploads/chat-attachment/put',
      '/api/uploads/chat-attachment/complete',
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
      temporary: true,
    });
    expect(fetchMock.mock.calls.every(([, options]) => options?.redirect === 'error')).toBe(true);
  });

  it('refuses a failed inspection and never returns a usable file grant', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          storageKey: 'chat-attachments/account-a/fixture.txt',
          uploadUrl: 'https://storage.example/private',
          uploadMethod: 'PUT',
          uploadHeaders: {},
        }),
      )
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: 'File inspection rejected this upload.' } },
          { status: 400 },
        ),
      );
    await expect(
      uploadSelectedUserFiles([new File([bytes], 'fixture.txt', { type: 'text/plain' })], binding),
    ).rejects.toThrow('inspection rejected');
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).has('Authorization')).toBe(false);
  });

  it('refuses excessive files or bytes before authentication or egress', async () => {
    const files = Array.from(
      { length: MAX_CHAT_ATTACHMENT_COUNT + 1 },
      () => new File(['x'], 'fixture.txt', { type: 'text/plain' }),
    );
    await expect(uploadSelectedUserFiles(files, binding)).rejects.toThrow('budget');
    await expect(
      uploadSelectedUserFiles(
        [
          new File([new Uint8Array(MAX_CHAT_ATTACHMENT_BYTES + 1)], 'fixture.txt', {
            type: 'text/plain',
          }),
        ],
        binding,
      ),
    ).rejects.toThrow('budget');
    expect(auth.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves only the protected configured-origin file and verifies the approved bytes', async () => {
    const metadata = await approvedFile();
    fetchMock.mockResolvedValue(
      new Response(bytes, { headers: { 'Content-Length': String(bytes.length) } }),
    );
    const result = await resolveUploadedUserFiles([metadata], binding);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/files/${fileId}`,
      expect.objectContaining({ redirect: 'error', credentials: 'omit' }),
    );
    expect(result.files[0]?.reference).toMatchObject({
      owner: { userId: owner.accountId },
      checksumSha256: metadata.checksumSha256,
      sourceSurface: 'chrome',
    });
    expect(result.files[0]?.bytes).toEqual(bytes);
  });

  it('refuses arbitrary paths, URLs, malformed bindings, and oversized metadata before egress', async () => {
    const metadata = await approvedFile();
    for (const url of [
      'file:///private/secret.txt',
      'https://untrusted.example/file',
      `/api/files/${fileId}/../../admin`,
      `/api/files/${fileId}?token=unsafe`,
    ]) {
      expect(
        parseBrowserUploadedFilesMetadata([
          { ...metadata, attachment: { ...metadata.attachment, url } },
        ]),
      ).toBeNull();
    }
    expect(
      parseBrowserUploadBinding({
        ...binding,
        tabUrl: 'https://user:password@approved.example/upload',
      }),
    ).toBeNull();
    expect(
      parseBrowserUploadedFilesMetadata([
        {
          ...metadata,
          attachment: { ...metadata.attachment, byteCount: MAX_CHAT_ATTACHMENT_BYTES + 1 },
        },
      ]),
    ).toBeNull();
    await expect(
      resolveUploadedUserFiles(
        [
          {
            ...metadata,
            attachment: { ...metadata.attachment, url: 'https://untrusted.example/file' },
          },
        ],
        binding,
      ),
    ).rejects.toThrow('No inspected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses account changes, cancellation, oversized streams, and changed bytes', async () => {
    const metadata = await approvedFile();
    auth.get.mockResolvedValue({
      owner: { accountId: 'account-b', authIncarnation: 'session-b' },
      token: 'other-token',
    });
    await expect(resolveUploadedUserFiles([metadata], binding)).rejects.toThrow('account changed');
    expect(fetchMock).not.toHaveBeenCalled();
    auth.get.mockResolvedValue({ owner, token: 'owned-token' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      resolveUploadedUserFiles([metadata], binding, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(bytes.length + 1)));
    await expect(resolveUploadedUserFiles([metadata], binding)).rejects.toThrow(
      'exceeds the approved',
    );
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(bytes.length)));
    await expect(resolveUploadedUserFiles([metadata], binding)).rejects.toThrow('do not match');
  });

  it('rejects a stale action after file retrieval before returning resolved bytes', async () => {
    const metadata = await approvedFile();
    let current = true;
    fetchMock.mockImplementation(async () => {
      current = false;
      return new Response(bytes);
    });
    await expect(
      resolveUploadedUserFiles([metadata], binding, {
        assertCurrent: () => {
          if (!current) throw new Error('Run or upload target changed.');
        },
      }),
    ).rejects.toThrow('target changed');
  });
});
