import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemoryStore } from '../memoryStore';

describe('memoryStore', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', undefined);
    useMemoryStore.setState({ facts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds local memory facts newest first and ignores blank facts', async () => {
    expect(await useMemoryStore.getState().add('')).toBeNull();

    const first = await useMemoryStore.getState().add('I prefer Python for data work.');
    const second = await useMemoryStore.getState().add('Use concise answers.');

    expect(first?.text).toBe('I prefer Python for data work.');
    expect(second?.text).toBe('Use concise answers.');
    expect(useMemoryStore.getState().facts.map((fact) => fact.text)).toEqual([
      'Use concise answers.',
      'I prefer Python for data work.',
    ]);
  });

  it('returns the existing fact for case-insensitive duplicates', async () => {
    const first = await useMemoryStore.getState().add('I prefer Python.');
    const duplicate = await useMemoryStore.getState().add('i prefer python.');

    expect(duplicate?.id).toBe(first?.id);
    expect(useMemoryStore.getState().facts).toHaveLength(1);
  });

  it('updates, removes, and clears local memory facts', async () => {
    const fact = await useMemoryStore.getState().add('Prefer TypeScript.');
    expect(fact).not.toBeNull();

    await useMemoryStore.getState().update(fact!.id, 'Prefer Rust for systems work.');
    expect(useMemoryStore.getState().facts[0]?.text).toBe('Prefer Rust for systems work.');

    await useMemoryStore.getState().remove(fact!.id);
    expect(useMemoryStore.getState().facts).toHaveLength(0);

    await useMemoryStore.getState().add('Remember local mode.');
    await useMemoryStore.getState().clear();
    expect(useMemoryStore.getState().facts).toHaveLength(0);
  });
});

describe('memoryStore pinning', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', undefined);
    useMemoryStore.setState({ facts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pins and unpins a local fact', async () => {
    const created = await useMemoryStore.getState().add('Prefers metric units');
    expect(created).not.toBeNull();
    const id = created!.id;

    await useMemoryStore.getState().setPinned(id, true);
    expect(useMemoryStore.getState().facts.find((f) => f.id === id)?.pinned).toBe(true);

    await useMemoryStore.getState().setPinned(id, false);
    expect(useMemoryStore.getState().facts.find((f) => f.id === id)?.pinned).toBe(false);
  });

  it('refuses to pin a fact the server has not acknowledged yet', async () => {
    useMemoryStore.setState({
      facts: [
        {
          id: 'pending-1',
          text: 'Still saving',
          pending: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    await useMemoryStore.getState().setPinned('pending-1', true);
    expect(useMemoryStore.getState().facts[0]?.pinned).toBeUndefined();
  });
});

describe('memoryStore account transitions', () => {
  const fact = (id: string, text: string) => ({
    id,
    serverId: id,
    text,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  beforeEach(() => useMemoryStore.getState().resetOnLogout());
  afterEach(() => {
    useMemoryStore.getState().resetOnLogout();
    vi.unstubAllGlobals();
  });

  it('does not send an old draft after its CSRF request finishes in another account', async () => {
    let finish!: (response: Response) => void;
    const csrf = new Promise<Response>((resolve) => (finish = resolve));
    const fetchMock = vi.fn(async (path: string) => {
      if (path === '/api/csrf') return csrf;
      throw new Error('Stale mutation reached the network');
    });
    vi.stubGlobal('fetch', fetchMock);
    const saving = useMemoryStore
      .getState()
      .add('Old account draft')
      .catch(() => null);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    useMemoryStore.getState().resetOnLogout();
    finish(json({ token: 'old-csrf', expiresIn: 3_600_000 }));
    await saving;
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/csrf']);
    expect(useMemoryStore.getState().facts).toEqual([]);
  });

  it('does not restore a previous account after a delayed memory read', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
    );
    const loading = useMemoryStore.getState().hydrateFromServer();
    useMemoryStore.getState().resetOnLogout();
    finish(
      json({
        memories: [
          {
            id: 'old-server',
            content: 'Old account memory',
            category: null,
            source: 'web',
            pinned: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );
    await loading;
    expect(useMemoryStore.getState().facts).toEqual([]);
    expect(useMemoryStore.getState().syncStatus).toBe('idle');
  });

  it('does not roll a failed deletion back into the next account', async () => {
    let fail!: (error: Error) => void;
    const deletion = new Promise<Response>((_resolve, reject) => (fail = reject));
    const fetchMock = vi.fn(async (path: string) =>
      path === '/api/csrf' ? json({ token: 'csrf', expiresIn: 3_600_000 }) : deletion,
    );
    vi.stubGlobal('fetch', fetchMock);
    useMemoryStore.setState({ facts: [fact('old', 'Old account memory')] });
    const deleting = useMemoryStore
      .getState()
      .remove('old')
      .catch(() => undefined);
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => path.endsWith('/old'))).toBe(true),
    );
    useMemoryStore.getState().resetOnLogout();
    useMemoryStore.setState({ facts: [fact('new', 'New account memory')] });
    fail(new Error('Offline'));
    await deleting;
    expect(useMemoryStore.getState().facts).toEqual([fact('new', 'New account memory')]);
  });

  it('still reads and saves memory for the unchanged account', async () => {
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/csrf') return json({ token: 'csrf', expiresIn: 3_600_000 });
      if (init?.method === 'POST')
        return json({
          memory: {
            id: 'saved',
            content: 'Current account memory',
            category: null,
            source: 'web',
            pinned: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        });
      return json({ memories: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    await useMemoryStore.getState().hydrateFromServer();
    const saved = await useMemoryStore.getState().add('Current account memory');
    expect(saved?.serverId).toBe('saved');
    expect(saved?.pending).toBe(false);
    expect(useMemoryStore.getState().facts).toHaveLength(1);
  });

  it.each(['update', 'pin'] as const)(
    'does not roll a failed %s back into the next account',
    async (operation) => {
      let fail!: (error: Error) => void;
      const response = new Promise<Response>((_resolve, reject) => (fail = reject));
      const fetchMock = vi.fn(async (path: string) =>
        path === '/api/csrf' ? json({ token: 'csrf', expiresIn: 3_600_000 }) : response,
      );
      vi.stubGlobal('fetch', fetchMock);
      useMemoryStore.setState({ facts: [fact('same-id', 'Old account memory')] });
      const saving = (
        operation === 'update'
          ? useMemoryStore.getState().update('same-id', 'Old account edit')
          : useMemoryStore.getState().setPinned('same-id', true)
      ).catch(() => undefined);
      await vi.waitFor(() =>
        expect(fetchMock.mock.calls.some(([path]) => path.endsWith('/same-id'))).toBe(true),
      );
      useMemoryStore.getState().resetOnLogout();
      useMemoryStore.setState({ facts: [fact('same-id', 'New account memory')] });
      fail(new Error('Offline'));
      await saving;
      expect(useMemoryStore.getState().facts).toEqual([fact('same-id', 'New account memory')]);
    },
  );

  it('does not clear the next account after an older deletion succeeds', async () => {
    let finish!: (response: Response) => void;
    const deletion = new Promise<Response>((resolve) => (finish = resolve));
    const fetchMock = vi.fn(async (path: string) =>
      path === '/api/csrf' ? json({ token: 'csrf', expiresIn: 3_600_000 }) : deletion,
    );
    vi.stubGlobal('fetch', fetchMock);
    useMemoryStore.setState({ facts: [fact('old', 'Old account memory')] });
    const clearing = useMemoryStore
      .getState()
      .clear()
      .catch(() => undefined);
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => path === '/api/memory')).toBe(true),
    );
    useMemoryStore.getState().resetOnLogout();
    useMemoryStore.setState({ facts: [fact('new', 'New account memory')] });
    finish(json({ success: true }));
    await clearing;
    expect(useMemoryStore.getState().facts).toEqual([fact('new', 'New account memory')]);
  });
});
