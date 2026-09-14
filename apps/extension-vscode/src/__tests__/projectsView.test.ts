import { describe, expect, it, vi } from 'vitest';
import type { ManagedCloudProject } from '@agiworkforce/cloud-contracts';
import {
  OPEN_PROJECT_COMMAND,
  ProjectTreeItem,
  ProjectsTreeProvider,
  REFRESH_PROJECTS_COMMAND,
  readProjectCommandArgument,
} from '../features/projects/projectsTree';
import { describeProjectFailure } from '../features/projects/projectPresentation';
import {
  formatActiveProjectPrelude,
  getActiveCloudProject,
  setActiveCloudProject,
} from '../features/projects/activeProject';

function makeProject(overrides: Partial<ManagedCloudProject> = {}): ManagedCloudProject {
  return {
    id: 'proj_1',
    ownerUserId: 'user_1',
    organizationId: null,
    name: 'Payments service',
    description: 'The billing surface',
    instructions: 'Prefer TypeScript.',
    color: null,
    isArchived: false,
    metadata: null,
    defaultPrivacyMode: 'managed',
    defaultProviderMode: 'ManagedGateway',
    allowedSurfaces: ['web', 'vscode'],
    defaultModelId: null,
    knowledgeFileCount: 2,
    conversationCount: 5,
    memberCount: 1,
    lastUsedAt: null,
    iconEmoji: null,
    accentColor: null,
    importedFrom: null,
    isOrgShared: false,
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-13T11:00:00.000Z',
    ...overrides,
  };
}

function memento(): Pick<import('vscode').Memento, 'get' | 'update'> {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string): T | undefined => store.get(key) as T | undefined,
    update: (key: string, value: unknown) => {
      if (value === undefined) store.delete(key);
      else store.set(key, value);
      return Promise.resolve();
    },
  };
}

describe('projects tree', () => {
  it('maps the hosted project list into one item per project', async () => {
    const client = {
      listProjects: vi.fn().mockResolvedValue([makeProject(), makeProject({ id: 'proj_2' })]),
    };
    const provider = new ProjectsTreeProvider(() =>
      Promise.resolve({ status: 'ready' as const, client }),
    );
    try {
      const items = await provider.getChildren();

      expect(client.listProjects).toHaveBeenCalledWith({ limit: 50, offset: 0 });
      expect(items).toHaveLength(2);
      const [first] = items as ProjectTreeItem[];
      expect(first?.id).toBe('proj_1');
      expect(first?.label).toBe('Payments service');
      expect(first?.description).toContain('2 files');
      expect(first?.description).toContain('5 chats');
      expect((first?.command as { command: string }).command).toBe(OPEN_PROJECT_COMMAND);
    } finally {
      provider.dispose();
    }
  });

  it('asks the user to sign in rather than showing an empty list', async () => {
    const provider = new ProjectsTreeProvider(() => Promise.resolve({ status: 'signed-out' }));
    try {
      const [notice] = await provider.getChildren();

      expect(notice?.label).toBe('Sign in to see your projects');
      expect((notice?.command as { command: string }).command).toBe('agi-workforce.signIn');
    } finally {
      provider.dispose();
    }
  });

  it('names an expired session when the hosted route answers 401', async () => {
    const client = { listProjects: vi.fn().mockRejectedValue({ status: 401 }) };
    const provider = new ProjectsTreeProvider(() =>
      Promise.resolve({ status: 'ready' as const, client }),
    );
    try {
      const [notice] = await provider.getChildren();

      expect(notice?.label).toBe('Projects could not be loaded');
      expect(String(notice?.tooltip)).toBe(describeProjectFailure({ status: 401 }));
      expect((notice?.command as { command: string }).command).toBe(REFRESH_PROJECTS_COMMAND);
    } finally {
      provider.dispose();
    }
  });

  it('only accepts a tree item that carries a project', () => {
    expect(readProjectCommandArgument(new ProjectTreeItem(makeProject()))?.id).toBe('proj_1');
    expect(readProjectCommandArgument({ project: { id: '' } })).toBeUndefined();
    expect(readProjectCommandArgument('proj_1')).toBeUndefined();
  });
});

describe('active project prelude', () => {
  it('carries the instructions and says the knowledge files are not attached', async () => {
    const state = memento();
    await setActiveCloudProject(state, {
      id: 'proj_1',
      name: 'Payments service',
      instructions: 'Prefer TypeScript.',
    });

    const prelude = formatActiveProjectPrelude(getActiveCloudProject(state));

    expect(prelude).toContain('Payments service');
    expect(prelude).toContain('Prefer TypeScript.');
    expect(prelude).toContain('knowledge files are not attached here');
  });

  it('is empty when no project is applied to this workspace', () => {
    expect(formatActiveProjectPrelude(getActiveCloudProject(memento()))).toBe('');
  });
});
