import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
  updateRole: vi.fn(),
  setGroupRoles: vi.fn(),
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
  useUpdateWorkspaceRole: () => mutation(mocks.updateRole),
  useDeleteWorkspaceRole: () => mutation(mocks.deleteRole),
  useSetMemberRoles: () => mutation(mocks.setMemberRoles),
  useSetGroupRoles: () => mutation(mocks.setGroupRoles),
  useSetGroupManagers: () => mutation(vi.fn()),
  useCreateWorkspaceGroup: () => mutation(vi.fn()),
  useRenameWorkspaceGroup: () => mutation(vi.fn()),
  useDeleteWorkspaceGroup: () => mutation(vi.fn()),
  useSetWorkspaceGroupMembers: () => mutation(vi.fn()),
  useWorkspaceGroupMembers: () => ({ data: { userIds: [] }, isPending: false, error: null }),
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
  version: 1,
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
  version: 3,
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
    expect(mocks.deleteRole).toHaveBeenCalledWith({ roleId: 'role-auditor', version: 3 });
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

  it('shows who holds each role, read-only, to someone who may only see roles', () => {
    withRoles({
      canManageRoles: false,
      currentUserPermissions: ['admin.roles.view'],
      memberRoleGrants: { 'viewer-1': ['role-auditor'] },
    });
    render(<WorkspaceRoles />);

    expect(screen.getByText('Additional roles')).toBeTruthy();
    const row = screen.getByText('Vera Viewer').closest('li') as HTMLElement;
    expect(within(row).getByText('Auditor')).toBeTruthy();
    expect(within(row).queryByRole('checkbox')).toBeNull();
    expect(within(row).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New role' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
  describe('drafts', () => {
    const ops = {
      id: 'role-ops',
      key: 'custom_ops',
      name: 'Ops',
      description: 'Runs the workspace',
      builtIn: false,
      assignable: true,
      permissions: ['feature.content.view', 'admin.audit.view'],
      memberCount: 0,
      groupCount: 0,
      version: 5,
    };
    const legacy = {
      ...ops,
      id: 'role-legacy',
      key: 'custom_legacy',
      name: 'Legacy',
      description: null,
      permissions: ['content.read', 'roles.manage'],
      version: 2,
    };

    function roleRow(name: string): HTMLElement {
      return screen.getAllByText(name)[0]!.closest('li') as HTMLElement;
    }

    it('does not carry one role’s draft into the editor of another role', () => {
      withRoles({ roles: [...builtIn, auditor, ops] });
      render(<WorkspaceRoles />);

      fireEvent.click(within(roleRow('Auditor')).getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Role name'), { target: { value: 'Renamed' } });
      fireEvent.click(within(roleRow('Ops')).getByRole('button', { name: 'Edit' }));

      expect(screen.getByLabelText('Role name')).toHaveValue('Ops');
      fireEvent.click(screen.getByRole('button', { name: 'Save role' }));
      expect(mocks.updateRole).toHaveBeenCalledWith({
        roleId: 'role-ops',
        draft: {
          name: 'Ops',
          description: 'Runs the workspace',
          permissions: ['feature.content.view', 'admin.audit.view'],
          version: 5,
        },
      });
    });

    it('keeps a finished save of one role from closing the editor of another', async () => {
      let finish: () => void = () => undefined;
      mocks.updateRole.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
      withRoles({ roles: [...builtIn, auditor, ops] });
      render(<WorkspaceRoles />);

      fireEvent.click(within(roleRow('Auditor')).getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save role' }));
      fireEvent.click(within(roleRow('Ops')).getByRole('button', { name: 'Edit' }));
      await act(async () => finish());

      expect(screen.getByLabelText('Role name')).toHaveValue('Ops');
    });

    it('shows a role stored under legacy keys as checked and removes every spelling when unchecked', () => {
      withRoles({ roles: [...builtIn, legacy] });
      render(<WorkspaceRoles />);

      fireEvent.click(within(roleRow('Legacy')).getByRole('button', { name: 'Edit' }));
      expect(screen.getByLabelText('Create roles and assign them')).toBeChecked();
      expect(screen.getByLabelText('Open what the workspace shares')).toBeChecked();

      fireEvent.click(screen.getByLabelText('Create roles and assign them'));
      fireEvent.click(screen.getByRole('button', { name: 'Save role' }));
      expect(mocks.updateRole).toHaveBeenCalledWith({
        roleId: 'role-legacy',
        draft: {
          name: 'Legacy',
          description: null,
          permissions: ['feature.content.view'],
          version: 2,
        },
      });
    });

    it('lets an untouched member row follow the server and blocks a stale edited one', () => {
      withRoles({
        roles: [...builtIn, auditor, ops],
        memberRoleGrants: { 'viewer-1': ['role-ops'] },
      });
      const view = render(<WorkspaceRoles />);
      const row = () => screen.getByText('Vera Viewer').closest('li') as HTMLElement;
      expect(within(row()).getByLabelText('Ops')).toBeChecked();

      withRoles({ roles: [...builtIn, auditor, ops], memberRoleGrants: {} });
      view.rerender(<WorkspaceRoles />);
      expect(within(row()).getByLabelText('Ops')).not.toBeChecked();
      expect(within(row()).queryByRole('button', { name: 'Save roles' })).toBeNull();

      withRoles({
        roles: [...builtIn, auditor, ops],
        memberRoleGrants: { 'viewer-1': ['role-ops'] },
      });
      view.rerender(<WorkspaceRoles />);
      fireEvent.click(within(row()).getByLabelText('Auditor'));
      withRoles({ roles: [...builtIn, auditor, ops], memberRoleGrants: {} });
      view.rerender(<WorkspaceRoles />);

      expect(within(row()).getByRole('status')).toHaveTextContent('changed elsewhere');
      expect(within(row()).getByRole('button', { name: 'Save roles' })).toBeDisabled();
      expect(mocks.setMemberRoles).not.toHaveBeenCalled();

      fireEvent.click(within(row()).getByRole('button', { name: 'Discard changes' }));
      expect(within(row()).getByLabelText('Auditor')).not.toBeChecked();
      expect(within(row()).getByLabelText('Ops')).not.toBeChecked();
      expect(within(row()).queryByRole('button', { name: 'Save roles' })).toBeNull();
    });

    it('does not mistake its own saved roles for another administrator’s change', () => {
      withRoles({ roles: [...builtIn, auditor, ops] });
      const view = render(<WorkspaceRoles />);
      const row = () => screen.getByText('Vera Viewer').closest('li') as HTMLElement;

      fireEvent.click(within(row()).getByLabelText('Auditor'));
      withRoles({
        roles: [...builtIn, auditor, ops],
        memberRoleGrants: { 'viewer-1': ['role-auditor'] },
      });
      view.rerender(<WorkspaceRoles />);
      expect(within(row()).queryByRole('button', { name: 'Save roles' })).toBeNull();

      withRoles({ roles: [...builtIn, auditor, ops], memberRoleGrants: {} });
      view.rerender(<WorkspaceRoles />);
      expect(within(row()).getByLabelText('Auditor')).not.toBeChecked();
      expect(within(row()).queryByRole('status')).toBeNull();
    });

    it('rebases an untouched group and blocks a stale edited one', () => {
      const group = (roleIds: string[]) => ({
        id: 'group-1',
        displayName: 'Engineering',
        memberCount: 12,
        roleIds,
        managerUserIds: [],
        source: { kind: 'directory', connectionName: 'Okta' },
      });
      withRoles({ roles: [...builtIn, auditor, ops] });
      withGroups([group(['role-ops'])]);
      const view = render(<WorkspaceRoles />);
      const row = () => screen.getByText('Engineering').closest('li') as HTMLElement;
      expect(within(row()).getByLabelText('Ops')).toBeChecked();

      withGroups([group([])]);
      view.rerender(<WorkspaceRoles />);
      expect(within(row()).getByLabelText('Ops')).not.toBeChecked();
      expect(within(row()).queryByRole('button', { name: 'Save group' })).toBeNull();

      withGroups([group(['role-ops'])]);
      view.rerender(<WorkspaceRoles />);
      fireEvent.click(within(row()).getByLabelText('Auditor'));
      withGroups([group([])]);
      view.rerender(<WorkspaceRoles />);

      expect(within(row()).getByRole('status')).toHaveTextContent('changed elsewhere');
      expect(within(row()).getByRole('button', { name: 'Save group' })).toBeDisabled();
      expect(mocks.setGroupRoles).not.toHaveBeenCalled();
    });
  });
});
