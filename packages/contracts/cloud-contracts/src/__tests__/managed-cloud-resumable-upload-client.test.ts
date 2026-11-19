import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createManagedCloudResumableUploadClient } from '../managed-cloud-resumable-upload-client';
import { managedCloudResumableUploadPath } from '../resumable-uploads';

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
    upload: () => client.upload({ file: new Blob(['x']), request }),
  };
}

describe('resumable upload completion recovery', () => {
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
