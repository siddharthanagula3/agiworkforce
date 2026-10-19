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
  openUntrustedUrlInAppBrowser: jest.fn().mockResolvedValue(true),
}));

import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
import { managedCloudProjects } from '@/services/managedCloudProjects';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useCloudProjectStore, type CloudProject } from '@/stores/projects/cloudProjectStore';
import { useCloudMemoryStore, type CloudMemoryEntry } from '@/stores/memory/cloudMemoryStore';
import {
  PROJECT_MEMORY_SCOPE_COPY,
  PROJECT_SHARED_CONTEXT_COPY,
  ProjectSettingsScreen,
} from '@/src/features/projects/components/ProjectSettingsScreen';
import { helpArticleUrl } from '@/src/features/support/HelpArticleLink';

const PROJECT_ID = '0190a000-0000-7000-8000-000000000001';
const OTHER_PROJECT_ID = '0190a000-0000-7000-8000-000000000002';

function project(): CloudProject {
  return {
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
}

function memory(overrides: Partial<CloudMemoryEntry>): CloudMemoryEntry {
  return {
    id: 'm-1',
    content: 'Targets the EU market',
    category: null,
    source: 'web',
    pinned: false,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    serverVersion: '9',
    isDeleted: false,
    projectId: PROJECT_ID,
    projectName: 'Launch plan',
    ...overrides,
  };
}

function managedProject(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    ownerUserId: 'user-1',
    name: 'Launch plan',
    defaultPrivacyMode: 'managed',
    defaultProviderMode: 'ManagedGateway',
    allowedSurfaces: ['web', 'desktop', 'mobile'],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useCloudProjectStore.setState({ projects: [project()], details: {}, activeProjectId: null });
  useCloudProjectStore.getState().setCloudProjectDetails([managedProject() as never]);
  useCloudMemoryStore.setState({ entries: [] });
});

describe('ProjectSettingsScreen', () => {
  it('turns account-wide memory off for the project and says what that changes', async () => {
    (managedCloudProjects.updateProject as jest.Mock).mockResolvedValue(
      managedProject({ usesGlobalMemory: false }),
    );
    render(<ProjectSettingsScreen projectId={PROJECT_ID} />);

    expect(screen.getByTestId('project-settings-memory-scope')).toHaveTextContent(
      PROJECT_MEMORY_SCOPE_COPY.global,
    );
    fireEvent(screen.getByTestId('project-settings-global-memory'), 'valueChange', false);

    expect(managedCloudProjects.updateProject).toHaveBeenCalledWith(PROJECT_ID, {
      usesGlobalMemory: false,
    });
    await waitFor(() =>
      expect(screen.getByTestId('project-settings-memory-scope')).toHaveTextContent(
        PROJECT_MEMORY_SCOPE_COPY.projectOnly,
      ),
    );
  });

  it('undoes a toggle the server refused and says so', async () => {
    (managedCloudProjects.updateProject as jest.Mock).mockRejectedValue(new Error('HTTP 500'));
    render(<ProjectSettingsScreen projectId={PROJECT_ID} />);

    fireEvent(screen.getByTestId('project-settings-account-style'), 'valueChange', false);

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(useCloudProjectStore.getState().details[PROJECT_ID]?.usesAccountStyle).toBe(true);
  });

  it('lists only memories saved to this project', () => {
    useCloudMemoryStore.setState({
      entries: [
        memory({ id: 'mine' }),
        memory({ id: 'other', content: 'Other project fact', projectId: OTHER_PROJECT_ID }),
        memory({ id: 'account', content: 'Account fact', projectId: null }),
        memory({ id: 'gone', content: 'Deleted fact', isDeleted: true }),
      ],
    });
    render(<ProjectSettingsScreen projectId={PROJECT_ID} />);

    expect(screen.getByText('Targets the EU market')).toBeTruthy();
    expect(screen.queryByText('Other project fact')).toBeNull();
    expect(screen.queryByText('Account fact')).toBeNull();
    expect(screen.queryByText('Deleted fact')).toBeNull();
  });

  it('saves a new memory to this project only', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      memory: {
        id: 'new-1',
        content: 'Ship in November',
        category: null,
        source: 'mobile',
        projectId: PROJECT_ID,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      },
      merged: false,
      supersededIds: [],
      supersededBy: null,
    });
    render(<ProjectSettingsScreen projectId={PROJECT_ID} />);

    expect(screen.getByTestId('project-settings-memories-empty')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('project-settings-memory-input'), 'Ship in November');
    fireEvent.press(screen.getByTestId('project-settings-memory-add'));

    expect(api.post).toHaveBeenCalledWith('/api/memory', {
      content: 'Ship in November',
      projectId: PROJECT_ID,
      source: 'mobile',
    });
    await waitFor(() => expect(screen.getByText('Ship in November')).toBeTruthy());
  });

  it('deletes a project memory only after a confirmation that names the consequence', async () => {
    useCloudMemoryStore.setState({ entries: [memory({ id: 'mine' })] });
    (api.delete as jest.Mock).mockResolvedValue({ success: true });
    const alert = jest.spyOn(Alert, 'alert');
    render(<ProjectSettingsScreen projectId={PROJECT_ID} />);

    fireEvent.press(screen.getByLabelText('Delete project memory: Targets the EU market'));
    expect(api.delete).not.toHaveBeenCalled();
    const [title, message, buttons] = alert.mock.calls[0] ?? [];
    expect(title).toBe('Delete this project memory?');
    expect(message).toContain('cannot be restored');
    const confirm = (buttons as Array<{ text: string; onPress?: () => void }>).find(
      (button) => button.text === 'Delete memory',
    );
    confirm?.onPress?.();

    expect(api.delete).toHaveBeenCalledWith('/api/memory/mine');
    await waitFor(() => expect(screen.queryByText('Targets the EU market')).toBeNull());
  });

  it('explains shared context only on a shared project', () => {
    const { unmount } = render(<ProjectSettingsScreen projectId={PROJECT_ID} />);
    expect(screen.queryByTestId('project-settings-shared-context')).toBeNull();
    unmount();

    useCloudProjectStore
      .getState()
      .setCloudProjectDetails([managedProject({ isOrgShared: true }) as never]);
    render(<ProjectSettingsScreen projectId={PROJECT_ID} />);

    expect(screen.getByTestId('project-settings-shared-context')).toHaveTextContent(
      PROJECT_SHARED_CONTEXT_COPY,
      { exact: false },
    );
  });

  it('opens the projects help article', () => {
    render(<ProjectSettingsScreen projectId={PROJECT_ID} />);
    fireEvent.press(screen.getByLabelText('How projects work'));
    expect(openUntrustedUrlInAppBrowser).toHaveBeenCalledWith(helpArticleUrl('projects'));
  });
});

describe('ProjectSettingsScreen sharing', () => {
  const ME = 'user-1';
  const ALEX = {
    userId: 'user-2',
    role: 'member',
    displayName: 'Alex',
    email: null,
    canEditProjects: true,
  };
  const VIC = {
    userId: 'user-3',
    role: 'viewer',
    displayName: 'Vic',
    email: null,
    canEditProjects: false,
  };

  function overview(sharedProjects: unknown[] = []) {
    return {
      currentUserId: ME,
      canManageSharing: false,
      canShareOwnProjects: true,
      members: [
        { userId: ME, role: 'owner', displayName: 'Me', email: null, canEditProjects: true },
        ALEX,
        VIC,
      ],
      sharedProjects,
    };
  }

  const invitedShare = {
    projectId: PROJECT_ID,
    name: 'Launch plan',
    ownerUserId: ME,
    defaultAccess: 'none',
    memberGrants: [{ userId: 'user-2', access: 'write' }],
  };

  it('says a personal project is private when the account has no workspace', async () => {
    (api.get as jest.Mock).mockRejectedValue(new ApiHttpError('Forbidden', 403));
    render(<ProjectSettingsScreen projectId={PROJECT_ID} />);
    expect(await screen.findByTestId('project-members-personal')).toHaveTextContent(
      'Only you can open this project. Projects in a workspace can be shared with its members.',
    );
  });

  it('shares an unshared project with the people the owner chooses', async () => {
    (api.get as jest.Mock).mockResolvedValue(overview());
    (api.put as jest.Mock).mockResolvedValue({});
    render(<ProjectSettingsScreen projectId={PROJECT_ID} />);

    fireEvent.press(await screen.findByTestId('project-members-share-invited'));
    expect(api.put).toHaveBeenCalledWith(
      `/api/settings/organization/shared/projects/${PROJECT_ID}`,
      { audience: 'invited' },
    );
  });

  it('lists who has access and lets the owner change one person', async () => {
    (api.get as jest.Mock).mockResolvedValue(overview([invitedShare]));
    (api.patch as jest.Mock).mockResolvedValue({});
    const alert = jest.spyOn(Alert, 'alert');
    render(<ProjectSettingsScreen projectId={PROJECT_ID} />);

    expect(await screen.findByLabelText('Alex, Can edit. Change access')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Vic, No access. Change access'));
    const buttons = (alert.mock.calls.at(-1)?.[2] ?? []) as Array<{
      text: string;
      onPress?: () => void;
    }>;
    expect(buttons.map((button) => button.text)).toEqual(['Can view', 'No access', 'Cancel']);
    buttons.find((button) => button.text === 'Can view')?.onPress?.();
    expect(api.patch).toHaveBeenCalledWith(
      `/api/settings/organization/shared/projects/${PROJECT_ID}`,
      { userId: 'user-3', access: 'read' },
    );
  });

  it('stops sharing only after a confirmation that names the consequence', async () => {
    (api.get as jest.Mock).mockResolvedValue(overview([invitedShare]));
    (api.delete as jest.Mock).mockResolvedValue({});
    const alert = jest.spyOn(Alert, 'alert');
    render(<ProjectSettingsScreen projectId={PROJECT_ID} />);

    fireEvent.press(await screen.findByTestId('project-members-stop-sharing'));
    expect(api.delete).not.toHaveBeenCalled();
    const [title, message, buttons] = alert.mock.calls.at(-1) ?? [];
    expect(title).toBe('Stop sharing this project?');
    expect(message).toContain('can no longer open Launch plan');
    (buttons as Array<{ text: string; onPress?: () => void }>)
      .find((button) => button.text === 'Stop sharing')
      ?.onPress?.();
    expect(api.delete).toHaveBeenCalledWith(
      `/api/settings/organization/shared/projects/${PROJECT_ID}`,
    );
  });
});
