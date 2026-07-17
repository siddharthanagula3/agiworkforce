import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@agiworkforce/unified-chat';
import * as projectStoreModule from '../project-store';
import { useProjectMetaStore } from '../project-meta-store';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function project(id: string): Project {
  return {
    id,
    name: id,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };
}

type PlannedProjectStoreModule = typeof projectStoreModule & {
  hydrateManagedCloudProjectStore?: (input: {
    accountId: string;
    listProjects: () => Promise<Project[]>;
  }) => Promise<void>;
  resetManagedCloudProjectStore?: () => void;
  getManagedCloudProjectsForAccount?: (accountId: string | null | undefined) => Project[];
  useManagedCloudProjectSessionStore?: {
    getState: () => { accountId: string | null; status: string; error: string | null };
  };
};

const planned = projectStoreModule as PlannedProjectStoreModule;

describe('managed cloud project session boundary', () => {
  beforeEach(() => {
    planned.resetManagedCloudProjectStore?.();
    projectStoreModule.useProjectStore.setState({ projects: [], activeProjectId: null });
    useProjectMetaStore.setState({ meta: {} });
  });

  it('provides an account-scoped hydration controller', () => {
    expect(planned.hydrateManagedCloudProjectStore).toBeTypeOf('function');
    expect(planned.resetManagedCloudProjectStore).toBeTypeOf('function');
    expect(planned.getManagedCloudProjectsForAccount).toBeTypeOf('function');
    expect(planned.useManagedCloudProjectSessionStore).toBeTypeOf('function');
  });

  it('clears prior account data synchronously before loading another account', async () => {
    const hydrate = planned.hydrateManagedCloudProjectStore!;
    const pending = deferred<Project[]>();
    projectStoreModule.useProjectStore.setState({
      projects: [project('account-a-secret')],
      activeProjectId: 'account-a-secret',
    });
    useProjectMetaStore.getState().setProjectModel('account-a-secret', 'account-a-model');

    const loading = hydrate({ accountId: 'account-b', listProjects: () => pending.promise });

    expect(projectStoreModule.useProjectStore.getState()).toMatchObject({
      projects: [],
      activeProjectId: null,
    });
    expect(useProjectMetaStore.getState().meta).toEqual({});
    expect(planned.getManagedCloudProjectsForAccount?.('account-a')).toEqual([]);
    expect(planned.getManagedCloudProjectsForAccount?.('account-b')).toEqual([]);

    pending.resolve([]);
    await loading;
    expect(planned.useManagedCloudProjectSessionStore?.getState()).toMatchObject({
      accountId: 'account-b',
      status: 'ready',
      error: null,
    });
  });

  it('replaces the cache with an empty server response instead of retaining stale rows', async () => {
    projectStoreModule.useProjectStore.setState({
      projects: [project('stale-project')],
      activeProjectId: 'stale-project',
    });

    await planned.hydrateManagedCloudProjectStore!({
      accountId: 'account-a',
      listProjects: vi.fn().mockResolvedValue([]),
    });

    expect(projectStoreModule.useProjectStore.getState().projects).toEqual([]);
    expect(planned.getManagedCloudProjectsForAccount?.('account-a')).toEqual([]);
  });

  it('does not let a late response from the previous account overwrite the current account', async () => {
    const accountA = deferred<Project[]>();
    const accountB = deferred<Project[]>();

    const loadingA = planned.hydrateManagedCloudProjectStore!({
      accountId: 'account-a',
      listProjects: () => accountA.promise,
    });
    const loadingB = planned.hydrateManagedCloudProjectStore!({
      accountId: 'account-b',
      listProjects: () => accountB.promise,
    });

    accountB.resolve([project('account-b-project')]);
    await loadingB;
    accountA.resolve([project('account-a-project')]);
    await loadingA;

    expect(planned.getManagedCloudProjectsForAccount?.('account-b')).toEqual([
      expect.objectContaining({ id: 'account-b-project' }),
    ]);
    expect(planned.getManagedCloudProjectsForAccount?.('account-a')).toEqual([]);
  });

  it('does not expose active-project instructions without the matching account scope', async () => {
    await planned.hydrateManagedCloudProjectStore!({
      accountId: 'account-a',
      listProjects: vi
        .fn()
        .mockResolvedValue([{ ...project('account-a-project'), instructions: 'account-a-secret' }]),
    });
    projectStoreModule.useProjectStore.getState().setActiveProject('account-a-project');
    const getInstructions = projectStoreModule.getActiveProjectInstructions as unknown as (
      accountId: string,
    ) => string;

    expect(getInstructions('account-b')).toBe('');
    expect(getInstructions('account-a')).toBe('account-a-secret');
  });

  it('fails closed and removes cached rows when hydration fails', async () => {
    projectStoreModule.useProjectStore.setState({
      projects: [project('stale-project')],
      activeProjectId: 'stale-project',
    });

    await planned.hydrateManagedCloudProjectStore!({
      accountId: 'account-b',
      listProjects: vi.fn().mockRejectedValue(new Error('network unavailable')),
    });

    expect(projectStoreModule.useProjectStore.getState().projects).toEqual([]);
    expect(planned.getManagedCloudProjectsForAccount?.('account-b')).toEqual([]);
    expect(planned.useManagedCloudProjectSessionStore?.getState()).toMatchObject({
      accountId: 'account-b',
      status: 'error',
      error: 'network unavailable',
    });
  });
});
