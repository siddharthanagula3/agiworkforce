import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_ORGANIZATION_ROLES,
  GRANTABLE_ORGANIZATION_PERMISSIONS,
} from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({
  roles: vi.fn(),
  groups: vi.fn(),
  createRole: vi.fn(),
  deleteRole: vi.fn(),
  setMemberRoles: vi.fn(),
}));

function mutation(mutate: (...args: unknown[]) => unknown) {
  return {
    mutate,
    mutateAsync: async (...args: unknown[]) => mutate(...args),
    isPending: false,
    error: null,
  };
}

vi.mock('../../hooks/use-workspace-roles', () => ({
  useWorkspaceRoles: () => mocks.roles(),
  useWorkspaceGroups: () => mocks.groups(),
  useCreateWorkspaceRole: () => mutation(mocks.createRole),
  useUpdateWorkspaceRole: () => mutation(vi.fn()),
  useDeleteWorkspaceRole: () => mutation(mocks.deleteRole),
  useSetMemberRoles: () => mutation(mocks.setMemberRoles),
  useSetGroupRoles: () => mutation(vi.fn()),
  useSetGroupManagers: () => mutation(vi.fn()),
}));

vi.mock('@/features/settings/hooks/use-settings-queries', () => ({
  useTeamMembers: () => ({
    isError: false,
    data: [
      {
        userId: 'viewer-1',
        name: 'Vera Viewer',
        email: 'vera@acme.test',
        role: 'viewer',
      },
    ],
  }),
}));

import { PRIMARY_OWNER_DEFINITION, WorkspaceRoles } from '../WorkspaceRoles';

const builtIn = Object.values(BUILT_IN_ORGANIZATION_ROLES).map((role) => ({
  id: `role-${role.key}`,
  key: role.key,
  name: role.name,
  description: role.description,
  builtIn: true,
  assignable: role.assignable,
  permissions: [...role.permissions],
  memberCount: 0,
  groupCount: 0,
}));

const auditor = {
  id: 'role-auditor',
  key: 'custom_auditor',
  name: 'Auditor',
  description: null,
  builtIn: false,
  assignable: true,
  permissions: ['content.read', 'audit.read'],
  memberCount: 2,
  groupCount: 1,
};

function withRoles(overrides: Record<string, unknown> = {}) {
  mocks.roles.mockReturnValue({
    isPending: false,
    isError: false,
    data: {
      organizationId: 'org-1',
      currentUserId: 'admin-1',
      currentUserRole: 'admin',
      currentUserPermissions: [...BUILT_IN_ORGANIZATION_ROLES.admin.permissions],
      canManageRoles: true,
      canManageGroups: false,
      grantablePermissions: [...GRANTABLE_ORGANIZATION_PERMISSIONS],
      primaryOwnerOnlyPermissions: [
        'ownership.transfer',
        'workspace.delete',
        'billing.contracts.manage',
      ],
      roles: [...builtIn, auditor],
      memberRoleGrants: {},
      ...overrides,
    },
  });
}

function withGroups(groups: unknown[] = [], canManageGroups = true) {
  mocks.groups.mockReturnValue({ isPending: false, data: { canManageGroups, groups } });
}

beforeEach(() => {
  vi.clearAllMocks();
  withGroups();
});

describe('WorkspaceRoles', () => {
  it('states what only the Primary Owner can do and describes the viewer as read-only', () => {
    withRoles();
    render(<WorkspaceRoles />);

    expect(screen.getByText(PRIMARY_OWNER_DEFINITION)).toBeInTheDocument();
    expect(PRIMARY_OWNER_DEFINITION).toMatch(/transfer ownership, delete the workspace/);
    expect(screen.getByText(/Read-only: opens what the workspace shares/)).toBeInTheDocument();
  });

  it('only lets an admin grant permissions they hold when creating a role', () => {
    withRoles();
    render(<WorkspaceRoles />);

    fireEvent.click(screen.getByRole('button', { name: 'New role' }));
    expect(screen.getByLabelText('Change other owners')).toBeDisabled();
    expect(screen.getByLabelText('Read the audit trail and usage')).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Role name'), { target: { value: 'Finance' } });
    fireEvent.click(screen.getByLabelText('See the contract and invoices'));
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    expect(mocks.createRole).toHaveBeenCalledWith({
      name: 'Finance',
      description: null,
      permissions: ['feature.content.view', 'admin.billing.view'],
    });
  });

  it('offers one checkbox per permission, not one per stored key', () => {
    withRoles();
    render(<WorkspaceRoles />);

    fireEvent.click(screen.getByRole('button', { name: 'New role' }));

    expect(screen.getAllByLabelText('Read the audit trail and usage')).toHaveLength(1);
    expect(screen.getAllByText(/Read the audit trail and usage/)).not.toHaveLength(0);
  });

  it('will not delete a role people still hold, and says who holds it', () => {
    withRoles();
    render(<WorkspaceRoles />);

    const auditorRow = screen.getAllByText('Auditor')[0]!.closest('li') as HTMLElement;
    expect(auditorRow).toHaveTextContent('Held by 2 members and 1 directory group');
    expect(within(auditorRow).getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(mocks.deleteRole).not.toHaveBeenCalled();
  });

  it('asks before deleting a role nobody holds, and names what cannot be undone', () => {
    withRoles({ roles: [...builtIn, { ...auditor, memberCount: 0, groupCount: 0 }] });
    render(<WorkspaceRoles />);

    const auditorRow = screen.getAllByText('Auditor')[0]!.closest('li') as HTMLElement;
    fireEvent.click(within(auditorRow).getByRole('button', { name: 'Delete' }));
    expect(mocks.deleteRole).not.toHaveBeenCalled();

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Nobody holds Auditor, so no one loses access.');
    expect(dialog).toHaveTextContent('cannot be restored');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete role' }));
    expect(mocks.deleteRole).toHaveBeenCalledWith('role-auditor');
  });

  it('gives a member an additional role on top of their membership role', () => {
    withRoles();
    render(<WorkspaceRoles />);

    const row = screen.getByText('Vera Viewer').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByLabelText('Auditor'));
    fireEvent.click(within(row).getByRole('button', { name: 'Save roles' }));
    expect(mocks.setMemberRoles).toHaveBeenCalledWith({
      userId: 'viewer-1',
      roleIds: ['role-auditor'],
    });
  });

  it('names the provider that owns a directory group and marks it read-only', () => {
    withRoles();
    withGroups([
      {
        id: 'group-1',
        displayName: 'Engineering',
        memberCount: 12,
        roleIds: [],
        managerUserIds: [],
        source: { kind: 'directory', connectionName: 'Okta' },
      },
    ]);
    render(<WorkspaceRoles />);

    const row = screen.getByText('Engineering').closest('li') as HTMLElement;
    expect(row).toHaveTextContent('Managed by Okta.');
    expect(row).toHaveTextContent('name and members are read-only here');
    expect(within(row).queryByRole('button', { name: /remove|add member/i })).toBeNull();
  });

  it('still says a group is the provider’s when the connection has no name', () => {
    withRoles();
    withGroups([
      {
        id: 'group-1',
        displayName: 'Engineering',
        memberCount: 12,
        roleIds: [],
        managerUserIds: [],
        source: { kind: 'directory', connectionName: null },
      },
    ]);
    render(<WorkspaceRoles />);

    expect(screen.getByText('Engineering').closest('li')).toHaveTextContent(
      'Managed by your identity provider.',
    );
  });

  it('shows no editing controls to someone who cannot manage roles', () => {
    withRoles({ canManageRoles: false, currentUserPermissions: ['content.read'] });
    render(<WorkspaceRoles />);

    expect(screen.queryByRole('button', { name: 'New role' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.queryByText('Additional roles')).toBeNull();
  });
});
