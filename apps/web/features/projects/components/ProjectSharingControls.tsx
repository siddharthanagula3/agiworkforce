'use client';

import {
  useSetSharedProjectMemberAccess,
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
  return (
    <ProjectAudienceSelect
      id={`audience-${project.projectId}`}
      value={projectShareAudience(project)}
      disabled={shareProject.isPending}
      onChange={(audience) => shareProject.mutate({ projectId: project.projectId, audience })}
    />
  );
}

export function SharedProjectMemberAccessList({
  project,
  members,
}: {
  project: OrgSharedProject;
  members: OrgSharedOverview['members'];
}) {
  const setAccess = useSetSharedProjectMemberAccess();
  const defaultAccess: OrgMemberProjectAccess = project.defaultAccess === 'none' ? 'none' : 'read';
  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
      {members.map((member) => {
        const controlId = `access-${project.projectId}-${member.userId}`;
        const isOwner = member.userId === project.ownerUserId;
        return (
          <div
            key={member.userId}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 12 }}
          >
            <label
              htmlFor={controlId}
              style={{ flex: 1, color: 'var(--text-2)', wordBreak: 'break-all' }}
            >
              {member.displayName ?? member.email ?? member.userId}
              {isOwner ? ' · owner' : ''}
            </label>
            {isOwner ? null : (
              <select
                id={controlId}
                value={memberProjectAccess(project, member.userId)}
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
                <option value="read">Can view</option>
                <option value="write">Can edit</option>
                <option value="none">No access</option>
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}
