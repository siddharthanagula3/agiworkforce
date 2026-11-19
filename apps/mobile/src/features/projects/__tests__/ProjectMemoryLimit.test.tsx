jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

jest.mock('@/services/cloudSyncEngine', () => ({
  syncNow: jest.fn().mockResolvedValue(undefined),
  markProjectForSync: jest.fn(),
  markMemoryForSync: jest.fn(),
}));

jest.mock('@/services/managedCloudProjects', () => ({
  managedCloudProjects: { updateProject: jest.fn(), listProjects: jest.fn().mockResolvedValue([]) },
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: jest.fn(() => ({ ownerId: 'user-1', epoch: 1 })),
  assertCloudAccountEpochCurrent: jest.fn(),
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openInAppBrowser: jest.fn().mockResolvedValue(true),
}));

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MANAGED_MEMORY_MAX_CONTENT_CHARS } from '@agiworkforce/types';
import { useCloudProjectStore, type CloudProject } from '@/stores/projects/cloudProjectStore';
import { useCloudMemoryStore } from '@/stores/memory/cloudMemoryStore';
import { ProjectSettingsScreen } from '@/src/features/projects/components/ProjectSettingsScreen';

const PROJECT_ID = '0190a000-0000-7000-8000-000000000001';

const project: CloudProject = {
  id: PROJECT_ID,
  name: 'Launch plan',
  description: null,
  instructions: null,
  color: null,
  isArchived: false,
  metadata: null,
  source: 'web',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  deletedAt: null,
  serverVersion: '4',
};

describe('the project memory field', () => {
  beforeEach(() => {
    useCloudProjectStore.setState({ projects: [project], details: {}, activeProjectId: null });
    useCloudMemoryStore.setState({ entries: [] });
  });

  it('takes as many characters as the server stores for one memory', () => {
    render(<ProjectSettingsScreen projectId={PROJECT_ID} />);

    expect(screen.getByTestId('project-settings-memory-input').props.maxLength).toBe(
      MANAGED_MEMORY_MAX_CONTENT_CHARS,
    );
  });
});
