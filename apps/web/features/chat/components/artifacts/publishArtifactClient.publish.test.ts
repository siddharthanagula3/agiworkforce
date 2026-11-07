import { describe, expect, it, vi } from 'vitest';
import { createWebCloudPublisher } from './publishArtifactClient';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/client/csrf')>(),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
}));

const artifact = {
  id: 'Receipt/Artifact?x=1+#片',
  title: 'Publication',
  content: '<h1>Publication</h1>',
  type: 'html',
};
const receipt = {
  artifactId: artifact.id,
  token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  shareUrl: 'https://example.test/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa',
  publishedAt: '2026-11-07T00:00:00.000Z',
  version: 2,
  kind: 'html',
  title: artifact.title,
  sandboxed: true,
  visibility: 'invited',
  workspace: null,
};

// UNRUN: WEB-PUBLICATION-QUOTA-ADMISSION-01 source-authored receipt fixtures.
describe('createWebCloudPublisher confirmed receipts', () => {
  it.each(['public', 'organization', 'invited'])('preserves confirmed %s metadata', async (visibility) => {
    const body = { ...receipt, visibility, workspace: { memberCount: 3 } };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    const onPublished = vi.fn();
    const publish = createWebCloudPublisher({ fetchImpl, onPublished });
    await expect(publish(artifact, 'managed')).resolves.toEqual({
      shareUrl: receipt.shareUrl, publishedAt: receipt.publishedAt,
    });
    expect(onPublished).toHaveBeenCalledExactlyOnceWith({
      shareUrl: receipt.shareUrl, visibility, workspace: { memberCount: 3 },
    }, artifact.id);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('captures the normalized submitted ID before awaiting the receipt', async () => {
    const mutableArtifact = { ...artifact, id: ` ${artifact.id} ` };
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      expect(JSON.parse(String(init?.body)).artifactId).toBe(artifact.id);
      mutableArtifact.id = 'another-artifact';
      return Response.json(receipt);
    });
    const onPublished = vi.fn();
    await createWebCloudPublisher({ fetchImpl, onPublished })(mutableArtifact, 'managed');
    expect(onPublished).toHaveBeenCalledExactlyOnceWith({
      shareUrl: receipt.shareUrl, visibility: 'invited', workspace: null,
    }, artifact.id);
  });

  it.each([
    {}, { shareUrl: receipt.shareUrl },
    ...['artifactId', 'token', 'visibility', 'version', 'publishedAt', 'kind', 'title', 'sandboxed', 'workspace']
      .map((field) => Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== field))),
    { ...receipt, artifactId: artifact.id.toLowerCase() },
    { ...receipt, visibility: 'future-audience' },
    { ...receipt, workspace: { memberCount: '3' } },
    { ...receipt, workspace: { memberCount: -1 } },
    { ...receipt, workspace: { memberCount: 1.5 } },
    { ...receipt, version: 0 },
    { ...receipt, token: 'invalid' },
    { ...receipt, shareUrl: 'javascript:alert(1)' },
    { ...receipt, shareUrl: 'https://example.test/shared-artifact/bbbbbbbbbbbbbbbbbbbbbbbb' },
    { ...receipt, shareUrl: `${receipt.shareUrl}?unverified=1` },
    { ...receipt, shareUrl: `${receipt.shareUrl}#unverified` },
  ])('does not confirm malformed, legacy or mismatched receipt %j', async (body) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    const onPublished = vi.fn();
    await expect(createWebCloudPublisher({ fetchImpl, onPublished })(artifact, 'managed'))
      .rejects.toThrow('Publication could not be confirmed');
    expect(onPublished).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports malformed JSON as unconfirmed without retrying', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{'));
    const onPublished = vi.fn();
    await expect(createWebCloudPublisher({ fetchImpl, onPublished })(artifact, 'managed'))
      .rejects.toThrow('The artifact may have been published');
    expect(onPublished).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 409, 429, 500])('does not confirm HTTP %s even with a valid-looking body', async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(receipt, { status }));
    const onPublished = vi.fn();
    await expect(createWebCloudPublisher({ fetchImpl, onPublished })(artifact, 'managed')).rejects.toThrow();
    expect(onPublished).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not confirm or retry an interrupted transport', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('interrupted'));
    const onPublished = vi.fn();
    await expect(createWebCloudPublisher({ fetchImpl, onPublished })(artifact, 'managed'))
      .rejects.toThrow('interrupted');
    expect(onPublished).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(['', ' ', 'x'.repeat(201)])('rejects invalid ID %j before POST', async (id) => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(createWebCloudPublisher({ fetchImpl })({ ...artifact, id }, 'managed')).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
