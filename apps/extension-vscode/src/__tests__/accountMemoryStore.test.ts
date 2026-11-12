import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import {
  AccountMemoryStore,
  ACCOUNT_MEMORY_CACHE_KEY,
  ACCOUNT_MEMORY_CURSOR_KEY,
  ACCOUNT_MEMORY_VERSIONS_KEY,
  WORKSPACE_MEMORY_ADOPTED_KEY,
  WORKSPACE_MEMORY_DECLINED_KEY,
  COPY_WORKSPACE_NOTES_ACTION,
  describeRefusals,
  jwtSubject,
} from '../memory/accountMemoryStore';
import { MEMORY_STORE_KEY } from '../memory/memoryStore';
import { Config } from '../platform/config';
import {
  AccountMemoryUnauthorizedError,
  INITIAL_CURSOR,
  type AccountMemoryClient,
  type MemoryDelta,
  type MemoryPushItem,
  type MemoryPushResponse,
} from '../memory/accountMemoryClient';

function makeMemento(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get: <T>(key: string): T | undefined => values.get(key) as T | undefined,
    update: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    keys: () => [...values.keys()] as readonly string[],
    setKeysForSync: vi.fn(),
  };
}

function makeSecrets(token: string | undefined) {
  return {
    get: vi.fn(async (key: string) => (key === 'agiWorkforce.accountToken' ? token : undefined)),
    store: vi.fn(),
    delete: vi.fn(),
    onDidChange: vi.fn(),
  } as unknown as vscode.SecretStorage;
}

function delta(overrides: Partial<MemoryDelta> = {}): MemoryDelta {
  return {
    id: 'm1',
    content: 'Prefer Rust for command-line tools',
    category: null,
    source: 'web',
    pinned: false,
    is_deleted: false,
    created_at: '2026-09-13T00:00:00.000Z',
    updated_at: '2026-09-13T00:00:00.000Z',
    server_version: '7',
    ...overrides,
  };
}

function makeClient(overrides: Partial<AccountMemoryClient> = {}): AccountMemoryClient {
  return {
    pull: vi.fn(async () => ({ memories: [], cursor: INITIAL_CURSOR, hasMore: false })),
    pullAll: vi.fn(async () => ({ memories: [], cursor: INITIAL_CURSOR, hasMore: false })),
    readScope: vi.fn(async () => ({ organizationId: null, workspaceName: null })),
    deleteAll: vi.fn(async () => undefined),
    push: vi.fn(async (): Promise<MemoryPushResponse> => ({
      protocolVersion: 2,
      applied: [],
      conflicts: [],
      rejected: [],
      cursor: INITIAL_CURSOR,
    })),
    ...overrides,
  };
}

const SIGNED_IN_TOKEN = `header.${Buffer.from(JSON.stringify({ sub: 'user_abc' })).toString('base64url')}.sig`;

describe('AccountMemoryStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never touches the network while signed out, and says so', async () => {
    const client = makeClient();
    const store = new AccountMemoryStore(
      makeMemento(),
      makeSecrets(undefined),
      makeMemento(),
      client,
    );

    const state = await store.refresh();

    expect(state.status).toBe('signed-out');
    expect(state.detail).toContain('Sign in');
    expect(client.pullAll).not.toHaveBeenCalled();
    expect(client.push).not.toHaveBeenCalled();
  });

  it('refuses a write while signed out instead of reporting it as saved', async () => {
    const client = makeClient();
    const store = new AccountMemoryStore(
      makeMemento(),
      makeSecrets(undefined),
      makeMemento(),
      client,
    );

    const added = await store.add('Prefer Rust');

    expect(added.applied).toBe(false);
    expect(added.refusals[0]).toContain('Sign in');
    expect(client.push).not.toHaveBeenCalled();
    expect(store.cachedFacts()).toEqual([]);
  });

  it('caches what the account holds and records each row version', async () => {
    const storage = makeMemento();
    const client = makeClient({
      pullAll: vi.fn(async () => ({
        memories: [delta()],
        cursor: '7',
        hasMore: false,
      })),
    });
    const store = new AccountMemoryStore(
      storage,
      makeSecrets(SIGNED_IN_TOKEN),
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      client,
    );

    const state = await store.refresh();

    expect(state.status).toBe('ready');
    expect(state.facts.map((fact) => fact.text)).toEqual(['Prefer Rust for command-line tools']);
    expect(storage.get<Record<string, string>>(ACCOUNT_MEMORY_VERSIONS_KEY)).toEqual({ m1: '7' });
  });

  it('drops a memory the account has tombstoned', async () => {
    const storage = makeMemento();
    const workspaceState = makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true });
    const secrets = makeSecrets(SIGNED_IN_TOKEN);
    let page = { memories: [delta()], cursor: '7', hasMore: false };
    const client = makeClient({ pullAll: vi.fn(async () => page) });
    const store = new AccountMemoryStore(storage, secrets, workspaceState, client);

    await store.refresh();
    expect(store.cachedFacts()).toHaveLength(1);

    page = {
      memories: [delta({ is_deleted: true, server_version: '8' })],
      cursor: '8',
      hasMore: false,
    };
    await store.refresh();
    expect(store.cachedFacts()).toEqual([]);
  });

  it('still pulls a delete another device made between its pull and its own push', async () => {
    const storage = makeMemento();
    const pullAll = vi.fn(async (cursor: string) =>
      cursor === INITIAL_CURSOR
        ? {
            memories: [delta(), delta({ id: 'm2', content: 'Use pnpm', server_version: '8' })],
            cursor: '8',
            hasMore: false,
          }
        : {
            memories: [
              delta({ id: 'm2', is_deleted: true, server_version: '9' }),
              delta({ id: 'm3', content: 'Prefer tabs', server_version: '10' }),
            ],
            cursor: '10',
            hasMore: false,
          },
    );
    const push = vi.fn(async (items: MemoryPushItem[]): Promise<MemoryPushResponse> => ({
      protocolVersion: 2,
      applied: items.map((item) => ({ id: item.id, server_version: '10' })),
      conflicts: [],
      rejected: [],
      cursor: '10',
    }));
    const store = new AccountMemoryStore(
      storage,
      makeSecrets(SIGNED_IN_TOKEN),
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      makeClient({ pullAll, push }),
    );

    await store.refresh();
    await store.add('Prefer tabs');
    expect(storage.get(ACCOUNT_MEMORY_CURSOR_KEY)).toBe('8');
    await store.refresh();

    expect(pullAll).toHaveBeenLastCalledWith('8');
    expect(store.cachedFacts().map((fact) => fact.id)).not.toContain('m2');
  });

  it('shows an unscoped cache but keeps it out of turns until a full pull replaces it', async () => {
    const storage = makeMemento({
      [ACCOUNT_MEMORY_CACHE_KEY]: [
        { id: 'old', text: 'Another workspace fact', createdAt: '2026-09-01T00:00:00.000Z' },
      ],
      [ACCOUNT_MEMORY_CURSOR_KEY]: '40',
    });
    const pullAll = vi.fn(async () => {
      throw new Error('offline');
    });
    const store = new AccountMemoryStore(
      storage,
      makeSecrets(SIGNED_IN_TOKEN),
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      makeClient({ pullAll }),
    );

    const offline = await store.refresh();
    expect(offline.facts.map((fact) => fact.id)).toEqual(['old']);
    expect(await store.turnFacts()).toEqual([]);
    expect(pullAll).toHaveBeenLastCalledWith(INITIAL_CURSOR);

    pullAll.mockImplementation(async () => ({ memories: [delta()], cursor: '7', hasMore: false }));
    await store.refresh();

    expect(pullAll).toHaveBeenLastCalledWith(INITIAL_CURSOR);
    expect(store.cachedFacts().map((fact) => fact.id)).toEqual(['m1']);
    expect((await store.turnFacts()).map((fact) => fact.id)).toEqual(['m1']);
  });

  it('stops adding cached memory to turns once the account is signed out', async () => {
    let token: string | undefined = SIGNED_IN_TOKEN;
    const secrets = {
      get: vi.fn(async (key: string) => (key === 'agiWorkforce.accountToken' ? token : undefined)),
      store: vi.fn(),
      delete: vi.fn(),
      onDidChange: vi.fn(),
    } as unknown as vscode.SecretStorage;
    const store = new AccountMemoryStore(
      makeMemento(),
      secrets,
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      makeClient({
        pullAll: vi.fn(async () => ({ memories: [delta()], cursor: '7', hasMore: false })),
      }),
    );
    await store.refresh();
    expect(await store.turnFacts()).toHaveLength(1);

    token = undefined;
    expect(await store.turnFacts()).toEqual([]);

    token = `header.${Buffer.from(JSON.stringify({ sub: 'user_other' })).toString('base64url')}.sig`;
    expect(await store.turnFacts()).toEqual([]);
  });

  it('forgets the cached memory, its owner and its scope on sign-out', async () => {
    const storage = makeMemento();
    const store = new AccountMemoryStore(
      storage,
      makeSecrets(SIGNED_IN_TOKEN),
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      makeClient({
        pullAll: vi.fn(async () => ({ memories: [delta()], cursor: '7', hasMore: false })),
      }),
    );
    await store.refresh();
    const changed = vi.fn();
    store.onDidChange(changed);

    await store.forgetLocalCache();

    expect(store.cachedFacts()).toEqual([]);
    expect(store.scope()).toBeUndefined();
    expect(await store.turnFacts()).toEqual([]);
    expect(storage.get(ACCOUNT_MEMORY_CURSOR_KEY)).toBeUndefined();
    expect(storage.get('agiWorkforce.accountMemoryOwner')).toBeUndefined();
    expect(changed).toHaveBeenCalled();
  });

  it('sends an update at the version the account last reported', async () => {
    const storage = makeMemento();
    const push = vi.fn(async (items: MemoryPushItem[]): Promise<MemoryPushResponse> => ({
      protocolVersion: 2,
      applied: items.map((item) => ({ id: item.id, server_version: '9' })),
      conflicts: [],
      rejected: [],
      cursor: '9',
    }));
    const client = makeClient({
      pullAll: vi.fn(async () => ({ memories: [delta()], cursor: '7', hasMore: false })),
      push,
    });
    const store = new AccountMemoryStore(
      storage,
      makeSecrets(SIGNED_IN_TOKEN),
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      client,
    );

    await store.refresh();
    await store.update('m1', 'Prefer Go for command-line tools');

    expect(push.mock.calls[0]![0]).toEqual([
      expect.objectContaining({ id: 'm1', baseVersion: '7', source: 'vscode' }),
    ]);
    expect(store.cachedFacts()[0]!.text).toBe('Prefer Go for command-line tools');
  });

  it('sends a new memory as an insert and keeps nothing the account refused', async () => {
    const client = makeClient({
      push: vi.fn(async (items: MemoryPushItem[]) => ({
        protocolVersion: 2 as const,
        applied: [],
        conflicts: [],
        rejected: [{ id: items[0]!.id, term: 'password' }],
        cursor: INITIAL_CURSOR,
      })),
    });
    const store = new AccountMemoryStore(
      makeMemento(),
      makeSecrets(SIGNED_IN_TOKEN),
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      client,
    );

    const added = await store.add('my password is hunter2');

    expect(added.applied).toBe(false);
    expect(added.refusals[0]).toContain('password');
    expect(store.cachedFacts()).toEqual([]);
  });

  it('adopts the account version when another client wins a conflict', async () => {
    const storage = makeMemento();
    const client = makeClient({
      pullAll: vi.fn(async () => ({ memories: [delta()], cursor: '7', hasMore: false })),
      push: vi.fn(async () => ({
        protocolVersion: 2 as const,
        applied: [],
        conflicts: [{ id: 'm1', current: delta({ server_version: '31' }) }],
        rejected: [],
        cursor: '31',
      })),
    });
    const store = new AccountMemoryStore(
      storage,
      makeSecrets(SIGNED_IN_TOKEN),
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      client,
    );

    await store.refresh();
    const updated = await store.update('m1', 'a losing edit');

    expect(updated.applied).toBe(false);
    expect(updated.refusals[0]).toContain('account copy wins');
    expect(storage.get<Record<string, string>>(ACCOUNT_MEMORY_VERSIONS_KEY)).toEqual({ m1: '31' });
    expect(store.cachedFacts()[0]!.text).toBe('Prefer Rust for command-line tools');
  });

  it('reports an expired session as signed out rather than as an empty account', async () => {
    const client = makeClient({
      pullAll: vi.fn(async () => {
        throw new AccountMemoryUnauthorizedError();
      }),
    });
    const store = new AccountMemoryStore(
      makeMemento(),
      makeSecrets(SIGNED_IN_TOKEN),
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      client,
    );

    const state = await store.refresh();
    expect(state.status).toBe('signed-out');
  });

  it('keeps showing the cached copy when the account cannot be reached', async () => {
    const storage = makeMemento({
      [ACCOUNT_MEMORY_CACHE_KEY]: [
        { id: 'm1', text: 'Prefer Rust', createdAt: '2026-09-13T00:00:00.000Z' },
      ],
    });
    const client = makeClient({
      pullAll: vi.fn(async () => {
        throw new Error('connection refused');
      }),
    });
    const store = new AccountMemoryStore(
      storage,
      makeSecrets(SIGNED_IN_TOKEN),
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      client,
    );

    const state = await store.refresh();

    expect(state.status).toBe('unreachable');
    expect(state.detail).toContain('connection refused');
    expect(state.facts.map((fact) => fact.text)).toEqual(['Prefer Rust']);
  });

  it('keeps a forgotten memory out of turns when the follow-up read fails', async () => {
    const storage = makeMemento();
    const pullAll = vi
      .fn<AccountMemoryClient['pullAll']>()
      .mockResolvedValueOnce({ memories: [delta()], cursor: '7', hasMore: false });
    const client = makeClient({
      pullAll,
      deleteAll: vi.fn(async () => {
        pullAll.mockRejectedValue(new Error('connection refused'));
      }),
    });
    const store = new AccountMemoryStore(
      storage,
      makeSecrets(SIGNED_IN_TOKEN),
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      client,
    );
    await store.refresh();
    expect(await store.turnFacts()).toHaveLength(1);

    const cleared = await store.clear();

    expect(cleared).toEqual({ applied: true, refusals: [] });
    expect(await store.turnFacts()).toEqual([]);
    expect(store.cachedFacts()).toEqual([]);
    expect(storage.get<Record<string, string>>(ACCOUNT_MEMORY_VERSIONS_KEY)).toEqual({});
  });

  it('does not restore a forgotten memory from a read that began before the forget', async () => {
    const storage = makeMemento();
    let releaseStale: (() => void) | undefined;
    const pullAll = vi
      .fn<AccountMemoryClient['pullAll']>()
      .mockResolvedValueOnce({ memories: [delta()], cursor: '7', hasMore: false })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseStale = () =>
              resolve({ memories: [delta({ server_version: '8' })], cursor: '8', hasMore: false });
          }),
      )
      .mockResolvedValue({ memories: [], cursor: '9', hasMore: false });
    const store = new AccountMemoryStore(
      storage,
      makeSecrets(SIGNED_IN_TOKEN),
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      makeClient({ pullAll, deleteAll: vi.fn(async () => undefined) }),
    );
    await store.refresh();

    const stale = store.refresh();
    await vi.waitFor(() => expect(releaseStale).toBeDefined());
    await store.clear();
    releaseStale?.();
    await stale;

    expect(await store.turnFacts()).toEqual([]);
  });

  function legacyWorkspace() {
    return makeMemento({
      [MEMORY_STORE_KEY]: [
        { id: 'mem_1', text: 'Prefer tabs', createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
  }

  function acceptingPush() {
    return vi.fn(async (items: MemoryPushItem[]) => ({
      protocolVersion: 2 as const,
      applied: items.map((item) => ({ id: item.id, server_version: '2' })),
      conflicts: [],
      rejected: [],
      cursor: '2',
    }));
  }

  it('copies notes an earlier version saved here only after the user agrees, exactly once', async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
      COPY_WORKSPACE_NOTES_ACTION as never,
    );
    const workspaceState = legacyWorkspace();
    const push = acceptingPush();
    const store = new AccountMemoryStore(
      makeMemento(),
      makeSecrets(SIGNED_IN_TOKEN),
      workspaceState,
      makeClient({ push }),
    );

    await store.refresh();
    await vi.waitFor(() => expect(workspaceState.get(WORKSPACE_MEMORY_ADOPTED_KEY)).toBe(true));
    expect(vscode.window.showInformationMessage).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![0][0]).toEqual(
      expect.objectContaining({ content: 'Prefer tabs', baseVersion: INITIAL_CURSOR }),
    );
    expect(store.cachedFacts().map((fact) => fact.text)).toEqual(['Prefer tabs']);

    await store.refresh();
    expect(push).toHaveBeenCalledTimes(1);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledOnce();
  });

  it('uploads nothing and asks nothing while memory is off', async () => {
    const memory = vi.spyOn(Config, 'memoryEnabled').mockReturnValue(false);
    const workspaceState = legacyWorkspace();
    const push = acceptingPush();
    const store = new AccountMemoryStore(
      makeMemento(),
      makeSecrets(SIGNED_IN_TOKEN),
      workspaceState,
      makeClient({ push }),
    );

    await store.refresh();
    await new Promise((resolve) => setTimeout(resolve, 0));

    memory.mockRestore();
    expect(push).not.toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    expect(workspaceState.get(WORKSPACE_MEMORY_ADOPTED_KEY)).toBeUndefined();
  });

  it('asks again later when the prompt is dismissed without a choice', async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);
    const workspaceState = legacyWorkspace();
    const push = acceptingPush();
    const store = new AccountMemoryStore(
      makeMemento(),
      makeSecrets(SIGNED_IN_TOKEN),
      workspaceState,
      makeClient({ push }),
    );

    await store.refresh();
    await vi.waitFor(() => expect(vscode.window.showInformationMessage).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(workspaceState.get(WORKSPACE_MEMORY_DECLINED_KEY)).toBeUndefined();

    await store.refresh();
    await vi.waitFor(() => expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2));
    expect(push).not.toHaveBeenCalled();
  });

  it('asks each account once and uploads nothing when the user does not agree', async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
      "Don't copy" as unknown as vscode.MessageItem,
    );
    const workspaceState = legacyWorkspace();
    const push = acceptingPush();
    const store = new AccountMemoryStore(
      makeMemento(),
      makeSecrets(SIGNED_IN_TOKEN),
      workspaceState,
      makeClient({ push }),
    );

    await store.refresh();
    await vi.waitFor(() =>
      expect(workspaceState.get(WORKSPACE_MEMORY_DECLINED_KEY)).toEqual(['user_abc']),
    );
    await store.refresh();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vscode.window.showInformationMessage).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
    expect(workspaceState.get(WORKSPACE_MEMORY_ADOPTED_KEY)).toBeUndefined();
  });

  it('discards a cache that belongs to a different account', async () => {
    const storage = makeMemento({
      [ACCOUNT_MEMORY_CACHE_KEY]: [
        { id: 'other', text: 'Another account fact', createdAt: '2026-09-13T00:00:00.000Z' },
      ],
      'agiWorkforce.accountMemoryOwner': 'user_previous',
    });
    const store = new AccountMemoryStore(
      storage,
      makeSecrets(SIGNED_IN_TOKEN),
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      makeClient(),
    );

    await store.refresh();

    expect(store.cachedFacts()).toEqual([]);
    expect(storage.get('agiWorkforce.accountMemoryOwner')).toBe('user_abc');
  });

  it('adopts a cache written before the account was recorded, then takes the account copy', async () => {
    const storage = makeMemento({
      [ACCOUNT_MEMORY_CACHE_KEY]: [
        { id: 'm1', text: 'Prefer Rust', createdAt: '2026-09-13T00:00:00.000Z' },
      ],
    });
    const store = new AccountMemoryStore(
      storage,
      makeSecrets(SIGNED_IN_TOKEN),
      makeMemento({ [WORKSPACE_MEMORY_ADOPTED_KEY]: true }),
      makeClient({
        pullAll: vi.fn(async () => ({
          memories: [delta({ content: 'Prefer Rust' })],
          cursor: '7',
          hasMore: false,
        })),
      }),
    );

    await store.refresh();

    expect(store.cachedFacts().map((fact) => fact.text)).toEqual(['Prefer Rust']);
    expect(storage.get('agiWorkforce.accountMemoryOwner')).toBe('user_abc');
  });
});

describe('describeRefusals', () => {
  const item: MemoryPushItem = {
    id: 'm1',
    content: 'Prefer Rust',
    source: 'vscode',
    baseVersion: INITIAL_CURSOR,
  };

  it('reports nothing when the account stored everything', () => {
    expect(
      describeRefusals([item], {
        protocolVersion: 2,
        applied: [{ id: 'm1', server_version: '3' }],
        conflicts: [],
        rejected: [],
        cursor: '3',
      }),
    ).toEqual([]);
  });

  it('names the policy term when the account refused the content', () => {
    const [message] = describeRefusals([item], {
      protocolVersion: 2,
      applied: [],
      conflicts: [],
      rejected: [{ id: 'm1', term: 'secret' }],
      cursor: INITIAL_CURSOR,
    });
    expect(message).toContain('memory policy');
    expect(message).toContain('secret');
  });
});

describe('jwtSubject', () => {
  it('reads the account the cached memory belongs to', () => {
    expect(jwtSubject(SIGNED_IN_TOKEN)).toBe('user_abc');
  });

  it('returns nothing for a token it cannot read', () => {
    expect(jwtSubject('not-a-token')).toBeUndefined();
    expect(jwtSubject('a.!!!.c')).toBeUndefined();
  });
});
