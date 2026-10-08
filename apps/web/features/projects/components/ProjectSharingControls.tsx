'use client';

import { useState } from 'react';
import {
  MemberIdentity,
  MemberPicker,
  type PickerMember,
} from '@shared/components/people/MemberPicker';
import {
  useSetSharedProjectMemberAccess,
  useSetSharedProjectMembersAccess,
  useShareProjectWithOrganization,
  type OrgMemberProjectAccess,
  type OrgSharedOverview,
  type OrgSharedProject,
  type ProjectShareAudience,
} from '@/features/settings/hooks/use-settings-queries';

const selectStyle = {
  minHeight: 32,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: 'var(--space-1) var(--space-2)',
} as const;

const buttonStyle = {
  minHeight: 32,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
} as const;

const ACCESS_LABELS: Readonly<Record<OrgMemberProjectAccess, string>> = {
  read: 'Can view',
  write: 'Can edit',
  none: 'No access',
};

const EDIT_NOT_ALLOWED_LABEL = 'Can edit (their role can only view)';
const EDIT_NOT_ALLOWED_NOTE =
  'People whose workspace role can only view, such as Viewer, can be given Can view but not Can edit. Change their role to Member to let them edit.';

type OverviewMember = OrgSharedOverview['members'][number];

export function projectShareAudience(project: OrgSharedProject): ProjectShareAudience {
  return project.defaultAccess === 'none' ? 'invited' : 'workspace';
}

export function memberProjectAccess(
  project: OrgSharedProject,
  userId: string,
): OrgMemberProjectAccess {
  const grant = project.memberGrants.find((entry) => entry.userId === userId);
  if (grant) return grant.access;
  return project.defaultAccess === 'none' ? 'none' : 'read';
}

export function effectiveMemberProjectAccess(
  project: OrgSharedProject,
  member: Pick<OverviewMember, 'userId' | 'canEditProjects'>,
): OrgMemberProjectAccess {
  const access = memberProjectAccess(project, member.userId);
  return access === 'write' && !member.canEditProjects ? 'read' : access;
}

export function sharingMemberName(member: OverviewMember): string {
  return member.displayName || member.email || member.userId;
}

function toPickerMember(member: OverviewMember): PickerMember {
  return {
    userId: member.userId,
    name: member.displayName ?? '',
    email: member.email ?? '',
    avatarUrl: null,
  };
}

export function ProjectAudienceSelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: ProjectShareAudience;
  disabled?: boolean;
  onChange: (audience: ProjectShareAudience) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      style={selectStyle}
      onChange={(event) => onChange(event.target.value === 'invited' ? 'invited' : 'workspace')}
    >
      <option value="workspace">Everyone in the workspace can view</option>
      <option value="invited">Only people you invite</option>
    </select>
  );
}

export function SharedProjectAudienceControl({ project }: { project: OrgSharedProject }) {
  const shareProject = useShareProjectWithOrganization();
  const id = `audience-${project.projectId}`;
  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
      <label htmlFor={id} style={{ color: 'var(--text-2)', fontSize: 12 }}>
        Who can open it
      </label>
      <ProjectAudienceSelect
        id={id}
        value={projectShareAudience(project)}
        disabled={shareProject.isPending}
        onChange={(audience) => shareProject.mutate({ projectId: project.projectId, audience })}
      />
    </div>
  );
}

/**
 * The people on a shared project: who has access now, and a way to add more by
 * name or email. On a whole-workspace project everyone can already view it, so
 * adding someone means making them an editor or taking their access away.
 */
export function SharedProjectMemberAccessList({
  project,
  members,
  canManage,
}: {
  project: OrgSharedProject;
  members: OrgSharedOverview['members'];
  canManage: boolean;
}) {
  const setAccess = useSetSharedProjectMemberAccess();
  const addPeople = useSetSharedProjectMembersAccess();
  const invitedOnly = projectShareAudience(project) === 'invited';
  const defaultAccess: OrgMemberProjectAccess = invitedOnly ? 'none' : 'read';
  const addChoices: readonly OrgMemberProjectAccess[] = invitedOnly
    ? ['read', 'write']
    : ['write', 'none'];
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addAccess, setAddAccess] = useState<OrgMemberProjectAccess>(addChoices[0]!);

  const owner = members.find((member) => member.userId === project.ownerUserId);
  const explicit = new Set(project.memberGrants.map((grant) => grant.userId));
  const listed = members.filter(
    (member) =>
      member.userId !== project.ownerUserId &&
      (explicit.has(member.userId) || memberProjectAccess(project, member.userId) !== 'none'),
  );
  const accessFieldId = `add-access-${project.projectId}`;
  const chosenAddAccess = addChoices.includes(addAccess) ? addAccess : addChoices[0]!;
  const uninvited = members.filter(
    (member) => member.userId !== project.ownerUserId && !explicit.has(member.userId),
  );
  const addable = uninvited
    .filter((member) => chosenAddAccess !== 'write' || member.canEditProjects)
    .map(toPickerMember);
  const addableIds = new Set(addable.map((member) => member.userId));
  const chosenIds = selectedIds.filter((userId) => addableIds.has(userId));
  const viewOnlyLeftOut = addable.length < uninvited.length;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <ul
        aria-label={`People with access to ${project.name}`}
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-1)' }}
      >
        {owner ? (
          <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <MemberIdentity member={toPickerMember(owner)} detail="Owner" />
            </span>
          </li>
        ) : null}
        {listed.map((member) => {
          const controlId = `access-${project.projectId}-${member.userId}`;
          const name = sharingMemberName(member);
          return (
            <li
              key={member.userId}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <MemberIdentity member={toPickerMember(member)} />
              </span>
              {canManage ? (
                <>
                  <label htmlFor={controlId} className="sr-only">
                    Access for {name}
                  </label>
                  <select
                    id={controlId}
                    value={effectiveMemberProjectAccess(project, member)}
                    style={selectStyle}
                    disabled={setAccess.isPending}
                    onChange={(event) => {
                      const next: OrgMemberProjectAccess =
                        event.target.value === 'write'
                          ? 'write'
                          : event.target.value === 'none'
                            ? 'none'
                            : 'read';
                      setAccess.mutate({
                        projectId: project.projectId,
                        userId: member.userId,
                        access: next === defaultAccess ? 'inherit' : next,
                      });
                    }}
                  >
                    <option value="read">{ACCESS_LABELS.read}</option>
                    <option value="write" disabled={!member.canEditProjects}>
                      {member.canEditProjects ? ACCESS_LABELS.write : EDIT_NOT_ALLOWED_LABEL}
                    </option>
                    <option value="none">{ACCESS_LABELS.none}</option>
                  </select>
                </>
              ) : (
                <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
                  {ACCESS_LABELS[effectiveMemberProjectAccess(project, member)]}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {invitedOnly ? null : (
        <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 12 }}>
          Everyone else in the workspace can view this project.
        </p>
      )}
      {canManage && uninvited.length > 0 ? (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <MemberPicker
            label="Add people"
            members={addable}
            selectedIds={chosenIds}
            onChange={setSelectedIds}
            disabled={addPeople.isPending}
          />
          {viewOnlyLeftOut ? (
            <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 12 }}>
              {EDIT_NOT_ALLOWED_NOTE}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <label htmlFor={accessFieldId} className="sr-only">
              Access for the people you add
            </label>
            <select
              id={accessFieldId}
              value={chosenAddAccess}
              style={selectStyle}
              onChange={(event) =>
                setAddAccess(
                  addChoices.find((choice) => choice === event.target.value) ?? addChoices[0]!,
                )
              }
            >
              {addChoices.map((choice) => (
                <option key={choice} value={choice}>
                  {ACCESS_LABELS[choice]}
                </option>
              ))}
            </select>
            <button
              type="button"
              style={buttonStyle}
              disabled={chosenIds.length === 0 || addPeople.isPending}
              onClick={() =>
                addPeople.mutate(
                  { projectId: project.projectId, userIds: chosenIds, access: chosenAddAccess },
                  { onSuccess: () => setSelectedIds([]) },
                )
              }
            >
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
