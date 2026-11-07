import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH, MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS, managedCloudPublishedArtifactPath } from '@agiworkforce/cloud-contracts';
import { listPublishedSites, listPublishedSitesPage, readPublishedSite } from './sites-service';

const transport = vi.fn<typeof fetch>();
const token = 'a'.repeat(24);
const artifact = {
  token, artifactId: 'artifact-a', conversationId: null, title: 'Exact owner page',
  kind: 'html', language: null, contentChars: 10, version: 4, visibility: 'public',
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  shareUrl: `https://example.test/shared-artifact/${token}`, sandboxed: true,
};

beforeEach(() => { transport.mockReset(); vi.stubGlobal('fetch', transport); });
afterEach(() => vi.unstubAllGlobals());

describe('bounded publication clients (UNRUN source fixtures)', () => {
  it('makes one request per explicitly requested page without following the next cursor', async () => {
    transport.mockResolvedValueOnce(Response.json({ artifacts: [artifact], workspace: null, pageInfo: { nextCursor: 'opaque+/=cursor' } }));
    await expect(listPublishedSitesPage()).resolves.toEqual({ sites: [artifact], workspace: null, nextCursor: 'opaque+/=cursor' });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0]).toBe(MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH);
    transport.mockResolvedValueOnce(Response.json({ artifacts: [], workspace: null, pageInfo: { nextCursor: null } }));
    await expect(listPublishedSitesPage('opaque+/=cursor')).resolves.toEqual({ sites: [], workspace: null, nextCursor: null });
    expect(transport).toHaveBeenCalledTimes(2);
    const url = new URL(String(transport.mock.calls[1]![0]), 'https://example.test');
    expect(url.pathname).toBe(MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH);
    expect([...url.searchParams]).toEqual([['cursor', 'opaque+/=cursor']]);
  });

  it.each([undefined, null, {}, { nextCursor: undefined }, { nextCursor: '' }, { nextCursor: 0 }, { nextCursor: false }, { nextCursor: [] }])(
    'does not confuse invalid/missing pagination metadata with exhaustion: %j', async (pageInfo) => {
      transport.mockResolvedValue(Response.json({ artifacts: [], workspace: null, ...(pageInfo === undefined ? {} : { pageInfo }) }));
      await expect(listPublishedSitesPage()).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects a continuation cursor that does not advance', async () => {
    transport.mockResolvedValue(Response.json({ artifacts: [artifact], workspace: null, pageInfo: { nextCursor: 'same-cursor' } }));
    await expect(listPublishedSitesPage('same-cursor')).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('rejects a response larger than the shared page bound rather than rendering an unbounded inventory', async () => {
    transport.mockResolvedValue(Response.json({
      artifacts: Array.from({ length: MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS + 1 }, () => artifact),
      workspace: null, pageInfo: { nextCursor: null },
    }));
    await expect(listPublishedSitesPage()).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('keeps the legacy list reader compatible with an older response', async () => {
    transport.mockResolvedValue(Response.json({ artifacts: [artifact], workspace: null }));
    await expect(listPublishedSites()).resolves.toEqual({ sites: [artifact], workspace: null });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('looks up an exact owner token once without requesting an inventory', async () => {
    transport.mockResolvedValue(Response.json({ artifact, workspace: { memberCount: 3 } }));
    const controller = new AbortController();
    await expect(readPublishedSite(token, controller.signal)).resolves.toEqual({ site: artifact, workspace: { memberCount: 3 } });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(managedCloudPublishedArtifactPath(token), expect.objectContaining({ signal: controller.signal }));
  });

  it('rejects a valid detail body for a different token', async () => {
    transport.mockResolvedValue(Response.json({ artifact: { ...artifact, token: 'b'.repeat(24) }, workspace: null }));
    await expect(readPublishedSite(token)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('treats only owner detail 404 as absent without falling back to inventory', async () => {
    transport.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(readPublishedSite(token)).resolves.toBeNull();
    transport.mockResolvedValueOnce(Response.json({ error: 'Forbidden' }, { status: 403 }));
    await expect(readPublishedSite(token)).rejects.toThrow('Forbidden');
    expect(transport.mock.calls.map(([url]) => url)).toEqual([managedCloudPublishedArtifactPath(token), managedCloudPublishedArtifactPath(token)]);
  });
});
