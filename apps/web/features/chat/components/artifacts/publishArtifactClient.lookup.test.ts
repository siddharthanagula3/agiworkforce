import { describe, expect, it, vi } from 'vitest';
import { fetchArtifactPublication } from './publishArtifactClient';

const artifact = {
  token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  artifactId: 'Older/Artifact?x=1+#片',
  conversationId: null,
  title: 'Older artifact',
  kind: 'html',
  language: null,
  contentChars: 10,
  version: 1,
  visibility: 'invited',
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-01-01T00:00:00.000Z',
  shareUrl: 'https://example.test/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa',
  sandboxed: true,
};

// UNRUN: source-authored exact lookup client fixtures.
describe('fetchArtifactPublication exact lookup', () => {
  it('reads one exact ID independent of collection position and preserves restricted audience', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        artifact,
        workspace: { memberCount: 2 },
      }),
    );
    await expect(fetchArtifactPublication(` ${artifact.artifactId} `, fetchImpl)).resolves.toEqual({
      shareUrl: artifact.shareUrl,
      visibility: 'invited',
      workspace: { memberCount: 2 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [path, options] = fetchImpl.mock.calls[0]!;
    const url = new URL(String(path), 'https://example.test');
    expect(url.pathname).toBe('/api/artifacts/publish/lookup');
    expect(url.searchParams.get('artifactId')).toBe(artifact.artifactId);
    expect(options).toEqual({ credentials: 'include' });
  });

  it('returns null only for a validated successful explicit absence', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ artifact: null, workspace: null }));
    await expect(fetchArtifactPublication('absent', fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404, 429, 500])('rejects HTTP %s without list fallback', async (status) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: 'unavailable' }, { status }));
    await expect(fetchArtifactPublication('artifact-1', fetchImpl)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    {},
    { artifacts: [] },
    { artifact: null },
    { workspace: null },
    { artifact: { ...artifact, artifactId: artifact.artifactId.toLowerCase() }, workspace: null },
  ])('rejects malformed, legacy or wrong-identity response %j', async (body) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    await expect(fetchArtifactPublication(artifact.artifactId, fetchImpl)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid JSON and network errors instead of reporting absence', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{'))
      .mockRejectedValueOnce(new Error('offline'));
    await expect(fetchArtifactPublication('artifact-1', fetchImpl)).rejects.toThrow();
    await expect(fetchArtifactPublication('artifact-1', fetchImpl)).rejects.toThrow('offline');
  });

  it('rejects invalid IDs before fetching', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    for (const id of ['', ' ', 'x'.repeat(201)]) {
      await expect(fetchArtifactPublication(id, fetchImpl)).rejects.toThrow();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
