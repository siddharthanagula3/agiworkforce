import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  type ManagedCloudAccountWorkspaces,
} from '@agiworkforce/cloud-contracts';
import { MANAGED_MEMORY_MAX_PAGE_SIZE, type ManagedMemoryRecord } from '@agiworkforce/types';
import { useMemoryStore } from '@agiworkforce/unified-chat';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import {
  admitWorkspace,
  observeWorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';
import { cloudMemoryScopeKey, createCloudMemoryController } from '../cloud-memory-controller';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const personal: ManagedCloudAccountWorkspaces = {
  scope: 'personal',
  activeWorkspaceId: 'personal',
  activeOrganizationId: null,
  workspaces: [],
};
const organizationId = '11111111-1111-4111-8111-111111111111';
const organization: ManagedCloudAccountWorkspaces = {
  scope: 'organization',
  activeWorkspaceId: 'team',
  activeOrganizationId: organizationId,
  workspaces: [
    {
      id: 'team',
      kind: 'organization',
      organizationId,
      name: 'Fixture team',
      slug: 'fixture-team',
      isPrimary: false,
      role: 'member',
    },
  ],
};
const alwaysCurrent = () => true;
const cleanup: Array<() => void> = [];
let sequence = 0;
const transport = vi.fn<typeof fetch>();

function controller(
  data = personal,
  userId = `memory-account-${++sequence}`,
  sessionId = 'session-one',
) {
  let current = true;
  const session: SessionAuthority = {
    userId,
    sessionId,
    isCurrent: () => current,
    getToken: vi.fn(async () => `fixture-${userId}-${sessionId}`),
  };
  const owner = observeWorkspaceOwner(session)!;
  admitWorkspace(owner, owner.epoch, cloudMemoryScopeKey(data));
  const memory = createCloudMemoryController(owner, data);
  const retire = () => {
    current = false;
    memory.retire();
  };
  cleanup.push(retire);
  return { memory, owner, session, retire };
}

function record(id: string): ManagedMemoryRecord {
  return {
    id,
    content: `Saved ${id}`,
    category: null,
    source: 'web',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  transport.mockReset();
  transport.mockRejectedValue(new Error('Unexpected fixture request'));
  vi.stubGlobal('fetch', transport);
});
afterEach(() => {
  for (const retire of cleanup.splice(0)) retire();
  observeWorkspaceOwner(null);
  vi.unstubAllGlobals();
});

describe('cloud memory owner source fixtures (unexecuted)', () => {
  it.each([
    ['Personal', personal, MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE],
    ['organization', organization, organizationId],
  ] as const)(
    'uses exact admitted %s scope and session authorization',
    async (_name, data, header) => {
      const { memory, session } = controller(data);
      transport.mockResolvedValueOnce(response({ memories: [], hasMore: false }));
      await memory.hydrateFromServer();
      const [path, init] = transport.mock.calls[0]!;
      expect(path).toBe(`/api/memory?limit=${MANAGED_MEMORY_MAX_PAGE_SIZE}&offset=0`);
      expect(new Headers(init?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(header);
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        `Bearer fixture-${session.userId}-${session.sessionId}`,
      );
      expect(init?.credentials).toBe('omit');
      expect(init?.cache).toBe('no-store');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    },
  );

  it('rejects an unproven organization before any request', () => {
    const { owner } = controller();
    expect(() => createCloudMemoryController(owner, { ...organization, workspaces: [] })).toThrow();
    expect(() => createCloudMemoryController(owner, organization)).toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it('retires facts and queued work when admission discovers a different organization', async () => {
    const { memory, owner } = controller();
    transport.mockResolvedValueOnce(
      response({ memories: [record('personal-private')], hasMore: false }),
    );
    await memory.hydrateFromServer();
    expect(memory.getSnapshot().facts).toHaveLength(1);
    admitWorkspace(owner, owner.epoch, cloudMemoryScopeKey(organization));
    expect(memory.getSnapshot()).toMatchObject({ facts: [], syncStatus: 'unavailable' });
    await expect(memory.adapter(alwaysCurrent).clear()).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('pins Personal ownership on project writes and exports as well as reads', async () => {
    const { memory, session } = controller();
    transport
      .mockResolvedValueOnce(response({ memory: record('project-memory') }))
      .mockResolvedValueOnce(response({ memories: [record('project-memory')], hasMore: false }))
      .mockResolvedValueOnce(
        new Response('fixture export', {
          headers: { 'Content-Disposition': 'attachment; filename="fixture.json"' },
        }),
      );
    await memory.addProject('Project fact', 'project-one', alwaysCurrent);
    const exported = await memory.exportMemories(alwaysCurrent);
    expect(exported.filename).toBe('fixture.json');
    expect(transport.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ content: 'Project fact', source: 'web', projectId: 'project-one' }),
    );
    expect(transport.mock.calls[2]?.[0]).toBe('/api/memory/export');
    for (const [, init] of transport.mock.calls) {
      expect(new Headers(init?.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
        MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
      );
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        `Bearer fixture-${session.userId}-${session.sessionId}`,
      );
      expect(init?.credentials).toBe('omit');
    }
  });

  it('coalesces hydration and publishes only after every page completes', async () => {
    const { memory } = controller();
    const secondPage = deferred<Response>();
    const secondStarted = deferred<void>();
    const first = Array.from({ length: MANAGED_MEMORY_MAX_PAGE_SIZE }, (_, index) =>
      record(`row-${index}`),
    );
    transport
      .mockResolvedValueOnce(response({ memories: first, hasMore: true }))
      .mockImplementationOnce(() => {
        secondStarted.resolve();
        return secondPage.promise;
      });
    const hydration = memory.hydrateFromServer();
    expect(memory.hydrateFromServer()).toBe(hydration);
    await secondStarted.promise;
    expect(memory.getSnapshot().facts).toEqual([]);
    expect(transport.mock.calls[1]?.[0]).toBe(
      `/api/memory?limit=${MANAGED_MEMORY_MAX_PAGE_SIZE}&offset=${MANAGED_MEMORY_MAX_PAGE_SIZE}`,
    );
    secondPage.resolve(response({ memories: [record('last')], hasMore: false }));
    await hydration;
    expect(memory.getSnapshot().facts.map((fact) => fact.id)).toEqual([
      ...first.map((row) => row.id),
      'last',
    ]);
    expect(memory.getSnapshot().syncStatus).toBe('synced');
  });

  it('discards partial pagination when the next page fails or falsely promises more', async () => {
    const { memory } = controller();
    transport
      .mockResolvedValueOnce(response({ memories: [record('first')], hasMore: true }))
      .mockResolvedValueOnce(response({ memories: [], hasMore: true }));
    await expect(memory.hydrateFromServer()).rejects.toThrow('complete memory list');
    expect(memory.getSnapshot()).toMatchObject({ facts: [], syncStatus: 'error' });
    transport
      .mockResolvedValueOnce(response({ memories: [record('first')], hasMore: true }))
      .mockResolvedValueOnce(response({ error: 'unavailable' }, 503));
    await expect(memory.hydrateFromServer()).rejects.toThrow();
    expect(memory.getSnapshot()).toMatchObject({ facts: [], syncStatus: 'error' });
  });

  it.each([
    { memories: [record('replacement')] },
    { memories: [record('replacement')], hasMore: 'false' },
    { memories: [record('replacement'), null], hasMore: false },
  ])('retains confirmed facts and revision after a malformed first page %#', async (page) => {
    const { memory } = controller();
    transport.mockResolvedValueOnce(response({ memories: [record('confirmed')], hasMore: false }));
    await memory.hydrateFromServer();
    const confirmed = memory.getSnapshot();
    transport.mockResolvedValueOnce(response(page));
    await expect(memory.hydrateFromServer()).rejects.toThrow();
    expect(memory.getSnapshot()).toMatchObject({
      facts: confirmed.facts,
      revision: confirmed.revision,
      syncStatus: 'error',
      writeBlocked: false,
    });
    expect(memory.getSnapshot().facts).toBe(confirmed.facts);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([
    { memories: [record('last')] },
    { memories: [record('last')], hasMore: null },
    { memories: [record('last'), null], hasMore: false },
  ])('discards accumulated pages when a later receipt is malformed %#', async (page) => {
    const { memory } = controller();
    transport.mockResolvedValueOnce(response({ memories: [record('confirmed')], hasMore: false }));
    await memory.hydrateFromServer();
    const confirmed = memory.getSnapshot();
    transport
      .mockResolvedValueOnce(response({ memories: [record('partial')], hasMore: true }))
      .mockResolvedValueOnce(response(page));
    await expect(memory.hydrateFromServer()).rejects.toThrow();
    expect(memory.getSnapshot()).toMatchObject({
      facts: confirmed.facts,
      revision: confirmed.revision,
      syncStatus: 'error',
      writeBlocked: false,
    });
    expect(memory.getSnapshot().facts).toBe(confirmed.facts);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('serializes a mutation and its refresh behind an active read', async () => {
    const { memory } = controller();
    const read = deferred<Response>();
    const started = deferred<void>();
    transport
      .mockImplementationOnce(() => {
        started.resolve();
        return read.promise;
      })
      .mockResolvedValueOnce(response({ memory: record('new') }))
      .mockResolvedValueOnce(response({ memories: [record('new')], hasMore: false }));
    const hydration = memory.hydrateFromServer();
    await started.promise;
    const write = memory.adapter(alwaysCurrent).add('New fact');
    expect(transport).toHaveBeenCalledTimes(1);
    read.resolve(response({ memories: [], hasMore: false }));
    await Promise.all([hydration, write]);
    expect(transport.mock.calls.map(([, init]) => init?.method)).toEqual(['GET', 'POST', 'GET']);
    expect(memory.getSnapshot().facts.map((fact) => fact.id)).toEqual(['new']);
  });

  it('does not dispatch a queued mutation after its view closes', async () => {
    const { memory } = controller();
    const read = deferred<Response>();
    const started = deferred<void>();
    transport.mockImplementationOnce(() => {
      started.resolve();
      return read.promise;
    });
    const hydration = memory.hydrateFromServer();
    await started.promise;
    let open = true;
    const write = memory.adapter(() => open).add('Queued');
    const rejected = expect(write).rejects.toMatchObject({ name: 'AbortError' });
    open = false;
    read.resolve(response({ memories: [], hasMore: false }));
    await hydration;
    await rejected;
    expect(transport).toHaveBeenCalledTimes(1);
    expect(memory.getSnapshot().writeBlocked).toBe(false);
  });

  it.each(['account', 'session'] as const)(
    'blocks queued reads after %s replacement',
    async (replacement) => {
      const first = controller();
      const body = deferred<unknown>();
      const readingBody = deferred<void>();
      const delayed = response({});
      vi.spyOn(delayed, 'json').mockImplementation(() => {
        readingBody.resolve();
        return body.promise;
      });
      transport.mockResolvedValueOnce(delayed);
      const active = first.memory.hydrateFromServer();
      const activeRejected = expect(active).rejects.toMatchObject({ name: 'AbortError' });
      await readingBody.promise;
      const queued = first.memory.exportMemories(alwaysCurrent);
      const queuedRejected = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
      first.retire();
      const next = controller(
        personal,
        replacement === 'account' ? `replacement-${++sequence}` : first.session.userId,
        'session-two',
      );
      body.resolve({ memories: [record('old-private-fact')], hasMore: false });
      await Promise.all([activeRejected, queuedRejected]);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(first.memory.getSnapshot()).toMatchObject({ facts: [], syncStatus: 'unavailable' });
      expect(next.memory.getSnapshot().facts).toEqual([]);
    },
  );

  it('keeps an unknown write barrier across controller and session replacement', async () => {
    const first = controller();
    transport
      .mockRejectedValueOnce(new Error('connection lost after dispatch'))
      .mockResolvedValueOnce(response({ memories: [], hasMore: false }));
    await expect(first.memory.adapter(alwaysCurrent).add('Unknown result')).rejects.toThrow(
      'could not be confirmed',
    );
    expect(first.memory.getSnapshot().writeBlocked).toBe(true);
    first.retire();
    const next = controller(personal, first.session.userId, 'replacement-session');
    expect(next.memory.getSnapshot().writeBlocked).toBe(true);
    await expect(next.memory.adapter(alwaysCurrent).add('Do not retry')).rejects.toThrow(
      'could not be confirmed',
    );
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('does not dispatch or create an unknown-write barrier when retirement wins token resolution', async () => {
    const first = controller();
    const token = deferred<string>();
    const requested = deferred<void>();
    vi.mocked(first.session.getToken).mockImplementationOnce(() => {
      requested.resolve();
      return token.promise;
    });
    const write = first.memory.adapter(alwaysCurrent).add('Never dispatched');
    const rejected = expect(write).rejects.toMatchObject({ name: 'AbortError' });
    await requested.promise;
    first.retire();
    token.resolve('retired-fixture-token');
    await rejected;
    expect(transport).not.toHaveBeenCalled();
    const replacement = controller(personal, first.session.userId, 'replacement-session');
    expect(replacement.memory.getSnapshot().writeBlocked).toBe(false);
  });

  it('never publishes a late mutation body and carries its uncertainty into the replacement', async () => {
    const first = controller();
    const body = deferred<unknown>();
    const readingBody = deferred<void>();
    const delayed = response({});
    vi.spyOn(delayed, 'json').mockImplementation(() => {
      readingBody.resolve();
      return body.promise;
    });
    transport.mockResolvedValueOnce(delayed);
    const write = first.memory.adapter(alwaysCurrent).add('Late acknowledgement');
    const rejected = expect(write).rejects.toMatchObject({ name: 'AbortError' });
    await readingBody.promise;
    first.retire();
    body.resolve({ memory: record('retired-write') });
    await rejected;
    const replacement = controller(personal, first.session.userId, 'replacement-session');
    expect(replacement.memory.getSnapshot()).toMatchObject({ facts: [], writeBlocked: true });
    expect(first.memory.getSnapshot().facts).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('blocks replacement writes while an old dispatched mutation still awaits its body', async () => {
    const first = controller();
    const body = deferred<unknown>();
    const readingBody = deferred<void>();
    const delayed = response({});
    vi.spyOn(delayed, 'json').mockImplementation(() => {
      readingBody.resolve();
      return body.promise;
    });
    transport.mockResolvedValueOnce(delayed);
    const write = first.memory.adapter(alwaysCurrent).add('In flight');
    const rejected = expect(write).rejects.toMatchObject({ name: 'AbortError' });
    await readingBody.promise;
    first.retire();
    const replacement = controller(personal, first.session.userId, 'replacement-session');
    try {
      expect(replacement.memory.getSnapshot().writeBlocked).toBe(true);
      await expect(replacement.memory.adapter(alwaysCurrent).add('Unsafe retry')).rejects.toThrow(
        'could not be confirmed',
      );
      expect(transport).toHaveBeenCalledTimes(1);
    } finally {
      body.resolve({ memory: record('old-result') });
      await rejected;
    }
  });

  it('does not spread an unknown write barrier to another account or organization', async () => {
    const first = controller();
    transport
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce(response({ memories: [], hasMore: false }));
    await expect(first.memory.adapter(alwaysCurrent).add('Unknown')).rejects.toThrow();
    first.retire();
    const team = controller(organization, first.session.userId, 'team-session');
    expect(team.memory.getSnapshot().writeBlocked).toBe(false);
    team.retire();
    const other = controller();
    expect(other.memory.getSnapshot().writeBlocked).toBe(false);
  });

  it('does not call an acknowledged mutation failed when its refresh fails', async () => {
    const { memory } = controller();
    transport
      .mockResolvedValueOnce(response({ memory: record('acknowledged') }))
      .mockResolvedValueOnce(response({ error: 'Refresh unavailable' }, 503));
    await expect(memory.adapter(alwaysCurrent).add('Saved')).resolves.toEqual(
      record('acknowledged'),
    );
    expect(memory.getSnapshot()).toMatchObject({
      facts: [{ id: 'acknowledged', text: 'Saved acknowledged' }],
      syncStatus: 'error',
      writeBlocked: false,
      revision: 1,
    });
    expect(transport.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it.each(['add', 'update', 'remove', 'clear'] as const)(
    'keeps acknowledged %s successful after a malformed refresh',
    async (operation) => {
      const { memory } = controller();
      transport.mockResolvedValueOnce(
        response({ memories: [record('first'), record('second')], hasMore: false }),
      );
      await memory.hydrateFromServer();
      const revision = memory.getSnapshot().revision;
      const receipt =
        operation === 'add'
          ? { memory: record('added') }
          : operation === 'update'
            ? { memory: { ...record('first'), content: 'Updated' } }
            : operation === 'remove'
              ? { success: true }
              : { deleted: 2 };
      transport
        .mockResolvedValueOnce(response(receipt))
        .mockResolvedValueOnce(response({ memories: [record('partial')], hasMore: true }))
        .mockResolvedValueOnce(response({ memories: [record('last'), null], hasMore: false }));
      const adapter = memory.adapter(alwaysCurrent);
      if (operation === 'add') await expect(adapter.add('Saved')).resolves.toEqual(record('added'));
      else if (operation === 'update')
        await expect(adapter.update('first', 'Updated')).resolves.toBeDefined();
      else if (operation === 'remove') await expect(adapter.remove('first')).resolves.toBeDefined();
      else await expect(adapter.clear()).resolves.toBeDefined();
      expect(memory.getSnapshot()).toMatchObject({
        syncStatus: 'error',
        writeBlocked: false,
        revision: revision + 1,
      });
      expect(memory.getSnapshot().facts.map((fact) => fact.text)).toEqual(
        operation === 'add'
          ? ['Saved added', 'Saved first', 'Saved second']
          : operation === 'update'
            ? ['Updated', 'Saved second']
            : operation === 'remove'
              ? ['Saved second']
              : [],
      );
      expect(transport.mock.calls.filter(([, init]) => init?.method !== 'GET')).toHaveLength(1);
      expect(transport).toHaveBeenCalledTimes(4);
    },
  );

  it('does not reopen a mutation marker for its acknowledged-write refresh', async () => {
    const first = controller();
    const refresh = deferred<Response>();
    const refreshStarted = deferred<void>();
    transport
      .mockResolvedValueOnce(response({ memory: record('acknowledged') }))
      .mockImplementationOnce(() => {
        refreshStarted.resolve();
        return refresh.promise;
      });
    const write = first.memory.adapter(alwaysCurrent).add('Acknowledged before refresh');
    const rejected = expect(write).rejects.toMatchObject({ name: 'AbortError' });
    await refreshStarted.promise;
    expect(first.memory.getSnapshot().facts.map((fact) => fact.id)).toEqual(['acknowledged']);
    first.retire();
    const replacement = controller(personal, first.session.userId, 'replacement-session');
    expect(replacement.memory.getSnapshot().writeBlocked).toBe(false);
    refresh.resolve(response({ memories: [record('acknowledged')], hasMore: false }));
    await rejected;
    expect(replacement.memory.getSnapshot().writeBlocked).toBe(false);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each(['update', 'remove', 'clear'] as const)(
    'retains acknowledged %s reduction when refresh fails',
    async (operation) => {
      const { memory } = controller();
      transport.mockResolvedValueOnce(
        response({ memories: [record('first'), record('second')], hasMore: false }),
      );
      await memory.hydrateFromServer();
      transport
        .mockResolvedValueOnce(
          response(
            operation === 'update'
              ? { memory: { ...record('first'), content: 'Updated' } }
              : operation === 'remove'
                ? { success: true }
                : { deleted: 2 },
          ),
        )
        .mockResolvedValueOnce(response({ error: 'Refresh unavailable' }, 503));
      const adapter = memory.adapter(alwaysCurrent);
      if (operation === 'update') await adapter.update('first', 'Updated');
      else if (operation === 'remove') await adapter.remove('first');
      else await adapter.clear();
      expect(memory.getSnapshot()).toMatchObject({ syncStatus: 'error', writeBlocked: false });
      expect(memory.getSnapshot().facts.map((fact) => fact.text)).toEqual(
        operation === 'update'
          ? ['Updated', 'Saved second']
          : operation === 'remove'
            ? ['Saved second']
            : [],
      );
    },
  );

  it('does not poison the write barrier after a definite server rejection', async () => {
    const { memory } = controller();
    transport.mockResolvedValueOnce(response({ error: 'Not permitted' }, 403));
    await expect(memory.adapter(alwaysCurrent).add('Rejected')).rejects.toThrow();
    expect(memory.getSnapshot().writeBlocked).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([-1, 1.5, '2'])(
    'treats malformed clear count %s as an uncertain write',
    async (deleted) => {
      const { memory } = controller();
      transport
        .mockResolvedValueOnce(response({ deleted }))
        .mockResolvedValueOnce(response({ memories: [], hasMore: false }));
      await expect(memory.adapter(alwaysCurrent).clear()).rejects.toThrow('could not be confirmed');
      expect(memory.getSnapshot().writeBlocked).toBe(true);
      expect(transport.mock.calls.map(([, init]) => init?.method)).toEqual(['DELETE', 'GET']);
    },
  );

  it('does not read, replace, or auto-upload the legacy local backlog', async () => {
    const previous = useMemoryStore.getState();
    const facts = [
      {
        id: 'legacy-local-only',
        text: 'Never upload this backlog',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ];
    useMemoryStore.setState({ facts, syncStatus: 'unavailable' });
    try {
      const { memory } = controller();
      expect(transport).not.toHaveBeenCalled();
      transport.mockResolvedValueOnce(
        response({ memories: [record('cloud-only')], hasMore: false }),
      );
      await memory.hydrateFromServer();
      expect(useMemoryStore.getState().facts).toBe(facts);
      expect(useMemoryStore.getState().syncStatus).toBe('unavailable');
      expect(memory.getSnapshot().facts.map((fact) => fact.id)).toEqual(['cloud-only']);
      expect(transport.mock.calls.map(([, init]) => init?.method)).toEqual(['GET']);
    } finally {
      useMemoryStore.setState(previous, true);
    }
  });
});
