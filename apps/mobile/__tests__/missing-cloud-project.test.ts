jest.mock('../lib/mmkv', () => ({
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  rehydrateWhenMmkvReady: jest.fn(),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

const mockGetProject = jest.fn();
jest.mock('../services/managedCloudProjects', () => ({
  managedCloudProjects: { getProject: (...args: unknown[]) => mockGetProject(...args) },
}));

import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useCloudProjectStore } from '../stores/projects/cloudProjectStore';
import { useProjectSyncStateStore } from '../stores/projects/projectSyncStateStore';
import { loadMissingCloudProject } from '../src/features/projects/service';

const id = '0190a000-0000-7000-8000-0000000000d1';
const project = {
  id,
  ownerUserId: 'owner-1',
  serverVersion: '42',
  name: 'Remote project',
  description: 'Across devices',
  instructions: null,
  color: null,
  isArchived: false,
  metadata: null,
  defaultPrivacyMode: 'managed',
  defaultProviderMode: 'ManagedGateway',
  allowedSurfaces: ['web', 'desktop', 'mobile'],
  createdAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('owner-1');
  useChatAppModeStore.getState().setAppMode('cloud');
  useCloudProjectStore.getState().clearCloudProjectData();
  useProjectSyncStateStore.getState().resetProjectSync();
  mockGetProject.mockResolvedValue(project);
});

it('hydrates a server search result with its authoritative sync version', async () => {
  await loadMissingCloudProject(id);

  expect(mockGetProject).toHaveBeenCalledWith(id, { signal: undefined });
  expect(useCloudProjectStore.getState().projects).toEqual([
    expect.objectContaining({
      id,
      name: 'Remote project',
      description: 'Across devices',
      serverVersion: '42',
      source: 'web',
      deletedAt: null,
    }),
  ]);
});

it('rejects a response from a different account or without a sync version', async () => {
  mockGetProject.mockResolvedValueOnce({ ...project, ownerUserId: 'other-owner' });
  await expect(loadMissingCloudProject(id)).rejects.toThrow('not owned');
  mockGetProject.mockResolvedValueOnce({ ...project, serverVersion: undefined });
  await expect(loadMissingCloudProject(id)).rejects.toThrow('sync version');
  expect(useCloudProjectStore.getState().projects).toEqual([]);
});

it('discards an in-flight response after the account changes', async () => {
  let resolveProject: (value: unknown) => void = () => undefined;
  mockGetProject.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveProject = resolve;
      }),
  );
  const pending = loadMissingCloudProject(id);
  invalidateCloudAccount();
  activateCloudAccount('owner-2');
  resolveProject(project);

  await expect(pending).rejects.toThrow('Cloud account changed');
  expect(useCloudProjectStore.getState().projects).toEqual([]);
});

it('does not resurrect a project deleted while its fetch was in flight', async () => {
  let resolveProject: (value: unknown) => void = () => undefined;
  mockGetProject.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveProject = resolve;
      }),
  );
  const pending = loadMissingCloudProject(id);
  useCloudProjectStore.getState().applyCloudProjectDeltas([
    {
      id,
      name: 'Removed project',
      description: null,
      instructions: null,
      color: null,
      isArchived: false,
      metadata: null,
      source: 'web',
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      deletedAt: project.updatedAt,
      serverVersion: '43',
    },
  ]);
  resolveProject(project);

  await expect(pending).rejects.toThrow('changed while loading');
  expect(useCloudProjectStore.getState().projects).toEqual([]);
});

it('does not restore a project after a local delete acknowledgement', async () => {
  let resolveProject: (value: unknown) => void = () => undefined;
  mockGetProject.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveProject = resolve;
      }),
  );
  const pending = loadMissingCloudProject(id);
  useCloudProjectStore.getState().hardDeleteCloudProject(id);
  resolveProject(project);

  await expect(pending).rejects.toThrow('changed while loading');
  expect(useCloudProjectStore.getState().projects).toEqual([]);
});

it('does not overwrite a pending local project tombstone', async () => {
  useProjectSyncStateStore.getState().markProjectDirty(id);

  await expect(loadMissingCloudProject(id)).rejects.toThrow('pending local changes');
  expect(useCloudProjectStore.getState().projects).toEqual([]);
});
