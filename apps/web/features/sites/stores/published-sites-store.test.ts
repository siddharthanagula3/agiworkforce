import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type SitesServiceModule = typeof import('../services/sites-service');

const mocks = vi.hoisted(() => ({ listPublishedSites: vi.fn() }));

vi.mock('../services/sites-service', async (importOriginal) => ({
  ...(await importOriginal<SitesServiceModule>()),
  listPublishedSites: (...args: unknown[]) => mocks.listPublishedSites(...args),
}));

const { usePublishedSite, usePublishedSitesStore } = await import('./published-sites-store');

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SHARE_URL = `https://agiworkforce.com/shared-artifact/${TOKEN}`;
type SiteList = Awaited<ReturnType<SitesServiceModule['listPublishedSites']>>;
const pendingLists: Array<{ resolve: (value: SiteList) => void; promise: Promise<SiteList> }> = [];

function deferredList() {
  let resolve!: (value: SiteList) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<SiteList>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  pendingLists.push({ resolve, promise });
  return { promise, resolve, reject };
}

function site(artifactId = 'artifact-1'): SiteList['sites'][number] {
  return {
    token: TOKEN,
    artifactId,
    conversationId: null,
    title: 'Published fixture',
    kind: 'html',
    language: null,
    contentChars: 10,
    version: 1,
    visibility: 'organization',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    shareUrl: SHARE_URL,
    sandboxed: true,
  };
}

afterEach(async () => {
  cleanup();
  usePublishedSitesStore.getState().hydrate([]);
  for (const pending of pendingLists) pending.resolve({ sites: [], workspace: null });
  await Promise.allSettled(pendingLists.map((pending) => pending.promise));
  pendingLists.length = 0;
  usePublishedSitesStore.getState().hydrate([]);
});

beforeEach(() => {
  usePublishedSitesStore.getState().hydrate([]);
  mocks.listPublishedSites.mockReset();
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

  it('shows a publish made from the panel at once, and forgets an unpublished site', async () => {
    const { result } = renderHook(() => usePublishedSite('artifact-9'));
    await waitFor(() => expect(usePublishedSitesStore.getState().status).toBe('ready'));

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
    const pending = deferredList();
    mocks.listPublishedSites.mockReturnValue(pending.promise);

    const loading = usePublishedSitesStore.getState().ensureLoaded();
    usePublishedSitesStore
      .getState()
      .record('artifact-9', { shareUrl: SHARE_URL, visibility: 'public' });
    pending.resolve({ sites: [], workspace: null });
    await loading;

    expect(usePublishedSitesStore.getState().byArtifactId['artifact-9']).toBeDefined();
  });

  it('admits only one lazy read while pending and none after it settles', async () => {
    const pending = deferredList();
    mocks.listPublishedSites.mockReturnValue(pending.promise);
    const loading = usePublishedSitesStore.getState().ensureLoaded();
    await usePublishedSitesStore.getState().ensureLoaded();
    expect(mocks.listPublishedSites).toHaveBeenCalledTimes(1);
    expect(usePublishedSitesStore.getState().status).toBe('loading');
    pending.resolve({ sites: [site()], workspace: null });
    await loading;
    await usePublishedSitesStore.getState().ensureLoaded();
    expect(mocks.listPublishedSites).toHaveBeenCalledTimes(1);
    expect(usePublishedSitesStore.getState().status).toBe('ready');
  });

  it.each(['absent', 'recorded'] as const)(
    'keeps a forgotten %s entry out of a late snapshot and retains unrelated entries',
    async (initial) => {
      const pending = deferredList();
      mocks.listPublishedSites.mockReturnValue(pending.promise);
      const loading = usePublishedSitesStore.getState().ensureLoaded();
      if (initial === 'recorded') {
        usePublishedSitesStore.getState().record('artifact-1', {
          shareUrl: SHARE_URL,
          visibility: 'public',
        });
      }
      usePublishedSitesStore.getState().forget('artifact-1');
      pending.resolve({ sites: [site(), site('artifact-2')], workspace: null });
      await loading;
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeUndefined();
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-2']).toMatchObject({
        visibility: 'organization',
      });
    },
  );

  it('keeps the latest record after forget ahead of a stale snapshot value', async () => {
    const pending = deferredList();
    mocks.listPublishedSites.mockReturnValue(pending.promise);
    const loading = usePublishedSitesStore.getState().ensureLoaded();
    usePublishedSitesStore.getState().forget('artifact-1');
    usePublishedSitesStore.getState().record('artifact-1', {
      shareUrl: SHARE_URL,
      visibility: 'public',
    });
    pending.resolve({ sites: [site(), site('artifact-2')], workspace: null });
    await loading;
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toMatchObject({
      visibility: 'public',
    });
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-2']).toBeDefined();
  });

  it.each(['success', 'error'] as const)(
    'ignores a lazy %s after explicit hydration and a subsequent forget',
    async (outcome) => {
      const pending = deferredList();
      mocks.listPublishedSites.mockReturnValue(pending.promise);
      const loading = usePublishedSitesStore.getState().ensureLoaded();
      usePublishedSitesStore.getState().hydrate([site(), site('artifact-2')]);
      usePublishedSitesStore.getState().forget('artifact-1');
      const hydrated = usePublishedSitesStore.getState();
      if (outcome === 'success') {
        pending.resolve({ sites: [site(), site('artifact-stale')], workspace: null });
      } else {
        pending.reject(new Error('Old lazy request failed'));
      }
      await loading;
      expect(usePublishedSitesStore.getState()).toBe(hydrated);
      expect(usePublishedSitesStore.getState().status).toBe('ready');
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeUndefined();
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-2']).toBeDefined();
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-stale']).toBeUndefined();
    },
  );

  it('publishes the merged lazy snapshot atomically to subscribers', async () => {
    const pending = deferredList();
    mocks.listPublishedSites.mockReturnValue(pending.promise);
    usePublishedSitesStore.getState().record('artifact-new', {
      shareUrl: SHARE_URL,
      visibility: 'public',
    });
    const loading = usePublishedSitesStore.getState().ensureLoaded();
    usePublishedSitesStore.getState().forget('artifact-1');
    const observed: Array<ReturnType<typeof usePublishedSitesStore.getState>> = [];
    const unsubscribe = usePublishedSitesStore.subscribe((state) => observed.push(state));
    try {
      pending.resolve({
        sites: [site(), site('artifact-2'), site('artifact-new')],
        workspace: null,
      });
      await loading;
      expect(observed).toHaveLength(1);
      expect(observed[0]?.status).toBe('ready');
      expect(observed[0]?.byArtifactId['artifact-new']).toMatchObject({ visibility: 'public' });
      expect(observed[0]?.byArtifactId['artifact-1']).toBeUndefined();
      expect(observed[0]?.byArtifactId['artifact-2']).toBeDefined();
    } finally {
      unsubscribe();
    }
  });

  it('preserves special artifact IDs as own keys when merging overrides', async () => {
    const pending = deferredList();
    mocks.listPublishedSites.mockReturnValue(pending.promise);
    const loading = usePublishedSitesStore.getState().ensureLoaded();
    usePublishedSitesStore.getState().record('__proto__', {
      shareUrl: SHARE_URL,
      visibility: 'public',
    });
    usePublishedSitesStore.getState().forget('constructor');
    pending.resolve({ sites: [site('__proto__'), site('constructor')], workspace: null });
    await loading;
    const entries = usePublishedSitesStore.getState().byArtifactId;
    expect(Object.hasOwn(entries, '__proto__')).toBe(true);
    expect(entries['__proto__']).toMatchObject({ visibility: 'public' });
    expect(Object.hasOwn(entries, 'constructor')).toBe(false);
    expect(Object.getPrototypeOf(entries)).toBe(Object.prototype);
  });

  it('allows a fresh hydrate and record to publish again after deletion', async () => {
    const pending = deferredList();
    mocks.listPublishedSites.mockReturnValue(pending.promise);
    const loading = usePublishedSitesStore.getState().ensureLoaded();
    usePublishedSitesStore.getState().forget('artifact-1');
    pending.resolve({ sites: [site()], workspace: null });
    await loading;
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeUndefined();
    usePublishedSitesStore.getState().hydrate([site()]);
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeDefined();
    usePublishedSitesStore.getState().forget('artifact-1');
    usePublishedSitesStore.getState().record('artifact-1', {
      shareUrl: SHARE_URL,
      visibility: 'public',
    });
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toMatchObject({
      visibility: 'public',
    });
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
