import { describe, expect, it, vi } from 'vitest';
import { publishChromeWebStore } from '../scripts/publish-chrome-web-store.mjs';

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function releaseOptions(fetchImpl: typeof fetch) {
  return {
    accessToken: 'short-lived-oidc-access-token',
    publisherId: 'publisher_123',
    extensionId,
    expectedVersion: '1.2.0',
    packageBytes: Buffer.from('verified zip bytes'),
    fetchImpl,
    sleep: vi.fn(async () => undefined),
  };
}

describe('Chrome Web Store publisher', () => {
  it('uploads the exact package and submits it for review with warnings blocked', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ itemId: extensionId }))
      .mockResolvedValueOnce(
        jsonResponse({ itemId: extensionId, crxVersion: '1.2.0', uploadState: 'SUCCEEDED' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ itemId: extensionId, state: 'PENDING_REVIEW', warningInfo: {} }),
      );

    const result = await publishChromeWebStore(releaseOptions(fetchImpl));

    expect(result).toEqual({
      outcome: 'submitted',
      version: '1.2.0',
      state: 'PENDING_REVIEW',
      warnings: 0,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [uploadUrl, uploadRequest] = fetchImpl.mock.calls[1];
    expect(String(uploadUrl)).toContain(
      `/upload/v2/publishers/publisher_123/items/${extensionId}:upload`,
    );
    expect(uploadRequest?.headers).toMatchObject({
      Authorization: 'Bearer short-lived-oidc-access-token',
      'Content-Type': 'application/zip',
    });
    const [, publishRequest] = fetchImpl.mock.calls[2];
    expect(JSON.parse(String(publishRequest?.body))).toEqual({
      publishType: 'DEFAULT_PUBLISH',
      skipReview: false,
      blockOnWarnings: true,
    });
  });

  it('is idempotent when the requested version is already published or submitted', async () => {
    const publishedFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        publishedItemRevisionStatus: {
          state: 'PUBLISHED',
          distributionChannels: [{ crxVersion: '1.2.0' }],
        },
      }),
    );
    await expect(publishChromeWebStore(releaseOptions(publishedFetch))).resolves.toMatchObject({
      outcome: 'already-published',
    });
    expect(publishedFetch).toHaveBeenCalledOnce();

    const submittedFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        submittedItemRevisionStatus: {
          state: 'PENDING_REVIEW',
          distributionChannels: [{ crxVersion: '1.2.0' }],
        },
      }),
    );
    await expect(publishChromeWebStore(releaseOptions(submittedFetch))).resolves.toMatchObject({
      outcome: 'already-submitted',
      state: 'PENDING_REVIEW',
    });
    expect(submittedFetch).toHaveBeenCalledOnce();
  });

  it('polls bounded async uploads and fails closed on policy or version conflicts', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ itemId: extensionId }))
      .mockResolvedValueOnce(jsonResponse({ uploadState: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(jsonResponse({ lastAsyncUploadState: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(jsonResponse({ lastAsyncUploadState: 'SUCCEEDED' }))
      .mockResolvedValueOnce(jsonResponse({ itemId: extensionId, state: 'PENDING_REVIEW' }));
    const options = releaseOptions(fetchImpl);

    await expect(publishChromeWebStore(options)).resolves.toMatchObject({ outcome: 'submitted' });
    expect(options.sleep).toHaveBeenCalledWith(5_000);

    const warnedFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ warned: true }));
    await expect(publishChromeWebStore(releaseOptions(warnedFetch))).rejects.toThrow(
      /policy warning/i,
    );

    const conflictFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        submittedItemRevisionStatus: {
          distributionChannels: [{ crxVersion: '1.1.9' }],
        },
      }),
    );
    await expect(publishChromeWebStore(releaseOptions(conflictFetch))).rejects.toThrow(
      /resolve it before uploading 1\.2\.0/i,
    );
  });

  it('rejects malformed publisher or item identifiers before making a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      publishChromeWebStore({ ...releaseOptions(fetchImpl), extensionId: '../../other-item' }),
    ).rejects.toThrow(/CWS_EXTENSION_ID/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
