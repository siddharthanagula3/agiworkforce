
jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

jest.mock('@agiworkforce/utils', () => ({
  uuidv7: jest.fn(() => `00000000-0000-7000-8000-${Date.now().toString(16).padStart(12, '0')}`),
  isUuidV7: jest.fn(() => true),
  setUuidV7RandomSource: jest.fn(),
}));

jest.mock('../storage/memory', () => ({
  insertMemoryFact: jest.fn().mockResolvedValue(undefined),
  listMemoryFacts: jest.fn().mockResolvedValue([]),
  deleteMemoryFact: jest.fn().mockResolvedValue(undefined),
  updateMemoryFact: jest.fn().mockResolvedValue(undefined),
  togglePinMemoryFact: jest.fn().mockResolvedValue(undefined),
  searchMemoryByText: jest.fn().mockResolvedValue([]),
  searchMemoryByEmbedding: jest.fn().mockResolvedValue([]),
}));

import { api } from '../services/api';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useCloudProjectStore } from '../stores/projects/cloudProjectStore';
import { useProjectSyncStateStore } from '../stores/projects/projectSyncStateStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useMemorySyncStateStore } from '../stores/memory/memorySyncStateStore';
import { syncNow, markProjectForSync } from '../services/cloudSyncEngine';
import { useProjectStore } from '../src/features/projects/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;

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

describe('project sync — managed gate', () => {
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

describe('project sync — cursor', () => {
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
});

describe('project sync — tombstone application', () => {
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
});

describe('project sync — push', () => {
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

describe('project store — local/cloud separation', () => {
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
