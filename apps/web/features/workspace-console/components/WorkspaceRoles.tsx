'use client';

import { useState } from 'react';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import {
  canonicalOrganizationPermission,
  expandOrganizationPermissions,
  ORGANIZATION_PERMISSIONS,
  type CanonicalOrganizationPermission,
  type OrganizationPermission,
} from '@agiworkforce/types';

import { useTeamMembers, type TeamMember } from '@/features/settings/hooks/use-settings-queries';
import { toUserMessage } from '@/lib/user-error-message';
import {
  useCreateWorkspaceRole,
  useDeleteWorkspaceRole,
  useSetGroupManagers,
  useSetGroupRoles,
  useSetMemberRoles,
  useUpdateWorkspaceRole,
  useWorkspaceGroups,
  useWorkspaceRoles,
  type CustomRoleDraft,
  type WorkspaceDirectoryGroup,
  type WorkspaceRole,
  type WorkspaceRolesResult,
} from '../hooks/use-workspace-roles';

const CANONICAL_PERMISSION_COPY: Readonly<Record<CanonicalOrganizationPermission, string>> =
  Object.freeze({
    'feature.content.view': 'Open what the workspace shares',
    'feature.content.share': 'Share projects, conversations and artifacts into the workspace',
    'feature.content.govern': 'See members’ workspace conversations and projects',
    'feature.sharing.manage': 'Change or withdraw anything shared',
    'admin.members.view': 'See the member list',
    'admin.members.manage': 'Invite, remove and change members',
    'admin.owners.view': 'See who owns the workspace',
    'admin.owners.manage': 'Change other owners',
    'admin.roles.view': 'See roles and who holds them',
    'admin.roles.manage': 'Create roles and assign them',
    'admin.groups.view': 'See directory groups and their roles',
    'admin.groups.manage': 'Give directory groups roles and managers',
    'admin.policy.view': 'See workspace policy, models and connectors',
    'admin.policy.manage': 'Change workspace policy, models and connectors',
    'admin.identity.view': 'See single sign-on settings',
    'admin.identity.manage': 'Change single sign-on settings',
    'admin.directory.view': 'See directory sync and its log',
    'admin.directory.manage': 'Manage directory sync',
    'admin.audit.view': 'Read the audit trail and usage',
    'admin.audit.manage': 'Change audit retention and export the trail',
    'admin.billing.view': 'See the contract and invoices',
    'admin.billing.manage': 'Change the plan, seats and spend limit',
    'admin.workspace.view': 'See workspace settings',
    'admin.workspace.manage': 'Rename the workspace',
    'admin.ownership.view': 'See who the Primary Owner is',
    'admin.ownership.manage': 'Transfer ownership',
    'admin.lifecycle.view': 'See the workspace deletion state',
    'admin.lifecycle.manage': 'Delete the workspace',
    'admin.contracts.view': 'See the billing contract',
    'admin.contracts.manage': 'Manage the billing contract',
  });

function permissionCopy(permission: OrganizationPermission): string {
  const canonical = canonicalOrganizationPermission(permission);
  return canonical ? CANONICAL_PERMISSION_COPY[canonical] : permission;
}

// A legacy key still names a stored grant and an admin key scope, so both
// vocabularies read the same sentence rather than one of them falling back.
export const PERMISSION_COPY: Readonly<Record<OrganizationPermission, string>> = Object.freeze(
  Object.fromEntries(
    ORGANIZATION_PERMISSIONS.map((permission) => [permission, permissionCopy(permission)]),
  ) as Record<OrganizationPermission, string>,
);

// A grant carries the legacy key beside its namespaced replacement so stored
// roles keep resolving; both name one permission, and the surface shows one.
function distinctPermissions(
  permissions: readonly OrganizationPermission[],
): CanonicalOrganizationPermission[] {
  const seen = new Set<CanonicalOrganizationPermission>();
  for (const permission of permissions) {
    const canonical = canonicalOrganizationPermission(permission);
    if (canonical) seen.add(canonical);
  }
  return [...seen];
}

export const PRIMARY_OWNER_DEFINITION =
  'The Primary Owner is the one person who can transfer ownership, delete the workspace and manage its billing contract. Owners can do everything else, and there can be several.';

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
} as const;

const controlStyle = {
  minHeight: 32,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: 'var(--space-1) var(--space-2)',
} as const;

const secondaryButton =
  'min-h-8 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const primaryButton =
  'min-h-8 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

function CardHeader({ id, title, children }: { id: string; title: string; children: string }) {
  return (
    <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
      <h2 id={id} className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
        {title}
      </h2>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
        {children}
      </p>
    </div>
  );
}

function ErrorLine({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-xs" style={{ color: 'var(--settings-destructive-text)' }}>
      {toUserMessage(error, 'Could not complete this workspace role action. Try again.')}
    </p>
  );
}

function RoleEditor({
  data,
  initial,
  onDone,
}: {
  data: WorkspaceRolesResult;
  initial: WorkspaceRole | null;
  onDone: () => void;
}) {
  const create = useCreateWorkspaceRole();
  const update = useUpdateWorkspaceRole();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [permissions, setPermissions] = useState<OrganizationPermission[]>(
    initial?.permissions ?? ['feature.content.view'],
  );
  const held = expandOrganizationPermissions(data.currentUserPermissions);
  const pending = create.isPending || update.isPending;
  const canSave = name.trim().length > 0 && permissions.length > 0 && !pending;

  function toggle(permission: OrganizationPermission, on: boolean) {
    setPermissions((current) =>
      on ? [...new Set([...current, permission])] : current.filter((p) => p !== permission),
    );
  }

  async function save() {
    const draft: CustomRoleDraft = {
      name: name.trim(),
      description: description.trim() || null,
      permissions,
    };
    if (initial)
      await update.mutateAsync({
        roleId: initial.id,
        draft: { ...draft, version: initial.version },
      });
    else await create.mutateAsync(draft);
    onDone();
  }

  return (
    <div
      className="flex flex-col gap-3 border-t px-5 py-4"
      style={{ borderColor: 'var(--settings-border)' }}
    >
      <div className="flex flex-wrap gap-2">
        <label
          className="flex min-w-0 flex-1 flex-col gap-1 text-xs"
          style={{ color: 'var(--text-3)' }}
        >
          Role name
          <input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            style={controlStyle}
          />
        </label>
        <label
          className="flex min-w-0 flex-[2] flex-col gap-1 text-xs"
          style={{ color: 'var(--text-3)' }}
        >
          Description
          <input
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            style={controlStyle}
          />
        </label>
      </div>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 text-xs" style={{ color: 'var(--text-3)' }}>
          Permissions. You can only grant what your own role holds.
        </legend>
        {distinctPermissions(data.grantablePermissions).map((permission) => (
          <label
            key={permission}
            className="flex min-h-8 items-start gap-2 text-xs"
            style={{ color: held.has(permission) ? 'var(--text-1)' : 'var(--text-3)' }}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={permissions.includes(permission)}
              disabled={!held.has(permission)}
              onChange={(event) => toggle(permission, event.target.checked)}
            />
            <span>{PERMISSION_COPY[permission]}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={primaryButton}
          disabled={!canSave}
          onClick={() => void save().catch(() => undefined)}
        >
          {pending ? 'Saving…' : initial ? 'Save role' : 'Create role'}
        </button>
        <button
          type="button"
          className={secondaryButton}
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
          onClick={onDone}
        >
          Cancel
        </button>
        <ErrorLine error={create.error ?? update.error} />
      </div>
    </div>
  );
}

function isHeld(role: WorkspaceRole): boolean {
  return role.memberCount > 0 || role.groupCount > 0;
}

function RoleList({ data }: { data: WorkspaceRolesResult }) {
  const remove = useDeleteWorkspaceRole();
  const { confirm, dialog } = useConfirmAction();
  const [editing, setEditing] = useState<WorkspaceRole | 'new' | null>(null);

  return (
    <section style={cardStyle} aria-labelledby="workspace-roles-heading">
      {dialog}
      <CardHeader id="workspace-roles-heading" title="Roles">
        {PRIMARY_OWNER_DEFINITION}
      </CardHeader>
      <ul className="flex flex-col">
        {data.roles.map((role) => (
          <li
            key={role.id}
            className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-3"
            style={{ borderColor: 'var(--settings-border)' }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                {role.name}
                {role.builtIn ? (
                  <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-3)' }}>
                    Built in
                  </span>
                ) : null}
              </p>
              {role.description ? (
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
                  {role.description}
                </p>
              ) : null}
              <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
                {distinctPermissions(role.permissions).map(permissionCopy).join(' · ')}
              </p>
              {!role.builtIn && data.canManageRoles && isHeld(role) ? (
                <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                  Held by {role.memberCount} member{role.memberCount === 1 ? '' : 's'} and{' '}
                  {role.groupCount} directory group{role.groupCount === 1 ? '' : 's'}. Take it off
                  them before deleting it, so nobody loses access without a decision.
                </p>
              ) : null}
            </div>
            {!role.builtIn && data.canManageRoles ? (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className={secondaryButton}
                  style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
                  onClick={() => setEditing(role)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={remove.isPending || isHeld(role)}
                  style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
                  onClick={() =>
                    confirm({
                      title: `Delete the ${role.name} role?`,
                      description: `Nobody holds ${role.name}, so no one loses access. A deleted role cannot be restored; you would have to create it again, and policy exceptions written for it are removed.`,
                      confirmLabel: 'Delete role',
                      onConfirm: () => remove.mutate({ roleId: role.id, version: role.version }),
                    })
                  }
                >
                  Delete
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {editing ? (
        <RoleEditor
          data={data}
          initial={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : data.canManageRoles ? (
        <div className="flex items-center gap-3 px-5 py-3">
          <button type="button" className={primaryButton} onClick={() => setEditing('new')}>
            New role
          </button>
          <ErrorLine error={remove.error} />
        </div>
      ) : null}
    </section>
  );
}

function assignableRoles(data: WorkspaceRolesResult): WorkspaceRole[] {
  return data.roles.filter(
    (role) => role.assignable && role.key !== 'member' && role.key !== 'viewer',
  );
}

function MemberRoleRow({ member, data }: { member: TeamMember; data: WorkspaceRolesResult }) {
  const setRoles = useSetMemberRoles();
  const current = data.memberRoleGrants[member.userId] ?? [];
  const [selected, setSelected] = useState<string[]>(current);
  const dirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...current].sort());
  const held = expandOrganizationPermissions(data.currentUserPermissions);

  return (
    <li
      className="flex flex-col gap-2 border-b px-5 py-3"
      style={{ borderColor: 'var(--settings-border)' }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-sm" style={{ color: 'var(--text-1)' }}>
          {member.name || member.email}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          {member.role === 'owner' ? 'Primary Owner' : member.role}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {assignableRoles(data).map((role) => {
          const grantable = role.permissions.every((permission) => held.has(permission));
          return (
            <label
              key={role.id}
              className="flex min-h-8 items-center gap-2 text-xs"
              style={{ color: 'var(--text-2)' }}
            >
              <input
                type="checkbox"
                checked={selected.includes(role.id)}
                disabled={!grantable || setRoles.isPending}
                onChange={(event) =>
                  setSelected((ids) =>
                    event.target.checked ? [...ids, role.id] : ids.filter((id) => id !== role.id),
                  )
                }
              />
              {role.name}
            </label>
          );
        })}
      </div>
      {dirty ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={primaryButton}
            disabled={setRoles.isPending}
            onClick={() => setRoles.mutate({ userId: member.userId, roleIds: selected })}
          >
            {setRoles.isPending ? 'Saving…' : 'Save roles'}
          </button>
          <ErrorLine error={setRoles.error} />
        </div>
      ) : null}
    </li>
  );
}

function MemberRoles({ data }: { data: WorkspaceRolesResult }) {
  const members = useTeamMembers(data.organizationId);
  if (!data.canManageRoles) return null;

  return (
    <section style={cardStyle} aria-labelledby="workspace-member-roles-heading">
      <CardHeader id="workspace-member-roles-heading" title="Additional roles">
        A member keeps their membership role and gains every permission of each role checked here.
      </CardHeader>
      {members.isError ? (
        <div className="px-5 py-3">
          <ErrorLine error={members.error} />
        </div>
      ) : (
        <ul className="flex flex-col">
          {(members.data ?? []).map((member) => (
            <MemberRoleRow key={member.userId} member={member} data={data} />
          ))}
        </ul>
      )}
    </section>
  );
}

type DirectoryGroup = WorkspaceDirectoryGroup;

function sourceLabel(group: DirectoryGroup): string {
  return group.source?.connectionName?.trim() || 'your identity provider';
}

function GroupRow({
  group,
  data,
  members,
  canManageGroups,
}: {
  group: DirectoryGroup;
  data: WorkspaceRolesResult;
  members: TeamMember[];
  canManageGroups: boolean;
}) {
  const setRoles = useSetGroupRoles();
  const setManagers = useSetGroupManagers();
  const [roleIds, setRoleIds] = useState(group.roleIds);
  const [managerIds, setManagerIds] = useState(group.managerUserIds);
  const held = expandOrganizationPermissions(data.currentUserPermissions);
  const rolesDirty =
    JSON.stringify([...roleIds].sort()) !== JSON.stringify([...group.roleIds].sort());
  const managersDirty =
    JSON.stringify([...managerIds].sort()) !== JSON.stringify([...group.managerUserIds].sort());

  return (
    <li
      className="flex flex-col gap-2 border-b px-5 py-3"
      style={{ borderColor: 'var(--settings-border)' }}
    >
      <p className="text-sm" style={{ color: 'var(--text-1)' }}>
        {group.displayName}
        <span className="ml-2 text-xs" style={{ color: 'var(--text-3)' }}>
          {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
        </span>
      </p>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
        Managed by {sourceLabel(group)}. Its name and members are read-only here and are replaced by
        the next sync; only the roles below are yours to set.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {data.roles
          .filter((role) => role.assignable)
          .map((role) => (
            <label
              key={role.id}
              className="flex min-h-8 items-center gap-2 text-xs"
              style={{ color: 'var(--text-2)' }}
            >
              <input
                type="checkbox"
                checked={roleIds.includes(role.id)}
                disabled={!role.permissions.every((p) => held.has(p)) || setRoles.isPending}
                onChange={(event) =>
                  setRoleIds((ids) =>
                    event.target.checked ? [...ids, role.id] : ids.filter((id) => id !== role.id),
                  )
                }
              />
              {role.name}
            </label>
          ))}
      </div>
      {canManageGroups ? (
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-3)' }}>
          Group managers can change this group&rsquo;s roles, within their own permissions.
          <select
            multiple
            value={managerIds}
            onChange={(event) =>
              setManagerIds(Array.from(event.target.selectedOptions, (option) => option.value))
            }
            style={{ ...controlStyle, minHeight: 72 }}
          >
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name || member.email}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {rolesDirty || managersDirty ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={primaryButton}
            disabled={setRoles.isPending || setManagers.isPending}
            onClick={() => {
              if (rolesDirty) setRoles.mutate({ groupId: group.id, roleIds });
              if (managersDirty) setManagers.mutate({ groupId: group.id, userIds: managerIds });
            }}
          >
            Save group
          </button>
          <ErrorLine error={setRoles.error ?? setManagers.error} />
        </div>
      ) : null}
    </li>
  );
}

function DirectoryGroupRoles({ data }: { data: WorkspaceRolesResult }) {
  const groups = useWorkspaceGroups();
  const members = useTeamMembers(groups.data?.canManageGroups ? data.organizationId : undefined);
  const result = groups.data;
  if (groups.isPending || !result || result.groups.length === 0) return null;

  return (
    <section style={cardStyle} aria-labelledby="workspace-group-roles-heading">
      <CardHeader id="workspace-group-roles-heading" title="Directory groups">
        Every active member your identity provider places in a group holds the roles checked for
        that group, and loses them when the provider removes them. Membership belongs to the
        provider: it cannot be edited here, and a change made there wins.
      </CardHeader>
      <ul className="flex flex-col">
        {result.groups.map((group) => (
          <GroupRow
            key={group.id}
            group={group}
            data={data}
            members={members.data ?? []}
            canManageGroups={result.canManageGroups}
          />
        ))}
      </ul>
    </section>
  );
}

export function WorkspaceRoles() {
  const roles = useWorkspaceRoles();
  const data = roles.data ?? null;

  if (roles.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-3)' }}>
        <Spinner size="sm" aria-label="Loading roles" />
        Loading roles…
      </p>
    );
  }
  if (roles.isError) {
    return (
      <div className="flex flex-col gap-2">
        <ErrorLine error={roles.error} />
        <button
          type="button"
          className={secondaryButton}
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
          onClick={() => void roles.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-3)' }}>
        Roles are available on Team and Enterprise workspaces.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <RoleList data={data} />
      <MemberRoles data={data} />
      <DirectoryGroupRoles data={data} />
    </div>
  );
}
