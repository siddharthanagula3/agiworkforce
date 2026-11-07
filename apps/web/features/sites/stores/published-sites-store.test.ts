import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
type SitesServiceModule = typeof import('../services/sites-service');

const mocks = vi.hoisted(() => ({ listPublishedSites: vi.fn() }));

vi.mock('../services/sites-service', async (importOriginal) => ({
  ...(await importOriginal<SitesServiceModule>()),
  listPublishedSites: (...args: unknown[]) => mocks.listPublishedSites(...args),
}));

const {
  usePublishedSite,
  usePublishedSitesStore,
  capturePublicationLease,
  isPublicationLeaseCurrent,
  beginPublicationCleanup,
} = await import('./published-sites-store');

function currentLease() {
  const lease = capturePublicationLease();
  if (!lease) throw new Error('Expected an open publication epoch');
  return lease;
}

const cleanupHandles: Array<() => void> = [];
function beginCleanup() {
  const finish = beginPublicationCleanup();
  cleanupHandles.push(finish);
  return finish;
}

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
  for (const finish of cleanupHandles.splice(0)) finish();
  beginPublicationCleanup()();
  for (const pending of pendingLists) pending.resolve({ sites: [], workspace: null });
  await Promise.allSettled(pendingLists.map((pending) => pending.promise));
  pendingLists.length = 0;
  beginPublicationCleanup()();
});

beforeEach(() => {
  beginPublicationCleanup()();
  mocks.listPublishedSites.mockReset();
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

    act(() => {
      usePublishedSitesStore
        .getState()
        .record('artifact-9', { shareUrl: SHARE_URL, visibility: 'public' }, currentLease());
    });
    expect(result.current).toMatchObject({ token: TOKEN, visibility: 'public' });

    act(() => {
      usePublishedSitesStore.getState().forget('artifact-9', currentLease());
    });
    expect(result.current).toBeNull();
  });

  it('keeps a publish recorded while the list was loading', async () => {
    const pending = deferredList();
    mocks.listPublishedSites.mockReturnValue(pending.promise);

    const loading = usePublishedSitesStore.getState().ensureLoaded(currentLease());
    usePublishedSitesStore
      .getState()
      .record('artifact-9', { shareUrl: SHARE_URL, visibility: 'public' }, currentLease());
    pending.resolve({ sites: [], workspace: null });
    await loading;

    expect(usePublishedSitesStore.getState().byArtifactId['artifact-9']).toBeDefined();
  });

  it('admits only one lazy read while pending and none after it settles', async () => {
    const pending = deferredList();
    mocks.listPublishedSites.mockReturnValue(pending.promise);
    const loading = usePublishedSitesStore.getState().ensureLoaded(currentLease());
    await usePublishedSitesStore.getState().ensureLoaded(currentLease());
    expect(mocks.listPublishedSites).toHaveBeenCalledTimes(1);
    expect(usePublishedSitesStore.getState().status).toBe('loading');
    pending.resolve({ sites: [site()], workspace: null });
    await loading;
    await usePublishedSitesStore.getState().ensureLoaded(currentLease());
    expect(mocks.listPublishedSites).toHaveBeenCalledTimes(1);
    expect(usePublishedSitesStore.getState().status).toBe('ready');
  });

  it.each(['absent', 'recorded'] as const)(
    'keeps a forgotten %s entry out of a late snapshot and retains unrelated entries',
    async (initial) => {
      const pending = deferredList();
      mocks.listPublishedSites.mockReturnValue(pending.promise);
      const loading = usePublishedSitesStore.getState().ensureLoaded(currentLease());
      if (initial === 'recorded') {
        usePublishedSitesStore.getState().record(
          'artifact-1',
          {
            shareUrl: SHARE_URL,
            visibility: 'public',
          },
          currentLease(),
        );
      }
      usePublishedSitesStore.getState().forget('artifact-1', currentLease());
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
    const loading = usePublishedSitesStore.getState().ensureLoaded(currentLease());
    usePublishedSitesStore.getState().forget('artifact-1', currentLease());
    usePublishedSitesStore.getState().record(
      'artifact-1',
      {
        shareUrl: SHARE_URL,
        visibility: 'public',
      },
      currentLease(),
    );
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
      const loading = usePublishedSitesStore.getState().ensureLoaded(currentLease());
      usePublishedSitesStore.getState().hydrate([site(), site('artifact-2')], currentLease());
      usePublishedSitesStore.getState().forget('artifact-1', currentLease());
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
    usePublishedSitesStore.getState().record(
      'artifact-new',
      {
        shareUrl: SHARE_URL,
        visibility: 'public',
      },
      currentLease(),
    );
    const loading = usePublishedSitesStore.getState().ensureLoaded(currentLease());
    usePublishedSitesStore.getState().forget('artifact-1', currentLease());
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
    const loading = usePublishedSitesStore.getState().ensureLoaded(currentLease());
    usePublishedSitesStore.getState().record(
      '__proto__',
      {
        shareUrl: SHARE_URL,
        visibility: 'public',
      },
      currentLease(),
    );
    usePublishedSitesStore.getState().forget('constructor', currentLease());
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
    const loading = usePublishedSitesStore.getState().ensureLoaded(currentLease());
    usePublishedSitesStore.getState().forget('artifact-1', currentLease());
    pending.resolve({ sites: [site()], workspace: null });
    await loading;
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeUndefined();
    usePublishedSitesStore.getState().hydrate([site()], currentLease());
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeDefined();
    usePublishedSitesStore.getState().forget('artifact-1', currentLease());
    usePublishedSitesStore.getState().record(
      'artifact-1',
      {
        shareUrl: SHARE_URL,
        visibility: 'public',
      },
      currentLease(),
    );
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toMatchObject({
      visibility: 'public',
    });
  });

  it('ignores a link that names no published artifact', () => {
    usePublishedSitesStore
      .getState()
      .record(
        'artifact-9',
        { shareUrl: 'https://example.com/elsewhere', visibility: 'public' },
        currentLease(),
      );
    expect(usePublishedSitesStore.getState().byArtifactId).toEqual({});
  });

  it('stays quiet when the list cannot be read', async () => {
    mocks.listPublishedSites.mockRejectedValue(new Error('401'));
    await usePublishedSitesStore.getState().ensureLoaded(currentLease());
    expect(usePublishedSitesStore.getState().status).toBe('error');
  });
});

describe('publication cleanup ownership', () => {
  it.each(['ready', 'error', 'loading'] as const)(
    'clears %s synchronously and rejects old writers throughout and after cleanup',
    async (status) => {
      const oldLease = currentLease();
      const pending = deferredList();
      mocks.listPublishedSites.mockReturnValue(pending.promise);
      const loading =
        status === 'ready' ? undefined : usePublishedSitesStore.getState().ensureLoaded(oldLease);
      if (status === 'ready') usePublishedSitesStore.getState().hydrate([site()], oldLease);
      if (status === 'error') {
        pending.reject(new Error('List unavailable'));
        await loading;
      }
      usePublishedSitesStore
        .getState()
        .record('artifact-1', { shareUrl: SHARE_URL, visibility: 'public' }, oldLease);
      expect(usePublishedSitesStore.getState().status).toBe(status);
      const finish = beginCleanup();
      expect(capturePublicationLease()).toBeNull();
      expect(isPublicationLeaseCurrent(oldLease)).toBe(false);
      expect(isPublicationLeaseCurrent(null)).toBe(false);
      expect(usePublishedSitesStore.getState()).toMatchObject({ byArtifactId: {}, status: 'idle' });
      const calls = mocks.listPublishedSites.mock.calls.length;
      for (const phase of ['blocked', 'reopened'] as const) {
        if (phase === 'reopened') finish();
        expect(usePublishedSitesStore.getState().hydrate([site()], oldLease)).toBe(false);
        expect(
          usePublishedSitesStore
            .getState()
            .record('artifact-1', { shareUrl: SHARE_URL, visibility: 'public' }, oldLease),
        ).toBe(false);
        expect(usePublishedSitesStore.getState().forget('artifact-1', oldLease)).toBe(false);
        await usePublishedSitesStore.getState().ensureLoaded(oldLease);
        expect(mocks.listPublishedSites).toHaveBeenCalledTimes(calls);
        expect(usePublishedSitesStore.getState()).toMatchObject({
          byArtifactId: {},
          status: 'idle',
        });
      }
      expect(currentLease()).not.toBe(oldLease);
      expect(isPublicationLeaseCurrent(currentLease())).toBe(true);
      pending.resolve({ sites: [site()], workspace: null });
      await loading;
      expect(usePublishedSitesStore.getState().byArtifactId).toEqual({});
    },
  );

  it.each(['success', 'error'] as const)(
    'keeps a fresh pending load and its overlays after old %s/finally',
    async (outcome) => {
      const oldLease = currentLease();
      const old = deferredList();
      const fresh = deferredList();
      mocks.listPublishedSites.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
      const oldLoad = usePublishedSitesStore.getState().ensureLoaded(oldLease);
      beginCleanup()();
      const lease = currentLease();
      const freshLoad = usePublishedSitesStore.getState().ensureLoaded(lease);
      usePublishedSitesStore.getState().forget('artifact-1', lease);
      usePublishedSitesStore
        .getState()
        .record('artifact-new', { shareUrl: SHARE_URL, visibility: 'public' }, lease);
      const before = usePublishedSitesStore.getState();
      if (outcome === 'success') old.resolve({ sites: [site('artifact-old')], workspace: null });
      else old.reject(new Error('Retired request'));
      await oldLoad;
      expect(usePublishedSitesStore.getState()).toBe(before);
      await usePublishedSitesStore.getState().ensureLoaded(lease);
      expect(mocks.listPublishedSites).toHaveBeenCalledTimes(2);
      fresh.resolve({ sites: [site(), site('artifact-2'), site('artifact-new')], workspace: null });
      await freshLoad;
      expect(usePublishedSitesStore.getState().status).toBe('ready');
      expect(usePublishedSitesStore.getState().byArtifactId).toEqual({
        'artifact-2': expect.objectContaining({ visibility: 'organization' }),
        'artifact-new': expect.objectContaining({ visibility: 'public' }),
      });
    },
  );

  it('waits for the last cleanup handle and ignores duplicate finishes in either epoch', () => {
    const oldLease = currentLease();
    const first = beginCleanup();
    const second = beginCleanup();
    first();
    first();
    expect(capturePublicationLease()).toBeNull();
    second();
    const fresh = currentLease();
    expect(fresh).not.toBe(oldLease);
    second();
    expect(currentLease()).toBe(fresh);
    const third = beginCleanup();
    first();
    second();
    expect(capturePublicationLease()).toBeNull();
    third();
    expect(currentLease()).not.toBe(fresh);
  });

  it('allows cleanup to reenter its synchronous notification without reopening early', () => {
    let nestedFinish: (() => void) | undefined;
    let entered = false;
    const unsubscribe = usePublishedSitesStore.subscribe((state) => {
      if (state.lease === null && !entered) {
        entered = true;
        nestedFinish = beginCleanup();
      }
    });
    try {
      const finish = beginCleanup();
      expect(entered).toBe(true);
      finish();
      expect(capturePublicationLease()).toBeNull();
      if (!nestedFinish) throw new Error('Nested cleanup did not start');
      nestedFinish();
      expect(capturePublicationLease()).not.toBeNull();
    } finally {
      unsubscribe();
    }
  });

  it('does not launch a lazy request if loading notification starts cleanup', async () => {
    const lease = currentLease();
    const unsubscribe = usePublishedSitesStore.subscribe((state) => {
      if (state.status === 'loading') beginCleanup();
    });
    try {
      await usePublishedSitesStore.getState().ensureLoaded(lease);
      expect(mocks.listPublishedSites).not.toHaveBeenCalled();
      expect(usePublishedSitesStore.getState()).toMatchObject({
        lease: null,
        status: 'idle',
        byArtifactId: {},
      });
    } finally {
      unsubscribe();
    }
  });

  it.each(['hydrate', 'record', 'forget'] as const)(
    'reports a %s invalidated by synchronous notification as rejected',
    (operation) => {
      const lease = currentLease();
      usePublishedSitesStore.getState().hydrate([site()], lease);
      let entered = false;
      const unsubscribe = usePublishedSitesStore.subscribe(() => {
        if (!entered) {
          entered = true;
          beginCleanup();
        }
      });
      try {
        const state = usePublishedSitesStore.getState();
        const accepted =
          operation === 'hydrate'
            ? state.hydrate([site('replacement')], lease)
            : operation === 'record'
              ? state.record('replacement', { shareUrl: SHARE_URL, visibility: 'public' }, lease)
              : state.forget('artifact-1', lease);
        expect(accepted).toBe(false);
        expect(usePublishedSitesStore.getState()).toMatchObject({
          lease: null,
          byArtifactId: {},
          status: 'idle',
        });
      } finally {
        unsubscribe();
      }
    },
  );

  it.each(['success', 'error'] as const)(
    'reloads a mounted artifact once after the final cleanup finishes, with %s and no retry loop',
    async (outcome) => {
      const hook = renderHook(() => usePublishedSite('artifact-1'));
      await waitFor(() => expect(hook.result.current).not.toBeNull());
      const next = deferredList();
      mocks.listPublishedSites.mockReturnValue(next.promise);
      let first!: () => void;
      let second!: () => void;
      act(() => {
        first = beginCleanup();
        second = beginCleanup();
      });
      expect(hook.result.current).toBeNull();
      act(() => first());
      hook.rerender();
      expect(mocks.listPublishedSites).toHaveBeenCalledTimes(1);
      act(() => second());
      await waitFor(() => expect(mocks.listPublishedSites).toHaveBeenCalledTimes(2));
      await act(async () => {
        if (outcome === 'success') next.resolve({ sites: [site()], workspace: null });
        else next.reject(new Error('Unavailable'));
        await Promise.allSettled([next.promise]);
      });
      expect(usePublishedSitesStore.getState().status).toBe(
        outcome === 'success' ? 'ready' : 'error',
      );
      hook.rerender();
      await act(async () => {
        await Promise.resolve();
      });
      expect(mocks.listPublishedSites).toHaveBeenCalledTimes(2);
      expect(hook.result.current === null).toBe(outcome === 'error');
    },
  );
});
