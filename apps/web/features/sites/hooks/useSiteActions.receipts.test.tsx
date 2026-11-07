import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useSiteActions } from './useSiteActions';
import type { PublishedSite } from '../services/sites-service';
import { beginPublicationCleanup, capturePublicationLease, usePublishedSitesStore } from '../stores/published-sites-store';

vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();
const site: PublishedSite = {
  token: 'a'.repeat(24), artifactId: 'artifact-1', conversationId: null,
  title: 'Scoreboard', kind: 'html', language: null, contentChars: 12, version: 1,
  visibility: 'public', createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z', sandboxed: true,
  shareUrl: `https://example.test/shared-artifact/${'a'.repeat(24)}`,
};
const receipt = {
  token: site.token, shareUrl: site.shareUrl, title: site.title, visibility: 'invited',
  organizationId: null, updatedAt: '2026-11-07T00:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  beginPublicationCleanup()();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'X-CSRF-Token': 'update-csrf' });
});
afterEach(() => {
  cleanup();
  beginPublicationCleanup()();
  vi.unstubAllGlobals();
});

function setup() {
  const lease = capturePublicationLease()!;
  usePublishedSitesStore.getState().hydrate([site], lease);
  const onUpdated = vi.fn();
  const onUnpublished = vi.fn();
  const hook = renderHook(() => useSiteActions({ lease, onUpdated, onUnpublished }));
  return { ...hook, onUpdated, onUnpublished };
}

describe('real Sites helper, action and publication cache receipt boundary', () => {
  it.each([
    ['wrong target', { ...receipt, token: 'b'.repeat(24), shareUrl: `https://example.test/shared-artifact/${'b'.repeat(24)}` }],
    ['wrong audience', { ...receipt, visibility: 'organization' }],
    ['legacy URL', { ...receipt, shareUrl: 'legacy-link' }],
    ['empty receipt', {}],
  ])('does not adopt %s in the cache or callback', async (_name, response) => {
    const { result, onUpdated, onUnpublished } = setup();
    const before = usePublishedSitesStore.getState().byArtifactId;
    fetchMock.mockResolvedValue(Response.json(response));
    await act(async () => {
      await expect(result.current.setVisibility(site, 'invited')).rejects.toThrow('It may have taken effect');
    });
    expect(usePublishedSitesStore.getState().byArtifactId).toBe(before);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(onUnpublished).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('adopts a matching audience receipt through the real helper and cache', async () => {
    const { result, onUpdated } = setup();
    fetchMock.mockResolvedValue(Response.json(receipt));
    await act(async () => result.current.setVisibility(site, 'invited'));
    expect(usePublishedSitesStore.getState().byArtifactId[site.artifactId]).toMatchObject({
      token: site.token, shareUrl: site.shareUrl, visibility: 'invited',
    });
    expect(onUpdated).toHaveBeenCalledExactlyOnceWith({
      token: site.token, artifactId: site.artifactId,
      changes: { visibility: 'invited', shareUrl: site.shareUrl, updatedAt: receipt.updatedAt },
    });
  });

  it('does not emit a rename callback for a different target', async () => {
    const { result, onUpdated } = setup();
    fetchMock.mockResolvedValue(Response.json({ ...receipt, token: 'b'.repeat(24), shareUrl: `https://example.test/shared-artifact/${'b'.repeat(24)}` }));
    await act(async () => {
      await expect(result.current.rename(site, 'New name')).rejects.toThrow('It may have taken effect');
    });
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('emits the server policy-redacted title without changing audience state', async () => {
    const { result, onUpdated } = setup();
    const before = usePublishedSitesStore.getState().byArtifactId;
    fetchMock.mockResolvedValue(Response.json({ ...receipt, title: '[REDACTED]', visibility: 'public' }));
    await act(async () => result.current.rename(site, 'Sensitive name'));
    expect(onUpdated).toHaveBeenCalledExactlyOnceWith({
      token: site.token, artifactId: site.artifactId,
      changes: { title: '[REDACTED]', updatedAt: receipt.updatedAt },
    });
    expect(usePublishedSitesStore.getState().byArtifactId).toBe(before);
  });

  it('does not adopt even a valid receipt after publication cleanup', async () => {
    const { result, onUpdated } = setup();
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise((done) => { resolve = done; }));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.setVisibility(site, 'invited'); });
    act(() => beginPublicationCleanup()());
    await act(async () => {
      resolve(Response.json(receipt));
      await expect(pending).rejects.toThrow('no longer available');
    });
    expect(usePublishedSitesStore.getState().byArtifactId).toEqual({});
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
