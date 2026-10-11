import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
type SitesServiceModule = typeof import('../services/sites-service');

const mocks = vi.hoisted(() => ({ listPublishedSites: vi.fn() }));

vi.mock('../services/sites-service', async (importOriginal) => ({
  ...(await importOriginal<SitesServiceModule>()),
  listPublishedSites: (...args: unknown[]) => mocks.listPublishedSites(...args),
}));

const { usePublishedSite, usePublishedSitesStore } = await import('./published-sites-store');

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SHARE_URL = `https://agiworkforce.com/shared-artifact/${TOKEN}`;

beforeEach(() => {
  usePublishedSitesStore.setState({ byArtifactId: {}, status: 'idle' });
  mocks.listPublishedSites.mockResolvedValue({
    sites: [
      {
        token: TOKEN,
        artifactId: 'artifact-1',
        shareUrl: SHARE_URL,
        visibility: 'organization',
      },
    ],
    workspace: null,
  });
});

describe('published sites store', () => {
  it('gives a chat artifact its live publication, loading the list once', async () => {
    const first = renderHook(() => usePublishedSite('artifact-1'));
    renderHook(() => usePublishedSite('artifact-2'));

    await waitFor(() =>
      expect(first.result.current).toEqual({
        token: TOKEN,
        shareUrl: SHARE_URL,
        visibility: 'organization',
        sitePath: `/chat/sites/${TOKEN}`,
      }),
    );
    expect(mocks.listPublishedSites).toHaveBeenCalledTimes(1);
  });

  it('answers null for an artifact that was never published', async () => {
    const { result } = renderHook(() => usePublishedSite('artifact-2'));
    await waitFor(() => expect(usePublishedSitesStore.getState().status).toBe('ready'));
    expect(result.current).toBeNull();
  });

  it('shows a publish made from the panel at once, and forgets an unpublished site', () => {
    const { result } = renderHook(() => usePublishedSite('artifact-9'));

    act(() =>
      usePublishedSitesStore
        .getState()
        .record('artifact-9', { shareUrl: SHARE_URL, visibility: 'public' }),
    );
    expect(result.current).toMatchObject({ token: TOKEN, visibility: 'public' });

    act(() => usePublishedSitesStore.getState().forget('artifact-9'));
    expect(result.current).toBeNull();
  });

  it('keeps a publish recorded while the list was loading', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.listPublishedSites.mockReturnValue(new Promise((done) => (resolve = done)));

    const loading = usePublishedSitesStore.getState().ensureLoaded();
    usePublishedSitesStore
      .getState()
      .record('artifact-9', { shareUrl: SHARE_URL, visibility: 'public' });
    resolve({ sites: [], workspace: null });
    await loading;

    expect(usePublishedSitesStore.getState().byArtifactId['artifact-9']).toBeDefined();
  });

  it('ignores a link that names no published artifact', () => {
    usePublishedSitesStore
      .getState()
      .record('artifact-9', { shareUrl: 'https://example.com/elsewhere', visibility: 'public' });
    expect(usePublishedSitesStore.getState().byArtifactId).toEqual({});
  });

  it('stays quiet when the list cannot be read', async () => {
    mocks.listPublishedSites.mockRejectedValue(new Error('401'));
    await usePublishedSitesStore.getState().ensureLoaded();
    expect(usePublishedSitesStore.getState().status).toBe('error');
  });
});
