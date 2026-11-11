import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_ORGANIZATION_ROLES,
  GRANTABLE_ORGANIZATION_PERMISSIONS,
} from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({ members: vi.fn() }));

function mutation() {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null };
}

vi.mock('../../hooks/use-workspace-roles', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  useWorkspaceRoles: () => ({
    isPending: false,
    isError: false,
    data: {
      organizationId: 'org-1',
      currentUserId: 'admin-1',
      currentUserRole: 'admin',
      currentUserPermissions: [...BUILT_IN_ORGANIZATION_ROLES.admin.permissions],
      canManageRoles: true,
      canManageGroups: true,
      grantablePermissions: [...GRANTABLE_ORGANIZATION_PERMISSIONS],
      primaryOwnerOnlyPermissions: [],
      roles: [],
      memberRoleGrants: {},
    },
  }),
  useWorkspaceGroups: () => ({
    isPending: false,
    data: {
      canManageGroups: true,
      groups: [
        {
          id: 'group-1',
          displayName: 'Engineering',
          memberCount: 0,
          roleIds: [],
          managerUserIds: [],
          source: { kind: 'workspace' },
        },
      ],
    },
  }),
  useCreateWorkspaceRole: mutation,
  useUpdateWorkspaceRole: mutation,
  useDeleteWorkspaceRole: mutation,
  useSetMemberRoles: mutation,
  useSetGroupRoles: mutation,
  useSetGroupManagers: mutation,
  useCreateWorkspaceGroup: mutation,
  useRenameWorkspaceGroup: mutation,
  useDeleteWorkspaceGroup: mutation,
  useSetWorkspaceGroupMembers: mutation,
  useWorkspaceGroupMembers: () => mocks.members(),
}));

vi.mock('@/features/settings/hooks/use-settings-queries', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  useTeamMembers: () => ({
    isError: false,
    data: [
      { userId: 'user-1', name: 'Ada Admin', email: 'ada@acme.test', role: 'admin' },
      { userId: 'user-2', name: 'Vera Viewer', email: 'vera@acme.test', role: 'viewer' },
    ],
  }),
}));

import { WorkspaceRoles } from '../WorkspaceRoles';

function serverMembers(userIds: string[]) {
  mocks.members.mockReturnValue({
    data: { userIds },
    isPending: false,
    error: null,
  });
}

function selectedIds(): string[] {
  const select = screen.getByLabelText('Members') as HTMLSelectElement;
  return Array.from(select.selectedOptions, (option) => option.value);
}

function pick(userId: string) {
  const select = screen.getByLabelText('Members') as HTMLSelectElement;
  for (const option of Array.from(select.options)) option.selected = option.value === userId;
  fireEvent.change(select);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WorkspaceRoles group members draft', () => {
  it('keeps an unsaved member selection when the saved members change underneath it', () => {
    serverMembers([]);
    const { rerender } = render(<WorkspaceRoles />);

    pick('user-1');
    expect(selectedIds()).toEqual(['user-1']);

    serverMembers(['user-2']);
    rerender(<WorkspaceRoles />);

    expect(selectedIds()).toEqual(['user-1']);
  });

  it('adopts the saved members when nothing is unsaved', () => {
    serverMembers([]);
    const { rerender } = render(<WorkspaceRoles />);

    serverMembers(['user-2']);
    rerender(<WorkspaceRoles />);

    expect(selectedIds()).toEqual(['user-2']);
  });
});

type ImportedModule1 = typeof import('../../hooks/use-workspace-roles');
type ImportedModule0 = typeof import('@/features/settings/hooks/use-settings-queries');
