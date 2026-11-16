jest.mock('../lib/mmkv', () => {
  const persisted = new Map<string, string>();
  return {
    persistedForTests: persisted,
    whenMmkvReady: jest.fn((cb: () => void) => cb()),
    rehydrateWhenMmkvReady: jest.fn(),
    mmkvStorage: {
      getItem: (key: string) => persisted.get(key) ?? null,
      setItem: (key: string, value: string) => {
        persisted.set(key, value);
      },
      removeItem: (key: string) => {
        persisted.delete(key);
      },
    },
    storage: {
      getString: jest.fn().mockReturnValue(undefined),
      set: jest.fn(),
      delete: jest.fn(),
    },
  };
});

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

jest.mock('../src/shared/components/Toast', () => ({ showToast: jest.fn() }));

jest.mock('@agiworkforce/utils', () => ({
  uuidv7: jest.fn(() => `00000000-0000-7000-8000-${Date.now().toString(16).padStart(12, '0')}`),
  isUuidV7: jest.fn(() => true),
  uuidV7TimestampMs: jest.requireActual('@agiworkforce/utils/uuidv7').uuidV7TimestampMs,
  setUuidV7RandomSource: jest.fn(),
}));

jest.mock('../storage/memory', () => ({
  insertMemoryFact: jest.fn().mockResolvedValue(undefined),
  listMemoryFacts: jest.fn().mockResolvedValue([]),
  deleteMemoryFact: jest.fn().mockResolvedValue(undefined),
  updateMemoryFact: jest.fn().mockResolvedValue(undefined),
  togglePinMemoryFact: jest.fn().mockResolvedValue(undefined),
  searchMemoryByText: jest.fn().mockResolvedValue([]),
}));

import { api } from '../services/api';
import { ApiHttpError } from '../services/apiErrors';
import * as mmkv from '../lib/mmkv';
import { showToast } from '../src/shared/components/Toast';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useCloudProjectStore } from '../stores/projects/cloudProjectStore';
import { useProjectSyncStateStore } from '../stores/projects/projectSyncStateStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useMemorySyncStateStore } from '../stores/memory/memorySyncStateStore';
import { syncNow, markProjectForSync } from '../services/cloudSyncEngine';
import { useProjectStore } from '../src/features/projects/store';
import { updateCloudProjectDetails } from '../src/features/projects/service';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;
const mockPut = api.put as jest.MockedFunction<typeof api.put>;
const persisted = (mmkv as unknown as { persistedForTests: Map<string, string> }).persistedForTests;

const T = '2026-06-22T00:00:00.000Z';
const PROJECTS_SYNC_PATH = '/api/projects/sync';
const PUSH_PROJECT_ID = '01986b80-0000-7000-8000-000000000001';
const TOMBSTONE_PROJECT_ID = '01986b80-0000-7000-8000-000000000002';
const UNACKED_PROJECT_ID = '01986b80-0000-7000-8000-000000000003';

function emptyProjectPull(cursor = '0') {
  return { projects: [], cursor, hasMore: false };
}

function emptyMemoryPull() {
  return { memories: [], cursor: '0', hasMore: false };
}

function emptyChatPull() {
  return { conversations: [], messages: [], artifacts: [], cursor: '0', hasMore: false };
}

function projectPullItem(
  id: string,
  serverVersion: string,
  opts: { deletedAt?: string | null; name?: string } = {},
) {
  return {
    id,
    name: opts.name ?? `Project ${id}`,
    description: null,
    instructions: null,
    color: null,
    is_archived: false,
    metadata: null,
    created_at: T,
    updated_at: T,
    deleted_at: opts.deletedAt ?? null,
    server_version: serverVersion,
  };
}

function seedCloudProject(id: string, name = 'test project', deletedAt: string | null = null) {
  useCloudProjectStore.getState().upsertCloudProject({
    id,
    name,
    description: null,
    instructions: null,
    color: null,
    isArchived: false,
    metadata: null,
    source: 'mobile',
    createdAt: T,
    updatedAt: T,
    deletedAt,
    serverVersion: '7',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  persisted.clear();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('project-sync-test-user');
  useCloudSyncStateStore.getState().reset();
  useCloudProjectStore.getState().clearCloudProjectData();
  useProjectSyncStateStore.getState().resetProjectSync();
  useMemorySyncStateStore.getState().resetMemorySync();
  useChatAppModeStore.getState().setAppMode('cloud');

  mockGet.mockImplementation(async (path: string) => {
    if ((path as string).startsWith('/api/projects/sync')) return emptyProjectPull() as never;
    if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
    return emptyChatPull() as never;
  });

  mockPost.mockImplementation(async (path: string, body: Record<string, unknown>) => {
    if ((path as string) === PROJECTS_SYNC_PATH) {
      const projs = (body?.projects as Array<{ id: string }>) ?? [];
      return {
        applied: projs.map((p) => ({ id: p.id, server_version: '1' })),
        conflicts: [],
        cursor: '1',
      } as never;
    }
    if ((path as string) === '/api/memory/sync') {
      const mems = (body?.memories as Array<{ id: string }>) ?? [];
      return {
        applied: mems.map((m) => ({ id: m.id, server_version: '1' })),
        cursor: '1',
      } as never;
    }
    const convs = (body?.conversations as Array<{ id: string }>) ?? [];
    const msgs = (body?.messages as Array<{ id: string }>) ?? [];
    return {
      applied: {
        conversations: convs.map((c) => ({ id: c.id, server_version: '1' })),
        messages: msgs.map((m) => ({ id: m.id, server_version: '1' })),
      },
      cursor: '1',
    } as never;
  });
});

describe('project sync, managed gate', () => {
  it('makes ZERO project network calls in local mode', async () => {
    useChatAppModeStore.getState().setAppMode('local');
    await syncNow();
    const projectGetCalls = mockGet.mock.calls.filter((c) =>
      (c[0] as string).startsWith('/api/projects/sync'),
    );
    const projectPostCalls = mockPost.mock.calls.filter(
      (c) => (c[0] as string) === PROJECTS_SYNC_PATH,
    );
    expect(projectGetCalls).toHaveLength(0);
    expect(projectPostCalls).toHaveLength(0);
  });

  it('makes project network calls in cloud mode', async () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    await syncNow();
    const projectGetCalls = mockGet.mock.calls.filter((c) =>
      (c[0] as string).startsWith('/api/projects/sync'),
    );
    expect(projectGetCalls.length).toBeGreaterThan(0);
  });
});

describe('project sync, cursor', () => {
  it('starts at "0" and advances to the server cursor after a pull', async () => {
    expect(useProjectSyncStateStore.getState().projectCursor).toBe('0');

    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/projects/sync'))
        return {
          projects: [projectPullItem('p1', '7')],
          cursor: '7',
          hasMore: false,
        } as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    expect(useProjectSyncStateStore.getState().projectCursor).toBe('7');
    expect(mockGet).toHaveBeenCalledWith('/api/projects/sync?since=0');
  });

  it('uses the project cursor independently from both chat and memory cursors', async () => {
    useCloudSyncStateStore.getState().setCursor('42');
    useMemorySyncStateStore.getState().setMemoryCursor('15');

    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/projects/sync'))
        return { projects: [], cursor: '99', hasMore: false } as never;
      if ((path as string).startsWith('/api/memory/sync'))
        return { memories: [], cursor: '15', hasMore: false } as never;
      return {
        conversations: [],
        messages: [],
        artifacts: [],
        cursor: '42',
        hasMore: false,
      } as never;
    });

    await syncNow();

    expect(useProjectSyncStateStore.getState().projectCursor).toBe('99');
    expect(useMemorySyncStateStore.getState().memoryCursor).toBe('15');
    expect(useCloudSyncStateStore.getState().cursor).toBe('42');
  });

  it('follows project pagination until hasMore is false', async () => {
    let callCount = 0;
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/projects/sync')) {
        callCount += 1;
        if (callCount === 1)
          return {
            projects: [projectPullItem('p1', '5')],
            cursor: '5',
            hasMore: true,
          } as never;
        return {
          projects: [projectPullItem('p2', '10')],
          cursor: '10',
          hasMore: false,
        } as never;
      }
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    expect(callCount).toBe(2);
    expect(useProjectSyncStateStore.getState().projectCursor).toBe('10');
    const ids = useCloudProjectStore.getState().projects.map((p) => p.id);
    expect(ids).toContain('p1');
    expect(ids).toContain('p2');
  });

  it('does not replace a newer fetched project with an older in-flight pull', async () => {
    seedCloudProject('p-fetched', 'Fetched version');
    useCloudProjectStore.getState().upsertCloudProject({
      ...useCloudProjectStore.getState().projects[0]!,
      serverVersion: '42',
    });
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/projects/sync')) {
        return {
          projects: [projectPullItem('p-fetched', '41', { name: 'Older pull version' })],
          cursor: '41',
          hasMore: false,
        } as never;
      }
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    expect(useCloudProjectStore.getState().projects[0]).toMatchObject({
      name: 'Fetched version',
      serverVersion: '42',
    });
    expect(useProjectSyncStateStore.getState().projectCursor).toBe('41');
  });
});

describe('project sync, tombstone application', () => {
  it('hard-deletes a project entry when deleted_at is non-null in pull', async () => {
    seedCloudProject('p-del', 'to be deleted');
    expect(useCloudProjectStore.getState().projects.find((p) => p.id === 'p-del')).toBeDefined();

    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/projects/sync'))
        return {
          projects: [projectPullItem('p-del', '9', { deletedAt: T })],
          cursor: '9',
          hasMore: false,
        } as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    expect(useCloudProjectStore.getState().projects.find((p) => p.id === 'p-del')).toBeUndefined();
    expect(useProjectSyncStateStore.getState().projectCursor).toBe('9');
  });

  it('keeps a non-deleted project after a pull without a tombstone for it', async () => {
    seedCloudProject('p-keep', 'keeper');

    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/projects/sync'))
        return { projects: [], cursor: '5', hasMore: false } as never;
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    expect(useCloudProjectStore.getState().projects.find((p) => p.id === 'p-keep')).toBeDefined();
  });

  it('ignores an older tombstone for a newer fetched project', async () => {
    seedCloudProject('p-live', 'Live project');
    useCloudProjectStore.getState().upsertCloudProject({
      ...useCloudProjectStore.getState().projects[0]!,
      serverVersion: '42',
    });
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/projects/sync')) {
        return {
          projects: [projectPullItem('p-live', '41', { deletedAt: T })],
          cursor: '41',
          hasMore: false,
        } as never;
      }
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      return emptyChatPull() as never;
    });

    await syncNow();

    expect(useCloudProjectStore.getState().projects[0]).toMatchObject({
      name: 'Live project',
      serverVersion: '42',
      deletedAt: null,
    });
  });
});

describe('project sync, push', () => {
  it('keeps the newer base version of a dirty project after a stale pull', async () => {
    seedCloudProject(PUSH_PROJECT_ID, 'Local edit');
    useCloudProjectStore.getState().upsertCloudProject({
      ...useCloudProjectStore.getState().projects[0]!,
      serverVersion: '42',
    });
    markProjectForSync(PUSH_PROJECT_ID);
    mockGet.mockImplementation(async (path: string) => {
      if ((path as string).startsWith('/api/projects/sync')) {
        return {
          projects: [projectPullItem(PUSH_PROJECT_ID, '41', { name: 'Older server copy' })],
          cursor: '41',
          hasMore: false,
        } as never;
      }
      if ((path as string).startsWith('/api/memory/sync')) return emptyMemoryPull() as never;
      return emptyChatPull() as never;
    });
    mockPost.mockImplementation(async (path: string) => {
      if ((path as string) === PROJECTS_SYNC_PATH) {
        return { applied: [], conflicts: [], cursor: '0' } as never;
      }
      if ((path as string) === '/api/memory/sync') return { applied: [], cursor: '0' } as never;
      return { applied: { conversations: [], messages: [] }, cursor: '0' } as never;
    });

    await syncNow();

    expect(useCloudProjectStore.getState().projects[0]).toMatchObject({
      name: 'Local edit',
      serverVersion: '42',
    });
    const projectPush = mockPost.mock.calls.find((call) => call[0] === PROJECTS_SYNC_PATH);
    expect(projectPush?.[1]).toMatchObject({
      projects: [expect.objectContaining({ baseVersion: '42' })],
    });
  });

  it('pushes dirty cloud projects and clears the dirty queue on ack', async () => {
    seedCloudProject(PUSH_PROJECT_ID, 'push me');
    markProjectForSync(PUSH_PROJECT_ID);
    expect(useProjectSyncStateStore.getState().dirtyProjectIds).toContain(PUSH_PROJECT_ID);

    await syncNow();

    const projectCalls = mockPost.mock.calls.filter((c) => c[0] === PROJECTS_SYNC_PATH);
    expect(projectCalls).toHaveLength(1);
    const body = projectCalls[0]![1] as {
      projects: Array<{
        id: string;
        name: string;
        baseVersion: string;
        updatedAt?: string;
      }>;
    };
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]!.id).toBe(PUSH_PROJECT_ID);
    expect(body.projects[0]!.name).toBe('push me');
    expect(body.projects[0]!.baseVersion).toBe('7');
    expect(body.projects[0]!.updatedAt).toBeUndefined();
    expect(useProjectSyncStateStore.getState().dirtyProjectIds).not.toContain(PUSH_PROJECT_ID);
  });

  it('does NOT post to /api/projects/sync when dirty queue is empty', async () => {
    await syncNow();
    const projectCalls = mockPost.mock.calls.filter((c) => c[0] === PROJECTS_SYNC_PATH);
    expect(projectCalls).toHaveLength(0);
  });

  it('sends deletedAt for a tombstone project', async () => {
    seedCloudProject(TOMBSTONE_PROJECT_ID, 'bye', T);
    markProjectForSync(TOMBSTONE_PROJECT_ID);

    await syncNow();

    const projectCalls = mockPost.mock.calls.filter((c) => c[0] === PROJECTS_SYNC_PATH);
    const body = projectCalls[0]![1] as {
      projects: Array<{ id: string; deletedAt: string | null }>;
    };
    expect(body.projects[0]!.deletedAt).toBe(T);
    expect(
      useCloudProjectStore.getState().projects.find((p) => p.id === TOMBSTONE_PROJECT_ID),
    ).toBeUndefined();
    expect(useProjectSyncStateStore.getState().dirtyProjectIds).not.toContain(TOMBSTONE_PROJECT_ID);
  });

  it('keeps a tombstone dirty when the server does NOT ack it', async () => {
    seedCloudProject(UNACKED_PROJECT_ID, 'retry me', T);
    markProjectForSync(UNACKED_PROJECT_ID);

    mockPost.mockImplementation(async (path: string) => {
      if ((path as string) === PROJECTS_SYNC_PATH)
        return { applied: [], conflicts: [], cursor: '0' } as never;
      if ((path as string) === '/api/memory/sync') return { applied: [], cursor: '0' } as never;
      return { applied: { conversations: [], messages: [] }, cursor: '0' } as never;
    });

    await syncNow();

    expect(useProjectSyncStateStore.getState().dirtyProjectIds).toContain(UNACKED_PROJECT_ID);
    const entry = useCloudProjectStore.getState().projects.find((p) => p.id === UNACKED_PROJECT_ID);
    expect(entry).toBeDefined();
    expect(entry?.deletedAt).toBe(T);
  });

  it('accepts the server revision winner and clears a stale local edit on CAS conflict', async () => {
    seedCloudProject(PUSH_PROJECT_ID, 'stale local edit');
    markProjectForSync(PUSH_PROJECT_ID);

    mockPost.mockImplementation(async (path: string) => {
      if ((path as string) === PROJECTS_SYNC_PATH) {
        return {
          applied: [],
          conflicts: [
            {
              id: PUSH_PROJECT_ID,
              current: projectPullItem(PUSH_PROJECT_ID, '9', { name: 'server winner' }),
            },
          ],
          cursor: '9',
        } as never;
      }
      if ((path as string) === '/api/memory/sync') {
        return { applied: [], cursor: '0' } as never;
      }
      return { applied: { conversations: [], messages: [] }, cursor: '0' } as never;
    });

    await syncNow();

    expect(
      useCloudProjectStore.getState().projects.find((p) => p.id === PUSH_PROJECT_ID),
    ).toMatchObject({ name: 'server winner', serverVersion: '9' });
    expect(useProjectSyncStateStore.getState().dirtyProjectIds).not.toContain(PUSH_PROJECT_ID);
  });

  it('rebases a pre-CAS persisted edit instead of discarding it as a base-zero conflict', async () => {
    seedCloudProject(PUSH_PROJECT_ID, 'legacy offline edit');
    const legacy = useCloudProjectStore
      .getState()
      .projects.find((project) => project.id === PUSH_PROJECT_ID)!;
    useCloudProjectStore.getState().upsertCloudProject({ ...legacy, serverVersion: undefined });
    markProjectForSync(PUSH_PROJECT_ID);

    mockPost.mockImplementation(async (path: string) => {
      if ((path as string) === PROJECTS_SYNC_PATH) {
        return {
          applied: [],
          conflicts: [
            {
              id: PUSH_PROJECT_ID,
              current: projectPullItem(PUSH_PROJECT_ID, '9', { name: 'server baseline' }),
            },
          ],
          cursor: '9',
        } as never;
      }
      if ((path as string) === '/api/memory/sync') {
        return { applied: [], cursor: '0' } as never;
      }
      return { applied: { conversations: [], messages: [] }, cursor: '0' } as never;
    });

    await syncNow();

    const projectCall = mockPost.mock.calls.find((call) => call[0] === PROJECTS_SYNC_PATH)!;
    expect(projectCall[1]).toMatchObject({
      projects: [expect.objectContaining({ id: PUSH_PROJECT_ID, baseVersion: '0' })],
    });
    expect(
      useCloudProjectStore.getState().projects.find((p) => p.id === PUSH_PROJECT_ID),
    ).toMatchObject({ name: 'legacy offline edit', serverVersion: '9' });
    expect(useProjectSyncStateStore.getState().dirtyProjectIds).toContain(PUSH_PROJECT_ID);
  });

  it('keeps an edit made while an acknowledged push is in flight and rebases its revision', async () => {
    seedCloudProject(PUSH_PROJECT_ID, 'sent snapshot');
    markProjectForSync(PUSH_PROJECT_ID);

    mockPost.mockImplementation(async (path: string) => {
      if ((path as string) === PROJECTS_SYNC_PATH) {
        const current = useCloudProjectStore
          .getState()
          .projects.find((project) => project.id === PUSH_PROJECT_ID)!;
        useCloudProjectStore
          .getState()
          .upsertCloudProject({ ...current, name: 'newer in-flight edit' });
        return {
          applied: [{ id: PUSH_PROJECT_ID, server_version: '8' }],
          conflicts: [],
          cursor: '8',
        } as never;
      }
      if ((path as string) === '/api/memory/sync') {
        return { applied: [], cursor: '0' } as never;
      }
      return { applied: { conversations: [], messages: [] }, cursor: '0' } as never;
    });

    await syncNow();

    expect(
      useCloudProjectStore.getState().projects.find((p) => p.id === PUSH_PROJECT_ID),
    ).toMatchObject({ name: 'newer in-flight edit', serverVersion: '8' });
    expect(useProjectSyncStateStore.getState().dirtyProjectIds).toContain(PUSH_PROJECT_ID);
  });

  it('keeps an edit made while a stale push is in flight and rebases onto the server winner', async () => {
    seedCloudProject(PUSH_PROJECT_ID, 'sent stale snapshot');
    markProjectForSync(PUSH_PROJECT_ID);

    mockPost.mockImplementation(async (path: string) => {
      if ((path as string) === PROJECTS_SYNC_PATH) {
        const current = useCloudProjectStore
          .getState()
          .projects.find((project) => project.id === PUSH_PROJECT_ID)!;
        useCloudProjectStore
          .getState()
          .upsertCloudProject({ ...current, name: 'newer in-flight edit' });
        return {
          applied: [],
          conflicts: [
            {
              id: PUSH_PROJECT_ID,
              current: projectPullItem(PUSH_PROJECT_ID, '9', { name: 'server winner' }),
            },
          ],
          cursor: '9',
        } as never;
      }
      if ((path as string) === '/api/memory/sync') {
        return { applied: [], cursor: '0' } as never;
      }
      return { applied: { conversations: [], messages: [] }, cursor: '0' } as never;
    });

    await syncNow();

    expect(
      useCloudProjectStore.getState().projects.find((p) => p.id === PUSH_PROJECT_ID),
    ).toMatchObject({ name: 'newer in-flight edit', serverVersion: '9' });
    expect(useProjectSyncStateStore.getState().dirtyProjectIds).toContain(PUSH_PROJECT_ID);
  });

  it('treats a conflicting server tombstone as authoritative over an in-flight edit', async () => {
    seedCloudProject(PUSH_PROJECT_ID, 'sent snapshot');
    markProjectForSync(PUSH_PROJECT_ID);

    mockPost.mockImplementation(async (path: string) => {
      if ((path as string) === PROJECTS_SYNC_PATH) {
        const current = useCloudProjectStore
          .getState()
          .projects.find((project) => project.id === PUSH_PROJECT_ID)!;
        useCloudProjectStore
          .getState()
          .upsertCloudProject({ ...current, name: 'newer in-flight edit' });
        return {
          applied: [],
          conflicts: [
            {
              id: PUSH_PROJECT_ID,
              current: projectPullItem(PUSH_PROJECT_ID, '10', { deletedAt: T }),
            },
          ],
          cursor: '10',
        } as never;
      }
      if ((path as string) === '/api/memory/sync') {
        return { applied: [], cursor: '0' } as never;
      }
      return { applied: { conversations: [], messages: [] }, cursor: '0' } as never;
    });

    await syncNow();

    expect(
      useCloudProjectStore.getState().projects.find((p) => p.id === PUSH_PROJECT_ID),
    ).toBeUndefined();
    expect(useProjectSyncStateStore.getState().dirtyProjectIds).not.toContain(PUSH_PROJECT_ID);
  });

  it('clears a dead ref (project absent from cloud store) without crashing', async () => {
    markProjectForSync('ghost-id');

    await syncNow();

    expect(useProjectSyncStateStore.getState().dirtyProjectIds).not.toContain('ghost-id');
    const projectCalls = mockPost.mock.calls.filter((c) => c[0] === PROJECTS_SYNC_PATH);
    expect(projectCalls).toHaveLength(0);
  });
});

describe('project store, local/cloud separation', () => {
  it('a local-mode createProject NEVER writes to the cloud store or dirty queue', () => {
    useChatAppModeStore.getState().setAppMode('local');

    useProjectStore.getState().createProject('local project', 'desc', 'instructions');

    expect(useCloudProjectStore.getState().projects).toHaveLength(0);
    expect(useProjectSyncStateStore.getState().dirtyProjectIds).toHaveLength(0);
  });

  it('a cloud-mode createProject writes to the cloud store with a UUIDv7 id, not local store', () => {
    useChatAppModeStore.getState().setAppMode('cloud');
    const localProjectsBefore = useProjectStore.getState().projects.length;

    useProjectStore.getState().createProject('cloud project', 'cloud desc', 'cloud instructions');

    const cloudProjects = useCloudProjectStore.getState().projects;
    expect(cloudProjects).toHaveLength(1);
    expect(cloudProjects[0]!.name).toBe('cloud project');
    expect(cloudProjects[0]!.source).toBe('mobile');
    expect(cloudProjects[0]!.deletedAt).toBeNull();

    expect(useProjectStore.getState().projects.length).toBe(localProjectsBefore);

    expect(useProjectSyncStateStore.getState().dirtyProjectIds).toContain(cloudProjects[0]!.id);
  });

  it('a local project id (proj_...) never appears in the cloud push queue', () => {
    useChatAppModeStore.getState().setAppMode('local');
    const id = useProjectStore.getState().createProject('local', '', '');
    expect(id).toMatch(/^proj_/);
    expect(useProjectSyncStateStore.getState().dirtyProjectIds).not.toContain(id);
  });
});

describe('project-only memory chosen when a Cloud project is created', () => {
  const OWNER = 'project-sync-test-user';

  function managedProject(id: string, usesGlobalMemory: boolean) {
    return {
      id,
      ownerUserId: OWNER,
      name: 'Client work',
      usesGlobalMemory,
      defaultPrivacyMode: 'managed',
      defaultProviderMode: 'ManagedGateway',
      allowedSurfaces: [],
      createdAt: T,
      updatedAt: T,
    };
  }

  function offline(): never {
    throw new TypeError('Network request failed');
  }

  async function restartApp() {
    const saved = new Map(persisted);
    useCloudProjectStore.setState({ projects: [], details: {}, activeProjectId: null });
    useProjectSyncStateStore.setState({
      projectCursor: '0',
      dirtyProjectIds: [],
      projectOnlyMemoryPendingIds: [],
    });
    persisted.clear();
    for (const [key, value] of saved) persisted.set(key, value);
    await useCloudProjectStore.persist.rehydrate();
    await useProjectSyncStateStore.persist.rehydrate();
  }

  function createProjectOnly(): string {
    return useProjectStore
      .getState()
      .createProject('Client work', '', '', { usesGlobalMemory: false });
  }

  function pushedProjects(): Array<Record<string, unknown>> {
    return mockPost.mock.calls
      .filter((call) => call[0] === PROJECTS_SYNC_PATH)
      .flatMap((call) => (call[1] as { projects: Array<Record<string, unknown>> }).projects);
  }

  let serverProjectRead: (id: string) => Promise<unknown>;

  function heldPut() {
    let release!: (usesGlobalMemory: boolean) => void;
    let path = '';
    const answer = new Promise<unknown>((resolve) => {
      release = (usesGlobalMemory) =>
        resolve({ project: managedProject(path.slice('/api/projects/'.length), usesGlobalMemory) });
    });
    return {
      answer: (putPath: string) => {
        path = putPath;
        return answer;
      },
      release,
    };
  }

  async function settleUntil(done: () => boolean) {
    for (let turn = 0; turn < 100 && !done(); turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  function seedProjectOnlyAwaitingConfirmation(id: string) {
    seedCloudProject(id, 'Client work');
    useProjectSyncStateStore.getState().markProjectOnlyMemoryPending(id);
    useCloudProjectStore.getState().patchCloudProjectDetails(id, { usesGlobalMemory: false });
  }

  function memoryPutsFor(id: string) {
    return mockPut.mock.calls
      .filter((call) => call[0] === `/api/projects/${id}`)
      .map((call) => call[1]);
  }

  beforeEach(() => {
    mockPut.mockImplementation(async (path: string) => {
      const id = path.slice('/api/projects/'.length);
      return { project: managedProject(id, false) } as never;
    });
    serverProjectRead = async (id) => ({ project: managedProject(id, true) });
    const listAndSyncReads = mockGet.getMockImplementation()!;
    mockGet.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/projects/') && !path.startsWith(PROJECTS_SYNC_PATH)) {
        return (await serverProjectRead(path.slice('/api/projects/'.length))) as never;
      }
      return (await listAndSyncReads(path)) as never;
    });
  });

  it('creates the project as project-only after an offline creation and a restart', async () => {
    const online = { get: mockGet.getMockImplementation(), post: mockPost.getMockImplementation() };
    mockGet.mockImplementation(offline);
    mockPost.mockImplementation(offline);

    const id = createProjectOnly();
    await syncNow();
    expect(useCloudSyncStateStore.getState().failedSyncSteps).toContain('projects');

    await restartApp();
    expect(useCloudProjectStore.getState().projects.map((p) => p.id)).toEqual([id]);
    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([id]);

    mockGet.mockImplementation(online.get!);
    mockPost.mockImplementation(online.post!);
    mockPost.mockClear();
    await syncNow();

    expect(pushedProjects()).toEqual([
      expect.objectContaining({ id, usesGlobalMemory: false, baseVersion: '0' }),
    ]);
    expect(mockPut).toHaveBeenCalledWith(`/api/projects/${id}`, { usesGlobalMemory: false });
    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([]);
    expect(useCloudProjectStore.getState().details[id]?.usesGlobalMemory).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('confirms project-only memory when the app closed after the push and before the update', async () => {
    mockPut.mockImplementationOnce(offline);

    const id = createProjectOnly();
    await syncNow();
    expect(pushedProjects()).toEqual([expect.objectContaining({ id, usesGlobalMemory: false })]);
    expect(useCloudSyncStateStore.getState().failedSyncSteps).toContain('projects');

    await restartApp();
    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([id]);

    mockPost.mockClear();
    mockPut.mockClear();
    await syncNow();

    expect(pushedProjects()).toEqual([]);
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(`/api/projects/${id}`, { usesGlobalMemory: false });
    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([]);
    expect(useCloudSyncStateStore.getState().failedSyncSteps).not.toContain('projects');
  });

  it('keeps asking on every sync while the update fails for a reason that can pass', async () => {
    mockPut.mockImplementation(offline);

    const id = createProjectOnly();
    await syncNow();
    await syncNow();

    expect(mockPut).toHaveBeenCalledTimes(2);
    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([id]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it.each([
    ['refuses the update', () => Promise.reject(new ApiHttpError('Not allowed', 403))],
    [
      'answers that the project still uses memories from other chats',
      (path: string) =>
        Promise.resolve({
          project: managedProject(path.slice('/api/projects/'.length), true),
        }),
    ],
  ])('says the memory setting was not saved when the server %s', async (_case, answer) => {
    mockPut.mockImplementation(answer as never);

    const id = createProjectOnly();
    await syncNow();

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      'Project created. Memory setting was not saved; change it in Project settings.',
    );
    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([]);
    expect(useCloudProjectStore.getState().details[id]?.usesGlobalMemory).toBe(true);
    expect(useCloudProjectStore.getState().projects.some((p) => p.id === id)).toBe(true);
  });

  it('says nothing when the update is refused but the server already holds project-only memory', async () => {
    mockPut.mockRejectedValue(new ApiHttpError('Not allowed', 403));
    serverProjectRead = async (id) => ({ project: managedProject(id, false) });

    const id = createProjectOnly();
    await syncNow();

    expect(mockGet).toHaveBeenCalledWith(`/api/projects/${id}`);
    expect(showToast).not.toHaveBeenCalled();
    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([]);
    expect(useCloudProjectStore.getState().details[id]?.usesGlobalMemory).toBe(false);
    expect(useCloudSyncStateStore.getState().failedSyncSteps).not.toContain('projects');
  });

  it('says the memory setting was not saved when the server refuses both the update and the read', async () => {
    mockPut.mockRejectedValue(new ApiHttpError('Not allowed', 403));
    serverProjectRead = () => Promise.reject(new ApiHttpError('Not allowed', 403));

    const id = createProjectOnly();
    await syncNow();

    expect(showToast).toHaveBeenCalledWith(
      'Project created. Memory setting was not saved; change it in Project settings.',
    );
    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([]);
    expect(useCloudProjectStore.getState().details[id]?.usesGlobalMemory).toBe(true);
  });

  it('keeps the choice and says nothing when the read after a refused update cannot reach the server', async () => {
    mockPut.mockRejectedValue(new ApiHttpError('Not allowed', 403));
    serverProjectRead = () => Promise.reject(new TypeError('Network request failed'));

    const id = createProjectOnly();
    await syncNow();

    expect(showToast).not.toHaveBeenCalled();
    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([id]);
    expect(useCloudProjectStore.getState().details[id]?.usesGlobalMemory).toBe(false);
    expect(useCloudSyncStateStore.getState().failedSyncSteps).toContain('projects');
  });

  it('does not overwrite a memory choice made in Project settings while the sync waits on another project', async () => {
    const first = '01986b80-0000-7000-8000-0000000000a1';
    const second = '01986b80-0000-7000-8000-0000000000a2';
    seedProjectOnlyAwaitingConfirmation(first);
    seedProjectOnlyAwaitingConfirmation(second);
    const firstPut = heldPut();
    mockPut.mockImplementation(async (path: string, body: unknown) => {
      if (path === `/api/projects/${first}`) return (await firstPut.answer(path)) as never;
      const { usesGlobalMemory } = body as { usesGlobalMemory: boolean };
      return { project: managedProject(second, usesGlobalMemory) } as never;
    });

    const sync = syncNow();
    await settleUntil(() => memoryPutsFor(first).length > 0);
    await updateCloudProjectDetails(second, { usesGlobalMemory: true });
    firstPut.release(false);
    await sync;

    expect(memoryPutsFor(second)).toEqual([{ usesGlobalMemory: true }]);
    expect(useCloudProjectStore.getState().details[second]?.usesGlobalMemory).toBe(true);
    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('sends a memory choice made in Project settings only after the confirmation already in flight', async () => {
    const id = '01986b80-0000-7000-8000-0000000000a3';
    seedProjectOnlyAwaitingConfirmation(id);
    const confirmation = heldPut();
    mockPut.mockImplementation(async (path: string, body: unknown) => {
      const { usesGlobalMemory } = body as { usesGlobalMemory: boolean };
      if (usesGlobalMemory === false) return (await confirmation.answer(path)) as never;
      return { project: managedProject(id, true) } as never;
    });

    const sync = syncNow();
    await settleUntil(() => memoryPutsFor(id).length > 0);
    const choice = updateCloudProjectDetails(id, { usesGlobalMemory: true });
    await settleUntil(() => memoryPutsFor(id).length > 1);
    const sentWhileConfirming = memoryPutsFor(id);

    confirmation.release(false);
    await sync;
    await choice;

    expect(sentWhileConfirming).toEqual([{ usesGlobalMemory: false }]);
    expect(memoryPutsFor(id)).toEqual([{ usesGlobalMemory: false }, { usesGlobalMemory: true }]);
    expect(useCloudProjectStore.getState().details[id]?.usesGlobalMemory).toBe(true);
    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('sends nothing and says nothing when the project is deleted before it reaches the server', async () => {
    const id = createProjectOnly();
    useProjectStore.getState().deleteProject(id);

    await syncNow();

    expect(mockPut).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([]);
  });

  it('pushes no memory scope for a project created with Default memory', async () => {
    const id = useProjectStore.getState().createProject('Notes', '', '');

    await syncNow();

    const [pushed] = pushedProjects();
    expect(pushed).toEqual(expect.objectContaining({ id }));
    expect(pushed).not.toHaveProperty('usesGlobalMemory');
    expect(mockPut).not.toHaveBeenCalled();
    expect(useProjectSyncStateStore.getState().projectOnlyMemoryPendingIds).toEqual([]);
  });
});
